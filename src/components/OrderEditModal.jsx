import React, { useState, useEffect, useMemo } from 'react';
import { useOrders } from '../context/OrderContext';
import { Modal } from './Modal';
import { Wand2, X, Plus, Package, Users, AlertTriangle, History, MapPin, Phone, User, Tag, FileText, Globe, ShieldCheck } from 'lucide-react';
import api from '../lib/api';
import CurrencyIcon from './CurrencyIcon';
import { useAuth } from '../context/AuthContext';
import { buildProductCatalog, createProductLine, filterToyBoxesByProduct, findBestProductMatch, findProductRecordByName } from '../utils/productCatalog';
import './OrderHistoryTimeline.css';
import './OrderEditModal.css';

const ORDER_STATUSES = [
  'New', 'Pending Call', 'Confirmed', 'Factory Queue', 'Courier Ready',
  'Courier Submitted', 'Factory Processing', 'Completed', 'Fake Order', 'Cancelled'
];

const SOURCES = ['Website', 'Facebook', 'Instagram', 'Direct'];
const DELIVERY_ZONES = {
  'Inside Dhaka': 80,
  'Outside Dhaka': 150
};

const getDeliveryChargeForZone = (zone) => DELIVERY_ZONES[zone] ?? 150;

export const OrderEditModal = ({ isOpen, onClose, order = null }) => {
  const { addOrder, editOrder, inventory, toyBoxes } = useOrders();
  const { onlineUsers, user, updatePresenceContext } = useAuth();
  const productOptions = buildProductCatalog(inventory).map((item) => item.name);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [aiText, setAiText] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [isManualAmount, setIsManualAmount] = useState(false);
  const [manualSubtotal, setManualSubtotal] = useState(0);
  const [activityLogs, setActivityLogs] = useState([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  const initialFormData = useMemo(() => ({
    customer_name: '', phone: '', address: '', source: 'Website',
    notes: '', amount: '0', shipping_zone: 'Inside Dhaka', delivery_charge: 80, status: 'New',
    products: [createProductLine(inventory, 'TOY BOX')]
  }), [inventory]);

  const [formData, setFormData] = useState(initialFormData);

  useEffect(() => {
    if (isOpen) {
      if (order) {
        let items = [];
        if (Array.isArray(order.ordered_items) && order.ordered_items.length > 0) {
          items = order.ordered_items.map(item => {
            if (typeof item === 'object') {
              const matchedProduct = findProductRecordByName(inventory, item.name);
              return {
                ...item,
                price: item.price ?? matchedProduct?.unit_price ?? 0,
                isToyBox: typeof item.isToyBox === 'boolean' ? item.isToyBox : matchedProduct?.isToyBox || false
              };
            }
            return createProductLine(inventory, 'TOY BOX', { quantity: 1, toyBoxNumber: item });
          });
        } else if (order.product_name) {
          const matchedProduct = findProductRecordByName(inventory, order.product_name);
          items = [{
            name: order.product_name, quantity: order.quantity || 1, size: order.size || '',
            price: order.amount / (order.quantity || 1) || matchedProduct?.unit_price || 0,
            isToyBox: matchedProduct?.isToyBox || false,
            toyBoxNumber: null
          }];
        }

        setFormData({
          customer_name: order.customer_name || '',
          phone: order.phone || '',
          address: order.address || '',
          source: order.source || 'Website',
          notes: order.notes || '',
          amount: String(order.amount || '0'),
          shipping_zone: order.shipping_zone || 'Inside Dhaka',
          delivery_charge: Number(
            order.delivery_charge ??
            order.pricing_summary?.delivery_charge ??
            getDeliveryChargeForZone(order.shipping_zone || 'Inside Dhaka')
          ) || 0,
          status: order.status || 'New',
          products: items.length > 0 ? items : [createProductLine(inventory, 'TOY BOX')]
        });
        setIsManualAmount(true);
        const shippingCharge = Number(
          order.delivery_charge ??
          order.pricing_summary?.delivery_charge ??
          getDeliveryChargeForZone(order.shipping_zone || 'Inside Dhaka')
        ) || 0;
        setManualSubtotal(Math.max(0, parseFloat(order.amount || '0') - shippingCharge));
      } else {
        setFormData({
          ...initialFormData,
          products: [createProductLine(inventory, 'TOY BOX')]
        });
        setIsManualAmount(false);
        setManualSubtotal(0);
        setAiText('');
      }

      const contextPage = order ? `Editing Order #${order.id}` : 'Creating New Order';
      updatePresenceContext(contextPage, order ? { orderId: order.id } : null);

      if (order?.id) {
        const fetchLogs = async () => {
          setIsLoadingLogs(true);
          try {
            const logs = await api.getOrderActivity(order.id);
            setActivityLogs(logs || []);
          } catch (err) {
            console.error('Failed to fetch activity logs:', err);
          } finally {
            setIsLoadingLogs(false);
          }
        };
        fetchLogs();
      } else {
        setActivityLogs([]);
      }

      return () => { updatePresenceContext('Browsing'); };
    }
  }, [initialFormData, inventory, isOpen, order, updatePresenceContext]);

  const otherEditors = order ? onlineUsers.filter(u =>
    u.id !== user.id && u.context?.details?.orderId === order.id
  ) : [];

  useEffect(() => {
    let subtotal = 0;
    if (isManualAmount) {
      subtotal = manualSubtotal;
    } else {
      subtotal = formData.products.reduce((acc, p) => acc + (parseFloat(p.price || 0) * (p.quantity || 1)), 0);
    }
    const deliveryCharge = Number(formData.delivery_charge) || 0;
    setFormData(prev => {
      const nextAmount = String(subtotal + deliveryCharge);
      return prev.amount === nextAmount ? prev : { ...prev, amount: nextAmount };
    });
  }, [formData.products, formData.delivery_charge, isManualAmount, manualSubtotal]);

  const handleAIExtract = async () => {
    if (!aiText.trim()) return;
    setIsExtracting(true);
    try {
      const extracted = await api.extractOrderWithAI(aiText);
      if (extracted) {
        const mappedProducts = extracted.products.map(p => {
          const matchedProduct = findBestProductMatch(p.name, inventory) || findProductRecordByName(inventory, 'TOY BOX');
          const boxMatch = p.name.match(/#(\d+)/);
          const boxNum = boxMatch ? parseInt(boxMatch[1]) : null;
          return createProductLine(inventory, matchedProduct?.name || 'TOY BOX', {
            quantity: p.quantity,
            size: p.size || '',
            toyBoxNumber: boxNum
          });
        });

        setFormData(prev => ({
          ...prev,
          customer_name: extracted.customer_name || prev.customer_name,
          phone: extracted.phone || prev.phone,
          address: extracted.address || prev.address,
          shipping_zone: extracted.shipping_zone || prev.shipping_zone,
          notes: extracted.notes || prev.notes,
          products: mappedProducts.length > 0 ? mappedProducts : prev.products
        }));
        if (extracted.extracted_subtotal !== null) {
          setIsManualAmount(true);
          setManualSubtotal(extracted.extracted_subtotal);
        }
        setAiText('');
      }
    } catch (err) {
      console.error(err);
      alert('AI extraction failed.');
    } finally {
      setIsExtracting(false);
    }
  };

  const addProduct = () => {
    setIsManualAmount(false);
    setFormData(prev => ({
      ...prev,
      products: [...prev.products, createProductLine(inventory, 'TOY BOX')]
    }));
  };

  const removeProduct = (index) => {
    setFormData(prev => ({ ...prev, products: prev.products.filter((_, i) => i !== index) }));
  };

  const updateProduct = (index, updates) => {
    if (
      Object.prototype.hasOwnProperty.call(updates, 'price') ||
      Object.prototype.hasOwnProperty.call(updates, 'quantity') ||
      Object.prototype.hasOwnProperty.call(updates, 'name')
    ) {
      setIsManualAmount(false);
    }

    setFormData(prev => {
      const newProducts = [...prev.products];
      if (updates.name) {
        const matchedProduct = findProductRecordByName(inventory, updates.name);
        updates.price = matchedProduct?.unit_price || 0;
        updates.isToyBox = matchedProduct?.isToyBox || false;
        if (!(matchedProduct?.isToyBox)) {
          updates.toyBoxNumber = null;
        }
      }
      newProducts[index] = { ...newProducts[index], ...updates };
      return { ...prev, products: newProducts };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.customer_name || !formData.phone || formData.products.length === 0) {
      alert('Please fill in basic details and add at least one product.');
      return;
    }
    setIsSubmitting(true);
    try {
      const payload = {
        customer_name: formData.customer_name,
        phone: formData.phone,
        address: formData.address,
        product_name: formData.products.length > 1
          ? `${formData.products.length} Items`
          : formData.products[0].name,
        size: formData.products[0]?.size || '',
        quantity: formData.products.reduce((acc, p) => acc + (p.quantity || 1), 0),
        source: formData.source,
        notes: formData.notes,
        amount: parseFloat(formData.amount) || 0,
        shipping_zone: formData.shipping_zone,
        delivery_charge: Number(formData.delivery_charge) || 0,
        ordered_items: formData.products,
        order_lines_payload: formData.products,
        pricing_summary: {
          subtotal: formData.products.reduce((acc, item) => acc + ((Number(item.price) || 0) * (item.quantity || 1)), 0),
          delivery_charge: Number(formData.delivery_charge) || 0,
          payable_total: parseFloat(formData.amount) || 0
        },
        status: formData.status
      };

      if (order && order.id) {
        await editOrder(order.id, payload);
      } else {
        await addOrder(payload);
      }
      onClose();
    } catch (error) {
      console.error('Failed to save order:', error);
      alert('Failed to save order.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isEdit = Boolean(order && order.id);
  const handleShippingZoneChange = (zone) => {
    setIsManualAmount(false);
    setFormData((prev) => {
      const currentDefault = getDeliveryChargeForZone(prev.shipping_zone);
      const shouldSyncCharge = Number(prev.delivery_charge) === currentDefault || prev.delivery_charge === '' || prev.delivery_charge == null;
      return {
        ...prev,
        shipping_zone: zone,
        delivery_charge: shouldSyncCharge ? getDeliveryChargeForZone(zone) : prev.delivery_charge
      };
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? `Edit Order` : 'Create New Order'}
      subtitle={isEdit ? `#${order?.id} · ${order?.customer_name}` : 'Fill in the customer and product details below'}
    >
      {/* Conflict Banner */}
      {otherEditors.length > 0 && (
        <div className="live-editing-banner">
          <div className="banner-left">
            <div className="users-icon-pulse"><Users size={14} /></div>
            <span><strong>{otherEditors.map(u => u.name).join(', ')}</strong> {otherEditors.length === 1 ? 'is' : 'are'} also viewing this order.</span>
          </div>
          <div className="banner-right">
            <AlertTriangle size={13} /><span>Possible Conflict</span>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* Two-Panel Layout */}
        <div className="order-modal-layout">

          {/* ── LEFT PANEL: Customer Info ── */}
          <div className="order-modal-left">

            {/* Customer */}
            <div>
              <div className="form-section-label">
                <User size={13} /> Customer Details
              </div>
              <div className="form-grid" style={{ marginBottom: 14 }}>
                <div className="pm-input-group">
                  <label className="pm-label">Full Name *</label>
                  <input
                    className="pm-input"
                    placeholder="e.g. Rihana Jehan"
                    value={formData.customer_name}
                    onChange={e => setFormData({ ...formData, customer_name: e.target.value })}
                    required
                  />
                </div>
                <div className="pm-input-group">
                  <label className="pm-label">Phone Number *</label>
                  <input
                    className="pm-input"
                    placeholder="01XXXXXXXXX"
                    value={formData.phone}
                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div className="pm-input-group">
                <label className="pm-label">Delivery Address *</label>
                <input
                  className="pm-input"
                  placeholder="Full shipping address..."
                  value={formData.address}
                  onChange={e => setFormData({ ...formData, address: e.target.value })}
                  required
                />
              </div>
            </div>

            {/* Shipping Zone */}
            <div>
              <div className="form-section-label">
                <MapPin size={13} /> Delivery Zone
              </div>
              <div className="shipping-zone-cards">
                {[ 
                  { value: 'Inside Dhaka', price: '৳80' },
                  { value: 'Outside Dhaka', price: '৳150' }
                ].map(zone => (
                  <button
                    key={zone.value}
                    type="button"
                    className={`zone-card ${formData.shipping_zone === zone.value ? 'selected' : ''}`}
                    onClick={() => handleShippingZoneChange(zone.value)}
                  >
                    <span className="zone-card-name">{zone.value}</span>
                    <span className="zone-card-price">{zone.price}</span>
                  </button>
                ))}
              </div>
              <div className="pm-input-group">
                <label className="pm-label">Delivery Charge</label>
                <input
                  type="number"
                  className="pm-input"
                  min="0"
                  value={formData.delivery_charge}
                  onChange={e => {
                    setIsManualAmount(false);
                    setFormData({ ...formData, delivery_charge: Math.max(0, parseFloat(e.target.value) || 0) });
                  }}
                />
              </div>
            </div>

            {/* Source + Status */}
            <div className="form-grid">
              <div className="pm-input-group">
                <label className="pm-label">Order Source</label>
                <select
                  className="pm-input pm-select"
                  value={formData.source}
                  onChange={e => setFormData({ ...formData, source: e.target.value })}
                >
                  {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              {isEdit && (
                <div className="pm-input-group">
                  <label className="pm-label">Order Status</label>
                  <select
                    className="pm-input pm-select"
                    value={formData.status || 'New'}
                    onChange={e => setFormData({ ...formData, status: e.target.value })}
                  >
                    {ORDER_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              )}
            </div>

            {/* Notes */}
            <div className="pm-input-group">
              <label className="pm-label">Order Notes</label>
              <textarea
                className="pm-input pm-textarea"
                placeholder="Special instructions, size notes, etc..."
                value={formData.notes}
                onChange={e => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
              />
            </div>

            {/* Order History (edit mode only) */}
            {isEdit && (
              <div className="order-history-section">
                <div className="history-header">
                  <div className="history-title">
                    <History size={16} />
                    <span>Activity Log</span>
                  </div>
                  <div className="sla-audit-summary">
                    {order.first_call_time && (
                      <span className="audit-badge highlight">
                        First Call: {Math.floor((new Date(order.first_call_time) - new Date(order.created_at)) / 60000)}m
                      </span>
                    )}
                    <span className="audit-badge">{order.call_attempts || 0} Calls</span>
                  </div>
                </div>
                {isLoadingLogs ? (
                  <div className="loading-logs">Loading history...</div>
                ) : activityLogs.length === 0 ? (
                  <div className="empty-logs">No activity records yet.</div>
                ) : (
                  <div className="timeline-container">
                    {activityLogs.map((log, i) => {
                      const isCallLog = log.action_description?.toLowerCase().includes('call attempt');
                      const isStatusChange = log.action_type === 'STATUS_CHANGE';
                      const isCreate = log.action_description?.toLowerCase().includes('created') || i === activityLogs.length - 1;
                      let typeClass = 'update';
                      if (isCallLog) typeClass = 'call-log';
                      else if (isStatusChange) typeClass = 'status-change';
                      else if (isCreate) typeClass = 'create';
                      return (
                        <div key={log.id || i} className={`timeline-item ${typeClass}`}>
                          <div className="timeline-dot" />
                          <div className="timeline-content">
                            <div className="timeline-time">
                              {new Date(log.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                            </div>
                            <div className="timeline-desc">{log.action_description}</div>
                            <div className="timeline-user">
                              <div className="user-avatar-mini">
                                {(log.changed_by_user_name || 'U').charAt(0).toUpperCase()}
                              </div>
                              <span>{log.changed_by_user_name || 'System'}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── RIGHT PANEL: AI + Products ── */}
          <div className="order-modal-right">

            {/* AI Magic Assistant */}
            <div className="ai-magic-section">
              <div className="ai-header">
                <Wand2 size={15} color="#a855f7" />
                <span className="ai-title">AI Magic Autofill</span>
              </div>
              <textarea
                className="ai-textarea"
                placeholder="Paste raw order text from WhatsApp, Facebook, or any message here — AI will extract all fields automatically..."
                value={aiText}
                onChange={e => setAiText(e.target.value)}
                rows={4}
              />
              <button
                type="button"
                className="ai-magic-btn"
                onClick={handleAIExtract}
                disabled={isExtracting || !aiText.trim()}
              >
                <Wand2 size={14} />
                {isExtracting ? 'Analyzing...' : 'Magic Autofill'}
              </button>
            </div>

            {/* Products Section */}
            <div>
              <div className="form-section-label">
                <Package size={13} /> Order Line Items
              </div>
              <div className="multi-product-container">
                {formData.products.map((item, idx) => (
                  <div key={idx} className="product-item-row-wrapper">
                    <div className="product-item-row">
                      <select
                        className="pm-product-select"
                        value={item.name}
                        onChange={e => updateProduct(idx, { name: e.target.value })}
                      >
                        {productOptions.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                      <input
                        className="product-size-input"
                        placeholder="Size"
                        value={item.size || ''}
                        onChange={e => updateProduct(idx, { size: e.target.value })}
                      />
                      <input
                        type="number"
                        className="product-qty-input"
                        min="1"
                        value={item.quantity}
                        onChange={e => updateProduct(idx, { quantity: parseInt(e.target.value) || 1 })}
                      />
                      <input
                        type="number"
                        className="product-price-input"
                        min="0"
                        value={item.price}
                        onChange={e => updateProduct(idx, { price: Math.max(0, parseFloat(e.target.value) || 0) })}
                      />
                      <button
                        type="button"
                        className="remove-item-btn"
                        onClick={() => removeProduct(idx)}
                      >
                        <X size={14} />
                      </button>
                    </div>

                    {item.isToyBox && (
                      <div className="toy-box-selector">
                        <span className="toy-box-selector-label">{item.name} Serial Number</span>
                        <div className="toy-box-grid">
                          {filterToyBoxesByProduct(toyBoxes, item.name).map((box) => {
                            const num = box.toy_box_number;
                            return (
                            <button
                              key={`${item.name}-${num}`}
                              type="button"
                              className={`toy-box-btn ${item.toyBoxNumber === num ? 'selected' : ''}`}
                              onClick={() => updateProduct(idx, { toyBoxNumber: num })}
                            >
                              {num}
                            </button>
                          );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                <button type="button" className="add-item-btn" onClick={addProduct}>
                  <Plus size={15} /> Add Another Product
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Sticky Footer ── */}
        <div className="modal-form-footer">
          <div className="modal-footer-left">
            <span className="modal-footer-total-label">Total:</span>
            <span className="modal-footer-total">
              <CurrencyIcon size={15} />
              {Number(formData.amount).toLocaleString()}
            </span>
          </div>
          <div className="modal-footer-actions">
            <button type="button" className="btn-cancel-modal" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-submit-modal" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : (isEdit ? 'Save Changes' : 'Create Order')}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
};
