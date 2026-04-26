import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import api from '../lib/api';
import { useAuth } from './AuthContext';
import { isNativeApp } from '../platform/runtime';

const NotificationContext = createContext(null);

const VAPID_PUBLIC_KEY = 'BIjAQuz9toINRqF0hTFAn4Yv7H0aVyx3nmmiUiR58pM59sqrYKW2CncLTSe0HqNsfqkq9jbzlK5yjqvCg2nWVag';

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
      ? 'native'
      : typeof window !== 'undefined' && 'Notification' in window
      ? Notification.permission
      : 'unsupported'
  );
  const { user, isAdmin } = useAuth();
  const userId = user?.id ?? null;
  const hasShownInitialUnreadToastsRef = useRef(false);

  const playNotificationSound = useCallback((type) => {
    try {
      const audioUrl = type === 'ORDER_CREATED' 
        ? '/ordersound.mp3' 
        : 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3';
        
      const audio = new Audio(audioUrl);
      audio.volume = type === 'ORDER_CREATED' ? 1.0 : 0.5;
      audio.play().catch(e => console.log('Audio play blocked:', e));
    } catch (e) { }
  }, []);

  const subscribeUserToPush = useCallback(async () => {
    if (isNativeApp() || !('serviceWorker' in navigator)) return;
    
    try {
      const registration = await navigator.serviceWorker.ready;
      
      // Check if already subscribed
      const existingSubscription = await registration.pushManager.getSubscription();
      if (existingSubscription) {
        // Sync with backend anyway to ensure it matches current user
        await api.savePushSubscription(userId, existingSubscription.toJSON());
        return;
      }

      const subscribeOptions = {
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      };

      const subscription = await registration.pushManager.subscribe(subscribeOptions);
      console.log('User is subscribed to Push:', subscription);
      
      await api.savePushSubscription(userId, subscription.toJSON());
    } catch (err) {
      console.error('Failed to subscribe user to push:', err);
    }
  }, [userId]);

  const requestNotificationPermission = useCallback(async (promptUser = false) => {
    if (isNativeApp()) {
      setNotificationPermission('native');
      return 'native';
    }

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
    if (isNativeApp()) return;
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

    // Listen to both DB changes (if enabled) AND custom broadcasts
    const channel = supabase
      .channel('admin_notifications_realtime')
      // Custom broadcast for instant feel
      .on('broadcast', { event: 'new_notification' }, (payload) => {
        const notif = payload.payload;
        
        // Filter out if it's targeted to someone else
        const targetId = notif.target_user_id || notif.data?.targetUserId;
        if (targetId && targetId !== userId) return;

        const clearedAt = localStorage.getItem('notifs_cleared_at');
        if (clearedAt && new Date(notif.created_at) <= new Date(clearedAt)) return;

        setNotifications(prev => [notif, ...prev]);
        setUnreadCount(prev => prev + 1);
        addToast(notif);
      })
      // Fallback to table changes if server replication works
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        (payload) => {
          const notif = payload.new;
          
          const targetId = notif.target_user_id || notif.data?.targetUserId;
          if (targetId && targetId !== userId) return;

          const clearedAt = localStorage.getItem('notifs_cleared_at');
          if (clearedAt && new Date(notif.created_at) <= new Date(clearedAt)) return;

          // Avoid duplicate state updates if broadcast already fired
          setNotifications(prev => {
            if (prev.some(n => n.id === notif.id)) return prev;
            addToast(notif);
            return [notif, ...prev];
          });
          setUnreadCount(prev => prev + 1);
        }
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'notifications' },
        (payload) => {
          setNotifications(prev => prev.map(n => n.id === payload.new.id ? payload.new : n));
          if (payload.new.is_read !== payload.old.is_read) {
            setUnreadCount(prev => payload.new.is_read ? Math.max(0, prev - 1) : prev + 1);
          }
        }
      )
      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'notifications' },
        (payload) => {
          setNotifications(prev => prev.filter(n => n.id !== payload.old.id));
          // Recalculate unread count based on current state to be safe
          setUnreadCount(prev => Math.max(0, prev - 1));
        }
      )
      .subscribe();

    const externalOrderChannel = supabase
      .channel('external_order_notifications')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders' },
        (payload) => {
          const order = payload.new;

          // In-app order creation already creates a persisted notification.
          // This fallback only covers direct landing-page inserts.
          if (order?.created_by) return;

          const clearedAt = localStorage.getItem('notifs_cleared_at');
          const createdAt = order?.created_at || new Date().toISOString();
          if (clearedAt && new Date(createdAt) <= new Date(clearedAt)) return;

          const notif = buildExternalOrderNotification(order);

          setNotifications((prev) => {
            const alreadyExists = prev.some((item) =>
              item.id === notif.id ||
              (item.type === 'ORDER_CREATED' && item.data?.orderId === order.id)
            );
            if (alreadyExists) return prev;
            addToast(notif);
            setUnreadCount((count) => count + 1);
            return [notif, ...prev];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(externalOrderChannel);
    };
  }, [addToast, buildExternalOrderNotification, fetchNotifications, userId]);

  useEffect(() => {
    if (!userId) return undefined;

    const handleResume = () => {
      fetchNotifications();
    };

    window.addEventListener('app:resume', handleResume);
    return () => window.removeEventListener('app:resume', handleResume);
  }, [fetchNotifications, userId]);

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
