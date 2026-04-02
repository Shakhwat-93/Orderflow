import { useState, useRef } from 'react';
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
  Globe, ChevronDown, ChevronLeft, ChevronRight, Wand2, Trash, Truck, MapPin, X, Sparkles
} from 'lucide-react';
import { PremiumSearch } from '../components/PremiumSearch';
import CurrencyIcon from '../components/CurrencyIcon';
import { deserializeDateRange, usePersistentState } from '../utils/persistentState';
import { getProductCheckpoints } from '../utils/productCatalog';
import './ModeratorPanel.css';

const ORDER_STATUSES = [
  'New', 'Pending Call', 'Confirmed', 'Factory Queue', 'Courier Ready',
  'Courier Submitted', 'Factory Processing', 'Completed', 'Cancelled'
];

const SOURCES = ['Website', 'Facebook', 'Instagram', 'Direct'];

export const ModeratorPanel = () => {
  const { orders, stats, inventory, updateOrderStatus } = useOrders();
  const productCheckpoints = getProductCheckpoints(inventory);
  
  // Filters
  const [searchTerm, setSearchTerm] = usePersistentState('panel:moderator:search', '');
  const [statusFilter, setStatusFilter] = usePersistentState('panel:moderator:status', 'All');
  const [productFilter, setProductFilter] = usePersistentState('panel:moderator:product', '');
  const [sourceFilter, setSourceFilter] = usePersistentState('panel:moderator:source', 'All');
  const [dateRange, setDateRange] = usePersistentState(
    'panel:moderator:dateRange',
    { start: null, end: null },
    { deserialize: deserializeDateRange }
  );

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
      <div className="page-header orders-header elite-enterprise-header">
        <div className="header-main-stack">
          <div className="title-group-elite">
            <h1 className="premium-title-enterprise">
              <span className="text-dark">Moderator </span>
              <span className="text-accent-indigo">Panel</span>
            </h1>
            <p className="premium-subtitle-enterprise">Manage incoming orders, verify details, and route for processing.</p>
          </div>
        </div>
        
        <div className="header-actions-enterprise">
          <Button variant="primary" className="action-btn-green" onClick={() => handleOpenEditModal(null)}>
            <Plus size={18} /> Add New Order
          </Button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="mod-metrics-grid">
        <div className="metric-card success-glow relative overflow-hidden">
          <div className="card-decoration" style={{ width: '100px', height: '100px', top: '-30px', right: '-30px' }}></div>
          <div className="card-decoration" style={{ width: '60px', height: '60px', bottom: '-20px', left: '-10px', opacity: 0.05 }}></div>
          <div className="metric-content">
            <div className="metric-icon-wrap vibrancy-icon">
              <ShoppingCart size={22} color="#fff" />
            </div>
            <div className="metric-info-group">
              <span className="metric-label vibrant-label">Total Orders</span>
              <div className="metric-value vibrant-value">{orders.length}</div>
            </div>
          </div>
        </div>
        <div className="metric-card indigo-glow relative overflow-hidden">
          <div className="card-decoration" style={{ width: '120px', height: '120px', top: '-40px', right: '-40px' }}></div>
          <div className="card-decoration" style={{ width: '80px', height: '80px', bottom: '-30px', left: '-20px', opacity: 0.08 }}></div>
          <div className="metric-content">
            <div className="metric-icon-wrap vibrancy-icon">
              <Package size={22} color="#fff" />
            </div>
            <div className="metric-info-group">
              <span className="metric-label vibrant-label">Added Today</span>
              <div className="metric-value vibrant-value">{stats.addedTodayCount}</div>
            </div>
          </div>
        </div>
        <div className="metric-card teal-glow relative overflow-hidden">
          <div className="card-decoration" style={{ width: '110px', height: '110px', top: '-35px', right: '-35px' }}></div>
          <div className="card-decoration" style={{ width: '70px', height: '70px', bottom: '-25px', left: '-15px', opacity: 0.06 }}></div>
          <div className="metric-content">
            <div className="metric-icon-wrap vibrancy-icon">
              <DollarSign size={22} color="#fff" />
            </div>
            <div className="metric-info-group">
              <span className="metric-label vibrant-label">Revenue Today</span>
              <div className="metric-value vibrant-value">
                <CurrencyIcon size={22} className="vibrant-currency" />
                {orders.reduce((s, o) => s + (parseFloat(o.amount) || 0), 0).toLocaleString()}
              </div>
            </div>
          </div>
        </div>
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
                  fill={document.documentElement.getAttribute('data-theme') === 'dark' ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)'}
                  stroke={document.documentElement.getAttribute('data-theme') === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)'}
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
                <RechartsTooltip 
                  contentStyle={{ 
                    backgroundColor: document.documentElement.getAttribute('data-theme') === 'dark' ? 'rgba(28,29,36,0.95)' : '#fff', 
                    borderRadius: '12px', 
                    border: '1px solid ' + (document.documentElement.getAttribute('data-theme') === 'dark' ? 'rgba(255,255,255,0.1)' : '#e2e8f0'), 
                    boxShadow: '0 10px 30px rgba(0,0,0,0.1)', 
                    color: document.documentElement.getAttribute('data-theme') === 'dark' ? '#fff' : '#1e293b' 
                  }} 
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pie-legend" style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginTop: '16px' }}>
              {stats.sourceDistribution.map(s => (
                <div key={s.name} className="legend-item" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span className="legend-dot" style={{ backgroundColor: s.color, width: '10px', height: '10px', borderRadius: '50%', boxShadow: `0 0 10px ${s.color}40` }}></span>
                  <span className="legend-label" style={{ color: document.documentElement.getAttribute('data-theme') === 'dark' ? '#a1a1aa' : '#475569', fontSize: '0.85rem', fontWeight: 700 }}>{s.name} ({s.value})</span>
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
          {productCheckpoints.map(p => (
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

      {/* Unified Filter Bar */}
      <div className="unified-filter-bar" style={{ marginBottom: '16px' }}>
        <PremiumSearch
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search ID, name or phone..."
          suggestions={
            searchTerm ? orders.filter(o => 
              o.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
              o.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
              o.phone?.includes(searchTerm)
            ).slice(0, 5).map(o => ({
              id: o.id,
              label: o.customer_name,
              sub: o.id,
              type: 'order',
              original: o
            })) : []
          }
          onSuggestionClick={(item) => {
            if (item.type === 'order') {
              handleRowClick(item.original);
            }
          }}
        />
        
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
        <span className="order-count-badge" style={{ padding: '0 12px', fontWeight: 700, color: 'var(--text-secondary)' }}>
          {filteredOrders.length} orders
        </span>
      </div>

      {/* Orders Table */}
      <Card className="table-card liquid-glass" noPadding>
        <div className="orders-table-wrapper desktop-only">
          <table className="management-table premium-table">
            <thead>
              <tr>
                <th className="id-col">Order</th>
                <th className="date-col">Date</th>
                <th className="customer-col">Customer</th>
                <th className="payment-status-col">Payment</th>
                <th className="amount-col">Total</th>
                <th className="shipping-col">Delivery</th>
                <th className="items-col">Items</th>
                <th className="status-col">Fulfilment</th>
                <th className="actions-col">Action</th>
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

export default ModeratorPanel;
