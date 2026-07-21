import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useOrders } from '../context/OrderContext';
import api from '../lib/api';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { 
  Search, Truck, RotateCcw, ExternalLink, Calendar, User, Phone, MapPin, 
  RefreshCw, Zap, Package, ChevronLeft, ChevronRight 
} from 'lucide-react';
import { OrderDetailsModal } from '../components/OrderDetailsModal';
import { PackingSlip } from '../components/PackingSlip';
import { usePersistentState } from '../utils/persistentState';
import { useRouteOrderReadState } from '../hooks/useRouteOrderReadState';
import './SteadfastPanel.css';

const getVisiblePageNumbers = (currentPage, totalPages, maxVisible = 5) => {
  if (totalPages <= maxVisible) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
  let end = start + maxVisible - 1;
  if (end > totalPages) {
    end = totalPages;
    start = Math.max(1, end - maxVisible + 1);
  }
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
};

const containerVariants = {
  hidden: { opacity: 0, y: 15 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { staggerChildren: 0.08, duration: 0.35, ease: [0.4, 0, 0.2, 1] }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0 }
};

export const SteadfastPanel = () => {
  const { orders } = useOrders();
  const [searchTerm, setSearchTerm] = usePersistentState('panel:steadfast:search', '');
  const [dateFilter, setDateFilter] = usePersistentState('panel:steadfast:dateFilter', 'today'); // 'today' | 'yesterday' | '7days' | '30days' | 'all'
  const [statusFilter, setStatusFilter] = usePersistentState('panel:steadfast:statusFilter', 'all'); // 'all' | 'transit' | 'delivered' | 'pending' | 'returned'
  const [courierFilter, setCourierFilter] = usePersistentState('panel:steadfast:courierFilter', 'all'); // 'all' | 'steadfast' | 'pathao'
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = usePersistentState('panel:steadfast:pageSize', 20);

  const [syncStatus, setSyncStatus] = useState({});
  const [isBulkSyncing, setIsBulkSyncing] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [selectedIds, setSelectedIds] = useState(new Set());

  // Clock ticker for relative time displays
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 10000);
    return () => clearInterval(timer);
  }, []);

  const handleRowClick = (order) => {
    markOrderRead(order);
    setSelectedOrder(order);
    setIsDetailsModalOpen(true);
  };

  const isToday = (date) => {
    if (!date) return false;
    const d = new Date(date);
    const now = new Date();
    return d.getDate() === now.getDate() && 
           d.getMonth() === now.getMonth() && 
           d.getFullYear() === now.getFullYear();
  };

  const isYesterday = (date) => {
    if (!date) return false;
    const d = new Date(date);
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    return d.getDate() === yesterday.getDate() && 
           d.getMonth() === yesterday.getMonth() && 
           d.getFullYear() === yesterday.getFullYear();
  };

  const isWithinDays = (date, days) => {
    if (!date) return false;
    const d = new Date(date);
    const now = new Date();
    const diffTime = Math.abs(now - d);
    const diffDays = diffTime / (1000 * 60 * 60 * 24);
    return diffDays <= days;
  };

  // Filter orders dispatched to Steadfast & Pathao
  const filteredSteadfastOrders = useMemo(() => {
    return orders.filter(o => {
      const hasDispatch = o.tracking_id || o.dispatched_at || o.courier_assigned_id || o.courier_name === 'Steadfast' || o.courier_name === 'Pathao' || o.status === 'Courier Submitted';
      if (!hasDispatch) return false;

      // Courier Service Filter
      const cName = (o.courier_name || '').toLowerCase();
      if (courierFilter === 'steadfast' && !(cName.includes('steadfast') || cName.includes('sfast') || !cName)) return false;
      if (courierFilter === 'pathao' && !cName.includes('pathao')) return false;

      // Date Filtering
      const dispatchDate = o.dispatched_at || o.updated_at || o.created_at;
      if (dateFilter === 'today' && !isToday(dispatchDate)) return false;
      if (dateFilter === 'yesterday' && !isYesterday(dispatchDate)) return false;
      if (dateFilter === '7days' && !isWithinDays(dispatchDate, 7)) return false;
      if (dateFilter === '30days' && !isWithinDays(dispatchDate, 30)) return false;

      // Status Filtering
      const cStatus = String(o.courier_status || o.status || '').toLowerCase();
      if (statusFilter === 'transit' && !(cStatus.includes('pick') || cStatus.includes('transit') || cStatus.includes('handover') || cStatus.includes('submitted') || cStatus.includes('ready') || cStatus.includes('review'))) return false;
      if (statusFilter === 'delivered' && !cStatus.includes('delivered')) return false;
      if (statusFilter === 'pending' && !(cStatus.includes('pending') || cStatus.includes('hold'))) return false;
      if (statusFilter === 'returned' && !(cStatus.includes('return') || cStatus.includes('cancel'))) return false;

      // Search Filtering
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase().trim();
        const matchesSearch = 
          (o.id || '').toLowerCase().includes(query) ||
          (o.customer_name || '').toLowerCase().includes(query) ||
          (o.phone || '').includes(query) ||
          (o.tracking_id || '').toLowerCase().includes(query) ||
          (o.courier_assigned_id || '').toLowerCase().includes(query) ||
          (o.address || '').toLowerCase().includes(query);
        if (!matchesSearch) return false;
      }

      return true;
    }).sort((a, b) => new Date(b.dispatched_at || b.updated_at || b.created_at) - new Date(a.dispatched_at || a.updated_at || a.created_at));
  }, [orders, dateFilter, statusFilter, courierFilter, searchTerm]);

  const { isOrderUnread, markOrderRead, unreadCount } = useRouteOrderReadState('steadfast-panel', filteredSteadfastOrders);

  // Pagination calculations
  const totalPages = Math.ceil(filteredSteadfastOrders.length / itemsPerPage) || 1;
  const safePage = Math.min(currentPage, totalPages);
  const pagedOrders = useMemo(() => {
    const start = (safePage - 1) * itemsPerPage;
    return filteredSteadfastOrders.slice(start, start + itemsPerPage);
  }, [filteredSteadfastOrders, safePage, itemsPerPage]);

  // Reset page to 1 on filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, dateFilter, statusFilter, itemsPerPage]);

  const visiblePages = useMemo(() => getVisiblePageNumbers(safePage, totalPages), [safePage, totalPages]);

  const toggleSelectAllPage = () => {
    const pageIds = pagedOrders.map(o => o.id);
    const allSelected = pageIds.every(id => selectedIds.has(id));
    const next = new Set(selectedIds);
    if (allSelected) {
      pageIds.forEach(id => next.delete(id));
    } else {
      pageIds.forEach(id => next.add(id));
    }
    setSelectedIds(next);
  };

  const toggleSelect = (e, id) => {
    e.stopPropagation();
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handlePrintSelection = () => {
    window.print();
  };

  const handleSyncStatus = async (orderId, trackingCode) => {
    if (!orderId && !trackingCode) return;
    setSyncStatus(prev => ({ ...prev, [orderId]: 'syncing' }));
    try {
      await api.getSteadfastStatus(orderId, trackingCode);
      setSyncStatus(prev => ({ ...prev, [orderId]: 'done' }));
      setTimeout(() => setSyncStatus(prev => {
        const next = { ...prev };
        delete next[orderId];
        return next;
      }), 2000);
    } catch (err) {
      console.error('Manual sync failed:', err);
      setSyncStatus(prev => ({ ...prev, [orderId]: 'error' }));
    }
  };

  const handleBulkSyncStatuses = async () => {
    const activeOrders = filteredSteadfastOrders.filter(o => o.tracking_id || o.courier_assigned_id);
    if (activeOrders.length === 0) {
      alert("No active courier tracking codes found in current view.");
      return;
    }

    setIsBulkSyncing(true);
    let count = 0;

    for (const order of activeOrders) {
      try {
        await api.getSteadfastStatus(order.id, order.tracking_id);
        count++;
      } catch (err) {
        console.warn(`Bulk sync skipped for #${order.id}:`, err);
      }
    }

    setIsBulkSyncing(false);
    alert(`Live status sync complete for ${count} orders!`);
  };

  const getTimeSinceDispatch = (dispatchedAt) => {
    if (!dispatchedAt) return null;
    const diff = Math.floor((currentTime - new Date(dispatchedAt)) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  const getStatusVariant = (status) => {
    const s = String(status || '').toLowerCase();
    if (s.includes('delivered')) return 'success';
    if (s.includes('return') || s.includes('cancel')) return 'danger';
    if (s.includes('pending') || s.includes('hold')) return 'warning';
    if (s.includes('pick') || s.includes('transit') || s.includes('submitted')) return 'info';
    return 'neutral';
  };

  const isCurrentPageAllSelected = pagedOrders.length > 0 && pagedOrders.every(o => selectedIds.has(o.id));

  return (
    <motion.div 
      className="steadfast-panel"
      initial="hidden"
      animate="visible"
      variants={containerVariants}
    >
      <header className="panel-header">
        <div>
          <h1 className="premium-title">Steadfast Logistics Hub</h1>
          <p className="text-secondary">Mission-critical courier tracking, live parcel monitoring and automated delivery updates.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            type="button"
            className="sync-all-btn"
            onClick={handleBulkSyncStatuses}
            disabled={isBulkSyncing || filteredSteadfastOrders.length === 0}
            title="Auto sync live courier status from API"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              borderRadius: '12px',
              border: '1px solid rgba(99,102,241,0.3)',
              background: 'rgba(99,102,241,0.1)',
              color: 'var(--sl-accent)',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: 'pointer'
            }}
          >
            <RefreshCw size={15} className={isBulkSyncing ? 'spin' : ''} />
            <span>{isBulkSyncing ? 'Syncing...' : 'Live Sync Status'}</span>
          </button>
          <div className="active-dispatch-stat">
            <Zap size={18} />
            <span>Steadfast API Live</span>
          </div>
        </div>
      </header>

      <div className="stats-grid">
        <motion.div variants={itemVariants}>
          <Card className="stat-card">
            <div className="stat-label">Total In Hub</div>
            <div className="stat-value text-accent">
              {filteredSteadfastOrders.length}
            </div>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Card className="stat-card">
            <div className="stat-label">Active In Transit</div>
            <div className="stat-value text-info">
              {filteredSteadfastOrders.filter(o => !String(o.courier_status).toLowerCase().includes('delivered') && !String(o.courier_status).toLowerCase().includes('return')).length}
            </div>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Card className="stat-card">
            <div className="stat-label">Delivered</div>
            <div className="stat-value text-success">
              {filteredSteadfastOrders.filter(o => String(o.courier_status).toLowerCase().includes('delivered')).length}
            </div>
          </Card>
        </motion.div>
      </div>

      <div className="hub-actions-bar">
        {selectedIds.size > 0 && (
          <motion.button 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="pulse-glow"
            onClick={handlePrintSelection}
          >
            Mark & Generate Labels ({selectedIds.size})
          </motion.button>
        )}
      </div>

      <Card className="table-card" noPadding>
        {/* Search & Filters Controls Bar */}
        <div className="table-search-bar">
          <div className="elite-search-wrapper">
            <Search className="elite-search-icon" size={18} />
            <input
              type="text"
              placeholder="Search logistics by tracking, consignment, customer name or phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="elite-search-input"
            />
          </div>

          <div className="filter-controls-cluster">
            {/* Courier Provider Filter Group */}
            <div className="courier-filter-group" style={{ display: 'flex', gap: '6px' }}>
              <button className={`filter-pill ${courierFilter === 'all' ? 'active' : ''}`} onClick={() => setCourierFilter('all')}>All Couriers</button>
              <button className={`filter-pill ${courierFilter === 'steadfast' ? 'active' : ''}`} onClick={() => setCourierFilter('steadfast')}>Steadfast</button>
              <button className={`filter-pill ${courierFilter === 'pathao' ? 'active' : ''}`} onClick={() => setCourierFilter('pathao')}>Pathao</button>
            </div>

            {/* Date Range Filter Group */}
            <div className="date-filter-group">
              <button className={`filter-pill ${dateFilter === 'today' ? 'active' : ''}`} onClick={() => setDateFilter('today')}>Today</button>
              <button className={`filter-pill ${dateFilter === 'yesterday' ? 'active' : ''}`} onClick={() => setDateFilter('yesterday')}>Yesterday</button>
              <button className={`filter-pill ${dateFilter === '7days' ? 'active' : ''}`} onClick={() => setDateFilter('7days')}>7 Days</button>
              <button className={`filter-pill ${dateFilter === '30days' ? 'active' : ''}`} onClick={() => setDateFilter('30days')}>30 Days</button>
              <button className={`filter-pill ${dateFilter === 'all' ? 'active' : ''}`} onClick={() => setDateFilter('all')}>All Hub</button>
            </div>

            {/* Status Filter Group */}
            <div className="status-filter-group">
              <button className={`filter-pill ${statusFilter === 'all' ? 'active' : ''}`} onClick={() => setStatusFilter('all')}>All Status</button>
              <button className={`filter-pill ${statusFilter === 'transit' ? 'active' : ''}`} onClick={() => setStatusFilter('transit')}>Transit</button>
              <button className={`filter-pill ${statusFilter === 'delivered' ? 'active' : ''}`} onClick={() => setStatusFilter('delivered')}>Delivered</button>
              <button className={`filter-pill ${statusFilter === 'pending' ? 'active' : ''}`} onClick={() => setStatusFilter('pending')}>Pending</button>
              <button className={`filter-pill ${statusFilter === 'returned' ? 'active' : ''}`} onClick={() => setStatusFilter('returned')}>Returned</button>
            </div>
          </div>

          {unreadCount > 0 && (
            <span className="route-unread-count-pill" title="Unread orders in Steadfast Hub">
              {unreadCount} unread
            </span>
          )}
        </div>

        {/* Unified Responsive Table View */}
        <div className="courier-table-wrapper">
          <table className="order-table">
            <thead>
              <tr>
                <th className="checkbox-col">
                  <input type="checkbox" checked={isCurrentPageAllSelected} onChange={toggleSelectAllPage} />
                </th>
                <th>Logistics Identifiers</th>
                <th>Consignment & Recipient</th>
                <th>Node Status</th>
                <th>Dispatch Analytics</th>
                <th style={{ textAlign: 'right' }}>Live Sync</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence mode="popLayout">
                {pagedOrders.map(order => (
                  <motion.tr 
                    key={order.id} 
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className={`tracking-row cursor-pointer ${selectedIds.has(order.id) ? 'row-selected' : ''} ${isOrderUnread(order) ? 'route-unread-row' : ''}`}
                    onClick={() => handleRowClick(order)}
                  >
                    <td className="checkbox-col">
                      <input type="checkbox" checked={selectedIds.has(order.id)} onChange={(e) => toggleSelect(e, order.id)} onClick={(e) => e.stopPropagation()} />
                    </td>
                    <td className="logistics-info-cell">
                      <div className="id-block">
                        <span className="courier-label">Consignment ID</span>
                        <code className="courier-id-value">{order.courier_assigned_id || 'Waiting Sync'}</code>
                      </div>
                      <div className="id-block" style={{ marginTop: '8px' }}>
                        <span className="courier-label">Tracking Code</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span className="tracking-value">{order.tracking_id || 'Unassigned'}</span>
                          {order.tracking_id && (
                            <a href={`https://portal.packzy.com/tracking/${order.tracking_id}`} target="_blank" rel="noreferrer" className="external-link" onClick={e => e.stopPropagation()}>
                              <ExternalLink size={12} />
                            </a>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="customer-details-cell">
                        <div style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span className="route-read-card-header">
                            {isOrderUnread(order) && <span className="route-unread-dot" aria-label="Unread order" />}
                            <span className="id-badge">#{order.id.replace('ORD-', '')}</span>
                            {isOrderUnread(order) && <span className="route-unread-chip">New</span>}
                          </span>
                          <span className="courier-pill">S-FAST</span>
                        </div>
                        <div className="customer-info-stack">
                          <div className="customer-name-row"><User size={12} /> {order.customer_name}</div>
                          <div><Phone size={12} /> {order.phone}</div>
                          <div className="customer-address-row" title={order.address}><MapPin size={12} /> {order.address}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="status-container">
                        <Badge variant={getStatusVariant(order.courier_status)}>
                          {order.courier_status || 'Handover'}
                        </Badge>
                        <div className="last-sync-text">
                          <RotateCcw size={10} /> Live Monitoring
                        </div>
                      </div>
                    </td>
                    <td className="temporal-cell">
                      <div className="dispatch-timestamp">
                        <Calendar size={12} /> 
                        {order.dispatched_at ? new Date(order.dispatched_at).toLocaleDateString() : 'N/A'}
                      </div>
                      {order.dispatched_at && (
                        <div className="dispatch-clock">
                          <Truck size={12} /> {getTimeSinceDispatch(order.dispatched_at)}
                        </div>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button 
                        className={`item-sync-btn ${syncStatus[order.id] || ''}`}
                        onClick={(e) => { e.stopPropagation(); handleSyncStatus(order.id, order.tracking_id); }}
                        disabled={syncStatus[order.id] === 'syncing' || !order.tracking_id}
                        title="Sync live status from Steadfast"
                      >
                        <RefreshCw size={16} className={syncStatus[order.id] === 'syncing' ? 'animate-spin' : ''} />
                      </button>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
              {pagedOrders.length === 0 && (
                <tr>
                  <td colSpan="6" className="empty-state-cell">
                    <div style={{ padding: '60px 0', textAlign: 'center', opacity: 0.5 }}>
                      <Package size={40} style={{ margin: '0 auto 12px' }} />
                      <p>No logistics records match the current filters.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Responsive Pagination Bar */}
        {filteredSteadfastOrders.length > 0 && (
          <div className="steadfast-pagination">
            <div className="pagination-info">
              Showing {(safePage - 1) * itemsPerPage + 1} to {Math.min(safePage * itemsPerPage, filteredSteadfastOrders.length)} of {filteredSteadfastOrders.length} entries
            </div>

            <div className="pagination-controls">
              <div className="items-per-page-picker">
                <span>Show:</span>
                <select 
                  value={itemsPerPage} 
                  onChange={(e) => setItemsPerPage(Number(e.target.value))}
                  className="page-select"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
              </div>

              <div className="page-buttons">
                <button 
                  className="page-nav-btn"
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={safePage === 1}
                  title="Previous Page"
                >
                  <ChevronLeft size={16} />
                </button>

                {visiblePages.map(page => (
                  <button
                    key={page}
                    className={`page-num-btn ${safePage === page ? 'active' : ''}`}
                    onClick={() => setCurrentPage(page)}
                  >
                    {page}
                  </button>
                ))}

                <button 
                  className="page-nav-btn"
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={safePage === totalPages}
                  title="Next Page"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </div>
        )}
      </Card>

      <OrderDetailsModal 
        isOpen={isDetailsModalOpen} 
        onClose={() => setIsDetailsModalOpen(false)} 
        order={selectedOrder}
      />

      <PackingSlip orders={orders.filter(o => selectedIds.has(o.id))} />
    </motion.div>
  );
};
