import { useState } from 'react';
import { useOrders } from '../context/OrderContext';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { Search, Loader2, CheckCircle, PackageSearch } from 'lucide-react';
import './FactoryPanel.css';

export const FactoryPanel = () => {
  const { orders, updateOrderStatus } = useOrders();
  const [searchTerm, setSearchTerm] = useState('');

  // Filter orders that have been submitted to Courier OR are currently processing
  const factoryQueue = orders.filter(
    o => ['Courier Submitted', 'Factory Processing'].includes(o.status) &&
    (o.id.toLowerCase().includes(searchTerm.toLowerCase()) || 
     o.product.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleAction = (orderId, action) => {
    switch(action) {
      case 'processing':
        updateOrderStatus(orderId, 'Factory Processing');
        break;
      case 'completed':
        updateOrderStatus(orderId, 'Completed');
        break;
      default:
        break;
    }
  };

  return (
    <div className="factory-panel">
      <div className="page-header">
        <div>
          <h1>Factory Panel</h1>
          <p>Production queue management for item processing and completion.</p>
        </div>
        <div className="active-factory-stat">
          <PackageSearch size={20} className="text-secondary" />
          <span>{factoryQueue.length} Items in Production</span>
        </div>
      </div>

      <Card className="table-card liquid-glass" noPadding>
        <div className="mod-table-header">
          <div className="search-box">
            <Search size={18} className="filter-icon" />
            <input
              type="text"
              placeholder="Search by ID or Product..."
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
                <th>Product</th>
                <th>Size</th>
                <th>Quantity</th>
                <th>Current Status</th>
                <th>Production Actions</th>
              </tr>
            </thead>
            <tbody>
              {factoryQueue.map(order => (
                <tr key={order.id}>
                  <td className="order-id-cell">{order.id}</td>
                  <td className="product-name">{order.product}</td>
                  <td className="size-cell">
                    <span className="size-badge">{order.size}</span>
                  </td>
                  <td className="qty-cell">
                    <span className="qty-badge">{order.items}</span>
                  </td>
                  <td>
                    <Badge variant={order.status === 'Factory Processing' ? 'factory' : 'courier'}>
                      {order.status}
                    </Badge>
                  </td>
                  <td>
                    <div className="factory-action-grid">
                      <button 
                        className={`factory-action-btn processing ${order.status === 'Factory Processing' ? 'active' : ''}`} 
                        onClick={() => handleAction(order.id, 'processing')}
                        disabled={order.status === 'Factory Processing'}
                        title="Mark as Processing"
                      >
                        <Loader2 size={16} className={order.status === 'Factory Processing' ? "spin-icon" : ""} /> 
                        <span>Processing</span>
                      </button>
                      <button 
                        className="factory-action-btn complete" 
                        onClick={() => handleAction(order.id, 'completed')}
                        title="Mark as Completed"
                      >
                        <CheckCircle size={16} /> <span>Completed</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {factoryQueue.length === 0 && (
                <tr>
                  <td colSpan="6" className="empty-state-cell">
                    No items pending factory processing.
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
