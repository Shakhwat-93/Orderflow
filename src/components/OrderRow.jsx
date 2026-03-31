import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import ReactDOM from 'react-dom';
import { Badge } from './Badge';
import { MoreHorizontal, Mail, Phone, ShoppingCart, Tag, Copy, Check, ChevronDown, Edit2, AlertTriangle, Clock, Eye } from 'lucide-react';
import CurrencyIcon from './CurrencyIcon';
import './OrderRow.css';

export const OrderRow = ({ order, onDetails, onStatusChange, onEdit, isSelected, onSelect, fraudFlag, automationFlag }) => {
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
    <motion.tr 
      className={`order-row clickable-row ${isSelected ? 'row-selected' : ''}`} 
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
        <div className="id-block">
          <div className="id-header">
            <span className="id-text">#{order.id.replace('ORD-', '')}</span>
            <button 
              className={`copy-btn ${copied ? 'copied' : ''}`}
              onClick={(e) => handleCopy(e, order.id)}
              title="Copy ID"
            >
              {copied ? <Check size={12} strokeWidth={3} /> : <Copy size={12} />}
            </button>
          </div>
          <div className="category-tag">
            <Tag size={10} strokeWidth={2.5} /> Ecommerce
          </div>
        </div>
      </td>

      <td className="date-cell">
        <div className="date-block">
          <span className="primary-date">
            {new Date(order.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
          <span className="secondary-time">
            {new Date(order.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </td>

      <td className="customer-cell">
        <div className="customer-block">
          <div className="customer-name">
            <strong>{order.customer_name}</strong>
            {fraudFlag && (
              <div className="fraud-alert-icon" title={fraudFlag.message}>
                <AlertTriangle size={14} className="text-error neon-drop" />
              </div>
            )}
            {automationFlag && (
              <div className="automation-alert-icon" title={automationFlag.reason}>
                <Clock size={14} className="text-warning neon-drop" />
              </div>
            )}
          </div>
          <div className="customer-meta">
            <div className="meta-item">
              <Phone size={11} strokeWidth={2.5} /> 
              <span>{order.phone}</span>
            </div>
          </div>
        </div>
      </td>

      <td className="amount-cell">
        <div className="amount-block">
          <CurrencyIcon size={12} className="currency-icon-elite" />
          <span className="amount-text">{Number(order.amount || 0).toLocaleString()}</span>
        </div>
      </td>



      <td className="payment-status-cell">
        <Badge 
          variant="default"
          className={order.payment_status === 'Paid' ? 'badge-paid' : 'badge-unpaid'}
        >
          {(order.payment_status || 'UNPAID').toUpperCase()}
        </Badge>
      </td>

      <td className="status-cell" onClick={(e) => e.stopPropagation()}>
        <div className="status-dropdown-container" ref={statusBtnRef}>
          <button 
            className={`status-trigger-pill badge-${getStatusBadgeVariant(order.status)}`}
            onClick={toggleStatusMenu}
          >
            <span>{order.status}</span>
            <ChevronDown size={12} strokeWidth={3} />
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
        <div className="action-btn-group">
          <button className="action-icon-btn" title="View Details" onClick={(e) => { e.stopPropagation(); onDetails(order); }}>
            <Eye size={14} strokeWidth={2.5} />
          </button>
          <button className="action-icon-btn highlight" title="Edit Order" onClick={(e) => { e.stopPropagation(); onEdit && onEdit(order); }}>
            <Edit2 size={14} strokeWidth={2.5} />
          </button>
        </div>
      </td>
    </motion.tr>
  );
};
