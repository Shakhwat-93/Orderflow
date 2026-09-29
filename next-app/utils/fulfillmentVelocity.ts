export interface VelocityMetrics {
  avgConfirmedToFactory: number;
  avgFactoryToCourier: number;
  totalOrdersProcessed: number;
  bottlenecks: Array<{
    stage: string;
    severity: 'high' | 'medium' | 'low';
    message: string;
  }>;
}

export const fulfillmentVelocity = {
  calculateMetrics(logs: any[] = []): VelocityMetrics | null {
    if (!logs || logs.length === 0) return null;

    const logsByOrder = logs.reduce<Record<string, any[]>>((acc, log) => {
      const orderId = String(log.order_id || log.entity_id || '');
      if (!orderId) return acc;
      if (!acc[orderId]) acc[orderId] = [];
      acc[orderId].push(log);
      return acc;
    }, {});

    const metrics: VelocityMetrics = {
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
        new Date(a.timestamp || a.created_at).getTime() - new Date(b.timestamp || b.created_at).getTime()
      );

      let confirmedTime: Date | null = null;
      let factoryTime: Date | null = null;
      let courierTime: Date | null = null;

      orderLogs.forEach(log => {
        const actionType = log.action_type || log.action || '';
        const newStatus = log.new_status || '';

        if (actionType === 'STATUS_CHANGE' || actionType === 'STATUS_UPDATE') {
          if (newStatus === 'Confirmed') {
            confirmedTime = new Date(log.timestamp || log.created_at);
          } else if (['Processing', 'Factory Processing', 'In Factory'].includes(newStatus)) {
            factoryTime = new Date(log.timestamp || log.created_at);
          } else if (['Shipped', 'Courier Ready', 'Courier Submitted'].includes(newStatus)) {
            courierTime = new Date(log.timestamp || log.created_at);
          }
        }
      });

      if (confirmedTime && factoryTime && (factoryTime as Date).getTime() > (confirmedTime as Date).getTime()) {
        totalConfirmedToFactoryTime += ((factoryTime as Date).getTime() - (confirmedTime as Date).getTime()) / (1000 * 60 * 60);
        confirmedToFactoryCount++;
      }

      if (factoryTime && courierTime && (courierTime as Date).getTime() > (factoryTime as Date).getTime()) {
        totalFactoryToCourierTime += ((courierTime as Date).getTime() - (factoryTime as Date).getTime()) / (1000 * 60 * 60);
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
