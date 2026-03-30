import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { Badge } from './Badge';
import { Button } from './Button';
import { 
  User, Phone, MapPin, Package, Calendar, Clock, 
  History, Edit2, X, Clipboard, ExternalLink, 
  Truck, CheckCircle2, AlertCircle, Info 
} from 'lucide-react';
import CurrencyIcon from './CurrencyIcon';
import api from '../lib/api';
import './OrderDetailsModal.css';

export const OrderDetailsModal = ({ isOpen, onClose, order, onEdit }) => {
  const [activityLogs, setActivityLogs] = useState([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  useEffect(() => {
    if (isOpen && order?.id) {
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

  if (!order) return null;

  const getStatusVariant = (status) => {
    const s = String(status || '').toLowerCase();
    if (['confirmed', 'completed', 'delivered'].includes(s)) return 'success';
    if (['cancelled', 'returned', 'failed'].includes(s)) return 'danger';
    if (['pending', 'new', 'hold', 'pending call'].includes(s)) return 'warning';
    return 'neutral';
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    // User gets a silent copy or you could add a toast here
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
            </div>
          </div>

          <div className="amount-focus-card glass-card">
            <span className="order-label">Total Amount</span>
            <div className="amount-value">
              <CurrencyIcon size={20} className="currency-icon-elite" />
              {Number(order.amount || 0).toLocaleString()}
            </div>
            <div className="shipping-info">
              {order.shipping_zone} 
              <span className="fee">
                (<CurrencyIcon size={12} className="currency-icon-elite" />
                {order.shipping_zone === 'Inside Dhaka' ? '80' : '150'})
              </span>
            </div>
          </div>
        </div>

        {/* Content Sections */}
        <div className="details-content-sections">
          
          <div className="section-row">
            {/* Customer Info */}
            <div className="details-section-card glass-card half">
              <div className="section-title">
                <User size={18} className="text-accent" />
                <span>Customer Information</span>
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
                <div className="info-item vertical">
                  <span className="info-label">Delivery Address</span>
                  <div className="address-box">
                    <MapPin size={14} className="text-tertiary" />
                    <span>{order.address}</span>
                  </div>
                </div>
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
              {order.notes && (
                <div className="order-notes-box">
                  <span className="notes-label">Internal Notes:</span>
                  <p>{order.notes}</p>
                </div>
              )}
            </div>
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
