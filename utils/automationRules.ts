/**
 * AUTOMATION RULES ENGINE
 * Logic for semi-autonomous order management.
 */

export interface AutomationFlag {
  action: 'FLAG_STALE' | string;
  reason: string;
  suggestedAction: string;
  severity: 'high' | 'medium' | 'low';
}

export const automationRules = {
  Thresholds: {
    STALE_NEW: 48,
    STALE_PENDING_CALL: 72,
    STALE_CONFIRMED: 96,
  },

  checkStaleStatus(order: any): AutomationFlag | null {
    if (!order?.created_at || !order?.status) return null;

    const createdDate = new Date(order.created_at);
    const now = new Date();
    const ageHours = (now.getTime() - createdDate.getTime()) / (1000 * 60 * 60);

    if (order.status === 'New' && ageHours > this.Thresholds.STALE_NEW) {
      return {
        action: 'FLAG_STALE',
        reason: `New order is older than ${this.Thresholds.STALE_NEW} hours`,
        suggestedAction: 'Cancel or Call',
        severity: 'high'
      };
    }

    if (order.status === 'Pending Call' && ageHours > this.Thresholds.STALE_PENDING_CALL) {
      return {
        action: 'FLAG_STALE',
        reason: `Pending call for over ${this.Thresholds.STALE_PENDING_CALL} hours`,
        suggestedAction: 'Auto-Cancel candidate',
        severity: 'medium'
      };
    }

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

  evaluateOrders(orders: any[]): Array<{ orderId: string | number } & AutomationFlag> {
    const actions: Array<{ orderId: string | number } & AutomationFlag> = [];
    (orders || []).forEach(order => {
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

  scanOrders(orders: any[]): Record<string | number, AutomationFlag> {
    const flags: Record<string | number, AutomationFlag> = {};
    (orders || []).forEach(order => {
      const result = this.checkStaleStatus(order);
      if (result) flags[order.id] = result;
    });
    return flags;
  }
};
