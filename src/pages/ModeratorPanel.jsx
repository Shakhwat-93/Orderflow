import { useState, useRef } from 'react';
import { useOrders } from '../context/OrderContext';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { OrderRow } from '../components/OrderRow';
import { DateRangePicker } from '../components/DateRangePicker';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import { Edit2, Trash2, Plus, Search, Package, DollarSign, ShoppingCart, Globe, ChevronLeft, ChevronRight } from 'lucide-react';
import './ModeratorPanel.css';

const PRODUCT_OPTIONS = [
  'TOY BOX', 'ORGANIZER', 'Travel bag', 'TOY BOX + ORG', 'Gym bag',
  'VLOGGER FOR FREE', 'MMB', 'Quran', 'WAIST BAG', 'BAGPACK', 'Moshari'
];

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
  'New', 'Pending Call', 'Confirmed', 'Courier Submitted',
  'Factory Processing', 'Completed', 'Cancelled'
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
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState(null);

  const scrollContainer = (ref, direction) => {
    if (ref.current) {
      ref.current.scrollBy({ left: direction === 'left' ? -200 : 200, behavior: 'smooth' });
    }
  };
  
  const initialFormData = {
    customer_name: '', phone: '', address: '', product_name: '', size: '',
    quantity: '1', source: 'Website', notes: '', amount: '', ordered_items: []
  };

  const [formData, setFormData] = useState(initialFormData);

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

  const handleOpenModal = (order = null) => {
    if (order) {
      setEditingOrderId(order.id);
      setFormData({
        customer_name: order.customer_name || '',
        phone: order.phone || '',
        address: order.address || '',
        product_name: order.product_name || '',
        size: order.size || '',
        quantity: String(order.quantity || 1),
        source: order.source || 'Website',
        notes: order.notes || '',
        amount: String(order.amount || ''),
        status: order.status || 'New',
        ordered_items: order.ordered_items || []
      });
    } else {
      setEditingOrderId(null);
      setFormData(initialFormData);
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.customer_name || !formData.phone) return;
    setIsSubmitting(true);
    try {
      const payload = {
        customer_name: formData.customer_name,
        phone: formData.phone,
        address: formData.address,
        product_name: formData.product_name,
        size: formData.size,
        quantity: parseInt(formData.quantity) || 1,
        source: formData.source,
        notes: formData.notes,
        amount: parseFloat(formData.amount) || 0,
        ordered_items: formData.ordered_items
      };
      if (editingOrderId) {
        await editOrder(editingOrderId, payload);
      } else {
        await addOrder({ ...payload, status: 'New' });
      }
      setIsModalOpen(false);
      setFormData(initialFormData);
    } catch (error) {
      console.error('Failed to save order:', error);
      alert('Failed to save order. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = (id) => {
    if (window.confirm("Are you sure you want to delete this order?")) {
      deleteOrder(id);
    }
  };

  const handleRowClick = (order) => {
    setSelectedOrderId(order.id);
    handleOpenModal(order);
  };

  return (
    <div className="moderator-panel">
      <div className="page-header">
        <div>
          <h1>Moderator Dashboard</h1>
          <p>Manage incoming orders, verify details, and route for processing.</p>
        </div>
        <Button variant="primary" onClick={() => handleOpenModal()}>
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
              <div className="metric-value">৳{orders.reduce((s, o) => s + (parseFloat(o.amount) || 0), 0).toLocaleString()}</div>
            </div>
          </div>
        </Card>
        <Card className="metric-card liquid-glass chart-card">
          <h3 className="chart-title">By Source</h3>
          <div className="chart-wrapper pie-chart-wrapper">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={stats.sourceDistribution} cx="50%" cy="50%" innerRadius={30} outerRadius={50} paddingAngle={5} dataKey="value">
                  {stats.sourceDistribution.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <RechartsTooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pie-legend">
              {stats.sourceDistribution.map(s => (
                <div key={s.name} className="legend-item">
                  <span className="legend-dot" style={{ backgroundColor: s.color }}></span>
                  <span className="legend-label">{s.name} ({s.value})</span>
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

      {/* Unified Filter Bar */}
      <div className="unified-filter-bar">
        <div className="filter-search">
          <Search size={16} className="search-icon" />
          <input type="text" placeholder="Search ID, name or phone..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </div>
        <div className="filter-divider" />
        <div className="filter-select-group">
          <Globe size={14} className="select-icon" />
          <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
            <option value="All">All Sources</option>
            {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="filter-divider" />
        <DateRangePicker value={dateRange} onChange={setDateRange} />
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
        <div className="mod-table-header">
          <span className="order-count-badge">{filteredOrders.length} orders</span>
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
                <OrderRow key={order.id} order={order} onDetails={handleRowClick} onStatusChange={updateOrderStatus} />
              ))}
              {filteredOrders.length === 0 && (
                <tr><td colSpan="10" className="empty-state-cell">No orders found matching your filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Add / Edit Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingOrderId ? "Edit Order" : "Add New Order"}>
        <form onSubmit={handleSubmit} className="new-order-form">
          <div className="form-grid">
            <Input label="Customer Name" placeholder="Full name" value={formData.customer_name} onChange={e => setFormData({...formData, customer_name: e.target.value})} required />
            <Input label="Phone Number" placeholder="+880 1XXX-XXXXXX" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} required />
          </div>
          <Input label="Delivery Address" placeholder="Full shipping address" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} className="full-width-input" required />
          <div className="form-grid">
            <div className="input-group full-width">
              <label className="input-label">Product Category</label>
              <select className="input-field glass-select" value={formData.product_name} onChange={e => {
                const val = e.target.value;
                setFormData({...formData, product_name: val, ordered_items: val === 'TOY BOX' ? formData.ordered_items : []});
              }} required>
                <option value="">Select a product...</option>
                {PRODUCT_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            
            {formData.product_name === 'TOY BOX' && (
              <div className="input-group full-width toy-box-selector">
                <label className="input-label">Select Toy Box Numbers (Serial)</label>
                <div className="toy-box-grid">
                  {Array.from({ length: 38 }, (_, i) => i + 1).map(num => (
                    <button
                      key={num}
                      type="button"
                      className={`toy-box-btn ${formData.ordered_items.includes(num) ? 'selected' : ''}`}
                      onClick={() => {
                        const items = formData.ordered_items.includes(num)
                          ? formData.ordered_items.filter(n => n !== num)
                          : [...formData.ordered_items, num].sort((a,b) => a - b);
                        setFormData({...formData, ordered_items: items});
                      }}
                    >
                      {num}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <Input label="Size" placeholder="E.g. XL" value={formData.size} onChange={e => setFormData({...formData, size: e.target.value})} />
          </div>
          <div className="form-grid three-cols">
            <Input label="Quantity" type="number" min="1" value={formData.quantity} onChange={e => setFormData({...formData, quantity: e.target.value})} required />
            <Input label="Amount (৳)" type="number" step="0.01" placeholder="0.00" value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value})} required />
            <div className="input-group full-width">
              <label className="input-label">Order Source</label>
              <select className="input-field glass-select" value={formData.source} onChange={e => setFormData({...formData, source: e.target.value})}>
                {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          {editingOrderId && (
            <div className="input-group full-width">
              <label className="input-label">Status</label>
              <select className="input-field glass-select" value={formData.status || 'New'} onChange={e => setFormData({...formData, status: e.target.value})}>
                {ORDER_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}
          <Input label="Order Notes" placeholder="Special instructions..." value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} isTextarea className="full-width-input" />
          <div className="form-actions">
            <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : (editingOrderId ? "Save Changes" : "Create Order")}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
