import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';
import { useAuth } from './AuthContext';

const OrderContext = createContext(null);

export const OrderProvider = ({ children }) => {
  const [orders, setOrders] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
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

  const { user, profile, userRoles, isAdmin } = useAuth();

  // Track current values without causing re-renders  
  const pageRef = useRef(page);
  pageRef.current = page;
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const fetchIdRef = useRef(0); // Dedup concurrent fetches

  const fetchOrders = useCallback(async (overridePage) => {
    if (!user) return;
    const currentPage = overridePage ?? pageRef.current;
    const id = ++fetchIdRef.current;
    setLoading(true);
    try {
      const data = await api.getOrders(currentPage, pageSize, filtersRef.current);
      const count = await api.getOrdersCount(filtersRef.current);
      if (id === fetchIdRef.current) { // Only apply if still latest
        setOrders(data);
        setTotalCount(count);
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
      setStats(prev => ({ ...prev, ...data }));
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

  // Main effect — runs on mount + user change only
  useEffect(() => {
    if (!user) {
      setOrders([]);
      return;
    }

    fetchOrders();
    fetchStats();
    fetchInventory();
    fetchToyBoxes();

    // Realtime subscription 
    const ordersSubscription = supabase
      .channel('public:orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setOrders((prev) => [payload.new, ...prev]);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

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
        await api.deductStockByProductName(order.product_name, order.quantity || 1);
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

  const autoDistributeOrders = async () => {
    const currentUserName = profile?.name || user?.user_metadata?.full_name || user?.email || 'Unknown User';
    try {
      const result = await api.runAutoDistribution();

      if (result.confirmed > 0) {
        await api.createNotification({
          type: 'SYSTEM_ACTION',
          title: 'Auto Distribution Complete',
          message: `Distribution engine confirmed ${result.confirmed} orders. ${result.skipped} orders skipped due to low stock.`,
          data: result,
          actor_name: 'System Engine'
        });
      }

      fetchOrders();
      fetchToyBoxes();
      fetchStats();
      return result;
    } catch (error) {
      console.error('Distribution error:', error);
      throw error;
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
      applyInvoiceStockUpdate
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
