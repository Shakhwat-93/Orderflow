import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useOrders } from '../context/OrderContext';
import { useAuth } from '../context/AuthContext';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Modal } from '../components/Modal';
import { OrderEditModal } from '../components/OrderEditModal';
import { OrderDetailsModal } from '../components/OrderDetailsModal';
import { ExportModal } from '../components/ExportModal';
import { Search, Truck, CheckCircle, Package, ClipboardCheck, Edit2, Clock, Loader2, AlertTriangle, Download, FileSpreadsheet, Filter, Sparkles, Check, AlertCircle } from 'lucide-react';
import api from '../lib/api';
import { usePersistentState } from '../utils/persistentState';
import { useRouteOrderReadState } from '../hooks/useRouteOrderReadState';
import './CourierPanel.css';

const containerVariants = {
  hidden: { opacity: 0, y: 15 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { staggerChildren: 0.1, duration: 0.4, ease: [0.4, 0, 0.2, 1] }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0 }
};

export const CourierPanel = () => {
  const { orders, updateOrderStatus, editOrder, dispatchToCourier, autoDistributeOrders, distributeSingleOrder, inventory, toyBoxes } = useOrders();
  const { updatePresenceContext } = useAuth();

  useEffect(() => {
    updatePresenceContext('Managing Bulk Exported Orders');
  }, [updatePresenceContext]);

  const [searchTerm, setSearchTerm] = usePersistentState('panel:courier:search', '');
  const [activeTab, setActiveTab] = usePersistentState('panel:courier:tab', 'bulk');
  const [dateFilter, setDateFilter] = usePersistentState('panel:courier:dateFilter', 'All');
  const [steadfastPending, setSteadfastPending] = useState({});
  const [steadfastSubmitted, setSteadfastSubmitted] = useState({});
  const [isDistributing, setIsDistributing] = useState(false);
  const [distributeResult, setDistributeResult] = useState(null);

  // Elite Custom Filter States
  const [selectedProduct, setSelectedProduct] = useState('All');
  const [selectedVariant, setSelectedVariant] = useState('All');
  const [selectedStockStatus, setSelectedStockStatus] = useState('All');
  const [selectedShippingZone, setSelectedShippingZone] = useState('All');
  const [selectedSource, setSelectedSource] = useState('All');
  const [rowLoading, setRowLoading] = useState({});

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  /**
   * Universal Client-Side Stock Verification Helper
   */
  const checkStockForUI = (order) => {
    const items = order.ordered_items || [];
    const orderLines = items.length > 0 ? items : [
      { name: order.product_name, quantity: order.quantity || 1 }
    ];
    
    let allAvailable = true;
    const missingItems = [];
    
    for (const item of orderLines) {
      const itemName = typeof item === 'object' ? (item.name || order.product_name) : order.product_name;
      const qtyNeeded = typeof item === 'object' ? (item.quantity || 1) : (order.quantity || 1);
      
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
          const box = toyBoxes.find(b => 
            (b.product_name || 'TOY BOX').toUpperCase().includes('TOY BOX') &&
            Number(b.toy_box_number) === boxNum
          );
          const available = box ? Number(box.stock_quantity) || 0 : 0;
          if (available < qtyNeeded) {
            allAvailable = false;
            missingItems.push(`Serial #${boxNum}: ${available}/${qtyNeeded}`);
          }
        } else {
          const match = toyBoxes.find(b => 
            (b.product_name || 'TOY BOX').toLowerCase() === itemName.toLowerCase()
          );
          const available = match ? Number(match.stock_quantity) || 0 : 0;
          if (available < qtyNeeded) {
            allAvailable = false;
            missingItems.push(`${itemName}: ${available}/${qtyNeeded}`);
          }
        }
      } else {
        const invMatch = api.matchInventoryProduct(itemName, inventory);
        if (invMatch) {
          const available = Number(invMatch.current_stock) || 0;
          if (available < qtyNeeded) {
            allAvailable = false;
            missingItems.push(`${invMatch.name}: ${available}/${qtyNeeded}`);
          }
        } else {
          allAvailable = false;
          missingItems.push(`${itemName}: Out of Stock`);
        }
      }
    }
    return { inStock: allAvailable, details: missingItems.join(', ') };
  };

  /**
   * Distribute currently filtered eligible in-stock orders
   */
  const handleDistributeFiltered = async () => {
    const eligibleOrders = bulkExportedQueue.filter(order => checkStockForUI(order).inStock);
    if (eligibleOrders.length === 0) {
      alert("No in-stock orders match your current filters.");
      return;
    }

    const confirmed = window.confirm(`Distribute ${eligibleOrders.length} filtered, in-stock orders to courier workflow?`);
    if (!confirmed) return;

    setIsDistributing(true);
    let successCount = 0;
    let failCount = 0;
    let errors = [];

    for (const order of eligibleOrders) {
      try {
        await distributeSingleOrder(order.id);
        successCount++;
      } catch (err) {
        failCount++;
        errors.push(`#${order.id.replace('ORD-', '')}: ${err.message}`);
      }
    }

    setIsDistributing(false);
    alert(`Successfully distributed ${successCount} orders. Failed: ${failCount}.${errors.length ? '\n\nErrors:\n' + errors.slice(0, 5).join('\n') : ''}`);
  };

  /**
   * Single Manual Order Dispatch
   */
  const handleSingleDistribute = async (e, orderId) => {
    e.stopPropagation();
    setRowLoading(prev => ({ ...prev, [orderId]: true }));
    try {
      await distributeSingleOrder(orderId);
    } catch (err) {
      alert("Manual dispatch failed: " + err.message);
    } finally {
      setRowLoading(prev => ({ ...prev, [orderId]: false }));
    }
  };

  // Modal State for Tracking ID
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeOrderId, setActiveOrderId] = useState(null);
  const [trackingIdInput, setTrackingIdInput] = useState('');

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);

  const handleOpenEditModal = (order) => {
    setSelectedOrder(order);
    setIsEditModalOpen(true);
  };

  const handleRowClick = (order) => {
    markOrderRead(order);
    setSelectedOrder(order);
    setIsDetailsModalOpen(true);
  };

  const matchesDate = (order) => {
    if (dateFilter === 'All') return true;
    const orderDate = new Date(order.updated_at || order.created_at);
    if (isNaN(orderDate.getTime())) return true;
    const today = new Date();
    
    if (dateFilter === 'Today') {
      return today.toDateString() === orderDate.toDateString();
    }
    if (dateFilter === 'Yesterday') {
      const yest = new Date();
      yest.setDate(today.getDate() - 1);
      return yest.toDateString() === orderDate.toDateString();
    }
    if (dateFilter === 'Last7Days') {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(today.getDate() - 7);
      return orderDate >= sevenDaysAgo;
    }
    if (dateFilter === 'ThisMonth') {
      return orderDate.getMonth() === today.getMonth() && orderDate.getFullYear() === today.getFullYear();
    }
    return true;
  };

  const matchesSearch = (order) => (
    (order.id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (order.customer_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (order.phone || '').includes(searchTerm)
  );

  const filterOrder = (order) => {
    // Search filter
    const matchesSearchVal = matchesSearch(order);
      
    // Date filter
    const matchesDateVal = matchesDate(order);

    // Product Filter
    const matchesProduct = selectedProduct === 'All' || order.product_name === selectedProduct;

    // Variant Filter
    let matchesVariant = true;
    if (selectedVariant !== 'All') {
      const items = order.ordered_items || [];
      matchesVariant = items.some(item => {
        const name = typeof item === 'object' ? (item.name || '') : '';
        return name.toLowerCase().includes(selectedVariant.toLowerCase());
      });
    }

    // Stock Status Filter
    let matchesStock = true;
    if (selectedStockStatus !== 'All') {
      const { inStock } = checkStockForUI(order);
      matchesStock = selectedStockStatus === 'InStock' ? inStock : !inStock;
    }

    // Delivery Zone Filter
    let matchesShipping = true;
    if (selectedShippingZone !== 'All') {
      const zone = (order.shipping_zone || '').toLowerCase();
      const targetZone = selectedShippingZone.toLowerCase();
      matchesShipping = zone.includes(targetZone) || targetZone.includes(zone);
    }

    // Order Source Filter
    let matchesSourceVal = true;
    if (selectedSource !== 'All') {
      matchesSourceVal = (order.source || '').toLowerCase().includes(selectedSource.toLowerCase());
    }

    return matchesSearchVal && matchesDateVal && matchesProduct && matchesVariant && matchesStock && matchesShipping && matchesSourceVal;
  };

  const bulkExportedAll = orders.filter((order) => order.status === 'Bulk Exported');
  const courierReadyAll = orders.filter((order) => order.status === 'Courier Ready');
  
  // Premium Filter Options List
  const uniqueProducts = Array.from(new Set(orders.map(o => o.product_name).filter(Boolean)));
  const uniqueVariants = Array.from(new Set(
    orders.flatMap(o => {
      const items = o.ordered_items || [];
      return items.map(item => {
        const name = typeof item === 'object' ? item.name || '' : '';
        const parts = name.split('-');
        return parts.length > 1 ? parts[parts.length - 1].trim() : null;
      }).filter(Boolean);
    })
  ));
  const uniqueSources = Array.from(new Set(orders.map(o => o.source).filter(Boolean)));

  const isFilterActive = Boolean(
    searchTerm ||
    dateFilter !== 'All' ||
    selectedProduct !== 'All' ||
    selectedVariant !== 'All' ||
    selectedStockStatus !== 'All' ||
    selectedShippingZone !== 'All' ||
    selectedSource !== 'All'
  );

  const resetAllFilters = () => {
    setSearchTerm('');
    setDateFilter('All');
    setSelectedProduct('All');
    setSelectedVariant('All');
    setSelectedStockStatus('All');
    setSelectedShippingZone('All');
    setSelectedSource('All');
    setCurrentPage(1);
  };

  const bulkExportedQueue = bulkExportedAll.filter(filterOrder);
  const courierReadyQueue = courierReadyAll.filter(filterOrder);
  const courierQueue = activeTab === 'bulk' ? bulkExportedQueue : courierReadyQueue;

  // Reset page whenever filters or active tab change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, dateFilter, selectedProduct, selectedVariant, selectedStockStatus, selectedShippingZone, selectedSource, activeTab, pageSize]);

  // Pagination Calculations
  const totalPages = Math.max(1, Math.ceil(courierQueue.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, courierQueue.length);
  const pagedCourierQueue = courierQueue.slice(startIndex, endIndex);

  const getPageNumbers = () => {
    const pages = [];
    const maxVisible = 5;
    let start = Math.max(1, safePage - Math.floor(maxVisible / 2));
    let end = Math.min(totalPages, start + maxVisible - 1);
    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  };
  
  const todayCount = (activeTab === 'bulk' ? bulkExportedAll : courierReadyAll).filter(o => {
    const today = new Date().toDateString();
    const orderDate = new Date(o.updated_at || o.created_at).toDateString();
    return today === orderDate;
  }).length;
  const { isOrderUnread, markOrderRead, unreadCount } = useRouteOrderReadState(`courier-panel:${activeTab}`, courierQueue);

  const withTrackingCount = courierReadyAll.filter(o => Boolean(o.tracking_id)).length;
  const pendingTrackingCount = courierReadyAll.length - withTrackingCount;

  const handleAutoDistribute = async () => {
    if (bulkExportedAll.length === 0) return;
    const confirmed = window.confirm(`Distribute ${bulkExportedAll.length} bulk exported orders to courier workflow?`);
    if (!confirmed) return;

    setIsDistributing(true);
    setDistributeResult(null);
    try {
      const result = await autoDistributeOrders('Bulk Exported');
      setDistributeResult(result);
      setActiveTab('ready');
      setTimeout(() => setDistributeResult(null), 8000);
    } catch (error) {
      console.error('Bulk exported distribution failed:', error);
      setDistributeResult({ error: error.message });
    } finally {
      setIsDistributing(false);
    }
  };

  const handleOpenTrackingModal = (order) => {
    setActiveOrderId(order.id);
    setTrackingIdInput(order.tracking_id || '');
    setIsModalOpen(true);
  };

  const handleSaveTracking = (e) => {
    e.preventDefault();
    if (activeOrderId && trackingIdInput) {
      editOrder(activeOrderId, { tracking_id: trackingIdInput });
    }
    setIsModalOpen(false);
  };

  const handleSubmitToCourier = async (orderOrId) => {
    const targetOrder = typeof orderOrId === 'object' ? orderOrId : orders.find(o => o.id === orderOrId);
    if (!targetOrder) return;

    if (!targetOrder.tracking_id && !targetOrder.courier_assigned_id) {
      await handleSteadfastDispatch(null, targetOrder);
    } else {
      updateOrderStatus(targetOrder.id, 'Courier Submitted');
    }
  };

  const handleSteadfastDispatch = async (e, order) => {
    if (e && e.stopPropagation) e.stopPropagation();

    const orderId = order.id;
    if (steadfastPending[orderId] || steadfastSubmitted[orderId]) {
      return;
    }

    setSteadfastPending((prev) => ({ ...prev, [orderId]: true }));

    try {
      const res = await dispatchToCourier(orderId);
      setSteadfastSubmitted((prev) => ({ ...prev, [orderId]: true }));
    } catch (err) {
      console.error('Steadfast Dispatch error:', err);
      alert('Steadfast Dispatch Failed: ' + (err.message || 'Unknown error'));
    } finally {
      setSteadfastPending((prev) => {
        const next = { ...prev };
        delete next[orderId];
        return next;
      });
    }
  };

  return (
    <motion.div 
      className="courier-panel"
      initial="hidden"
      animate="visible"
      variants={containerVariants}
    >
      <header className="page-header">
        <div>
          <h1 className="premium-title">Bulk Exported</h1>
          <p className="page-subtitle">Review exported confirmed batches, then distribute eligible orders to courier dispatch.</p>
        </div>
        <div className="factory-header-actions">
          <Button
            variant="primary"
            onClick={handleAutoDistribute}
            disabled={isDistributing || bulkExportedAll.length === 0}
            className="auto-distribute-btn"
          >
            {isDistributing ? <Loader2 size={18} className="spin" /> : <Zap size={18} />}
            <span>Auto Distribute ({bulkExportedAll.length})</span>
          </Button>
          <div className="active-dispatch-stat">
            <Truck size={20} />
            <span>{courierReadyAll.length} Ready</span>
          </div>
        </div>
      </header>

      <AnimatePresence>
        {distributeResult && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className={`distribute-result-toast ${distributeResult.error ? 'error' : 'success'}`}
          >
            {distributeResult.error ? <AlertTriangle size={18} /> : <CheckCircle size={18} />}
            <span>
              {distributeResult.error ? `Error: ${distributeResult.error}` : (
                <>
                  Distribution complete: <strong>{distributeResult.distributed}</strong> ready, <strong>{distributeResult.queued}</strong> queued.
                </>
              )}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="courier-summary-grid">
        <motion.div variants={itemVariants}>
          <Card className="courier-summary-card" noPadding>
            <div className="courier-summary-card-inner">
              <div className="courier-summary-icon total"><Package size={22} /></div>
              <div>
                <p className="courier-summary-label">Bulk Exported</p>
                <p className="courier-summary-value">{bulkExportedAll.length}</p>
              </div>
            </div>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Card className="courier-summary-card" noPadding>
            <div className="courier-summary-card-inner">
              <div className="courier-summary-icon assigned"><ClipboardCheck size={22} /></div>
              <div>
                <p className="courier-summary-label">Courier Ready</p>
                <p className="courier-summary-value">{courierReadyAll.length}</p>
              </div>
            </div>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Card className="courier-summary-card" noPadding>
            <div className="courier-summary-card-inner">
              <div className="courier-summary-icon pending"><Clock size={22} /></div>
              <div>
                <p className="courier-summary-label">Unassigned</p>
                <p className="courier-summary-value">{pendingTrackingCount}</p>
              </div>
            </div>
          </Card>
        </motion.div>
      </div>

      <div className="courier-tabs-container">
        <button
          type="button"
          className={`courier-tab ${activeTab === 'bulk' ? 'active' : ''}`}
          onClick={() => setActiveTab('bulk')}
        >
          <Package size={15} /> Bulk Exported ({bulkExportedAll.length})
        </button>
        <button
          type="button"
          className={`courier-tab ${activeTab === 'ready' ? 'active' : ''}`}
          onClick={() => setActiveTab('ready')}
        >
          <Truck size={15} /> Courier Ready ({courierReadyAll.length})
        </button>
      </div>

      <Card className="table-card" noPadding>
        {/* Ultimate Premium Filters Row */}
        <div className="courier-filters-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginRight: '4px' }}>
            <Filter size={16} style={{ color: 'var(--cp-text-muted)' }} />
            <span style={{ fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--cp-text-muted)' }}>Filters</span>
          </div>
          
          <select 
            className="premium-filter-select"
            value={selectedProduct}
            onChange={(e) => setSelectedProduct(e.target.value)}
          >
            <option value="All">All Products</option>
            {uniqueProducts.map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>

          <select 
            className="premium-filter-select"
            value={selectedVariant}
            onChange={(e) => setSelectedVariant(e.target.value)}
          >
            <option value="All">All Color/Variants</option>
            {uniqueVariants.map(v => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>

          <select 
            className="premium-filter-select"
            value={selectedStockStatus}
            onChange={(e) => setSelectedStockStatus(e.target.value)}
          >
            <option value="All">All Stock Status</option>
            <option value="InStock">In Stock Only</option>
            <option value="StockOut">Stock Out Only</option>
          </select>

          <select 
            className="premium-filter-select"
            value={selectedShippingZone}
            onChange={(e) => setSelectedShippingZone(e.target.value)}
          >
            <option value="All">All Delivery Zones</option>
            <option value="Inside Dhaka">Inside Dhaka</option>
            <option value="Sub Dhaka">Sub Dhaka</option>
            <option value="Outside Dhaka">Outside Dhaka</option>
          </select>

          {uniqueSources.length > 0 && (
            <select 
              className="premium-filter-select"
              value={selectedSource}
              onChange={(e) => setSelectedSource(e.target.value)}
            >
              <option value="All">All Sources</option>
              {uniqueSources.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          )}

          {isFilterActive && (
            <Button
              variant="ghost"
              size="sm"
              onClick={resetAllFilters}
              style={{
                fontSize: '0.78rem',
                fontWeight: 700,
                color: '#ef4444',
                padding: '4px 10px',
                height: '32px'
              }}
            >
              Reset Filters
            </Button>
          )}

          {activeTab === 'bulk' && bulkExportedQueue.length > 0 && (
            <Button
              variant="outline"
              onClick={handleDistributeFiltered}
              disabled={isDistributing}
              style={{
                marginLeft: 'auto',
                padding: '6px 14px',
                height: '34px',
                fontSize: '0.78rem',
                fontWeight: '800',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                borderColor: 'var(--cp-accent-bdr)',
                background: 'var(--cp-accent-bg)',
                color: 'var(--cp-accent)'
              }}
            >
              <Sparkles size={14} />
              <span>Distribute Filtered ({bulkExportedQueue.filter(o => checkStockForUI(o).inStock).length})</span>
            </Button>
          )}
        </div>

        <div className="table-search-bar">
          <div className="elite-search-wrapper">
            <Search className="elite-search-icon" size={18} />
            <input
              type="text"
              placeholder="Search ID, recipient or phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="elite-search-input"
            />
          </div>
          <div className="courier-date-filter" style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className={`pill-btn ${dateFilter === 'All' ? 'active' : ''}`}
              onClick={() => setDateFilter('All')}
              style={{
                padding: '4px 12px',
                borderRadius: '20px',
                fontSize: '0.78rem',
                border: '1px solid var(--border-color)',
                background: dateFilter === 'All' ? '#6366f1' : 'transparent',
                color: dateFilter === 'All' ? '#fff' : 'inherit',
                cursor: 'pointer',
                fontWeight: dateFilter === 'All' ? '600' : '400',
                transition: 'all 0.2s'
              }}
            >
              All Time
            </button>
            <button
              type="button"
              className={`pill-btn ${dateFilter === 'Today' ? 'active' : ''}`}
              onClick={() => setDateFilter('Today')}
              style={{
                padding: '4px 12px',
                borderRadius: '20px',
                fontSize: '0.78rem',
                border: '1px solid var(--border-color)',
                background: dateFilter === 'Today' ? '#6366f1' : 'transparent',
                color: dateFilter === 'Today' ? '#fff' : 'inherit',
                cursor: 'pointer',
                fontWeight: dateFilter === 'Today' ? '600' : '400',
                transition: 'all 0.2s'
              }}
            >
              Today ({todayCount})
            </button>
            <button
              type="button"
              className={`pill-btn ${dateFilter === 'Yesterday' ? 'active' : ''}`}
              onClick={() => setDateFilter('Yesterday')}
              style={{
                padding: '4px 12px',
                borderRadius: '20px',
                fontSize: '0.78rem',
                border: '1px solid var(--border-color)',
                background: dateFilter === 'Yesterday' ? '#6366f1' : 'transparent',
                color: dateFilter === 'Yesterday' ? '#fff' : 'inherit',
                cursor: 'pointer',
                fontWeight: dateFilter === 'Yesterday' ? '600' : '400',
                transition: 'all 0.2s'
              }}
            >
              Yesterday
            </button>
            <button
              type="button"
              className={`pill-btn ${dateFilter === 'Last7Days' ? 'active' : ''}`}
              onClick={() => setDateFilter('Last7Days')}
              style={{
                padding: '4px 12px',
                borderRadius: '20px',
                fontSize: '0.78rem',
                border: '1px solid var(--border-color)',
                background: dateFilter === 'Last7Days' ? '#6366f1' : 'transparent',
                color: dateFilter === 'Last7Days' ? '#fff' : 'inherit',
                cursor: 'pointer',
                fontWeight: dateFilter === 'Last7Days' ? '600' : '400',
                transition: 'all 0.2s'
              }}
            >
              7 Days
            </button>
            <button
              type="button"
              className={`pill-btn ${dateFilter === 'ThisMonth' ? 'active' : ''}`}
              onClick={() => setDateFilter('ThisMonth')}
              style={{
                padding: '4px 12px',
                borderRadius: '20px',
                fontSize: '0.78rem',
                border: '1px solid var(--border-color)',
                background: dateFilter === 'ThisMonth' ? '#6366f1' : 'transparent',
                color: dateFilter === 'ThisMonth' ? '#fff' : 'inherit',
                cursor: 'pointer',
                fontWeight: dateFilter === 'ThisMonth' ? '600' : '400',
                transition: 'all 0.2s'
              }}
            >
              This Month
            </button>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
            <Button 
              variant="outline" 
              onClick={() => setIsExportModalOpen(true)}
              style={{ padding: '6px 14px', height: '32px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <FileSpreadsheet size={14} />
              Export
            </Button>
          </div>
          <div className="queue-helper-text">
            <Truck size={14} />
            <span>Target verified inventory</span>
          </div>
          {unreadCount > 0 && (
            <span className="route-unread-count-pill" title="Orders not opened in Courier route">
              {unreadCount} unread
            </span>
          )}
        </div>

        <div className="courier-table-wrapper desktop-only">
          <table className="courier-management-table">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Recipient</th>
                <th>Product Package</th>
                <th>Tracking ID</th>
                <th>Stock Status</th>
                <th>Phase</th>
                <th className="courier-actions-col">Control</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence mode="popLayout">
                {pagedCourierQueue.map(order => {
                  const isBulkExported = order.status === 'Bulk Exported';
                  const isSteadfastSending = Boolean(steadfastPending[order.id]);
                  const isSteadfastSubmitted = Boolean(steadfastSubmitted[order.id]);
                  const isSteadfastLocked =
                    isBulkExported ||
                    isSteadfastSending ||
                    isSteadfastSubmitted ||
                    order.status === 'Courier Submitted' ||
                    Boolean(order.courier_assigned_id) ||
                    order.courier_name === 'Steadfast';

                  const { inStock, details } = checkStockForUI(order);
                  return (
                    <motion.tr 
                      key={order.id} 
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className={`courier-order-row cursor-pointer ${isOrderUnread(order) ? 'route-unread-row' : ''}`}
                      onClick={() => handleRowClick(order)}
                    >
                      <td className="ref-col order-id-cell">
                        <div className="route-read-card-header">
                          {isOrderUnread(order) && <span className="route-unread-dot" aria-label="Unread order" />}
                          <span className="saas-id">#{(order.id || '').replace('ORD-', '')}</span>
                          {isOrderUnread(order) && <span className="route-unread-chip">New</span>}
                        </div>
                      </td>
                      <td className="recipient-col">
                        <div className="courier-customer-stack">
                          <span className="saas-text-dark" title={order.customer_name}>{order.customer_name}</span>
                          <span className="saas-text">{order.phone}</span>
                        </div>
                      </td>
                      <td className="product-col">
                        <div className="courier-product-stack">
                          <span className="saas-text-dark" title={order.product_name}>{order.product_name}</span>
                          {order.size && <span className="product-size-pill">T-{order.size}</span>}
                        </div>
                      </td>
                      <td className="tracking-col">
                        {order.tracking_id ? (
                          <span className="tracking-badge" title={order.tracking_id}>
                            <Truck size={12} /> {order.tracking_id}
                          </span>
                        ) : (
                          <span className="text-tertiary text-xs italic">Awaiting...</span>
                        )}
                      </td>
                      <td className="stock-col">
                        {isBulkExported ? (
                          <div 
                            className={`stock-badge ${inStock ? 'in-stock' : 'stock-out'}`}
                            title={details}
                          >
                            <span className="stock-dot">●</span>
                            <span>{inStock ? 'In Stock' : 'Stock Out'}</span>
                          </div>
                        ) : (
                          <div className="stock-badge in-stock">
                            <span className="stock-dot">●</span>
                            <span>Assigned</span>
                          </div>
                        )}
                      </td>
                      <td className="phase-col">
                        <Badge variant={isBulkExported ? 'bulk-exported' : 'courier-ready'} className="courier-status-pill">
                          {isBulkExported ? 'Bulk Exported' : 'Ready'}
                        </Badge>
                      </td>
                      <td className="courier-actions-col courier-actions-cell">
                        <div className="dispatch-action-grid">
                          {isBulkExported && (
                            <button
                              className="courier-action-btn distribute"
                              disabled={!inStock || rowLoading[order.id]}
                              onClick={(e) => handleSingleDistribute(e, order.id)}
                              title={inStock ? "Distribute to Courier" : "Out of Stock - Locked"}
                            >
                              {rowLoading[order.id] ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />}
                              <span>{inStock ? 'Distribute' : 'No Stock'}</span>
                            </button>
                          )}
                          <button
                            className="courier-action-btn edit"
                            onClick={(e) => { e.stopPropagation(); handleOpenEditModal(order); }}
                            title="Adjust Details"
                          >
                            <Edit2 size={14} /> <span>Edit</span>
                          </button>
                          {!isBulkExported && (
                            <>
                              <button
                                className="courier-action-btn tracking"
                                onClick={(e) => { e.stopPropagation(); handleOpenTrackingModal(order); }}
                                title="Assign Tracking"
                              >
                                <Truck size={14} /> <span>Track</span>
                              </button>
                              <button
                                className={`courier-action-btn steadfast ${isSteadfastSending ? 'is-loading' : ''} ${isSteadfastSubmitted ? 'is-submitted' : ''}`}
                                onClick={(e) => handleSteadfastDispatch(e, order)}
                                disabled={isSteadfastLocked}
                                title="Direct API Dispatch"
                              >
                                {isSteadfastSending ? <Clock size={14} className="spin" /> : <Zap size={14} />}
                                <span>{isSteadfastSending ? '...' : isSteadfastSubmitted ? 'Sent' : 'S-Fast'}</span>
                              </button>
                              <button
                                className="courier-action-btn submit"
                                onClick={(e) => { e.stopPropagation(); handleSubmitToCourier(order); }}
                                disabled={isSteadfastSending}
                                title="Submit to Courier"
                              >
                                <CheckCircle size={14} /> <span>Submit</span>
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
              {courierQueue.length === 0 && (
                <tr>
                  <td colSpan="7" className="empty-state-cell">
                    <div className="empty-state-content">
                      <Truck size={40} style={{ opacity: 0.2, marginBottom: '12px' }} />
                      <p>{activeTab === 'bulk' ? 'No bulk exported orders waiting for distribution.' : 'No verified orders ready for dispatch.'}</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="courier-mobile-list mobile-only">
          <AnimatePresence>
            {pagedCourierQueue.map(order => {
              const isBulkExported = order.status === 'Bulk Exported';
              const isSteadfastSending = Boolean(steadfastPending[order.id]);
              const isSteadfastSubmitted = Boolean(steadfastSubmitted[order.id]);
              const isSteadfastLocked =
                isBulkExported ||
                isSteadfastSending ||
                isSteadfastSubmitted ||
                order.status === 'Courier Submitted' ||
                Boolean(order.courier_assigned_id) ||
                order.courier_name === 'Steadfast';

              const { inStock, details } = checkStockForUI(order);

              return (
                <motion.div
                  key={order.id}
                  layout
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  className={`courier-mobile-card ${isOrderUnread(order) ? 'route-unread-card' : ''}`}
                  onClick={() => handleRowClick(order)}
                >
                  <div className="card-header-elite">
                    <div className="route-read-card-header">
                      {isOrderUnread(order) && <span className="route-unread-dot" aria-label="Unread order" />}
                      <span className="order-id">#{order.id.replace('ORD-', '')}</span>
                      {isOrderUnread(order) && <span className="route-unread-chip">New</span>}
                    </div>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      {isBulkExported ? (
                        <div className={`stock-badge ${inStock ? 'in-stock' : 'stock-out'}`} title={details} style={{ scale: 0.9 }}>
                          <span>{inStock ? 'In Stock' : 'Stock Out'}</span>
                        </div>
                      ) : (
                        <div className="stock-badge in-stock" style={{ scale: 0.9 }}>
                          <span>Assigned</span>
                        </div>
                      )}
                      <Badge variant={isBulkExported ? 'bulk-exported' : 'courier-ready'} style={{ scale: 0.9 }}>
                        {isBulkExported ? 'Exported' : 'Ready'}
                      </Badge>
                    </div>
                  </div>

                  <div className="customer-primary-box">
                    <h3 className="customer-name-large">{order.customer_name}</h3>
                    <div className="phone-row">{order.phone}</div>
                  </div>

                  <div className="details-grid-elite">
                    <div className="detail-box-elite">
                      <span className="detail-label">Product</span>
                      <span className="detail-value product">{order.product_name}</span>
                      {order.size && <span className="detail-subvalue">Size {order.size}</span>}
                    </div>
                    <div className="detail-box-elite">
                      <span className="detail-label">Tracking</span>
                      <span className="detail-value">{isBulkExported ? 'Awaiting distribution' : (order.tracking_id || 'Awaiting')}</span>
                    </div>
                  </div>

                  <div className="courier-mobile-actions" onClick={(e) => e.stopPropagation()}>
                    {isBulkExported && (
                      <button 
                        className="courier-action-btn distribute" 
                        disabled={!inStock || rowLoading[order.id]}
                        onClick={(e) => handleSingleDistribute(e, order.id)}
                      >
                        {rowLoading[order.id] ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}
                        <span>{inStock ? 'Distribute' : 'No Stock'}</span>
                      </button>
                    )}
                    <button className="courier-action-btn edit" onClick={() => handleOpenEditModal(order)}>
                      <Edit2 size={16} /> <span>Edit</span>
                    </button>
                    {!isBulkExported && (
                      <>
                        <button className="courier-action-btn tracking" onClick={() => handleOpenTrackingModal(order)}>
                          <Truck size={16} /> <span>Track</span>
                        </button>
                        <button
                          className={`courier-action-btn steadfast ${isSteadfastSending ? 'is-loading' : ''} ${isSteadfastSubmitted ? 'is-submitted' : ''}`}
                          onClick={(e) => handleSteadfastDispatch(e, order)}
                          disabled={isSteadfastLocked}
                          title="Direct API Dispatch"
                        >
                          {isSteadfastSending ? <Clock size={16} className="spin" /> : <Zap size={16} />}
                          <span>{isSteadfastSending ? '...' : isSteadfastSubmitted ? 'Sent' : 'S-Fast'}</span>
                        </button>
                        <button
                          className="courier-action-btn submit"
                          onClick={() => handleSubmitToCourier(order)}
                          disabled={isSteadfastSending}
                        >
                          <CheckCircle size={16} /> <span>Submit</span>
                        </button>
                      </>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
          {courierQueue.length === 0 && (
            <div className="empty-state-cell">
              <p>{activeTab === 'bulk' ? 'No bulk exported orders waiting for distribution.' : 'No verified orders ready for dispatch.'}</p>
            </div>
          )}
        </div>

        {/* Pagination Footer */}
        <div className="pagination-footer">
          <div className="pagination-info">
            Showing {courierQueue.length > 0 ? startIndex + 1 : 0} to {endIndex} of {courierQueue.length} orders
            {totalPages > 1 && ` (Page ${safePage} of ${totalPages})`}
          </div>
          <div className="pagination-actions">
            <div className="page-size-selector">
              <span>Show per page:</span>
              <select
                className="page-size-select"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
            {totalPages > 1 && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={safePage === 1}
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                >
                  Previous
                </Button>
                <div className="page-numbers">
                  {getPageNumbers().map(p => (
                    <button
                      key={p}
                      className={`page-num ${safePage === p ? 'active' : ''}`}
                      onClick={() => setCurrentPage(p)}
                    >
                      {p}
                    </button>
                  ))}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={safePage === totalPages}
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                >
                  Next
                </Button>
              </>
            )}
          </div>
        </div>
      </Card>

      {/* Tracking ID Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Assign Courier Tracking"
      >
        <form onSubmit={handleSaveTracking} className="tracking-form">
          <div className="mb-4">
            <p className="saas-text" style={{ fontSize: '0.88rem', lineHeight: '1.6' }}>
              Enter the tracking identifier for <strong>#{(activeOrderId || '').replace('ORD-', '')}</strong>. 
              This will enable the final dispatch action.
            </p>
          </div>
          <Input
            label="Courier Tracking ID"
            placeholder="e.g. S-FAST-9921102"
            value={trackingIdInput}
            onChange={e => setTrackingIdInput(e.target.value)}
            required
            autoFocus
          />
          <div className="form-actions mt-4">
            <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>
              Discard
            </Button>
            <Button type="submit" variant="primary">
              Assign Identifier
            </Button>
          </div>
        </form>
      </Modal>

      <OrderEditModal 
        isOpen={isEditModalOpen} 
        onClose={() => setIsEditModalOpen(false)} 
        order={selectedOrder} 
      />

      <OrderDetailsModal 
        isOpen={isDetailsModalOpen} 
        onClose={() => setIsDetailsModalOpen(false)} 
        order={selectedOrder}
        onEdit={handleOpenEditModal}
      />

      <ExportModal 
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        allOrders={courierQueue}
        selectedOrderIds={[]} // We can pass selected IDs if there's a selection feature later
        currentFilters={{ searchTerm, dateFilter }}
      />
    </motion.div>
  );
};

// Internal icon for Steadfast
const Zap = ({ size, className }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2.5" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);
