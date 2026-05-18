/**
 * nativeNotifications.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Native Android notification bridge using @capacitor/local-notifications.
 * 
 * This module ONLY runs inside the APK (guarded by isNativeApp() at callsite).
 * It:
 *   1. Requests Android OS permission on first launch.
 *   2. Creates a dedicated notification channel (required for Android 8+).
 *   3. Schedules a visible status-bar notification for each app event.
 *
 * NOTE: Notifications appear in the Android status bar even when the app is
 * in the background (but not fully killed/swiped away). Full background push
 * requires Firebase Cloud Messaging (FCM) which needs a google-services.json
 * on the server side.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// Dynamic import so this module does not crash on web/browser environments.
let LocalNotificationsPlugin = null;

const CHANNEL_ID = 'orderflow_main';
const CHANNEL_NAME = 'OrderFlow Alerts';

/**
 * Lazily loads the Capacitor LocalNotifications plugin.
 * Returns null if it fails (e.g. in a browser context).
 */
async function getPlugin() {
  if (LocalNotificationsPlugin) return LocalNotificationsPlugin;

  try {
    const mod = await import('@capacitor/local-notifications');
    LocalNotificationsPlugin = mod.LocalNotifications;
    return LocalNotificationsPlugin;
  } catch (e) {
    console.warn('[NativeNotif] Could not load LocalNotifications plugin:', e);
    return null;
  }
}

/**
 * Creates the Android notification channel if it doesn't already exist.
 * Must be called before scheduling any notification.
 */
async function ensureChannel(plugin) {
  try {
    const { channels } = await plugin.listChannels();
    const exists = channels.some(c => c.id === CHANNEL_ID);

    if (!exists) {
      await plugin.createChannel({
        id: CHANNEL_ID,
        name: CHANNEL_NAME,
        description: 'Real-time order and system alerts',
        importance: 5,          // IMPORTANCE_HIGH → makes the heads-up banner appear
        visibility: 1,          // VISIBILITY_PUBLIC → show on lock screen
        sound: 'default',
        vibration: true,
        lights: true,
        lightColor: '#6366f1',  // Indigo accent — matches app brand
      });
      console.log('[NativeNotif] Channel created:', CHANNEL_ID);
    }
  } catch (e) {
    console.warn('[NativeNotif] Failed to create channel:', e);
  }
}

/**
 * Requests Android POST_NOTIFICATIONS permission at the OS level.
 * Shows the native permission dialog on first call.
 *
 * @returns {Promise<'granted' | 'denied' | 'prompt'>}
 */
export async function requestNativePermission() {
  const plugin = await getPlugin();
  if (!plugin) return 'denied';

  try {
    let { display } = await plugin.checkPermissions();

    if (display === 'granted') return 'granted';

    if (display === 'prompt' || display === 'prompt-with-rationale') {
      const result = await plugin.requestPermissions();
      display = result.display;
    }

    if (display === 'granted') {
      await ensureChannel(plugin);
    }

    return display; // 'granted' | 'denied'
  } catch (e) {
    console.error('[NativeNotif] Permission request failed:', e);
    return 'denied';
  }
}

/**
 * Checks current permission status without prompting.
 * @returns {Promise<'granted' | 'denied' | 'prompt'>}
 */
export async function checkNativePermission() {
  const plugin = await getPlugin();
  if (!plugin) return 'denied';

  try {
    const { display } = await plugin.checkPermissions();
    return display;
  } catch (e) {
    return 'denied';
  }
}

// Auto-incrementing ID for notification scheduling.
let _notifIdCounter = 1000;

/**
 * Fires a native Android status-bar notification.
 *
 * @param {{ title: string, message: string, type: string, id?: string }} notif
 */
export async function scheduleNativeNotification(notif) {
  const plugin = await getPlugin();
  if (!plugin) return;

  // Ensure channel exists every time (idempotent)
  await ensureChannel(plugin);

  // Choose an emoji prefix based on notification type for quick visual scanning
  const typeEmoji = {
    ORDER_CREATED:  '🛍️',
    ORDER_UPDATED:  '📦',
    TASK_ASSIGNED:  '📋',
    SYSTEM_ALERT:   '⚠️',
  }[notif.type] ?? '🔔';

  const title = `${typeEmoji} ${notif.title}`;
  const body  = notif.message ?? '';

  try {
    await plugin.schedule({
      notifications: [
        {
          id: _notifIdCounter++,
          channelId: CHANNEL_ID,
          title,
          body,
          // Schedule immediately (at is required but can be "now")
          schedule: { at: new Date(Date.now() + 100) },
          smallIcon: 'ic_stat_icon_config_sample', // uses the Capacitor default icon
          iconColor: '#6366f1',
          sound: 'default',
          actionTypeId: '',
          extra: {
            notifId: notif.id ?? null,
            type:    notif.type ?? 'UNKNOWN',
          },
          // Show as heads-up banner even when app is in foreground
          ongoing: false,
          autoCancel: true,
        },
      ],
    });

    console.log('[NativeNotif] Scheduled:', title);
  } catch (e) {
    console.error('[NativeNotif] Schedule failed:', e);
  }
}
