import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { Badge } from './Badge';
import { MoreHorizontal, Mail, Phone, ShoppingCart, Tag, Copy, Check, ChevronDown } from 'lucide-react';
import './OrderRow.css';

export const OrderRow = ({ order, onDetails, onStatusChange }) => {
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

  const ORDER_STATUSES = [
    'New', 'Pending Call', 'Confirmed', 'Courier Submitted', 
    'Factory Processing', 'Completed', 'Cancelled'
  ];

  return (
    <tr className="order-row clickable-row" onClick={() => onDetails(order)}>
      <td className="checkbox-cell" onClick={(e) => e.stopPropagation()}>
        <input type="checkbox" className="premium-checkbox" />
      </td>

      <td className="id-cell">
        <div className="id-block">
          <div className="id-header">
            <span className="id-text">#{order.id.replace('ORD-', '')}</span>
            <button 
              className={`copy-btn ${copied ? 'copied' : ''}`}
              onClick={(e) => handleCopy(e, order.id)}
              title="Copy ID"
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
            </button>
          </div>
          <div className="category-tag">
            <Tag size={10} /> Ecommerce
          </div>
        </div>
      </td>

      <td className="date-cell">
        <div className="date-block">
          <span className="primary-date">
            {new Date(order.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
          <span className="secondary-time">
            at {new Date(order.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </td>

      <td className="customer-cell">
        <div className="customer-block">
          <div className="customer-name">{order.customer_name}</div>
          <div className="customer-meta">
            <div className="meta-item"><Phone size={12} /> {order.phone}</div>
            <div className="meta-item email"><Mail size={12} /> {order.email || 'no-email@example.com'}</div>
          </div>
        </div>
      </td>

      <td className="amount-cell">
        <div className="amount-block">
          <span className="currency">৳</span>
          <span className="amount-text">{Number(order.amount || 0).toLocaleString()}</span>
        </div>
      </td>

      <td className="items-cell">
        <div className="items-count-display">
          <div className="items-count-badge">
            {String(order.items || 1).padStart(2, '0')}
            <ChevronDown size={14} className="badge-chevron" />
          </div>
          {order.ordered_items && order.ordered_items.length > 0 && (
            <div className="serial-pills">
              {order.ordered_items.map(num => (
                <span key={num} className="serial-pill">{num}</span>
              ))}
            </div>
          )}
        </div>
      </td>

      <td className="payment-status-cell">
        <Badge variant={order.payment_status === 'Paid' ? 'completed' : 'cancelled'}>
          {order.payment_status || 'Unpaid'}
        </Badge>
      </td>

      <td className="shipping-cell">
        <div className="shipping-text">
          {order.shipping_zone || 'Outside dhaka'}
        </div>
      </td>

      <td className="status-cell" onClick={(e) => e.stopPropagation()}>
        <div className="status-dropdown-container" ref={statusBtnRef}>
          <button 
            className={`status-trigger-pill ${getStatusBadgeVariant(order.status)}`}
            onClick={toggleStatusMenu}
          >
            <span>{order.status}</span>
            <ChevronDown size={14} />
          </button>
          
          {showStatusMenu && ReactDOM.createPortal(
            <>
              <div className="status-dropdown-backdrop" onClick={() => setShowStatusMenu(false)} />
              <div 
                className="status-menu-dropdown liquid-glass"
                style={{ position: 'fixed', top: menuPos.top, left: menuPos.left, zIndex: 99999 }}
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

      <td className="actions-cell" onClick={(e) => e.stopPropagation()}>
        <button className="row-action-btn">
          <MoreHorizontal size={18} />
        </button>
      </td>
    </tr>
  );
};
