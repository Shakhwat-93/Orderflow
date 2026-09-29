'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import ReactDOM from 'react-dom';
import { 
  AlertTriangle, 
  Phone, 
  Copy, 
  MessageCircle, 
  Edit2, 
  Eye, 
  MoreHorizontal,
  Package
} from 'lucide-react';
import { ResponseTimer } from './ResponseTimer';
import { getFormattedProductName } from '../utils/productCatalog';
import { isIncompleteConversion, getDisplayStatusLabel } from '../utils/orderStatusHelper';

const SourceBadge: React.FC<{ traffic_source?: string | null; source?: string | null }> = ({ traffic_source, source }) => {
  const raw = traffic_source || source;
  if (!raw) return null;
  const s = String(raw).toLowerCase();

  let label = raw;
  let cls   = 'source-badge-default';

  if (s.includes('messenger') || s === 'msg') {
    cls   = 'source-badge-messenger';
    label = 'Messenger';
  } else if (s.includes('facebook') || s === 'fb' || s.includes('l.facebook.com') || s.includes('m.facebook.com')) {
    cls   = 'source-badge-fb';
    label = 'Facebook';
  } else if (s.includes('tiktok') || s.includes('ttclid')) {
    cls   = 'source-badge-tiktok';
    label = 'TikTok';
  } else if (s.includes('instagram') || s === 'ig' || s.includes('l.instagram.com')) {
    cls   = 'source-badge-ig';
    label = 'Instagram';
  } else if (s.includes('youtube') || s === 'yt') {
    cls   = 'source-badge-yt';
    label = 'YouTube';
  } else if (s.includes('google') || s === 'cpc') {
    cls   = 'source-badge-google';
    label = 'Google';
  } else if (s.includes('website') || s.includes('web') || s.includes('new web') || s.includes('stb-landing') || s.includes('-landing')) {
    cls   = 'source-badge-web';
    label = 'Website';
  } else if (s.includes('direct')) {
    cls   = 'source-badge-direct';
    label = 'Direct';
  } else if (s.includes('whatsapp')) {
    cls   = 'source-badge-wa';
    label = 'WhatsApp';
  }

  return <span className={`source-badge ${cls}`}>{label}</span>;
};

export interface OrderRowProps {
  order: any;
  onDetails: (order: any) => void;
  onStatusChange: (orderId: string | number, status: string) => void;
  onEdit?: (order: any) => void;
  isSelected?: boolean;
  onSelect?: (orderId: string | number) => void;
  fraudFlag?: any;
  automationFlag?: any;
  isUnread?: boolean;
  duplicateWarning?: any;
}

const ORDER_STATUSES = [
  'New', 
  'Pending Call', 
  'Final Call Pending', 
  'Confirmed', 
  'Bulk Exported', 
  'Courier Submitted',
  'Factory Processing', 
  'Completed', 
  'Fake Order', 
  'Cancelled', 
  'Incomplete', 
  'Test'
];

const getStatusBadgeVariant = (status: string) => {
  switch (status) {
    case 'New': return 'new';
    case 'Pending Call': return 'pending-call';
    case 'Final Call Pending': return 'final-call-pending';
    case 'Confirmed': return 'confirmed';
    case 'Bulk Exported': return 'bulk-exported';
    case 'Fake Order': return 'fake-order';
    case 'Cancelled': return 'cancelled';
    case 'Incomplete': return 'incomplete';
    case 'Courier Submitted': return 'courier';
    case 'Factory Processing': return 'factory';
    case 'Completed': return 'completed';
    case 'Test': return 'test';
    default: return 'default';
  }
};

const getProductColor = (name = '') => {
  const palette = ['#6366f1', '#059669', '#1d4ed8', '#f97316', '#7c3aed', '#0891b2', '#e11d48'];
  let sum = 0;
  for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i);
  return palette[sum % palette.length];
};

const OrderRowComponent: React.FC<OrderRowProps> = ({ 
  order, 
  onDetails, 
  onStatusChange, 
  onEdit, 
  isSelected = false, 
  onSelect, 
  isUnread = false, 
  duplicateWarning = null 
}) => {
  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [statusMenuPos, setStatusMenuPos] = useState({ top: 0, left: 0 });
  const statusBtnRef = useRef<HTMLDivElement>(null);

  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [moreMenuPos, setMoreMenuPos] = useState({ top: 0, left: 0 });
  const moreBtnRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const stopRowClick = (e: React.MouseEvent) => e.stopPropagation();

  const handleCopy = (e: React.MouseEvent, text: string) => {
    e.stopPropagation();
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleStatusMenu = () => {
    if (!showStatusMenu && statusBtnRef.current) {
      const rect = statusBtnRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const menuHeight = 280;
      if (spaceBelow > menuHeight) {
        setStatusMenuPos({ top: rect.bottom + 4, left: Math.max(10, rect.left) });
      } else {
        setStatusMenuPos({ top: Math.max(10, rect.top - menuHeight), left: Math.max(10, rect.left) });
      }
    }
    setShowStatusMenu(!showStatusMenu);
  };

  const toggleMoreMenu = () => {
    if (!showMoreMenu && moreBtnRef.current) {
      const rect = moreBtnRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const menuHeight = 170;
      const menuWidth = 150;
      const left = Math.max(10, rect.right - menuWidth);
      if (spaceBelow > menuHeight) {
        setMoreMenuPos({ top: rect.bottom + 4, left });
      } else {
        setMoreMenuPos({ top: Math.max(10, rect.top - menuHeight), left });
      }
    }
    setShowMoreMenu(!showMoreMenu);
  };

  // Format Order ID for clean Dribbble/SaaS presentation
  const formattedOrderId = useMemo(() => {
    const raw = String(order?.id || '');
    if (!raw) return '—';
    if (raw.startsWith('#')) return raw;
    const cleanNumber = raw.replace(/^(ORD|STB|MGB)-/i, '');
    return `#OF-${cleanNumber}`;
  }, [order?.id]);

  // Determine Customer Type
  const isRepeat = Boolean(
    order?.is_repeat_customer || 
    duplicateWarning || 
    (order?.customer_orders_count && Number(order.customer_orders_count) > 1)
  );

  // Phone formatting
  const rawPhone = String(order?.phone || '').trim();
  const formattedPhone = useMemo(() => {
    if (!rawPhone) return '—';
    const digits = rawPhone.replace(/\D/g, '');
    if (digits.length === 11 && digits.startsWith('01')) {
      return `${digits.slice(0, 5)} ${digits.slice(5)}`;
    }
    if (digits.length === 13 && digits.startsWith('8801')) {
      return `+880 ${digits.slice(3, 7)} ${digits.slice(7)}`;
    }
    return rawPhone;
  }, [rawPhone]);
  const normalizedPhone = rawPhone.replace(/\D/g, '');
  const whatsappPhone = normalizedPhone.startsWith('880')
    ? normalizedPhone
    : normalizedPhone.startsWith('0')
      ? `88${normalizedPhone}`
      : normalizedPhone;
  const whatsappLink = whatsappPhone ? `https://wa.me/${whatsappPhone}` : null;

  // Display status label matching SaaS reference ("Final Call", "Canceled")
  const displayStatus = useMemo(() => {
    const rawLabel = getDisplayStatusLabel(order);
    if (rawLabel === 'Final Call Pending') return 'Final Call';
    if (rawLabel === 'Cancelled') return 'Canceled';
    return rawLabel;
  }, [order]);

  // Product formatting
  const productName = getFormattedProductName(order);
  const productColor = getProductColor(productName);
  const productImageUrl = order?.product_image || order?.image_url || order?.image || order?.order_lines_payload?.[0]?.product_image || null;

  // Date/Time formatting (e.g. "21 Sept", "2:05 pm")
  const { dateStr, timeStr } = useMemo(() => {
    if (!order?.created_at) return { dateStr: '—', timeStr: '' };
    try {
      const d = new Date(order.created_at);
      if (isNaN(d.getTime())) return { dateStr: '—', timeStr: '' };
      const day = d.getDate();
      const month = d.toLocaleDateString('en-US', { month: 'short' });
      const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
      return { dateStr: `${day} ${month}`, timeStr: time };
    } catch {
      return { dateStr: '—', timeStr: '' };
    }
  }, [order?.created_at]);

  // Payment method
  const paymentMethod = String(order?.payment_method || 'COD').toUpperCase() === 'PREPAID' ? 'Prepaid' : 'COD';

  return (
    <motion.tr 
      className={`order-row ${isSelected ? 'row-selected' : ''} ${isUnread ? 'route-unread-row' : ''}`}
      onClick={() => onDetails(order)}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
    >
      {/* 1. Checkbox (~3.5%) */}
      <td className="col-checkbox" onClick={stopRowClick}>
        <input 
          type="checkbox" 
          className="premium-checkbox" 
          checked={isSelected}
          onChange={() => onSelect?.(order.id)}
          aria-label={`Select order ${formattedOrderId}`}
        />
      </td>

      {/* 2. Order ID (#OF-10234 + New/Repeat) (~9.5%) */}
      <td className="col-id">
        <div className="id-cell-stack">
          <div className="id-primary-row">
            {isUnread && <span className="route-unread-dot" aria-label="Unread order" />}
            <span className="order-id-text">{formattedOrderId}</span>
          </div>
          <div className="id-sub-row">
            <span className={`order-type-badge ${isRepeat ? 'repeat' : 'new'}`}>
              {isRepeat ? 'Repeat' : 'New'}
            </span>
            {duplicateWarning && (
              <span className="order-dup-icon" title={duplicateWarning.title}>
                <AlertTriangle size={11} />
              </span>
            )}
          </div>
        </div>
      </td>

      {/* 3. Customer Name + subtext (~14.5%) */}
      <td className="col-customer">
        <div className="customer-cell-stack">
          <span className="customer-name-text" title={order.customer_name || 'Anonymous'}>
            {order.customer_name || 'Anonymous'}
          </span>
          <span className="customer-subtext">
            {isRepeat ? 'Regular Customer' : 'New Customer'}
          </span>
        </div>
      </td>

      {/* 4. Phone (icon + formatted number + subtle hover copy) (~11.5%) */}
      <td className="col-phone" onClick={stopRowClick}>
        <div className="phone-cell-content">
          <Phone size={12} className="phone-icon-accent" />
          <span className="phone-number-text">{formattedPhone}</span>
          {rawPhone && (
            <button
              type="button"
              className={`phone-copy-btn ${copied ? 'copied' : ''}`}
              title={copied ? 'Copied!' : 'Copy phone'}
              onClick={(e) => handleCopy(e, rawPhone)}
              aria-label="Copy phone"
            >
              <Copy size={11} />
            </button>
          )}
        </div>
      </td>

      {/* 5. Product (thumbnail + name + source badge) (~18.5%) */}
      <td className="col-product">
        <div className="product-cell-content">
          {productImageUrl ? (
            <img 
              src={productImageUrl} 
              alt={productName} 
              className="product-thumbnail-img" 
              loading="lazy" 
            />
          ) : (
            <div 
              className="product-thumbnail-avatar"
              style={{
                backgroundColor: `${productColor}15`,
                borderColor: `${productColor}30`,
                color: productColor
              }}
            >
              <Package size={15} strokeWidth={1.75} />
            </div>
          )}
          <div className="product-info-stack">
            <span className="product-name-title" title={productName}>
              {productName}
            </span>
            <div className="product-source-wrap">
              <SourceBadge traffic_source={order.traffic_source} source={order.source} />
            </div>
          </div>
        </div>
      </td>

      {/* 6. Amount (৳ amount + COD/Prepaid badge) (~8.0%) */}
      <td className="col-amount">
        <div className="amount-cell-content">
          <span className="amount-value-text">
            {`৳\u00A0${Number(order.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          </span>
          <span className={`payment-pill ${paymentMethod.toLowerCase()}`}>
            {paymentMethod}
          </span>
        </div>
      </td>

      {/* 7. Area (Inside Dhaka / Outside Dhaka / City) (~8.5%) */}
      <td className="col-area">
        <span className="area-value-text" title={order.shipping_zone || 'Outside Dhaka'}>
          {order.shipping_zone || 'Outside Dhaka'}
        </span>
      </td>

      {/* 8. Status (colored pill badge with dot indicator) (~10.5%) */}
      <td className="col-status" onClick={stopRowClick}>
        <div className="status-dropdown-container" ref={statusBtnRef}>
          <button 
            type="button"
            className={`saas-badge saas-badge-${getStatusBadgeVariant(order.status)} ${isIncompleteConversion(order) ? 'is-inco-converted' : ''} clickable`}
            onClick={toggleStatusMenu}
            title={isIncompleteConversion(order) ? 'Converted from Incomplete Checkout' : 'Change Status'}
          >
            <span className={`dot ${isIncompleteConversion(order) ? 'inco-pulse-dot' : ''}`} />
            <span className="status-badge-text">{displayStatus}</span>
          </button>
          
          {showStatusMenu && mounted && typeof document !== 'undefined' && ReactDOM.createPortal(
            <>
              <div className="status-dropdown-backdrop" onClick={() => setShowStatusMenu(false)} />
              <div 
                className="status-menu-dropdown liquid-glass animate-in fade-in zoom-in duration-150"
                style={{ 
                  position: 'fixed', 
                  top: statusMenuPos.top, 
                  left: statusMenuPos.left, 
                  zIndex: 99999,
                  transformOrigin: 'top left'
                }}
              >
                {ORDER_STATUSES.map(status => (
                  <button 
                    type="button"
                    key={status}
                    className={`status-menu-item ${order.status === status ? 'active' : ''}`}
                    onClick={() => {
                      onStatusChange(order.id, status);
                      setShowStatusMenu(false);
                    }}
                  >
                    {status === 'Final Call Pending' ? 'Final Call' : status === 'Cancelled' ? 'Canceled' : status}
                  </button>
                ))}
              </div>
            </>,
            document.body
          )}
        </div>
      </td>

      {/* 9. Time (date + time + ResponseTimer) (~8.5%) */}
      <td className="col-time">
        <div className="time-cell">
          <div className="order-date-row">
            <span className="order-date">{dateStr}</span>
            <span className="order-time">{timeStr}</span>
          </div>
          <div className="order-timer-wrap" onClick={stopRowClick}>
            <ResponseTimer order={order} mode="compact" />
          </div>
        </div>
      </td>

      {/* 10. Actions (eye, edit, more) (~7.0%) */}
      <td className="col-actions" onClick={stopRowClick}>
        <div className="order-actions">
          <button 
            type="button" 
            className="action-icon-btn" 
            title="View Details" 
            onClick={() => onDetails(order)}
            aria-label="View order details"
          >
            <Eye size={14} strokeWidth={1.75} />
          </button>

          {onEdit && (
            <button 
              type="button" 
              className="action-icon-btn" 
              title="Edit Order" 
              onClick={() => onEdit(order)}
              aria-label="Edit order"
            >
              <Edit2 size={13} strokeWidth={1.75} />
            </button>
          )}

          <div className="more-menu-wrapper" ref={moreBtnRef}>
            <button 
              type="button" 
              className="action-icon-btn" 
              title="More Actions"
              onClick={toggleMoreMenu}
            >
              <MoreHorizontal size={14} strokeWidth={1.75} />
            </button>

            {showMoreMenu && mounted && typeof document !== 'undefined' && ReactDOM.createPortal(
              <>
                <div className="status-dropdown-backdrop" onClick={() => setShowMoreMenu(false)} />
                <div 
                  className="actions-menu-dropdown liquid-glass animate-in fade-in zoom-in duration-150"
                  style={{ 
                    position: 'fixed', 
                    top: moreMenuPos.top, 
                    left: moreMenuPos.left, 
                    zIndex: 99999 
                  }}
                >
                  <button 
                    type="button" 
                    className="actions-menu-item" 
                    onClick={() => { setShowMoreMenu(false); onDetails(order); }}
                  >
                    <Eye size={13} /> <span>View Details</span>
                  </button>
                  {onEdit && (
                    <button 
                      type="button" 
                      className="actions-menu-item" 
                      onClick={() => { setShowMoreMenu(false); onEdit(order); }}
                    >
                      <Edit2 size={13} /> <span>Edit Order</span>
                    </button>
                  )}
                  {rawPhone && (
                    <button 
                      type="button" 
                      className="actions-menu-item" 
                      onClick={(e) => { setShowMoreMenu(false); handleCopy(e, rawPhone); }}
                    >
                      <Copy size={13} /> <span>Copy Phone</span>
                    </button>
                  )}
                  {rawPhone && (
                    <a 
                      href={`tel:${rawPhone}`} 
                      className="actions-menu-item" 
                      onClick={() => setShowMoreMenu(false)}
                    >
                      <Phone size={13} /> <span>Call Customer</span>
                    </a>
                  )}
                  {whatsappLink && (
                    <a 
                      href={whatsappLink} 
                      target="_blank" 
                      rel="noreferrer" 
                      className="actions-menu-item" 
                      onClick={() => setShowMoreMenu(false)}
                    >
                      <MessageCircle size={13} /> <span>WhatsApp</span>
                    </a>
                  )}
                </div>
              </>,
              document.body
            )}
          </div>
        </div>
      </td>
    </motion.tr>
  );
};

export const OrderRow = React.memo(OrderRowComponent, (prevProps, nextProps) => {
  return (
    prevProps.order === nextProps.order &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.isUnread === nextProps.isUnread &&
    prevProps.fraudFlag === nextProps.fraudFlag &&
    prevProps.automationFlag === nextProps.automationFlag &&
    prevProps.duplicateWarning === nextProps.duplicateWarning &&
    prevProps.onDetails === nextProps.onDetails &&
    prevProps.onStatusChange === nextProps.onStatusChange &&
    prevProps.onEdit === nextProps.onEdit &&
    prevProps.onSelect === nextProps.onSelect
  );
});

OrderRow.displayName = 'OrderRow';

export default OrderRow;
