/**
 * ORDER STATUS HELPER & INCOMPLETE TRACKING SERVICE
 * ─────────────────────────────────────────────────────────────────────────────
 * Provides centralized helper functions for detecting orders converted from
 * "Incomplete" (abandoned checkouts) and formatting status badges with `inco-`
 * prefixes (e.g. `inco-Confirmed`, `inco-Cancelled`, `inco-Fake Order`).
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Checks if an order was originally converted/processed from an "Incomplete" order.
 *
 * @param {object} order - Order record
 * @returns {boolean}
 */
export const isIncompleteConversion = (order) => {
  if (!order || !order.status || order.status === 'Incomplete') return false;
  const notes = String(order.notes || '');
  return notes.includes('[Was Incomplete]') || notes.includes('inco-') || order.was_incomplete === true;
};

/**
 * Returns the status label for UI display.
 * If the order was converted from Incomplete, prefixes with `inco-`.
 * Examples: "inco-Confirmed", "inco-Cancelled", "inco-Fake Order"
 *
 * @param {object|string} orderOrStatus - Order object OR raw status string
 * @param {object} [orderObj] - Optional order object if first arg is status string
 * @returns {string}
 */
export const getDisplayStatusLabel = (orderOrStatus, orderObj) => {
  if (!orderOrStatus) return '';

  if (typeof orderOrStatus === 'object') {
    const order = orderOrStatus;
    if (!order.status) return '';
    if (isIncompleteConversion(order)) {
      return `inco-${order.status}`;
    }
    return order.status;
  }

  // If first arg is status string and second arg is order object
  const statusStr = String(orderOrStatus);
  if (orderObj && isIncompleteConversion(orderObj)) {
    return `inco-${statusStr}`;
  }
  return statusStr;
};

/**
 * Ensure `[Was Incomplete]` marker is added to notes payload if order was or is Incomplete.
 *
 * @param {string} currentNotes - Existing notes string
 * @param {string} oldStatus - Previous order status
 * @param {string} newStatus - Target order status
 * @returns {string}
 */
export const ensureIncompleteNoteMarker = (currentNotes = '', oldStatus = '', newStatus = '') => {
  const notes = String(currentNotes || '').trim();
  const wasIncomplete = oldStatus === 'Incomplete' || notes.includes('[Was Incomplete]') || notes.includes('inco-');

  if (wasIncomplete && newStatus !== 'Incomplete') {
    if (!notes.includes('[Was Incomplete]')) {
      return notes ? `${notes} [Was Incomplete]` : '[Was Incomplete]';
    }
  }
  return notes;
};
