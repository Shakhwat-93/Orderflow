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
import './CallTeamPanel.css';

const STATUS_OPTIONS = ['ALL ORDERS', 'NEW', 'PENDING', 'CONFIRMED', 'CANCELLED'];
const QUICK_CALL_STATUSES = [
  { id: 'busy', label: 'Busy', logLabel: 'Busy', icon: PhoneOff, tone: 'busy' },
  { id: 'not-pick', label: 'Not Pick', logLabel: 'Not Pick', icon: PhoneMissed, tone: 'not-pick' },
  { id: 'hold', label: 'Hold', logLabel: 'On Hold', icon: PauseCircle, tone: 'hold' }
];

export const CallTeamPanel = () => {
  const { orders, stats, inventory, updateOrderStatus, fetchOrders } = useOrders();
  const { user, profile, userRoles, updatePresenceContext } = useAuth();
  const productOptions = getProductOptions(inventory);

  useEffect(() => {
    updatePresenceContext('Managing Calls');
  }, [updatePresenceContext]);

  // Filters
  const [searchTerm, _setSearchTerm] = usePersistentState('panel:call-team:search', '');
  const [statusFilter, setStatusFilter] = usePersistentState('panel:call-team:status', 'ALL ORDERS');
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
  
  // Globabl Ratio Cache & Auto-fetch
  const { ratios, checkPhone } = useCourierRatio();

  const handleOpenEditModal = (order) => {
    setSelectedOrder(order);
    setIsEditModalOpen(true);
  };

  const handleRowClick = (order) => {
    setSelectedOrder(order);
    setIsDetailsModalOpen(true);
  };

  const handleLogAttempt = async (orderId, attemptStatus) => {
    setLoggingAttemptId(orderId);
    try {
      await api.logCallAttempt(orderId, attemptStatus, user.id, profile?.name || 'Call Team', userRoles);
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
        'ALL ORDERS': ['New', 'Pending Call', 'Confirmed', 'Cancelled'],
        'NEW': ['New'],
        'PENDING': ['Pending Call'],
        'CONFIRMED': ['Confirmed'],
        'CANCELLED': ['Cancelled']
      };

      const validStatuses = statusMap[statusFilter] || statusMap['ALL ORDERS'];
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

  // Auto-queue visible phones for Courier Ratio checking
  useEffect(() => {
    const unchecked = [...new Set(
      filteredOrders
        .map(o => o.phone)
        .filter(p => p && !ratios[p]?.fetched && !ratios[p]?.loading)
    )];
    unchecked.forEach(p => checkPhone(p));
  }, [filteredOrders, checkPhone, ratios]);

  // Metrics Calculations
  const pendingCount = orders.filter(o => ['New', 'Pending Call'].includes(o.status)).length;
  const confirmedToday = typeof stats?.confirmedTodayCount === 'number'
    ? stats.confirmedTodayCount
    : orders.filter(o => o.status === 'Confirmed' && new Date(o.updated_at || o.created_at).toDateString() === new Date().toDateString()).length;

  const handleAction = async (e, orderId, action) => {
    e.stopPropagation();
    switch (action) {
      case 'confirm': await updateOrderStatus(orderId, 'Confirmed'); break;
      case 'cancel': await updateOrderStatus(orderId, 'Cancelled'); break;
      case 'busy': await handleLogAttempt(orderId, 'Busy'); break;
      case 'not-pick': await handleLogAttempt(orderId, 'Not Pick'); break;
      case 'hold': await handleLogAttempt(orderId, 'On Hold'); break;
      default: break;
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
      
      {/* ── 1. Top Header Row ── */}
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

      {/* ── 2. Metric Cards Row ── */}
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

      {/* ── 3. Pill Filter Row ── */}
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

      {/* ── 4. Premium Card List ── */}
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
          {filteredOrders.slice(0, 10).map(order => {
            
            // Generate Mock Elite status for Timer based on created_at
            let slaClass = 'elapsed'; let slaIcon = <Clock size={12} />; let slaText = 'Just now';
            const minsAge = Math.floor((Date.now() - new Date(order.created_at).getTime()) / 60000);
            if (minsAge < 15) { slaClass = 'remaining'; slaIcon = <Clock size={12}/>; slaText = `${15 - minsAge}m REMAINING`; }
            else if (minsAge < 60) { slaClass = 'elapsed'; slaIcon = <CheckCircle size={12}/>; slaText = `${minsAge}m ELAPSED`; }
            else { slaClass = 'overdue'; slaIcon = <ShieldAlert size={12}/>; slaText = `! OVERDUE`; }

            // Trust Ratio extraction
            const rt = ratios[order.phone] || {};
            const successRatio = rt.ratio !== undefined ? rt.ratio : (order.phone ? '...' : '0');
            const showTrust = rt.fetched && rt.total > 0;
            const trustClass = successRatio > 70 ? 'high' : successRatio > 40 ? 'neutral' : 'low';

            // Status Badge Formatting
            let statusPill = 'neutral';
            if (order.status === 'New') statusPill = 'pending';
            if (order.status === 'Pending Call') statusPill = 'active';
            if (order.status === 'Cancelled') statusPill = 'urgent';

            return (
              <div key={order.id} className="elite-list-card" onClick={() => handleRowClick(order)}>
                
                <div className="elite-col-order">
                  #{order.id.replace('ORD-', '')}
                </div>

                <div className="elite-col-customer">
                  <div className="elite-avatar">{getInitials(order.customer_name)}</div>
                  <div className="elite-cust-info">
                    <span className="elite-cust-name">{order.customer_name}</span>
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
                  </div>
                </div>

                <div className="elite-col-product">
                  <span className="elite-prod-name">{order.product_name || 'Premium Item'}</span>
                  <span className="elite-prod-meta">{order.size ? `Variant: ${order.size}` : `Qty: ${order.quantity || 1} Units`}</span>
                </div>

                <div className="elite-col-amount">
                  ${Number(order.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
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
                  {(order.status === 'New' || order.status === 'Pending Call') && (
                    <div className="elite-action-dock">
                      <button className="elite-btn-primary" onClick={(e) => handleAction(e, order.id, 'confirm')}>
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
                              onClick={(e) => handleAction(e, order.id, item.id)}
                              disabled={isLoading}
                              style={{ opacity: isLoading ? 0.7 : 1, cursor: isLoading ? 'wait' : 'pointer' }}
                            >
                              {isLoading ? <Loader2 size={12} className="lucide-spin" /> : <Icon size={12} />}
                              <span>{isLoading ? 'Wait...' : item.label}</span>
                            </button>
                          );
                        })}
                        <button
                          className="elite-quick-chip cancel"
                          title="Cancel Order"
                          onClick={(e) => handleAction(e, order.id, 'cancel')}
                        >
                          <XCircle size={12} />
                          <span>Cancel</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {order.status === 'Confirmed' && (
                     <button className="elite-icon-btn" style={{opacity: 0.5}} onClick={(e) => { e.stopPropagation(); handleOpenEditModal(order); }}>
                       <Edit2 size={14} />
                     </button>
                  )}
                </div>

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

      {/* ── 5. Footer Pagination ── */}
      {filteredOrders.length > 0 && (
        <div className="elite-pagination-footer">
          <div className="elite-pagination-stats">
            Showing {Math.min(filteredOrders.length, 10)} of {filteredOrders.length} active call tasks
          </div>
          <div className="elite-pagination-controls">
            <button className="elite-page-btn">&lt;</button>
            <button className="elite-page-btn active">1</button>
            {Math.ceil(filteredOrders.length / 10) > 1 && <button className="elite-page-btn">2</button>}
            {Math.ceil(filteredOrders.length / 10) > 2 && <button className="elite-page-btn">3</button>}
            <button className="elite-page-btn">&gt;</button>
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
    </div>
  );
};
