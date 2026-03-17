import { useState, useMemo, useRef } from 'react';
import { useOrders } from '../context/OrderContext';
import { useAuth } from '../context/AuthContext';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { Search, Filter, Calendar, ChevronDown, ChevronLeft, ChevronRight, Download, Plus, MoreHorizontal, Globe } from 'lucide-react';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { OrderDetailsModal } from '../components/OrderDetailsModal';
import { Input } from '../components/Input';
import { DateRangePicker } from '../components/DateRangePicker';
import { OrderRow } from '../components/OrderRow';
import './OrdersBoard.css';


const PRODUCT_CHECKPOINTS = [
  { id: 'all', name: 'All Products', color: '#64748b' },
  { id: 'toybox', name: 'TOY BOX', color: '#f97316' }, // Orange
  { id: 'organizer', name: 'ORGANIZER', color: '#059669' }, // Green
  { id: 'travelbag', name: 'Travel bag', color: '#1d4ed8' }, // Blue
  { id: 'toyboxorg', name: 'TOY BOX + ORG', color: '#5b21b6' }, // Purple
  { id: 'gymbag', name: 'Gym bag', color: '#b91c1c' }, // Red
  { id: 'vlogger', name: 'VLOGGER FOR FREE', color: '#334155' }, // Dark Slate
  { id: 'mmb', name: 'MMB', color: '#c084fc' }, // Light Purple
  { id: 'quran', name: 'Quran', color: '#84cc16' }, // Lime
  { id: 'waistbag', name: 'WAIST BAG', color: '#134e4a' }, // Dark Teal
  { id: 'bagpack', name: 'BAGPACK', color: '#3b82f6' }, // Bright Blue
  { id: 'moshari', name: 'Moshari', color: '#22c55e' }  // Bright Green
];

const ORDER_STATUSES = [
  'New',
  'Pending Call',
  'Confirmed',
  'Courier Submitted',
  'Factory Processing',
  'Completed',
  'Cancelled'
];

const SOURCES = ['Website', 'Facebook', 'Instagram', 'Direct'];

export const OrdersBoard = () => {
  const { userRoles, isAdmin, hasAnyRole } = useAuth();
  const {
    orders,
    loading,
    page,
    setPage,
    setFilters,
    totalCount,
    pageSize,
    filters,
    updateOrderStatus,
    addOrder,
    autoDistributeOrders,
    toyBoxes
  } = useOrders();

  const [distributing, setDistributing] = useState(false);

  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [isNewOrderModalOpen, setIsNewOrderModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);

  const statusTabsRef = useRef(null);
  const checkpointsRef = useRef(null);

  const scrollContainer = (ref, direction) => {
    if (ref.current) {
      const scrollAmount = direction === 'left' ? -200 : 200;
      ref.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  const currentOrder = useMemo(() =>
    orders.find(o => o.id === selectedOrderId),
    [orders, selectedOrderId]
  );


  const [formData, setFormData] = useState({
    customer_name: '',
    phone: '',
    address: '',
    product_name: '',
    size: '',
    quantity: '1',
    source: 'Website',
    notes: '',
    amount: '',
    ordered_items: []
  });

  const handleAutoDistribute = async () => {
    if (!window.confirm("Start automatic distribution? This will confirm orders strictly based on inventory availability.")) return;
    setDistributing(true);
    try {
      const result = await autoDistributeOrders();
      alert(`Distribution complete! Confirmed: ${result.confirmed}, Skipped: ${result.skipped}`);
    } catch (error) {
      console.error('Distribution failed:', error);
      alert('Distribution engine encountered an error.');
    } finally {
      setDistributing(false);
    }
  };

  const getStatusBadgeVariant = (status) => {
    switch (status) {
      case 'New': return 'new';
      case 'Pending Call': return 'pending-call';
      case 'Confirmed': return 'confirmed';
      case 'Cancelled': return 'cancelled';
      case 'Courier Submitted': return 'courier';
      case 'Factory Processing': return 'factory';
      case 'Completed': return 'completed';
      default: return 'default';
    }
  };

  const handleNewOrderSubmit = async (e) => {
    e.preventDefault();
    if (!formData.customer_name || !formData.phone) return;

    try {
      await addOrder({
        customer_name: formData.customer_name,
        phone: formData.phone,
        address: formData.address,
        product_name: formData.product_name,
        size: formData.size,
        source: formData.source,
        notes: formData.notes,
        status: 'New',
        amount: parseFloat(formData.amount) || 0,
        quantity: parseInt(formData.quantity) || 1,
        ordered_items: formData.ordered_items || []
      });

      // Reset filters so the new order is visible
      setFilters(prev => ({ ...prev, searchTerm: '', status: 'All', productName: '' }));

      setIsNewOrderModalOpen(false);
      setFormData({
        customer_name: '', phone: '', address: '', product_name: '', size: '',
        quantity: '1', source: 'Website', notes: '', amount: '',
        ordered_items: []
      });
    } catch (error) {
      console.error('Failed to create order:', error);
      alert('Failed to create order. Please try again.');
    }
  };

  const handleRowClick = (order) => {
    setSelectedOrderId(order.id);
    setIsDetailsModalOpen(true);
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };


  const totalPages = Math.ceil(totalCount / pageSize);


  return (
    <div className="orders-management">
      <div className="page-header orders-header">
        <div>
          <h1>Orders Management</h1>
          <p>Full control over your order pipeline and customer records.</p>
        </div>
        <div className="header-actions">
          <Button variant="ghost">
            <Download size={18} /> Export CSV
          </Button>
          <Button
            variant="primary"
            className="auto-distribute-btn"
            onClick={handleAutoDistribute}
            disabled={distributing}
            style={{ background: 'var(--accent-gradient)', border: 'none' }}
          >
            {distributing ? 'Distributing...' : 'AUTO DISTRIBUTE ORDERS'}
          </Button>
          {hasAnyRole(['Admin', 'Moderator']) && (
            <Button variant="primary" onClick={() => setIsNewOrderModalOpen(true)}>
              <Plus size={18} /> <span className="desktop-only">New Order</span>
            </Button>
          )}
        </div>
      </div>

      {/* ── Status Tabs ── */}
      <div className="scrollable-strip-wrapper">
        <button className="strip-arrow left" onClick={() => scrollContainer(statusTabsRef, 'left')}>
          <ChevronLeft size={16} />
        </button>
        <div className="status-tabs-bar" ref={statusTabsRef}>
          {['All', 'New', 'Pending Call', 'Confirmed', 'Courier Submitted', 'Factory Processing', 'Completed', 'Cancelled'].map((tab) => (
            <button
              key={tab}
              className={`status-tab ${filters.status === tab ? 'active' : ''}`}
              onClick={() => handleFilterChange('status', tab)}
            >
              {tab === 'All' ? 'All Orders' : tab}
            </button>
          ))}
        </div>
        <button className="strip-arrow right" onClick={() => scrollContainer(statusTabsRef, 'right')}>
          <ChevronRight size={16} />
        </button>
      </div>

      {/* ── Unified Filter Bar ── */}
      <div className="unified-filter-bar">
        <div className="filter-search">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            placeholder="Search ID, name or phone..."
            value={filters.searchTerm}
            onChange={(e) => handleFilterChange('searchTerm', e.target.value)}
          />
        </div>

        <div className="filter-divider" />

        <div className="filter-select-group">
          <Globe size={14} className="select-icon" />
          <select
            value={filters.source}
            onChange={(e) => handleFilterChange('source', e.target.value)}
          >
            <option value="All">All Sources</option>
            {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div className="filter-divider" />

        <DateRangePicker
          value={filters.dateRange}
          onChange={(range) => handleFilterChange('dateRange', range)}
        />
      </div>

      {/* ── Product Checkpoints (Horizontal Scroll) ── */}
      <div className="scrollable-strip-wrapper">
        <button className="strip-arrow left" onClick={() => scrollContainer(checkpointsRef, 'left')}>
          <ChevronLeft size={16} />
        </button>
        <div className="product-checkpoints-strip" ref={checkpointsRef}>
          {PRODUCT_CHECKPOINTS.map((product) => (
            <button
              key={product.id}
              className={`checkpoint-pill ${filters.productName === (product.id === 'all' ? '' : product.name) ? 'active' : ''}`}
              style={{
                '--pill-color': product.color,
                '--pill-bg': product.id === 'all' ? '#f1f5f9' : `${product.color}10`,
                '--pill-border': product.id === 'all' ? '#e2e8f0' : `${product.color}25`
              }}
              onClick={() => handleFilterChange('productName', product.id === 'all' ? '' : product.name)}
            >
              <span className="dot" style={{ backgroundColor: product.color }}></span>
              {product.name}
            </button>
          ))}
        </div>
        <button className="strip-arrow right" onClick={() => scrollContainer(checkpointsRef, 'right')}>
          <ChevronRight size={16} />
        </button>
      </div>

      <Card className="table-card liquid-glass" noPadding>
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
              {Array.isArray(orders) && orders.map(order => (
                <OrderRow
                  key={order.id}
                  order={order}
                  onDetails={handleRowClick}
                  onStatusChange={updateOrderStatus}
                />
              ))}
              {(!orders || orders.length === 0) && (
                <tr>
                  <td colSpan="10" className="empty-state-cell">
                    {loading ? 'Loading orders...' : 'No orders found matching your filters.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Card View */}
        <div className="orders-mobile-list mobile-only">
          {Array.isArray(orders) && orders.map(order => (
            <div
              key={order.id}
              className="order-mobile-card liquid-glass"
              onClick={() => handleRowClick(order)}
            >
              <div className="card-mobile-header">
                <span className="order-id">{order.id}</span>
                <Badge variant={getStatusBadgeVariant(order.status)}>
                  {order.status}
                </Badge>
              </div>
              <div className="card-mobile-body">
                <div className="mobile-customer-info">
                  <strong>{order.customer_name}</strong>
                  <span>{order.phone}</span>
                </div>
                <div className="mobile-product-info">
                  <span className="product-name">{order.product_name}</span>
                  <span className="product-meta">{order.size} • {order.source}</span>
                </div>
              </div>
              <div className="card-mobile-footer">
                <span className="date">{order.created_at ? new Date(order.created_at).toLocaleDateString() : 'N/A'}</span>
                <button className="mobile-action-btn">Details</button>
              </div>
            </div>
          ))}
          {(!orders || orders.length === 0) && !loading && (
            <div className="mobile-empty-state">No orders found.</div>
          )}
          {loading && <div className="mobile-loading-state">Loading...</div>}
        </div>


        {totalPages > 1 && (
          <div className="pagination-footer">
            <div className="pagination-info">
              Showing page {page} of {totalPages} ({totalCount} total orders)
            </div>
            <div className="pagination-actions">
              <Button
                variant="ghost"
                size="sm"
                disabled={page === 1}
                onClick={() => setPage(prev => Math.max(1, prev - 1))}
              >
                Previous
              </Button>
              <div className="page-numbers">
                {[...Array(totalPages)].map((_, i) => (
                  <button
                    key={i}
                    className={`page-num ${page === i + 1 ? 'active' : ''}`}
                    onClick={() => setPage(i + 1)}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
              <Button
                variant="ghost"
                size="sm"
                disabled={page === totalPages}
                onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>


      <Modal
        isOpen={isNewOrderModalOpen}
        onClose={() => setIsNewOrderModalOpen(false)}
        title="Create New Order"
      >
        <form onSubmit={handleNewOrderSubmit} className="new-order-form">
          <div className="form-grid">
            <Input
              label="Customer Name"
              placeholder="Full name"
              value={formData.customer_name}
              onChange={e => setFormData({ ...formData, customer_name: e.target.value })}
              required
            />
            <Input
              label="Phone Number"
              placeholder="+1 234 567 890"
              value={formData.phone}
              onChange={e => setFormData({ ...formData, phone: e.target.value })}
              required
            />
          </div>

          <Input
            label="Delivery Address"
            placeholder="Full shipping address"
            value={formData.address}
            onChange={e => setFormData({ ...formData, address: e.target.value })}
            className="full-width-input"
            required
          />

          <div className="form-grid">
            <div className="input-group full-width">
              <label className="input-label">Product Category</label>
              <select
                className="input-field glass-select"
                value={formData.product_name}
                onChange={e => {
                  const val = e.target.value;
                  setFormData({ ...formData, product_name: val, ordered_items: val === 'TOY BOX' ? formData.ordered_items : [] });
                }}
                required
              >
                <option value="">Select a product...</option>
                {PRODUCT_CHECKPOINTS.filter(p => p.id !== 'all').map(product => (
                  <option key={product.id} value={product.name}>
                    {product.name}
                  </option>
                ))}
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
                      className={`toy-box-btn ${formData.ordered_items && formData.ordered_items.includes(num) ? 'selected' : ''}`}
                      onClick={() => {
                        const currentItems = formData.ordered_items || [];
                        const items = currentItems.includes(num)
                          ? currentItems.filter(n => n !== num)
                          : [...currentItems, num].sort((a, b) => a - b);
                        setFormData({ ...formData, ordered_items: items });
                      }}
                    >
                      {num}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <Input
              label="Size"
              placeholder="E.g. XL"
              value={formData.size}
              onChange={e => setFormData({ ...formData, size: e.target.value })}
            />
          </div>

          <div className="form-grid three-cols">
            <Input
              label="Quantity"
              type="number"
              min="1"
              value={formData.quantity}
              onChange={e => setFormData({ ...formData, quantity: e.target.value })}
              required
            />
            <Input
              label="Amount ($)"
              type="number"
              step="0.01"
              placeholder="0.00"
              value={formData.amount}
              onChange={e => setFormData({ ...formData, amount: e.target.value })}
            />
            <div className="input-group full-width">
              <label className="input-label">Order Source</label>
              <select
                className="input-field glass-select"
                value={formData.source}
                onChange={e => setFormData({ ...formData, source: e.target.value })}
              >
                <option value="Website">Website</option>
                <option value="Facebook">Facebook</option>
                <option value="Instagram">Instagram</option>
                <option value="Direct">Direct</option>
              </select>
            </div>
          </div>

          <Input
            label="Order Notes"
            placeholder="Special instructions or comments..."
            value={formData.notes}
            onChange={e => setFormData({ ...formData, notes: e.target.value })}
            isTextarea
            className="full-width-input"
          />

          <div className="form-actions">
            <Button type="button" variant="ghost" onClick={() => setIsNewOrderModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Create Order
            </Button>
          </div>
        </form>
      </Modal>

      <OrderDetailsModal
        isOpen={isDetailsModalOpen}
        onClose={() => {
          setIsDetailsModalOpen(false);
          setSelectedOrderId(null);
        }}
        order={currentOrder}
      />
    </div>
  );
};


