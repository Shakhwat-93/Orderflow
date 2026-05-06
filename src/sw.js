// ============================================================
// OrderFlow PWA — Service Worker
// Uses Workbox for precaching + handles Web Push notifications
// This file is built by vite-plugin-pwa with injectManifest strategy
// ============================================================

import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';

// Precache all Vite build assets
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// ============================================================
// PUSH NOTIFICATION HANDLER
// Fires when the backend sends a push via the Web Push Protocol
// Works even when the PWA is closed / in background
// ============================================================
self.addEventListener('push', (event) => {
  // Guard: ensure push payload exists
  if (!event.data) {
    console.warn('[SW] Push received with no data.');
    return;
  }

  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    // Fallback for plain-text payloads
    payload = {
      title: 'New Notification',
      message: event.data.text(),
      url: '/',
    };
  }

  const title   = payload.title   || 'OrderFlow';
  const body    = payload.message || payload.body || '';
  const url     = payload.url     || '/';
  const notifId = payload.id      || payload.notification_id || Date.now().toString();

  /**
   * Notification options — tuned for Android & desktop compatibility.
   * - `icon`  : shown in notification drawer (192x192+ recommended)
   * - `badge` : small monochrome icon for Android status bar
   * - `tag`   : collapses duplicate notifications (same tag = replace)
   * - `renotify` : play sound/vibrate even if replacing same tag
   * - `requireInteraction`: keep notification visible until tapped (desktop)
   * - `data`  : arbitrary data passed to notificationclick handler
   */
  const options = {
    body,
    icon:               '/pwa-192x192.svg',
    badge:              '/pwa-192x192.svg',
    tag:                `orderflow-${notifId}`,
    renotify:           true,
    requireInteraction: false,   // set true if you want it to stay until tapped
    silent:             false,   // allow system sound/vibration
    vibrate:            [200, 100, 200],
    timestamp:          Date.now(),
    data: {
      url,
      id: notifId,
      openedAt: new Date().toISOString(),
    },
    actions: [
      { action: 'open',  title: '📋 View Details' },
      { action: 'close', title: '✕ Dismiss' },
    ],
  };

  // showNotification MUST be wrapped in event.waitUntil so the service
  // worker doesn't terminate before the notification is shown
  event.waitUntil(
    self.registration.showNotification(title, options)
      .catch((err) => {
        console.error('[SW] showNotification failed:', err);
      })
  );
});

// ============================================================
// NOTIFICATION CLICK HANDLER
// Handles what happens when the user taps the notification
// ============================================================
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  // User clicked "Dismiss" action — do nothing
  if (event.action === 'close') return;

  const notifData  = event.notification.data || {};
  const targetUrl  = new URL(notifData.url || '/', self.location.origin).href;

  event.waitUntil(
    // Try to focus an already-open window, otherwise open a new one
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        // 1. If a window is open on the exact same URL — focus it
        for (const client of windowClients) {
          if (client.url === targetUrl && 'focus' in client) {
            return client.focus();
          }
        }

        // 2. If any window of the PWA is open — navigate it to target URL
        for (const client of windowClients) {
          if ('navigate' in client) {
            return client.navigate(targetUrl).then((c) => c?.focus());
          }
        }

        // 3. No window open — open a brand-new one
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      })
      .catch((err) => {
        console.error('[SW] notificationclick handler failed:', err);
      })
  );
});

// ============================================================
// NOTIFICATION CLOSE HANDLER (optional analytics hook)
// ============================================================
self.addEventListener('notificationclose', (event) => {
  // You can track dismissed notifications here if needed
  console.log('[SW] Notification dismissed:', event.notification.tag);
});

// ============================================================
// PUSH SUBSCRIPTION CHANGE HANDLER
// Fires when the browser auto-rotates the push subscription keys.
// We silently re-register so the user never loses notifications.
// ============================================================
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    self.registration.pushManager
      .subscribe(event.oldSubscription?.options ?? { userVisibleOnly: true })
      .then((newSubscription) => {
        // Notify the app so it can save the new subscription to the backend
        return self.clients.matchAll({ type: 'window', includeUncontrolled: true })
          .then((windowClients) => {
            for (const client of windowClients) {
              client.postMessage({
                type: 'PUSH_SUBSCRIPTION_CHANGED',
                subscription: newSubscription.toJSON(),
              });
            }
          });
      })
      .catch((err) => {
        console.error('[SW] pushsubscriptionchange re-subscribe failed:', err);
      })
  );
});
