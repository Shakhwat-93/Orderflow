
import { supabase } from '../lib/supabase';

export const fulfillmentVelocity = {
  /**
   * Calculate velocity metrics for a set of logs
   * Returns durations in hours
   */
  calculateMetrics(logs = []) {
    if (!logs || logs.length === 0) return null;

    // Group logs by order_id
    const logsByOrder = logs.reduce((acc, log) => {
      if (!acc[log.order_id]) acc[log.order_id] = [];
      acc[log.order_id].push(log);
      return acc;
    }, {});

    const metrics = {
      avgConfirmedToFactory: 0,
      avgFactoryToCourier: 0,
      totalOrdersProcessed: 0,
      bottlenecks: []
    };

    let confirmedToFactoryCount = 0;
    let factoryToCourierCount = 0;
    let totalConfirmedToFactoryTime = 0;
    let totalFactoryToCourierTime = 0;

    Object.keys(logsByOrder).forEach(orderId => {
      const orderLogs = logsByOrder[orderId].sort((a, b) => 
        new Date(a.timestamp) - new Date(b.timestamp)
      );

      let confirmedTime = null;
      let factoryTime = null;
      let courierTime = null;

      orderLogs.forEach(log => {
        if (log.action_type === 'STATUS_CHANGE') {
          if (log.new_status === 'Confirmed') {
            confirmedTime = new Date(log.timestamp);
          } else if (['Processing', 'Factory Processing', 'In Factory'].includes(log.new_status)) {
            factoryTime = new Date(log.timestamp);
          } else if (['Shipped', 'Courier Ready', 'Courier Submitted'].includes(log.new_status)) {
            courierTime = new Date(log.timestamp);
          }
        }
      });

      if (confirmedTime && factoryTime && factoryTime > confirmedTime) {
        totalConfirmedToFactoryTime += (factoryTime - confirmedTime) / (1000 * 60 * 60);
        confirmedToFactoryCount++;
      }

      if (factoryTime && courierTime && courierTime > factoryTime) {
        totalFactoryToCourierTime += (courierTime - factoryTime) / (1000 * 60 * 60);
        factoryToCourierCount++;
      }
    });

    metrics.avgConfirmedToFactory = confirmedToFactoryCount > 0 
      ? Number((totalConfirmedToFactoryTime / confirmedToFactoryCount).toFixed(2)) 
      : 0;
      
    metrics.avgFactoryToCourier = factoryToCourierCount > 0 
      ? Number((totalFactoryToCourierTime / factoryToCourierCount).toFixed(2)) 
      : 0;

    metrics.totalOrdersProcessed = Object.keys(logsByOrder).length;

    // Bottleneck logic
    if (metrics.avgConfirmedToFactory > 12) {
      metrics.bottlenecks.push({
        stage: 'Call → Factory',
        severity: 'high',
        message: 'Orders are taking over 12h to reach Factory.'
      });
    }
    if (metrics.avgFactoryToCourier > 24) {
      metrics.bottlenecks.push({
        stage: 'Factory → Courier',
        severity: 'medium',
        message: 'Factory processing is exceeding 24h.'
      });
    }

    return metrics;
  }
};
