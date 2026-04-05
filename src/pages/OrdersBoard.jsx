import { useState, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation, useNavigate } from 'react-router-dom';
import { useOrders } from '../context/OrderContext';
import { useAuth } from '../context/AuthContext';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { Search, Globe, ChevronDown, ChevronLeft, ChevronRight, CheckCircle, Clock, Printer, Trash2, X, AlertTriangle, Edit2, Plus, Download, Calendar, MoreHorizontal, Phone, Sparkles } from 'lucide-react';
import CurrencyIcon from '../components/CurrencyIcon';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { OrderDetailsModal } from '../components/OrderDetailsModal';
import { PremiumSearch } from '../components/PremiumSearch';
import { Input } from '../components/Input';
import { DateRangePicker } from '../components/DateRangePicker';
import { OrderRow } from '../components/OrderRow';
import { OrderEditModal } from '../components/OrderEditModal';
import BulkOrderCreator from '../components/BulkOrderCreator';
import './OrdersBoard.css';
import '../components/BulkActions.css';
import api from '../lib/api';
import { pageVariants } from '../lib/motion';
import { getProductCheckpoints } from '../utils/productCatalog';

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
    pageSize, filters, updateOrderStatus, autoDistributeOrders, toyBoxes, inventory
  } = useOrders();
  const productCheckpoints = getProductCheckpoints(inventory);

  const [distributing, setDistributing] = useState(false);
  const [deepLinkOrder, setDeepLinkOrder] = useState(null);

  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [isNewOrderModalOpen, setIsNewOrderModalOpen] = useState(false);
  const [isBulkCreatorOpen, setIsBulkCreatorOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedOrderForEdit, setSelectedOrderForEdit] = useState(null);
  const [selectedOrderIds, setSelectedOrderIds] = useState([]);

  // Deep Link Observer: Handle direct order modal triggers
  useEffect(() => {
    const queryParams = new URLSearchParams(location.search);
    const viewOrderId = queryParams.get('viewOrder');
    
    if (viewOrderId) {
      const existing = orders.find(o => o.id === viewOrderId);
      if (existing) {
        setSelectedOrderId(viewOrderId);
        setIsDetailsModalOpen(true);
        queryParams.delete('viewOrder');
        navigate({ search: queryParams.toString() }, { replace: true });
      } else {
        api.getOrderById(viewOrderId).then(order => {
          setDeepLinkOrder(order);
          setSelectedOrderId(viewOrderId);
          setIsDetailsModalOpen(true);
          queryParams.delete('viewOrder');
          navigate({ search: queryParams.toString() }, { replace: true });
        }).catch(err => console.error('Deep link fetch error:', err));
      }
    }
  }, [location.search, orders, navigate]);

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
    orders.find(o => o.id === selectedOrderId) || deepLinkOrder,
    [orders, selectedOrderId, deepLinkOrder]
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
      <motion.div 
        variants={pageVariants}
        initial="hidden"
        animate="visible"
        className="orders-header-container"
      >
        <div className="page-header orders-header elite-enterprise-header">
          <div className="header-main-stack">
            <div className="title-group-elite">
              <h1 className="premium-title-enterprise">
                <span className="text-dark">Orders </span>
                <span className="text-accent-indigo">Management</span>
              </h1>
              <p className="premium-subtitle-enterprise">Full control over your order pipeline and customer records.</p>
            </div>
          </div>

          <div className="header-actions-enterprise">
            <Button variant="ghost" className="export-btn-light">
              <Download size={18} /> <span>Export CSV</span>
            </Button>
            
            <Button
              variant="secondary"
              className="action-btn-green"
              onClick={handleAutoDistribute}
              disabled={distributing}
            >
              {distributing ? 'Processing...' : 'AUTO DISTRIBUTE ORDERS'}
            </Button>

            {hasAnyRole(['Admin', 'Moderator']) && (
              <>
                <Button variant="primary" className="action-btn-green" onClick={() => setIsNewOrderModalOpen(true)}>
                  <Plus size={18} />
                  <span>New Order</span>
                </Button>
              </>
            )}
          </div>
        </div>
      </motion.div>

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
        <PremiumSearch
          value={filters.searchTerm}
          onChange={(e) => handleFilterChange('searchTerm', e.target.value)}
          placeholder="Search ID, name or phone..."
          suggestions={
            filters.searchTerm ? orders.filter(o => 
              o.id.toLowerCase().includes(filters.searchTerm.toLowerCase()) ||
              o.customer_name?.toLowerCase().includes(filters.searchTerm.toLowerCase()) ||
              o.phone?.includes(filters.searchTerm)
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
              setSelectedOrder(item.original);
              setIsDetailsModalOpen(true);
            }
          }}
        />

        <div className="elite-select-wrapper">
          <Globe size={16} className="elite-select-icon" />
          <select
            className="elite-select-field"
            value={filters.source}
            onChange={(e) => handleFilterChange('source', e.target.value)}
          >
            <option value="All">All Sources</option>
            {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <ChevronDown size={14} className="ml-auto opacity-50" />
        </div>

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
          {productCheckpoints.map((product) => (
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

        {/* Mobile Card View (Elite Upgrade) */}
        <div className="orders-mobile-list mobile-only">
          {Array.isArray(orders) && orders.map(order => (
            <div
              key={order.id}
              className="order-mobile-card elite-card"
              onClick={() => handleRowClick(order)}
            >
              <div className="card-header-elite">
                <div className="id-group">
                  <span className="order-id">#{order.id.replace('ORD-', '')}</span>
                  <div className="card-flags">
                    {fraudFlags[order.id] && (
                      <AlertTriangle size={14} className="flag-icon fraud" />
                    )}
                    {automationFlags[order.id] && (
                      <Clock size={14} className="flag-icon auto" />
                    )}
                  </div>
                </div>
                <Badge variant={getStatusBadgeVariant(order.status)}>
                  {order.status}
                </Badge>
              </div>

              <div className="card-body-elite">
                <div className="customer-primary-box">
                  <h3 className="customer-name-large">{order.customer_name}</h3>
                  <div className="phone-row">
                    <Phone size={12} />
                    <span>{order.phone}</span>
                  </div>
                </div>

                <div className="details-grid-elite">
                  <div className="detail-box-elite">
                    <span className="detail-label">Product</span>
                    <span className="detail-value product">{order.product_name}</span>
                    <span className="detail-subvalue">{order.size || 'No Size'} • {order.source}</span>
                  </div>
                  <div className="detail-box-elite">
                    <span className="detail-label">Logistics</span>
                    <span className="detail-value">
                      <CurrencyIcon size={12} className="currency-icon-elite" />
                      {Number(order.amount || 0).toLocaleString()}
                    </span>
                    <span className="detail-subvalue">{order.shipping_zone || 'Outside Dhaka'}</span>
                  </div>
                </div>
              </div>

              <div className="card-footer-elite">
                <span className="created-at">
                  {order.created_at ? new Date(order.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : 'N/A'}
                </span>
                <div className="footer-actions">
                  <button 
                    className="details-btn-mobile"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRowClick(order);
                    }}
                  >
                    View Details
                  </button>
                  <button 
                    className="edit-btn-mobile"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenEditModal(order);
                    }}
                  >
                    <Edit2 size={16} />
                  </button>
                </div>
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


      <OrderEditModal
        isOpen={isNewOrderModalOpen}
        onClose={() => {
          setIsNewOrderModalOpen(false);
        }}
        order={null}
      />








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

      <BulkOrderCreator
        isOpen={isBulkCreatorOpen}
        onClose={() => setIsBulkCreatorOpen(false)}
      />
    </div>
  );
};
