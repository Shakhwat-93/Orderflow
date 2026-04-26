import { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import api from '../lib/api';
import { useOrders } from './OrderContext';

const CourierRatioContext = createContext(null);

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
  const [ratios, setRatios] = useState(() => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      return cached ? normalizeCachedRatios(JSON.parse(cached)) : {};
    } catch (e) {
      return {};
    }
  });
  const inFlight = useRef(new Set());
  const queue = useRef([]);
  const isProcessing = useRef(false);
  const ratiosRef = useRef(ratios);

  // Sync cache when ratios update
  useEffect(() => {
    ratiosRef.current = ratios;
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(ratios));
    } catch (e) { /* ignore storage errors */ }
  }, [ratios]);

  // Core fetch function
  const fetchRatio = async (phone) => {
    try {
      const { data, error } = await supabase.functions.invoke('courier-ratio-check', {
        body: { phone },
      });
      if (error) throw error;
      return api.normalizeCourierRatioPayload(data, phone);
    } catch (err) {
      console.error('[BD Courier Context]', phone, err);
      return null;
    }
  };

  // Process the queue one by one to avoid rate limits
  const processQueue = useCallback(async () => {
    if (isProcessing.current || queue.current.length === 0) return;
    isProcessing.current = true;

    while (queue.current.length > 0) {
      const { phone, force } = queue.current.shift();

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
            setRatios(prev => ({
              ...prev,
              [phone]: { ...prev[phone], ...cached, phone }
            }));
            inFlight.current.delete(phone);
            continue;
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

        const result = await fetchRatio(phone);

        if (result) {
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
          const failedRatio = await api.markCourierRatioCacheFailed(phone, 'Courier ratio check failed');
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

  useEffect(() => {
    const phonesToPrime = [...new Set(
      (orders || [])
        .map((order) => api.normalizePhone(order?.phone))
        .filter(Boolean)
    )];

    phonesToPrime.forEach((phone) => {
      if (!ratiosRef.current[phone]?.fetched && !ratiosRef.current[phone]?.loading) {
        checkPhone(phone);
      }
    });
  }, [orders, checkPhone]);

  return (
    <CourierRatioContext.Provider value={{ ratios, checkPhone, getRatio }}>
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
