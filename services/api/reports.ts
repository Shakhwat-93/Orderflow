import { supabase, dedupPromise, formatApiError } from './client';
import type { DashboardStats, OrderFilters } from '@/types/api';

export const reportsApi = {
  /**
   * Primary Operational Dashboard Statistics
   * High performance: parallel queries + in-flight deduplication.
   * Resolves concurrent redundant calls from OrderContext and DashboardOverview.
   */
  async getDashboardStats(): Promise<DashboardStats> {
    return dedupPromise('getDashboardStats', async () => {
      try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        const todayStr = now.toDateString();

        const [
          { count: total },
          { data: recentOrders, error: ordersError },
          { data: todayConfirmLogs }
        ] = await Promise.all([
          supabase.from('orders').select('*', { count: 'exact', head: true }).neq('status', 'Test'),
          supabase
            .from('orders')
            .select('status, amount, phone, product_name, created_at, updated_at, source')
            .gte('created_at', thirtyDaysAgo.toISOString())
            .neq('status', 'Test'),
          supabase
            .from('order_activity_logs')
            .select('new_status, timestamp, action_type')
            .eq('action_type', 'STATUS_CHANGE')
            .eq('new_status', 'Confirmed')
            .gte('timestamp', todayStart.toISOString())
            .lte('timestamp', todayEnd.toISOString())
        ]);

        if (ordersError) throw ordersError;

        const orders = recentOrders || [];

        const successfulStatuses = ['Confirmed', 'Completed', 'Shipped', 'Factory Processing'];
        const completedOrders = orders.filter((o: any) => successfulStatuses.includes(o.status));

        const completed = orders.filter((o: any) => o.status === 'Completed').length;
        const confirmedCount = orders.filter((o: any) => o.status === 'Confirmed').length;
        const cancelledCount = orders.filter((o: any) => o.status === 'Cancelled').length;
        const pending = orders.filter((o: any) =>
          o.status === 'New' || o.status === 'Pending Call' || o.status === 'Final Call Pending'
        ).length;
        const processing = orders.filter((o: any) =>
          ['Processing', 'Factory Processing'].includes(o.status)
        ).length;

        const revenue = completedOrders.reduce((sum: number, o: any) => sum + Number(o.amount || 0), 0);
        const orderTotal = total || 0;
        const averageOrderValue = orderTotal > 0 ? revenue / orderTotal : 0;

        const uniquePhones = new Set(orders.map((o: any) => o.phone).filter(Boolean));
        const totalCustomers = uniquePhones.size;

        const uniqueProducts = new Set(orders.map((o: any) => o.product_name).filter(Boolean));
        const totalProducts = uniqueProducts.size;

        const addedTodayCount = orders.filter(
          (o: any) => new Date(o.created_at).toDateString() === todayStr
        ).length;

        const confirmedTodayCount =
          todayConfirmLogs && Array.isArray(todayConfirmLogs) && todayConfirmLogs.length > 0
            ? todayConfirmLogs.length
            : orders.filter(
                (o: any) =>
                  o.status === 'Confirmed' &&
                  new Date(o.updated_at || o.created_at).toDateString() === todayStr
              ).length;

        const sourceMap = orders.reduce<Record<string, number>>((acc, order: any) => {
          const src = order.source || 'Other';
          acc[src] = (acc[src] || 0) + 1;
          return acc;
        }, {});

        const sourceDistribution = Object.keys(sourceMap).map((key) => ({
          name: key,
          value: sourceMap[key],
          color:
            key === 'Website'
              ? '#7c4dff'
              : key === 'Facebook'
              ? '#2dd4bf'
              : key === 'Instagram'
              ? '#3f51b5'
              : '#94a3b8'
        }));

        const last7Days = [...Array(7)]
          .map((_, i) => {
            const d = new Date();
            d.setDate(d.getDate() - i);
            return d.toLocaleDateString(undefined, { weekday: 'short' });
          })
          .reverse();

        const trendMap = orders.reduce<Record<string, number>>((acc, order: any) => {
          const day = new Date(order.created_at).toLocaleDateString(undefined, { weekday: 'short' });
          acc[day] = (acc[day] || 0) + 1;
          return acc;
        }, {});

        const trendData = last7Days.map((day) => ({
          name: day,
          orders: trendMap[day] || 0
        }));

        const confirmationData = [
          { name: 'Confirmed', rate: orderTotal > 0 ? Math.round((confirmedCount / orderTotal) * 100) : 0 },
          { name: 'Cancelled', rate: orderTotal > 0 ? Math.round((cancelledCount / orderTotal) * 100) : 0 }
        ];

        return {
          total: orderTotal,
          completed,
          pending,
          processing,
          revenue,
          addedTodayCount,
          confirmedTodayCount,
          averageOrderValue,
          totalCustomers,
          totalProducts,
          cancelledCount,
          sourceDistribution,
          trendData,
          confirmationData
        };
      } catch (err) {
        throw formatApiError(err, 'Failed to compute dashboard statistics');
      }
    });
  },

  /**
   * Order product aggregation
   */
  async getOrderProductBreakdown(filters: OrderFilters = {}, limit = 50000) {
    try {
      const batchSize = 1000;
      const rows: any[] = [];
      let from = 0;

      while (rows.length < limit) {
        let query = supabase
          .from('orders')
          .select('product_name')
          .order('created_at', { ascending: false })
          .range(from, from + batchSize - 1);

        if (filters.status && filters.status !== 'All') {
          query = query.eq('status', filters.status);
        }
        if (filters.source && filters.source !== 'All') {
          query = query.eq('source', filters.source);
        }
        if (filters.searchTerm) {
          query = query.or(
            `id.ilike.%${filters.searchTerm}%,customer_name.ilike.%${filters.searchTerm}%,phone.ilike.%${filters.searchTerm}%`
          );
        }
        if (filters.dateRange?.start && filters.dateRange?.end) {
          const start = typeof filters.dateRange.start === 'string' ? filters.dateRange.start : filters.dateRange.start.toISOString();
          const end = typeof filters.dateRange.end === 'string' ? filters.dateRange.end : filters.dateRange.end.toISOString();
          query = query.gte('created_at', start).lte('created_at', end);
        }

        const { data, error } = await query;
        if (error) throw error;

        const batch = data || [];
        rows.push(...batch);

        if (batch.length < batchSize) break;
        from += batchSize;
      }

      const counts = new Map<string, number>();
      rows.forEach((row) => {
        const productName = String(row?.product_name || 'Unknown Product').trim() || 'Unknown Product';
        counts.set(productName, (counts.get(productName) || 0) + 1);
      });

      return Array.from(counts.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => {
          if (b.count !== a.count) return b.count - a.count;
          return a.name.localeCompare(b.name);
        });
    } catch (err) {
      throw formatApiError(err, 'Failed to fetch product breakdown');
    }
  },

  /**
   * Order status distribution - real-time exact database counts via parallel head count queries
   */
  async getOrderStatusBreakdown(filters: OrderFilters = {}) {
    try {
      const applyFilters = (baseQuery: any) => {
        let query = baseQuery;
        if (filters.source && filters.source !== 'All') {
          query = query.eq('source', filters.source);
        }
        if (filters.searchTerm) {
          query = query.or(
            `id.ilike.%${filters.searchTerm}%,customer_name.ilike.%${filters.searchTerm}%,phone.ilike.%${filters.searchTerm}%`
          );
        }
        if (filters.productName) {
          query = query.ilike('product_name', `%${filters.productName}%`);
        }
        if (filters.dateRange?.start && filters.dateRange?.end) {
          const start = typeof filters.dateRange.start === 'string' ? filters.dateRange.start : filters.dateRange.start.toISOString();
          const end = typeof filters.dateRange.end === 'string' ? filters.dateRange.end : filters.dateRange.end.toISOString();
          query = query.gte('created_at', start).lte('created_at', end);
        }
        return query;
      };

      const statuses = [
        'New',
        'Pending Call',
        'Final Call Pending',
        'Confirmed',
        'Bulk Exported',
        'Courier Ready',
        'Courier Submitted',
        'Factory Processing',
        'Completed',
        'Fake Order',
        'Cancelled',
        'Incomplete',
        'Test'
      ];

      const [allRes, ...statusResults] = await Promise.all([
        applyFilters(supabase.from('orders').select('*', { count: 'exact', head: true })),
        ...statuses.map((status) =>
          applyFilters(supabase.from('orders').select('*', { count: 'exact', head: true }).eq('status', status))
            .then((res: any) => ({ status, count: res.count || 0 }))
        )
      ]);

      return [
        { status: 'All', count: allRes.count || 0 },
        ...statusResults
      ];
    } catch (err) {
      throw formatApiError(err, 'Failed to fetch status breakdown');
    }
  },

  /**
   * User performance summary & audit
   */
  async getUserPerformanceDetails(userId: string, options: { range?: 'today' | '7d' | '30d' | 'all'; limit?: number } = {}) {
    if (!userId) throw new Error('User ID is required.');

    try {
      const range = options.range || '7d';
      const limit = options.limit || 20;

      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      let startIso: string | null = null;
      let endIso: string | null = now.toISOString();

      if (range === 'today') {
        startIso = startOfToday.toISOString();
      } else if (range === '7d') {
        const d = new Date(now);
        d.setDate(d.getDate() - 6);
        d.setHours(0, 0, 0, 0);
        startIso = d.toISOString();
      } else if (range === '30d') {
        const d = new Date(now);
        d.setDate(d.getDate() - 29);
        d.setHours(0, 0, 0, 0);
        startIso = d.toISOString();
      } else {
        endIso = null;
      }

      const { data: rawProfile, error: profileError } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (profileError) throw profileError;

      const profile = rawProfile
        ? {
            id: rawProfile.id,
            name: rawProfile.name || rawProfile.full_name || null,
            email: rawProfile.email || null,
            phone: rawProfile.phone || null,
            status: rawProfile.status,
            avatar_url: rawProfile.avatar_url || null,
            created_at: rawProfile.created_at || null,
            last_active_at: rawProfile.last_active_at || null
          }
        : null;

      let roles: string[] = [];
      try {
        const { data: rolesData } = await supabase
          .from('user_roles')
          .select('role_id, roles(name)')
          .eq('user_id', userId);

        if (Array.isArray(rolesData)) {
          roles = rolesData.map((r: any) => r?.roles?.name || r?.role_id).filter(Boolean);
        }
      } catch {
        roles = [];
      }

      let logsQuery = supabase
        .from('order_activity_logs')
        .select('*')
        .eq('changed_by_user_id', userId)
        .order('timestamp', { ascending: false });

      if (startIso) logsQuery = logsQuery.gte('timestamp', startIso);
      if (endIso) logsQuery = logsQuery.lte('timestamp', endIso);

      const { data: logs, error: logsError } = await logsQuery;
      if (logsError) throw logsError;

      const allLogs = logs || [];

      const confirmedCount = allLogs.filter(
        (l) => l.action_type === 'STATUS_CHANGE' && l.new_status === 'Confirmed'
      ).length;

      const cancelledCount = allLogs.filter(
        (l) => l.action_type === 'STATUS_CHANGE' && l.new_status === 'Cancelled'
      ).length;

      const fakeCount = allLogs.filter(
        (l) => l.action_type === 'STATUS_CHANGE' && l.new_status === 'Fake Order'
      ).length;

      const callAttemptsCount = allLogs.filter(
        (l) => l.action_type === 'UPDATE' && String(l.action_description || '').includes('call attempt')
      ).length;

      return {
        profile: profile ? { ...profile, roles } : null,
        metrics: {
          confirmedCount,
          cancelledCount,
          fakeCount,
          callAttemptsCount,
          totalActions: allLogs.length
        },
        recentActivity: allLogs.slice(0, limit)
      };
    } catch (err) {
      throw formatApiError(err, 'Failed to fetch user performance analytics');
    }
  }
};
