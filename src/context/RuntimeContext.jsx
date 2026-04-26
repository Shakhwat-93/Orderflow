import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { initializeNativeBridge } from '../platform/native/bridge';
import { getOnlineStatus, isNativeApp } from '../platform/runtime';

const RuntimeContext = createContext(null);

export const RuntimeProvider = ({ children }) => {
  const [isOnline, setIsOnline] = useState(getOnlineStatus);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [appState, setAppState] = useState('active');
  const [bridgeReady, setBridgeReady] = useState(!isNativeApp());
  const [bootError, setBootError] = useState(null);
  const native = isNativeApp();

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    let cleanup = () => {};
    const bootTimeout = window.setTimeout(() => {
      if (isMounted) {
        setBridgeReady(true);
      }
    }, 1800);

    (async () => {
      try {
        cleanup = await initializeNativeBridge({
          onAppStateChange: setAppState,
          onNetworkChange: setIsOnline,
          onKeyboardChange: setIsKeyboardVisible,
        });
      } catch (error) {
        console.error('Native bridge failed:', error);
        if (isMounted) {
          setBootError(error);
        }
      } finally {
        window.clearTimeout(bootTimeout);
        if (isMounted) {
          setBridgeReady(true);
        }
      }
    })();

    return () => {
      isMounted = false;
      window.clearTimeout(bootTimeout);
      cleanup();
    };
  }, []);

  const value = useMemo(() => ({
    appState,
    bootError,
    bridgeReady,
    isKeyboardVisible,
    isNativeApp: native,
    isOnline,
  }), [appState, bootError, bridgeReady, isKeyboardVisible, native, isOnline]);

  return (
    <RuntimeContext.Provider value={value}>
      {children}
    </RuntimeContext.Provider>
  );
};

export const useRuntime = () => {
  const context = useContext(RuntimeContext);
  if (!context) {
    throw new Error('useRuntime must be used within a RuntimeProvider');
  }
  return context;
};
