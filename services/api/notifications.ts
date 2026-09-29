import { supabase, formatApiError } from './client';
import type { NotificationItem } from '@/types/api';

export const notificationsApi = {
  /**
   * Fetch system notifications
   */
  async getNotifications(limit = 20): Promise<NotificationItem[]> {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return (data as NotificationItem[]) || [];
    } catch (err) {
      throw formatApiError(err, 'Failed to fetch notifications');
    }
  },

  /**
   * Mark a single notification as read
   */
  async markNotificationRead(id: string | number): Promise<NotificationItem> {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as NotificationItem;
    } catch (err) {
      throw formatApiError(err, `Failed to mark notification #${id} as read`);
    }
  },

  /**
   * Mark all unread notifications as read
   */
  async markAllNotificationsRead(): Promise<void> {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('is_read', false);

      if (error) throw error;
    } catch (err) {
      throw formatApiError(err, 'Failed to mark all notifications as read');
    }
  },

  /**
   * Delete all notifications permanently
   */
  async deleteAllNotifications(): Promise<void> {
    try {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .not('id', 'is', null);

      if (error) throw error;
    } catch (err) {
      throw formatApiError(err, 'Failed to delete notifications');
    }
  },

  getNotificationUrl(notifData: any = {}): string {
    const explicitUrl = String(notifData?.data?.url || notifData?.url || '').trim();
    if (explicitUrl) return explicitUrl;

    if (String(notifData?.type || '').startsWith('TASK_')) {
      return '/tasks';
    }

    return '/orders';
  },

  async resolveNotificationPushRecipients(notifData: any = {}): Promise<string[]> {
    const explicitTargets = [notifData?.target_user_id, notifData?.data?.targetUserId]
      .filter(Boolean)
      .map((value) => String(value).trim())
      .filter(Boolean);

    if (explicitTargets.length > 0) {
      return Array.from(new Set(explicitTargets));
    }

    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role_id', 'Admin');

      if (error) throw error;
      return Array.from(new Set((data || []).map((row: any) => String(row.user_id || '').trim()).filter(Boolean)));
    } catch {
      return [];
    }
  },

  async triggerPushNotifications(notificationRecord: any, notifData: any = {}): Promise<void> {
    const recipients = await this.resolveNotificationPushRecipients(notifData);
    if (!recipients.length) return;

    const body = {
      notification_id: notificationRecord?.id || null,
      title: notifData?.title || notificationRecord?.title || 'New Notification',
      message: notifData?.message || notificationRecord?.message || '',
      url: this.getNotificationUrl(notifData)
    };

    const results = await Promise.allSettled(
      recipients.map((userId) =>
        supabase.functions.invoke('send-push', {
          body: {
            ...body,
            user_id: userId
          }
        })
      )
    );

    const failed = results.find((result) => result.status === 'fulfilled' && result.value?.error);
    if (failed && failed.status === 'fulfilled' && failed.value?.error) {
      throw failed.value.error;
    }
  },

  /**
   * Internal helper to create a notification with realtime broadcast and push dispatch
   */
  async createNotification(notifData: Partial<NotificationItem> & Record<string, any>): Promise<NotificationItem> {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .insert([notifData])
        .select()
        .single();

      if (error) throw error;

      // Broadcast for realtime UI popups
      try {
        await supabase.channel('admin_notifications_realtime').send({
          type: 'broadcast',
          event: 'new_notification',
          payload: data
        });
      } catch (broadcastError) {
        console.warn('Real-time notification broadcast non-fatal error:', broadcastError);
      }

      // Trigger Web Push in background
      try {
        await this.triggerPushNotifications(data, notifData);
      } catch (pushError) {
        console.warn('Push notification dispatch non-fatal error:', pushError);
      }

      return data as NotificationItem;
    } catch (err) {
      throw formatApiError(err, 'Failed to create notification');
    }
  },

  /**
   * Save Web Push subscription
   */
  async savePushSubscription(subscription: any, userId: string | null = null): Promise<void> {
    if (!subscription || !subscription.endpoint) return;

    try {
      const p256dh = subscription.toJSON?.()?.keys?.p256dh || null;
      const auth = subscription.toJSON?.()?.keys?.auth || null;

      const { error } = await supabase.from('user_push_subscriptions').upsert(
        {
          user_id: userId || null,
          endpoint: subscription.endpoint,
          p256dh,
          auth,
          subscription: subscription.toJSON ? subscription.toJSON() : subscription,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'endpoint' }
      );

      if (error) console.warn('savePushSubscription non-fatal warning:', error);
    } catch (err) {
      console.warn('savePushSubscription error:', err);
    }
  },

  async deletePushSubscription(endpoint: string): Promise<void> {
    if (!endpoint) return;
    try {
      const { error } = await supabase
        .from('user_push_subscriptions')
        .delete()
        .eq('endpoint', endpoint);

      if (error) console.warn('deletePushSubscription warning:', error);
    } catch (err) {
      console.warn('deletePushSubscription error:', err);
    }
  }
};
