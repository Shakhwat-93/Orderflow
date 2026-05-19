import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import api from '../lib/api';
import { useAuth } from './AuthContext';
import { isNativeApp } from '../platform/runtime';
import {
  requestNativePermission,
  checkNativePermission,
  scheduleNativeNotification,
  setupForegroundNotificationListener,
} from '../platform/native/nativeNotifications';

const NotificationContext = createContext(null);

// VAPID public key — must match the private key stored in Supabase Edge Function secrets.
const VAPID_PUBLIC_KEY = 'BApc-Twq0Rcna_p5RaIyHpONw79mW61ZPqx5YDbP_1OqYkV6c4ehNh12rRrwEQyrkw0HqrfxkV5MQ6USkzf4LfE';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export const NotificationProvider = ({ children }) => {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [toasts, setToasts] = useState([]);
  const [startupUnreadNotifications, setStartupUnreadNotifications] = useState([]);
  const [isStartupUnreadModalOpen, setIsStartupUnreadModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState(
    isNativeApp()
      ? 'prompt'  // will be resolved on first permission check
      : typeof window !== 'undefined' && 'Notification' in window
      ? Notification.permission
      : 'unsupported'
  );
  const { user, isAdmin } = useAuth();
  const userId = user?.id ?? null;
  const hasShownInitialUnreadToastsRef = useRef(false);
  const soundQueueRef = useRef(Promise.resolve());

  const playAudioSequence = useCallback(async (audioUrl, repeatCount, volume) => {
    for (let index = 0; index < repeatCount; index += 1) {
      try {
        await new Promise((resolve) => {
          const audio = new Audio(audioUrl);
          let settled = false;

          const finish = () => {
            if (settled) return;
            settled = true;
            resolve();
          };

          audio.volume = volume;
          audio.onended = finish;
          audio.onerror = finish;

          const playback = audio.play();
          if (playback?.catch) {
            playback.catch((error) => {
              console.log('Audio play blocked:', error);
              finish();
            });
          }

          setTimeout(finish, 4000);
        });
      } catch (error) {
        console.log('Audio sequence interrupted:', error);
        break;
      }
    }
  }, []);

  const playNotificationSound = useCallback((type) => {
    if (type !== 'ORDER_CREATED') return;

    soundQueueRef.current = soundQueueRef.current
      .catch(() => undefined)
      .then(() => playAudioSequence('/notification.mp3', 1, 1.0));
  }, [playAudioSequence]);

  const subscribeUserToPush = useCallback(async () => {
    if (isNativeApp() || !('serviceWorker' in navigator)) return;

    try {
      const registration = await navigator.serviceWorker.ready;

      // Check if there is an existing subscription
      let existingSubscription = await registration.pushManager.getSubscription();

      if (existingSubscription) {
        // Detect VAPID key mismatch — if the stored subscription was created with
        // the old VAPID key it must be unsubscribed and re-created.
        const existingKey = existingSubscription.options?.applicationServerKey
          ? btoa(String.fromCharCode(...new Uint8Array(existingSubscription.options.applicationServerKey)))
              .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
          : null;

        const currentKey = VAPID_PUBLIC_KEY.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

        if (existingKey && existingKey !== currentKey) {
          // Old key — unsubscribe and create a fresh subscription
          console.log('[Push] VAPID key changed — re-subscribing...');
          await existingSubscription.unsubscribe();
          existingSubscription = null;
        } else {
          // Key matches — just sync with backend to keep DB up to date
          await api.savePushSubscription(userId, existingSubscription.toJSON());
          return;
        }
      }

      // Create a brand-new subscription
      const subscribeOptions = {
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      };

      const subscription = await registration.pushManager.subscribe(subscribeOptions);
      console.log('[Push] Subscribed:', subscription.endpoint);

      // Persist to Supabase so the backend can deliver pushes to this device
      await api.savePushSubscription(userId, subscription.toJSON());
    } catch (err) {
      console.error('[Push] Failed to subscribe:', err);
    }
  }, [userId]);

  const requestNotificationPermission = useCallback(async (promptUser = false) => {
    // ── Native APK path ──────────────────────────────────────────────────────
    if (isNativeApp()) {
      try {
        let status = await checkNativePermission();

        if ((status === 'prompt' || status === 'prompt-with-rationale') && promptUser) {
          status = await requestNativePermission();
        }

        setNotificationPermission(status === 'granted' ? 'granted' : status);
        return status;
      } catch (e) {
        console.error('[Notif] Native permission check failed:', e);
        setNotificationPermission('denied');
        return 'denied';
      }
    }

    // ── Browser / PWA path ───────────────────────────────────────────────────
    if (!('Notification' in window)) {
      setNotificationPermission('unsupported');
      return 'unsupported';
    }

    let permission = Notification.permission;
    setNotificationPermission(permission);

    if (permission === 'default' && promptUser) {
      permission = await Notification.requestPermission();
      setNotificationPermission(permission);
    }

    if (permission === 'granted' && userId) {
      await subscribeUserToPush();
    }

    return permission;
  }, [subscribeUserToPush, userId]);

  const showBrowserNotification = useCallback((notif) => {
    // ── Native APK path — use Capacitor LocalNotifications ─────────────────
    if (isNativeApp()) {
      // Fire and forget — scheduleNativeNotification handles all error logging
      scheduleNativeNotification(notif).catch(console.error);
      return;
    }

    // ── Browser / PWA path — use Web Notification API ───────────────────────
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    if (document.visibilityState === 'visible') return; // Don't annoy if they are looking at the app

    try {
      const n = new Notification(notif.title, {
        body: notif.message,
        icon: '/pwa-192x192.svg',
        tag: notif.id || notif.type,
        data: notif
      });

      n.onclick = () => {
        window.focus();
        n.close();
      };
    } catch (e) {
      console.error('Browser notification failed:', e);
    }
  }, []);

  const recentlyShownToastsRef = useRef(new Set());
  const addToast = useCallback((notif) => {
    // Prevent duplicate toasts for the same notification ID within a short window
    // This fixes the '2 bar' issue where broadcast and postgres listeners both fire
    if (notif.id && recentlyShownToastsRef.current.has(notif.id)) {
      return;
    }
    
    if (notif.id) {
      recentlyShownToastsRef.current.add(notif.id);
      // Clean up after 10 seconds
      setTimeout(() => {
        recentlyShownToastsRef.current.delete(notif.id);
      }, 10000);
    }

    const id = Date.now();
    setToasts(prev => [...prev, { ...notif, id }]);
    playNotificationSound(notif.type);
    showBrowserNotification(notif);

    // Auto remove toast after 5 seconds
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);
  }, [playNotificationSound, showBrowserNotification]);

  const buildExternalOrderNotification = useCallback((order) => ({
    id: `order-${order.id}`,
    type: 'ORDER_CREATED',
    title: 'New Order Received',
    message: `Order #${order.id} for ${order.customer_name || 'Unknown Customer'} has been placed via ${order.source || 'Website'}.`,
    actor_name: order.source || 'Landing Page',
    is_read: false,
    created_at: order.created_at || new Date().toISOString(),
    data: {
      orderId: order.id,
      customer: order.customer_name || 'Unknown Customer',
      source: order.source || 'Website',
      shippingZone: order.shipping_zone || null
    }
  }), []);

  const fetchNotifications = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      let data = await api.getNotifications(50); // Fetch more for better filtering

      // Sync granted permission/subscription silently.
      // Prompting is exposed via explicit user action for mobile reliability.
      requestNotificationPermission(false);

      // Filter by target_user_id if present (either direct column or in data JSON)
      data = data.filter(n => {
        const targetId = n.target_user_id || n.data?.targetUserId;
        return !targetId || targetId === userId;
      });

      // Persistence Fallback: Filter by last cleared timestamp
      const clearedAt = localStorage.getItem('notifs_cleared_at');
      const filteredData = clearedAt
        ? data.filter(n => new Date(n.created_at) > new Date(clearedAt))
        : data;

      setNotifications(filteredData);
      setUnreadCount(filteredData.filter(n => !n.is_read).length);

      // Show existing unread notifications in startup modal once per day/session
      if (!hasShownInitialUnreadToastsRef.current) {
        const lastShown = localStorage.getItem('last_unread_modal_shown_day');
        const todayStr = new Date().toISOString().split('T')[0];

        if (lastShown !== todayStr) {
          const initialUnread = filteredData
            .filter(n => !n.is_read)
            .slice(0, 10);

          if (initialUnread.length > 0) {
            setStartupUnreadNotifications(initialUnread);
            setIsStartupUnreadModalOpen(true);
            localStorage.setItem('last_unread_modal_shown_day', todayStr);
          }
        }
        hasShownInitialUnreadToastsRef.current = true;
      }
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
    }
  }, [addToast, requestNotificationPermission, userId]);

  useEffect(() => {
    if (!userId) {
      setNotifications([]);
      setUnreadCount(0);
      setStartupUnreadNotifications([]);
      setIsStartupUnreadModalOpen(false);
      hasShownInitialUnreadToastsRef.current = false;
      return;
    }

    fetchNotifications();

    // OPTIMIZED: Single channel with broadcast-only listening.
    // postgres_changes fallback removed — it creates extra DB replication slots.
    // The server broadcasts notifications via the 'new_notification' event,
    // so we don't need to also listen to DB row-level changes.
    // The external_order_notifications channel is also removed — OrderContext
    // already has a realtime subscription on the orders table.
    const channel = supabase
      .channel('admin_notifications_realtime')
      .on('broadcast', { event: 'new_notification' }, (payload) => {
        const notif = payload.payload;

        // Filter out if it's targeted to someone else
        const targetId = notif.target_user_id || notif.data?.targetUserId;
        if (targetId && targetId !== userId) return;

        const clearedAt = localStorage.getItem('notifs_cleared_at');
        if (clearedAt && new Date(notif.created_at) <= new Date(clearedAt)) return;

        setNotifications(prev => {
          if (prev.some(n => n.id === notif.id)) return prev;
          return [notif, ...prev];
        });
        setUnreadCount(prev => prev + 1);
        addToast(notif);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [addToast, fetchNotifications, userId]);

  useEffect(() => {
    if (!userId) return undefined;

    const handleResume = () => {
      fetchNotifications();
    };

    window.addEventListener('app:resume', handleResume);
    return () => window.removeEventListener('app:resume', handleResume);
  }, [fetchNotifications, userId]);

  // ----------------------------------------------------------------
  // NATIVE APP: Request notification permission on boot + setup
  // foreground listener so notifications appear while app is open.
  // ----------------------------------------------------------------
  useEffect(() => {
    if (!isNativeApp()) return;

    // Setup foreground notification display listener once (no userId needed)
    setupForegroundNotificationListener();
  }, []);

  useEffect(() => {
    if (!userId || !isNativeApp()) return;

    const bootstrapNativePermission = async () => {
      try {
        // Check current permission status
        const currentStatus = await checkNativePermission();
        console.log('[NativeNotif] Current permission status:', currentStatus);

        if (currentStatus === 'granted') {
          // Already granted — just update state
          setNotificationPermission('granted');
          return;
        }

        if (currentStatus === 'denied') {
          // User already explicitly denied — don't re-prompt (OS won't allow it)
          setNotificationPermission('denied');
          console.log('[NativeNotif] Permission was denied by user');
          return;
        }

        // Status is 'prompt' or 'prompt-with-rationale' — show the dialog
        console.log('[NativeNotif] Requesting permission from user...');
        const newStatus = await requestNativePermission();
        setNotificationPermission(newStatus);
        console.log('[NativeNotif] Permission result:', newStatus);
      } catch (e) {
        console.error('[NativeNotif] Boot permission failed:', e);
      }
    };

    // Delay slightly so the app UI is fully rendered before the dialog appears
    const t = setTimeout(bootstrapNativePermission, 2000);
    return () => clearTimeout(t);
  }, [userId]);

  // ----------------------------------------------------------------
  // Handle push subscription auto-rotation by the browser.
  // When the browser rotates VAPID keys, the service worker fires
  // a PUSH_SUBSCRIPTION_CHANGED message — we re-save the new
  // subscription to the backend so delivery continues uninterrupted.
  // ----------------------------------------------------------------
  useEffect(() => {
    if (!userId || isNativeApp() || !('serviceWorker' in navigator)) return undefined;

    const handleSwMessage = (event) => {
      if (event.data?.type === 'PUSH_SUBSCRIPTION_CHANGED' && event.data.subscription) {
        api.savePushSubscription(userId, event.data.subscription).catch((err) => {
          console.error('[Push] Failed to re-save rotated subscription:', err);
        });
      }
    };

    navigator.serviceWorker.addEventListener('message', handleSwMessage);
    return () => navigator.serviceWorker.removeEventListener('message', handleSwMessage);
  }, [userId]);

  const markAsRead = async (id) => {
    try {
      await api.markNotificationRead(id);
      // State updated by subscription
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      await api.markAllNotificationsRead();
      // State updated by subscription
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  };

  const clearAllNotifications = async () => {
    try {
      // Best effort DB delete
      await api.deleteAllNotifications();

      // Guaranteed local persistence fallback
      localStorage.setItem('notifs_cleared_at', new Date().toISOString());

      setNotifications([]);
      setUnreadCount(0);
    } catch (error) {
      console.error('Error clearing all notifications:', error);
      // Fallback even on error
      localStorage.setItem('notifs_cleared_at', new Date().toISOString());
      setNotifications([]);
      setUnreadCount(0);
    }
  };

  const clearNotifications = async () => {
    setNotifications([]);
    setUnreadCount(0);
  };

  const closeStartupUnreadModal = () => {
    setIsStartupUnreadModalOpen(false);
  };

  return (
    <NotificationContext.Provider value={{
      notifications,
      toasts,
      startupUnreadNotifications,
      isStartupUnreadModalOpen,
      unreadCount,
      loading,
      markAsRead,
      markAllAsRead,
      clearAllNotifications,
      clearNotifications,
      closeStartupUnreadModal,
      notificationPermission,
      enablePushNotifications: () => requestNotificationPermission(true),
      refresh: fetchNotifications
    }}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};
