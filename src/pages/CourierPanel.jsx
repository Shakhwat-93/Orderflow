import { useState } from 'react';
import { useOrders } from '../context/OrderContext';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Modal } from '../components/Modal';
import { OrderEditModal } from '../components/OrderEditModal';
import { OrderDetailsModal } from '../components/OrderDetailsModal';
import { Search, Truck, CheckCircle, Package, ClipboardCheck, Edit2, ShieldCheck, ShieldAlert, Shield, RotateCcw, Clock, UserCheck } from 'lucide-react';
import { usePersistentState } from '../utils/persistentState';
import './CourierPanel.css';

export const CourierPanel = () => {
  const { orders, updateOrderStatus, editOrder, dispatchToCourier } = useOrders();
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
    <div className="courier-panel">
      <div className="page-header">
        <div>
          <h1>Courier Panel</h1>
          <p>Assign tracking IDs and dispatch stock-verified orders to the delivery team.</p>
        </div>
        <div className="active-dispatch-stat">
          <Package size={20} className="text-secondary" />
          <span>{courierQueue.length} Ready for Dispatch</span>
        </div>
      </div>

      <div className="courier-summary-grid">
        <Card className="courier-summary-card" noPadding>
          <div className="courier-summary-card-inner">
            <div className="courier-summary-icon total">
              <Package size={18} />
            </div>
            <div>
              <p className="courier-summary-label">Ready Queue</p>
              <p className="courier-summary-value">{courierQueue.length}</p>
            </div>
          </div>
        </Card>

        <Card className="courier-summary-card" noPadding>
          <div className="courier-summary-card-inner">
            <div className="courier-summary-icon assigned">
              <ClipboardCheck size={18} />
            </div>
            <div>
              <p className="courier-summary-label">Tracking Assigned</p>
              <p className="courier-summary-value">{withTrackingCount}</p>
            </div>
          </div>
        </Card>

        <Card className="courier-summary-card" noPadding>
          <div className="courier-summary-card-inner">
            <div className="courier-summary-icon pending">
              <Truck size={18} />
            </div>
            <div>
              <p className="courier-summary-label">Pending Tracking</p>
              <p className="courier-summary-value">{pendingTrackingCount}</p>
            </div>
          </div>
        </Card>
      </div>

      <Card className="table-card liquid-glass" noPadding>
        <div className="table-search-bar">
          <div className="elite-search-wrapper">
            <Search className="elite-search-icon" size={18} />
            <input
              type="text"
              placeholder="Search by ID, name or phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="elite-search-input"
            />
          </div>
          <p className="queue-helper-text">
            <Truck size={14} style={{ display: 'inline', marginRight: '6px' }} />
            Assign tracking ID first, then dispatch to courier.
          </p>
        </div>

        <div className="orders-table-wrapper courier-table-wrapper desktop-only">
          <table className="management-table premium-table courier-management-table">
            <thead>
              <tr>
                <th className="id-col">Order ID</th>
                <th className="customer-col">Customer</th>
                <th className="product-col">Product & Size</th>
                <th className="tracking-col">Tracking ID</th>
                <th className="status-col">Status</th>
                <th className="courier-actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {courierQueue.map(order => (
                <tr key={order.id} className="order-row courier-order-row cursor-pointer" onClick={() => handleRowClick(order)}>
                  {(() => {
                    const isSteadfastSending = Boolean(steadfastPending[order.id]);
                    const isSteadfastSubmitted = Boolean(steadfastSubmitted[order.id]);
                    const isSteadfastLocked =
                      isSteadfastSending ||
                      isSteadfastSubmitted ||
                      order.status === 'Courier Submitted' ||
                      Boolean(order.courier_assigned_id) ||
                      order.courier_name === 'Steadfast';

                    return (
                      <>
                  <td className="id-cell order-id-cell">
                    <span className="saas-id">#{(order.id || '').replace('ORD-', '')}</span>
                  </td>
                  <td className="customer-cell">
                    <div className="courier-customer-stack">
                      <span className="saas-text-dark">{order.customer_name}</span>
                      <span className="saas-text">{order.phone}</span>
                    </div>
                  </td>
                  <td className="product-col product-name">
                    <div className="courier-product-stack">
                      <span className="saas-text-dark">{order.product_name}</span>
                      {order.size && <span className="product-size-pill">Size {order.size}</span>}
                    </div>
                  </td>
                  <td className="tracking-col tracking-cell">
                    {order.tracking_id ? (
                      <span className="tracking-badge">
                        <Truck size={14} /> {order.tracking_id}
                      </span>
                    ) : (
                      <span className="text-tertiary text-sm italic">Not Assigned</span>
                    )}
                  </td>
                  <td className="status-cell">
                    <Badge variant="courier-ready" className="courier-status-pill">{order.status}</Badge>
                  </td>
                  <td className="courier-actions-cell">
                    <div className="dispatch-action-grid">
                      <button
                        className="courier-action-btn edit"
                        onClick={(e) => { e.stopPropagation(); handleOpenEditModal(order); }}
                        title="Edit Order Details"
                      >
                        <Edit2 size={16} /> <span>Edit</span>
                      </button>
                      <button
                        className="courier-action-btn tracking"
                        onClick={(e) => { e.stopPropagation(); handleOpenTrackingModal(order); }}
                        title="Add/Edit Tracking ID"
                      >
                        <Truck size={16} /> <span>Tracking</span>
                      </button>
                      <button
                        className={`courier-action-btn steadfast ${isSteadfastSending ? 'is-loading' : ''} ${isSteadfastSubmitted ? 'is-submitted' : ''}`}
                        onClick={(e) => handleSteadfastDispatch(e, order)}
                        disabled={isSteadfastLocked}
                        title="Submit to Steadfast API"
                      >
                        {isSteadfastSending ? <Clock size={16} /> : <Truck size={16} />}
                        <span>
                          {isSteadfastSending ? 'Sending...' : isSteadfastSubmitted ? 'Sent' : 'Steadfast'}
                        </span>
                      </button>
                      <button
                        className="courier-action-btn submit"
                        onClick={(e) => { e.stopPropagation(); handleSubmitToCourier(order.id); }}
                        disabled={!order.tracking_id || isSteadfastSending}
                        title={!order.tracking_id ? "Requires Tracking ID first" : "Submit to Courier"}
                      >
                        <CheckCircle size={16} /> <span>Dispatch</span>
                      </button>
                    </div>
                  </td>
                      </>
                    );
                  })()}
                </tr>
              ))}
              {courierQueue.length === 0 && (
                <tr>
                  <td colSpan="6" className="empty-state-cell">
                    No stock-verified orders ready for dispatch. Orders must pass through Factory Panel first.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="courier-mobile-list mobile-only">
          {courierQueue.map(order => (
            <div
              key={order.id}
              className="order-mobile-card courier-mobile-card"
              onClick={() => handleRowClick(order)}
            >
              <div className="card-header-elite">
                <div className="id-group">
                  <span className="order-id">#{order.id.replace('ORD-', '')}</span>
                </div>
                <Badge variant="courier-ready">{order.status}</Badge>
              </div>

              <div className="card-body-elite">
                <div className="customer-primary-box">
                  <h3 className="customer-name-large">{order.customer_name}</h3>
                  <div className="phone-row">
                    <span>{order.phone}</span>
                  </div>
                </div>

                <div className="details-grid-elite">
                  <div className="detail-box-elite">
                    <span className="detail-label">Product</span>
                    <span className="detail-value product">{order.product_name}</span>
                    <span className="detail-subvalue">{order.size ? `Size ${order.size}` : 'No Size'}</span>
                  </div>
                  <div className="detail-box-elite">
                    <span className="detail-label">Tracking</span>
                    <span className="detail-value">{order.tracking_id || 'Not Assigned'}</span>
                    <span className="detail-subvalue">Ready to dispatch</span>
                  </div>
                </div>
              </div>

              <div className="courier-mobile-actions" onClick={(e) => e.stopPropagation()}>
                <button
                  className="courier-action-btn edit"
                  onClick={() => handleOpenEditModal(order)}
                >
                  <Edit2 size={16} /> <span>Edit</span>
                </button>
                <button
                  className="courier-action-btn tracking"
                  onClick={() => handleOpenTrackingModal(order)}
                >
                  <Truck size={16} /> <span>Tracking</span>
                </button>
              </div>
            </div>
          ))}
          {courierQueue.length === 0 && (
            <div className="mobile-empty-state">
              No stock-verified orders ready for dispatch.
            </div>
          )}
        </div>
      </Card>

      {/* Tracking ID Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Assign Tracking ID"
      >
        <form onSubmit={handleSaveTracking} className="tracking-form">
          <p className="text-secondary mb-4">
            Enter the courier tracking code for order <strong>{activeOrderId}</strong> to enable dispatching.
          </p>
          <Input
            label="Tracking ID"
            placeholder="e.g. STEADFAST-12345678"
            value={trackingIdInput}
            onChange={e => setTrackingIdInput(e.target.value)}
            required
            autoFocus
          />
          <div className="form-actions mt-4">
            <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Save Tracking
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
    </div>
  );
};
