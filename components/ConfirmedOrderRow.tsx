'use client';

import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { 
  Phone, 
  Copy, 
  MessageCircle, 
  Edit2, 
  Eye, 
  Truck,
  Package,
  ChevronDown,
  Zap,
  Loader2,
  Check
} from 'lucide-react';
import { ResponseTimer } from './ResponseTimer';
import { Badge } from './Badge';
import { getToyBoxStockKey } from '../utils/productCatalog';
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

const getStockStatus = (order: any, toyBoxes: any[] = []) => {
  const items = order?.ordered_items || [];
  const isToyBox = (order?.product_name || '').toUpperCase().includes('TOY BOX');
  if (!isToyBox || items.length === 0) return { matched: true, label: 'Auto Pass', missing: [] };

  const stockMap: Record<string, number> = {};
  toyBoxes.forEach((box) => {
    stockMap[getToyBoxStockKey(box.product_name || 'TOY BOX', box.toy_box_number)] = Number(box.stock_quantity) || 0;
  });

  const missing = items.filter((item: any) => {
    const boxNum = typeof item === 'object' ? item.toyBoxNumber : item;
    if (boxNum == null) return false;
    const productName = typeof item === 'object' ? (item.name || order.product_name || 'TOY BOX') : 'TOY BOX';
    return (stockMap[getToyBoxStockKey(productName, boxNum)] || 0) < 1;
  });

  return {
    matched: missing.length === 0,
    label: missing.length === 0 ? 'Stock OK' : `${missing.length} Missing`,
    missing
  };
};

const getCleanProductDisplay = (order: any) => {
  const items = order?.ordered_items || [];
  let totalQty = Number(order?.quantity || 0);
  if (items.length > 0) {
    const sumQty = items.reduce((acc: number, item: any) => {
      const q = typeof item === 'object' ? Number(item.quantity || item.qty || 1) : 1;
      return acc + q;
    }, 0);
    if (sumQty > 0) totalQty = sumQty;
  }
  if (!totalQty || totalQty <= 0) totalQty = 1;

  let cleanName = '';
  if (items.length > 0) {
    const itemNames = items.map((item: any) => {
      if (typeof item === 'object') {
        const name = (item.name || item.product_name || item.title || '').trim();
        const qty = Number(item.quantity || item.qty || 1);
        return qty > 1 ? `${name} (x${qty})` : name;
      }
      return String(item).trim();
    }).filter(Boolean);

    cleanName = itemNames.join(', ');
  }

  const origName = (order?.product_name || '').trim();
  if (!cleanName || /^\d+\s*items?$/i.test(cleanName)) {
    if (origName && !/^\d+\s*items?$/i.test(origName)) {
      cleanName = origName;
    } else if (items.length > 0) {
      const fallbackItems = items.map((i: any) => (typeof i === 'object' ? (i.name || i.product_name || i.title) : i)).filter(Boolean);
      cleanName = fallbackItems.join(', ') || origName || 'Standard Product';
    } else {
      cleanName = origName || 'Standard Product';
    }
  }

  return { cleanName, totalQty };
};

export interface ConfirmedOrderRowProps {
  order: any;
  activeTab: 'confirmed' | 'queued' | string;
  isSelected?: boolean;
  onSelect?: (orderId: string | number) => void;
  isMovingSelectedConfirmed?: boolean;
  isDispatchingSelected?: boolean;
  isUnread?: boolean;
  onDetails: (order: any) => void;
  onEdit: (order: any) => void;
  onSingleSendToCourier: (e: React.MouseEvent, orderId: string | number) => void;
  onSingleSendToPathao: (e: React.MouseEvent, orderId: string | number) => void;
  onRetryDistribute: (orderId: string | number) => void;
  isRowLoading?: boolean;
  toyBoxes?: any[];
  activeCourierDropdownId?: string | number | null;
  setActiveCourierDropdownId?: (id: string | number | null) => void;
}

const ConfirmedOrderRowComponent: React.FC<ConfirmedOrderRowProps> = ({
  order,
  activeTab,
  isSelected = false,
  onSelect,
  isMovingSelectedConfirmed = false,
  isDispatchingSelected = false,
  isUnread = false,
  onDetails,
  onEdit,
  onSingleSendToCourier,
  onSingleSendToPathao,
  onRetryDistribute,
  isRowLoading = false,
  toyBoxes = [],
  activeCourierDropdownId = null,
  setActiveCourierDropdownId
}) => {
  const [copied, setCopied] = useState(false);

  const stopRowClick = (e: React.MouseEvent) => e.stopPropagation();

  // Order ID formatting
  const formattedOrderId = useMemo(() => {
    const raw = String(order?.id || '');
    if (!raw) return '—';
    if (raw.startsWith('#')) return raw;
    const cleanNumber = raw.replace(/^(ORD|STB|MGB)-/i, '');
    return `#OF-${cleanNumber}`;
  }, [order?.id]);

  const callerName = order?.first_caller_name || 'Not called';

  // Customer repeat status
  const isRepeat = Boolean(
    order?.is_repeat_customer || 
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

  const handleCopyPhone = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!rawPhone) return;
    navigator.clipboard.writeText(rawPhone);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Product formatting
  const { cleanName, totalQty } = useMemo(() => getCleanProductDisplay(order), [order]);
  const productColor = useMemo(() => getProductColor(cleanName), [cleanName]);
  const productImageUrl = order?.product_image || order?.image_url || order?.image || order?.order_lines_payload?.[0]?.product_image || null;

  // Amount & payment
  const orderTotal = Number(order?.total_amount || order?.amount || order?.total || 0);
  const paymentMethod = String(order?.payment_method || 'COD').toUpperCase() === 'PREPAID' ? 'Prepaid' : 'COD';

  // Delivery Area
  const deliveryZone = order?.shipping_zone || order?.delivery_zone || 'Outside Dhaka';

  // Stock status
  const stock = useMemo(() => getStockStatus(order, toyBoxes), [order, toyBoxes]);
  const isToyBox = useMemo(() => (cleanName || order?.product_name || '').toUpperCase().includes('TOY BOX'), [cleanName, order?.product_name]);

  // Status
  const statusLabel = getDisplayStatusLabel(order);
  const statusVariant = getStatusBadgeVariant(order?.status);

  // Date and Time
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

  const isCourierDropdownOpen = activeCourierDropdownId === order.id;

  return (
    <motion.tr
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      className={`order-row ${isSelected ? 'row-selected' : ''} ${isUnread ? 'route-unread-row' : ''}`}
      onClick={() => onDetails(order)}
    >
      {/* 1. Checkbox (~3.0%) — Only in confirmed tab */}
      {activeTab === 'confirmed' && (
        <td className="col-checkbox" onClick={stopRowClick}>
          <input
            type="checkbox"
            className="premium-checkbox"
            checked={isSelected}
            onChange={() => onSelect?.(order.id)}
            disabled={isMovingSelectedConfirmed || isDispatchingSelected || order.status !== 'Confirmed'}
            aria-label={`Select order ${formattedOrderId}`}
          />
        </td>
      )}

      {/* 2. Order ID (#OF-XXXX + Caller subtext) (~8.5%) */}
      <td className="col-id">
        <div className="id-cell-stack">
          <div className="id-primary-row">
            {isUnread && <span className="route-unread-dot" aria-label="Unread order" />}
            <span className="order-id-text">{formattedOrderId}</span>
          </div>
          <div className="id-sub-row">
            <span className="caller-subtext" title={`Caller: ${callerName}`}>
              {callerName}
            </span>
            {isUnread && <span className="route-unread-chip">New</span>}
          </div>
        </div>
      </td>

      {/* 3. Customer Name + type (~11.5%) */}
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

      {/* 4. Contact Phone (icon + number + copy/call/wa) (~10.5%) */}
      <td className="col-phone" onClick={stopRowClick}>
        <div className="phone-cell-content">
          <Phone size={12} className="phone-icon-accent" />
          <span className="phone-number-text">{formattedPhone}</span>
          {rawPhone && (
            <div className="phone-actions-wrap">
              <button
                type="button"
                className={`phone-copy-btn ${copied ? 'copied' : ''}`}
                title={copied ? 'Copied!' : 'Copy phone'}
                onClick={handleCopyPhone}
                aria-label="Copy phone"
              >
                {copied ? <Check size={11} /> : <Copy size={11} />}
              </button>
              <a
                href={`tel:${rawPhone}`}
                className="phone-quick-icon"
                title="Call customer"
                aria-label="Call customer"
              >
                <Phone size={11} />
              </a>
              {whatsappLink && (
                <a
                  href={whatsappLink}
                  target="_blank"
                  rel="noreferrer"
                  className="phone-quick-icon wa"
                  title="WhatsApp"
                  aria-label="Open WhatsApp"
                >
                  <MessageCircle size={11} />
                </a>
              )}
            </div>
          )}
        </div>
      </td>

      {/* 5. Product (thumbnail + name + Qty + source) (~15.0%) */}
      <td className="col-product">
        <div className="product-cell-content">
          {productImageUrl ? (
            <img 
              src={productImageUrl} 
              alt={cleanName} 
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
            <span className="product-name-title" title={cleanName}>
              {cleanName}
            </span>
            <div className="product-meta-row">
              <span className="product-qty-pill">Qty {totalQty}</span>
              <SourceBadge traffic_source={order.traffic_source} source={order.source} />
            </div>
          </div>
        </div>
      </td>

      {/* 6. Amount (৳ amount + COD/Prepaid pill) (~7.0%) */}
      <td className="col-amount">
        <div className="amount-cell-content">
          <span className="amount-value-text">
            {`৳\u00A0${Number(orderTotal).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          </span>
          <span className={`payment-pill ${paymentMethod.toLowerCase()}`}>
            {paymentMethod}
          </span>
        </div>
      </td>

      {/* 7. Area (~7.5%) */}
      <td className="col-area">
        <span className="area-value-text" title={deliveryZone}>
          {deliveryZone}
        </span>
      </td>

      {/* 8. Stock / Items (~8.5%) */}
      <td className="col-stock">
        <div className="stock-cell-stack">
          <Badge variant={stock.matched ? 'success' : 'warning'} className="factory-stock-pill">
            {stock.matched ? 'Full Stock' : `${stock.missing.length} Missing`}
          </Badge>
          {isToyBox && (order.ordered_items || []).length > 0 && (
            <div className="factory-item-pills">
              {(order.ordered_items || []).map((item: any, idx: number) => {
                const boxNum = typeof item === 'object' ? item.toyBoxNumber : item;
                if (boxNum == null) return null;
                const productName = typeof item === 'object' ? (item.name || order.product_name || 'TOY BOX') : 'TOY BOX';
                const stockKey = getToyBoxStockKey(productName, boxNum);
                const stockQty = toyBoxes.find((box) => getToyBoxStockKey(box.product_name || 'TOY BOX', box.toy_box_number) === stockKey)?.stock_quantity || 0;
                const isOut = stockQty < 1;

                return (
                  <span key={`${order.id}-item-${idx}`} className={`factory-item-pill ${isOut ? 'out' : ''}`}>
                    {item?.name ? `${item.name.charAt(0)}${boxNum}` : `#${boxNum}`}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </td>

      {/* 9. Fulfilment Status (~8.5%) */}
      <td className="col-status" onClick={stopRowClick}>
        <span
          className={`saas-badge saas-badge-${statusVariant} ${isIncompleteConversion(order) ? 'is-inco-converted' : ''}`}
          title={isIncompleteConversion(order) ? 'Converted from Incomplete Checkout' : ''}
        >
          <span className={`dot ${isIncompleteConversion(order) ? 'inco-pulse-dot' : ''}`} />
          <span className="status-badge-text">{statusLabel}</span>
        </span>
      </td>

      {/* 10. Time (~8.0%) */}
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

      {/* 11. Actions (~12.0%) */}
      <td className="col-actions" onClick={stopRowClick}>
        <div className="order-actions">
          {order.status === 'Confirmed' && (
            <div className="courier-dropdown-wrapper">
              <button
                type="button"
                className="factory-action-btn courier-main-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveCourierDropdownId?.(isCourierDropdownOpen ? null : order.id);
                }}
                disabled={isRowLoading || isDispatchingSelected || isMovingSelectedConfirmed}
                title="Dispatch order via Courier"
              >
                {isRowLoading ? (
                  <Loader2 size={13} className="spin" />
                ) : (
                  <Truck size={13} />
                )}
                <span>Dispatch</span>
                <ChevronDown size={11} />
              </button>

              {isCourierDropdownOpen && (
                <div className="courier-dropdown-menu liquid-glass" onClick={stopRowClick}>
                  <button
                    type="button"
                    className="courier-menu-item sfast"
                    onClick={(e) => {
                      setActiveCourierDropdownId?.(null);
                      onSingleSendToCourier(e, order.id);
                    }}
                  >
                    <Truck size={14} className="menu-icon" />
                    <div className="menu-text">
                      <strong>Steadfast (S-Fast)</strong>
                      <span>Direct API Dispatch</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    className="courier-menu-item pathao"
                    onClick={(e) => {
                      setActiveCourierDropdownId?.(null);
                      onSingleSendToPathao(e, order.id);
                    }}
                  >
                    <Package size={14} className="menu-icon" />
                    <div className="menu-text">
                      <strong>Pathao Courier</strong>
                      <span>Tracking ID Entry</span>
                    </div>
                  </button>
                </div>
              )}
            </div>
          )}

          <button 
            type="button" 
            className="action-icon-btn" 
            title="Edit Order" 
            onClick={() => onEdit(order)}
            aria-label="Edit order"
          >
            <Edit2 size={13} strokeWidth={1.75} />
          </button>

          <button 
            type="button" 
            className="action-icon-btn" 
            title="View Details" 
            onClick={() => onDetails(order)}
            aria-label="View order details"
          >
            <Eye size={14} strokeWidth={1.75} />
          </button>

          {order.status === 'Factory Queue' && (
            <button
              type="button"
              className="factory-action-btn retry"
              onClick={() => onRetryDistribute(order.id)}
              title="Recheck Inventory"
            >
              <Zap size={13} /> <span>Recheck</span>
            </button>
          )}
        </div>
      </td>
    </motion.tr>
  );
};

export const ConfirmedOrderRow = React.memo(ConfirmedOrderRowComponent, (prev, next) => {
  return (
    prev.order === next.order &&
    prev.activeTab === next.activeTab &&
    prev.isSelected === next.isSelected &&
    prev.isUnread === next.isUnread &&
    prev.isRowLoading === next.isRowLoading &&
    prev.isMovingSelectedConfirmed === next.isMovingSelectedConfirmed &&
    prev.isDispatchingSelected === next.isDispatchingSelected &&
    prev.activeCourierDropdownId === next.activeCourierDropdownId &&
    prev.toyBoxes === next.toyBoxes
  );
});

ConfirmedOrderRow.displayName = 'ConfirmedOrderRow';

export default ConfirmedOrderRow;
