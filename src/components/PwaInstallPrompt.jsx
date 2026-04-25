import { Download, X } from 'lucide-react';
import { usePwaInstall } from '../context/PwaInstallContext';
import './PwaInstallPrompt.css';

export const PwaInstallPrompt = () => {
  const {
    canInstall,
    isInstalled,
    isToastVisible,
    promptInstall,
    dismissInstallToast
  } = usePwaInstall();

  if (!isToastVisible || isInstalled) {
    return null;
  }

  return (
    <div className="pwa-install-toast" role="dialog" aria-live="polite" aria-label="Install app">
      <div className="pwa-install-toast__icon">
        <Download size={18} strokeWidth={2.4} />
      </div>
      <div className="pwa-install-toast__content">
        <strong>Install app</strong>
        <span>Home screen-e add kore faster access pao.</span>
      </div>
      <button
        type="button"
        className="pwa-install-toast__action"
        onClick={promptInstall}
        disabled={!canInstall}
      >
        Install
      </button>
      <button
        type="button"
        className="pwa-install-toast__dismiss"
        onClick={dismissInstallToast}
        aria-label="Dismiss install prompt"
      >
        <X size={16} />
      </button>
    </div>
  );
};
