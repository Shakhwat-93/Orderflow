import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Modal } from './Modal';
import { Badge } from './Badge';
import { ActivityTimeline } from './ActivityTimeline';
import { useOrders } from '../context/OrderContext';
import { useAuth } from '../context/AuthContext';
import { useTasks } from '../context/TaskContext';
import { Button } from './Button';
import { 
  User, Phone, MapPin, Package, Tag, Hash, 
  Calendar, Globe, StickyNote, DollarSign, Target, ExternalLink
} from 'lucide-react';
import { TaskDetailsModal } from './TaskDetailsModal';
import './OrderDetailsModal.css';

export const OrderDetailsModal = ({ order, isOpen, onClose }) => {
  const { fetchOrderLogs, updateOrderStatus, editOrder, addTrackingID } = useOrders();
  const { assignedTasks, updateAssignedTask } = useTasks();
  const { hasRole, isAdmin } = useAuth();
  const [logs, setLogs] = useState([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [newTrackingId, setNewTrackingId] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);

  const orderTasks = assignedTasks ? assignedTasks.filter(t => t.related_order_id === String(order?.id)) : [];

  useEffect(() => {
    if (isOpen && order?.id) {
      loadLogs();

      // Subscribe to realtime logs for this specific order
      const logsSubscription = supabase
        .channel(`order-logs-${order.id}`)
        .on(
          'postgres_changes', 
          { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'order_activity_logs',
            filter: `order_id=eq.${order.id}`
          }, 
          (payload) => {
            setLogs(prev => [payload.new, ...prev]);
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(logsSubscription);
      };
    }
  }, [isOpen, order?.id]);

  const loadLogs = async () => {
    setIsLoadingLogs(true);
    const data = await fetchOrderLogs(order.id);
    setLogs(data);
    setIsLoadingLogs(false);
  };

  if (!order) return null;

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

  const handleStatusUpdate = async (newStatus) => {
    setIsUpdating(true);
    await updateOrderStatus(order.id, newStatus);
    setIsUpdating(false);
  };

  const handleTrackingUpdate = async (e) => {
    e.preventDefault();
    if (!newTrackingId) return;
    setIsUpdating(true);
    await addTrackingID(order.id, newTrackingId);
    setNewTrackingId('');
    setIsUpdating(false);
  };

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      title={`Order Details: #${order.id}`}
      size="large"
    >
      <div className="order-details-grid">
        <div className="details-main">
          {/* Customer Info Section */}
          <section className="details-section">
            <h4>Customer Information</h4>
            <div className="info-grid">
              <div className="info-item">
                <User size={18} />
                <div className="info-content">
                  <label>Name</label>
                  <span>{order.customer_name}</span>
                </div>
              </div>
              <div className="info-item">
                <Phone size={18} />
                <div className="info-content">
                  <label>Phone</label>
                  <span>{order.phone}</span>
                </div>
              </div>
              <div className="info-item full-width">
                <MapPin size={18} />
                <div className="info-content">
                  <label>Address</label>
                  <span>{order.address || 'No address provided'}</span>
                </div>
              </div>
            </div>
          </section>

          {/* Product Info Section */}
          <section className="details-section">
            <h4>Order Information</h4>
            <div className="info-grid">
              <div className="info-item">
                <Package size={18} />
                <div className="info-content">
                  <label>Product</label>
                  <span>{order.product_name}</span>
                </div>
              </div>
              <div className="info-item">
                <Tag size={18} />
                <div className="info-content">
                  <label>Size</label>
                  <span>{order.size || 'N/A'}</span>
                </div>
              </div>
              <div className="info-item">
                <Hash size={18} />
                <div className="info-content">
                  <label>Quantity</label>
                  <span>{order.quantity}</span>
                </div>
              </div>
              <div className="info-item">
                <DollarSign size={18} />
                <div className="info-content">
                  <label>Amount</label>
                  <span>${order.amount || '0.00'}</span>
                </div>
              </div>
              <div className="info-item">
                <Globe size={18} />
                <div className="info-content">
                  <label>Source</label>
                  <span>{order.source}</span>
                </div>
              </div>
              <div className="info-item">
                <Calendar size={18} />
                <div className="info-content">
                  <label>Created At</label>
                  <span>{new Date(order.created_at).toLocaleString()}</span>
                </div>
              </div>
            </div>
          </section>

          <section className="details-section">
            <h4>Status & Tracking</h4>
            <div className="status-tracking-wrap">
              <Badge variant={getStatusBadgeVariant(order.status)}>
                {order.status}
              </Badge>
              {order.tracking_id && (
                <div className="tracking-info">
                  <label>Tracking ID:</label>
                  <code>{order.tracking_id}</code>
                </div>
              )}
            </div>

            <div className="quick-actions">
              {(isAdmin || hasRole('Call Team')) && ['New', 'Pending Call'].includes(order.status) && (
                <div className="action-group">
                  <Button variant="confirmed" size="small" onClick={() => handleStatusUpdate('Confirmed')} disabled={isUpdating}>
                    Confirm Order
                  </Button>
                  <Button variant="cancelled" size="small" onClick={() => handleStatusUpdate('Cancelled')} disabled={isUpdating}>
                    Cancel Order
                  </Button>
                </div>
              )}

              {(isAdmin || hasRole('Courier Team')) && order.status === 'Confirmed' && (
                <div className="action-group vertical">
                  <form onSubmit={handleTrackingUpdate} className="tracking-form">
                    <input 
                      type="text" 
                      placeholder="Enter Tracking ID..." 
                      value={newTrackingId}
                      onChange={e => setNewTrackingId(e.target.value)}
                      className="inline-input"
                    />
                    <Button variant="primary" size="small" type="submit" disabled={isUpdating || !newTrackingId}>
                      Update & Ship
                    </Button>
                  </form>
                  <Button variant="courier" size="small" onClick={() => handleStatusUpdate('Courier Submitted')} disabled={isUpdating}>
                    Mark as Shipped
                  </Button>
                </div>
              )}

              {(isAdmin || hasRole('Factory Team')) && ['Confirmed', 'Courier Submitted'].includes(order.status) && (
                <div className="action-group">
                  <Button variant="factory" size="small" onClick={() => handleStatusUpdate('Factory Processing')} disabled={isUpdating}>
                    Start Processing
                  </Button>
                  <Button variant="completed" size="small" onClick={() => handleStatusUpdate('Completed')} disabled={isUpdating}>
                    Mark Completed
                  </Button>
                </div>
              )}
            </div>
          </section>

          {/* ── Order Tasks Section ── */}
          {orderTasks.length > 0 && (
            <section className="details-section order-tasks-section">
              <h4>Linked Tasks</h4>
              <div className="linked-tasks-list">
                {orderTasks.map(task => (
                  <div key={task.id} className={`linked-task-item ${task.status}`}>
                    <div className="task-header">
                      <span className="task-title">{task.title}</span>
                      <Badge variant={
                        task.status === 'completed' ? 'completed' : 
                        task.status === 'in_progress' ? 'factory' : 'default'
                      }>
                        {task.status.replace('_', ' ')}
                      </Badge>
                    </div>
                    {task.description && <p className="task-desc-small">{task.description}</p>}
                    <div className="task-actions" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: 'var(--sp-2)' }}>
                      <Button variant="ghost" size="small" onClick={() => setSelectedTask(task)}>
                        <Target size={14} style={{ marginRight: '4px' }} /> Details
                      </Button>
                      {task.status === 'pending' && (
                        <Button variant="outline" size="small" onClick={() => updateAssignedTask(task.id, { status: 'in_progress' })}>
                          Start
                        </Button>
                      )}
                      {task.status === 'in_progress' && (
                        <Button variant="primary" size="small" onClick={() => updateAssignedTask(task.id, { status: 'completed' })}>
                          Complete
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {order.notes && (
            <section className="details-section">
              <h4>Notes</h4>
              <div className="notes-box">
                <StickyNote size={18} />
                <p>{order.notes}</p>
              </div>
            </section>
          )}
        </div>

        <div className="details-sidebar">
          <div className="sidebar-header">
            <h4>Activity History</h4>
            <button className="refresh-btn" onClick={loadLogs} disabled={isLoadingLogs}>
              {isLoadingLogs ? 'Loading...' : 'Refresh'}
            </button>
          </div>
          <div className="activity-scroll">
            <ActivityTimeline logs={logs} />
          </div>
        </div>
      </div>

      <TaskDetailsModal
        task={selectedTask}
        taskType="assigned"
        isOpen={!!selectedTask}
        onClose={() => setSelectedTask(null)}
        onOpenOrder={(orderId) => {
          if (String(orderId) === String(order?.id)) {
             setSelectedTask(null);
          }
        }}
      />
    </Modal>
  );
};
