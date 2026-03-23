/**
 * AUTOMATION RULES ENGINE
 * Logic for semi-autonomous order management.
 */

export const automationRules = {
  // Thresholds in hours
  Thresholds: {
    STALE_NEW: 48,
    STALE_PENDING_CALL: 72,
    STALE_CONFIRMED: 96, // Confirmed but not processed by factory
  },

  /**
   * Checks if an order is stale based on its current status and age.
   * @param {Object} order 
   * @returns {Object|null}
   */
  checkStaleStatus(order) {
    if (!order.created_at || !order.status) return null;

    const createdDate = new Date(order.created_at);
    const now = new Date();
    const ageHours = (now - createdDate) / (1000 * 60 * 60);

    // Rule 1: New orders must be processed within 48h
    if (order.status === 'New' && ageHours > this.Thresholds.STALE_NEW) {
      return {
        action: 'FLAG_STALE',
        reason: `New order is older than ${this.Thresholds.STALE_NEW} hours`,
        suggestedAction: 'Cancel or Call',
        severity: 'high'
      };
    }

    // Rule 2: Pending Call orders must be confirmed within 72h
    if (order.status === 'Pending Call' && ageHours > this.Thresholds.STALE_PENDING_CALL) {
      return {
        action: 'FLAG_STALE',
        reason: `Pending call for over ${this.Thresholds.STALE_PENDING_CALL} hours`,
        suggestedAction: 'Auto-Cancel candidate',
        severity: 'medium'
      };
    }

    // Rule 3: Confirmed but no factory progress for 96h
    if (order.status === 'Confirmed' && ageHours > this.Thresholds.STALE_CONFIRMED) {
      return {
        action: 'FLAG_STALE',
        reason: `Confirmed but stagnant for ${this.Thresholds.STALE_CONFIRMED} hours`,
        suggestedAction: 'Notify Logistics',
        severity: 'low'
      };
    }

    return null;
  },

  /**
   * Processes a list of orders and returns required automation actions.
   * @param {Array} orders 
   * @returns {Array} List of { orderId, action, reason }
   */
  evaluateOrders(orders) {
    const actions = [];
    orders.forEach(order => {
      const result = this.checkStaleStatus(order);
      if (result) {
        actions.push({
          orderId: order.id,
          ...result
        });
      }
    });
    return actions;
  },

  /**
   * Scans a full list of orders for automation flags (stale, etc.).
   * @param {Array} orders 
   * @returns {Object} { orderId: flag }
   */
  scanOrders(orders) {
    const flags = {};
    orders.forEach(order => {
      const result = this.checkStaleStatus(order);
      if (result) flags[order.id] = result;
    });
    return flags;
  }
};
