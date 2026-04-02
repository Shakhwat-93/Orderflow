import { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import api from '../lib/api';

const BRANDING_CONFIG_KEY = 'app_branding';
const BRANDING_STORAGE_KEY = 'orderflow_app_branding';
const DEFAULT_APP_NAME = 'OrderFlow';

const BrandingContext = createContext(null);

const normalizeBranding = (value) => {
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

export const BrandingProvider = ({ children }) => {
  const [branding, setBranding] = useState(() => {
    try {
      const raw = localStorage.getItem(BRANDING_STORAGE_KEY);
      return normalizeBranding(raw ? JSON.parse(raw) : null);
    } catch {
      return { app_name: DEFAULT_APP_NAME };
    }
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const persistBranding = useCallback((nextBranding) => {
    const normalized = normalizeBranding(nextBranding);
    setBranding(normalized);
    localStorage.setItem(BRANDING_STORAGE_KEY, JSON.stringify(normalized));
    return normalized;
  }, []);

  const refreshBranding = useCallback(async () => {
    setIsLoading(true);
    try {
      const config = await api.getSystemConfig(BRANDING_CONFIG_KEY);
      persistBranding(config);
    } catch (error) {
      console.error('Failed to load branding config:', error);
    } finally {
      setIsLoading(false);
    }
  }, [persistBranding]);

  const saveBranding = useCallback(async (nextBranding) => {
    setIsSaving(true);
    try {
      const normalized = normalizeBranding(nextBranding);
      await api.updateSystemConfig(BRANDING_CONFIG_KEY, normalized);
      return persistBranding(normalized);
    } finally {
      setIsSaving(false);
    }
  }, [persistBranding]);

  useEffect(() => {
    refreshBranding();
  }, [refreshBranding]);

  useEffect(() => {
    document.title = `${branding.app_name} | Premium Dashboard`;

    const appleTitleMeta = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (appleTitleMeta) {
      appleTitleMeta.setAttribute('content', branding.app_name);
    }
  }, [branding.app_name]);

  const value = useMemo(() => ({
    branding,
    appName: branding.app_name,
    isLoading,
    isSaving,
    refreshBranding,
    saveBranding
  }), [branding, isLoading, isSaving, refreshBranding, saveBranding]);

  return (
    <BrandingContext.Provider value={value}>
      {children}
    </BrandingContext.Provider>
  );
};

export { BrandingContext };
