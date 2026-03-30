import { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const CourierRatioContext = createContext(null);

export const CourierRatioProvider = ({ children }) => {
  const [ratios, setRatios] = useState({});
  const inFlight = useRef(new Set());
  const queue = useRef([]);
  const isProcessing = useRef(false);

  // Core fetch function
  const fetchRatio = async (phone) => {
    try {
      const { data, error } = await supabase.functions.invoke('courier-ratio-check', {
        body: { phone },
      });
      if (error) throw error;
      return data;
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

      // Skip if already fetched and we're not forcing a refresh
      setRatios(prev => {
        if (!force && prev[phone]?.fetched) return prev;
        return { ...prev, [phone]: { ...prev[phone], loading: true, fetched: false } };
      });

      const result = await fetchRatio(phone);

      if (result && result.success) {
        setRatios(prev => ({
          ...prev,
          [phone]: {
            loading: false, fetched: true, error: false,
            total: result.total ?? 0,
            success_count: result.success_count ?? 0,
            cancelled: result.cancelled ?? 0,
            ratio: result.ratio ?? 0,
            riskLevel: result.riskLevel ?? 'new',
            couriers: result.couriers ?? {}, // Detailed Stats
            raw: result.raw
          },
        }));
      } else {
        setRatios(prev => ({
          ...prev,
          [phone]: { loading: false, fetched: true, error: true, total: 0, ratio: 0, riskLevel: 'new', couriers: {} },
        }));
      }

      inFlight.current.delete(phone);
      
      // Delay between calls
      if (queue.current.length > 0) {
        await new Promise(resolve => setTimeout(resolve, 600));
      }
    }

    isProcessing.current = false;
  }, []);

  // Queue a phone number for checking
  const checkPhone = useCallback((phone, force = false) => {
    if (!phone) return;
    
    // Check if we even need to fetch
    setRatios(prev => {
      if (!force && prev[phone]?.fetched) return prev;
      if (inFlight.current.has(phone)) return prev;

      inFlight.current.add(phone);
      queue.current.push({ phone, force });
      
      // Trigger processing asynchronously so we don't block
      setTimeout(processQueue, 0);
      
      return prev;
    });
  }, [processQueue]);

  return (
    <CourierRatioContext.Provider value={{ ratios, checkPhone }}>
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
