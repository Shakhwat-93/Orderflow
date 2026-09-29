import { createClient } from '@/lib/supabase/client';

/**
 * Singleton browser Supabase client holder.
 * In SSR / Server context, initializes a fresh instance.
 */
let browserClient: ReturnType<typeof createClient> | null = null;

export function getSupabase() {
  if (typeof window === 'undefined') {
    return createClient();
  }
  if (!browserClient) {
    browserClient = createClient();
  }
  return browserClient;
}

export const supabase = getSupabase();

/**
 * In-Flight Request Deduplication Registry
 * Solves redundant parallel requests (e.g. concurrent getDashboardStats or getInventory calls).
 * Once the promise settles, it is cleared immediately to ensure operational data remains live.
 */
const inFlightRequests = new Map<string, Promise<any>>();

export function dedupPromise<T>(key: string, requestFn: () => Promise<T>): Promise<T> {
  const existing = inFlightRequests.get(key);
  if (existing) {
    return existing as Promise<T>;
  }

  const promise = requestFn()
    .finally(() => {
      inFlightRequests.delete(key);
    });

  inFlightRequests.set(key, promise);
  return promise;
}

/**
 * Error formatting and sanitization.
 * Prevents raw Postgres internal table/column structures from leaking to the UI
 * while preserving clear actionable feedback.
 */
export function formatApiError(error: unknown, fallbackMessage = 'An unexpected database error occurred'): Error {
  if (!error) return new Error(fallbackMessage);

  const rawMessage =
    error instanceof Error
      ? error.message
      : typeof (error as any)?.message === 'string' && (error as any).message
      ? (error as any).message
      : typeof error === 'string'
      ? error
      : error && typeof error === 'object' && Object.keys(error).length > 0
      ? JSON.stringify(error)
      : fallbackMessage;
  const details = (error as any)?.details || '';
  const hint = (error as any)?.hint || '';
  const code = (error as any)?.code || '';

  // Log raw technical details for debugging
  console.error(`[OrderFlow API Error: ${code || 'ERR'}] ${rawMessage || fallbackMessage}`, { details, hint, code });

  const combined = `${rawMessage} ${details} ${hint}`.toLowerCase();

  if (combined.includes('permission denied') || combined.includes('row-level security') || code === '42501') {
    return new Error('Access denied: You do not have sufficient permissions to perform this action.');
  }

  if (combined.includes('duplicate key') || combined.includes('unique constraint') || code === '23505') {
    return new Error('A record with this identifier already exists in the system.');
  }

  if (combined.includes('foreign key constraint') || code === '23503') {
    return new Error('This operation references a record that does not exist or has been removed.');
  }

  if (combined.includes('networkerror') || combined.includes('failed to fetch')) {
    return new Error('Network connection issue. Please check your internet connection.');
  }

  return new Error(rawMessage || fallbackMessage);
}

/**
 * Database schema backward compatibility helpers
 */
export const schemaState = {
  orderModernColumnsState: null as boolean | null,
  courierRatioCacheTableState: null as boolean | null,
  _toyBoxProductNameColumnState: undefined as boolean | null | undefined,

  getToyBoxProductNameColumnState(): boolean | null {
    if (typeof window !== 'undefined') {
      try { localStorage.removeItem('of_toybox_pname_state'); } catch {}
    }
    this._toyBoxProductNameColumnState = false;
    return false;
  },

  setToyBoxProductNameColumnState(_val: boolean) {
    this._toyBoxProductNameColumnState = false;
    if (typeof window !== 'undefined') {
      try { localStorage.setItem('of_toybox_pname_state', 'false'); } catch {}
    }
  },

  isMissingColumnError(error: any, columnName = ''): boolean {
    const message = [error?.message, error?.details, error?.hint]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (!message) return false;
    if (!columnName) {
      return (
        (message.includes('column') && message.includes('does not exist')) ||
        (message.includes('column') && message.includes('could not find')) ||
        (String(error?.code || '').toUpperCase() === 'PGRST204' && message.includes('schema cache'))
      );
    }
    const normalizedColumn = String(columnName).toLowerCase();
    return (
      message.includes(normalizedColumn) &&
      (
        (message.includes('column') && message.includes('does not exist')) ||
        (message.includes('column') && message.includes('could not find')) ||
        (String(error?.code || '').toUpperCase() === 'PGRST204' && message.includes('schema cache'))
      )
    );
  },

  isMissingTableError(error: any, tableName = ''): boolean {
    const message = [error?.message, error?.details, error?.hint]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (!message) return false;
    const normalizedTable = String(tableName || '').toLowerCase();
    return (
      String(error?.code || '').toUpperCase() === 'PGRST205' ||
      (message.includes('schema cache') && (!normalizedTable || message.includes(normalizedTable))) ||
      (message.includes('could not find the table') && (!normalizedTable || message.includes(normalizedTable))) ||
      (message.includes('relation') && message.includes('does not exist') && (!normalizedTable || message.includes(normalizedTable)))
    );
  },

  isMissingFunctionError(error: any, functionName = ''): boolean {
    const message = [error?.message, error?.details, error?.hint]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (!message) return false;
    const normalizedFunction = String(functionName || '').toLowerCase();
    return (
      String(error?.code || '').toUpperCase() === 'PGRST202' ||
      (message.includes('function') && message.includes('does not exist') && (!normalizedFunction || message.includes(normalizedFunction))) ||
      (message.includes('could not find the function') && (!normalizedFunction || message.includes(normalizedFunction)))
    );
  },

  hasUnsupportedOrderModernColumns(error: any): boolean {
    return (
      this.isMissingColumnError(error, 'delivery_charge') ||
      this.isMissingColumnError(error, 'traffic_source') ||
      this.isMissingColumnError(error, 'ip_address') ||
      this.isMissingColumnError(error, 'call_attempts') ||
      this.isMissingColumnError(error, 'first_call_time') ||
      this.isMissingColumnError(error, 'last_called_at')
    );
  },

  inferOrderModernColumnsState(data: any[] = []) {
    if (this.orderModernColumnsState != null) return;
    const sample = (data || []).find(Boolean);
    if (!sample) return;
    const hasAnyModernField =
      Object.prototype.hasOwnProperty.call(sample, 'delivery_charge') ||
      Object.prototype.hasOwnProperty.call(sample, 'traffic_source') ||
      Object.prototype.hasOwnProperty.call(sample, 'ip_address') ||
      Object.prototype.hasOwnProperty.call(sample, 'call_attempts') ||
      Object.prototype.hasOwnProperty.call(sample, 'first_call_time') ||
      Object.prototype.hasOwnProperty.call(sample, 'last_called_at');
    this.orderModernColumnsState = hasAnyModernField;
  },

  extractMissingColumn(error: any): string | null {
    const message = [error?.message, error?.details, error?.hint]
      .filter(Boolean)
      .join(' ');
    const match =
      message.match(/could not find the ['"]([^'"]+)['"] column/i) ||
      message.match(/column ['"]?([a-zA-Z0-9_]+)['"]? of relation .* does not exist/i) ||
      message.match(/column ['"]?([a-zA-Z0-9_]+)['"]? does not exist/i);
    return match ? match[1] : null;
  },

  stripUnsupportedOrderModernFields<T extends Record<string, any>>(payload: T): T {
    const nextPayload = { ...payload };
    delete (nextPayload as any).delivery_charge;
    delete (nextPayload as any).traffic_source;
    delete (nextPayload as any).ip_address;
    delete (nextPayload as any).call_attempts;
    delete (nextPayload as any).first_call_time;
    delete (nextPayload as any).last_called_at;
    delete (nextPayload as any).order_lines_payload;
    delete (nextPayload as any).pricing_summary;
    delete (nextPayload as any).order_lines;
    delete (nextPayload as any).lines;
    return nextPayload;
  },

  attachOrderModernFields<T extends Record<string, any>>(payload: T, sourceData: Record<string, any> = {}): T {
    const nextPayload = { ...payload };
    if (sourceData.delivery_charge !== undefined && sourceData.delivery_charge !== null) {
      (nextPayload as any).delivery_charge = Number(sourceData.delivery_charge) || 0;
    }
    if (sourceData.traffic_source !== undefined && sourceData.traffic_source !== null) {
      (nextPayload as any).traffic_source = sourceData.traffic_source;
    }
    if (sourceData.ip_address !== undefined && sourceData.ip_address !== null) {
      (nextPayload as any).ip_address = sourceData.ip_address;
    }
    if (sourceData.call_attempts !== undefined && sourceData.call_attempts !== null) {
      (nextPayload as any).call_attempts = Number(sourceData.call_attempts) || 0;
    }
    if (sourceData.first_call_time !== undefined && sourceData.first_call_time !== null) {
      (nextPayload as any).first_call_time = sourceData.first_call_time;
    }
    if (sourceData.last_called_at !== undefined && sourceData.last_called_at !== null) {
      (nextPayload as any).last_called_at = sourceData.last_called_at;
    }
    return nextPayload;
  }
};

/**
 * Normalization helpers
 */
export function normalizeIpAddress(value = ''): string {
  return String(value || '').trim().toLowerCase();
}

export function normalizePhone(value = ''): string {
  return String(value || '')
    .trim()
    .replace(/[^0-9+]/g, '');
}

export function normalizeText(value = ''): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\w\s\u0980-\u09FF]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function toFiniteNumber(value: any, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
