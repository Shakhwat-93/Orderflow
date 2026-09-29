import { supabase, schemaState, normalizeIpAddress, formatApiError, dedupPromise } from './client';
import type { Order, OrderFilters, PaginatedOrders, OrderActivityLog, UserRole } from '@/types/api';

export const ordersApi = {
  /**
   * Fetch orders with server-side pagination and filtering
   */
  async getOrders(page = 1, pageSize = 10, filters: OrderFilters = {}): Promise<Order[]> {
    const { data } = await this.getOrdersWithCount(page, pageSize, filters);
    return data;
  },

  /**
   * Fetch orders and exact count in one network round-trip.
   */
  async getOrdersWithCount(page = 1, pageSize = 10, filters: OrderFilters = {}): Promise<PaginatedOrders> {
    const dedupKey = `getOrdersWithCount:${page}:${pageSize}:${JSON.stringify(filters)}`;
    return dedupPromise(dedupKey, async () => {
      try {
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;

        let query = supabase
          .from('orders')
          .select('*', { count: 'exact' })
          .order('created_at', { ascending: false })
          .range(from, to);

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
        if (filters.productName) {
          query = query.ilike('product_name', `%${filters.productName}%`);
        }
        if (filters.dateRange?.start && filters.dateRange?.end) {
          const startIso = typeof filters.dateRange.start === 'string'
            ? filters.dateRange.start
            : filters.dateRange.start.toISOString();
          const endIso = typeof filters.dateRange.end === 'string'
            ? filters.dateRange.end
            : filters.dateRange.end.toISOString();
          query = query.gte('created_at', startIso).lte('created_at', endIso);
        }

        const { data, error, count } = await query;
        if (error) throw error;
        schemaState.inferOrderModernColumnsState(data || []);
        return { data: (data as Order[]) || [], count: count || 0 };
      } catch (err) {
        throw formatApiError(err, 'Failed to fetch orders list');
      }
    });
  },

  /**
   * Get total order count for pagination (optionally filtered)
   */
  async getOrdersCount(filters: OrderFilters = {}): Promise<number> {
    try {
      let query = supabase
        .from('orders')
        .select('*', { count: 'exact', head: true });

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
      if (filters.productName) {
        query = query.ilike('product_name', `%${filters.productName}%`);
      }
      if (filters.dateRange?.start && filters.dateRange?.end) {
        const startIso = typeof filters.dateRange.start === 'string'
          ? filters.dateRange.start
          : filters.dateRange.start.toISOString();
        const endIso = typeof filters.dateRange.end === 'string'
          ? filters.dateRange.end
          : filters.dateRange.end.toISOString();
        query = query.gte('created_at', startIso).lte('created_at', endIso);
      }

      const { count, error } = await query;
      if (error) throw error;
      return count || 0;
    } catch (err) {
      throw formatApiError(err, 'Failed to retrieve order count');
    }
  },

  /**
   * Fetch single order by its ID
   */
  async getOrderById(orderId: string | number): Promise<Order | null> {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .maybeSingle();

      if (error) throw error;
      if (data) schemaState.inferOrderModernColumnsState([data]);
      return (data as Order) || null;
    } catch (err) {
      throw formatApiError(err, `Failed to fetch order #${orderId}`);
    }
  },

  /**
   * Create new order
   * Roles: Admin, Moderator
   */
  async createOrder(
    orderData: Partial<Order> & Record<string, any>,
    userId?: string,
    userName = 'System',
    userRoles: UserRole[] = []
  ): Promise<Order> {
    const hasPermission = userRoles.some((r) => ['Admin', 'Moderator'].includes(r));
    if (!hasPermission) {
      throw new Error('Unauthorized: Only Admin or Moderator can create orders.');
    }

    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const orderId = orderData.id || `ORD-${randomSuffix}`;

    const isTestOrder =
      orderData.customer_name &&
      String(orderData.customer_name).toLowerCase().includes('test');
    const status = isTestOrder ? 'Test' : orderData.status || 'New';

    const payload: Record<string, any> = {
      id: orderId,
      customer_name: orderData.customer_name,
      phone: orderData.phone,
      address: orderData.address,
      shipping_zone: orderData.shipping_zone || 'Outside Dhaka',
      product_name: orderData.product_name || orderData.product,
      size: orderData.size,
      quantity: parseInt(String(orderData.quantity || 1), 10),
      source: orderData.source,
      amount: parseFloat(String(orderData.amount || 0)),
      status: status,
      notes: orderData.notes,
      created_by: userId,
      ordered_items: orderData.ordered_items || []
    };

    let writePayload = schemaState.attachOrderModernFields(payload, orderData);

    let { data, error } = await supabase
      .from('orders')
      .insert([writePayload])
      .select()
      .single();

    if (error && schemaState.hasUnsupportedOrderModernColumns(error)) {
      schemaState.orderModernColumnsState = false;
      writePayload = schemaState.stripUnsupportedOrderModernFields(payload);
      ({ data, error } = await supabase
        .from('orders')
        .insert([writePayload])
        .select()
        .single());
    } else if (!error && schemaState.orderModernColumnsState == null) {
      schemaState.orderModernColumnsState = true;
    }

    if (error) {
      throw formatApiError(error, 'Failed to create order');
    }

    // Side-effects: Non-blocking audit log & notification
    try {
      await this.logActivity({
        order_id: data.id,
        action_type: 'CREATE',
        new_status: 'New',
        changed_by_user_id: userId,
        changed_by_user_name: userName,
        action_description: `${userName} created a new order #${data.id}`
      });
    } catch (logErr) {
      console.error('Order creation log failed:', logErr);
    }

    return data as Order;
  },

  /**
   * Update order details
   * Roles: Admin, Moderator
   */
  async updateOrder(
    orderId: string | number,
    updatedData: Partial<Order> & Record<string, any>,
    userId?: string,
    userName = 'System',
    userRoles: UserRole[] = []
  ): Promise<Order> {
    const hasPermission = userRoles.some((r) => ['Admin', 'Moderator'].includes(r));
    if (!hasPermission) {
      throw new Error('Unauthorized: Only Admin or Moderator can update orders.');
    }

    const { data: oldOrder } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (oldOrder) schemaState.inferOrderModernColumnsState([oldOrder]);

    const normalizedUpdates: Record<string, any> = { ...updatedData };

    if (
      oldOrder?.status === 'Incomplete' &&
      normalizedUpdates.status &&
      normalizedUpdates.status !== 'Incomplete'
    ) {
      const currentNotes = String(normalizedUpdates.notes ?? oldOrder?.notes ?? '').trim();
      if (!currentNotes.includes('[Was Incomplete]')) {
        normalizedUpdates.notes = currentNotes
          ? `${currentNotes} [Was Incomplete]`
          : '[Was Incomplete]';
      }
    }

    if (Object.prototype.hasOwnProperty.call(updatedData, 'delivery_charge')) {
      normalizedUpdates.delivery_charge = Number(updatedData.delivery_charge) || 0;
    }

    // Preserve line items into actual database column ordered_items and strip virtual fields
    if (normalizedUpdates.order_lines_payload && !normalizedUpdates.ordered_items) {
      normalizedUpdates.ordered_items = normalizedUpdates.order_lines_payload;
    }
    delete normalizedUpdates.order_lines_payload;
    delete normalizedUpdates.pricing_summary;
    delete normalizedUpdates.order_lines;
    delete normalizedUpdates.lines;

    let writeUpdates =
      schemaState.orderModernColumnsState === false
        ? schemaState.stripUnsupportedOrderModernFields(normalizedUpdates)
        : normalizedUpdates;

    let { data, error } = await supabase
      .from('orders')
      .update(writeUpdates)
      .eq('id', orderId)
      .select()
      .single();

    if (error && (schemaState.hasUnsupportedOrderModernColumns(error) || schemaState.isMissingColumnError(error))) {
      schemaState.orderModernColumnsState = false;
      const missingCol = schemaState.extractMissingColumn(error);
      if (missingCol && missingCol in writeUpdates) {
        delete writeUpdates[missingCol];
      }
      writeUpdates = schemaState.stripUnsupportedOrderModernFields(writeUpdates);
      ({ data, error } = await supabase
        .from('orders')
        .update(writeUpdates)
        .eq('id', orderId)
        .select()
        .single());
    } else if (!error && schemaState.orderModernColumnsState == null) {
      schemaState.orderModernColumnsState = true;
    }

    if (error) {
      throw formatApiError(error, `Failed to update order #${orderId}`);
    }

    // Log the update
    try {
      await this.logActivity({
        order_id: orderId,
        action_type: 'UPDATE',
        changed_by_user_id: userId,
        changed_by_user_name: userName,
        action_description: `${userName} updated the details for order #${orderId}`
      });
    } catch (logErr) {
      console.error('Order update log error:', logErr);
    }

    return data as Order;
  },

  /**
   * Change order status with role verification and audit logging
   */
  async changeOrderStatus(
    orderId: string | number,
    newStatus: string,
    userId?: string,
    userName = 'System',
    userRoles: UserRole[] = [],
    noteText = ''
  ): Promise<Order> {
    const permissions: Record<string, string[]> = {
      Confirmed: ['Admin', 'Call Team'],
      Cancelled: ['Admin', 'Call Team'],
      'Fake Order': ['Admin', 'Call Team'],
      'Final Call Pending': ['Admin', 'Call Team', 'Moderator'],
      Incomplete: ['Admin', 'Call Team', 'Moderator'],
      'Bulk Exported': ['Admin', 'Factory Team', 'Courier Team'],
      'Courier Ready': ['Admin', 'Factory Team'],
      'Factory Queue': ['Admin', 'Factory Team'],
      Processing: ['Admin', 'Factory Team'],
      'Factory Processing': ['Admin', 'Factory Team'],
      Completed: ['Admin', 'Factory Team'],
      Shipped: ['Admin', 'Courier Team'],
      'Courier Submitted': ['Admin', 'Courier Team']
    };

    const allowedRoles = permissions[newStatus] || ['Admin'];
    const hasPermission = userRoles.some((r) => allowedRoles.includes(r));

    if (!hasPermission) {
      throw new Error(`Unauthorized: Your roles do not allow setting status to "${newStatus}"`);
    }

    const { data: oldData, error: fetchErr } = await supabase
      .from('orders')
      .select('status, notes, first_call_time, ip_address, customer_name, phone')
      .eq('id', orderId)
      .single();

    if (fetchErr) {
      throw formatApiError(fetchErr, `Could not locate order #${orderId}`);
    }

    const updatePayload: Record<string, any> = {
      status: newStatus,
      updated_at: new Date().toISOString()
    };

    if (
      !oldData?.first_call_time &&
      ['Confirmed', 'Cancelled', 'Fake Order'].includes(newStatus)
    ) {
      updatePayload.first_call_time = new Date().toISOString();
    }

    if (oldData?.status === 'Incomplete' && newStatus !== 'Incomplete') {
      const currentNotes = String(oldData?.notes || '').trim();
      if (!currentNotes.includes('[Was Incomplete]')) {
        updatePayload.notes = currentNotes ? `${currentNotes} [Was Incomplete]` : '[Was Incomplete]';
      }
    }

    // Merge noteText directly into single atomic update payload
    const cleanNote = String(noteText || '').trim();
    if (cleanNote) {
      const noteEntry = this.formatOrderNoteEntry(cleanNote, newStatus, userName);
      if (noteEntry) {
        updatePayload.notes = this.mergeOrderNotes(updatePayload.notes ?? oldData?.notes, noteEntry);
      }
    }

    const { data, error } = await supabase
      .from('orders')
      .update(updatePayload)
      .eq('id', orderId)
      .select()
      .single();

    if (error) {
      throw formatApiError(error, `Failed to update status for order #${orderId}`);
    }

    // Side-effects: Non-blocking audit log
    this.logActivity({
      order_id: orderId,
      action_type: 'STATUS_CHANGE',
      previous_status: oldData?.status,
      new_status: newStatus,
      changed_by_user_id: userId,
      changed_by_user_name: userName,
      action_description: `${userName} changed status of #${orderId} to ${newStatus}${cleanNote ? ` - Note: ${cleanNote}` : ''}`
    }).catch((logErr) => console.warn('Status change activity log non-fatal error:', logErr));

    const resultData = data as Order;

    // Auto-block IP on Fake Order if IP is present
    if (newStatus === 'Fake Order') {
      const ipAddress = normalizeIpAddress(data?.ip_address || oldData?.ip_address);
      if (ipAddress) {
        try {
          await supabase.from('blocked_ip_addresses').upsert({
            ip_address: ipAddress,
            reason: `Auto-blocked due to Fake Order #${orderId}${noteText ? `: ${noteText}` : ''}`,
            blocked_by: userId || null,
            created_at: new Date().toISOString()
          });
        } catch (blockErr) {
          console.warn('Auto IP block non-fatal error:', blockErr);
        }
      }
    }

    return resultData;
  },

  /**
   * Notes formatting & merging
   */
  formatOrderNoteEntry(
    noteText: string,
    actionLabel = 'Note',
    userName = 'System',
    timestamp = new Date().toISOString()
  ): string {
    const cleanNote = String(noteText || '').trim();
    if (!cleanNote) return '';

    const stamp = new Date(timestamp).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    return `[${stamp}] ${userName} - ${actionLabel}\n${cleanNote}`;
  },

  mergeOrderNotes(existingNotes: string | null | undefined, nextEntry: string): string {
    const cleanExisting = String(existingNotes || '').trim();
    const cleanNext = String(nextEntry || '').trim();
    if (!cleanExisting) return cleanNext;
    if (!cleanNext) return cleanExisting;
    return `${cleanExisting}\n\n${cleanNext}`;
  },

  async appendOrderNote(
    orderId: string | number,
    noteText: string,
    userId?: string,
    userName = 'System',
    userRoles: UserRole[] = [],
    actionLabel = 'Note',
    existingNotes: string | null = null,
    skipActivityLog = false
  ): Promise<Order | null> {
    const hasPermission = userRoles.length === 0 || userRoles.some((r) =>
      ['Admin', 'Call Team', 'Moderator'].includes(r)
    );
    if (!hasPermission) {
      throw new Error('Unauthorized: You do not have permission to add order notes.');
    }

    const cleanNote = String(noteText || '').trim();
    const entry = this.formatOrderNoteEntry(cleanNote, actionLabel, userName);
    if (!entry) return null;

    let currentNotes = existingNotes;
    if (currentNotes == null) {
      const { data: currentOrder, error: fetchErr } = await supabase
        .from('orders')
        .select('notes')
        .eq('id', orderId)
        .single();
      if (fetchErr) throw formatApiError(fetchErr);
      currentNotes = currentOrder?.notes || '';
    }

    const mergedNotes = this.mergeOrderNotes(currentNotes, entry);

    const { data, error } = await supabase
      .from('orders')
      .update({ notes: mergedNotes, updated_at: new Date().toISOString() })
      .eq('id', orderId)
      .select()
      .single();

    if (error) {
      throw formatApiError(error, 'Failed to append note');
    }

    if (!skipActivityLog) {
      await this.logActivity({
        order_id: orderId,
        action_type: 'NOTE',
        changed_by_user_id: userId,
        changed_by_user_name: userName,
        action_description: `${userName} added a note on order #${orderId}`
      });
    }

    return data as Order;
  },

  /**
   * Add tracking ID from courier
   */
  async addTrackingID(
    orderId: string | number,
    trackingId: string,
    courierName = 'Steadfast',
    userId?: string,
    userName = 'System',
    userRoles: UserRole[] = []
  ): Promise<Order> {
    const hasPermission = userRoles.some((r) => ['Admin', 'Courier Team'].includes(r));
    if (!hasPermission) {
      throw new Error('Unauthorized: Only Admin or Courier Team can attach tracking IDs.');
    }

    const { data, error } = await supabase
      .from('orders')
      .update({
        tracking_id: trackingId,
        courier_name: courierName,
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId)
      .select()
      .single();

    if (error) {
      throw formatApiError(error, 'Failed to update tracking ID');
    }

    await this.logActivity({
      order_id: orderId,
      action_type: 'TRACKING_ADDED',
      changed_by_user_id: userId,
      changed_by_user_name: userName,
      action_description: `${userName} set tracking ID "${trackingId}" (${courierName}) for #${orderId}`
    });

    return data as Order;
  },

  /**
   * Activity log actions
   */
  async logActivity(logData: Partial<OrderActivityLog>): Promise<void> {
    try {
      const payload = {
        ...logData,
        timestamp: logData.timestamp || new Date().toISOString()
      };
      const { error } = await supabase.from('order_activity_logs').insert([payload]);
      if (error) console.warn('Order activity log warning:', error.message);
    } catch (e) {
      console.warn('logActivity non-fatal error:', e);
    }
  },

  async getRecentActivity(limit = 50): Promise<OrderActivityLog[]> {
    return dedupPromise(`getRecentActivity:${limit}`, async () => {
      const { data, error } = await supabase
        .from('order_activity_logs')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(limit);

      if (error) throw formatApiError(error, 'Failed to retrieve recent activity');
      return (data as OrderActivityLog[]) || [];
    });
  },

  async getOrderActivity(orderId: string | number): Promise<OrderActivityLog[]> {
    const { data, error } = await supabase
      .from('order_activity_logs')
      .select('*')
      .eq('order_id', orderId)
      .order('timestamp', { ascending: false });

    if (error) throw formatApiError(error, `Failed to retrieve activity for order #${orderId}`);
    return (data as OrderActivityLog[]) || [];
  }
};
