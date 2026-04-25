import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const PwaInstallContext = createContext(null);

const DISMISS_KEY = 'pwa_install_toast_dismissed';

export const PwaInstallProvider = ({ children }) => {
  const [installPromptEvent, setInstallPromptEvent] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isToastVisible, setIsToastVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const standaloneMedia = window.matchMedia?.('(display-mode: standalone)');

    const updateInstalledState = () => {
      const standalone = standaloneMedia?.matches || window.navigator.standalone === true;
      setIsInstalled(Boolean(standalone));

      if (standalone) {
        setInstallPromptEvent(null);
        setIsToastVisible(false);
        sessionStorage.removeItem(DISMISS_KEY);
      }
    };

    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setInstallPromptEvent(event);
      updateInstalledState();

      if (!sessionStorage.getItem(DISMISS_KEY)) {
        setIsToastVisible(true);
      }
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setInstallPromptEvent(null);
      setIsToastVisible(false);
      sessionStorage.removeItem(DISMISS_KEY);
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
  }, []);

  const dismissInstallToast = useCallback(() => {
    setIsToastVisible(false);
    sessionStorage.setItem(DISMISS_KEY, '1');
  }, []);

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
    canInstall: Boolean(installPromptEvent) && !isInstalled,
    isInstalled,
    isToastVisible: Boolean(installPromptEvent) && !isInstalled && isToastVisible,
    promptInstall,
    dismissInstallToast,
  }), [dismissInstallToast, installPromptEvent, isInstalled, isToastVisible, promptInstall]);

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
