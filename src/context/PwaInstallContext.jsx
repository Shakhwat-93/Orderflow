import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { isNativeApp } from '../platform/runtime';
import { getSessionStorage } from '../platform/storage';

const PwaInstallContext = createContext(null);

const DISMISS_KEY = 'pwa_install_toast_dismissed';

const detectIos = () => {
  if (typeof window === 'undefined') {
    return false;
  }

  const userAgent = window.navigator.userAgent || '';
  const isClassicIos = /iPad|iPhone|iPod/.test(userAgent);
  const isModernIpad = window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1;
  return isClassicIos || isModernIpad;
};

export const PwaInstallProvider = ({ children }) => {
  const [installPromptEvent, setInstallPromptEvent] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isToastVisible, setIsToastVisible] = useState(false);
  const storage = getSessionStorage();

  useEffect(() => {
    if (typeof window === 'undefined' || isNativeApp()) {
      return undefined;
    }

    const standaloneMedia = window.matchMedia?.('(display-mode: standalone)');

    const updateInstalledState = () => {
      const standalone = standaloneMedia?.matches || window.navigator.standalone === true;
      setIsInstalled(Boolean(standalone));

      if (standalone) {
        setInstallPromptEvent(null);
        setIsToastVisible(false);
        storage.removeItem(DISMISS_KEY);
      }
    };

    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setInstallPromptEvent(event);
      updateInstalledState();

      if (!storage.getItem(DISMISS_KEY)) {
        setIsToastVisible(true);
      }
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setInstallPromptEvent(null);
      setIsToastVisible(false);
      storage.removeItem(DISMISS_KEY);
    };

    updateInstalledState();

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    standaloneMedia?.addEventListener?.('change', updateInstalledState);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      standaloneMedia?.removeEventListener?.('change', updateInstalledState);
    };
  }, [storage]);

  const isIosDevice = detectIos();
  const canManualInstall = !isNativeApp() && isIosDevice && !isInstalled;

  const dismissInstallToast = useCallback(() => {
    setIsToastVisible(false);
    storage.setItem(DISMISS_KEY, '1');
  }, [storage]);

  const promptInstall = useCallback(async () => {
    if (!installPromptEvent) {
      return false;
    }

    try {
      await installPromptEvent.prompt();
      const choice = await installPromptEvent.userChoice;
      const accepted = choice?.outcome === 'accepted';

      if (accepted) {
        setIsToastVisible(false);
      }

      return accepted;
    } finally {
      setInstallPromptEvent(null);
    }
  }, [installPromptEvent]);

  const value = useMemo(() => ({
    canInstall: (!isNativeApp() && Boolean(installPromptEvent) && !isInstalled) || canManualInstall,
    canManualInstall,
    isInstalled,
    isToastVisible: !isNativeApp() && Boolean(installPromptEvent) && !isInstalled && isToastVisible,
    installMethod: canManualInstall ? 'manual-ios' : ((!isNativeApp() && Boolean(installPromptEvent) && !isInstalled) ? 'prompt' : 'unavailable'),
    promptInstall,
    dismissInstallToast,
  }), [canManualInstall, dismissInstallToast, installPromptEvent, isInstalled, isToastVisible, promptInstall]);

  return (
    <PwaInstallContext.Provider value={value}>
      {children}
    </PwaInstallContext.Provider>
  );
};

export const usePwaInstall = () => {
  const context = useContext(PwaInstallContext);
  if (!context) {
    throw new Error('usePwaInstall must be used within a PwaInstallProvider');
  }
  return context;
};
