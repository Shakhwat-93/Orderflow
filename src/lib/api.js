import { supabase } from './supabase';

/**
 * SECURE API SERVICE LAYER
 * Centralized functions for database interactions with permission checks.
 */

// --- Order Management ---

export const api = {
  /**
   * Fetch orders with server-side pagination and filtering
   */
  async getOrders(page = 1, pageSize = 10, filters = {}) {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false })
      .range(from, to);

    if (filters.status && filters.status !== 'All') {
      query = query.eq('status', filters.status);
    }
    if (filters.source && filters.source !== 'All') {
      query = query.eq('source', filters.source);
    }
    if (filters.searchTerm) {
      // Simple text search on ID, customer_name or phone
      query = query.or(`id.ilike.%${filters.searchTerm}%,customer_name.ilike.%${filters.searchTerm}%,phone.ilike.%${filters.searchTerm}%`);
    }
    if (filters.productName) {
      query = query.ilike('product_name', `%${filters.productName}%`);
    }
    if (filters.dateRange?.start && filters.dateRange?.end) {
      query = query.gte('created_at', filters.dateRange.start.toISOString())
        .lte('created_at', filters.dateRange.end.toISOString());
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  /**
   * Get total order count for pagination (optionally filtered)
   */
  async getOrdersCount(filters = {}) {
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
      query = query.or(`id.ilike.%${filters.searchTerm}%,customer_name.ilike.%${filters.searchTerm}%,phone.ilike.%${filters.searchTerm}%`);
    }
    if (filters.productName) {
      query = query.ilike('product_name', `%${filters.productName}%`);
    }
    if (filters.dateRange?.start && filters.dateRange?.end) {
      query = query.gte('created_at', filters.dateRange.start.toISOString())
        .lte('created_at', filters.dateRange.end.toISOString());
    }

    const { count, error } = await query;
    if (error) throw error;
    return count || 0;
  },



  /**
   * Create a new order
   * Roles: Admin, Moderator
   */
  async createOrder(orderData, userId, userName, userRoles = []) {
    const hasPermission = userRoles.some(r => ['Admin', 'Moderator'].includes(r));
    if (!hasPermission) throw new Error('Unauthorized: Only Admin or Moderator can create orders.');


    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const orderId = `ORD-${randomSuffix}`;

    const payload = {
      id: orderId,
      customer_name: orderData.customer_name,
      phone: orderData.phone,
      address: orderData.address,
      product_name: orderData.product_name || orderData.product,
      size: orderData.size,
      quantity: parseInt(orderData.quantity || 1),
      source: orderData.source,
      amount: parseFloat(orderData.amount) || 0,
      status: 'New',
      notes: orderData.notes,
      created_by: userId,
      ordered_items: orderData.ordered_items || []
    };

    const { data, error } = await supabase
      .from('orders')
      .insert([payload])
      .select()
      .single();

    if (error) throw error;

    // Side effects should never fail order creation UX
    try {
      await this.logActivity({
        order_id: data.id,
        action_type: 'CREATE',
        new_status: 'New',
        changed_by_user_id: userId,
        changed_by_user_name: userName,
        action_description: `${userName} created a new order #${data.id}`
      });
    } catch (sideEffectError) {
      console.error('Order creation log failed:', sideEffectError);
    }

    try {
      await this.createNotification({
        type: 'ORDER_CREATED',
        title: 'New Order Received',
        message: `Order #${data.id} for ${data.customer_name} has been placed via ${data.source}.`,
        data: { orderId: data.id, customer: data.customer_name },
        actor_name: userName
      });
    } catch (sideEffectError) {
      console.error('Order creation notification failed:', sideEffectError);
    }

    return data;
  },


  /**
   * Update order details
   * Roles: Admin, Moderator
   */
  async updateOrder(orderId, updatedData, userId, userName, userRoles = []) {
    const hasPermission = userRoles.some(r => ['Admin', 'Moderator'].includes(r));
    if (!hasPermission) throw new Error('Unauthorized: Only Admin or Moderator can update orders.');


    // Get old data for better notification diff
    const { data: oldOrder } = await supabase.from('orders').select('*').eq('id', orderId).single();

    const { data, error } = await supabase
      .from('orders')
      .update(updatedData)
      .eq('id', orderId)
      .select()
      .single();

    if (error) throw error;

    // Determine what changed for notification
    let changeMsg = `Order #${orderId} was updated by ${userName}.`;
    const changes = [];
    if (oldOrder && updatedData) {
      if (updatedData.amount !== undefined && Number(updatedData.amount) !== Number(oldOrder.amount)) {
        changes.push(`Amount: ৳${oldOrder.amount} → ৳${updatedData.amount}`);
      }
      if (updatedData.customer_name && updatedData.customer_name !== oldOrder.customer_name) {
        changes.push(`Name: ${oldOrder.customer_name} → ${updatedData.customer_name}`);
      }
      if (updatedData.address && updatedData.address !== oldOrder.address) {
        changes.push(`Address updated`);
      }
      if (updatedData.phone && updatedData.phone !== oldOrder.phone) {
        changes.push(`Phone updated`);
      }
    }

    if (changes.length > 0) {
      changeMsg = `Order #${orderId} updated by ${userName}: ${changes.join(', ')}`;
    }

    // Log the update
    await this.logActivity({
      order_id: orderId,
      action_type: 'UPDATE',
      changed_by_user_id: userId,
      changed_by_user_name: userName,
      action_description: `${userName} updated the details for order #${orderId}`
    });

    // Notify
    await this.createNotification({
      type: 'ORDER_UPDATED',
      title: 'Order Details Modified',
      message: changeMsg,
      data: { orderId, changes },
      actor_name: userName
    });

    return data;
  },


  /**
   * Change order status
   * Roles: Specific per status
   */
  async changeOrderStatus(orderId, newStatus, userId, userName, userRoles = []) {
    const isAdmin = userRoles.includes('Admin');


    // Permission Mapping
    const permissions = {
      'Confirmed': ['Admin', 'Call Team'],
      'Cancelled': ['Admin', 'Call Team'],
      'Processing': ['Admin', 'Factory Team'],
      'Completed': ['Admin', 'Factory Team'],
      'Shipped': ['Admin', 'Courier Team']
    };

    const allowedRoles = permissions[newStatus] || ['Admin'];
    const hasPermission = userRoles.some(r => allowedRoles.includes(r));

    if (!hasPermission) {
      throw new Error(`Unauthorized: Your roles do not allow setting status to "${newStatus}"`);
    }

    // Get old status first for logging
    const { data: oldData } = await supabase.from('orders').select('status').eq('id', orderId).single();

    const { data, error } = await supabase
      .from('orders')
      .update({ status: newStatus })
      .eq('id', orderId)
      .select()
      .single();

    if (error) throw error;

    // Log status change
    await this.logActivity({
      order_id: orderId,
      action_type: 'STATUS_CHANGE',
      old_status: oldData?.status,
      new_status: newStatus,
      changed_by_user_id: userId,
      changed_by_user_name: userName,
      action_description: `${userName} changed the status of order #${orderId} to ${newStatus}`
    });

    // Notify
    await this.createNotification({
      type: 'STATUS_CHANGE',
      title: 'Order Status Updated',
      message: `Order #${orderId} changed from "${oldData?.status || 'N/A'}" to "${newStatus}".`,
      data: { orderId, oldStatus: oldData?.status, newStatus },
      actor_name: userName
    });

    return data;
  },


  /**
   * Add Tracking ID
   * Roles: Admin, Courier Team
   */
  async addTrackingID(orderId, trackingId, userId, userName, userRoles = []) {
    const hasPermission = userRoles.some(r => ['Admin', 'Courier Team'].includes(r));
    if (!hasPermission) throw new Error('Unauthorized: Only Admin or Courier Team can add tracking IDs.');


    const { data, error } = await supabase
      .from('orders')
      .update({ tracking_id: trackingId })
      .eq('id', orderId)
      .select()
      .single();

    if (error) throw error;

    // Log tracking update
    await this.logActivity({
      order_id: orderId,
      action_type: 'TRACKING_UPDATE',
      changed_by_user_id: userId,
      changed_by_user_name: userName,
      action_description: `${userName} added tracking ID: ${trackingId} to order #${orderId}`
    });

    // Notify
    await this.createNotification({
      type: 'TRACKING_ADDED',
      title: 'Tracking ID Added',
      message: `Tracking #${trackingId} added to Order #${orderId}.`,
      data: { orderId, trackingId },
      actor_name: userName
    });

    return data;
  },

  /**
   * Helper to log activity
   */
  async logActivity(logData) {
    const { error } = await supabase
      .from('order_activity_logs')
      .insert([logData]);
    if (error) console.error('Logging error:', error);
  },

  /**
   * Fetch recent activity logs
   */
  async getRecentActivity(limit = 20) {
    const { data, error } = await supabase
      .from('order_activity_logs')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data;
  },


  /**
   * Get dashboard statistics
   */
  async getDashboardStats() {
    const { data: orders, error } = await supabase.from('orders').select('*');

    if (error) throw error;

    const total = orders.length;
    const successfulStatuses = ['Confirmed', 'Completed', 'Shipped', 'Factory Processing'];
    const completedOrders = orders.filter(o => successfulStatuses.includes(o.status));
    const completed = orders.filter(o => o.status === 'Completed').length;
    const confirmedCount = orders.filter(o => o.status === 'Confirmed').length;
    const cancelledCount = orders.filter(o => o.status === 'Cancelled').length;
    const pending = orders.filter(o => o.status === 'New' || o.status === 'Pending Call').length;
    const processing = orders.filter(o => ['Processing', 'Factory Processing'].includes(o.status)).length;

    // Revenue & AOV
    const revenue = completedOrders.reduce((sum, o) => sum + Number(o.amount || 0), 0);
    const averageOrderValue = total > 0 ? revenue / total : 0;

    // Customers & Products
    const uniquePhones = new Set(orders.map(o => o.phone).filter(Boolean));
    const totalCustomers = uniquePhones.size;

    const uniqueProducts = new Set(orders.map(o => o.product_name).filter(Boolean));
    const totalProducts = uniqueProducts.size;

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const todayStr = now.toDateString();
    const addedTodayCount = orders.filter(o => new Date(o.created_at).toDateString() === todayStr).length;

    const { data: todayConfirmLogs } = await supabase
      .from('order_activity_logs')
      .select('new_status,timestamp,action_type')
      .eq('action_type', 'STATUS_CHANGE')
      .eq('new_status', 'Confirmed')
      .gte('timestamp', todayStart.toISOString())
      .lte('timestamp', todayEnd.toISOString());

    const confirmedTodayCount =
      (todayConfirmLogs && Array.isArray(todayConfirmLogs) && todayConfirmLogs.length > 0)
        ? todayConfirmLogs.length
        : orders.filter(o =>
          o.status === 'Confirmed' &&
          new Date(o.updated_at || o.created_at).toDateString() === todayStr
        ).length;

    // Rich Data Calculations
    const sourceMap = orders.reduce((acc, order) => {
      const src = order.source || 'Other';
      acc[src] = (acc[src] || 0) + 1;
      return acc;
    }, {});

    const sourceDistribution = Object.keys(sourceMap).map(key => ({
      name: key,
      value: sourceMap[key],
      color: key === 'Website' ? '#7c4dff' : key === 'Facebook' ? '#2dd4bf' : key === 'Instagram' ? '#3f51b5' : '#94a3b8'
    }));

    const last7Days = [...Array(7)].map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      return d.toLocaleDateString(undefined, { weekday: 'short' });
    }).reverse();

    const trendMap = orders.reduce((acc, order) => {
      const day = new Date(order.created_at).toLocaleDateString(undefined, { weekday: 'short' });
      acc[day] = (acc[day] || 0) + 1;
      return acc;
    }, {});

    const trendData = last7Days.map(day => ({
      name: day,
      orders: trendMap[day] || 0
    }));

    const confirmationData = [
      { name: 'Confirmed', rate: total > 0 ? Math.round((confirmedCount / total) * 100) : 0 },
      { name: 'Cancelled', rate: total > 0 ? Math.round((cancelledCount / total) * 100) : 0 }
    ];

    const result = {
      total, completed, pending, processing, revenue, addedTodayCount, confirmedTodayCount,
      averageOrderValue, totalCustomers, totalProducts, cancelledCount,
      sourceDistribution, trendData, confirmationData
    };

    return result;
  },




  // --- User Management (Admin Only) ---

  async adminCreateUser(userData) {
    const { data, error } = await supabase.functions.invoke('create-user-admin', {
      body: userData
    });

    console.log("DEBUG: AdminCreateUser Response", { data, error });

    // If Supabase client returned an error (likely network or function crash)
    if (error) throw error;

    // Handle our custom success flag
    if (data?.success === false) {
      console.error("DEBUG: Function Error Body", data);
      throw new Error(data.error || 'Unknown function error');
    }

    return data;
  },

  async getUsers() {
    const { data, error } = await supabase
      .from('users')
      .select(`
        id,
        email,
        full_name,
        is_active,
        created_at,
        user_roles (
          role_id,
          roles (
            name
          )
        )
      `);
    if (error) throw error;

    // Flatten roles for easier consumption
    return data.map(user => ({
      ...user,
      roles: user.user_roles.map(ur => ur.roles.name)
    }));
  },

  /**
   * Create a new user (Admin Only)
   */
  async createUser(userData, isAdmin) {
    if (!isAdmin) throw new Error('Unauthorized: Only Admins can create users.');

    // We use common logic for user creation via public table triggers or manual insert
    // Note: auth creation usually happens via supabase.auth.signUp or a custom edge function
    // For this app, we've been inserting into the 'users' table.
    const { data, error } = await supabase
      .from('users')
      .insert([userData])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Update user roles (Admin Only)
   */
  async updateUserRoles(userId, roleIds, isAdmin) {
    if (!isAdmin) throw new Error('Unauthorized: Only Admins can modify roles.');

    // Remove existing
    await supabase.from('user_roles').delete().eq('user_id', userId);

    // Add new
    const inserts = roleIds.map(role_id => ({ user_id: userId, role_id }));
    const { error } = await supabase.from('user_roles').insert(inserts);

    if (error) throw error;
  },

  /**
   * Update user status/profile (Admin Only if not self)
   */
  async updateUserProfile(userId, updates, isAdminOrSelf) {
    if (!isAdminOrSelf) throw new Error('Unauthorized.');

    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();

    if (error) throw error;
  },

  /**
   * Delete user (Admin Only)
   */
  async deleteUser(userId, isAdmin) {
    if (!isAdmin) throw new Error('Unauthorized: Only Admins can delete users.');

    // Delete roles first
    await supabase.from('user_roles').delete().eq('user_id', userId);

    // Delete profile
    const { error } = await supabase
      .from('users')
      .delete()
      .eq('id', userId);

    if (error) throw error;
  },

  // --- Inventory Management ---

  /**
   * Fetch all inventory items
   */
  async getInventory(filters = {}) {
    let query = supabase.from('inventory').select('*').order('name');

    if (filters.category && filters.category !== 'All') {
      query = query.eq('category', filters.category);
    }
    if (filters.searchTerm) {
      query = query.or(`name.ilike.%${filters.searchTerm}%,sku.ilike.%${filters.searchTerm}%`);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  /**
   * Create new product in inventory
   */
  async createInventoryItem(itemData) {
    const { data, error } = await supabase
      .from('inventory')
      .insert([itemData])
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  /**
   * Update product details
   */
  async updateInventoryItem(id, updates) {
    const { data, error } = await supabase
      .from('inventory')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  /**
   * Adjust stock levels directly
   */
  async adjustStock(id, quantityChange) {
    // We use a RPC or fetch-then-update since Supabase doesn't have an atomic increment in JS directly without RPC
    // But for simplicity in this MVP, we'll fetch and update
    const { data: item, error: fetchError } = await supabase
      .from('inventory')
      .select('current_stock')
      .eq('id', id)
      .single();

    if (fetchError) throw fetchError;

    const newStock = (item.current_stock || 0) + quantityChange;

    const { data, error } = await supabase
      .from('inventory')
      .update({ current_stock: newStock })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Delete product from inventory
   */
  async deleteInventoryItem(id) {
    const { error } = await supabase
      .from('inventory')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  /**
   * Sync stock for a specific product based on name
   * Call this when an order is confirmed to deduct stock
   */
  async deductStockByProductName(productName, quantity = 1) {
    const { data: items, error: fetchError } = await supabase
      .from('inventory')
      .select('id, current_stock')
      .eq('name', productName)
      .limit(1);

    if (fetchError) throw fetchError;
    if (!items || items.length === 0) return null;

    const item = items[0];
    const newStock = Math.max(0, (item.current_stock || 0) - quantity);

    const { data, error } = await supabase
      .from('inventory')
      .update({ current_stock: newStock })
      .eq('id', item.id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // --- Notification Management ---

  /**
   * Fetch latest notifications for the admin
   */
  async getNotifications(limit = 20) {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data;
  },

  /**
   * Mark a single notification as read
   */
  async markNotificationRead(id) {
    const { data, error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Mark all notifications as read
   */
  async markAllNotificationsRead() {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('is_read', false);

    if (error) throw error;
  },

  /**
   * Delete all notifications permanently
   */
  async deleteAllNotifications() {
    const { error } = await supabase
      .from('notifications')
      .delete()
      .not('id', 'is', null); // The most robust "delete all" filter for Supabase

    if (error) throw error;
  },

  /**
   * Internal helper to create a notification
   */
  async createNotification(notifData) {
    const { data, error } = await supabase
      .from('notifications')
      .insert([notifData])
      .select()
      .single();

    if (error) throw error;

    // Emit broadcast for real-time popups
    try {
      await supabase
        .channel('admin_notifications_realtime')
        .send({
          type: 'broadcast',
          event: 'new_notification',
          payload: data
        });
    } catch (broadcastError) {
      console.error('Real-time broadcast failed:', broadcastError);
    }

    return data;
  },

  // --- Toy Box Management ---

  /**
   * Fetch all toy box inventory
   */
  async getToyBoxInventory() {
    const { data, error } = await supabase
      .from('toy_box_inventory')
      .select('*')
      .order('toy_box_number', { ascending: true });

    if (error) throw error;
    return data;
  },

  /**
   * Update stock for a specific toy box
   */
  async updateToyBoxStock(id, newStock) {
    const { data, error } = await supabase
      .from('toy_box_inventory')
      .update({ stock_quantity: newStock, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Run the automatic distribution engine
   */
  async runAutoDistribution() {
    const { data, error } = await supabase
      .rpc('auto_distribute_orders');

    if (error) throw error;
    return data;
  },

  /**
   * FULL / SCOPED SYSTEM RESET (Admin Only)
   * scope: 'all' | 'date-range'
   * dateRange: { start: Date|string, end: Date|string }
   */
  async resetSystem(isAdmin, options = {}) {
    if (!isAdmin) throw new Error('Unauthorized: Only Admins can reset the system.');

    const scope = options.scope || 'all';

    if (scope === 'date-range') {
      const startInput = options?.dateRange?.start;
      const endInput = options?.dateRange?.end;

      if (!startInput || !endInput) {
        throw new Error('Start and end dates are required for date-range reset.');
      }

      const start = new Date(startInput);
      const end = new Date(endInput);

      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        throw new Error('Invalid date range.');
      }

      if (start > end) {
        throw new Error('Start date must be before end date.');
      }

      // make end inclusive for the full day
      end.setHours(23, 59, 59, 999);

      const startIso = start.toISOString();
      const endIso = end.toISOString();

      // Orders by created_at
      const { error: ordersErr } = await supabase
        .from('orders')
        .delete()
        .gte('created_at', startIso)
        .lte('created_at', endIso);
      if (ordersErr) throw ordersErr;

      // Activity logs by timestamp
      const { error: logsErr } = await supabase
        .from('order_activity_logs')
        .delete()
        .gte('timestamp', startIso)
        .lte('timestamp', endIso);
      if (logsErr) throw logsErr;

      // Notifications by created_at
      const { error: notificationsErr } = await supabase
        .from('notifications')
        .delete()
        .gte('created_at', startIso)
        .lte('created_at', endIso);
      if (notificationsErr) throw notificationsErr;

      return {
        success: true,
        scope: 'date-range',
        range: { start: startIso, end: endIso }
      };
    }

    // 1. Clear Transactional Tables
    const tablesToClear = ['orders', 'order_activity_logs', 'notifications'];
    for (const table of tablesToClear) {
      const { error } = await supabase
        .from(table)
        .delete()
        .not('id', 'is', null);
      if (error) throw error;
    }

    // 2. Reset Inventory Levels
    const { error: invErr } = await supabase
      .from('inventory')
      .update({ current_stock: 0 })
      .not('id', 'is', null);
    if (invErr) throw invErr;

    // 3. Reset Toy Box Stock
    const { error: toyErr } = await supabase
      .from('toy_box_inventory')
      .update({ stock_quantity: 0 })
      .not('id', 'is', null);
    if (toyErr) throw toyErr;

    return { success: true };
  }
};
