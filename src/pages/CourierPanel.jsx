import { useState } from 'react';
import { useOrders } from '../context/OrderContext';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Modal } from '../components/Modal';
import { Search, Truck, CheckCircle, Package } from 'lucide-react';
import './CourierPanel.css';

export const CourierPanel = () => {
  const { orders, updateOrderStatus, editOrder } = useOrders();
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modal State for Tracking ID
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeOrderId, setActiveOrderId] = useState(null);
  const [trackingIdInput, setTrackingIdInput] = useState('');

  // Show only Confirmed orders
  const courierQueue = orders.filter(
    o => o.status === 'Confirmed' &&
    (o.id.toLowerCase().includes(searchTerm.toLowerCase()) || 
     o.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
     o.phone.includes(searchTerm))
  );

  const handleOpenTrackingModal = (order) => {
    setActiveOrderId(order.id);
    setTrackingIdInput(order.trackingId || '');
    setIsModalOpen(true);
  };

  const handleSaveTracking = (e) => {
    e.preventDefault();
    if (activeOrderId && trackingIdInput) {
      editOrder(activeOrderId, { trackingId: trackingIdInput });
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
          <p>Assign tracking IDs and dispatch confirmed orders to the delivery team.</p>
        </div>
        <div className="active-dispatch-stat">
          <Package size={20} className="text-secondary" />
          <span>{courierQueue.length} Ready for Dispatch</span>
        </div>
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
                  <td className="customer-name">{order.customerName}</td>
                  <td className="phone-cell">{order.phone}</td>
                  <td className="product-name">
                    {order.product} <span className="text-secondary text-sm">({order.size})</span>
                  </td>
                  <td className="tracking-cell">
                    {order.trackingId ? (
                      <span className="tracking-badge">
                        <Truck size={14} /> {order.trackingId}
                      </span>
                    ) : (
                      <span className="text-tertiary text-sm italic">Not Assigned</span>
                    )}
                  </td>
                  <td>
                    <Badge variant="confirmed">{order.status}</Badge>
                  </td>
                  <td>
                    <div className="dispatch-action-grid">
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
                        disabled={!order.trackingId}
                        title={!order.trackingId ? "Requires Tracking ID first" : "Submit to Courier"}
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
                    No confirmed orders ready for dispatch.
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
    </div>
  );
};
