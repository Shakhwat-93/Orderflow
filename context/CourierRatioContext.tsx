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
  const fetchRatio = async (phone: string) => {
    let lastError = '';
    try {
      // 1. Primary: Fast server-side Next.js route (integrates Steadfast API + VPS cache)
      const res = await fetch('/api/courier-ratio-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });

      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          return api.normalizeCourierRatioPayload(json.data, phone);
        }
      }

      // 2. Secondary fallback: invoke Edge Function if deployed
      const { data, error } = await supabase.functions.invoke('courier-ratio-check', {
        body: { phone },
      });

      if (!error && data) {
        return api.normalizeCourierRatioPayload(data, phone);
      }
      throw new Error(error?.message || 'Server check failed');
    } catch (err: any) {
      lastError = err?.message || 'Server check failed';

      // Client-side fallback check
      try {
        const config = await api.getSystemConfig('fraud_checker_bd');
        if (config && config.is_enabled && config.api_key) {
          const token = config.api_key;
          const baseUrl = config.api_url || 'https://api.bdcourier.com/courier-check';
          const isBdCourier = baseUrl.includes('api.bdcourier.com') || baseUrl.includes('courier-check');

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8000);

          let clientResponse;
          try {
            if (isBdCourier) {
              clientResponse = await fetch(baseUrl, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json',
                  'Accept': 'application/json'
                },
                body: JSON.stringify({ phone }),
                signal: controller.signal
              });
            } else {
              let url = baseUrl;
              if (url.includes('{phone}')) {
                url = url.replace('{phone}', phone);
              } else {
                url = url.endsWith('/') ? `${url}${phone}` : `${url}/${phone}`;
              }
              clientResponse = await fetch(url, {
                method: 'GET',
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'api-key': token,
                  'Api-Key': token,
                  'Accept': 'application/json',
                  'Content-Type': 'application/json'
                },
                signal: controller.signal
              });
            }
          } finally {
            clearTimeout(timeoutId);
          }

          if (clientResponse.ok) {
            const clientData = await clientResponse.json();
            if (clientData.status === 'error' || clientData.success === false) {
              throw new Error(clientData.message || clientData.error || 'Application error from BD Courier');
            }
            console.log('[BD Courier Context] Client-side fallback check succeeded for phone:', phone);
            return api.normalizeCourierRatioPayload(clientData, phone);
          } else {
            let errorMsg = `BD Courier HTTP Error ${clientResponse.status}`;
            try {
              const errBody = await clientResponse.json();
              if (errBody && (errBody.message || errBody.error)) {
                errorMsg = errBody.message || errBody.error;
              }
            } catch (_) {}
            throw new Error(errorMsg);
          }
        } else {
          throw new Error(`${lastError}.`);
        }
      } catch (fallbackErr: any) {
        // Fallback gracefully without throwing noisy unhandled console errors
        return {
          success: false,
          error: fallbackErr?.message || lastError || 'Courier ratio check unavailable'
        };
      }
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
      if (!force && ratiosRef.current[phone]?.fetched) {
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
          if (cached?.fetched) {
            const cachedDate = cached.fetchedAt || cached.updatedAt;
            const cacheAgeMs = cachedDate ? (Date.now() - new Date(cachedDate).getTime()) : Infinity;
            const cacheAgeHours = cacheAgeMs / (1000 * 60 * 60);

            const maxAgeHours = cached.error ? (10 / 60) : 24;
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

        const result: any = await fetchRatio(phone);

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
              ? { ...prev[phone], ...failedRatio, phone }
              : { ...prev[phone], phone, loading: false, fetched: true, error: true, total: 0, ratio: 0, riskLevel: 'new', couriers: {} },
          }));
        }
      } catch (error) {
        console.error('[BD Courier Context] queue error:', phone, error);
        setRatios(prev => ({
          ...prev,
          [phone]: { ...prev[phone], phone, loading: false, fetched: true, error: true, total: 0, ratio: 0, riskLevel: 'new', couriers: {} },
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
      if (!force && prev[normalizedPhone]?.fetched) return prev;
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
