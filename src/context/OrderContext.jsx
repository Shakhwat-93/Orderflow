import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';
import { useAuth } from './AuthContext';
import { fraudDetection } from '../utils/fraudDetection';
import { automationRules } from '../utils/automationRules';
import { fulfillmentVelocity } from '../utils/fulfillmentVelocity';

const OrderContext = createContext(null);

export const OrderProvider = ({ children }) => {
  const [orders, setOrders] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100); // Increased from 10 to 100 to ensure panels don't break on client-side filtering
  const [filters, setFilters] = useState({
    searchTerm: '',
    status: 'All',
    source: 'All',
    productName: '',
    dateRange: { start: null, end: null }
  });
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    total: 0, completed: 0, pending: 0, revenue: 0,
    addedTodayCount: 0, sourceDistribution: [], trendData: [], confirmationData: []
  });
  const [inventory, setInventory] = useState([]);
  const [toyBoxes, setToyBoxes] = useState([]);
  const [fraudFlags, setFraudFlags] = useState({});
  const [automationFlags, setAutomationFlags] = useState({});
  const [velocityMetrics, setVelocityMetrics] = useState(null);

  const { user, profile, userRoles, isAdmin } = useAuth();

  // Track current values without causing re-renders  
  const pageRef = useRef(page);
  pageRef.current = page;
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const fetchIdRef = useRef(0); // Dedup concurrent fetches

  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize from cache for instant-on feeling
  useEffect(() => {
    const cachedStats = localStorage.getItem('of_dashboard_stats');
    const cachedOrders = localStorage.getItem('of_recent_orders');
    if (cachedStats) {
      try { setStats(JSON.parse(cachedStats)); } catch (e) { console.warn('Cache error:', e); }
    }
    if (cachedOrders) {
      try { setOrders(JSON.parse(cachedOrders)); } catch (e) { console.warn('Cache error:', e); }
    }
  }, []);

  const fetchOrders = useCallback(async (overridePage) => {
    if (!user) return;
    const currentPage = overridePage ?? pageRef.current;
    const id = ++fetchIdRef.current;
    setLoading(true);
    try {
      const data = await api.getOrders(currentPage, pageSize, filtersRef.current);
      const count = await api.getOrdersCount(filtersRef.current);
      if (id === fetchIdRef.current) { 
        setOrders(data);
        setTotalCount(count);
        // Cache partial orders for dashboard quick-look
        if (currentPage === 1) {
          localStorage.setItem('of_recent_orders', JSON.stringify(data.slice(0, 10)));
        }
      }
    } catch (error) {
      console.error('Error fetching orders:', error);
    }
    if (id === fetchIdRef.current) setLoading(false);
  }, [user, pageSize]);

  const fetchStats = useCallback(async () => {
    if (!user) return;
    try {
      const data = await api.getDashboardStats();
      setStats(prev => {
        const newStats = { ...prev, ...data };
        localStorage.setItem('of_dashboard_stats', JSON.stringify(newStats));
        return newStats;
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  }, [user]);

  const fetchInventory = useCallback(async (invFilters = {}) => {
    if (!user) return;
    try {
      const data = await api.getInventory(invFilters);
      setInventory(data);
    } catch (error) {
      console.error('Error fetching inventory:', error);
    }
  }, [user]);

  const fetchToyBoxes = useCallback(async () => {
    if (!user) return;
    try {
      const data = await api.getToyBoxInventory();
      setToyBoxes(data);
    } catch (error) {
      console.error('Error fetching Toy Box inventory:', error);
    }
  }, [user]);

  // Combined initialization for smoother loading
  const initializeData = useCallback(async () => {
    if (!user) return;
    try {
      await Promise.all([
        fetchOrders(1),
        fetchStats(),
        fetchInventory(),
        fetchToyBoxes()
      ]);
    } finally {
      setIsInitialized(true);
    }
  }, [user, fetchOrders, fetchStats, fetchInventory, fetchToyBoxes]);

  // Main effect — runs on mount + user change only
  useEffect(() => {
    if (!user) {
      setOrders([]);
      setIsInitialized(false);
      return;
    }

    initializeData();

    // Realtime subscriptions
    const ordersSubscription = supabase
      .channel('public:orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setOrders((prev) => [payload.new, ...prev]);
          try {
            const audio = new Audio('/ordersound.mp3');
            audio.play().catch(e => console.warn('Audio blocked:', e));
          } catch (err) { console.error('Audio error:', err); }
        } else if (payload.eventType === 'UPDATE') {
          setOrders((prev) => prev.map(order => order.id === payload.new.id ? payload.new : order));
        } else if (payload.eventType === 'DELETE') {
          setOrders((prev) => prev.filter(order => order.id !== payload.old.id));
        }
        fetchStats();
      })
      .subscribe();

    const inventorySubscription = supabase
      .channel('public:inventory')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory' }, () => {
        fetchInventory();
      })
      .subscribe();

    const toyBoxSubscription = supabase
      .channel('public:toy_box_inventory')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'toy_box_inventory' }, () => {
        fetchToyBoxes();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(ordersSubscription);
      supabase.removeChannel(inventorySubscription);
      supabase.removeChannel(toyBoxSubscription);
    };
  }, [user, initializeData]);

  // Fraud & Automation Detection Effect
  useEffect(() => {
    if (orders.length > 0) {
      // 1. Fraud & Automation
      const newFraudFlags = fraudDetection.scanOrders(orders);
      const newAutomationFlags = automationRules.scanOrders(orders);
      setFraudFlags(newFraudFlags);
      setAutomationFlags(newAutomationFlags);

      // 2. Velocity Metrics (Fetch recent logs for calculations)
      const computeVelocity = async () => {
        try {
          const logs = await api.getRecentActivity(200); // Analyze last 200 actions
          const metrics = fulfillmentVelocity.calculateMetrics(logs);
          setVelocityMetrics(metrics);
        } catch (error) {
          console.error('Velocity calculation failed:', error);
        }
      };

      computeVelocity();
    }
  }, [orders]);

  // Re-fetch when page changes (but not on initial mount — handled above)
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    fetchOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // Wrapper for setFilters that also resets page
  const updateFilters = useCallback((newFilters) => {
    if (typeof newFilters === 'function') {
      setFilters(prev => {
        const next = newFilters(prev);
        return next;
      });
    } else {
      setFilters(newFilters);
    }
    setPage(1);
    // Fetch will be triggered by the page change effect,
    // but if page is already 1 we need to fetch manually
    setTimeout(() => fetchOrders(1), 0);
  }, [fetchOrders]);

  const updateOrderStatus = async (orderId, newStatus) => {
    const currentUserName = profile?.name || user?.user_metadata?.full_name || user?.email || 'Unknown User';
    const order = orders.find(o => o.id === orderId);
    const oldStatus = order?.status;

    setOrders(prev => prev.map(order => order.id === orderId ? { ...order, status: newStatus } : order));

    try {
      await api.changeOrderStatus(orderId, newStatus, user?.id, currentUserName, userRoles);

      // Auto stock deduction on confirmation
      if ((newStatus === 'Confirmed' || newStatus === 'Factory Processing') &&
        !(oldStatus === 'Confirmed' || oldStatus === 'Factory Processing')) {
        if (order && order.product_name) {
          await api.deductStockByProductName(order.product_name, order.quantity || 1);
        }
      }

      fetchStats();
    } catch (error) {
      console.error('Update status error:', error);
      fetchOrders();
    }
  };

  const addOrder = async (newOrder) => {
    const currentUserName = profile?.name || user?.user_metadata?.full_name || user?.email || 'Unknown User';
    try {
      const order = await api.createOrder(newOrder, user?.id, currentUserName, userRoles);

      // If order is created as Confirmed already
      if (order.status === 'Confirmed') {
        if (Array.isArray(order.ordered_items) && order.ordered_items.length > 0) {
          for (const item of order.ordered_items) {
            await api.deductStockByProductName(item.name || order.product_name, item.quantity || 1);
          }
        } else {
          await api.deductStockByProductName(order.product_name, order.quantity || 1);
        }
      }

      fetchOrders();
    } catch (error) {
      console.error('Error adding order:', error);
      throw error;
    }
  };

  const addInventoryItem = async (item) => {
    try {
      await api.createInventoryItem(item);
      fetchInventory();
    } catch (error) {
      console.error('Error adding inventory item:', error);
    }
  };

  const updateInventoryItem = async (id, updates) => {
    try {
      await api.updateInventoryItem(id, updates);
      fetchInventory();
    } catch (error) {
      console.error('Error updating inventory item:', error);
    }
  };

  const adjustStock = async (id, change) => {
    try {
      await api.adjustStock(id, change);
      fetchInventory();
    } catch (error) {
      console.error('Error adjusting stock:', error);
    }
  };

  const deleteInventoryItem = async (id) => {
    try {
      await api.deleteInventoryItem(id);
      fetchInventory();
    } catch (error) {
      console.error('Error deleting inventory item:', error);
    }
  };

  const editOrder = async (orderId, updatedData) => {
    const currentUserName = profile?.name || user?.user_metadata?.full_name || user?.email || 'Unknown User';
    const oldOrder = orders.find(o => o.id === orderId);

    try {
      await api.updateOrder(orderId, updatedData, user?.id, currentUserName, userRoles);
    } catch (error) {
      console.error('Error updating order:', error);
    }
  };

  const addTrackingID = async (orderId, trackingId) => {
    const currentUserName = profile?.name || user?.user_metadata?.full_name || user?.email || 'Unknown User';
    try {
      await api.addTrackingID(orderId, trackingId, user?.id, currentUserName, userRoles);
    } catch (error) {
      console.error('Error adding tracking ID:', error);
    }
  };

  const deleteOrder = async (orderId) => {
    if (!isAdmin) {
      console.error('Unauthorized delete attempt');
      return;
    }

    const currentUserName = profile?.name || user?.user_metadata?.full_name || user?.email || 'Unknown User';
    const order = orders.find(o => o.id === orderId);

    try {
      // Notify before deletion to ensure we have data
      await api.createNotification({
        type: 'ORDER_DELETED',
        title: 'Order Deleted',
        message: `Order #${orderId} (${order?.customer_name || 'N/A'}) was permanently removed.`,
        data: { orderId, customer: order?.customer_name },
        actor_name: currentUserName
      });

      const { error } = await supabase
        .from('orders')
        .delete()
        .eq('id', orderId);

      if (error) throw error;

      // Log deletion
      await api.logActivity({
        order_id: orderId,
        action_type: 'DELETE',
        changed_by_user_id: user?.id,
        changed_by_user_name: currentUserName,
        action_description: `${currentUserName} deleted order #${orderId} (${order?.customer_name || 'N/A'})`
      });
    } catch (error) {
      console.error('Error deleting order:', error);
    }
  };


  const previewInvoiceStockUpdate = async (invoiceText, options = {}) => {
    try {
      return await api.previewInvoiceStockUpdate(invoiceText, options);
    } catch (error) {
      console.error('Invoice stock preview error:', error);
      throw error;
    }
  };

  const applyInvoiceStockUpdate = async (invoiceText, options = {}) => {
    const currentUserName = profile?.name || user?.user_metadata?.full_name || user?.email || 'Unknown User';
    try {
      const result = await api.applyInvoiceStockUpdate(invoiceText, currentUserName, options);
      fetchInventory();
      fetchToyBoxes();
      return result;
    } catch (error) {
      console.error('Invoice stock apply error:', error);
      throw error;
    }
  };

  const updateToyBoxStock = async (id, newStock) => {
    try {
      await api.updateToyBoxStock(id, newStock);
      // fetchToyBoxes will be triggered by subscription
    } catch (error) {
      console.error('Error updating toy box stock:', error);
      throw error;
    }
  };

  /**
   * Auto Distribute: checks stock for Confirmed orders and moves stock-matched ones to Courier Ready.
   * Non-toybox orders pass through directly. Unmatched orders go to Factory Queue.
   */
  const autoDistributeOrders = async () => {
    // Fetch all Confirmed orders directly from DB (not just the paginated ones in state)
    const { data: confirmedOrders, error: fetchErr } = await supabase
      .from('orders')
      .select('*')
      .eq('status', 'Confirmed');
    if (fetchErr) throw fetchErr;
    if (!confirmedOrders?.length) return { distributed: 0, queued: 0, total: 0 };

    // Get current toy box stock
    const { data: boxes } = await supabase
      .from('toy_box_inventory')
      .select('toy_box_number, stock_quantity, id');

    const stockMap = {};
    (boxes || []).forEach(b => { stockMap[b.toy_box_number] = { qty: b.stock_quantity, id: b.id }; });

    let distributed = 0;
    let queued = 0;
    const stockDeductions = {}; // { toyBoxNumber: totalDeducted }

    // Fetch courier config once
    const courierConfig = await api.getSystemConfig('courier_steadfast');
    const autoDispatch = courierConfig?.is_enabled && courierConfig?.auto_dispatch;

    for (const order of confirmedOrders) {
      const items = order.ordered_items || [];
      const hasToyBox = items.length > 0 && items.some(item => {
        if (typeof item === 'object') {
          return (item.name || '').toUpperCase().includes('TOY BOX') || item.isToyBox;
        }
        return true; // Legacy items were always toy box IDs
      });

      let targetStatus = 'Courier Ready';
      let isMatched = false;

      if (!hasToyBox) {
        // No toybox items → direct to Courier Ready
        targetStatus = 'Courier Ready';
        isMatched = true;
      } else {
        // Check if all toy box items have enough stock (accounting for pending deductions)
        let allInStock = true;
        const orderDeductions = [];

        for (const item of items) {
          const isItemToyBox = typeof item === 'object' 
            ? ((item.name || '').toUpperCase().includes('TOY BOX') || item.isToyBox)
            : true; // Legacy
            
          if (!isItemToyBox) continue;

          // Try to find the box number
          let boxNum = null;
          if (typeof item === 'object') {
            const boxMatch = (item.name || '').match(/#(\d+)/);
            boxNum = item.toyBoxNumber || (boxMatch ? parseInt(boxMatch[1]) : null);
          } else {
            boxNum = Number(item);
          }

          if (boxNum != null) {
            const available = (stockMap[boxNum]?.qty || 0) - (stockDeductions[boxNum] || 0);
            if (available < (item.quantity || 1)) {
              allInStock = false;
              break;
            }
            orderDeductions.push({ boxNum, qty: item.quantity || 1 });
          }
        }

        if (allInStock && orderDeductions.length > 0) {
          // Reserve stock
          for (const ded of orderDeductions) {
            stockDeductions[ded.boxNum] = (stockDeductions[ded.boxNum] || 0) + ded.qty;
          }
          targetStatus = 'Courier Ready';
          isMatched = true;
        } else {
          // Not enough stock or no box number detected → Factory Queue
          targetStatus = 'Factory Queue';
          isMatched = false;
        }
      }

      // Update status
      await supabase.from('orders').update({ status: targetStatus, updated_at: new Date().toISOString() }).eq('id', order.id);
      
      if (isMatched) {
        distributed++;
        // Trigger Auto Dispatch to Courier if enabled and matched
        if (autoDispatch) {
          try {
            await api.dispatchToCourier(order.id);
          } catch (dispatchErr) {
            console.error(`Auto-dispatch failed for ${order.id}:`, dispatchErr);
            // We don't throw here to avoid stopping the whole loop
          }
        }
      } else {
        queued++;
      }
    }

    // Apply all stock deductions to toy_box_inventory
    for (const [boxNum, deducted] of Object.entries(stockDeductions)) {
      const num = Number(boxNum);
      const current = stockMap[num]?.qty || 0;
      const newQty = Math.max(0, current - deducted);
      await supabase.from('toy_box_inventory').update({ stock_quantity: newQty, updated_at: new Date().toISOString() }).eq('toy_box_number', num);
    }

    // Refresh data
    fetchOrders();
    fetchToyBoxes();

    return { distributed, queued, total: confirmedOrders.length };
  };

  const fetchOrderLogs = async (orderId) => {
    const { data, error } = await supabase
      .from('order_activity_logs')
      .select('*')
      .eq('order_id', orderId)
      .order('timestamp', { ascending: false });

    if (error) {
      console.error('Error fetching order logs:', error);
      return [];
    }
    return data;
  };

  return (
    <OrderContext.Provider value={{
      orders,
      loading,
      totalCount,
      page,
      pageSize,
      filters,
      setPage,
      setFilters: updateFilters,
      fetchOrders,
      updateOrderStatus,
      addOrder,
      editOrder,
      addTrackingID,
      deleteOrder,
      fetchOrderLogs,
      fetchStats,
      stats,

      // Inventory
      inventory,
      fetchInventory,
      addInventoryItem,
      updateInventoryItem,
      deleteInventoryItem,
      adjustStock,

      // Toy Box System
      toyBoxes,
      fetchToyBoxes,
      updateToyBoxStock,
      autoDistributeOrders,
      previewInvoiceStockUpdate,
      applyInvoiceStockUpdate,
      isInitialized,
      fraudFlags,
      automationFlags,
      velocityMetrics,
    }}>
      {children}
    </OrderContext.Provider>
  );
};

export const useOrders = () => {
  const context = useContext(OrderContext);
  if (!context) {
    throw new Error('useOrders must be used within an OrderProvider');
  }
  return context;
};
