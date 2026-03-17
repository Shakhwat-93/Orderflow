import { useState, useRef } from 'react';
import { useOrders } from '../context/OrderContext';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { OrderRow } from '../components/OrderRow';
import { DateRangePicker } from '../components/DateRangePicker';
import { Search, PhoneCall, CheckCircle, XCircle, Clock, PhoneMissed, Globe, ChevronLeft, ChevronRight } from 'lucide-react';
import './CallTeamPanel.css';

const PRODUCT_CHECKPOINTS = [
  { id: 'all', name: 'All Products', color: '#64748b' },
  { id: 'toybox', name: 'TOY BOX', color: '#f97316' },
  { id: 'organizer', name: 'ORGANIZER', color: '#059669' },
  { id: 'travelbag', name: 'Travel bag', color: '#1d4ed8' },
  { id: 'toyboxorg', name: 'TOY BOX + ORG', color: '#5b21b6' },
  { id: 'gymbag', name: 'Gym bag', color: '#b91c1c' },
  { id: 'vlogger', name: 'VLOGGER FOR FREE', color: '#334155' },
  { id: 'mmb', name: 'MMB', color: '#c084fc' },
  { id: 'quran', name: 'Quran', color: '#84cc16' },
  { id: 'waistbag', name: 'WAIST BAG', color: '#134e4a' },
  { id: 'bagpack', name: 'BAGPACK', color: '#3b82f6' },
  { id: 'moshari', name: 'Moshari', color: '#22c55e' }
];

const STATUS_OPTIONS = ['All', 'New', 'Pending Call', 'Confirmed', 'Cancelled'];
const SOURCES = ['Website', 'Facebook', 'Instagram', 'Direct'];

export const CallTeamPanel = () => {
  const { orders, stats, updateOrderStatus } = useOrders();

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [productFilter, setProductFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('All');
  const [dateRange, setDateRange] = useState({ start: null, end: null });

  // Scroll refs
  const statusTabsRef = useRef(null);
  const checkpointsRef = useRef(null);

  const scrollContainer = (ref, direction) => {
    if (ref.current) {
      ref.current.scrollBy({ left: direction === 'left' ? -200 : 200, behavior: 'smooth' });
    }
  };

  // Apply all filters — Call team primarily sees New & Pending Call, but can view all with tabs
  const filteredOrders = orders.filter(o => {
    const term = searchTerm.toLowerCase();
    const matchesSearch = !searchTerm ||
      (o.id || '').toLowerCase().includes(term) ||
      (o.customer_name || '').toLowerCase().includes(term) ||
      (o.phone || '').includes(term) ||
      (o.product_name || '').toLowerCase().includes(term);

    const matchesStatus = statusFilter === 'All'
      ? ['New', 'Pending Call', 'Confirmed', 'Cancelled'].includes(o.status)
      : o.status === statusFilter;

    const matchesProduct = !productFilter || o.product_name === productFilter;
    const matchesSource = sourceFilter === 'All' || o.source === sourceFilter;

    let matchesDate = true;
    if (dateRange.start && dateRange.end) {
      const orderDate = new Date(o.created_at);
      matchesDate = orderDate >= new Date(dateRange.start) && orderDate <= new Date(dateRange.end);
    }

    return matchesSearch && matchesStatus && matchesProduct && matchesSource && matchesDate;
  });

  const pendingCount = orders.filter(o => ['New', 'Pending Call'].includes(o.status)).length;
  const confirmedToday = typeof stats?.confirmedTodayCount === 'number'
    ? stats.confirmedTodayCount
    : orders.filter(o => {
      const today = new Date().toDateString();
      return o.status === 'Confirmed' && new Date(o.updated_at || o.created_at).toDateString() === today;
    }).length;

  const handleAction = (orderId, action) => {
    switch (action) {
      case 'confirm': updateOrderStatus(orderId, 'Confirmed'); break;
      case 'cancel': updateOrderStatus(orderId, 'Cancelled'); break;
      case 'not_reachable': updateOrderStatus(orderId, 'Pending Call'); break;
      case 'schedule_followup': updateOrderStatus(orderId, 'Pending Call'); break;
      default: break;
    }
  };

  return (
    <div className="call-team-panel">
      <div className="page-header">
        <div>
          <h1>Call Team Panel</h1>
          <p>Process new orders, handle customer confirmations, and schedule follow-ups.</p>
        </div>
        <div className="call-stats-row">
          <div className="call-stat-badge pending">
            <PhoneCall size={16} /> {pendingCount} In Queue
          </div>
          <div className="call-stat-badge confirmed">
            <CheckCircle size={16} /> {confirmedToday} Confirmed Today
          </div>
        </div>
      </div>

      {/* Status Tabs */}
      <div className="scrollable-strip-wrapper">
        <button className="strip-arrow left" onClick={() => scrollContainer(statusTabsRef, 'left')}><ChevronLeft size={16} /></button>
        <div className="status-tabs-bar" ref={statusTabsRef}>
          {STATUS_OPTIONS.map(tab => (
            <button key={tab} className={`status-tab ${statusFilter === tab ? 'active' : ''}`} onClick={() => setStatusFilter(tab)}>
              {tab === 'All' ? 'All Relevant' : tab}
              {tab === 'New' && <span className="tab-dot pulse"></span>}
            </button>
          ))}
        </div>
        <button className="strip-arrow right" onClick={() => scrollContainer(statusTabsRef, 'right')}><ChevronRight size={16} /></button>
      </div>

      {/* Unified Filter Bar */}
      <div className="unified-filter-bar">
        <div className="filter-search">
          <Search size={16} className="search-icon" />
          <input type="text" placeholder="Search ID, name or phone..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </div>
        <div className="filter-divider" />
        <div className="filter-select-group">
          <Globe size={14} className="select-icon" />
          <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
            <option value="All">All Sources</option>
            {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="filter-divider" />
        <DateRangePicker value={dateRange} onChange={setDateRange} />
      </div>

      {/* Product Checkpoints */}
      <div className="scrollable-strip-wrapper">
        <button className="strip-arrow left" onClick={() => scrollContainer(checkpointsRef, 'left')}><ChevronLeft size={16} /></button>
        <div className="product-checkpoints-strip" ref={checkpointsRef}>
          {PRODUCT_CHECKPOINTS.map(p => (
            <button
              key={p.id}
              className={`checkpoint-pill ${productFilter === (p.id === 'all' ? '' : p.name) ? 'active' : ''}`}
              style={{ '--pill-color': p.color, '--pill-bg': p.id === 'all' ? '#f1f5f9' : `${p.color}10`, '--pill-border': p.id === 'all' ? '#e2e8f0' : `${p.color}25` }}
              onClick={() => setProductFilter(p.id === 'all' ? '' : p.name)}
            >
              <span className="dot" style={{ backgroundColor: p.color }}></span>
              {p.name}
            </button>
          ))}
        </div>
        <button className="strip-arrow right" onClick={() => scrollContainer(checkpointsRef, 'right')}><ChevronRight size={16} /></button>
      </div>

      {/* Orders Table with Call Actions */}
      <Card className="table-card liquid-glass" noPadding>
        <div className="mod-table-header">
          <span className="order-count-badge">{filteredOrders.length} orders</span>
        </div>
        <div className="table-container">
          <table className="management-table">
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Customer</th>
                <th>Phone</th>
                <th>Product</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Call Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map(order => (
                <tr key={order.id} className="order-row">
                  <td className="order-id-cell">#{(order.id || '').replace('ORD-', '')}</td>
                  <td className="customer-name">{order.customer_name}</td>
                  <td className="phone-cell">
                    <a href={`tel:${order.phone}`} className="phone-link">
                      <PhoneCall size={14} /> {order.phone}
                    </a>
                  </td>
                  <td className="product-name">
                    {order.product_name}
                    {order.size && <span className="size-tag">{order.size}</span>}
                  </td>
                  <td className="amount-cell-text">৳{Number(order.amount || 0).toLocaleString()}</td>
                  <td>
                    <Badge variant={
                      order.status === 'New' ? 'new' :
                        order.status === 'Pending Call' ? 'pending-call' :
                          order.status === 'Confirmed' ? 'confirmed' :
                            order.status === 'Cancelled' ? 'cancelled' : 'default'
                    }>
                      {order.status}
                    </Badge>
                  </td>
                  <td>
                    {['New', 'Pending Call'].includes(order.status) ? (
                      <div className="call-action-grid">
                        <button className="call-action-btn confirm" onClick={() => handleAction(order.id, 'confirm')} title="Confirm">
                          <CheckCircle size={16} /> <span>Confirm</span>
                        </button>
                        <button className="call-action-btn cancel" onClick={() => handleAction(order.id, 'cancel')} title="Cancel">
                          <XCircle size={16} /> <span>Cancel</span>
                        </button>
                        <button className="call-action-btn not-reachable" onClick={() => handleAction(order.id, 'not_reachable')} title="No Answer">
                          <PhoneMissed size={16} /> <span>No Answer</span>
                        </button>
                        <button className="call-action-btn follow-up" onClick={() => handleAction(order.id, 'schedule_followup')} title="Follow Up">
                          <Clock size={16} /> <span>Follow Up</span>
                        </button>
                      </div>
                    ) : (
                      <span className="action-done">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {filteredOrders.length === 0 && (
                <tr>
                  <td colSpan="7" className="empty-state-cell">
                    No orders in the call queue. Great job! 🎉
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};
