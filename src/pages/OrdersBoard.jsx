import { useState, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation, useNavigate } from 'react-router-dom';
import { useOrders } from '../context/OrderContext';
import { useAuth } from '../context/AuthContext';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { Search, Filter, Calendar, ChevronDown, ChevronLeft, ChevronRight, Download, Plus, MoreHorizontal, Globe, X, AlertTriangle, Printer, Trash2, CheckCircle, Clock } from 'lucide-react';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { OrderDetailsModal } from '../components/OrderDetailsModal';
import { Input } from '../components/Input';
import { DateRangePicker } from '../components/DateRangePicker';
import { OrderRow } from '../components/OrderRow';
import { OrderEditModal } from '../components/OrderEditModal';
import './OrdersBoard.css';
import '../components/BulkActions.css';


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

const DELIVERY_ZONES = [
  { value: 'Inside Dhaka', charge: 80 },
  { value: 'Outside Dhaka', charge: 150 }
];

const BD_PHONE_REGEX = /^01\d{9}$/;

export const OrdersBoard = () => {
  const { userRoles, isAdmin, hasAnyRole, updatePresenceContext } = useAuth();
  
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    updatePresenceContext('Browsing Orders');
    
    // Check for global "New Order" trigger
    const queryParams = new URLSearchParams(location.search);
    if (queryParams.get('openModal') === 'new') {
      setIsNewOrderModalOpen(true);
      // Clean up URL
      queryParams.delete('openModal');
      navigate({ search: queryParams.toString() }, { replace: true });
    }

    const handleGlobalNewOrder = () => setIsNewOrderModalOpen(true);
    window.addEventListener('open-new-order-modal', handleGlobalNewOrder);
    
    return () => window.removeEventListener('open-new-order-modal', handleGlobalNewOrder);
  }, [updatePresenceContext, location.search, navigate]);

  const { 
    orders, loading, totalCount, page, setPage, setFilters, 
    fetchOrderLogs, fetchStats, stats, addOrder, deleteOrder, fraudFlags, automationFlags,
    pageSize, filters, updateOrderStatus, autoDistributeOrders, toyBoxes
  } = useOrders();

  const [distributing, setDistributing] = useState(false);

  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [isNewOrderModalOpen, setIsNewOrderModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedOrderForEdit, setSelectedOrderForEdit] = useState(null);
  const [selectedOrderIds, setSelectedOrderIds] = useState([]);

  const handleSelectOrder = (id) => {
    setSelectedOrderIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedOrderIds.length === orders.length) {
      setSelectedOrderIds([]);
    } else {
      setSelectedOrderIds(orders.map(o => o.id));
    }
  };

  const handleBulkStatusChange = async (status) => {
    if (!window.confirm(`Change ${selectedOrderIds.length} orders to ${status}?`)) return;
    for (const id of selectedOrderIds) {
      await updateOrderStatus(id, status);
    }
    setSelectedOrderIds([]);
  };

  const handleBulkDelete = async () => {
    if (!window.confirm(`Permanently delete ${selectedOrderIds.length} selected orders?`)) return;
    for (const id of selectedOrderIds) {
      await deleteOrder(id);
    }
    setSelectedOrderIds([]);
  };

  const handleOpenEditModal = (order) => {
    setSelectedOrderForEdit(order);
    setIsEditModalOpen(true);
  };

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
    shipping_zone: '',
    source: 'Website',
    notes: '',
    order_lines: [],
    duplicate_policy: 'merge'
  });
  const [lineDraft, setLineDraft] = useState({
    product_name: '',
    size: '',
    quantity: '1',
    unit_price: '',
    toybox_serial: ''
  });
  const [editingLineId, setEditingLineId] = useState(null);
  const [formErrors, setFormErrors] = useState({});

  const selectedZone = DELIVERY_ZONES.find(zone => zone.value === formData.shipping_zone) || null;
  const deliveryCharge = selectedZone?.charge || 0;
  const orderSubtotal = (formData.order_lines || []).reduce((sum, line) => sum + (Number(line.line_total) || 0), 0);
  const payableTotal = orderSubtotal + deliveryCharge;

  const createLineId = () => `ln-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

  const normalizeLineDraft = () => {
    const qty = Math.max(1, parseInt(lineDraft.quantity, 10) || 1);
    const unitPrice = Math.max(0, parseFloat(lineDraft.unit_price) || 0);
    const isToyBox = lineDraft.product_name === 'TOY BOX';
    const serialValue = isToyBox ? String(lineDraft.toybox_serial || '').trim() : '';
    const lineKey = `${lineDraft.product_name}|${lineDraft.size || ''}|${serialValue}|${unitPrice}`;

    return {
      qty,
      unitPrice,
      isToyBox,
      serialValue,
      lineKey
    };
  };

  const resetLineDraft = () => {
    setLineDraft({
      product_name: '',
      size: '',
      quantity: '1',
      unit_price: '',
      toybox_serial: ''
    });
    setEditingLineId(null);
  };

  const addOrUpdateLineItem = () => {
    const nextErrors = {};
    const { qty, unitPrice, isToyBox, serialValue, lineKey } = normalizeLineDraft();

    if (!lineDraft.product_name) nextErrors.line_product = 'Select a product first.';
    if (isToyBox && !serialValue) nextErrors.line_serial = 'Select a Toy Box serial.';
    if (qty < 1) nextErrors.line_quantity = 'Quantity must be at least 1.';
    if (unitPrice < 0) nextErrors.line_price = 'Unit price cannot be negative.';

    if (Object.keys(nextErrors).length > 0) {
      setFormErrors(prev => ({ ...prev, ...nextErrors }));
      return;
    }

    const candidateLine = {
      line_id: editingLineId || createLineId(),
      product_name: lineDraft.product_name,
      size: lineDraft.size,
      quantity: qty,
      unit_price: unitPrice,
      toybox_serial: serialValue,
      line_key: lineKey,
      line_total: qty * unitPrice
    };

    setFormData(prev => {
      let lines = [...(prev.order_lines || [])];

      if (editingLineId) {
        lines = lines.map(line => line.line_id === editingLineId ? candidateLine : line);
      } else if (prev.duplicate_policy === 'merge') {
        const existingIndex = lines.findIndex(line => line.line_key === candidateLine.line_key);
        if (existingIndex !== -1) {
          const existing = lines[existingIndex];
          const mergedQty = (existing.quantity || 0) + candidateLine.quantity;
          lines[existingIndex] = {
            ...existing,
            quantity: mergedQty,
            line_total: mergedQty * (existing.unit_price || 0)
          };
        } else {
          lines.push(candidateLine);
        }
      } else {
        lines.push(candidateLine);
      }

      return { ...prev, order_lines: lines };
    });

    setFormErrors(prev => ({
      ...prev,
      line_product: '',
      line_serial: '',
      line_quantity: '',
      line_price: '',
      order_lines: ''
    }));
    resetLineDraft();
  };

  const handleEditLine = (line) => {
    setEditingLineId(line.line_id);
    setLineDraft({
      product_name: line.product_name || '',
      size: line.size || '',
      quantity: String(line.quantity || 1),
      unit_price: String(line.unit_price ?? ''),
      toybox_serial: line.toybox_serial || ''
    });
  };

  const handleRemoveLine = (lineId) => {
    setFormData(prev => ({
      ...prev,
      order_lines: (prev.order_lines || []).filter(line => line.line_id !== lineId)
    }));
  };

  const updateLineQuantity = (lineId, qty) => {
    const safeQty = Math.max(1, qty || 1);
    setFormData(prev => ({
      ...prev,
      order_lines: (prev.order_lines || []).map(line => line.line_id === lineId
        ? { ...line, quantity: safeQty, line_total: safeQty * (line.unit_price || 0) }
        : line)
    }));
  };

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

    const nextErrors = {};
    const normalizedPhone = (formData.phone || '').replace(/\D/g, '');
    if (!formData.customer_name.trim()) nextErrors.customer_name = 'Customer name is required.';
    if (!formData.phone.trim()) {
      nextErrors.phone = 'Phone number is required.';
    } else if (!BD_PHONE_REGEX.test(normalizedPhone)) {
      nextErrors.phone = 'Phone number must start with 01 and be exactly 11 digits.';
    }
    if (!formData.address.trim()) nextErrors.address = 'Delivery address is required.';
    if (!formData.shipping_zone) nextErrors.shipping_zone = 'Select a delivery zone to continue.';
    if (!formData.order_lines || formData.order_lines.length === 0) nextErrors.order_lines = 'Add at least one product line item.';

    if (Object.keys(nextErrors).length > 0) {
      setFormErrors(nextErrors);
      return;
    }

    setFormErrors({});

    try {
      const totalQuantity = (formData.order_lines || []).reduce((sum, line) => sum + (line.quantity || 0), 0);
      const firstLine = formData.order_lines?.[0];
      const toyboxSerials = (formData.order_lines || [])
        .filter(line => line.product_name === 'TOY BOX' && line.toybox_serial)
        .map(line => Number(line.toybox_serial));

      await addOrder({
        customer_name: formData.customer_name,
        phone: normalizedPhone,
        address: formData.address,
        shipping_zone: formData.shipping_zone,
        delivery_charge: deliveryCharge,
        product_name: (formData.order_lines || []).length > 1 ? `Multi Item (${formData.order_lines.length})` : (firstLine?.product_name || ''),
        size: firstLine?.size || '',
        source: formData.source,
        notes: formData.notes,
        status: 'New',
        amount: payableTotal,
        quantity: totalQuantity || 1,
        ordered_items: toyboxSerials,
        order_lines_payload: formData.order_lines,
        pricing_summary: {
          subtotal: orderSubtotal,
          delivery_charge: deliveryCharge,
          payable_total: payableTotal
        }
      });

      // Reset filters so the new order is visible
      setFilters(prev => ({ ...prev, searchTerm: '', status: 'All', productName: '' }));

      setIsNewOrderModalOpen(false);
      setFormData({
        customer_name: '',
        phone: '',
        address: '',
        shipping_zone: '',
        source: 'Website',
        notes: '',
        order_lines: [],
        duplicate_policy: 'merge'
      });
      resetLineDraft();
      setFormErrors({});
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
                <th className="checkbox-col">
                  <input 
                    type="checkbox" 
                    className="premium-checkbox" 
                    checked={orders.length > 0 && selectedOrderIds.length === orders.length}
                    onChange={handleSelectAll}
                  />
                </th>
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
            <tbody className="orders-table-body">
              <AnimatePresence mode="popLayout">
                {Array.isArray(orders) && orders.map(order => (
                  <OrderRow
                    key={order.id}
                    order={order}
                    onDetails={handleRowClick}
                    onStatusChange={updateOrderStatus}
                    onEdit={handleOpenEditModal}
                    isSelected={selectedOrderIds.includes(order.id)}
                    onSelect={handleSelectOrder}
                    fraudFlag={fraudFlags[order.id]}
                    automationFlag={automationFlags[order.id]}
                  />
                ))}
              </AnimatePresence>
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
                  {fraudFlags[order.id] && (
                    <div className="fraud-alert-icon" title={fraudFlags[order.id].message}>
                      <AlertTriangle size={14} color="#ff4d4d" />
                    </div>
                  )}
                  {automationFlags[order.id] && (
                    <div className="automation-alert-icon" title={automationFlags[order.id].reason}>
                      <Clock size={14} color="#ffd700" />
                    </div>
                  )}
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

      {/* ── Bulk Action Bar ── */}
      {selectedOrderIds.length > 0 && (
        <div className="bulk-action-bar-container">
          <div className="bulk-action-bar liquid-glass">
            <div className="bulk-info">
              <div className="selection-count">{selectedOrderIds.length}</div>
              <div className="selection-text">Selected</div>
            </div>
            <div className="bulk-actions-group">
              <Button variant="ghost" size="sm" className="bulk-btn" onClick={() => handleBulkStatusChange('Confirmed')}>
                <CheckCircle size={14} /> Confirm
              </Button>
              <Button variant="ghost" size="sm" className="bulk-btn" onClick={() => handleBulkStatusChange('Pending Call')}>
                <Clock size={14} /> Pend Call
              </Button>
              <Button variant="ghost" size="sm" className="bulk-btn">
                <Printer size={14} /> Print Labels
              </Button>
              <div className="bulk-divider" />
              <Button variant="ghost" size="sm" className="bulk-btn delete" onClick={handleBulkDelete}>
                <Trash2 size={14} /> Delete
              </Button>
            </div>
            <button className="bulk-close" onClick={() => setSelectedOrderIds([])}>
              <X size={16} />
            </button>
          </div>
        </div>
      )}
      </Card>


      <Modal
        isOpen={isNewOrderModalOpen}
        onClose={() => {
          setIsNewOrderModalOpen(false);
          setFormErrors({});
        }}
        title="Create New Order"
      >
        <form onSubmit={handleNewOrderSubmit} className="new-order-form">
          <div className="form-grid">
            <Input
              label="Customer Name"
              placeholder="Full name"
              value={formData.customer_name}
              onChange={e => {
                setFormData({ ...formData, customer_name: e.target.value });
                if (formErrors.customer_name) setFormErrors(prev => ({ ...prev, customer_name: '' }));
              }}
              error={formErrors.customer_name}
              required
            />
            <Input
              label="Phone Number"
              placeholder="01XXXXXXXXX"
              value={formData.phone}
              onChange={e => {
                const cleaned = e.target.value.replace(/\D/g, '').slice(0, 11);
                setFormData({ ...formData, phone: cleaned });
                if (formErrors.phone) setFormErrors(prev => ({ ...prev, phone: '' }));
              }}
              error={formErrors.phone}
              inputMode="numeric"
              maxLength={11}
              helperText="Must start with 01 and contain 11 digits."
              required
            />
          </div>

          <Input
            label="Delivery Address"
            placeholder="Full shipping address"
            value={formData.address}
            onChange={e => {
              setFormData({ ...formData, address: e.target.value });
              if (formErrors.address) setFormErrors(prev => ({ ...prev, address: '' }));
            }}
            error={formErrors.address}
            className="full-width-input"
            required
          />

          <div className="delivery-zone-module">
            <div className="delivery-zone-head">
              <div>
                <p className="delivery-zone-title">Delivery Zone</p>
                <p className="delivery-zone-subtitle">Choose where the parcel will be delivered. Charge is auto-applied.</p>
              </div>
            </div>

            <div className="delivery-zone-options" role="radiogroup" aria-label="Delivery Zone">
              {DELIVERY_ZONES.map(zone => {
                const isActive = formData.shipping_zone === zone.value;
                return (
                  <button
                    key={zone.value}
                    type="button"
                    className={`delivery-zone-card ${isActive ? 'active' : ''}`}
                    onClick={() => {
                      setFormData({ ...formData, shipping_zone: zone.value });
                      if (formErrors.shipping_zone) setFormErrors(prev => ({ ...prev, shipping_zone: '' }));
                    }}
                    aria-pressed={isActive}
                  >
                    <span className="zone-name">{zone.value}</span>
                    <span className="zone-charge">৳{zone.charge.toLocaleString()}</span>
                  </button>
                );
              })}
            </div>

            {formErrors.shipping_zone && (
              <p className="zone-error-text">{formErrors.shipping_zone}</p>
            )}
          </div>

          <div className="line-items-module">
            <div className="line-items-head">
              <p className="line-items-title">Order Line Items</p>
              <label className="line-duplicate-toggle">
                <input
                  type="checkbox"
                  checked={formData.duplicate_policy === 'merge'}
                  onChange={e => setFormData({ ...formData, duplicate_policy: e.target.checked ? 'merge' : 'separate' })}
                />
                <span>Auto merge duplicates</span>
              </label>
            </div>

            <div className="line-composer-grid">
              <div className="input-group full-width">
                <label className="input-label">Product Category</label>
                <select
                  className="input-field glass-select"
                  value={lineDraft.product_name}
                  onChange={e => {
                    const val = e.target.value;
                    setLineDraft({ ...lineDraft, product_name: val, toybox_serial: '' });
                    if (formErrors.line_product) setFormErrors(prev => ({ ...prev, line_product: '' }));
                  }}
                >
                  <option value="">Select a product...</option>
                  {PRODUCT_CHECKPOINTS.filter(p => p.id !== 'all').map(product => (
                    <option key={product.id} value={product.name}>
                      {product.name}
                    </option>
                  ))}
                </select>
                {formErrors.line_product && <span className="input-helper inline-field-error">{formErrors.line_product}</span>}
              </div>

              <Input
                label="Size"
                placeholder="E.g. XL"
                value={lineDraft.size}
                onChange={e => setLineDraft({ ...lineDraft, size: e.target.value })}
              />

              {lineDraft.product_name === 'TOY BOX' && (
                <div className="input-group full-width">
                  <label className="input-label">Toy Box Serial</label>
                  <select
                    className="input-field glass-select"
                    value={lineDraft.toybox_serial}
                    onChange={e => {
                      setLineDraft({ ...lineDraft, toybox_serial: e.target.value });
                      if (formErrors.line_serial) setFormErrors(prev => ({ ...prev, line_serial: '' }));
                    }}
                  >
                    <option value="">Select serial...</option>
                    {Array.from({ length: 38 }, (_, i) => i + 1).map(num => (
                      <option key={num} value={String(num)}>{num}</option>
                    ))}
                  </select>
                  {formErrors.line_serial && <span className="input-helper inline-field-error">{formErrors.line_serial}</span>}
                </div>
              )}

              <Input
                label="Quantity"
                type="number"
                min="1"
                value={lineDraft.quantity}
                onChange={e => {
                  setLineDraft({ ...lineDraft, quantity: e.target.value });
                  if (formErrors.line_quantity) setFormErrors(prev => ({ ...prev, line_quantity: '' }));
                }}
              />

              <Input
                label="Unit Price (৳)"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={lineDraft.unit_price}
                onChange={e => {
                  setLineDraft({ ...lineDraft, unit_price: e.target.value });
                  if (formErrors.line_price) setFormErrors(prev => ({ ...prev, line_price: '' }));
                }}
              />

              <div className="line-composer-actions">
                <Button type="button" variant="primary" onClick={addOrUpdateLineItem}>
                  {editingLineId ? 'Update Line' : 'Add Line'}
                </Button>
                {editingLineId && (
                  <Button type="button" variant="ghost" onClick={resetLineDraft}>
                    Cancel Edit
                  </Button>
                )}
              </div>
            </div>

            <div className="line-items-list">
              {(formData.order_lines || []).length === 0 ? (
                <div className="line-empty-state">No line items yet. Add first product line.</div>
              ) : (
                (formData.order_lines || []).map((line, index) => (
                  <div key={line.line_id} className="line-item-card">
                    <div className="line-item-main">
                      <p className="line-item-name">{index + 1}. {line.product_name}</p>
                      <p className="line-item-meta">
                        {line.size ? `Size: ${line.size}` : 'No size'}
                        {line.toybox_serial ? ` • Serial: ${line.toybox_serial}` : ''}
                      </p>
                    </div>
                    <div className="line-item-qty-controls">
                      <button type="button" className="qty-btn" onClick={() => updateLineQuantity(line.line_id, (line.quantity || 1) - 1)}>-</button>
                      <input
                        type="number"
                        min="1"
                        value={line.quantity}
                        onChange={e => updateLineQuantity(line.line_id, parseInt(e.target.value, 10) || 1)}
                      />
                      <button type="button" className="qty-btn" onClick={() => updateLineQuantity(line.line_id, (line.quantity || 1) + 1)}>+</button>
                    </div>
                    <div className="line-item-price">
                      <span>৳{Number(line.unit_price || 0).toLocaleString()}</span>
                      <strong>৳{Number(line.line_total || 0).toLocaleString()}</strong>
                    </div>
                    <div className="line-item-actions">
                      <button type="button" className="line-action-btn" onClick={() => handleEditLine(line)}>Edit</button>
                      <button type="button" className="line-action-btn danger" onClick={() => handleRemoveLine(line.line_id)}>Remove</button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {formErrors.order_lines && <p className="zone-error-text">{formErrors.order_lines}</p>}
          </div>

          <div className="form-grid three-cols">
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

          <div className="delivery-summary-box">
            <div className="delivery-summary-row">
              <span>Product Amount</span>
              <strong>৳{orderSubtotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong>
            </div>
            <div className="delivery-summary-row">
              <span>Delivery Charge</span>
              <strong>
                {formData.shipping_zone
                  ? `৳${deliveryCharge.toLocaleString()}`
                  : 'Select zone'}
              </strong>
            </div>
            <div className="delivery-summary-row total">
              <span>Payable Total</span>
              <strong>৳{payableTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong>
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

      <OrderEditModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        order={selectedOrderForEdit}
      />
    </div>
  );
};
