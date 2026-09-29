'use client';

import { useEffect, useState } from 'react';

/**
 * PHASE 9.9 — CENTRAL SHARED CLOCK / TICKER
 * Consolidates all independent per-order 1-second intervals into a single
 * coordinated ticker. Only active subscribers are notified.
 * Automatically stops when subscriber count reaches 0 to avoid leaks.
 */

let sharedNowSec = Math.floor(Date.now() / 1000);
const subscribers = new Set<() => void>();
let tickerInterval: NodeJS.Timeout | null = null;

function tick() {
  sharedNowSec = Math.floor(Date.now() / 1000);
  subscribers.forEach((callback) => {
    try {
      callback();
    } catch (e) {
      console.error('Shared clock subscriber error:', e);
    }
  });
}

function startTickerIfNeeded() {
  if (tickerInterval === null && subscribers.size > 0) {
    sharedNowSec = Math.floor(Date.now() / 1000);
    tickerInterval = setInterval(tick, 1000);
  }
}

function stopTickerIfEmpty() {
  if (subscribers.size === 0 && tickerInterval !== null) {
    clearInterval(tickerInterval);
    tickerInterval = null;
  }
}

/**
 * Hook to subscribe a leaf component to the shared 1-second clock.
 * @param enabled Whether this component needs active 1-second ticks (e.g. isLive orders)
 */
export function useSharedClock(enabled: boolean = true): number {
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    if (!enabled) return;

    // Immediately sync to latest shared second
    setNowSec(sharedNowSec);

    const onTick = () => {
      setNowSec(sharedNowSec);
    };

    subscribers.add(onTick);
    startTickerIfNeeded();

    return () => {
      subscribers.delete(onTick);
      stopTickerIfEmpty();
    };
  }, [enabled]);

  return nowSec;
}

/** Diagnostic helper for performance audits */
export function getSharedClockStats() {
  return {
    subscriberCount: subscribers.size,
    isTickerRunning: tickerInterval !== null,
    currentSec: sharedNowSec
  };
}
