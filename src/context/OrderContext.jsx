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
    // OPTIMIZED: Merge all 3 tables into a single channel to reduce DB connections.
    const orderContextChannel = supabase
      .channel('order_context_changes')
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory' }, () => {
        scheduleInventoryRefresh();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'toy_box_inventory' }, () => {
        scheduleToyBoxRefresh();
      })
      .subscribe();

    return () => {
      window.clearTimeout(statsRefreshTimerRef.current);
      window.clearTimeout(inventoryRefreshTimerRef.current);
      window.clearTimeout(toyBoxRefreshTimerRef.current);
      window.clearTimeout(workflowAnalysisTimerRef.current);
      supabase.removeChannel(orderContextChannel);
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

      const CONFIRMED_STATUSES = ['Confirmed', 'Factory Processing'];
      const CANCELLED_STATUSES = ['Cancelled', 'Fake Order'];

      const isNowConfirmed  = CONFIRMED_STATUSES.includes(newStatus)  && !CONFIRMED_STATUSES.includes(oldStatus);
      const isNowCancelled  = CANCELLED_STATUSES.includes(newStatus)  && CONFIRMED_STATUSES.includes(oldStatus);

      const qty = order?.quantity || 1;
      const stockOpts = { orderId, userId: user?.id };

      // Auto stock deduction when order is confirmed (prefer inventory_id, fallback to name)
      if (isNowConfirmed && order) {
        if (order.inventory_id) {
          await api.deductStockByInventoryId(order.inventory_id, qty, { ...stockOpts, note: `Order ${orderId} confirmed — deducted ${qty} unit(s)` });
        } else if (order.product_name) {
          await api.deductStockByProductName(order.product_name, qty, stockOpts);
        }
      }

      // Auto stock restore when a previously-confirmed order is cancelled
      if (isNowCancelled && order) {
        const txType = newStatus === 'Fake Order' ? 'order_returned' : 'order_cancelled';
        if (order.inventory_id) {
          await api.restoreStockByInventoryId(order.inventory_id, qty, { ...stockOpts, txType, note: `Order ${orderId} ${newStatus.toLowerCase()} — restored ${qty} unit(s)` });
        } else if (order.product_name) {
          // Legacy name-based restore
          const { data: items } = await supabase.from('inventory').select('id, current_stock').ilike('name', order.product_name).limit(1);
          if (items?.[0]) {
            await api.restoreStockByInventoryId(items[0].id, qty, { ...stockOpts, txType });
          }
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

      // If order is created as Confirmed, deduct stock immediately
      if (order.status === 'Confirmed') {
        const qty = order.quantity || 1;
        const stockOpts = { orderId: order.id, userId: user?.id };
        if (order.inventory_id) {
          // Preferred: deduct by linked inventory_id
          await api.deductStockByInventoryId(order.inventory_id, qty, stockOpts);
        } else if (Array.isArray(order.ordered_items) && order.ordered_items.length > 0) {
          for (const item of order.ordered_items) {
            await api.deductStockByProductName(item.name || order.product_name, item.quantity || 1, stockOpts);
          }
        } else if (order.product_name) {
          await api.deductStockByProductName(order.product_name, qty, stockOpts);
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
  /**
   * Helper to check stock availability for a single order, considering current running deductions.
   */
  const checkOrderStock = (order, inventoryList, toyBoxesList, runningStockDeductions = {}, runningToyBoxDeductions = {}) => {
    const items = order.ordered_items || [];
    
    // If no detailed items, fallback to product_name & quantity
    const orderLines = items.length > 0 ? items : [
      { name: order.product_name, quantity: order.quantity || 1 }
    ];

    let allAvailable = true;
    const missingItems = [];
    const proposedDeductions = {
      inventory: [], // elements: { id, qty }
      toyBox: []     // elements: { id, qty, stockKey }
    };

    for (const item of orderLines) {
      const itemName = typeof item === 'object' ? (item.name || order.product_name) : order.product_name;
      const qtyNeeded = typeof item === 'object' ? (item.quantity || 1) : (order.quantity || 1);
      
      // Check if it's a toybox (supports serial tracking)
      const isToyBox = itemName.toUpperCase().includes('TOY BOX') || (typeof item === 'object' && item.isToyBox);

      if (isToyBox) {
        let boxNum = null;
        if (typeof item === 'object') {
          const boxMatch = (itemName || '').match(/#(\d+)/);
          boxNum = item.toyBoxNumber || (boxMatch ? parseInt(boxMatch[1]) : null);
        } else {
          boxNum = Number(item);
        }

        if (boxNum != null) {
          const box = toyBoxesList.find(b => 
            (b.product_name || 'TOY BOX').toUpperCase().includes('TOY BOX') &&
            Number(b.toy_box_number) === boxNum
          );
          const boxId = box ? box.id : null;
          const stockKey = boxId || `toybox-${boxNum}`;
          
          const available = (box ? Number(box.stock_quantity) || 0 : 0) - (runningToyBoxDeductions[stockKey] || 0);
          if (available < qtyNeeded) {
            allAvailable = false;
            missingItems.push(`${itemName} (Serial #${boxNum}): Needs ${qtyNeeded}, Has ${available + (runningToyBoxDeductions[stockKey] || 0)}`);
          } else {
            proposedDeductions.toyBox.push({ id: boxId, qty: qtyNeeded, stockKey });
          }
        } else {
          // General matching for toy box by product name
          const match = toyBoxesList.find(b => 
            (b.product_name || 'TOY BOX').toLowerCase() === itemName.toLowerCase()
          );
          const boxId = match ? match.id : null;
          const stockKey = boxId || `toybox-named-${itemName}`;
          const available = (match ? Number(match.stock_quantity) || 0 : 0) - (runningToyBoxDeductions[stockKey] || 0);
          if (available < qtyNeeded) {
            allAvailable = false;
            missingItems.push(`${itemName}: Needs ${qtyNeeded}, Has ${available + (runningToyBoxDeductions[stockKey] || 0)}`);
          } else {
            proposedDeductions.toyBox.push({ id: boxId, qty: qtyNeeded, stockKey });
          }
        }
      } else {
        // General inventory matching
        const invMatch = api.matchInventoryProduct(itemName, inventoryList);
        if (invMatch) {
          const available = (Number(invMatch.current_stock) || 0) - (runningStockDeductions[invMatch.id] || 0);
          if (available < qtyNeeded) {
            allAvailable = false;
            missingItems.push(`${itemName}: Needs ${qtyNeeded}, Has ${available + (runningStockDeductions[invMatch.id] || 0)}`);
          } else {
            proposedDeductions.inventory.push({ id: invMatch.id, qty: qtyNeeded });
          }
        } else {
          // Treat unlisted products as out of stock for perfect inventory control
          allAvailable = false;
          missingItems.push(`${itemName}: Product not found in Inventory. Please create it first.`);
        }
      }
    }

    return { inStock: allAvailable, missingItems, proposedDeductions };
  };

  /**
   * Auto Distribute: checks stock for source orders and moves stock-matched ones to Courier Ready.
   * Universal stock check across both general inventory products and toy boxes.
   * Respects first-confirmed priority order strictly based on updated_at ASC!
   */
  const autoDistributeOrders = async (sourceStatus = 'Bulk Exported') => {
    // Fetch source orders directly from DB (sorted by updated_at ASC for priority matching)
    const { data: sourceOrders, error: fetchErr } = await supabase
      .from('orders')
      .select('*')
      .eq('status', sourceStatus)
      .order('updated_at', { ascending: true });
      
    if (fetchErr) throw fetchErr;
    if (!sourceOrders?.length) return { distributed: 0, queued: 0, total: 0, sourceStatus };

    // Get current inventory & toy box stocks through the API compatibility layer
    const inventoryList = await api.getInventory() || [];
    const toyBoxesList = await api.getToyBoxInventory() || [];

    const runningStockDeductions = {};
    const runningToyBoxDeductions = {};

    let distributed = 0;
    let queued = 0;

    const stockDeductionUpdates = {}; // { id: new_qty } for inventory
    const toyBoxDeductionUpdates = {}; // { id: new_qty } for toy_box_inventory

    for (const order of sourceOrders) {
      const { inStock, proposedDeductions } = checkOrderStock(
        order,
        inventoryList,
        toyBoxesList,
        runningStockDeductions,
        runningToyBoxDeductions
      );

      if (inStock) {
        // Reserve stock in running deductions
        for (const ded of proposedDeductions.inventory) {
          runningStockDeductions[ded.id] = (runningStockDeductions[ded.id] || 0) + ded.qty;
          const match = inventoryList.find(i => i.id === ded.id);
          const current = match ? Number(match.current_stock) || 0 : 0;
          stockDeductionUpdates[ded.id] = Math.max(0, current - runningStockDeductions[ded.id]);
        }
        for (const ded of proposedDeductions.toyBox) {
          runningToyBoxDeductions[ded.stockKey] = (runningToyBoxDeductions[ded.stockKey] || 0) + ded.qty;
          if (ded.id) {
            const match = toyBoxesList.find(b => b.id === ded.id);
            const current = match ? Number(match.stock_quantity) || 0 : 0;
            toyBoxDeductionUpdates[ded.id] = Math.max(0, current - runningToyBoxDeductions[ded.stockKey]);
          }
        }

        // Move order to 'Courier Ready'
        await supabase
          .from('orders')
          .update({ status: 'Courier Ready', updated_at: new Date().toISOString() })
          .eq('id', order.id);

        distributed++;
      } else {
        // If not in stock, leave in current status so user can view "Stock Out" badge
        queued++;
      }
    }

    // Apply all stock deductions to inventory
    for (const [id, newQty] of Object.entries(stockDeductionUpdates)) {
      await supabase
        .from('inventory')
        .update({ current_stock: newQty, updated_at: new Date().toISOString() })
        .eq('id', id);
    }

    // Apply all stock deductions to toy_box_inventory
    for (const [id, newQty] of Object.entries(toyBoxDeductionUpdates)) {
      await supabase
        .from('toy_box_inventory')
        .update({ stock_quantity: newQty, updated_at: new Date().toISOString() })
        .eq('id', id);
    }

    // Refresh data
    fetchOrders(1);
    fetchToyBoxes();
    fetchInventory();

    return { distributed, queued, total: sourceOrders.length, sourceStatus };
  };

  /**
   * Manual Single-Order Dispatch: validates stock and dispatches a single order to courier workflow.
   * Deducts stock atomically. Throws an error if out of stock.
   */
  const distributeSingleOrder = async (orderId) => {
    // 1. Fetch latest order state directly
    const { data: order, error: fetchErr } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();
    if (fetchErr) throw fetchErr;

    // 2. Fetch latest inventory & toy boxes
    const inventoryList = await api.getInventory() || [];
    const toyBoxesList = await api.getToyBoxInventory() || [];

    // 3. Verify stock
    const { inStock, missingItems, proposedDeductions } = checkOrderStock(order, inventoryList, toyBoxesList);
    if (!inStock) {
      throw new Error(`Insufficient Stock: ${missingItems.join(', ')}`);
    }

    // 4. Deduct and save general inventory
    for (const ded of proposedDeductions.inventory) {
      const match = inventoryList.find(i => i.id === ded.id);
      const current = match ? Number(match.current_stock) || 0 : 0;
      const newQty = Math.max(0, current - ded.qty);
      await supabase
        .from('inventory')
        .update({ current_stock: newQty, updated_at: new Date().toISOString() })
        .eq('id', ded.id);
    }

    // 5. Deduct and save toy boxes
    for (const ded of proposedDeductions.toyBox) {
      if (ded.id) {
        const match = toyBoxesList.find(b => b.id === ded.id);
        const current = match ? Number(match.stock_quantity) || 0 : 0;
        const newQty = Math.max(0, current - ded.qty);
        await supabase
          .from('toy_box_inventory')
          .update({ stock_quantity: newQty, updated_at: new Date().toISOString() })
          .eq('id', ded.id);
      }
    }

    // 6. Update order status to 'Courier Ready'
    const { error: updateErr } = await supabase
      .from('orders')
      .update({ status: 'Courier Ready', updated_at: new Date().toISOString() })
      .eq('id', orderId);
    if (updateErr) throw updateErr;

    // 7. Refresh data
    fetchOrders(1);
    fetchToyBoxes();
    fetchInventory();
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
      distributeSingleOrder,
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
