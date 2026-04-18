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
import { Search, Truck, CheckCircle, Package, ClipboardCheck, Edit2, Clock, Trash2 } from 'lucide-react';
import { usePersistentState } from '../utils/persistentState';
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
  const { orders, updateOrderStatus, editOrder, dispatchToCourier } = useOrders();
  const { updatePresenceContext } = useAuth();

  useEffect(() => {
    updatePresenceContext('Dispatching Orders');
  }, [updatePresenceContext]);

  const [searchTerm, setSearchTerm] = usePersistentState('panel:courier:search', '');
  const [steadfastPending, setSteadfastPending] = useState({});
  const [steadfastSubmitted, setSteadfastSubmitted] = useState({});

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
    setSelectedOrder(order);
    setIsDetailsModalOpen(true);
  };

  // Show only Courier Ready orders (factory-approved, stock verified)
  const courierQueue = orders.filter(
    o => o.status === 'Courier Ready' &&
      ((o.id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (o.customer_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (o.phone || '').includes(searchTerm))
  );

  const withTrackingCount = courierQueue.filter(o => Boolean(o.tracking_id)).length;
  const pendingTrackingCount = courierQueue.length - withTrackingCount;

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
          <h1 className="premium-title">Courier Panel</h1>
          <p className="page-subtitle">Assign tracking IDs and dispatch stock-verified orders.</p>
        </div>
        <div className="active-dispatch-stat">
          <Truck size={20} />
          <span>{courierQueue.length} Ready for Dispatch</span>
        </div>
      </header>

      <div className="courier-summary-grid">
        <motion.div variants={itemVariants}>
          <Card className="courier-summary-card" noPadding>
            <div className="courier-summary-card-inner">
              <div className="courier-summary-icon total"><Package size={22} /></div>
              <div>
                <p className="courier-summary-label">Ready Queue</p>
                <p className="courier-summary-value">{courierQueue.length}</p>
              </div>
            </div>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Card className="courier-summary-card" noPadding>
            <div className="courier-summary-card-inner">
              <div className="courier-summary-icon assigned"><ClipboardCheck size={22} /></div>
              <div>
                <p className="courier-summary-label">Assigned</p>
                <p className="courier-summary-value">{withTrackingCount}</p>
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
          <div className="queue-helper-text">
            <Truck size={14} />
            <span>Target verified inventory</span>
          </div>
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
                  const isSteadfastSending = Boolean(steadfastPending[order.id]);
                  const isSteadfastSubmitted = Boolean(steadfastSubmitted[order.id]);
                  const isSteadfastLocked =
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
                      className="courier-order-row cursor-pointer" 
                      onClick={() => handleRowClick(order)}
                    >
                      <td className="order-id-cell">
                        <span className="saas-id">#{(order.id || '').replace('ORD-', '')}</span>
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
                        <Badge variant="courier-ready" className="courier-status-pill">Ready</Badge>
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
                      <p>No verified orders ready for dispatch.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="courier-mobile-list mobile-only">
          <AnimatePresence>
            {courierQueue.map(order => (
              <motion.div
                key={order.id}
                layout
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="courier-mobile-card"
                onClick={() => handleRowClick(order)}
              >
                <div className="card-header-elite">
                  <span className="order-id">#{order.id.replace('ORD-', '')}</span>
                  <Badge variant="courier-ready">Ready</Badge>
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
                    <span className="detail-value">{order.tracking_id || 'Awaiting'}</span>
                  </div>
                </div>

                <div className="courier-mobile-actions" onClick={(e) => e.stopPropagation()}>
                  <button className="courier-action-btn edit" onClick={() => handleOpenEditModal(order)}>
                    <Edit2 size={16} /> <span>Edit</span>
                  </button>
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
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          {courierQueue.length === 0 && (
            <div className="empty-state-cell">
              <p>No verified orders ready for dispatch.</p>
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
