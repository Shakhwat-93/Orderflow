import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';
import { useAuth } from './AuthContext';

const NotificationContext = createContext(null);

export const NotificationProvider = ({ children }) => {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [toasts, setToasts] = useState([]);
  const [startupUnreadNotifications, setStartupUnreadNotifications] = useState([]);
  const [isStartupUnreadModalOpen, setIsStartupUnreadModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { user, isAdmin } = useAuth();
  const hasShownInitialUnreadToastsRef = useRef(false);

  const playNotificationSound = useCallback(() => {
    try {
      const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
      audio.volume = 0.5;
      audio.play().catch(e => console.log('Audio play blocked:', e));
    } catch (e) { }
  }, []);

  const addToast = useCallback((notif) => {
    const id = Date.now();
    setToasts(prev => [...prev, { ...notif, id }]);
    playNotificationSound();

    // Auto remove toast after 5 seconds
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);
  }, [playNotificationSound]);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await api.getNotifications(50); // Fetch more for better filtering

      // Persistence Fallback: Filter by last cleared timestamp
      const clearedAt = localStorage.getItem('notifs_cleared_at');
      const filteredData = clearedAt
        ? data.filter(n => new Date(n.created_at) > new Date(clearedAt))
        : data;

      setNotifications(filteredData);
      setUnreadCount(filteredData.filter(n => !n.is_read).length);

      // Show existing unread notifications in startup modal once per session
      if (!hasShownInitialUnreadToastsRef.current) {
        const initialUnread = filteredData
          .filter(n => !n.is_read)
          .slice(0, 10);

        setStartupUnreadNotifications(initialUnread);
        setIsStartupUnreadModalOpen(initialUnread.length > 0);

        hasShownInitialUnreadToastsRef.current = true;
      }
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
    }
  }, [user, isAdmin, addToast]);

  useEffect(() => {
    if (!user) {
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

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, isAdmin, fetchNotifications, addToast]);

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
