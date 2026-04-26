import { getCurrentRoutePath, isNativeApp } from '../runtime';

const TRANSIENT_UI_SELECTORS = [
  '.sidebar-overlay',
  '.mob-more-overlay',
  '.startup-unread-modal-overlay',
  '.command-palette-overlay',
  '.premium-dropdown',
  '.notifications-panel-standard',
];

function hasTransientUiOpen() {
  return TRANSIENT_UI_SELECTORS.some((selector) => document.querySelector(selector));
}

function tryCloseTransientUi() {
  const backButtonEvent = new CustomEvent('app:backbutton', {
    bubbles: true,
    cancelable: true,
  });

  const shouldContinue = window.dispatchEvent(backButtonEvent);
  if (!shouldContinue) {
    return true;
  }

  if (hasTransientUiOpen()) {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    document
      .querySelector('.sidebar-overlay, .mob-more-overlay, .startup-unread-modal-overlay')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return true;
  }

  return false;
}

export async function initializeNativeBridge({
  onAppStateChange,
  onNetworkChange,
  onKeyboardChange,
  onResume,
  onPause,
} = {}) {
  if (!isNativeApp()) {
    return () => {};
  }

  document.documentElement.dataset.runtime = 'native';
  document.body.classList.add('native-app');

  const [{ App }, { Network }, keyboardModule, statusBarModule] = await Promise.all([
    import('@capacitor/app'),
    import('@capacitor/network'),
    import('@capacitor/keyboard'),
    import('@capacitor/status-bar'),
  ]);

  const { Keyboard } = keyboardModule;
  const { StatusBar, Style } = statusBarModule;

  await StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
  await StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {});

  const networkStatus = await Network.getStatus().catch(() => ({ connected: true }));
  onNetworkChange?.(Boolean(networkStatus?.connected));

  const handles = await Promise.all([
    App.addListener('appStateChange', ({ isActive }) => {
      onAppStateChange?.(isActive ? 'active' : 'background');

      if (isActive) {
        window.dispatchEvent(new CustomEvent('app:resume'));
        onResume?.();
        return;
      }

      onPause?.();
    }),
    App.addListener('backButton', async ({ canGoBack }) => {
      if (tryCloseTransientUi()) {
        return;
      }

      const currentPath = getCurrentRoutePath();
      const isRootRoute = currentPath === '/' || currentPath === '';

      if (!isRootRoute || canGoBack || window.history.length > 1) {
        window.history.back();
        return;
      }

      await App.exitApp();
    }),
    Network.addListener('networkStatusChange', ({ connected }) => {
      onNetworkChange?.(Boolean(connected));
      window.dispatchEvent(new CustomEvent('app:network', { detail: { connected: Boolean(connected) } }));
    }),
    Keyboard.addListener('keyboardDidShow', () => {
      document.body.classList.add('keyboard-open');
      onKeyboardChange?.(true);
    }),
    Keyboard.addListener('keyboardDidHide', () => {
      document.body.classList.remove('keyboard-open');
      onKeyboardChange?.(false);
    }),
  ]);

  return () => {
    handles.forEach((handle) => handle.remove());
    document.body.classList.remove('native-app', 'keyboard-open');
    delete document.documentElement.dataset.runtime;
  };
}
