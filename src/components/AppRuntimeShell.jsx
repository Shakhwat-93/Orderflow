import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { AppLaunchScreen } from './AppLaunchScreen';
import { useRuntime } from '../context/RuntimeContext';
import './AppRuntimeShell.css';

export const AppRuntimeShell = ({ children }) => {
  const { bootError, bridgeReady, isNativeApp: native, isOnline } = useRuntime();
  const [launchVisible, setLaunchVisible] = useState(native);
  const showLaunchScreen = native && (launchVisible || !bridgeReady);

  return (
    <>
      <div className={`app-shell app-runtime-shell ${launchVisible ? 'is-launching' : ''}`}>
        <div className="runtime-banner-stack" aria-live="polite">
          {!isOnline && (
            <div className="runtime-banner offline" role="status">
              <div>
                <strong>Offline mode active</strong>
                <span>Connection back ashle data auto-sync abar chalu hobe.</span>
              </div>
              <button type="button" onClick={() => window.location.reload()}>
                <RefreshCw size={14} />
              </button>
            </div>
          )}

          {bootError && (
            <div className="runtime-banner error" role="alert">
              <div>
                <strong>Runtime recovery mode</strong>
                <span>Native bridge init fail koreche, fallback shell diye app choltese.</span>
              </div>
              <button type="button" onClick={() => window.location.reload()}>
                <AlertTriangle size={14} />
              </button>
            </div>
          )}
        </div>

        {children}
      </div>

      {showLaunchScreen ? (
        <AppLaunchScreen isVisible={launchVisible} onComplete={() => setLaunchVisible(false)} />
      ) : null}
    </>
  );
};
