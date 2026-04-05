import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import ReactDOM from 'react-dom';
import { Badge } from './Badge';
import { FileText, MessageSquare, ChevronDown, Clock, AlertTriangle } from 'lucide-react';
import CurrencyIcon from './CurrencyIcon';
import { slideUpVariants } from '../lib/motion';
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
      variants={slideUpVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
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
        <span className="saas-id">#{String(order.id).replace('ORD-', '')}</span>
      </td>

      <td className="date-cell">
        <span className="saas-text">{new Date(order.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
      </td>

      <td className="customer-cell">
        <span className="saas-text-dark">{order.customer_name}</span>
      </td>

      <td className="payment-status-cell">
        <div className={`saas-badge ${order.payment_status === 'Paid' ? 'saas-badge-success' : 'saas-badge-warning'}`}>
          <span className="dot"></span>
          {order.payment_status === 'Paid' ? 'Success' : 'Pending'}
        </div>
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
            className={`saas-badge ${getStatusBadgeVariant(order.status) === 'confirmed' || getStatusBadgeVariant(order.status) === 'delivered' ? 'saas-badge-success' : getStatusBadgeVariant(order.status) === 'cancelled' || getStatusBadgeVariant(order.status) === 'returned' ? 'saas-badge-danger' : 'saas-badge-warning'} clickable`}
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
          <button className="saas-icon-btn" title="Message" onClick={(e) => { e.stopPropagation(); onEdit && onEdit(order); }}>
            <MessageSquare size={16} strokeWidth={1.5} />
          </button>
        </div>
      </td>
    </motion.tr>
  );
};
