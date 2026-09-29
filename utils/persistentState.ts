'use client';

import { useEffect, useState, Dispatch, SetStateAction } from 'react';

function resolveInitialValue<T>(initialValue: T | (() => T)): T {
  return typeof initialValue === 'function' ? (initialValue as () => T)() : initialValue;
}

export interface PersistentStateOptions<T> {
  storage?: Storage | null;
  serialize?: (value: T) => string;
  deserialize?: (value: string) => T;
}

export function usePersistentState<T>(
  key: string,
  initialValue: T | (() => T),
  options: PersistentStateOptions<T> = {}
): [T, Dispatch<SetStateAction<T>>] {
  const serialize = options.serialize ?? JSON.stringify;
  const deserialize = options.deserialize ?? JSON.parse;

  const [state, setState] = useState<T>(() => {
    const fallback = resolveInitialValue(initialValue);
    if (typeof window === 'undefined') return fallback;

    const storage = options.storage ?? window.sessionStorage;
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
    if (typeof window === 'undefined') return;
    const storage = options.storage ?? window.sessionStorage;
    if (!storage) return;

    try {
      storage.setItem(key, serialize(state));
    } catch {
      // Ignore storage quota or serialization errors
    }
  }, [key, serialize, state, options.storage]);

  return [state, setState];
}

export function deserializeDateRange(raw: any): { start: Date | null; end: Date | null } {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return {
      start: parsed?.start ? new Date(parsed.start) : null,
      end: parsed?.end ? new Date(parsed.end) : null,
    };
  } catch {
    return { start: null, end: null };
  }
}
