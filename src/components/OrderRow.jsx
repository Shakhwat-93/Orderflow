import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import ReactDOM from 'react-dom';
import { FileText, Clock, AlertTriangle, Phone, Copy, MessageCircle, Edit2, Globe, Facebook, Play, Users } from 'lucide-react';
import CurrencyIcon from './CurrencyIcon';
import './OrderRow.css';

/** Returns a styled source badge element based on order source */
const SourceBadge = ({ source }) => {
  if (!source) return null;
  const s = String(source).toLowerCase();
  let label = source;
  let cls = 'source-badge-default';
  if (s.includes('facebook') || s === 'fb') { cls = 'source-badge-fb'; label = 'Facebook'; }
  else if (s.includes('tiktok')) { cls = 'source-badge-tiktok'; label = 'TikTok'; }
  else if (s.includes('instagram') || s === 'ig') { cls = 'source-badge-ig'; label = 'Instagram'; }
  else if (s.includes('website') || s.includes('web') || s.includes('new web')) { cls = 'source-badge-web'; label = 'Website'; }
  else if (s.includes('direct')) { cls = 'source-badge-direct'; label = 'Direct'; }
  else if (s.includes('youtube')) { cls = 'source-badge-yt'; label = 'YouTube'; }
  return <span className={`source-badge ${cls}`}>{label}</span>;
};

export const OrderRow = ({ order, onDetails, onStatusChange, onEdit, isSelected, onSelect, fraudFlag, automationFlag, isUnread = false, duplicateWarning = null }) => {
  const [copied, setCopied] = useState(false);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const statusBtnRef = useRef(null);

  const toggleStatusMenu = () => {
    if (!showStatusMenu && statusBtnRef.current) {
      const rect = statusBtnRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const menuHeight = 280;
      if (spaceBelow > menuHeight) {
        setMenuPos({ top: rect.bottom + 4, left: rect.left });
      } else {
        setMenuPos({ top: rect.top - menuHeight, left: rect.left });
      }
    }
    setShowStatusMenu(!showStatusMenu);
  };

  const handleCopy = (e, text) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const stopRowClick = (e) => e.stopPropagation();

  const getStatusBadgeVariant = (status) => {
    switch (status) {
      case 'New': return 'new';
      case 'Pending Call': return 'pending-call';
      case 'Final Call Pending': return 'final-call-pending';
      case 'Confirmed': return 'confirmed';
      case 'Bulk Exported': return 'bulk-exported';
      case 'Fake Order': return 'fake-order';
      case 'Cancelled': return 'cancelled';
      case 'Courier Submitted': return 'courier';
      case 'Factory Processing': return 'factory';
      case 'Completed': return 'completed';
      default: return 'default';
    }
  };

  const ORDER_STATUSES = [
    'New', 'Pending Call', 'Final Call Pending', 'Confirmed', 'Bulk Exported', 'Courier Submitted',
    'Factory Processing', 'Completed', 'Fake Order', 'Cancelled'
  ];

  const orderTimestamp = order.created_at
    ? new Date(order.created_at).toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      })
    : 'N/A';

  const productName = String(order.product_name || 'Unknown Product').trim() || 'Unknown Product';
  const rawPhone = String(order.phone || '').trim();
  const normalizedPhone = rawPhone.replace(/\D/g, '');
  const whatsappPhone = normalizedPhone.startsWith('880')
    ? normalizedPhone
    : normalizedPhone.startsWith('0')
      ? `88${normalizedPhone}`
      : normalizedPhone;
  const whatsappLink = whatsappPhone ? `https://wa.me/${whatsappPhone}` : null;

  return (
    <motion.tr 
      className={`order-row clickable-row ${isSelected ? 'row-selected' : ''} ${isUnread ? 'route-unread-row' : 'route-read-row'}`}
      onClick={() => onDetails(order)}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      <td className="checkbox-cell" onClick={(e) => e.stopPropagation()}>
        <input 
          type="checkbox" 
          className="premium-checkbox" 
          checked={isSelected}
          onChange={() => onSelect(order.id)}
        />
      </td>

      <td className="id-cell">
        <div className="route-read-id-wrap">
          {isUnread && <span className="route-unread-dot" aria-label="Unread order" />}
          <span className="saas-id">#{String(order.id).replace('ORD-', '')}</span>
          {isUnread && <span className="route-unread-chip">New</span>}
        </div>
        {duplicateWarning && (
          <div className="duplicate-order-warning" title={duplicateWarning.title}>
            <AlertTriangle size={12} />
            <span>Duplicate: {duplicateWarning.label}</span>
          </div>
        )}
      </td>

      <td className="date-cell">
        <span className="saas-text timestamp-text">{orderTimestamp}</span>
      </td>

      <td className="customer-cell">
        <div className="customer-cell-stack">
          <span className="saas-text-dark">{order.customer_name}</span>
          <div className="customer-quick-row">
            <span className="customer-phone-text">{rawPhone || 'No phone'}</span>
            <div className="customer-quick-actions" onClick={stopRowClick}>
              <button
                type="button"
                className={`customer-quick-btn ${copied ? 'copied' : ''}`}
                title={copied ? 'Copied' : 'Copy phone'}
                onClick={(e) => handleCopy(e, rawPhone)}
                disabled={!rawPhone}
              >
                <Copy size={12} />
              </button>
              <a
                href={rawPhone ? `tel:${rawPhone}` : undefined}
                className="customer-quick-btn"
                title="Call customer"
                onClick={stopRowClick}
                aria-disabled={!rawPhone}
              >
                <Phone size={12} />
              </a>
              <a
                href={whatsappLink || undefined}
                target="_blank"
                rel="noreferrer"
                className="customer-quick-btn whatsapp"
                title="Open WhatsApp"
                onClick={stopRowClick}
                aria-disabled={!whatsappLink}
              >
                <MessageCircle size={12} />
              </a>
            </div>
          </div>
        </div>
      </td>

      <td className="product-cell">
        <span className="saas-text-dark product-name-cell" title={productName}>{productName}</span>
        <SourceBadge source={order.source} />
      </td>

      <td className="amount-cell">
        <span className="saas-text-dark">
          <CurrencyIcon size={12} className="currency-icon-elite" style={{marginRight: '2px'}}/>
          {Number(order.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      </td>

      <td className="shipping-cell">
        <span className="saas-text">{order.shipping_zone || 'N/A'}</span>
      </td>

      <td className="items-cell">
        <span className="saas-text">{order.items || 1} items</span>
      </td>

      <td className="status-cell" onClick={(e) => e.stopPropagation()}>
        <div className="status-dropdown-container" ref={statusBtnRef}>
          <button 
            className={`saas-badge ${getStatusBadgeVariant(order.status) === 'confirmed' || getStatusBadgeVariant(order.status) === 'completed' ? 'saas-badge-success' : getStatusBadgeVariant(order.status) === 'cancelled' || getStatusBadgeVariant(order.status) === 'fake-order' ? 'saas-badge-danger' : 'saas-badge-warning'} clickable`}
            onClick={toggleStatusMenu}
          >
            <span className="dot"></span>
            {order.status}
          </button>
          
          {showStatusMenu && ReactDOM.createPortal(
            <>
              <div className="status-dropdown-backdrop" onClick={() => setShowStatusMenu(false)} />
              <div 
                className="status-menu-dropdown liquid-glass animate-in fade-in zoom-in duration-200"
                style={{ 
                  position: 'fixed', 
                  top: menuPos.top, 
                  left: menuPos.left, 
                  zIndex: 99999,
                  transformOrigin: 'top left'
                }}
              >
                {ORDER_STATUSES.map(status => (
                  <button 
                    key={status}
                    className={`status-menu-item ${order.status === status ? 'active' : ''}`}
                    onClick={() => {
                      onStatusChange(order.id, status);
                      setShowStatusMenu(false);
                    }}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </>,
            document.body
          )}
        </div>
      </td>

      <td className="actions-cell">
        <div className="saas-actions">
          <button className="saas-icon-btn" title="View Document" onClick={(e) => { e.stopPropagation(); onDetails(order); }}>
            <FileText size={16} strokeWidth={1.5} />
          </button>
          <button className="saas-icon-btn" title="Edit Order" onClick={(e) => { e.stopPropagation(); onEdit && onEdit(order); }}>
            <Edit2 size={16} strokeWidth={1.5} />
          </button>
        </div>
      </td>
    </motion.tr>
  );
};
