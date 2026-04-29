import { useCallback, useEffect, useMemo, useState } from 'react';

const STORAGE_PREFIX = 'orderflow:route-order-read:v1';
const MAX_TRACKED_ORDERS = 1200;

const getOrderActivityStamp = (order) => {
  const raw = order?.updated_at || order?.created_at || '';
  const parsed = raw ? new Date(raw).getTime() : 0;
  return Number.isFinite(parsed) ? parsed : 0;
};

const readStoredState = (storageKey) => {
  try {
    const raw = window.localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const persistStoredState = (storageKey, nextState) => {
  try {
    const entries = Object.entries(nextState)
      .sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0))
      .slice(0, MAX_TRACKED_ORDERS);
    window.localStorage.setItem(storageKey, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // Read indicators are convenience UI only; order workflows must never depend on local storage.
  }
};

export const useRouteOrderReadState = (routeKey, orders = []) => {
  const storageKey = `${STORAGE_PREFIX}:${routeKey}`;
  const [readState, setReadState] = useState(() => readStoredState(storageKey));

  useEffect(() => {
    setReadState(readStoredState(storageKey));
  }, [storageKey]);

  const isOrderUnread = useCallback((order) => {
    if (!order?.id) return false;
    const activityStamp = getOrderActivityStamp(order);
    const seenStamp = Number(readState[order.id] || 0);
    return activityStamp > seenStamp;
  }, [readState]);

  const markOrderRead = useCallback((order) => {
    if (!order?.id) return;
    const activityStamp = Math.max(getOrderActivityStamp(order), Date.now());
    setReadState((prev) => {
      if (Number(prev[order.id] || 0) >= activityStamp) return prev;
      const next = { ...prev, [order.id]: activityStamp };
      persistStoredState(storageKey, next);
      return next;
    });
  }, [storageKey]);

  const markOrdersRead = useCallback((targetOrders = []) => {
    const validOrders = targetOrders.filter((order) => order?.id);
    if (validOrders.length === 0) return;
    setReadState((prev) => {
      const next = { ...prev };
      validOrders.forEach((order) => {
        next[order.id] = Math.max(getOrderActivityStamp(order), Date.now());
      });
      persistStoredState(storageKey, next);
      return next;
    });
  }, [storageKey]);

  const unreadCount = useMemo(
    () => orders.reduce((count, order) => count + (isOrderUnread(order) ? 1 : 0), 0),
    [orders, isOrderUnread]
  );

  return {
    isOrderUnread,
    markOrderRead,
    markOrdersRead,
    unreadCount
  };
};
