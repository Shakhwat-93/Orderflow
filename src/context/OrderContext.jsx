import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import api from '../lib/api';
import { useAuth } from './AuthContext';
import { fraudDetection } from '../utils/fraudDetection';
import { automationRules } from '../utils/automationRules';
import { fulfillmentVelocity } from '../utils/fulfillmentVelocity';
import { getToyBoxStockKey } from '../utils/productCatalog';

const OrderContext = createContext(null);
const ORDER_SNAPSHOT_SIZE = 500;
const ORDER_PAGE_SIZE = 50;
const DATA_REFRESH_DEBOUNCE_MS = 800;

export const OrderProvider = ({ children }) => {
  const [orders, setOrders] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(ORDER_PAGE_SIZE);
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
  const userId = user?.id ?? null;

  // Track current values without causing re-renders  
  const pageRef = useRef(page);
  pageRef.current = page;
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const fetchIdRef = useRef(0); // Dedup concurrent fetches
  const ordersRef = useRef(orders);
  ordersRef.current = orders;
  const statsRefreshTimerRef = useRef(null);
  const inventoryRefreshTimerRef = useRef(null);
  const toyBoxRefreshTimerRef = useRef(null);
  const workflowAnalysisTimerRef = useRef(null);

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
    if (!userId) return;
    const currentPage = overridePage ?? 1;
    const id = ++fetchIdRef.current;
    if (ordersRef.current.length === 0) {
      setLoading(true);
    }
    try {
      const { data, count } = await api.getOrdersWithCount(currentPage, ORDER_SNAPSHOT_SIZE, {});
      if (id === fetchIdRef.current) { 
        setOrders(data);
        setTotalCount(count);
        // Cache the working snapshot so route changes never show a blank shell before Supabase responds.
        if (currentPage === 1) {
          localStorage.setItem('of_recent_orders', JSON.stringify(data.slice(0, ORDER_SNAPSHOT_SIZE)));
        }
      }
    } catch (error) {
      console.error('Error fetching orders:', error);
      // Keep stale data visible; live operations should degrade gracefully, not blank the panels.
    }
    if (id === fetchIdRef.current) setLoading(false);
  }, [userId]);

  const fetchStats = useCallback(async () => {
    if (!userId) return;
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
  }, [userId]);

  const fetchInventory = useCallback(async (invFilters = {}) => {
    if (!userId) return;
    try {
      const data = await api.getInventory(invFilters);
      setInventory(data);
    } catch (error) {
      console.error('Error fetching inventory:', error);
    }
  }, [userId]);

  const fetchToyBoxes = useCallback(async () => {
    if (!userId) return;
    try {
      const data = await api.getToyBoxInventory();
      setToyBoxes(data);
    } catch (error) {
      console.error('Error fetching Toy Box inventory:', error);
    }
  }, [userId]);

  const scheduleStatsRefresh = useCallback(() => {
    window.clearTimeout(statsRefreshTimerRef.current);
    statsRefreshTimerRef.current = window.setTimeout(() => fetchStats(), DATA_REFRESH_DEBOUNCE_MS);
  }, [fetchStats]);

  const scheduleInventoryRefresh = useCallback(() => {
    window.clearTimeout(inventoryRefreshTimerRef.current);
    inventoryRefreshTimerRef.current = window.setTimeout(() => fetchInventory(), DATA_REFRESH_DEBOUNCE_MS);
  }, [fetchInventory]);

  const scheduleToyBoxRefresh = useCallback(() => {
    window.clearTimeout(toyBoxRefreshTimerRef.current);
    toyBoxRefreshTimerRef.current = window.setTimeout(() => fetchToyBoxes(), DATA_REFRESH_DEBOUNCE_MS);
  }, [fetchToyBoxes]);

  // Combined initialization for smoother loading
  const initializeData = useCallback(async () => {
    if (!userId) return;
    try {
      await Promise.allSettled([
        fetchOrders(1),
        fetchStats(),
        fetchInventory(),
        fetchToyBoxes()
      ]);
    } finally {
      setIsInitialized(true);
    }
  }, [fetchOrders, fetchStats, fetchInventory, fetchToyBoxes, userId]);

  // Main effect — runs on mount + user change only
  useEffect(() => {
    if (!userId) {
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
          setOrders((prev) => [payload.new, ...prev.filter(order => order.id !== payload.new.id)].slice(0, ORDER_SNAPSHOT_SIZE));
          setTotalCount((prev) => prev + 1);
        } else if (payload.eventType === 'UPDATE') {
          setOrders((prev) => {
            const exists = prev.some(order => order.id === payload.new.id);
            const next = exists
              ? prev.map(order => order.id === payload.new.id ? payload.new : order)
              : [payload.new, ...prev];
            return next.slice(0, ORDER_SNAPSHOT_SIZE);
          });
        } else if (payload.eventType === 'DELETE') {
          setOrders((prev) => prev.filter(order => order.id !== payload.old.id));
          setTotalCount((prev) => Math.max(0, prev - 1));
        }
        scheduleStatsRefresh();
      })
      .subscribe();

    const inventorySubscription = supabase
      .channel('public:inventory')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory' }, () => {
        scheduleInventoryRefresh();
      })
      .subscribe();

    const toyBoxSubscription = supabase
      .channel('public:toy_box_inventory')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'toy_box_inventory' }, () => {
        scheduleToyBoxRefresh();
      })
      .subscribe();

    return () => {
      window.clearTimeout(statsRefreshTimerRef.current);
      window.clearTimeout(inventoryRefreshTimerRef.current);
      window.clearTimeout(toyBoxRefreshTimerRef.current);
      window.clearTimeout(workflowAnalysisTimerRef.current);
      supabase.removeChannel(ordersSubscription);
      supabase.removeChannel(inventorySubscription);
      supabase.removeChannel(toyBoxSubscription);
    };
  }, [initializeData, scheduleInventoryRefresh, scheduleStatsRefresh, scheduleToyBoxRefresh, userId]);

  useEffect(() => {
    if (!userId) return undefined;

    const handleResume = () => {
      initializeData();
    };

    window.addEventListener('app:resume', handleResume);
    return () => window.removeEventListener('app:resume', handleResume);
  }, [initializeData, userId]);

  // Fraud & Automation Detection Effect
  useEffect(() => {
    window.clearTimeout(workflowAnalysisTimerRef.current);

    if (orders.length === 0) {
      setFraudFlags({});
      setAutomationFlags({});
      setVelocityMetrics(null);
      return undefined;
    }

    workflowAnalysisTimerRef.current = window.setTimeout(() => {
      setFraudFlags(fraudDetection.scanOrders(orders));
      setAutomationFlags(automationRules.scanOrders(orders));

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
    }, 350);

    return () => window.clearTimeout(workflowAnalysisTimerRef.current);
  }, [orders]);

  // Re-fetch when page changes (but not on initial mount — handled above)
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    // Pagination is handled client-side from the live snapshot.
    // Avoid replacing the shared order cache on page clicks.
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
  }, []);

  const updateOrderStatus = async (orderId, newStatus, noteText = '') => {
    const currentUserName = profile?.name || user?.user_metadata?.full_name || user?.email || 'Unknown User';
    const order = orders.find(o => o.id === orderId);
    const oldStatus = order?.status;

    setOrders(prev => prev.map(order => order.id === orderId ? { ...order, status: newStatus } : order));

    try {
      const updatedOrder = await api.changeOrderStatus(orderId, newStatus, user?.id, currentUserName, userRoles, noteText);

      if (updatedOrder?.id) {
        setOrders(prev => prev.map(existingOrder => (
          existingOrder.id === orderId ? { ...existingOrder, ...updatedOrder } : existingOrder
        )));
      }

      // Auto stock deduction on confirmation
      if ((newStatus === 'Confirmed' || newStatus === 'Factory Processing') &&
        !(oldStatus === 'Confirmed' || oldStatus === 'Factory Processing')) {
        if (order && order.product_name) {
          await api.deductStockByProductName(order.product_name, order.quantity || 1);
        }
      }

      scheduleStatsRefresh();
      return updatedOrder;
    } catch (error) {
      console.error('Update status error:', error);
      fetchOrders();
      throw error;
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

      fetchOrders(1);
      scheduleStatsRefresh();
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

  const dispatchToCourier = async (orderId) => {
    try {
      const result = await api.dispatchToCourier(orderId);
      const consignmentId = result?.consignmentId || result?.details?.consignment?.consignment_id || result?.details?.id || null;
      const trackingCode = result?.trackingCode || result?.details?.consignment?.tracking_code || result?.details?.tracking_code || null;
      const courierStatus = result?.details?.consignment?.status || result?.details?.status || 'pending';

      setOrders((prev) => prev.map((order) => (
        order.id === orderId
          ? {
              ...order,
              dispatched_at: new Date().toISOString(),
              courier_name: 'Steadfast',
              tracking_id: trackingCode || order.tracking_id || null,
              courier_assigned_id: consignmentId ? String(consignmentId) : order.courier_assigned_id || null,
              courier_status: courierStatus,
              status: 'Courier Submitted'
            }
          : order
      )));

      return result;
    } catch (error) {
      console.error('Manual dispatch failed:', error);
      throw error;
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

  const addToyBoxStocks = async (entries) => {
    try {
      await api.createToyBoxStocks(entries);
      fetchToyBoxes();
    } catch (error) {
      console.error('Error adding toy box serials:', error);
      throw error;
    }
  };

  /**
   * Auto Distribute: checks stock for source orders and moves stock-matched ones to Courier Ready.
   * Non-toybox orders pass through directly. Unmatched orders go to Factory Queue.
   */
  const autoDistributeOrders = async (sourceStatus = 'Bulk Exported') => {
    // Fetch source orders directly from DB (not just the paginated ones in state)
    const { data: sourceOrders, error: fetchErr } = await supabase
      .from('orders')
      .select('*')
      .eq('status', sourceStatus);
    if (fetchErr) throw fetchErr;
    if (!sourceOrders?.length) return { distributed: 0, queued: 0, total: 0, sourceStatus };

    // Get current toy box stock through the API compatibility layer
    const boxes = await api.getToyBoxInventory();

    const stockMap = {};
    (boxes || []).forEach((box) => {
      stockMap[getToyBoxStockKey(box.product_name || 'TOY BOX', box.toy_box_number)] = {
        qty: Number(box.stock_quantity) || 0,
        id: box.id,
        product_name: box.product_name || 'TOY BOX',
        toy_box_number: box.toy_box_number
      };
    });

    let distributed = 0;
    let queued = 0;
    const stockDeductions = {};

    for (const order of sourceOrders) {
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
            const productName = typeof item === 'object' ? (item.name || order.product_name || 'TOY BOX') : 'TOY BOX';
            const stockKey = getToyBoxStockKey(productName, boxNum);
            const available = (stockMap[stockKey]?.qty || 0) - (stockDeductions[stockKey] || 0);
            if (available < (item.quantity || 1)) {
              allInStock = false;
              break;
            }
            orderDeductions.push({ stockKey, qty: item.quantity || 1 });
          }
        }

        if (allInStock && orderDeductions.length > 0) {
          // Reserve stock
          for (const ded of orderDeductions) {
            stockDeductions[ded.stockKey] = (stockDeductions[ded.stockKey] || 0) + ded.qty;
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
      } else {
        queued++;
      }
    }

    // Apply all stock deductions to toy_box_inventory
    for (const [stockKey, deducted] of Object.entries(stockDeductions)) {
      const current = stockMap[stockKey]?.qty || 0;
      const newQty = Math.max(0, current - deducted);
      const stockRowId = stockMap[stockKey]?.id;
      if (!stockRowId) continue;
      await supabase
        .from('toy_box_inventory')
        .update({ stock_quantity: newQty, updated_at: new Date().toISOString() })
        .eq('id', stockRowId);
    }

    // Refresh data
    fetchOrders(1);
    fetchToyBoxes();

    return { distributed, queued, total: sourceOrders.length, sourceStatus };
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
      addToyBoxStocks,
      autoDistributeOrders,
      previewInvoiceStockUpdate,
      applyInvoiceStockUpdate,
      isInitialized,
      fraudFlags,
      automationFlags,
      velocityMetrics,
      dispatchToCourier,
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
