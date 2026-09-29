/**
 * ORDER STATUS HELPER & INCOMPLETE TRACKING SERVICE
 * ─────────────────────────────────────────────────────────────────────────────
 * Provides centralized helper functions for detecting orders converted from
 * "Incomplete" (abandoned checkouts) and formatting status badges with `inco-`
 * prefixes (e.g. `inco-Confirmed`, `inco-Cancelled`, `inco-Fake Order`).
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface OrderStatusRecord {
  status?: string;
  notes?: string | null;
  was_incomplete?: boolean;
  [key: string]: any;
}

/**
 * Checks if an order was originally converted/processed from an "Incomplete" order.
 */
export const isIncompleteConversion = (order?: OrderStatusRecord | null): boolean => {
  if (!order || !order.status || order.status === 'Incomplete') return false;
  const notes = String(order.notes || '');
  return notes.includes('[Was Incomplete]') || notes.includes('inco-') || order.was_incomplete === true;
};

/**
 * Returns the status label for UI display.
 * If the order was converted from Incomplete, prefixes with `inco-`.
 * Examples: "inco-Confirmed", "inco-Cancelled", "inco-Fake Order"
 */
export const getDisplayStatusLabel = (orderOrStatus?: OrderStatusRecord | string | null, orderObj?: OrderStatusRecord | null): string => {
  if (!orderOrStatus) return '';

  if (typeof orderOrStatus === 'object') {
    const order = orderOrStatus;
    if (!order.status) return '';
    if (isIncompleteConversion(order)) {
      return `inco-${order.status}`;
    }
    return order.status;
  }

  const statusStr = String(orderOrStatus);
  if (orderObj && isIncompleteConversion(orderObj)) {
    return `inco-${statusStr}`;
  }
  return statusStr;
};

/**
 * Ensure `[Was Incomplete]` marker is added to notes payload if order was or is Incomplete.
 */
export const ensureIncompleteNoteMarker = (currentNotes = '', oldStatus = '', newStatus = ''): string => {
  const notes = String(currentNotes || '').trim();
  const wasIncomplete = oldStatus === 'Incomplete' || notes.includes('[Was Incomplete]') || notes.includes('inco-');

  if (wasIncomplete && newStatus !== 'Incomplete') {
    if (!notes.includes('[Was Incomplete]')) {
      return notes ? `${notes} [Was Incomplete]` : '[Was Incomplete]';
    }
  }
  return notes;
};
