function createMemoryStorage() {
  const store = new Map();

  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(String(key), String(value));
    },
    removeItem(key) {
      store.delete(String(key));
    },
    clear() {
      store.clear();
    },
  };
}

const memoryLocalStorage = createMemoryStorage();
const memorySessionStorage = createMemoryStorage();

function resolveStorage(candidate, fallback) {
  try {
    if (!candidate) {
      return fallback;
    }

    const probeKey = '__orderflow_storage_probe__';
    candidate.setItem(probeKey, '1');
    candidate.removeItem(probeKey);
    return candidate;
  } catch {
    return fallback;
  }
}

export function getLocalStorage() {
  if (typeof window === 'undefined') {
    return memoryLocalStorage;
  }

  return resolveStorage(window.localStorage, memoryLocalStorage);
}

export function getSessionStorage() {
  if (typeof window === 'undefined') {
    return memorySessionStorage;
  }

  return resolveStorage(window.sessionStorage, memorySessionStorage);
}

export function installStoragePolyfills() {
  if (typeof window === 'undefined') {
    return;
  }

  const local = getLocalStorage();
  const session = getSessionStorage();

  if (!('localStorage' in window)) {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: local,
    });
  }

  if (!('sessionStorage' in window)) {
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      value: session,
    });
  }

  if (!('localStorage' in globalThis)) {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: local,
    });
  }

  if (!('sessionStorage' in globalThis)) {
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      value: session,
    });
  }
}
