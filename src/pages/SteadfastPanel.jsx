import { useState, useEffect } from 'react';
import { useOrders } from '../context/OrderContext';
import { api } from '../lib/api';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Search, Truck, RotateCcw, ExternalLink, Calendar, User, Phone, MapPin } from 'lucide-react';
import './SteadfastPanel.css';

export const SteadfastPanel = () => {
  const { orders } = useOrders();
  const [searchTerm, setSearchTerm] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState({}); // { orderId: 'syncing' | 'done' | 'error' }

  // Filter orders that have been dispatched to Steadfast (have tracking_id)
  const steadfastOrders = orders.filter(
    o => o.tracking_id && 
    ((o.id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
     (o.customer_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
     (o.phone || '').includes(searchTerm) ||
     (o.tracking_id || '').toLowerCase().includes(searchTerm.toLowerCase()))
  ).sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at));

  const handleSyncStatus = async (orderId, trackingCode) => {
    setSyncStatus(prev => ({ ...prev, [orderId]: 'syncing' }));
    try {
      await api.getSteadfastStatus(orderId, trackingCode);
      setSyncStatus(prev => ({ ...prev, [orderId]: 'done' }));
      // The update is handled by the Edge Function in DB, 
      // and Realtime in OrderContext will update the local state.
    } catch (err) {
      console.error('Manual sync failed:', err);
      setSyncStatus(prev => ({ ...prev, [orderId]: 'error' }));
    }
  };

  const handleSyncAll = async () => {
    setIsSyncing(true);
    const toSync = steadfastOrders.slice(0, 10); // Batch limit for safety
    for (const order of toSync) {
      await handleSyncStatus(order.id, order.tracking_id);
    }
    setIsSyncing(false);
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
          <p className="text-secondary">Track real-time delivery performance and courier status.</p>
        </div>
        <div className="header-actions">
          <Button 
            variant="secondary" 
            icon={<RotateCcw size={18} className={isSyncing ? 'animate-spin' : ''} />}
            onClick={handleSyncAll}
            disabled={isSyncing || steadfastOrders.length === 0}
          >
            {isSyncing ? 'Syncing...' : 'Sync Recent'}
          </Button>
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
          <div className="stat-label">Delivered</div>
          <div className="stat-value text-success">
            {steadfastOrders.filter(o => String(o.courier_status).toLowerCase().includes('delivered')).length}
          </div>
        </Card>
        <Card className="stat-card">
          <div className="stat-label">Total Dispatched</div>
          <div className="stat-value">{steadfastOrders.length}</div>
        </Card>
      </div>

      <Card className="table-card overflow-hidden">
        <div className="table-search-bar">
          <div className="search-input-wrapper">
            <Search className="search-icon" size={18} />
            <input 
              type="text" 
              placeholder="Search by ID, Customer, Phone or Tracking..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-field"
            />
          </div>
        </div>

        <div className="table-container">
          <table className="order-table">
            <thead>
              <tr>
                <th>Order Details</th>
                <th>Recipient</th>
                <th>Tracking ID</th>
                <th>Courier Status</th>
                <th>Last Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {steadfastOrders.map(order => (
                <tr key={order.id} className="tracking-row">
                  <td>
                    <div className="order-id-cell">
                      <span className="id-badge">{order.id}</span>
                      <span className="product-name">{order.product_name}</span>
                    </div>
                  </td>
                  <td>
                    <div className="recipient-cell">
                      <div className="recipient-name"><User size={12} /> {order.customer_name}</div>
                      <div className="recipient-phone"><Phone size={12} /> {order.phone}</div>
                    </div>
                  </td>
                  <td>
                    <div className="tracking-id-cell">
                      <code>{order.tracking_id}</code>
                      <a 
                        href={`https://portal.steadfast.com.bd/tracking/${order.tracking_id}`} 
                        target="_blank" 
                        rel="noreferrer"
                        className="external-link"
                      >
                        <ExternalLink size={14} />
                      </a>
                    </div>
                  </td>
                  <td>
                    <Badge variant={getStatusVariant(order.courier_status)}>
                      {order.courier_status || 'Pending Sync'}
                    </Badge>
                  </td>
                  <td>
                    <div className="date-cell">
                      <Calendar size={12} /> {new Date(order.updated_at || order.created_at).toLocaleDateString()}
                    </div>
                  </td>
                  <td>
                    <button 
                      className={`sync-btn ${syncStatus[order.id] || ''}`}
                      onClick={() => handleSyncStatus(order.id, order.tracking_id)}
                      disabled={syncStatus[order.id] === 'syncing'}
                    >
                      <RotateCcw size={16} className={syncStatus[order.id] === 'syncing' ? 'animate-spin' : ''} />
                    </button>
                  </td>
                </tr>
              ))}
              {steadfastOrders.length === 0 && (
                <tr>
                  <td colSpan="6" className="empty-state">
                    No Steadfast deliveries found. Dispatched orders will appear here automatically.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};
