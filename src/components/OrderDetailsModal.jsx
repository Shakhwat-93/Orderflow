import React, { useState, useEffect, useRef } from 'react';
import { Modal } from './Modal';
import { Badge } from './Badge';
import { Button } from './Button';
import { useAuth } from '../context/AuthContext';
import { 
  User, Phone, MapPin, Package, Calendar, Clock, 
  History, Edit2, X, Clipboard, Copy, ExternalLink, 
  Truck, CheckCircle2, AlertCircle, Info, RotateCcw, Loader2
} from 'lucide-react';
import CurrencyIcon from './CurrencyIcon';
import api from '../lib/api';
import { useCourierRatio } from '../context/CourierRatioContext';
import './OrderDetailsModal.css';

export const OrderDetailsModal = ({ isOpen, onClose, order, onEdit }) => {
  const [activityLogs, setActivityLogs] = useState([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [savedNotesOverride, setSavedNotesOverride] = useState(null);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [activeTab, setActiveTab] = useState('details'); // 'details' | 'history'
  
  // Note Quick Templates States
  const [customTemplates, setCustomTemplates] = useState(() => {
    try {
      const saved = localStorage.getItem('orderflow_custom_notes_templates');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });
  const [newTemplateText, setNewTemplateText] = useState('');
  const [showAddTemplate, setShowAddTemplate] = useState(false);

  const applyTemplate = (templateText) => {
    if (noteDraft.trim()) {
      setNoteDraft(prev => prev.trim() + '\n' + templateText);
    } else {
      setNoteDraft(templateText);
    }
  };

  const saveCustomTemplate = () => {
    if (!newTemplateText.trim()) return;
    const updated = [...customTemplates, newTemplateText.trim()];
    setCustomTemplates(updated);
    localStorage.setItem('orderflow_custom_notes_templates', JSON.stringify(updated));
    setNewTemplateText('');
    setShowAddTemplate(false);
  };

  const deleteCustomTemplate = (indexToDelete, e) => {
    e.stopPropagation();
    const updated = customTemplates.filter((_, idx) => idx !== indexToDelete);
    setCustomTemplates(updated);
    localStorage.setItem('orderflow_custom_notes_templates', JSON.stringify(updated));
  };

  // Inline field editing state
  const [editingField, setEditingField] = useState(null); // 'phone' | 'address' | 'delivery_charge'
  const [editValue, setEditValue] = useState('');
  const [isSavingField, setIsSavingField] = useState(false);
  const [fieldError, setFieldError] = useState('');
  const [localOrder, setLocalOrder] = useState(null); // optimistic local update
  const copyTimeoutRef = useRef(null);
  const editInputRef = useRef(null);
  const { user, profile, userRoles } = useAuth();
  const { checkPhone, getRatio } = useCourierRatio();

  // Effective order = local override (optimistic) or prop
  const effectiveOrder = localOrder || order;

  const refreshLogs = async () => {
    if (!order?.id) return;
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

  useEffect(() => {
    if (isOpen && order?.id) {
      // Track Recently Viewed for Premium Search
      const savedViewed = JSON.parse(localStorage.getItem('premium_search_viewed') || '[]');
      const newItem = { id: order.id, label: order.customer_name || 'Unnamed Order', sub: `#${order.id.replace('ORD-', '')}`, type: 'order' };
      const newViewed = [newItem, ...savedViewed.filter(item => item.id !== order.id)].slice(0, 10);
      localStorage.setItem('premium_search_viewed', JSON.stringify(newViewed));
      setLocalOrder(null);
      setEditingField(null);
      setFieldError('');
      setActiveTab('details');
      refreshLogs();
    } else {
      setActivityLogs([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, order?.id]);

  useEffect(() => {
    setNoteDraft(String(order?.notes || ''));
    setSavedNotesOverride(null);
  }, [order?.id, order?.notes, isOpen]);

  useEffect(() => {
    if (isOpen && order?.phone) checkPhone(order.phone);
  }, [isOpen, order?.phone, checkPhone]);

  useEffect(() => () => {
    if (copyTimeoutRef.current) window.clearTimeout(copyTimeoutRef.current);
  }, []);

  // Focus the edit input when a field opens
  useEffect(() => {
    if (editingField && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select?.();
    }
  }, [editingField]);

  if (!effectiveOrder) return null;

  // ── Inline field helpers ──────────────────────────────────────
  const openEdit = (field) => {
    const current = field === 'delivery_charge'
      ? String(Number(effectiveOrder?.delivery_charge) || Number(effectiveOrder?.pricing_summary?.delivery_charge) || 0)
      : String(effectiveOrder?.[field] || '');
    setEditingField(field);
    setEditValue(current);
    setFieldError('');
  };

  const cancelEdit = () => {
    setEditingField(null);
    setEditValue('');
    setFieldError('');
  };

  const saveField = async () => {
    if (!effectiveOrder?.id || !user?.id) return;
    const trimmed = editValue.trim();
    if (!trimmed) { setFieldError('Value cannot be empty.'); return; }
    if (editingField === 'delivery_charge' && isNaN(Number(trimmed))) {
      setFieldError('Must be a valid number.'); return;
    }
    setIsSavingField(true);
    setFieldError('');
    try {
      const payload = editingField === 'delivery_charge'
        ? { delivery_charge: Number(trimmed) }
        : { [editingField]: trimmed };

      const userName = profile?.name || user?.email || 'Unknown User';
      await api.updateOrder(effectiveOrder.id, payload, user.id, userName, userRoles);

      // Optimistic local update so modal reflects change immediately
      setLocalOrder(prev => ({ ...(prev || effectiveOrder), ...payload }));
      setEditingField(null);
      setEditValue('');
      // Refresh activity log to show the new entry with user name
      await refreshLogs();
    } catch (err) {
      console.error('[OrderDetailsModal] saveField failed:', err);
      setFieldError(err.message || 'Save failed. Try again.');
    } finally {
      setIsSavingField(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && editingField !== 'address') saveField();
    if (e.key === 'Escape') cancelEdit();
  };

  /** Renders an editable info row */
  const EditableField = ({ field, label, icon: Icon, type = 'text', multiline = false }) => {
    const isEditing = editingField === field;
    const rawVal = field === 'delivery_charge'
      ? (Number(effectiveOrder?.delivery_charge) || Number(effectiveOrder?.pricing_summary?.delivery_charge) || null)
      : effectiveOrder?.[field];
    const displayVal = rawVal !== null && rawVal !== undefined && rawVal !== '' ? rawVal : '—';

    return (
      <div className={`info-item${multiline ? ' vertical' : ''}`}>
        <span className="info-label">{label}</span>
        {isEditing ? (
          <div className="odm-inline-edit-wrap">
            {multiline ? (
              <textarea
                ref={editInputRef}
                className="odm-inline-input odm-inline-textarea"
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={3}
                disabled={isSavingField}
              />
            ) : (
              <input
                ref={editInputRef}
                type={type}
                className="odm-inline-input"
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isSavingField}
              />
            )}
            {fieldError && <span className="odm-field-error">{fieldError}</span>}
            <div className="odm-inline-actions">
              <button className="odm-save-btn" onClick={saveField} disabled={isSavingField}>
                {isSavingField ? 'Saving...' : '✓ Save'}
              </button>
              <button className="odm-cancel-btn" onClick={cancelEdit} disabled={isSavingField}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="info-value-flex">
            {Icon && !multiline && <Icon size={13} style={{color:'var(--text-tertiary)', flexShrink:0}} />}
            <span className={`info-value${multiline ? '' : ''}`}>
              {field === 'delivery_charge' && rawVal !== null ? `৳${Number(rawVal).toLocaleString()}` : displayVal}
            </span>
            <button
              className="odm-edit-trigger"
              onClick={() => openEdit(field)}
              title={`Edit ${label}`}
            >
              <Edit2 size={12} />
            </button>
          </div>
        )}
      </div>
    );
  };

  const parseEmbeddedDeliveryCharge = (value) => {
    const text = String(value || '');
    const matches = [...text.matchAll(/(\d{2,5})/g)];
    if (matches.length === 0) return null;

    const parsed = Number(matches[matches.length - 1][1]);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  };

  const getCleanShippingZone = () => {
    const text = String(order.shipping_zone || '').trim();
    return text.replace(/\s*\([^)]*\d[^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim() || 'Delivery Zone';
  };

  const getStoredDeliveryCharge = () => {
    const embeddedCharge = parseEmbeddedDeliveryCharge(order.shipping_zone);
    if (embeddedCharge !== null) return embeddedCharge;

    const directCharge = Number(order.delivery_charge);
    if (Number.isFinite(directCharge) && directCharge > 0) return directCharge;

    const summaryCharge = Number(order.pricing_summary?.delivery_charge);
    if (Number.isFinite(summaryCharge) && summaryCharge > 0) return summaryCharge;

    return null;
  };

  const deliveryCharge = getStoredDeliveryCharge();
  const shippingZoneLabel = getCleanShippingZone();

  const getStatusVariant = (status) => {
    const s = String(status || '').toLowerCase();
    if (['confirmed', 'completed', 'delivered'].includes(s)) return 'success';
    if (s === 'bulk exported') return 'courier';
    if (['cancelled', 'returned', 'failed'].includes(s)) return 'danger';
    if (['pending', 'new', 'hold', 'pending call'].includes(s)) return 'warning';
    return 'neutral';
  };

  const getPaymentVariant = (status) => {
    const s = String(status || '').toLowerCase();
    if (['paid', 'success', 'completed'].includes(s)) return 'success';
    if (['failed', 'cancelled', 'refunded'].includes(s)) return 'danger';
    return 'warning';
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    // User gets a silent copy or you could add a toast here
  };

  const ipAddress = typeof order.ip_address === 'string'
    ? order.ip_address.trim()
    : order.ip_address
      ? String(order.ip_address)
      : '';

  const visibleNotes = savedNotesOverride ?? order.notes ?? '';
  const courierRatioData = getRatio(order?.phone);
  const courierBreakdownRows = courierRatioData?.couriers && typeof courierRatioData.couriers === 'object'
    ? Object.entries(courierRatioData.couriers)
        .map(([key, value]) => {
          const source = value && typeof value === 'object' ? value : {};
          const total = Number(source.total_parcel ?? source.total ?? 0) || 0;
          const success = Number(source.success_parcel ?? source.success_count ?? source.success ?? 0) || 0;
          const cancelled = Number(source.cancelled_parcel ?? source.cancelled_count ?? source.cancelled ?? 0) || 0;
          const ratio = Number(source.success_ratio ?? source.ratio ?? 0) || 0;

          return {
            key,
            name: source.name || key,
            logo: source.logo || '',
            total,
            success,
            cancelled,
            ratio: Math.max(0, Math.min(100, ratio))
          };
        })
        .filter((row) => row.name)
        .sort((a, b) => {
          if (b.ratio !== a.ratio) return b.ratio - a.ratio;
          if (b.success !== a.success) return b.success - a.success;
          return b.total - a.total;
        })
    : [];

  const orderDateTime = order.created_at
    ? new Date(order.created_at).toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      })
    : 'N/A';

  const productDetails = Array.isArray(order.order_lines_payload) && order.order_lines_payload.length > 0
    ? order.order_lines_payload.map((item) => ({
        name: item.product_name || 'Unknown Product',
        quantity: item.quantity || 1,
        size: item.size || '',
        price: Number(item.line_total ?? ((item.unit_price || 0) * (item.quantity || 1))) || 0
      }))
    : Array.isArray(order.ordered_items) && order.ordered_items.length > 0 && typeof order.ordered_items[0] === 'object'
      ? order.ordered_items.map((item) => ({
          name: item.name || item.product_name || 'Unknown Product',
          quantity: item.quantity || 1,
          size: item.size || '',
          price: Number((item.price || 0) * (item.quantity || 1)) || 0
        }))
      : [{
          name: order.product_name || 'Unknown Product',
          quantity: order.quantity || 1,
          size: order.size || '',
          price: Number(order.amount || 0) || 0
        }];

  const copyOrderSummary = () => {
    const productLines = productDetails
      .map((item, index) => {
        const sizeLabel = item.size ? `, Size: ${item.size}` : '';
        return `${index + 1}. ${item.name} x${item.quantity}${sizeLabel}, Price: ${item.price.toLocaleString()}`;
      })
      .join('\n');

    const summaryText = [
      `Customer Name: ${order.customer_name || 'N/A'}`,
      `Phone: ${order.phone || 'N/A'}`,
      `Address: ${order.address || 'N/A'}`,
      `Amount: ${Number(order.amount || 0).toLocaleString()}`,
      `Date: ${orderDateTime}`,
      'Product Details:',
      productLines
    ].join('\n');

    copyToClipboard(summaryText);
    setCopiedSummary(true);
    if (copyTimeoutRef.current) {
      window.clearTimeout(copyTimeoutRef.current);
    }
    copyTimeoutRef.current = window.setTimeout(() => {
      setCopiedSummary(false);
    }, 1800);
  };

  const saveOrderNote = async () => {
    if (!order?.id || !user?.id) return;
    const trimmedNote = String(noteDraft || '').trim();

    setIsSavingNote(true);
    try {
      const updatedOrder = await api.appendOrderNote(
        order.id,
        trimmedNote,
        user.id,
        profile?.name || user?.email || 'Unknown User',
        userRoles,
        'Order Note'
      );
      setSavedNotesOverride(updatedOrder?.notes || '');
      setNoteDraft(updatedOrder?.notes || '');
    } catch (error) {
      console.error('Failed to save order note:', error);
      alert(error.message || 'Failed to save note.');
    } finally {
      setIsSavingNote(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Order Details: #${effectiveOrder.id.replace('ORD-', '')}`}
    >
      <div className="order-details-elite">
        {/* Modern Tabs Bar */}
        <div className="elite-modal-tabs" style={{
          display: 'flex',
          gap: '8px',
          borderBottom: '1px solid var(--border-color)',
          marginBottom: '16px',
          paddingBottom: '8px'
        }}>
          <button
            type="button"
            className={`elite-tab-btn ${activeTab === 'details' ? 'active' : ''}`}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              border: 'none',
              background: activeTab === 'details' ? 'rgba(99,102,241,0.12)' : 'transparent',
              color: activeTab === 'details' ? '#6366f1' : 'var(--text-secondary)',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s ease'
            }}
            onClick={() => setActiveTab('details')}
          >
            <User size={15} /> Details
          </button>
          <button
            type="button"
            className={`elite-tab-btn ${activeTab === 'history' ? 'active' : ''}`}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              border: 'none',
              background: activeTab === 'history' ? 'rgba(99,102,241,0.12)' : 'transparent',
              color: activeTab === 'history' ? '#6366f1' : 'var(--text-secondary)',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s ease'
            }}
            onClick={() => setActiveTab('history')}
          >
            <History size={15} /> History / Audit Trail ({activityLogs.length})
          </button>
        </div>

        {/* Header Summary Card */}
        <div className="details-summary-grid">
          <div className="summary-main-card glass-card">
            <div className="card-header-flex">
              <div className="order-main-info">
                <span className="order-label">Order Reference</span>
                <div className="order-id-copy" onClick={() => copyToClipboard(order.id)}>
                  <h3>{order.id}</h3>
                  <Clipboard size={14} className="copy-icon" />
                </div>
              </div>
              <Badge variant={getStatusVariant(order.status)} className="status-badge-elite">
                {order.status}
              </Badge>
            </div>
            
            <div className="quick-meta-row">
              <div className="meta-item">
                <Calendar size={14} />
                <span>{new Date(order.created_at).toLocaleDateString()}</span>
              </div>
              <div className="meta-item">
                <Clock size={14} />
                <span>{new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <div className="meta-item">
                <Info size={14} />
                <span style={{
                  display: 'inline-flex', alignItems: 'center',
                  padding: '2px 8px', borderRadius: '999px', fontSize: '10.5px',
                  fontWeight: 700, letterSpacing: '0.03em', whiteSpace: 'nowrap',
                  border: '1px solid',
                  ...(
                    (() => {
                      const s = String(order.source || '').toLowerCase();
                      if (s.includes('facebook') || s === 'fb') return { background: 'rgba(24,119,242,0.1)', color: '#1877f2', borderColor: 'rgba(24,119,242,0.22)' };
                      if (s.includes('tiktok')) return { background: 'rgba(0,0,0,0.07)', color: '#1a1a1a', borderColor: 'rgba(0,0,0,0.14)' };
                      if (s.includes('instagram')) return { background: 'rgba(225,48,108,0.1)', color: '#e1306c', borderColor: 'rgba(225,48,108,0.22)' };
                      if (s.includes('web')) return { background: 'rgba(99,102,241,0.1)', color: '#6366f1', borderColor: 'rgba(99,102,241,0.22)' };
                      if (s.includes('direct')) return { background: 'rgba(16,185,129,0.1)', color: '#059669', borderColor: 'rgba(16,185,129,0.22)' };
                      return { background: 'rgba(100,116,139,0.08)', color: '#64748b', borderColor: 'rgba(100,116,139,0.18)' };
                    })()
                  )
                }}>
                  {order.source || 'Direct'}
                </span>
              </div>
              <div className="meta-item">
                <span>Payment:</span>
                <Badge variant={getPaymentVariant(order.payment_status)}>
                  {order.payment_status === 'Paid' ? 'Paid' : (order.payment_status || 'Pending')}
                </Badge>
              </div>
            </div>
          </div>

          <div className="amount-focus-card glass-card">
            <span className="order-label">Total Amount</span>
            <div className="amount-value">
              <CurrencyIcon size={20} className="currency-icon-elite" />
              {Number(effectiveOrder.amount || 0).toLocaleString()}
            </div>
            <div className="shipping-info">
              {shippingZoneLabel}
              {(() => {
                const dc = Number(effectiveOrder?.delivery_charge) ||
                  Number(effectiveOrder?.pricing_summary?.delivery_charge);
                return dc > 0 ? (
                  <span className="fee">
                    (<CurrencyIcon size={12} className="currency-icon-elite" />{dc.toLocaleString()})
                  </span>
                ) : null;
              })()}
            </div>
          </div>
        </div>

        {/* Content Sections */}
        <div className="details-content-sections">
          {activeTab === 'details' && (
            <>
              <div className="section-row">
            {/* Customer Info */}
            <div className="details-section-card glass-card half">
              <div className="section-title">
                <div className="section-title-main">
                  <User size={18} className="text-accent" />
                  <span>Customer Information</span>
                </div>
                <button
                  type="button"
                  className={`section-copy-btn ${copiedSummary ? 'copied' : ''}`}
                  onClick={copyOrderSummary}
                  title="Copy customer and order summary"
                >
                  <Copy size={14} />
                  <span>{copiedSummary ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
              <div className="info-list">
                <div className="info-item">
                  <span className="info-label">Name</span>
                  <span className="info-value">{effectiveOrder.customer_name}</span>
                </div>

                {/* ── Editable: Phone ── */}
                <EditableField field="phone" label="Phone" icon={Phone} type="tel" />

                <div className="info-item">
                  <span className="info-label">IP Address</span>
                  <span className={`info-value ip-address-value ${ipAddress ? '' : 'muted'}`}>
                    {ipAddress || 'Not captured'}
                  </span>
                </div>

                {/* ── Editable: Address ── */}
                <EditableField field="address" label="Delivery Address" icon={MapPin} multiline />

                {/* ── Editable: Delivery Charge ── */}
                <EditableField field="delivery_charge" label="Delivery Charge" icon={Truck} type="number" />

                <div className="info-item vertical">
                  <span className="info-label">Order Note</span>
                  <div className="order-note-editor">
                    <textarea
                      className="order-note-textarea"
                      value={noteDraft}
                      onChange={(e) => setNoteDraft(e.target.value)}
                      placeholder="Add or update a single important call note for this order"
                      rows={4}
                    />
                    
                    {/* Quick Templates UI */}
                    <div className="quick-templates-container" style={{ marginTop: '8px', marginBottom: '8px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                        QUICK TEMPLATES (Click to add)
                      </span>
                      <div className="quick-templates-list" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {[
                          "Customer busy — call after 30 mins",
                          "Wrong address — needs correction",
                          "Confirmed. Delivery before 7 PM"
                        ].map((tpl, idx) => (
                          <button
                            key={idx}
                            type="button"
                            className="tpl-badge"
                            style={{
                              padding: '4px 8px',
                              borderRadius: '4px',
                              border: '1px solid var(--border-color)',
                              background: 'var(--bg-card-secondary)',
                              color: 'var(--text-primary)',
                              fontSize: '11px',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              transition: 'all 0.15s ease'
                            }}
                            onClick={() => applyTemplate(tpl)}
                          >
                            {tpl}
                          </button>
                        ))}
                        
                        {/* Custom Saved Templates */}
                        {customTemplates.map((tpl, idx) => (
                          <button
                            key={`custom-${idx}`}
                            type="button"
                            className="tpl-badge custom-tpl"
                            style={{
                              padding: '4px 8px',
                              borderRadius: '4px',
                              border: '1px solid rgba(99,102,241,0.3)',
                              background: 'rgba(99,102,241,0.06)',
                              color: '#6366f1',
                              fontSize: '11px',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              transition: 'all 0.15s ease'
                            }}
                            onClick={() => applyTemplate(tpl)}
                          >
                            <span>{tpl}</span>
                            <span 
                              style={{ 
                                color: '#ef4444', 
                                marginLeft: '2px', 
                                fontWeight: 'bold', 
                                fontSize: '10px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: '12px',
                                height: '12px',
                                borderRadius: '50%'
                              }}
                              onClick={(e) => deleteCustomTemplate(idx, e)}
                              title="Delete template"
                            >
                              ×
                            </span>
                          </button>
                        ))}
                      </div>
                      
                      {/* Save current draft as template */}
                      {noteDraft.trim() && (
                        <div style={{ marginTop: '6px', textAlign: 'right' }}>
                          <button
                            type="button"
                            style={{
                              fontSize: '10.5px',
                              color: '#6366f1',
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              fontWeight: 600,
                              textDecoration: 'underline'
                            }}
                            onClick={() => {
                              const trimmed = noteDraft.trim();
                              // Avoid duplicate
                              if (trimmed && !customTemplates.includes(trimmed) && trimmed.length < 100) {
                                const updated = [...customTemplates, trimmed];
                                setCustomTemplates(updated);
                                localStorage.setItem('orderflow_custom_notes_templates', JSON.stringify(updated));
                              }
                            }}
                            title="Save current note text as template"
                          >
                            + Save current note as template
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="order-note-actions">
                      <Button variant="secondary" size="sm" onClick={() => setNoteDraft(String(visibleNotes || ''))} disabled={isSavingNote}>Reset</Button>
                      <Button variant="primary" size="sm" onClick={saveOrderNote} disabled={isSavingNote || noteDraft === String(visibleNotes || '')}>
                        {isSavingNote ? 'Saving...' : 'Save Note'}
                      </Button>
                    </div>
                  </div>
                </div>
                {visibleNotes && (
                  <div className="order-notes-box prominent">
                    <span className="notes-label">Current Note:</span>
                    <p>{visibleNotes}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Product Info */}
            <div className="details-section-card glass-card half">
              <div className="section-title">
                <Package size={18} className="text-accent" />
                <span>Ordered Products</span>
              </div>
              <div className="product-scroll-list">
                {Array.isArray(order.ordered_items) && order.ordered_items.length > 0 ? (
                  order.ordered_items.map((item, idx) => (
                    <div key={idx} className="order-product-card glass-card">
                      <div className="product-qty-badge">{item.quantity}x</div>
                      <div className="product-main-info">
                        <div className="product-name-row">
                          <span className="name">{item.name}</span>
                          {item.toyBoxNumber && <span className="box-tag">Box #{item.toyBoxNumber}</span>}
                        </div>
                        {item.size && <div className="product-meta-detail">Size: <span className="highlight">{item.size}</span></div>}
                      </div>
                      <div className="product-price-column">
                        <div className="unit-price">@<CurrencyIcon size={10} className="currency-icon-elite" />{Number(item.price || 0).toLocaleString()}</div>
                        <div className="total-price"><CurrencyIcon size={12} className="currency-icon-elite" />{Number((item.price || 0) * (item.quantity || 1)).toLocaleString()}</div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="order-product-card glass-card">
                    <div className="product-qty-badge">{order.quantity || 1}x</div>
                    <div className="product-main-info">
                      <div className="product-name-row">
                        <span className="name">{order.product_name}</span>
                      </div>
                      {order.size && <div className="product-meta-detail">Size: <span className="highlight">{order.size}</span></div>}
                    </div>
                    <div className="product-price-column">
                      <div className="total-price">
                        <CurrencyIcon size={12} className="currency-icon-elite" />
                        {Number(order.amount || 0).toLocaleString()}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="details-section-card glass-card full-width">
            <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="section-title-main">
                <Truck size={18} className="text-accent" />
                <span>Courier Ratio Intelligence</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {courierRatioData?.fetchedAt && (
                  <span className="courier-ratio-updated" style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                    Synced {new Date(courierRatioData.fetchedAt).toLocaleString('en-GB', {
                      day: '2-digit',
                      month: 'short',
                      hour: 'numeric',
                      minute: '2-digit',
                      hour12: true
                    })}
                  </span>
                )}
                {order.phone && (
                  <button
                    type="button"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '4px 8px',
                      borderRadius: '6px',
                      border: '1px solid var(--border-color)',
                      background: 'var(--bg-card-secondary)',
                      color: 'var(--text-primary)',
                      fontSize: '11px',
                      fontWeight: 500,
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      checkPhone(order.phone, true);
                    }}
                    disabled={courierRatioData?.loading}
                  >
                    {courierRatioData?.loading ? (
                      <>
                        <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
                        <span>Syncing...</span>
                      </>
                    ) : (
                      <>
                        <RotateCcw size={12} />
                        <span>Sync Now</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>

            {!order.phone ? (
              <div className="courier-ratio-empty">No customer phone found for courier ratio lookup.</div>
            ) : courierRatioData?.loading ? (
              <div className="courier-ratio-empty">Checking courier ratio for this number...</div>
            ) : courierRatioData?.error ? (
              <div className="courier-ratio-empty text-red-500" style={{ color: 'var(--danger-color)', display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center', padding: '16px 8px' }}>
                <AlertCircle size={20} />
                <span style={{ fontSize: '0.85rem', textAlign: 'center', lineHeight: '1.4' }}>
                  {courierRatioData.raw?.error || courierRatioData.raw?.message || 'Courier ratio data is not available right now.'}
                </span>
              </div>
            ) : courierRatioData?.fetched ? (
              <div className="courier-ratio-stack">
                <div className="courier-ratio-metrics">
                  <div className="courier-ratio-metric">
                    <span className="courier-ratio-label">Success Ratio</span>
                    <strong>{Number(courierRatioData.ratio || 0).toFixed(0)}%</strong>
                  </div>
                  <div className="courier-ratio-metric">
                    <span className="courier-ratio-label">Total Parcels</span>
                    <strong>{Number(courierRatioData.total || 0)}</strong>
                  </div>
                  <div className="courier-ratio-metric">
                    <span className="courier-ratio-label">Successful</span>
                    <strong>{Number(courierRatioData.success_count || 0)}</strong>
                  </div>
                  <div className="courier-ratio-metric">
                    <span className="courier-ratio-label">Cancelled</span>
                    <strong>{Number(courierRatioData.cancelled || 0)}</strong>
                  </div>
                  <div className="courier-ratio-metric">
                    <span className="courier-ratio-label">Risk Level</span>
                    <strong className={`courier-risk-tag ${courierRatioData.riskLevel || 'new'}`}>
                      {String(courierRatioData.riskLevel || 'new').replace(/_/g, ' ')}
                    </strong>
                  </div>
                </div>

                {courierBreakdownRows.length > 0 && (
                  <div className="courier-breakdown-table-wrap">
                    <div className="courier-breakdown-table-head">
                      <span>Logo</span>
                      <span>Courier</span>
                      <span>Total</span>
                      <span>Success</span>
                      <span>Cancelled</span>
                      <span>Success Ratio</span>
                    </div>

                    <div className="courier-breakdown-table-body">
                      {courierBreakdownRows.map((row) => (
                        <div key={row.key} className="courier-breakdown-row">
                          <div className="courier-logo-cell">
                            {row.logo ? (
                              <img
                                src={row.logo}
                                alt={`${row.name} logo`}
                                className="courier-logo-image"
                                loading="lazy"
                                onError={(event) => {
                                  event.currentTarget.style.display = 'none';
                                  const fallback = event.currentTarget.parentElement?.querySelector('.courier-logo-fallback');
                                  if (fallback) fallback.removeAttribute('hidden');
                                }}
                              />
                            ) : null}
                            <span
                              className="courier-logo-fallback"
                              hidden={Boolean(row.logo)}
                            >
                              {String(row.name || '?').slice(0, 2).toUpperCase()}
                            </span>
                          </div>

                          <div className="courier-name-cell">{row.name}</div>
                          <div className="courier-stat-cell">{row.total}</div>
                          <div className="courier-stat-cell success">{row.success}</div>
                          <div className="courier-stat-cell cancelled">{row.cancelled}</div>

                          <div className="courier-ratio-cell">
                            <span>{row.ratio.toFixed(1)}%</span>
                            <div className="courier-ratio-bar">
                              <div
                                className="courier-ratio-bar-fill"
                                style={{ width: `${row.ratio}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="courier-ratio-empty">Courier ratio check has not completed yet.</div>
            )}
          </div>

          {/* Delivery & Logistics */}
          {order.tracking_id && (
            <div className="details-section-card glass-card full-width">
              <div className="section-title">
                <Truck size={18} className="text-accent" />
                <span>Logistics & Courier Details</span>
              </div>
              <div className="logistics-grid">
                <div className="log-item">
                  <span className="info-label">Courier Service</span>
                  <span className="info-value">Steadfast Logistics</span>
                </div>
                <div className="log-item">
                  <span className="info-label">Steadfast ID</span>
                  <div className="tracking-badge-group">
                    <div className="tracking-id-copy" onClick={() => copyToClipboard(order.courier_assigned_id)}>
                      <code>{order.courier_assigned_id || 'Sync Required'}</code>
                      <Clipboard size={12} className="copy-icon" />
                    </div>
                  </div>
                </div>
                <div className="log-item">
                  <span className="info-label">Tracking Number</span>
                  <div className="tracking-badge-group">
                    <div className="tracking-id-copy" onClick={() => copyToClipboard(order.tracking_id)}>
                      <code>{order.tracking_id || 'N/A'}</code>
                      <Clipboard size={12} className="copy-icon" />
                    </div>
                    {order.tracking_id && (
                      <a 
                        href={`https://portal.steadfast.com.bd/tracking/${order.tracking_id}`} 
                        target="_blank" 
                        rel="noreferrer"
                        className="tracking-external-link"
                      >
                        <ExternalLink size={14} /> <span>Portal</span>
                        </a>
                    )}
                  </div>
                </div>
                <div className="log-item">
                  <span className="info-label">Current Status</span>
                  <Badge variant={getStatusVariant(order.courier_status)}>{order.courier_status || 'Checking...'}</Badge>
                </div>
              </div>
            </div>
          )}
        </>
      )}

          {/* Timeline & Audit Trail */}
          {activeTab === 'history' && (
            <div className="details-section-card glass-card full-width">
              <div className="section-title">
                <History size={18} className="text-accent" />
                <span>Activity Timeline & Audit Trail</span>
              </div>
              {isLoadingLogs ? (
                <div className="timeline-loading">Syncing history...</div>
              ) : activityLogs.length === 0 ? (
                <div className="timeline-empty">No activity records found for this order.</div>
              ) : (
                <div className="elite-timeline">
                  {activityLogs.filter(log => String(log.action_description || '').trim()).map((log, i) => (
                    <div key={log.id || i} className="timeline-entry">
                      <div className="entry-point" />
                      <div className="entry-content">
                        <div className="entry-header">
                          <span className="entry-time">
                            {new Date(log.timestamp).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                          </span>
                          <div className="entry-user">
                            <div className="mini-avatar">{(log.changed_by_user_name || 'S').charAt(0)}</div>
                            <span>{log.changed_by_user_name || 'System'}</span>
                          </div>
                        </div>
                        <div className="entry-desc">{log.action_description}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="details-footer-actions">
           <Button variant="secondary" onClick={onClose} icon={<X size={18} />}>Close Window</Button>
           {onEdit && (
             <Button variant="primary" onClick={() => { onClose(); onEdit(effectiveOrder); }} icon={<Edit2 size={18} />}>
               Edit Full Order
             </Button>
           )}
        </div>
      </div>
    </Modal>
  );
};
