import { useState, useEffect } from 'react';
import { useOrders } from '../context/OrderContext';
import { useAuth } from '../context/AuthContext';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { OrderEditModal } from '../components/OrderEditModal';
import { OrderDetailsModal } from '../components/OrderDetailsModal';
import { Search, Loader2, CheckCircle, PackageSearch, Zap, AlertTriangle, Package, ArrowRight, Edit2, Sparkles } from 'lucide-react';
import { PremiumSearch } from '../components/PremiumSearch';
import { usePersistentState } from '../utils/persistentState';
import { getToyBoxStockKey } from '../utils/productCatalog';
import './FactoryPanel.css';

export const FactoryPanel = () => {
  const { orders, toyBoxes, autoDistributeOrders, updateOrderStatus } = useOrders();
  const { updatePresenceContext } = useAuth();

  useEffect(() => {
    updatePresenceContext('Checking Production');
  }, [updatePresenceContext]);
  const [searchTerm, setSearchTerm] = usePersistentState('panel:factory:search', '');
  const [isDistributing, setIsDistributing] = useState(false);
  const [distributeResult, setDistributeResult] = useState(null);
  const [activeTab, setActiveTab] = usePersistentState('panel:factory:tab', 'confirmed'); // 'confirmed' | 'queued'

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
    toyBoxes.forEach((box) => {
      stockMap[getToyBoxStockKey(box.product_name || 'TOY BOX', box.toy_box_number)] = Number(box.stock_quantity) || 0;
    });

    const missing = items.filter(item => {
      // Handle both legacy (number/string) and new (object) formats
      const boxNum = typeof item === 'object' ? item.toyBoxNumber : item;
      if (boxNum == null) return false; // Not a toy box item or no number assigned
      const productName = typeof item === 'object' ? (item.name || order.product_name || 'TOY BOX') : 'TOY BOX';
      return (stockMap[getToyBoxStockKey(productName, boxNum)] || 0) < 1;
    });

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
        <div className="table-search-bar">
          <PremiumSearch
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search ID, product or customer..."
            suggestions={
              searchTerm ? orders.filter(o => 
                o.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (o.product_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (o.customer_name || '').toLowerCase().includes(searchTerm.toLowerCase())
              ).slice(0, 5).map(o => ({
                id: o.id,
                label: o.customer_name,
                sub: `${o.id} • ${o.product_name}`,
                type: 'order',
                original: o
              })) : []
            }
            onSuggestionClick={(item) => {
              if (item.type === 'order') {
                handleRowClick(item.original);
              }
            }}
          />
          <div className="filter-actions-group">
            <span className="order-count-badge">{displayOrders.length} orders</span>
          </div>
        </div>
        
        <div className="orders-table-wrapper factory-table-wrapper desktop-only">
          <table className="management-table premium-table factory-management-table">
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Customer</th>
                <th>Products & Items</th>
                <th>Inventory Check</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayOrders.map(order => {
                const stock = getStockStatus(order);
                const isToyBox = (order.product_name || '').toUpperCase().includes('TOY BOX');
                
                return (
                  <tr key={order.id} className="order-row factory-order-row cursor-pointer" onClick={() => handleRowClick(order)}>
                    <td className="id-cell order-id-cell">
                      <span className="saas-id">#{(order.id || '').replace('ORD-', '')}</span>
                    </td>
                    <td className="customer-cell">
                      <div className="factory-customer-stack">
                        <span className="saas-text-dark">{order.customer_name}</span>
                        <span className="saas-text">{order.phone}</span>
                      </div>
                    </td>
                    <td className="product-info-cell">
                      <div className="factory-product-stack">
                        <div className="factory-product-line">
                          <span className="saas-text-dark">{order.product_name}</span>
                          {order.size && <span className="factory-size-pill">Size {order.size}</span>}
                        </div>
                      </div>
                      {isToyBox && (order.ordered_items || []).length > 0 && (
                        <div className="factory-item-pills">
                          {(order.ordered_items || []).map((item, idx) => {
                            const boxNum = typeof item === 'object' ? item.toyBoxNumber : item;
                            if (boxNum == null) return null;
                            const productName = typeof item === 'object' ? (item.name || order.product_name || 'TOY BOX') : 'TOY BOX';
                            const stockKey = getToyBoxStockKey(productName, boxNum);
                            const stockQty = toyBoxes.find((box) => getToyBoxStockKey(box.product_name || 'TOY BOX', box.toy_box_number) === stockKey)?.stock_quantity || 0;
                            const isOut = stockQty < 1;

                            return (
                              <span key={`${order.id}-item-${idx}`} className={`factory-item-pill ${isOut ? 'out' : ''}`}>
                                {item?.name ? `${item.name} #${boxNum}` : `#${boxNum}`}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </td>
                    <td>
                      <div className="factory-stock-block">
                        <Badge variant={stock.matched ? 'success' : 'warning'} className="factory-stock-pill">
                          {stock.matched ? 'Ready to Ship' : `${stock.missing.length} Out of Stock`}
                        </Badge>
                        {!stock.matched && (
                          <div className="factory-meta-note">Requires replacement or restock</div>
                        )}
                      </div>
                    </td>
                    <td className="factory-actions-cell">
                      <div className="factory-action-grid">
                        <button className="factory-action-btn edit" onClick={(e) => { e.stopPropagation(); handleOpenEditModal(order); }} title="Edit Order">
                          <Edit2 size={16} /> <span>Edit</span>
                        </button>
                        {order.status === 'Confirmed' && stock.matched && (
                          <button className="factory-action-btn send" onClick={(e) => { e.stopPropagation(); handleManualSend(order.id); }} title="Send to Courier Ready">
                            <ArrowRight size={16} /> <span>Approve</span>
                          </button>
                        )}
                        {order.status === 'Factory Queue' && (
                          <button className="factory-action-btn retry" onClick={(e) => { e.stopPropagation(); handleRetryDistribute(order.id); }} title="Retry Distribution">
                             <Zap size={16} /> <span>Recheck</span>
                           </button>
                        )}
                        {order.status === 'Confirmed' && !stock.matched && (
                          <span className="factory-inline-note">Waiting for stock</span>
                        )}
                        {order.status === 'Factory Queue' && !stock.matched && (
                          <span className="factory-inline-note">Still missing items</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {displayOrders.length === 0 && (
                <tr>
                  <td colSpan="5" className="empty-state-cell">
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
