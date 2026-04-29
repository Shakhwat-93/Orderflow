import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useOrders } from '../context/OrderContext';
import api from '../lib/api';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Search, Truck, RotateCcw, ExternalLink, Calendar, User, Phone, MapPin, RefreshCw, Zap, Package, CheckCircle } from 'lucide-react';
import { OrderDetailsModal } from '../components/OrderDetailsModal';
import { PackingSlip } from '../components/PackingSlip';
import { usePersistentState } from '../utils/persistentState';
import { useRouteOrderReadState } from '../hooks/useRouteOrderReadState';
import './SteadfastPanel.css';

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

export const SteadfastPanel = () => {
  const { orders } = useOrders();
  const [searchTerm, setSearchTerm] = usePersistentState('panel:steadfast:search', '');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState({});
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [dateFilter, setDateFilter] = usePersistentState('panel:steadfast:dateFilter', 'today'); // 'today' | 'yesterday' | 'all'
  const [selectedIds, setSelectedIds] = useState(new Set());

  const toggleSelectAll = () => {
    if (selectedIds.size === steadfastOrders.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(steadfastOrders.map(o => o.id)));
    }
  };

  const toggleSelect = (e, id) => {
    e.stopPropagation();
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const handlePrintSelection = () => {
    window.print();
  };

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
    const d = new Date(date);
    const now = new Date();
    return d.getDate() === now.getDate() && 
           d.getMonth() === now.getMonth() && 
           d.getFullYear() === now.getFullYear();
  };

  const isYesterday = (date) => {
    const d = new Date(date);
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    return d.getDate() === yesterday.getDate() && 
           d.getMonth() === yesterday.getMonth() && 
           d.getFullYear() === yesterday.getFullYear();
  };

  // Filter orders that have been dispatched
  const steadfastOrders = orders.filter(o => {
    const hasDispatch = o.tracking_id || o.dispatched_at;
    if (!hasDispatch) return false;

    // Date Filtering
    const dispatchDate = o.dispatched_at || o.updated_at || o.created_at;
    if (dateFilter === 'today' && !isToday(dispatchDate)) return false;
    if (dateFilter === 'yesterday' && !isYesterday(dispatchDate)) return false;

    // Search Filtering
    const matchesSearch = 
      (o.id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (o.customer_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (o.phone || '').includes(searchTerm) ||
      (o.tracking_id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (o.courier_assigned_id || '').toLowerCase().includes(searchTerm.toLowerCase());

    return matchesSearch;
  }).sort((a, b) => new Date(b.dispatched_at || b.updated_at || b.created_at) - new Date(a.dispatched_at || a.updated_at || a.created_at));
  const { isOrderUnread, markOrderRead, unreadCount } = useRouteOrderReadState('steadfast-panel', steadfastOrders);

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
    if (s.includes('pick') || s.includes('transit')) return 'info';
    return 'neutral';
  };

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
          <p className="text-secondary">Mission-critical courier tracking and delivery verification.</p>
        </div>
        <div className="active-dispatch-stat">
          <Zap size={18} />
          <span>Node Secured</span>
        </div>
      </header>

      <div className="stats-grid">
        <motion.div variants={itemVariants}>
          <Card className="stat-card">
            <div className="stat-label">Active Transit</div>
            <div className="stat-value text-accent">
              {steadfastOrders.filter(o => !String(o.courier_status).toLowerCase().includes('delivered')).length}
            </div>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Card className="stat-card">
            <div className="stat-label">Delivered Today</div>
            <div className="stat-value text-success">
              {steadfastOrders.filter(o => 
                String(o.courier_status).toLowerCase().includes('delivered') &&
                isToday(o.updated_at)
              ).length}
            </div>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Card className="stat-card">
            <div className="stat-label">Pending Transit</div>
            <div className="stat-value text-warning">
              {steadfastOrders.filter(o => String(o.courier_status).toLowerCase().includes('pending')).length}
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
        <div className="table-search-bar">
          <div className="elite-search-wrapper">
            <Search className="elite-search-icon" size={18} />
            <input
              type="text"
              placeholder="Search logistics by tracking, ID or customer..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="elite-search-input"
            />
          </div>
          <div className="date-filter-group">
            <button className={`filter-pill ${dateFilter === 'today' ? 'active' : ''}`} onClick={() => setDateFilter('today')}>Today</button>
            <button className={`filter-pill ${dateFilter === 'yesterday' ? 'active' : ''}`} onClick={() => setDateFilter('yesterday')}>Yesterday</button>
            <button className={`filter-pill ${dateFilter === 'all' ? 'active' : ''}`} onClick={() => setDateFilter('all')}>All Hub</button>
          </div>
          {unreadCount > 0 && (
            <span className="route-unread-count-pill" title="Orders not opened in Steadfast route">
              {unreadCount} unread
            </span>
          )}
        </div>

        <div className="courier-table-wrapper">
          <table className="order-table">
            <thead>
              <tr>
                <th className="checkbox-col">
                  <input type="checkbox" checked={selectedIds.size === steadfastOrders.length && steadfastOrders.length > 0} onChange={toggleSelectAll} />
                </th>
                <th>Logistics Identifiers</th>
                <th>Consignment & Recipient</th>
                <th>Node Status</th>
                <th>Dispatch Analytics</th>
                <th style={{ textAlign: 'right' }}>Sync</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence mode="popLayout">
                {steadfastOrders.map(order => (
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
                        <span className="courier-label">Consignment</span>
                        <code className="courier-id-value">{order.courier_assigned_id || 'Waiting Sync'}</code>
                      </div>
                      <div className="id-block" style={{ marginTop: '8px' }}>
                        <span className="courier-label">Tracking</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span className="tracking-value">{order.tracking_id || 'Unassigned'}</span>
                          {order.tracking_id && (
                            <a href={`https://portal.steadfast.com.bd/tracking/${order.tracking_id}`} target="_blank" rel="noreferrer" className="external-link" onClick={e => e.stopPropagation()}>
                              <ExternalLink size={12} />
                            </a>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="customer-details-cell">
                        <div style={{ marginBottom: '8px' }}>
                          <span className="route-read-card-header">
                            {isOrderUnread(order) && <span className="route-unread-dot" aria-label="Unread order" />}
                            <span className="id-badge">#{order.id}</span>
                            {isOrderUnread(order) && <span className="route-unread-chip">New</span>}
                          </span>
                          <span className="courier-pill">S-FAST</span>
                        </div>
                        <div className="customer-info-stack">
                          <div className="customer-name-row"><User size={12} /> {order.customer_name}</div>
                          <div><Phone size={12} /> {order.phone}</div>
                          <div className="customer-address-row"><MapPin size={12} /> {order.address}</div>
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
                      >
                        <RefreshCw size={16} className={syncStatus[order.id] === 'syncing' ? 'animate-spin' : ''} />
                      </button>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
              {steadfastOrders.length === 0 && (
                <tr>
                  <td colSpan="6" className="empty-state-cell">
                    <div style={{ padding: '60px 0', textAlign: 'center', opacity: 0.5 }}>
                      <Package size={40} style={{ margin: '0 auto 12px' }} />
                      <p>No logistics data found for this period.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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
