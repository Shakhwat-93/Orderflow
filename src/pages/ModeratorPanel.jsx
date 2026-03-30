import { useState, useRef, useEffect } from 'react';
import { useOrders } from '../context/OrderContext';
import { Card } from '../components/Card';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { OrderRow } from '../components/OrderRow';
import { OrderEditModal } from '../components/OrderEditModal';
import { OrderDetailsModal } from '../components/OrderDetailsModal';
import { DateRangePicker } from '../components/DateRangePicker';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import { 
  Edit2, Trash2, Plus, Search, Package, DollarSign, ShoppingCart, 
  Globe, ChevronDown, ChevronLeft, ChevronRight, Wand2, Trash, Truck, MapPin, X
} from 'lucide-react';
import CurrencyIcon from '../components/CurrencyIcon';
import api from '../lib/api';
import './ModeratorPanel.css';

const PRODUCT_OPTIONS = [
  'TOY BOX', 'ORGANIZER', 'Travel bag', 'TOY BOX + ORG', 'Gym bag',
  'VLOGGER FOR FREE', 'MMB', 'Quran', 'WAIST BAG', 'BAGPACK', 'Moshari'
];

const PRODUCT_PRICES = {
  'TOY BOX': 1250,
  'ORGANIZER': 850,
  'Travel bag': 950,
  'TOY BOX + ORG': 2000,
  'Gym bag': 750,
  'VLOGGER FOR FREE': 650,
  'MMB': 550,
  'Quran': 1200,
  'WAIST BAG': 450,
  'BAGPACK': 1500,
  'Moshari': 850
};

const PRODUCT_CHECKPOINTS = [
  { id: 'all', name: 'All Products', color: '#64748b' },
  { id: 'toybox', name: 'TOY BOX', color: '#f97316' },
  { id: 'organizer', name: 'ORGANIZER', color: '#059669' },
  { id: 'travelbag', name: 'Travel bag', color: '#1d4ed8' },
  { id: 'toyboxorg', name: 'TOY BOX + ORG', color: '#5b21b6' },
  { id: 'gymbag', name: 'Gym bag', color: '#b91c1c' },
  { id: 'vlogger', name: 'VLOGGER FOR FREE', color: '#334155' },
  { id: 'mmb', name: 'MMB', color: '#c084fc' },
  { id: 'quran', name: 'Quran', color: '#84cc16' },
  { id: 'waistbag', name: 'WAIST BAG', color: '#134e4a' },
  { id: 'bagpack', name: 'BAGPACK', color: '#3b82f6' },
  { id: 'moshari', name: 'Moshari', color: '#22c55e' }
];

const ORDER_STATUSES = [
  'New', 'Pending Call', 'Confirmed', 'Factory Queue', 'Courier Ready',
  'Courier Submitted', 'Factory Processing', 'Completed', 'Cancelled'
];

const SOURCES = ['Website', 'Facebook', 'Instagram', 'Direct'];

export const ModeratorPanel = () => {
  const { orders, stats, addOrder, editOrder, deleteOrder, updateOrderStatus } = useOrders();
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [productFilter, setProductFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('All');
  const [dateRange, setDateRange] = useState({ start: null, end: null });

  // Scroll refs
  const statusTabsRef = useRef(null);
  const checkpointsRef = useRef(null);
  
  // Modal States
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);

  const handleOpenEditModal = (order) => {
    setSelectedOrder(order);
    setIsEditModalOpen(true);
  };

  const handleRowClick = (order) => {
    setSelectedOrder(order);
    setIsDetailsModalOpen(true);
  };

  const scrollContainer = (ref, direction) => {
    if (ref.current) {
      ref.current.scrollBy({ left: direction === 'left' ? -200 : 200, behavior: 'smooth' });
    }
  };

  // Apply all filters
  const filteredOrders = orders.filter(o => {
    const term = searchTerm.toLowerCase();
    const matchesSearch = !searchTerm || 
      (o.id || '').toLowerCase().includes(term) ||
      (o.customer_name || '').toLowerCase().includes(term) ||
      (o.phone || '').includes(term) ||
      (o.product_name || '').toLowerCase().includes(term);

    const matchesStatus = statusFilter === 'All' || o.status === statusFilter;
    const matchesProduct = !productFilter || o.product_name === productFilter;
    const matchesSource = sourceFilter === 'All' || o.source === sourceFilter;
    
    let matchesDate = true;
    if (dateRange.start && dateRange.end) {
      const orderDate = new Date(o.created_at);
      matchesDate = orderDate >= new Date(dateRange.start) && orderDate <= new Date(dateRange.end);
    }

    return matchesSearch && matchesStatus && matchesProduct && matchesSource && matchesDate;
  });



  return (
    <div className="moderator-panel">
      <div className="page-header">
        <div>
          <h1>Moderator Dashboard</h1>
          <p>Manage incoming orders, verify details, and route for processing.</p>
        </div>
        <Button variant="primary" onClick={() => handleOpenEditModal(null)}>
          <Plus size={18} /> Add New Order
        </Button>
      </div>

      {/* Metrics Row */}
      <div className="mod-metrics-grid">
        <Card className="metric-card liquid-glass">
          <div className="metric-content">
            <div className="metric-icon-wrap" style={{ background: 'rgba(var(--accent-rgb), 0.1)' }}>
              <ShoppingCart size={20} style={{ color: 'var(--accent)' }} />
            </div>
            <div>
              <span className="metric-label">Total Orders</span>
              <div className="metric-value">{orders.length}</div>
            </div>
          </div>
        </Card>
        <Card className="metric-card liquid-glass">
          <div className="metric-content">
            <div className="metric-icon-wrap" style={{ background: 'rgba(59, 130, 246, 0.1)' }}>
              <Package size={20} style={{ color: '#3b82f6' }} />
            </div>
            <div>
              <span className="metric-label">Added Today</span>
              <div className="metric-value">{stats.addedTodayCount}</div>
            </div>
          </div>
        </Card>
        <Card className="metric-card liquid-glass">
          <div className="metric-content">
            <div className="metric-icon-wrap" style={{ background: 'rgba(16, 185, 129, 0.1)' }}>
              <DollarSign size={20} style={{ color: '#10b981' }} />
            </div>
            <div>
              <span className="metric-label">Revenue Today</span>
              <div className="metric-value"><CurrencyIcon size={20} className="currency-icon-elite" />{orders.reduce((s, o) => s + (parseFloat(o.amount) || 0), 0).toLocaleString()}</div>
            </div>
          </div>
        </Card>
        <Card className="metric-card liquid-glass chart-card" noPadding style={{ padding: '24px' }}>
          <h3 className="chart-title" style={{ marginBottom: '8px', fontSize: '1.2rem', fontWeight: 800 }}>By Source</h3>
          <div className="chart-wrapper pie-chart-wrapper" style={{ minHeight: 250, position: 'relative' }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <defs>
                  <filter id="premium-glow-mod" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="6" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                  <filter id="inset-shadow-mod" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="#000" floodOpacity="0.5" />
                  </filter>
                </defs>
                <Pie
                  data={[{value: 100}]}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  fill="rgba(255, 255, 255, 0.02)"
                  stroke="rgba(255, 255, 255, 0.05)"
                  isAnimationActive={false}
                  filter="url(#inset-shadow-mod)"
                />
                <Pie
                  data={stats.sourceDistribution}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={8}
                  cornerRadius={20}
                  dataKey="value"
                  stroke="none"
                >
                  {stats.sourceDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} filter="url(#premium-glow-mod)" />
                  ))}
                </Pie>
                <RechartsTooltip contentStyle={{ backgroundColor: 'rgba(28,29,36,0.95)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 10px 30px rgba(0,0,0,0.5)', color: '#fff' }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pie-legend" style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginTop: '16px' }}>
              {stats.sourceDistribution.map(s => (
                <div key={s.name} className="legend-item" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span className="legend-dot" style={{ backgroundColor: s.color, width: '10px', height: '10px', borderRadius: '50%', boxShadow: `0 0 10px ${s.color}` }}></span>
                  <span className="legend-label" style={{ color: '#8c8d96', fontSize: '0.85rem', fontWeight: 600 }}>{s.name} ({s.value})</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* Status Tabs */}
      <div className="scrollable-strip-wrapper">
        <button className="strip-arrow left" onClick={() => scrollContainer(statusTabsRef, 'left')}><ChevronLeft size={16} /></button>
        <div className="status-tabs-bar" ref={statusTabsRef}>
          {['All', ...ORDER_STATUSES].map(tab => (
            <button key={tab} className={`status-tab ${statusFilter === tab ? 'active' : ''}`} onClick={() => setStatusFilter(tab)}>
              {tab === 'All' ? 'All Orders' : tab}
            </button>
          ))}
        </div>
        <button className="strip-arrow right" onClick={() => scrollContainer(statusTabsRef, 'right')}><ChevronRight size={16} /></button>
      </div>


      {/* Product Checkpoints */}
      <div className="scrollable-strip-wrapper">
        <button className="strip-arrow left" onClick={() => scrollContainer(checkpointsRef, 'left')}><ChevronLeft size={16} /></button>
        <div className="product-checkpoints-strip" ref={checkpointsRef}>
          {PRODUCT_CHECKPOINTS.map(p => (
            <button
              key={p.id}
              className={`checkpoint-pill ${productFilter === (p.id === 'all' ? '' : p.name) ? 'active' : ''}`}
              style={{ '--pill-color': p.color, '--pill-bg': p.id === 'all' ? '#f1f5f9' : `${p.color}10`, '--pill-border': p.id === 'all' ? '#e2e8f0' : `${p.color}25` }}
              onClick={() => setProductFilter(p.id === 'all' ? '' : p.name)}
            >
              <span className="dot" style={{ backgroundColor: p.color }}></span>
              {p.name}
            </button>
          ))}
        </div>
        <button className="strip-arrow right" onClick={() => scrollContainer(checkpointsRef, 'right')}><ChevronRight size={16} /></button>
      </div>

      {/* Orders Table */}
      <Card className="table-card liquid-glass" noPadding>
        <div className="table-search-bar">
          <div className="elite-search-wrapper">
            <Search className="elite-search-icon" size={18} />
            <input
              type="text"
              placeholder="Search ID, name or phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="elite-search-input"
            />
          </div>
          <div className="filter-actions-group">
            <div className="elite-select-wrapper">
              <Globe size={14} className="elite-select-icon" />
              <select 
                className="elite-select-field"
                value={sourceFilter} 
                onChange={(e) => setSourceFilter(e.target.value)}
              >
                <option value="All">All Sources</option>
                {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <ChevronDown size={14} className="ml-auto opacity-50" />
            </div>
            <DateRangePicker value={dateRange} onChange={setDateRange} />
            <span className="order-count-badge">{filteredOrders.length} orders</span>
          </div>
        </div>
        <div className="orders-table-wrapper desktop-only">
          <table className="management-table premium-table">
            <thead>
              <tr>
                <th className="checkbox-col"><input type="checkbox" className="premium-checkbox" /></th>
                <th>Order ID</th>
                <th>Order Date</th>
                <th>Customer Info</th>
                <th>Total Price</th>
                <th>Items</th>
                <th>Payment Status</th>
                <th>Shipping</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map(order => (
                <OrderRow 
                  key={order.id} 
                  order={order} 
                  onStatusChange={updateOrderStatus} 
                  onEdit={handleOpenEditModal} 
                  onDetails={handleRowClick}
                />
              ))}
              {filteredOrders.length === 0 && (
                <tr><td colSpan="10" className="empty-state-cell">No orders found matching your filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

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
    </div>
  );
};
