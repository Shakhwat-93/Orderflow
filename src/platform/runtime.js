import { Capacitor } from '@capacitor/core';

export function isNativeApp() {
  return typeof window !== 'undefined' && Capacitor.isNativePlatform();
}

export function isWebApp() {
  return !isNativeApp();
}

export function getCurrentRoutePath() {
  if (typeof window === 'undefined') {
    return '/';
  }

  if (isNativeApp()) {
    const hashPath = window.location.hash.replace(/^#/, '').trim();
    return hashPath || '/';
  }

  return window.location.pathname || '/';
}

export function getOnlineStatus() {
  if (typeof navigator === 'undefined') {
    return true;
  }

  return navigator.onLine !== false;
}
