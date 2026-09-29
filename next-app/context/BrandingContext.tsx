'use client';

import React, { createContext, useContext, useCallback, useEffect, useMemo, useState } from 'react';
import api from '@/services/api';

const BRANDING_CONFIG_KEY = 'app_branding';
const BRANDING_STORAGE_KEY = 'orderflow_app_branding';
const DEFAULT_APP_NAME = 'OrderFlow';

export interface BrandingConfig {
  app_name: string;
  logo_url?: string;
  [key: string]: any;
}

interface BrandingContextType {
  appName: string;
  branding: BrandingConfig;
  isLoading: boolean;
  isSaving: boolean;
  refreshBranding: () => Promise<void>;
  saveBranding: (nextBranding: Partial<BrandingConfig> | string) => Promise<BrandingConfig>;
}

const BrandingContext = createContext<BrandingContextType>({
  appName: DEFAULT_APP_NAME,
  branding: { app_name: DEFAULT_APP_NAME },
  isLoading: false,
  isSaving: false,
  refreshBranding: async () => {},
  saveBranding: async () => ({ app_name: DEFAULT_APP_NAME }),
});

const normalizeBranding = (value: any): BrandingConfig => {
  if (!value) {
    return { app_name: DEFAULT_APP_NAME };
  }
  if (typeof value === 'string') {
    return { app_name: value.trim() || DEFAULT_APP_NAME };
  }
  return {
    ...value,
    app_name: String(value.app_name || '').trim() || DEFAULT_APP_NAME
  };
};

export const BrandingProvider = ({ children }: { children: React.ReactNode }) => {
  const [branding, setBranding] = useState<BrandingConfig>({ app_name: DEFAULT_APP_NAME });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const persistBranding = useCallback((nextBranding: any) => {
    const normalized = normalizeBranding(nextBranding);
    setBranding(normalized);
    if (typeof window !== 'undefined') {
      localStorage.setItem(BRANDING_STORAGE_KEY, JSON.stringify(normalized));
    }
    return normalized;
  }, []);

  const refreshBranding = useCallback(async () => {
    setIsLoading(true);
    try {
      const config = await api.getSystemConfig(BRANDING_CONFIG_KEY);
      persistBranding(config);
    } catch (error) {
      console.warn('Failed to load branding config:', error);
    } finally {
      setIsLoading(false);
    }
  }, [persistBranding]);

  const saveBranding = useCallback(
    async (nextBranding: Partial<BrandingConfig> | string) => {
      setIsSaving(true);
      try {
        const normalized = normalizeBranding(nextBranding);
        await api.updateSystemConfig(BRANDING_CONFIG_KEY, normalized);
        persistBranding(normalized);
        return normalized;
      } finally {
        setIsSaving(false);
      }
    },
    [persistBranding]
  );

  useEffect(() => {
    try {
      const raw = localStorage.getItem(BRANDING_STORAGE_KEY);
      if (raw) {
        setBranding(normalizeBranding(JSON.parse(raw)));
      }
    } catch {
      // Storage access blocked or SSR
    }
    refreshBranding();
  }, [refreshBranding]);

  const appName = useMemo(() => branding.app_name || DEFAULT_APP_NAME, [branding.app_name]);

  const value = useMemo(
    () => ({
      appName,
      branding,
      isLoading,
      isSaving,
      refreshBranding,
      saveBranding
    }),
    [appName, branding, isLoading, isSaving, refreshBranding, saveBranding]
  );

  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
};

export const useBranding = () => useContext(BrandingContext);
