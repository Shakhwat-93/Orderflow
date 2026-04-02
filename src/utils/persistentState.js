import { useEffect, useState } from 'react';

function resolveInitialValue(initialValue) {
  return typeof initialValue === 'function' ? initialValue() : initialValue;
}

export function usePersistentState(key, initialValue, options = {}) {
  const storage = options.storage ?? (typeof window !== 'undefined' ? window.sessionStorage : null);
  const serialize = options.serialize ?? JSON.stringify;
  const deserialize = options.deserialize ?? JSON.parse;

  const [state, setState] = useState(() => {
    const fallback = resolveInitialValue(initialValue);
    if (!storage) return fallback;

    try {
      const raw = storage.getItem(key);
      if (raw == null) return fallback;
      return deserialize(raw);
    } catch {
      return fallback;
    }
  });

  useEffect(() => {
    if (!storage) return;

    try {
      storage.setItem(key, serialize(state));
    } catch {
      // Ignore storage quota / serialization errors for UX persistence.
    }
  }, [key, serialize, state, storage]);

  return [state, setState];
}

export function deserializeDateRange(raw) {
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  return {
    start: parsed?.start ? new Date(parsed.start) : null,
    end: parsed?.end ? new Date(parsed.end) : null,
  };
}
