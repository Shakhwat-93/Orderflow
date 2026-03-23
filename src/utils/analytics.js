/**
 * ANALYTICS UTILITY
 * Functions to transform raw order data into actionable business intelligence.
 */

export const analytics = {
  /**
   * Generates daily order volume data for the last X days.
   * @param {Array} orders 
   * @param {number} days 
   * @returns {Array} [{ name: '01 Mar', orders: 45 }]
   */
  getDailyTrend(orders, days = 7) {
    const result = [];
    const now = new Date();
    
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = date.toLocaleDateString('en-US', { day: '2-digit', month: 'short' });
      
      const count = orders.filter(o => {
        const orderDate = new Date(o.created_at);
        return orderDate.toLocaleDateString() === date.toLocaleDateString();
      }).length;
      
      result.push({ name: dateStr, orders: count });
    }
    
    return result;
  },

  /**
   * Generates order distribution by source.
   * @param {Array} orders 
   * @returns {Array} [{ name: 'Website', value: 400, color: '#7c4dff' }]
   */
  getSourceDistribution(orders) {
    const sources = {};
    const colors = {
      'Website': '#7c4dff',
      'Facebook': '#2dd4bf',
      'Instagram': '#3f51b5',
      'Other': '#94a3b8'
    };

    orders.forEach(o => {
      const s = o.source || 'Other';
      sources[s] = (sources[s] || 0) + 1;
    });

    return Object.entries(sources).map(([name, value]) => ({
      name,
      value,
      color: colors[name] || colors['Other']
    }));
  },

  /**
   * Calculates confirmation rate by day of week.
   * @param {Array} orders 
   * @returns {Array} [{ name: 'Mon', rate: 75 }]
   */
  getConfirmationRate(orders) {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const counts = {}; // { Mon: { total: 0, confirmed: 0 } }

    orders.forEach(o => {
      if (!o.created_at) return;
      const day = days[new Date(o.created_at).getDay()];
      if (!counts[day]) counts[day] = { total: 0, confirmed: 0 };
      
      counts[day].total++;
      if (['Confirmed', 'Factory Queue', 'Courier Ready', 'Shipped', 'Delivered', 'Completed'].includes(o.status)) {
        counts[day].confirmed++;
      }
    });

    return days.map(day => ({
      name: day,
      rate: counts[day] ? Math.round((counts[day].confirmed / counts[day].total) * 100) : 0
    }));
  },

  /**
   * Calculates logistics success rate (Completed vs Cancelled/Returned) by day.
   */
  getLogisticsSuccessRate(orders) {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const counts = {};

    orders.forEach(o => {
      if (!o.created_at) return;
      const day = days[new Date(o.created_at).getDay()];
      if (!counts[day]) counts[day] = { attempts: 0, success: 0 };

      // Consider orders that reached Shipped or beyond as delivery attempts
      if (['Shipped', 'Delivered', 'Completed', 'Returned'].includes(o.status)) {
        counts[day].attempts++;
        if (o.status === 'Completed' || o.status === 'Delivered') {
          counts[day].success++;
        }
      }
    });

    return days.map(day => ({
      name: day,
      rate: counts[day]?.attempts > 0 ? Math.round((counts[day].success / counts[day].attempts) * 100) : 0
    }));
  }
};
