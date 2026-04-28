import { useState, useEffect, useMemo } from 'react';
import { useOrders } from '../context/OrderContext';
import { OrderEditModal } from '../components/OrderEditModal';
import { OrderDetailsModal } from '../components/OrderDetailsModal';
import { DateRangePicker } from '../components/DateRangePicker';
import { 
  Search, PhoneCall, CheckCircle, XCircle, Clock, PhoneMissed, 
  PhoneOff, Edit2, Loader2, ShieldCheck, ShieldAlert, Shield, 
  UserCheck, RotateCcw, Truck, Zap, Calendar, TrendingUp, Settings2, PauseCircle
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCourierRatio } from '../context/CourierRatioContext';
import api from '../lib/api';
import { deserializeDateRange, usePersistentState } from '../utils/persistentState';
import { getProductOptions } from '../utils/productCatalog';
import CurrencyIcon from '../components/CurrencyIcon';
import { Modal } from '../components/Modal';
import './CallTeamPanel.css';

const STATUS_OPTIONS = ['ACTIVE', 'NEW', 'PENDING'];
const ACTIVE_CALL_STATUSES = ['New', 'Pending Call'];
const CALL_TASKS_PER_PAGE = 10;

const getVisiblePageNumbers = (currentPage, totalPages, maxVisible = 5) => {
  if (totalPages <= maxVisible) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const half = Math.floor(maxVisible / 2);
  let start = Math.max(1, currentPage - half);
  const end = Math.min(totalPages, start + maxVisible - 1);
  start = Math.max(1, end - maxVisible + 1);

  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
};
const QUICK_CALL_STATUSES = [
  { id: 'busy', label: 'Busy', logLabel: 'Busy', icon: PhoneOff, tone: 'busy' },
  { id: 'not-pick', label: 'Not Pick', logLabel: 'Not Pick', icon: PhoneMissed, tone: 'not-pick' },
  { id: 'hold', label: 'Hold', logLabel: 'On Hold', icon: PauseCircle, tone: 'hold' }
];

const ACTION_NOTE_CONFIG = {
  confirm: {
    title: 'Confirm Order',
    actionLabel: 'Confirmed',
    placeholder: 'Example: Customer confirmed. Requested delivery after 7 PM.'
  },
  cancel: {
    title: 'Cancel Order',
    actionLabel: 'Cancelled',
    placeholder: 'Example: Customer cancelled. Ordered by mistake.'
  },
  fake: {
    title: 'Mark Fake Order',
    actionLabel: 'Fake Order',
    placeholder: 'Example: Fake customer details or abusive repeat order. IP will be blocked permanently.'
  },
  busy: {
    title: 'Mark Busy',
    actionLabel: 'Busy',
    placeholder: 'Example: Customer was busy. Asked to call again in 20 minutes.'
  },
  'not-pick': {
    title: 'Mark Not Pick',
    actionLabel: 'Not Pick',
    placeholder: 'Example: No answer. Try again after 30 minutes.'
  },
  hold: {
    title: 'Put On Hold',
    actionLabel: 'On Hold',
    placeholder: 'Example: Customer asked for callback tomorrow morning.'
  }
};

export const CallTeamPanel = () => {
  const { orders, stats, inventory, updateOrderStatus, fetchOrders } = useOrders();
  const { user, profile, userRoles, updatePresenceContext } = useAuth();
  const productOptions = getProductOptions(inventory);

  useEffect(() => {
    updatePresenceContext('Managing Calls');
  }, [updatePresenceContext]);

  // Filters
  const [searchTerm, _setSearchTerm] = usePersistentState('panel:call-team:search', '');
  const [statusFilter, setStatusFilter] = usePersistentState('panel:call-team:status', 'ACTIVE');
  const [productFilter, setProductFilter] = usePersistentState('panel:call-team:product', '');
  const [dateRange, _setDateRange] = usePersistentState(
    'panel:call-team:dateRange',
    { start: null, end: null },
    { deserialize: deserializeDateRange }
  );

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [loggingAttemptId, setLoggingAttemptId] = useState(null);
  const [pendingNoteAction, setPendingNoteAction] = useState(null);
  const [actionNote, setActionNote] = useState('');
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  
  // Globabl Ratio Cache & Auto-fetch
  const { checkPhone, getRatio } = useCourierRatio();

  useEffect(() => {
    if (!selectedOrder?.id) return;
    const latestSelectedOrder = orders.find((order) => order.id === selectedOrder.id);
    if (latestSelectedOrder && latestSelectedOrder !== selectedOrder) {
      setSelectedOrder(latestSelectedOrder);
    }
  }, [orders, selectedOrder]);

  useEffect(() => {
    if (!STATUS_OPTIONS.includes(statusFilter)) {
      setStatusFilter('ACTIVE');
    }
  }, [statusFilter, setStatusFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, productFilter, dateRange.start, dateRange.end]);

  const handleOpenEditModal = (order) => {
    setSelectedOrder(order);
    setIsEditModalOpen(true);
  };

  const handleRowClick = (order) => {
    setSelectedOrder(order);
    setIsDetailsModalOpen(true);
  };

  const handleLogAttempt = async (orderId, attemptStatus, noteText = '') => {
    setLoggingAttemptId(orderId);
    try {
      await api.logCallAttempt(orderId, attemptStatus, user.id, profile?.name || 'Call Team', userRoles, noteText);
      if (fetchOrders) await fetchOrders();
    } catch (err) {
      console.error('Failed to log attempt:', err);
      alert(err.message || 'Failed to log call attempt.');
    } finally {
      setLoggingAttemptId(null);
    }
  };

  // Relative Time Helper
  const getTimeAgo = (date) => {
    if (!date) return null;
    const seconds = Math.floor((new Date() - new Date(date)) / 1000);
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return new Date(date).toLocaleDateString();
  };

  // Filter Logic
  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      const term = searchTerm.toLowerCase();
      const matchesSearch = !searchTerm ||
        (o.id || '').toLowerCase().includes(term) ||
        (o.customer_name || '').toLowerCase().includes(term) ||
        (o.phone || '').includes(term) ||
        (o.product_name || '').toLowerCase().includes(term);

      const statusMap = {
        'ACTIVE': ACTIVE_CALL_STATUSES,
        'ALL ORDERS': ACTIVE_CALL_STATUSES,
        'NEW': ['New'],
        'PENDING': ['Pending Call'],
        'CONFIRMED': ACTIVE_CALL_STATUSES,
        'CANCELLED': ACTIVE_CALL_STATUSES
      };

      const validStatuses = statusMap[statusFilter] || statusMap.ACTIVE;
      const matchesStatus = validStatuses.includes(o.status);

      const matchesProduct = !productFilter || o.product_name === productFilter;

      let matchesDate = true;
      if (dateRange.start && dateRange.end) {
        const orderDate = new Date(o.created_at);
        matchesDate = orderDate >= new Date(dateRange.start) && orderDate <= new Date(dateRange.end);
      }

      return matchesSearch && matchesStatus && matchesProduct && matchesDate;
    });
  }, [orders, searchTerm, statusFilter, productFilter, dateRange]);

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / CALL_TASKS_PER_PAGE));
  const paginatedOrders = useMemo(() => {
    const startIndex = (currentPage - 1) * CALL_TASKS_PER_PAGE;
    return filteredOrders.slice(startIndex, startIndex + CALL_TASKS_PER_PAGE);
  }, [filteredOrders, currentPage]);
  const visiblePages = useMemo(() => getVisiblePageNumbers(currentPage, totalPages), [currentPage, totalPages]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  // Auto-queue visible phones for Courier Ratio checking
  useEffect(() => {
    const unchecked = [...new Set(
      filteredOrders
        .map(o => o.phone)
        .filter((phone) => {
          const currentRatio = getRatio(phone);
          return phone && !currentRatio?.fetched && !currentRatio?.loading;
        })
    )];
    unchecked.forEach(p => checkPhone(p));
  }, [filteredOrders, checkPhone, getRatio]);

  // Metrics Calculations
  const pendingCount = orders.filter(o => ACTIVE_CALL_STATUSES.includes(o.status)).length;
  const confirmedToday = typeof stats?.confirmedTodayCount === 'number'
    ? stats.confirmedTodayCount
    : orders.filter(o => o.status === 'Confirmed' && new Date(o.updated_at || o.created_at).toDateString() === new Date().toDateString()).length;

  const closeActionNoteModal = (force = false) => {
    if (isSubmittingAction && !force) return;
    setPendingNoteAction(null);
    setActionNote('');
  };

  const getLatestNotePreview = (notesValue) => {
    const notes = String(notesValue || '').trim();
    if (!notes) return '';
    const [latestBlock] = notes.split(/\n\s*\n/);
    const lines = latestBlock
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length <= 1) return lines[0] || '';
    return lines.slice(1).join(' ');
  };

  const openActionNoteModal = (e, order, action) => {
    e.stopPropagation();
    const actionMeta = ACTION_NOTE_CONFIG[action];
    if (!actionMeta) return;

    setPendingNoteAction({
      orderId: order.id,
      customerName: order.customer_name || 'Unknown Customer',
      action,
      ...actionMeta
    });
    setActionNote('');
  };

  const submitActionWithNote = async () => {
    if (!pendingNoteAction || !actionNote.trim()) return;

    setIsSubmittingAction(true);
    try {
      switch (pendingNoteAction.action) {
        case 'confirm':
          await updateOrderStatus(pendingNoteAction.orderId, 'Confirmed', actionNote);
          break;
        case 'cancel':
          await updateOrderStatus(pendingNoteAction.orderId, 'Cancelled', actionNote);
          break;
        case 'fake':
          await updateOrderStatus(pendingNoteAction.orderId, 'Fake Order', actionNote);
          break;
        case 'busy':
          await handleLogAttempt(pendingNoteAction.orderId, 'Busy', actionNote);
          break;
        case 'not-pick':
          await handleLogAttempt(pendingNoteAction.orderId, 'Not Pick', actionNote);
          break;
        case 'hold':
          await handleLogAttempt(pendingNoteAction.orderId, 'On Hold', actionNote);
          break;
        default:
          break;
      }

      if (fetchOrders) await fetchOrders();
      closeActionNoteModal(true);
    } catch (error) {
      console.error('Failed to save call action note:', error);
      alert(error.message || 'Failed to save note and update status.');
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // Avatar Generator
  const getInitials = (name) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  };

  const getCallStatusTone = (value = '') => {
    const normalized = String(value).toLowerCase();
    if (normalized.includes('busy')) return 'busy';
    if (normalized.includes('not pick') || normalized.includes('no answer') || normalized.includes('miss')) return 'not-pick';
    if (normalized.includes('hold') || normalized.includes('call back')) return 'hold';
    return 'default';
  };

  return (
    <div className="call-team-panel">
      
      {/* â”€â”€ 1. Top Header Row â”€â”€ */}
      <div className="elite-header-wrapper">
        <div className="elite-header-titles">
          <h1>Call Operations</h1>
          <p>Real-time status of your high-performance call center fleet.</p>
        </div>
        
        <div className="elite-header-badges">
          <div className="elite-top-badge queue">
            <div className="badge-icon-ctn">3</div>
            <div className="badge-text-ctn">
              <span className="badge-sub">IN QUEUE</span>
              <span className="badge-val">{pendingCount} <span>UNITS</span></span>
            </div>
          </div>
          
          <div className="elite-top-badge confirmed">
            <div className="badge-icon-ctn"><CheckCircle size={18} strokeWidth={3} /></div>
            <div className="badge-text-ctn">
              <span className="badge-sub">CONFIRMED TODAY</span>
              <span className="badge-val">{confirmedToday} <span>ORDERS</span></span>
            </div>
          </div>
        </div>
      </div>

      {/* â”€â”€ 2. Metric Cards Row â”€â”€ */}
      <div className="elite-metrics-grid">
        
        {/* Performance Card */}
        <div className="elite-metric-card">
          <div className="metric-header">
            <span className="metric-sup-title">REAL-TIME PERFORMANCE</span>
            <div className="metric-target-badge">
              <TrendingUp size={12} strokeWidth={3} /> +4.2% vs target
            </div>
          </div>
          <div className="metric-big-val">
            92.4<span>% Confirmation Rate</span>
          </div>
          
          {/* Stylized CSS Bar Chart */}
          <div className="metric-chart-container">
            {[40, 60, 50, 75, 55, 100, 65, 80, 50, 70].map((h, i) => (
              <div 
                key={i} 
                className={`metric-bar ${i === 5 ? 'active' : ''}`}
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
        </div>

        {/* Response Time Card */}
        <div className="elite-metric-card">
          <div className="metric-header">
            <span className="metric-sup-title">AVERAGE RESPONSE TIME</span>
          </div>
          <div className="metric-big-val" style={{ fontSize: '48px', marginBottom: '8px' }}>
            12.4<span style={{ fontSize: '30px' }}>m</span>
          </div>
          <p className="metric-text-desc">
            Consistently under the 15m agency benchmark.
          </p>
          <div className="metric-progress-line">
            <div className="metric-progress-fill"></div>
          </div>
        </div>

      </div>

      {/* â”€â”€ 3. Pill Filter Row â”€â”€ */}
      <div className="elite-filter-row">
        <div className="elite-pill-tabs">
          {STATUS_OPTIONS.map(tab => (
            <button 
              key={tab} 
              className={`elite-pill-tab ${statusFilter === tab ? 'active' : ''}`}
              onClick={() => setStatusFilter(tab)}
            >
              {tab}
            </button>
          ))}
        </div>
        
        <div className="elite-filter-right">
          <div className="elite-category-dropdown">
            CATEGORY: 
            <select value={productFilter} onChange={(e) => setProductFilter(e.target.value)}>
              <option value="">ALL PRODUCTS</option>
              {productOptions.map((product) => (
                <option key={product} value={product}>{product.toUpperCase()}</option>
              ))}
            </select>
          </div>
          <button className="elite-icon-btn">
            <Settings2 size={16} />
          </button>
        </div>
      </div>

      {/* â”€â”€ 4. Premium Card List â”€â”€ */}
      <div className="elite-list-container">
        <div className="elite-list-headers">
          <div>ORDER #</div>
          <div>CUSTOMER</div>
          <div>PRODUCT DETAILS</div>
          <div>AMOUNT</div>
          <div className="status-col">STATUS</div>
          <div className="sla-col">SLA TIMER</div>
          <div style={{ textAlign: 'right' }}>ACTIONS</div>
        </div>

        <div className="elite-order-list">
          {paginatedOrders.map(order => {
            
            // Generate Mock Elite status for Timer based on created_at
            let slaClass = 'elapsed'; let slaIcon = <Clock size={12} />; let slaText = 'Just now';
            const minsAge = Math.floor((Date.now() - new Date(order.created_at).getTime()) / 60000);
            if (minsAge < 15) { slaClass = 'remaining'; slaIcon = <Clock size={12}/>; slaText = `${15 - minsAge}m REMAINING`; }
            else if (minsAge < 60) { slaClass = 'elapsed'; slaIcon = <CheckCircle size={12}/>; slaText = `${minsAge}m ELAPSED`; }
            else { slaClass = 'overdue'; slaIcon = <ShieldAlert size={12}/>; slaText = `! OVERDUE`; }

            // Trust Ratio extraction
            const rt = getRatio(order.phone) || {};
            const successRatio = rt.ratio !== undefined ? rt.ratio : (order.phone ? '...' : '0');
            const showTrust = rt.fetched && rt.total > 0;
            const trustClass = successRatio > 70 ? 'high' : successRatio > 40 ? 'neutral' : 'low';
            const isActionable = order.status === 'New' || order.status === 'Pending Call';
            const latestNotePreview = getLatestNotePreview(order.notes);
            const orderCreatedLabel = order.created_at
              ? new Date(order.created_at).toLocaleString('en-GB', {
                  day: '2-digit',
                  month: 'short',
                  hour: 'numeric',
                  minute: '2-digit',
                  hour12: true
                })
              : 'N/A';

            // Status Badge Formatting
            let statusPill = 'neutral';
            if (order.status === 'New') statusPill = 'pending';
            if (order.status === 'Pending Call') statusPill = 'active';
            if (order.status === 'Confirmed') statusPill = 'confirmed';
            if (order.status === 'Fake Order') statusPill = 'fake';
            if (order.status === 'Cancelled') statusPill = 'urgent';

            return (
              <div key={order.id} className="elite-list-card" onClick={() => handleRowClick(order)}>
                
                <div className="elite-col-order">
                  <span className="elite-order-code">#{order.id.replace('ORD-', '')}</span>
                  <span className="elite-order-time">{orderCreatedLabel}</span>
                </div>

                <div className="elite-col-customer">
                  <div className="elite-avatar">{getInitials(order.customer_name)}</div>
                  <div className="elite-cust-info">
                    <span className="elite-cust-name">{order.customer_name}</span>
                    <span className="elite-cust-phone">{order.phone || 'No phone'}</span>
                    <div className="elite-cust-meta-row">
                      <span className={`elite-trust-badge ${trustClass}`}>
                        <Zap size={10} strokeWidth={3} /> {showTrust ? `${successRatio}% SUCCESS` : 'NEW LEAD'}
                      </span>
                      {order.last_call_at && (
                        <span className="elite-last-call-tag">
                          <PhoneCall size={10} /> {getTimeAgo(order.last_call_at)}
                        </span>
                      )}
                    </div>
                    {latestNotePreview && (
                      <div className="elite-note-preview" title={latestNotePreview}>
                        {latestNotePreview}
                      </div>
                    )}
                  </div>
                </div>

                <div className="elite-col-product">
                  <span className="elite-prod-name">{order.product_name || 'Unknown Product'}</span>
                  <span className="elite-prod-meta">
                    {order.size ? `Size: ${order.size}` : `Qty: ${order.quantity || 1}`} • {order.source || 'Direct'}
                  </span>
                </div>

                <div className="elite-col-amount">
                  <span className="elite-amount-value">
                    <CurrencyIcon size={13} className="currency-icon-elite" />
                    {Number(order.amount || 0).toLocaleString()}
                  </span>
                  <span className="elite-amount-meta">{order.shipping_zone || 'Delivery pending'}</span>
                </div>

                <div className="elite-col-status status-col">
                  <div className="elite-status-stack">
                    <span className={`elite-status-pill ${statusPill}`}>{order.status}</span>
                    {order.last_call_status && ['Confirmed', 'Cancelled'].includes(order.status) === false && (
                      <span className={`elite-call-pill ${getCallStatusTone(order.last_call_status)}`}>
                        {order.last_call_status}
                      </span>
                    )}
                  </div>
                </div>

                <div className={`elite-col-sla ${slaClass} sla-col`}>
                  {slaIcon} {order.status === 'Confirmed' ? 'COMPLETED' : slaText}
                </div>

                <div className="elite-col-actions">
                  {isActionable && (
                    <div className="elite-action-dock">
                      <button className="elite-btn-primary" onClick={(e) => openActionNoteModal(e, order, 'confirm')}>
                        <CheckCircle size={14} /> Confirm Order
                      </button>
                      <div className="elite-action-grid">
                        {QUICK_CALL_STATUSES.map((item) => {
                          const Icon = item.icon;
                          const isLoading = loggingAttemptId === order.id;
                          return (
                            <button
                              key={item.id}
                              className={`elite-quick-chip ${item.tone} ${isLoading ? 'loading' : ''}`}
                              title={item.label}
                              onClick={(e) => openActionNoteModal(e, order, item.id)}
                              disabled={isLoading}
                              style={{ opacity: isLoading ? 0.7 : 1, cursor: isLoading ? 'wait' : 'pointer' }}
                            >
                              {isLoading ? <Loader2 size={12} className="lucide-spin" /> : <Icon size={12} />}
                              <span>{isLoading ? 'Wait...' : item.label}</span>
                            </button>
                          );
                        })}
                        <button
                          className="elite-quick-chip fake"
                          title="Mark Fake Order"
                          onClick={(e) => openActionNoteModal(e, order, 'fake')}
                        >
                          <ShieldAlert size={12} />
                          <span>Fake</span>
                        </button>
                        <button
                          className="elite-quick-chip cancel"
                          title="Cancel Order"
                          onClick={(e) => openActionNoteModal(e, order, 'cancel')}
                        >
                          <XCircle size={12} />
                          <span>Cancel</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {order.status === 'Confirmed' && (
                     <button className="elite-icon-btn edit-order-btn" onClick={(e) => { e.stopPropagation(); handleOpenEditModal(order); }}>
                       <Edit2 size={14} />
                     </button>
                  )}
                </div>

                {/* â•â• MOBILE CARD LAYOUT (hidden on desktop via CSS) â•â• */}
                <div className="mob-card-top">
                  <div className="elite-avatar">{getInitials(order.customer_name)}</div>
                  <div className="mob-card-head">
                    <div className="mob-card-title-row">
                      <span className="elite-cust-name mob-cust-name">{order.customer_name}</span>
                      <span className="mob-card-amount">
                        <CurrencyIcon size={13} className="currency-icon-elite" />
                        {Number(order.amount || 0).toLocaleString()}
                      </span>
                    </div>
                    <div className="mob-card-status-row">
                      <span className={`elite-status-pill ${statusPill} compact`}>{order.status}</span>
                      {order.last_call_status && !['Confirmed', 'Cancelled'].includes(order.status) && (
                        <span className={`elite-call-pill ${getCallStatusTone(order.last_call_status)}`}>
                          {order.last_call_status}
                        </span>
                      )}
                      <span className={`elite-trust-badge ${trustClass} mob-trust-badge`}>
                        <Zap size={9} strokeWidth={3} /> {showTrust ? `${successRatio}%` : 'NEW'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mob-card-body">
                  <div className="mob-card-product">
                    {order.product_name || 'Unknown Product'}
                    <span className="mob-card-product-meta">
                      • {order.size ? `Size: ${order.size}` : `Qty: ${order.quantity || 1}`} • {order.source || 'Direct'}
                    </span>
                  </div>
                  <div className="mob-card-meta">
                    <span className="mob-order-meta">
                      #{order.id.replace('ORD-', '')} • {orderCreatedLabel}
                    </span>
                    <span className={`elite-col-sla ${slaClass} mob-sla`}>
                      {slaIcon} {order.status === 'Confirmed' ? 'COMPLETED' : slaText}
                    </span>
                    {order.last_call_at && (
                      <span className="elite-last-call-tag">
                        <PhoneCall size={9} /> {getTimeAgo(order.last_call_at)}
                      </span>
                    )}
                  </div>
                </div>

                {isActionable && (
                  <div className="mob-card-actions" onClick={(e) => e.stopPropagation()}>
                    <div className="elite-action-dock">
                      <button className="elite-btn-primary" onClick={(e) => openActionNoteModal(e, order, 'confirm')}>
                        <CheckCircle size={15} /> Confirm Order
                      </button>
                      <div className="elite-action-grid">
                        {QUICK_CALL_STATUSES.map((item) => {
                          const Icon = item.icon;
                          const isLoading = loggingAttemptId === order.id;
                          return (
                            <button
                              key={item.id}
                              className={`elite-quick-chip ${item.tone}`}
                              onClick={(e) => openActionNoteModal(e, order, item.id)}
                              disabled={isLoading}
                              style={{ opacity: isLoading ? 0.7 : 1 }}
                            >
                              {isLoading ? <Loader2 size={13} className="lucide-spin" /> : <Icon size={13} />}
                              <span>{isLoading ? '...' : item.label}</span>
                            </button>
                          );
                        })}
                        <button className="elite-quick-chip cancel" onClick={(e) => openActionNoteModal(e, order, 'cancel')}>
                          <XCircle size={13} /><span>Cancel</span>
                        </button>
                        <button className="elite-quick-chip fake" onClick={(e) => openActionNoteModal(e, order, 'fake')}>
                          <ShieldAlert size={13} /><span>Fake</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {order.status === 'Confirmed' && (
                  <div className="mob-card-actions" onClick={(e) => e.stopPropagation()}>
                    <button
                      className="elite-btn-primary"
                      style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', boxShadow: 'none', border: '1px solid var(--glass-border)' }}
                      onClick={(e) => { e.stopPropagation(); handleOpenEditModal(order); }}
                    >
                      <Edit2 size={14} /> Edit Order
                    </button>
                  </div>
                )}

              </div>
            );
          })}

          {filteredOrders.length === 0 && (
            <div className="elite-empty-card">
              No orders found matching the filter criteria.
            </div>
          )}
        </div>
      </div>

      {/* â”€â”€ 5. Footer Pagination â”€â”€ */}
      {filteredOrders.length > 0 && (
        <div className="elite-pagination-footer">
          <div className="elite-pagination-stats">
            Showing {(currentPage - 1) * CALL_TASKS_PER_PAGE + 1}-
            {Math.min(currentPage * CALL_TASKS_PER_PAGE, filteredOrders.length)} of {filteredOrders.length} active call tasks
          </div>
          <div className="elite-pagination-controls">
            <button
              className="elite-page-btn"
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
            >
              &lt;
            </button>
            {visiblePages.map((pageNumber) => (
              <button
                key={pageNumber}
                className={`elite-page-btn ${currentPage === pageNumber ? 'active' : ''}`}
                onClick={() => setCurrentPage(pageNumber)}
              >
                {pageNumber}
              </button>
            ))}
            <button
              className="elite-page-btn"
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
            >
              &gt;
            </button>
          </div>
        </div>
      )}

      {/* Modals */}
      <OrderEditModal 
        isOpen={isEditModalOpen} 
        onClose={() => setIsEditModalOpen(false)} 
        order={selectedOrder} 
      />

      <OrderDetailsModal 
        isOpen={isDetailsModalOpen} 
        onClose={() => setIsDetailsModalOpen(false)} 
        order={selectedOrder}
        onEdit={handleOpenEditModal}
      />

      <Modal
        isOpen={Boolean(pendingNoteAction)}
        onClose={closeActionNoteModal}
        title={pendingNoteAction ? pendingNoteAction.title : 'Add Note'}
        subtitle={pendingNoteAction ? `${pendingNoteAction.customerName} • #${pendingNoteAction.orderId.replace('ORD-', '')}` : ''}
      >
        <div className="call-action-note-modal">
          <label className="call-action-note-label" htmlFor="call-action-note">
            Save this note with the order before updating the call status.
          </label>
          <textarea
            id="call-action-note"
            className="call-action-note-input"
            value={actionNote}
            onChange={(e) => setActionNote(e.target.value)}
            placeholder={pendingNoteAction?.placeholder || 'Write an important customer note'}
            rows={5}
            autoFocus
          />
          <div className="call-action-note-footer">
            <button
              type="button"
              className="call-note-btn secondary"
              onClick={closeActionNoteModal}
              disabled={isSubmittingAction}
            >
              Cancel
            </button>
            <button
              type="button"
              className="call-note-btn primary"
              onClick={submitActionWithNote}
              disabled={isSubmittingAction || !actionNote.trim()}
            >
              {isSubmittingAction ? 'Saving...' : `Save & ${pendingNoteAction?.title || 'Update'}`}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

