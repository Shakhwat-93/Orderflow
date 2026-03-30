import React, { useState, useEffect } from 'react';
import { useOrders } from '../context/OrderContext';
import { Input } from './Input';
import { Button } from './Button';
import { Modal } from './Modal';
import { Wand2, Truck, MapPin, X, Plus, Package, Users, AlertTriangle, History, CheckCircle2, PhoneCall, Clock } from 'lucide-react';
import api from '../lib/api';
import CurrencyIcon from './CurrencyIcon';
import { useAuth } from '../context/AuthContext';
import './OrderHistoryTimeline.css';
import './OrderEditModal.css';

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

const ORDER_STATUSES = [
  'New', 'Pending Call', 'Confirmed', 'Factory Queue', 'Courier Ready',
  'Courier Submitted', 'Factory Processing', 'Completed', 'Cancelled'
];

const SOURCES = ['Website', 'Facebook', 'Instagram', 'Direct'];

export const OrderEditModal = ({ isOpen, onClose, order = null }) => {
  const { addOrder, editOrder } = useOrders();
  const { onlineUsers, user, updatePresenceContext } = useAuth();
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [aiText, setAiText] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [isManualAmount, setIsManualAmount] = useState(false);
  const [manualSubtotal, setManualSubtotal] = useState(0);
  const [activityLogs, setActivityLogs] = useState([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  const initialFormData = {
    customer_name: '', 
    phone: '', 
    address: '', 
    source: 'Website', 
    notes: '', 
    amount: '0', 
    shipping_zone: 'Inside Dhaka',
    status: 'New',
    products: [{ name: 'TOY BOX', quantity: 1, size: '', price: 1250, isToyBox: true, toyBoxNumber: null }]
  };

  const [formData, setFormData] = useState(initialFormData);

  useEffect(() => {
    if (isOpen) {
      if (order) {
        // Map legacy or current items
        let items = [];
        if (Array.isArray(order.ordered_items) && order.ordered_items.length > 0) {
          items = order.ordered_items.map(item => {
            if (typeof item === 'object') return item;
            return { name: 'TOY BOX', quantity: 1, isToyBox: true, toyBoxNumber: item, price: 1250 };
          });
        } else if (order.product_name) {
          items = [{ 
            name: order.product_name, 
            quantity: order.quantity || 1, 
            size: order.size || '', 
            price: order.amount / (order.quantity || 1) || PRODUCT_PRICES[order.product_name] || 0
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
          status: order.status || 'New',
          products: items.length > 0 ? items : [{ name: 'TOY BOX', quantity: 1, size: '', price: 1250, isToyBox: true, toyBoxNumber: null }]
        });
        setIsManualAmount(true);
        const shippingZone = order.shipping_zone || 'Inside Dhaka';
        const shippingCharge = shippingZone === 'Inside Dhaka' ? 80 : 150;
        setManualSubtotal(Math.max(0, parseFloat(order.amount || '0') - shippingCharge));
      } else {
        setFormData(initialFormData);
        setIsManualAmount(false);
        setManualSubtotal(0);
        setAiText('');
      }

      // Update Presence Context
      const contextPage = order ? `Editing Order #${order.id}` : 'Creating New Order';
      updatePresenceContext(contextPage, order ? { orderId: order.id } : null);

      // Fetch Activity logs if editing
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

      return () => {
        updatePresenceContext('Browsing');
      };
    }
  }, [isOpen, order, updatePresenceContext]);

  // Find other users editing the same order
  const otherEditors = order ? onlineUsers.filter(u => 
    u.id !== user.id && 
    u.context?.details?.orderId === order.id
  ) : [];

  // Total calculation logic
  useEffect(() => {
    let subtotal = 0;
    if (isManualAmount) {
      subtotal = manualSubtotal;
    } else {
      subtotal = formData.products.reduce((acc, p) => acc + (parseFloat(p.price || 0) * (p.quantity || 1)), 0);
    }
    let shippingCharge = formData.shipping_zone === 'Inside Dhaka' ? 80 : 150;
    setFormData(prev => ({ ...prev, amount: String(subtotal + shippingCharge) }));
  }, [formData.products, formData.shipping_zone, isManualAmount, manualSubtotal]);

  const handleAIExtract = async () => {
    if (!aiText.trim()) return;
    setIsExtracting(true);
    try {
      const extracted = await api.extractOrderWithAI(aiText);
      if (extracted) {
        const mappedProducts = extracted.products.map(p => {
          const matchedCategory = PRODUCT_OPTIONS.find(opt => 
            p.name.toUpperCase().includes(opt.toUpperCase())
          ) || 'TOY BOX';

          const boxMatch = p.name.match(/#(\d+)/);
          const boxNum = boxMatch ? parseInt(boxMatch[1]) : null;

          return {
            name: matchedCategory,
            quantity: p.quantity,
            size: p.size || '',
            price: PRODUCT_PRICES[matchedCategory] || 0,
            isToyBox: matchedCategory === 'TOY BOX',
            toyBoxNumber: boxNum
          };
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
    setFormData(prev => ({
      ...prev,
      products: [...prev.products, { name: 'TOY BOX', quantity: 1, size: '', price: PRODUCT_PRICES['TOY BOX'], isToyBox: true, toyBoxNumber: null }]
    }));
  };

  const removeProduct = (index) => {
    setFormData(prev => ({
      ...prev,
      products: prev.products.filter((_, i) => i !== index)
    }));
  };

  const updateProduct = (index, updates) => {
    setFormData(prev => {
      const newProducts = [...prev.products];
      if (updates.name && PRODUCT_PRICES[updates.name]) {
        updates.price = PRODUCT_PRICES[updates.name];
        updates.isToyBox = updates.name === 'TOY BOX';
      }
      newProducts[index] = { ...newProducts[index], ...updates };
      return { ...prev, products: newProducts };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.customer_name || !formData.phone || formData.products.length === 0) {
      alert("Please fill in basic details and add at least one product.");
      return;
    }
    setIsSubmitting(true);
    try {
      const payload = {
        customer_name: formData.customer_name,
        phone: formData.phone,
        address: formData.address,
        product_name: formData.products.length > 1 ? `${formData.products.length} Items` : formData.products[0].name,
        size: formData.products[0]?.size || '',
        quantity: formData.products.reduce((acc, p) => acc + (p.quantity || 1), 0),
        source: formData.source,
        notes: formData.notes,
        amount: parseFloat(formData.amount) || 0,
        shipping_zone: formData.shipping_zone,
        ordered_items: formData.products,
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

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      title={order ? "Edit Order" : "Add New Order"}
      width="800px"
    >
      {otherEditors.length > 0 && (
        <div className="live-editing-banner">
          <div className="banner-left">
            <div className="users-icon-pulse">
              <Users size={16} />
            </div>
            <span className="banner-text">
              <strong>{otherEditors.map(u => u.name).join(', ')}</strong> {otherEditors.length === 1 ? 'is' : 'are'} also looking at this order.
            </span>
          </div>
          <div className="banner-right">
            <AlertTriangle size={14} />
            <span>Possible Conflict</span>
          </div>
        </div>
      )}

      {/* AI Magic Assistant at the Top */}
      <div className="ai-magic-section">
        <div className="ai-header">
          <Wand2 size={16} color="#7c3aed" />
          <span className="ai-title">AI Magic Assistant (Autofill)</span>
        </div>
        <textarea 
          className="ai-textarea" 
          placeholder="Paste raw order text from WhatsApp/Facebook here..." 
          value={aiText}
          onChange={(e) => setAiText(e.target.value)}
          style={{ minHeight: '100px' }}
        />
        <button 
          type="button" 
          className="ai-magic-btn"
          onClick={handleAIExtract}
          disabled={isExtracting || !aiText.trim()}
        >
          {isExtracting ? 'Analyzing...' : <><Wand2 size={16} /> Magic Autofill</>}
        </button>
      </div>

      <form onSubmit={handleSubmit} className="new-order-form">
        <div className="form-grid">
          <Input label="Customer Name" placeholder="Full name" value={formData.customer_name} onChange={e => setFormData({...formData, customer_name: e.target.value})} required />
          <Input label="Phone Number" placeholder="+880 1XXX-XXXXXX" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} required />
        </div>
        <Input label="Delivery Address" placeholder="Full shipping address" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} className="full-width-input" required />
        
        <div className="input-group full-width" style={{ marginTop: 'var(--sp-4)' }}>
          <label className="input-label">Ordered Products</label>
          <div className="multi-product-container">
            {formData.products.map((item, idx) => (
              <div key={idx} className="product-item-row-wrapper">
                <div className="product-item-row">
                  <div className="input-group">
                    <select 
                      className="input-field glass-select" 
                      value={item.name} 
                      onChange={e => updateProduct(idx, { name: e.target.value })}
                    >
                      {PRODUCT_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <Input 
                    placeholder="Size" 
                    value={item.size} 
                    onChange={e => updateProduct(idx, { size: e.target.value })} 
                  />
                  <Input 
                    type="number" 
                    min="1" 
                    value={item.quantity} 
                    onChange={e => updateProduct(idx, { quantity: parseInt(e.target.value) || 1 })} 
                  />
                  <button type="button" className="remove-item-btn" onClick={() => removeProduct(idx)}>
                    <X size={16} />
                  </button>
                </div>
                
                {item.isToyBox && (
                  <div className="toy-box-selector">
                    <label className="input-label" style={{ fontSize: '11px', opacity: 0.7 }}>Serial Number</label>
                    <div className="toy-box-grid">
                      {Array.from({ length: 38 }, (_, i) => i + 1).map(num => (
                        <button
                          key={num}
                          type="button"
                          className={`toy-box-btn ${item.toyBoxNumber === num ? 'selected' : ''}`}
                          onClick={() => updateProduct(idx, { toyBoxNumber: num })}
                        >
                          {num}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
            <button type="button" className="add-item-btn" onClick={addProduct}>
              <Plus size={16} /> Add Another Product
            </button>
          </div>
        </div>

        <div className="form-grid" style={{ marginTop: 'var(--sp-6)' }}>
           <div className="input-group">
            <label className="input-label">Shipping Zone</label>
            <select className="input-field glass-select" value={formData.shipping_zone} onChange={e => setFormData({...formData, shipping_zone: e.target.value})}>
              <option value="Inside Dhaka">Inside Dhaka (৳80)</option>
              <option value="Outside Dhaka">Outside Dhaka (৳150)</option>
            </select>
          </div>
          <div className="input-group">
            <label className="input-label">Order Source</label>
            <select className="input-field glass-select" value={formData.source} onChange={e => setFormData({...formData, source: e.target.value})}>
              {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        <div className="total-display">
          <span>Total Amount:</span>
          <strong><CurrencyIcon size={16} className="currency-icon-elite" />{formData.amount}</strong>
        </div>

        <Input label="Order Notes" placeholder="Special instructions..." value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} isTextarea className="full-width-input" />
        
        {order && (
          <div className="input-group full-width">
            <label className="input-label">Status</label>
            <select className="input-field glass-select" value={formData.status || 'New'} onChange={e => setFormData({...formData, status: e.target.value})}>
              {ORDER_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        )}

        <div className="form-actions">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : (order ? "Save Changes" : "Create Order")}
          </Button>
        </div>

        {order && (
          <div className="order-history-section">
            <div className="history-header">
              <div className="history-title">
                <History size={18} />
                <span>Order History & Audit</span>
              </div>
              <div className="sla-audit-summary">
                {order.first_call_time && (
                  <div className="audit-badge highlight">
                    First Call: {Math.floor((new Date(order.first_call_time) - new Date(order.created_at)) / 60000)}m
                  </div>
                )}
                <div className="audit-badge">
                  {order.call_attempts || 0} Call Attempts
                </div>
              </div>
            </div>

            {isLoadingLogs ? (
              <div className="loading-logs">Loading history...</div>
            ) : activityLogs.length === 0 ? (
              <div className="empty-logs">No activity records found.</div>
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
      </form>
    </Modal>
  );
};
