import { useState } from 'react';
import { useOrders } from '../context/OrderContext';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Modal } from '../components/Modal';
import { OrderEditModal } from '../components/OrderEditModal';
import { Search, Truck, CheckCircle, Package, ClipboardCheck, Edit2 } from 'lucide-react';
import './CourierPanel.css';

export const CourierPanel = () => {
  const { orders, updateOrderStatus, editOrder } = useOrders();
  const [searchTerm, setSearchTerm] = useState('');

  // Modal State for Tracking ID
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeOrderId, setActiveOrderId] = useState(null);
  const [trackingIdInput, setTrackingIdInput] = useState('');

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedOrderForEdit, setSelectedOrderForEdit] = useState(null);

  const handleOpenEditModal = (order) => {
    setSelectedOrderForEdit(order);
    setIsEditModalOpen(true);
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
        <div className="mod-table-header">
          <div className="search-box">
            <Search size={18} className="filter-icon" />
            <input
              type="text"
              placeholder="Search by ID, name or phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="glass-input"
            />
          </div>
          <p className="queue-helper-text">
            Assign tracking first, then dispatch to courier.
          </p>
        </div>

        <div className="table-container">
          <table className="management-table">
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Customer</th>
                <th>Phone</th>
                <th>Product & Size</th>
                <th>Tracking ID</th>
                <th>Status</th>
                <th>Dispatch Actions</th>
              </tr>
            </thead>
            <tbody>
              {courierQueue.map(order => (
                <tr key={order.id}>
                  <td className="order-id-cell">{order.id}</td>
                  <td className="customer-name">{order.customer_name}</td>
                  <td className="phone-cell">{order.phone}</td>
                  <td className="product-name">
                    <div className="product-stack">
                      <span>{order.product_name}</span>
                      {order.size && <span className="product-size-pill">Size {order.size}</span>}
                    </div>
                  </td>
                  <td className="tracking-cell">
                    {order.tracking_id ? (
                      <span className="tracking-badge">
                        <Truck size={14} /> {order.tracking_id}
                      </span>
                    ) : (
                      <span className="text-tertiary text-sm italic">Not Assigned</span>
                    )}
                  </td>
                  <td>
                    <Badge variant="courier-ready">{order.status}</Badge>
                  </td>
                  <td>
                    <div className="dispatch-action-grid">
                      <button
                        className="courier-action-btn edit"
                        onClick={() => handleOpenEditModal(order)}
                        title="Edit Order Details"
                      >
                        <Edit2 size={16} /> <span>Edit</span>
                      </button>
                      <button
                        className="courier-action-btn tracking"
                        onClick={() => handleOpenTrackingModal(order)}
                        title="Add/Edit Tracking ID"
                      >
                        <Truck size={16} /> <span>Tracking</span>
                      </button>
                      <button
                        className="courier-action-btn submit"
                        onClick={() => handleSubmitToCourier(order.id)}
                        disabled={!order.tracking_id}
                        title={!order.tracking_id ? "Requires Tracking ID first" : "Submit to Courier"}
                      >
                        <CheckCircle size={16} /> <span>Dispatch</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {courierQueue.length === 0 && (
                <tr>
                  <td colSpan="7" className="empty-state-cell">
                    No stock-verified orders ready for dispatch. Orders must pass through Factory Panel first.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
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
        order={selectedOrderForEdit} 
      />
    </div>
  );
};
