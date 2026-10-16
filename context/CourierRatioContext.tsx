'use client';

import { createContext, useContext, useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { supabase } from '@/services/api/client';
import api from '@/services/api';
import { useOrders } from './OrderContext';

const CourierRatioContext = createContext<any>(null);

const CACHE_KEY = '__orderflow_courier_ratios';
const RATE_LIMIT_DELAY_MS = 600;

const normalizeCachedRatios = (ratios = {}) => {
  if (!ratios || typeof ratios !== 'object') return {};

  return Object.entries(ratios).reduce((acc, [phone, value]) => {
    const normalizedPhone = api.normalizePhone(phone);
    if (!normalizedPhone) return acc;
    acc[normalizedPhone] = {
      ...acc[normalizedPhone],
      ...value,
      phone: normalizedPhone
    };
    return acc;
  }, {});
};

export const CourierRatioProvider = ({ children }) => {
  const { orders } = useOrders();
  const [ratios, setRatios] = useState<Record<string, any>>(() => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      return cached ? normalizeCachedRatios(JSON.parse(cached)) : {};
    } catch (e) {
      return {};
    }
  });
  const inFlight = useRef<Set<string>>(new Set());
  const queue = useRef<Array<{ phone: string; force?: boolean }>>([]);
  const isProcessing = useRef(false);
  const ratiosRef = useRef<Record<string, any>>(ratios);

  // Sync cache when ratios update
  useEffect(() => {
    ratiosRef.current = ratios;
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(ratios));
    } catch (e) { /* ignore storage errors */ }
  }, [ratios]);

  // Core fetch function
  const fetchRatio = async (phone: string, force = false) => {
    try {
      // 1. Primary: Fast server-side Next.js route (handles BD Courier & Steadfast server-side without exposing token)
      const res = await fetch('/api/courier-ratio-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, force }),
      });

      const json = await res.json().catch(() => null);

      if (res.ok && json?.success && json?.data) {
        return api.normalizeCourierRatioPayload(json.data, phone);
      }

      if (json && json.success === false) {
        return {
          success: false,
          error: json.error || 'Courier ratio check failed',
          provider: json.provider
        };
      }

      return {
        success: false,
        error: `Server check returned HTTP ${res.status}`
      };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Courier ratio check unavailable'
      };
    }
  };


  // Process the queue one by one to avoid rate limits
  const processQueue = useCallback(async () => {
    if (isProcessing.current || queue.current.length === 0) return;
    isProcessing.current = true;

    while (queue.current.length > 0) {
      const item = queue.current.shift();
      if (!item) break;
      const { phone, force } = item;

      // Check synchronous cache (ref) entirely bypassing React's batched update delay
      if (!force && ratiosRef.current[phone]?.fetched && !ratiosRef.current[phone]?.error) {
        inFlight.current.delete(phone);
        continue; // Bails out IMMEDIATELY, zero API call!
      }

      // If we made it here, we actually need to fetch
      setRatios(prev => ({ 
        ...prev, 
        [phone]: { ...prev[phone], phone, loading: true, fetched: false, error: false } 
      }));

      try {
        if (!force) {
          const cached = await api.getCourierRatioCache(phone);
          if (cached?.fetched && !cached.error) {
            const cachedDate = cached.fetchedAt || cached.updatedAt;
            const cacheAgeMs = cachedDate ? (Date.now() - new Date(cachedDate).getTime()) : Infinity;
            const cacheAgeHours = cacheAgeMs / (1000 * 60 * 60);

            const maxAgeHours = 24;
            if (cacheAgeHours < maxAgeHours) {
              setRatios(prev => ({
                ...prev,
                [phone]: { ...prev[phone], ...cached, phone }
              }));
              inFlight.current.delete(phone);
              continue;
            }
          }
        }

        let shouldFetch = true;
        if (!force) {
          const claimed = await api.claimCourierRatioLookup(phone);
          if (!claimed) {
            const waited = await api.waitForCourierRatioCache(phone, 4, 850);
            if (waited?.fetched || waited?.error) {
              setRatios(prev => ({
                ...prev,
                [phone]: { ...prev[phone], ...waited, phone }
              }));
              shouldFetch = false;
            }
          }
        }

        if (!shouldFetch) {
          inFlight.current.delete(phone);
          continue;
        }

        const result: any = await fetchRatio(phone, force);

        if (result && result.success !== false) {
          const persisted = await api.saveCourierRatioCache(phone, result);
          const finalRatio = persisted || {
            loading: false,
            fetched: true,
            error: false,
            phone,
            total: result.total ?? 0,
            success_count: result.success_count ?? 0,
            cancelled: result.cancelled ?? 0,
            ratio: result.ratio ?? 0,
            riskLevel: result.riskLevel ?? 'new',
            couriers: result.couriers ?? {},
            source: result.source || 'bdcourier',
            raw: result.raw,
            fetchedAt: new Date().toISOString()
          };

          setRatios(prev => ({
            ...prev,
            [phone]: { ...prev[phone], ...finalRatio, phone }
          }));
        } else {
          const errMsg = result?.error || 'Courier ratio check failed';
          const failedRatio = await api.markCourierRatioCacheFailed(phone, errMsg);
          setRatios(prev => ({
            ...prev,
            [phone]: failedRatio
              ? { ...prev[phone], ...failedRatio, phone, error: true, source: result?.provider || 'bdcourier', raw: { error: errMsg } }
              : { ...prev[phone], phone, loading: false, fetched: true, error: true, total: 0, ratio: 0, riskLevel: 'new', couriers: {}, source: result?.provider || 'bdcourier', raw: { error: errMsg } },
          }));
        }
      } catch (error) {
        console.error('[BD Courier Context] queue error:', phone, error);
        setRatios(prev => ({
          ...prev,
          [phone]: { ...prev[phone], phone, loading: false, fetched: true, error: true, total: 0, ratio: 0, riskLevel: 'new', couriers: {}, raw: { error: String(error) } },
        }));
      }

      inFlight.current.delete(phone);
      
      // Delay between calls
      if (queue.current.length > 0) {
        await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY_MS));
      }
    }

    isProcessing.current = false;
  }, []);

  // Queue a phone number for checking
  const checkPhone = useCallback((phone, force = false) => {
    const normalizedPhone = api.normalizePhone(phone);
    if (!normalizedPhone) return;
    
    // Check if we even need to fetch
    setRatios(prev => {
      if (!force && prev[normalizedPhone]?.fetched && !prev[normalizedPhone]?.error) return prev;
      if (inFlight.current.has(normalizedPhone)) return prev;

      inFlight.current.add(normalizedPhone);
      queue.current.push({ phone: normalizedPhone, force });
      
      // Trigger processing asynchronously so we don't block
      setTimeout(processQueue, 0);
      
      return prev;
    });
  }, [processQueue]);

  const getRatio = useCallback((phone) => {
    const normalizedPhone = api.normalizePhone(phone);
    if (!normalizedPhone) return null;
    return ratios[normalizedPhone] || null;
  }, [ratios]);



  const contextValue = useMemo(() => ({
    ratios,
    checkPhone,
    getRatio
  }), [ratios, checkPhone, getRatio]);

  return (
    <CourierRatioContext.Provider value={contextValue}>
      {children}
    </CourierRatioContext.Provider>
  );
};

export const useCourierRatio = () => {
  const context = useContext(CourierRatioContext);
  if (!context) {
    throw new Error('useCourierRatio must be used within a CourierRatioProvider');
  }
  return context;
};
