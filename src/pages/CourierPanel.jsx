import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useOrders } from '../context/OrderContext';
import { useAuth } from '../context/AuthContext';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Modal } from '../components/Modal';
import { OrderEditModal } from '../components/OrderEditModal';
import { OrderDetailsModal } from '../components/OrderDetailsModal';
import { Search, Truck, CheckCircle, Package, ClipboardCheck, Edit2, Clock, Loader2, AlertTriangle } from 'lucide-react';
import { usePersistentState } from '../utils/persistentState';
import { useRouteOrderReadState } from '../hooks/useRouteOrderReadState';
import './CourierPanel.css';

const containerVariants = {
  hidden: { opacity: 0, y: 15 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { staggerChildren: 0.1, duration: 0.4, ease: [0.4, 0, 0.2, 1] }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0 }
};

export const CourierPanel = () => {
  const { orders, updateOrderStatus, editOrder, dispatchToCourier, autoDistributeOrders } = useOrders();
  const { updatePresenceContext } = useAuth();

  useEffect(() => {
    updatePresenceContext('Managing Bulk Exported Orders');
  }, [updatePresenceContext]);

  const [searchTerm, setSearchTerm] = usePersistentState('panel:courier:search', '');
  const [activeTab, setActiveTab] = usePersistentState('panel:courier:tab', 'bulk');
  const [dateFilter, setDateFilter] = usePersistentState('panel:courier:dateFilter', 'All');
  const [steadfastPending, setSteadfastPending] = useState({});
  const [steadfastSubmitted, setSteadfastSubmitted] = useState({});
  const [isDistributing, setIsDistributing] = useState(false);
  const [distributeResult, setDistributeResult] = useState(null);

  // Modal State for Tracking ID
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeOrderId, setActiveOrderId] = useState(null);
  const [trackingIdInput, setTrackingIdInput] = useState('');

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);

  const handleOpenEditModal = (order) => {
    setSelectedOrder(order);
    setIsEditModalOpen(true);
  };

  const handleRowClick = (order) => {
    markOrderRead(order);
    setSelectedOrder(order);
    setIsDetailsModalOpen(true);
  };

  const matchesDate = (order) => {
    if (dateFilter === 'All') return true;
    if (dateFilter === 'Today') {
      const today = new Date().toDateString();
      const orderDate = new Date(order.updated_at || order.created_at).toDateString();
      return today === orderDate;
    }
    return true;
  };

  const matchesSearch = (order) => (
    (order.id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (order.customer_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (order.phone || '').includes(searchTerm)
  );

  const filterOrder = (order) => matchesSearch(order) && matchesDate(order);

  const bulkExportedAll = orders.filter((order) => order.status === 'Bulk Exported');
  const courierReadyAll = orders.filter((order) => order.status === 'Courier Ready');
  const bulkExportedQueue = bulkExportedAll.filter(filterOrder);
  const courierReadyQueue = courierReadyAll.filter(filterOrder);
  const courierQueue = activeTab === 'bulk' ? bulkExportedQueue : courierReadyQueue;
  const { isOrderUnread, markOrderRead, unreadCount } = useRouteOrderReadState(`courier-panel:${activeTab}`, courierQueue);

  const withTrackingCount = courierReadyAll.filter(o => Boolean(o.tracking_id)).length;
  const pendingTrackingCount = courierReadyAll.length - withTrackingCount;

  const handleAutoDistribute = async () => {
    if (bulkExportedAll.length === 0) return;
    const confirmed = window.confirm(`Distribute ${bulkExportedAll.length} bulk exported orders to courier workflow?`);
    if (!confirmed) return;

    setIsDistributing(true);
    setDistributeResult(null);
    try {
      const result = await autoDistributeOrders('Bulk Exported');
      setDistributeResult(result);
      setActiveTab('ready');
      setTimeout(() => setDistributeResult(null), 8000);
    } catch (error) {
      console.error('Bulk exported distribution failed:', error);
      setDistributeResult({ error: error.message });
    } finally {
      setIsDistributing(false);
    }
  };

  const handleOpenTrackingModal = (order) => {
    setActiveOrderId(order.id);
    setTrackingIdInput(order.tracking_id || '');
    setIsModalOpen(true);
  };

  const handleSaveTracking = (e) => {
    e.preventDefault();
    if (activeOrderId && trackingIdInput) {
      editOrder(activeOrderId, { tracking_id: trackingIdInput });
    }
    setIsModalOpen(false);
  };

  const handleSubmitToCourier = (orderId) => {
    updateOrderStatus(orderId, 'Courier Submitted');
  };

  const handleSteadfastDispatch = async (e, order) => {
    e.stopPropagation();

    const orderId = order.id;
    if (steadfastPending[orderId] || steadfastSubmitted[orderId]) {
      return;
    }

    setSteadfastPending((prev) => ({ ...prev, [orderId]: true }));

    try {
      await dispatchToCourier(orderId);
      setSteadfastSubmitted((prev) => ({ ...prev, [orderId]: true }));
    } catch (err) {
      alert('Steadfast Dispatch Failed: ' + err.message);
    } finally {
      setSteadfastPending((prev) => {
        const next = { ...prev };
        delete next[orderId];
        return next;
      });
    }
  };

  return (
    <motion.div 
      className="courier-panel"
      initial="hidden"
      animate="visible"
      variants={containerVariants}
    >
      <header className="page-header">
        <div>
          <h1 className="premium-title">Bulk Exported</h1>
          <p className="page-subtitle">Review exported confirmed batches, then distribute eligible orders to courier dispatch.</p>
        </div>
        <div className="factory-header-actions">
          <Button
            variant="primary"
            onClick={handleAutoDistribute}
            disabled={isDistributing || bulkExportedAll.length === 0}
            className="auto-distribute-btn"
          >
            {isDistributing ? <Loader2 size={18} className="spin" /> : <Zap size={18} />}
            <span>Auto Distribute ({bulkExportedAll.length})</span>
          </Button>
          <div className="active-dispatch-stat">
            <Truck size={20} />
            <span>{courierReadyAll.length} Ready</span>
          </div>
        </div>
      </header>

      <AnimatePresence>
        {distributeResult && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className={`distribute-result-toast ${distributeResult.error ? 'error' : 'success'}`}
          >
            {distributeResult.error ? <AlertTriangle size={18} /> : <CheckCircle size={18} />}
            <span>
              {distributeResult.error ? `Error: ${distributeResult.error}` : (
                <>
                  Distribution complete: <strong>{distributeResult.distributed}</strong> ready, <strong>{distributeResult.queued}</strong> queued.
                </>
              )}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="courier-summary-grid">
        <motion.div variants={itemVariants}>
          <Card className="courier-summary-card" noPadding>
            <div className="courier-summary-card-inner">
              <div className="courier-summary-icon total"><Package size={22} /></div>
              <div>
                <p className="courier-summary-label">Bulk Exported</p>
                <p className="courier-summary-value">{bulkExportedAll.length}</p>
              </div>
            </div>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Card className="courier-summary-card" noPadding>
            <div className="courier-summary-card-inner">
              <div className="courier-summary-icon assigned"><ClipboardCheck size={22} /></div>
              <div>
                <p className="courier-summary-label">Courier Ready</p>
                <p className="courier-summary-value">{courierReadyAll.length}</p>
              </div>
            </div>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Card className="courier-summary-card" noPadding>
            <div className="courier-summary-card-inner">
              <div className="courier-summary-icon pending"><Clock size={22} /></div>
              <div>
                <p className="courier-summary-label">Unassigned</p>
                <p className="courier-summary-value">{pendingTrackingCount}</p>
              </div>
            </div>
          </Card>
        </motion.div>
      </div>

      <div className="courier-tabs-container">
        <button
          type="button"
          className={`courier-tab ${activeTab === 'bulk' ? 'active' : ''}`}
          onClick={() => setActiveTab('bulk')}
        >
          <Package size={15} /> Bulk Exported ({bulkExportedAll.length})
        </button>
        <button
          type="button"
          className={`courier-tab ${activeTab === 'ready' ? 'active' : ''}`}
          onClick={() => setActiveTab('ready')}
        >
          <Truck size={15} /> Courier Ready ({courierReadyAll.length})
        </button>
      </div>

      <Card className="table-card" noPadding>
        <div className="table-search-bar">
          <div className="elite-search-wrapper">
            <Search className="elite-search-icon" size={18} />
            <input
              type="text"
              placeholder="Search ID, recipient or phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="elite-search-input"
            />
          </div>
          <div className="courier-date-filter" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              type="button"
              className={`pill-btn ${dateFilter === 'All' ? 'active' : ''}`}
              onClick={() => setDateFilter('All')}
              style={{
                padding: '4px 14px',
                borderRadius: '20px',
                fontSize: '0.8rem',
                border: '1px solid var(--border-color)',
                background: dateFilter === 'All' ? '#6366f1' : 'transparent',
                color: dateFilter === 'All' ? '#fff' : 'inherit',
                cursor: 'pointer',
                fontWeight: dateFilter === 'All' ? '600' : '400',
                transition: 'all 0.2s'
              }}
            >
              All Time
            </button>
            <button
              type="button"
              className={`pill-btn ${dateFilter === 'Today' ? 'active' : ''}`}
              onClick={() => setDateFilter('Today')}
              style={{
                padding: '4px 14px',
                borderRadius: '20px',
                fontSize: '0.8rem',
                border: '1px solid var(--border-color)',
                background: dateFilter === 'Today' ? '#6366f1' : 'transparent',
                color: dateFilter === 'Today' ? '#fff' : 'inherit',
                cursor: 'pointer',
                fontWeight: dateFilter === 'Today' ? '600' : '400',
                transition: 'all 0.2s'
              }}
            >
              Today
            </button>
          </div>
          <div className="queue-helper-text">
            <Truck size={14} />
            <span>Target verified inventory</span>
          </div>
          {unreadCount > 0 && (
            <span className="route-unread-count-pill" title="Orders not opened in Courier route">
              {unreadCount} unread
            </span>
          )}
        </div>

        <div className="courier-table-wrapper desktop-only">
          <table className="courier-management-table">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Recipient</th>
                <th>Product Package</th>
                <th>Tracking ID</th>
                <th>Phase</th>
                <th className="courier-actions-col">Control</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence mode="popLayout">
                {courierQueue.map(order => {
                  const isBulkExported = order.status === 'Bulk Exported';
                  const isSteadfastSending = Boolean(steadfastPending[order.id]);
                  const isSteadfastSubmitted = Boolean(steadfastSubmitted[order.id]);
                  const isSteadfastLocked =
                    isBulkExported ||
                    isSteadfastSending ||
                    isSteadfastSubmitted ||
                    order.status === 'Courier Submitted' ||
                    Boolean(order.courier_assigned_id) ||
                    order.courier_name === 'Steadfast';

                  return (
                    <motion.tr 
                      key={order.id} 
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className={`courier-order-row cursor-pointer ${isOrderUnread(order) ? 'route-unread-row' : ''}`}
                      onClick={() => handleRowClick(order)}
                    >
                      <td className="order-id-cell">
                        <div className="route-read-card-header">
                          {isOrderUnread(order) && <span className="route-unread-dot" aria-label="Unread order" />}
                          <span className="saas-id">#{(order.id || '').replace('ORD-', '')}</span>
                          {isOrderUnread(order) && <span className="route-unread-chip">New</span>}
                        </div>
                      </td>
                      <td>
                        <div className="courier-customer-stack">
                          <span className="saas-text-dark">{order.customer_name}</span>
                          <span className="saas-text">{order.phone}</span>
                        </div>
                      </td>
                      <td>
                        <div className="courier-product-stack">
                          <span className="saas-text-dark">{order.product_name}</span>
                          {order.size && <span className="product-size-pill">T-{order.size}</span>}
                        </div>
                      </td>
                      <td>
                        {order.tracking_id ? (
                          <span className="tracking-badge">
                            <Truck size={12} /> {order.tracking_id}
                          </span>
                        ) : (
                          <span className="text-tertiary text-xs italic">Awaiting...</span>
                        )}
                      </td>
                      <td>
                        <Badge variant={isBulkExported ? 'bulk-exported' : 'courier-ready'} className="courier-status-pill">
                          {isBulkExported ? 'Bulk Exported' : 'Ready'}
                        </Badge>
                      </td>
                      <td className="courier-actions-cell">
                        <div className="dispatch-action-grid">
                          <button
                            className="courier-action-btn edit"
                            onClick={(e) => { e.stopPropagation(); handleOpenEditModal(order); }}
                            title="Adjust Details"
                          >
                            <Edit2 size={14} /> <span>Edit</span>
                          </button>
                          {!isBulkExported && (
                            <>
                              <button
                                className="courier-action-btn tracking"
                                onClick={(e) => { e.stopPropagation(); handleOpenTrackingModal(order); }}
                                title="Assign Tracking"
                              >
                                <Truck size={14} /> <span>Track</span>
                              </button>
                              <button
                                className={`courier-action-btn steadfast ${isSteadfastSending ? 'is-loading' : ''} ${isSteadfastSubmitted ? 'is-submitted' : ''}`}
                                onClick={(e) => handleSteadfastDispatch(e, order)}
                                disabled={isSteadfastLocked}
                                title="Direct API Dispatch"
                              >
                                {isSteadfastSending ? <Clock size={14} className="spin" /> : <Zap size={14} />}
                                <span>{isSteadfastSending ? '...' : isSteadfastSubmitted ? 'Sent' : 'S-Fast'}</span>
                              </button>
                              <button
                                className="courier-action-btn submit"
                                onClick={(e) => { e.stopPropagation(); handleSubmitToCourier(order.id); }}
                                disabled={!order.tracking_id || isSteadfastSending}
                                title="Mark as Dispatched"
                              >
                                <CheckCircle size={14} /> <span>Submit</span>
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
              {courierQueue.length === 0 && (
                <tr>
                  <td colSpan="6" className="empty-state-cell">
                    <div className="empty-state-content">
                      <Truck size={40} style={{ opacity: 0.2, marginBottom: '12px' }} />
                      <p>{activeTab === 'bulk' ? 'No bulk exported orders waiting for distribution.' : 'No verified orders ready for dispatch.'}</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="courier-mobile-list mobile-only">
          <AnimatePresence>
            {courierQueue.map(order => {
              const isBulkExported = order.status === 'Bulk Exported';

              return (
                <motion.div
                  key={order.id}
                  layout
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  className={`courier-mobile-card ${isOrderUnread(order) ? 'route-unread-card' : ''}`}
                  onClick={() => handleRowClick(order)}
                >
                  <div className="card-header-elite">
                    <div className="route-read-card-header">
                      {isOrderUnread(order) && <span className="route-unread-dot" aria-label="Unread order" />}
                      <span className="order-id">#{order.id.replace('ORD-', '')}</span>
                      {isOrderUnread(order) && <span className="route-unread-chip">New</span>}
                    </div>
                    <Badge variant={isBulkExported ? 'bulk-exported' : 'courier-ready'}>
                      {isBulkExported ? 'Bulk Exported' : 'Ready'}
                    </Badge>
                  </div>

                  <div className="customer-primary-box">
                    <h3 className="customer-name-large">{order.customer_name}</h3>
                    <div className="phone-row">{order.phone}</div>
                  </div>

                  <div className="details-grid-elite">
                    <div className="detail-box-elite">
                      <span className="detail-label">Product</span>
                      <span className="detail-value product">{order.product_name}</span>
                      {order.size && <span className="detail-subvalue">Size {order.size}</span>}
                    </div>
                    <div className="detail-box-elite">
                      <span className="detail-label">Tracking</span>
                      <span className="detail-value">{isBulkExported ? 'Awaiting distribution' : (order.tracking_id || 'Awaiting')}</span>
                    </div>
                  </div>

                  <div className="courier-mobile-actions" onClick={(e) => e.stopPropagation()}>
                    <button className="courier-action-btn edit" onClick={() => handleOpenEditModal(order)}>
                      <Edit2 size={16} /> <span>Edit</span>
                    </button>
                    {!isBulkExported && (
                      <>
                        <button className="courier-action-btn tracking" onClick={() => handleOpenTrackingModal(order)}>
                          <Truck size={16} /> <span>Track</span>
                        </button>
                        <button
                          className="courier-action-btn submit"
                          onClick={() => handleSubmitToCourier(order.id)}
                          disabled={!order.tracking_id}
                        >
                          <CheckCircle size={16} /> <span>Submit</span>
                        </button>
                      </>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
          {courierQueue.length === 0 && (
            <div className="empty-state-cell">
              <p>{activeTab === 'bulk' ? 'No bulk exported orders waiting for distribution.' : 'No verified orders ready for dispatch.'}</p>
            </div>
          )}
        </div>
      </Card>

      {/* Tracking ID Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Assign Courier Tracking"
      >
        <form onSubmit={handleSaveTracking} className="tracking-form">
          <div className="mb-4">
            <p className="saas-text" style={{ fontSize: '0.88rem', lineHeight: '1.6' }}>
              Enter the tracking identifier for <strong>#{(activeOrderId || '').replace('ORD-', '')}</strong>. 
              This will enable the final dispatch action.
            </p>
          </div>
          <Input
            label="Courier Tracking ID"
            placeholder="e.g. S-FAST-9921102"
            value={trackingIdInput}
            onChange={e => setTrackingIdInput(e.target.value)}
            required
            autoFocus
          />
          <div className="form-actions mt-4">
            <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>
              Discard
            </Button>
            <Button type="submit" variant="primary">
              Assign Identifier
            </Button>
          </div>
        </form>
      </Modal>

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
    </motion.div>
  );
};

// Internal icon for Steadfast
const Zap = ({ size, className }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2.5" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);
