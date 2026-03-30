import { useState, useEffect } from 'react';
import { useOrders } from '../context/OrderContext';
import api from '../lib/api';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Search, Truck, RotateCcw, ExternalLink, Calendar, User, Phone, MapPin, RefreshCw } from 'lucide-react';
import { OrderDetailsModal } from '../components/OrderDetailsModal';
import { PackingSlip } from '../components/PackingSlip';
import './SteadfastPanel.css';

export const SteadfastPanel = () => {
  const { orders } = useOrders();
  const [searchTerm, setSearchTerm] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState({});
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [dateFilter, setDateFilter] = useState('today'); // 'today' | 'yesterday' | 'all'
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

  // Filter orders that have been dispatched (have tracking_id or dispatched_at)
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

  const handleSyncStatus = async (orderId, trackingCode) => {
    if (!orderId && !trackingCode) return;
    setSyncStatus(prev => ({ ...prev, [orderId]: 'syncing' }));
    try {
      await api.getSteadfastStatus(orderId, trackingCode);
      setSyncStatus(prev => ({ ...prev, [orderId]: 'done' }));
    } catch (err) {
      console.error('Manual sync failed:', err);
      setSyncStatus(prev => ({ ...prev, [orderId]: 'error' }));
    }
  };

  // --- Automatic Background Sync ---
  useEffect(() => {
    // Only poll active orders in the current view
    const activeOrders = steadfastOrders.filter(o => 
      o.tracking_id && 
      !['delivered', 'cancelled', 'returned'].includes(String(o.courier_status).toLowerCase())
    ).slice(0, 10); // Sync top 10

    if (activeOrders.length === 0) return;

    const interval = setInterval(() => {
      activeOrders.forEach(order => {
        handleSyncStatus(order.id, order.tracking_id);
      });
    }, 45000); // 45 seconds for logistics precision

    return () => clearInterval(interval);
  }, [steadfastOrders]);

  // Proactive ID Recovery: Auto-sync orders with missing numerical IDs
  useEffect(() => {
    // Only target orders that are missing the numerical ID
    const missingIdOrders = steadfastOrders.filter(o => !o.courier_assigned_id);
    if (missingIdOrders.length > 0) {
      // Sync them one by one to heal the data gaps
      missingIdOrders.slice(0, 5).forEach((order, index) => {
        setTimeout(() => {
          handleSyncStatus(order.id, order.tracking_id);
        }, index * 1500); // 1.5s staggered delay
      });
    }
  }, [steadfastOrders.length]); 

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
    <div className="steadfast-panel fade-in">
      <div className="panel-header">
        <div className="header-content">
          <h1 className="text-2xl font-bold text-primary flex items-center gap-2">
            <Truck className="text-accent" size={28} />
            Steadfast Logistics Hub
          </h1>
          <p className="text-secondary">Precision tracking for the packaging and logistics department.</p>
        </div>
      </div>

      <div className="stats-grid mb-6">
        <Card className="stat-card">
          <div className="stat-label">In Transit</div>
          <div className="stat-value text-accent">
            {steadfastOrders.filter(o => !String(o.courier_status).toLowerCase().includes('delivered')).length}
          </div>
        </Card>
        <Card className="stat-card">
          <div className="stat-label">Delivered Today</div>
          <div className="stat-value text-success">
            {steadfastOrders.filter(o => 
              String(o.courier_status).toLowerCase().includes('delivered') &&
              new Date(o.updated_at).toLocaleDateString() === new Date().toLocaleDateString()
            ).length}
          </div>
        </Card>
        <Card className="stat-card">
          <div className="stat-label">Ready for Transit</div>
          <div className="stat-value text-warning">
            {steadfastOrders.filter(o => String(o.courier_status).toLowerCase().includes('pending')).length}
          </div>
        </Card>
      </div>

      <div className="hub-actions-bar mb-4">
        {selectedIds.size > 0 && (
          <Button 
            variant="accent" 
            onClick={handlePrintSelection}
            className="pulse-glow"
          >
            Print Selection ({selectedIds.size})
          </Button>
        )}
      </div>

      <Card className="table-card overflow-hidden">
        <div className="table-search-bar">
          <div className="elite-search-wrapper">
            <Search className="elite-search-icon" size={18} />
            <input 
              type="text" 
              placeholder="Search by ID, Customer, Courier ID or Tracking..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="elite-search-input"
            />
          </div>
          <div className="date-filter-group">
            <button 
              className={`filter-pill ${dateFilter === 'today' ? 'active' : ''}`}
              onClick={() => setDateFilter('today')}
            >
              Today
            </button>
            <button 
              className={`filter-pill ${dateFilter === 'yesterday' ? 'active' : ''}`}
              onClick={() => setDateFilter('yesterday')}
            >
              Yesterday
            </button>
            <button 
              className={`filter-pill ${dateFilter === 'all' ? 'active' : ''}`}
              onClick={() => setDateFilter('all')}
            >
              All Time
            </button>
          </div>
        </div>

        <div className="table-container">
          <table className="order-table">
            <thead>
              <tr>
                <th className="checkbox-col">
                  <input 
                    type="checkbox" 
                    checked={selectedIds.size === steadfastOrders.length && steadfastOrders.length > 0} 
                    onChange={toggleSelectAll}
                  />
                </th>
                <th className="logistics-col">Courier Logistics</th>
                <th>Order & Customer</th>
                <th>Delivery Status</th>
                <th>Dispatch Time</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {steadfastOrders.map(order => (
                <tr key={order.id} className={`tracking-row cursor-pointer ${selectedIds.has(order.id) ? 'row-selected' : ''}`} onClick={() => handleRowClick(order)}>
                  <td>
                    <input 
                      type="checkbox" 
                      checked={selectedIds.has(order.id)} 
                      onChange={(e) => toggleSelect(e, order.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </td>
                  <td className="logistics-info-cell">
                    <div 
                      className="courier-id-block clickable" 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSyncStatus(order.id, order.tracking_id);
                      }}
                      title="Click to Force Sync with Steadfast"
                    >
                      <span className="courier-label">Consignment ID</span>
                      <code className="courier-id-value">
                        {order.courier_assigned_id || 'Sync Required'}
                      </code>
                      {!order.courier_assigned_id && <RefreshCw size={12} className="sync-spinner-subtle" />}
                    </div>
                    <div className="tracking-id-block mt-3">
                      <span className="courier-label">Tracking Code</span>
                      <div className="tracking-flex">
                        <code className="tracking-value">{order.tracking_id || 'N/A'}</code>
                        {order.tracking_id && (
                          <a 
                            href={`https://portal.steadfast.com.bd/tracking/${order.tracking_id}`} 
                            target="_blank" 
                            rel="noreferrer"
                            className="external-link"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink size={14} />
                          </a>
                        )}
                      </div>
                    </div>
                  </td>

                  <td className="customer-details-cell">
                    <div className="order-id-pills">
                      <span className="id-badge">#{order.id}</span>
                      <span className="courier-pill">{order.courier_name || 'Steadfast'}</span>
                    </div>
                    <div className="customer-info-stack">
                      <div className="customer-name-row"><User size={12} /> {order.customer_name}</div>
                      <div className="customer-phone-row"><Phone size={12} /> {order.phone}</div>
                      <div className="customer-address-row"><MapPin size={12} /> {order.address}</div>
                    </div>
                  </td>

                  <td>
                    <div className="status-container">
                      <Badge variant={getStatusVariant(order.courier_status)}>
                        {order.courier_status || 'Submitted'}
                      </Badge>
                      <div className="last-sync-text">
                        <RotateCcw size={10} /> Auto-Syncing
                      </div>
                    </div>
                  </td>

                  <td className="temporal-cell">
                    <div className="dispatch-timestamp">
                      <Calendar size={12} /> 
                      {order.dispatched_at ? new Date(order.dispatched_at).toLocaleString() : new Date(order.updated_at).toLocaleString()}
                    </div>
                    {order.dispatched_at && (
                      <div className="dispatch-clock pulse-text">
                        <Truck size={12} /> {getTimeSinceDispatch(order.dispatched_at)}
                      </div>
                    )}
                  </td>

                  <td>
                    <div className="action-flex">
                      <button 
                        className={`item-sync-btn ${syncStatus[order.id] || ''}`}
                        onClick={(e) => { e.stopPropagation(); handleSyncStatus(order.id, order.tracking_id); }}
                        disabled={syncStatus[order.id] === 'syncing' || !order.tracking_id}
                        title="Force Status Sync"
                      >
                        <RotateCcw size={16} className={syncStatus[order.id] === 'syncing' ? 'animate-spin' : ''} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <OrderDetailsModal 
        isOpen={isDetailsModalOpen} 
        onClose={() => setIsDetailsModalOpen(false)} 
        order={selectedOrder}
      />

      {/* Hidden Thermal Printer Components */}
      <PackingSlip orders={orders.filter(o => selectedIds.has(o.id))} />
    </div>
  );
};
