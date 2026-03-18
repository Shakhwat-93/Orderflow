import { useState } from 'react';
import { useOrders } from '../context/OrderContext';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Search, Loader2, CheckCircle, PackageSearch, Zap, AlertTriangle, Package, ArrowRight } from 'lucide-react';
import './FactoryPanel.css';

export const FactoryPanel = () => {
  const { orders, toyBoxes, autoDistributeOrders, updateOrderStatus } = useOrders();
  const [searchTerm, setSearchTerm] = useState('');
  const [isDistributing, setIsDistributing] = useState(false);
  const [distributeResult, setDistributeResult] = useState(null);
  const [activeTab, setActiveTab] = useState('confirmed'); // 'confirmed' | 'queued'

  // Confirmed = incoming, Factory Queue = waiting for stock
  const confirmedOrders = orders.filter(
    o => o.status === 'Confirmed' &&
    (o.id.toLowerCase().includes(searchTerm.toLowerCase()) || 
     (o.product_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
     (o.customer_name || '').toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const queuedOrders = orders.filter(
    o => o.status === 'Factory Queue' &&
    (o.id.toLowerCase().includes(searchTerm.toLowerCase()) || 
     (o.product_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
     (o.customer_name || '').toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const displayOrders = activeTab === 'confirmed' ? confirmedOrders : queuedOrders;

  // Stock availability check helper
  const getStockStatus = (order) => {
    const items = order.ordered_items || [];
    const isToyBox = (order.product_name || '').toUpperCase().includes('TOY BOX');
    if (!isToyBox || items.length === 0) return { matched: true, label: 'Auto Pass', missing: [] };

    const stockMap = {};
    toyBoxes.forEach(b => { stockMap[b.toy_box_number] = b.stock_quantity; });

    const missing = items.filter(num => (stockMap[num] || 0) < 1);
    return {
      matched: missing.length === 0,
      label: missing.length === 0 ? 'Stock OK' : `${missing.length} Missing`,
      missing
    };
  };

  const handleAutoDistribute = async () => {
    setIsDistributing(true);
    setDistributeResult(null);
    try {
      const result = await autoDistributeOrders();
      setDistributeResult(result);
      setTimeout(() => setDistributeResult(null), 8000);
    } catch (error) {
      console.error('Auto distribute error:', error);
      setDistributeResult({ error: error.message });
    } finally {
      setIsDistributing(false);
    }
  };

  const handleManualSend = async (orderId) => {
    await updateOrderStatus(orderId, 'Courier Ready');
  };

  const handleRetryDistribute = async (orderId) => {
    // Move back to Confirmed so it gets picked up by next auto distribute
    await updateOrderStatus(orderId, 'Confirmed');
  };

  return (
    <div className="factory-panel">
      <div className="page-header">
        <div>
          <h1 className="premium-title">Factory Panel</h1>
          <p className="page-subtitle">Stock verification & distribution engine. Confirmed orders are checked against inventory before courier dispatch.</p>
        </div>
        <div className="factory-header-actions">
          <Button 
            variant="primary" 
            onClick={handleAutoDistribute} 
            disabled={isDistributing || confirmedOrders.length === 0}
            className="auto-distribute-btn"
          >
            {isDistributing ? <Loader2 size={18} className="spin" /> : <Zap size={18} />}
            <span>Auto Distribute ({confirmedOrders.length})</span>
          </Button>
        </div>
      </div>

      {/* Result Toast */}
      {distributeResult && !distributeResult.error && (
        <div className="distribute-result-toast success">
          <CheckCircle size={18} />
          <span>
            Distribution complete! <strong>{distributeResult.distributed}</strong> → Courier Ready, 
            <strong> {distributeResult.queued}</strong> → Factory Queue (stock insufficient)
          </span>
        </div>
      )}
      {distributeResult?.error && (
        <div className="distribute-result-toast error">
          <AlertTriangle size={18} />
          <span>Error: {distributeResult.error}</span>
        </div>
      )}

      {/* Stats */}
      <div className="factory-stats-row">
        <Card className="factory-stat-card glass-card">
          <div className="stat-icon-box blue"><Package size={20} /></div>
          <div className="stat-info">
            <span className="label">Confirmed</span>
            <span className="value">{confirmedOrders.length}</span>
          </div>
        </Card>
        <Card className="factory-stat-card glass-card">
          <div className="stat-icon-box orange"><AlertTriangle size={20} /></div>
          <div className="stat-info">
            <span className="label">Factory Queue</span>
            <span className="value">{queuedOrders.length}</span>
          </div>
        </Card>
        <Card className="factory-stat-card glass-card">
          <div className="stat-icon-box green"><CheckCircle size={20} /></div>
          <div className="stat-info">
            <span className="label">Courier Ready</span>
            <span className="value">{orders.filter(o => o.status === 'Courier Ready').length}</span>
          </div>
        </Card>
      </div>

      {/* Tab Toggle */}
      <div className="factory-tabs">
        <button className={`factory-tab ${activeTab === 'confirmed' ? 'active' : ''}`} onClick={() => setActiveTab('confirmed')}>
          <Package size={16} /> Confirmed ({confirmedOrders.length})
        </button>
        <button className={`factory-tab ${activeTab === 'queued' ? 'active' : ''}`} onClick={() => setActiveTab('queued')}>
          <AlertTriangle size={16} /> Factory Queue ({queuedOrders.length})
        </button>
      </div>

      <Card className="table-card liquid-glass" noPadding>
        <div className="mod-table-header">
          <div className="search-box">
            <Search size={18} className="filter-icon" />
            <input
              type="text"
              placeholder="Search by ID, product or customer..."
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
                <th>Products & Items</th>
                <th>Inventory Check</th>
                <th>Next Action</th>
              </tr>
            </thead>
            <tbody>
              {displayOrders.map(order => {
                const stock = getStockStatus(order);
                const isToyBox = (order.product_name || '').toUpperCase().includes('TOY BOX');
                
                return (
                  <tr key={order.id} className="factory-row">
                    <td className="order-id-cell">#{(order.id || '').replace('ORD-', '')}</td>
                    <td className="customer-cell">
                      <div className="customer-info">
                        <span className="customer-name">{order.customer_name}</span>
                        <span className="customer-phone">{order.phone}</span>
                      </div>
                    </td>
                    <td className="product-info-cell">
                      <div className="product-main-flex">
                        <span className="product-name">{order.product_name}</span>
                        {order.size && <span className="size-tag">{order.size}</span>}
                      </div>
                      {isToyBox && (order.ordered_items || []).length > 0 && (
                        <div className="item-pills">
                          {(order.ordered_items || []).map(num => (
                            <span key={num} className={`item-pill ${(toyBoxes.find(b => b.toy_box_number === num)?.stock_quantity || 0) < 1 ? 'out' : ''}`}>
                              #{num}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td>
                      <div className="stock-check-status">
                        <Badge variant={stock.matched ? 'success' : 'warning'}>
                          {stock.matched ? 'Ready to Ship' : `${stock.missing.length} Out of Stock`}
                        </Badge>
                        {!stock.matched && (
                          <div className="stock-hint">Requires replacement or restock</div>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="factory-action-grid">
                        {order.status === 'Confirmed' && stock.matched && (
                          <button className="factory-action-btn send" onClick={() => handleManualSend(order.id)} title="Send to Courier Ready">
                            <ArrowRight size={16} /> <span>Approve for Delivery</span>
                          </button>
                        )}
                        {order.status === 'Factory Queue' && (
                          <button className="factory-action-btn retry" onClick={() => handleRetryDistribute(order.id)} title="Retry Distribution">
                            <Zap size={16} /> <span>Re-check Stock</span>
                          </button>
                        )}
                        {order.status === 'Confirmed' && !stock.matched && (
                          <span className="text-tertiary italic">Waiting for stock</span>
                        )}
                        {order.status === 'Factory Queue' && !stock.matched && (
                          <span className="text-tertiary italic">Still missing items</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {displayOrders.length === 0 && (
                <tr>
                  <td colSpan="7" className="empty-state-cell">
                    <div className="empty-state-content">
                      <PackageSearch size={40} />
                      <h3>{activeTab === 'confirmed' ? 'No confirmed orders pending distribution' : 'No orders in factory queue'}</h3>
                      <p>{activeTab === 'confirmed' ? 'Orders will appear here when Call Team or Moderator confirms them.' : 'All items are in stock — great job!'}</p>
                    </div>
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
