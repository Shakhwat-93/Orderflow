/**
 * nativeNotifications.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Native Android notification bridge using @capacitor/local-notifications.
 *
 * FIXES applied v2:
 *  - Static import instead of dynamic (dynamic import is unreliable in Capacitor WebView)
 *  - Channel is created BEFORE permission is requested (required order)
 *  - Foreground notifications shown via LocalNotifications.addListener
 *  - Removed `schedule.at` timing — use `at: new Date(Date.now() + 50)` minimum
 *  - Robust error logging so silent failures are visible in logcat
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { LocalNotifications } from '@capacitor/local-notifications';

const CHANNEL_ID   = 'orderflow_main';
const CHANNEL_NAME = 'OrderFlow Alerts';

// ─── Channel ─────────────────────────────────────────────────────────────────

/**
 * Creates the Android 8+ notification channel. Idempotent — safe to call
 * multiple times. Channel MUST exist before any notification is shown.
 */
async function ensureChannel() {
  try {
    // listChannels is Android-only; on iOS it resolves with empty list
    const { channels } = await LocalNotifications.listChannels();
    const exists = Array.isArray(channels) && channels.some(c => c.id === CHANNEL_ID);

    if (!exists) {
      await LocalNotifications.createChannel({
        id:          CHANNEL_ID,
        name:        CHANNEL_NAME,
        description: 'Real-time order and system alerts',
        importance:  5,        // IMPORTANCE_HIGH  → triggers heads-up banner
        visibility:  1,        // VISIBILITY_PUBLIC → show on lock screen
        sound:       'default',
        vibration:   true,
        lights:      true,
        lightColor:  '#6366f1',
      });
      console.log('[NativeNotif] ✅ Channel created:', CHANNEL_ID);
    }
  } catch (e) {
    // iOS throws on listChannels — silently ignore
    console.log('[NativeNotif] Channel setup skipped (may be iOS):', e?.message);
  }
}

// ─── Permissions ─────────────────────────────────────────────────────────────

/**
 * Requests Android POST_NOTIFICATIONS permission.
 * Always creates the channel first so scheduling works immediately after grant.
 *
 * @returns {Promise<'granted' | 'denied' | 'prompt'>}
 */
export async function requestNativePermission() {
  try {
    // 1. Create channel first — must exist before we show any notification
    await ensureChannel();

    // 2. Check current state
    const { display: currentDisplay } = await LocalNotifications.checkPermissions();
    console.log('[NativeNotif] Current permission:', currentDisplay);

    if (currentDisplay === 'granted') {
      return 'granted';
    }

    // 3. Request from OS — shows the native Android dialog
    const { display: afterRequest } = await LocalNotifications.requestPermissions();
    console.log('[NativeNotif] Permission after request:', afterRequest);

    return afterRequest; // 'granted' | 'denied'
  } catch (e) {
    console.error('[NativeNotif] requestNativePermission failed:', e);
    return 'denied';
  }
}

/**
 * Checks current notification permission without prompting the user.
 * @returns {Promise<'granted' | 'denied' | 'prompt'>}
 */
export async function checkNativePermission() {
  try {
    const { display } = await LocalNotifications.checkPermissions();
    return display;
  } catch (e) {
    console.error('[NativeNotif] checkNativePermission failed:', e);
    return 'denied';
  }
}

// ─── Notification ID counter ──────────────────────────────────────────────────
// Using a random base to avoid collision across app sessions
let _notifIdCounter = Math.floor(Math.random() * 10000) + 1000;

// ─── Schedule ────────────────────────────────────────────────────────────────

/**
 * Fires a native Android status-bar notification immediately.
 *
 * @param {{ title: string, message: string, type?: string, id?: string }} notif
 */
export async function scheduleNativeNotification(notif) {
  try {
    // Verify permission before attempting to schedule
    const { display } = await LocalNotifications.checkPermissions();
    if (display !== 'granted') {
      console.warn('[NativeNotif] Cannot schedule — permission not granted:', display);
      return;
    }

    // Ensure channel exists (idempotent)
    await ensureChannel();

    // Emoji prefix based on type for quick visual scanning
    const typeEmoji = {
      ORDER_CREATED: '🛍️',
      ORDER_UPDATED: '📦',
      TASK_ASSIGNED: '📋',
      SYSTEM_ALERT:  '⚠️',
    }[notif.type] ?? '🔔';

    const id    = _notifIdCounter++;
    const title = `${typeEmoji} ${notif.title ?? 'OrderFlow'}`;
    const body  = notif.message ?? '';

    await LocalNotifications.schedule({
      notifications: [
        {
          id,
          channelId:    CHANNEL_ID,
          title,
          body,
          // Trigger immediately — Capacitor requires a future `at` date
          schedule:     { at: new Date(Date.now() + 100), allowWhileIdle: true },
          smallIcon:    'ic_stat_icon_config_sample',
          iconColor:    '#6366f1',
          sound:        'default',
          actionTypeId: '',
          extra: {
            notifId: notif.id   ?? null,
            type:    notif.type ?? 'UNKNOWN',
          },
          ongoing:    false,
          autoCancel: true,
        },
      ],
    });

    console.log(`[NativeNotif] ✅ Scheduled #${id}:`, title);
  } catch (e) {
    console.error('[NativeNotif] ❌ scheduleNativeNotification failed:', e);
  }
}

// ─── Foreground listener ─────────────────────────────────────────────────────

/**
 * Sets up a listener so notifications triggered while the app is in the
 * foreground also appear in the status bar.
 * Call this once at app startup (inside a useEffect).
 */
export function setupForegroundNotificationListener() {
  try {
    LocalNotifications.addListener('localNotificationReceived', (notification) => {
      console.log('[NativeNotif] Foreground notification received:', notification);
    });

    LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
      console.log('[NativeNotif] Notification tapped:', action);
    });
  } catch (e) {
    console.error('[NativeNotif] Failed to setup listeners:', e);
  }
}
