import React, { useState, useEffect, useRef } from 'react';
import { Modal } from './Modal';
import { Badge } from './Badge';
import { Button } from './Button';
import { useAuth } from '../context/AuthContext';
import { 
  User, Phone, MapPin, Package, Calendar, Clock, 
  History, Edit2, X, Clipboard, Copy, ExternalLink, 
  Truck, CheckCircle2, AlertCircle, Info 
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
  const copyTimeoutRef = useRef(null);
  const { user, profile, userRoles } = useAuth();
  const { checkPhone, getRatio } = useCourierRatio();

  useEffect(() => {
    if (isOpen && order?.id) {
      // --- Track Recently Viewed for Premium Search ---
      const savedViewed = JSON.parse(localStorage.getItem('premium_search_viewed') || '[]');
      const newItem = { 
        id: order.id, 
        label: order.customer_name || 'Unnamed Order', 
        sub: `#${order.id.replace('ORD-', '')}`,
        type: 'order'
      };
      
      const newViewed = [newItem, ...savedViewed.filter(item => item.id !== order.id)].slice(0, 10);
      localStorage.setItem('premium_search_viewed', JSON.stringify(newViewed));
      // ------------------------------------------------

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
  }, [isOpen, order?.id]);

  useEffect(() => {
    setNoteDraft(String(order?.notes || ''));
    setSavedNotesOverride(null);
  }, [order?.id, order?.notes, isOpen]);

  useEffect(() => {
    if (isOpen && order?.phone) {
      checkPhone(order.phone);
    }
  }, [isOpen, order?.phone, checkPhone]);

  useEffect(() => () => {
    if (copyTimeoutRef.current) {
      window.clearTimeout(copyTimeoutRef.current);
    }
  }, []);

  if (!order) return null;

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
      title={`Order Details: #${order.id.replace('ORD-', '')}`}
    >
      <div className="order-details-elite">
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
                <span>Source: {order.source || 'Direct'}</span>
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
              {Number(order.amount || 0).toLocaleString()}
            </div>
            <div className="shipping-info">
              {shippingZoneLabel}
              {deliveryCharge !== null && (
                <span className="fee">
                  (<CurrencyIcon size={12} className="currency-icon-elite" />
                  {deliveryCharge.toLocaleString()})
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Content Sections */}
        <div className="details-content-sections">
          
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
                  <span className="info-value">{order.customer_name}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Phone</span>
                  <div className="info-value-flex">
                    <span className="info-value">{order.phone}</span>
                    <a href={`tel:${order.phone}`} className="action-circle-btn">
                      <Phone size={14} />
                    </a>
                  </div>
                </div>
                <div className="info-item">
                  <span className="info-label">IP Address</span>
                  <span className={`info-value ip-address-value ${ipAddress ? '' : 'muted'}`}>
                    {ipAddress || 'Not captured'}
                  </span>
                </div>
                <div className="info-item vertical">
                  <span className="info-label">Delivery Address</span>
                  <div className="address-box">
                    <MapPin size={14} className="text-tertiary" />
                    <span>{order.address}</span>
                  </div>
                </div>
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
                    <div className="order-note-actions">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setNoteDraft(String(visibleNotes || ''))}
                        disabled={isSavingNote}
                      >
                        Reset
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={saveOrderNote}
                        disabled={isSavingNote || noteDraft === String(visibleNotes || '')}
                      >
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
            <div className="section-title">
              <div className="section-title-main">
                <Truck size={18} className="text-accent" />
                <span>Courier Ratio Intelligence</span>
              </div>
              {courierRatioData?.fetchedAt && (
                <span className="courier-ratio-updated">
                  Synced {new Date(courierRatioData.fetchedAt).toLocaleString('en-GB', {
                    day: '2-digit',
                    month: 'short',
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                  })}
                </span>
              )}
            </div>

            {!order.phone ? (
              <div className="courier-ratio-empty">No customer phone found for courier ratio lookup.</div>
            ) : courierRatioData?.loading ? (
              <div className="courier-ratio-empty">Checking courier ratio for this number...</div>
            ) : courierRatioData?.error ? (
              <div className="courier-ratio-empty">Courier ratio data is not available right now.</div>
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

          {/* Timeline */}
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
                {activityLogs.map((log, i) => (
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
        </div>

        {/* Footer Actions */}
        <div className="details-footer-actions">
           <Button variant="secondary" onClick={onClose} icon={<X size={18} />}>Close Window</Button>
           {onEdit && (
             <Button variant="primary" onClick={() => { onClose(); onEdit(order); }} icon={<Edit2 size={18} />}>
               Edit Order Data
             </Button>
           )}
        </div>
      </div>
    </Modal>
  );
};
