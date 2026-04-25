import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useOrders } from '../context/OrderContext';
import { useAuth } from '../context/AuthContext';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { OrderEditModal } from '../components/OrderEditModal';
import { OrderDetailsModal } from '../components/OrderDetailsModal';
import { Search, Loader2, CheckCircle, PackageSearch, Zap, AlertTriangle, Package, ArrowRight, Edit2, Sparkles, Download, FileSpreadsheet } from 'lucide-react';
import { PremiumSearch } from '../components/PremiumSearch';
import { usePersistentState } from '../utils/persistentState';
import { getToyBoxStockKey } from '../utils/productCatalog';
import * as XLSX from 'xlsx';
import './FactoryPanel.css';

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
const FACTORY_PAGE_SIZE = 10;

const getVisiblePageNumbers = (currentPage, totalPages, maxVisible = 5) => {
  if (totalPages <= maxVisible) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const half = Math.floor(maxVisible / 2);
  let start = Math.max(1, currentPage - half);
  const end = Math.min(totalPages, start + maxVisible - 1);
  start = Math.max(1, end - maxVisible + 1);

  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
};

const formatExportDate = (value) => {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleString('en-BD', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
};

const formatProductSummary = (order) => {
  const items = Array.isArray(order?.ordered_items) ? order.ordered_items : [];

  if (items.length === 0) {
    const fallbackQty = Number(order?.quantity) || 1;
    return `${order?.product_name || ''} x${fallbackQty}`.trim();
  }

  return items
    .map((item) => {
      const name = item?.name || order?.product_name || 'Item';
      const quantity = Number(item?.quantity) || 1;
      const size = item?.size ? ` (${item.size})` : '';
      return `${name}${size} x${quantity}`;
    })
    .join(', ');
};

export const FactoryPanel = () => {
  const { orders, toyBoxes, autoDistributeOrders, updateOrderStatus } = useOrders();
  const { updatePresenceContext } = useAuth();

  useEffect(() => {
    updatePresenceContext('Reviewing Confirmed Orders');
  }, [updatePresenceContext]);
  
  const [searchTerm, setSearchTerm] = usePersistentState('panel:factory:search', '');
  const [isDistributing, setIsDistributing] = useState(false);
  const [distributeResult, setDistributeResult] = useState(null);
  const [activeTab, setActiveTab] = usePersistentState('panel:factory:tab', 'confirmed'); // 'confirmed' | 'queued'
  const [currentPage, setCurrentPage] = useState(1);

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
  const totalPages = Math.max(1, Math.ceil(displayOrders.length / FACTORY_PAGE_SIZE));
  const paginatedOrders = useMemo(() => {
    const startIndex = (currentPage - 1) * FACTORY_PAGE_SIZE;
    return displayOrders.slice(startIndex, startIndex + FACTORY_PAGE_SIZE);
  }, [displayOrders, currentPage]);
  const visiblePages = useMemo(() => getVisiblePageNumbers(currentPage, totalPages), [currentPage, totalPages]);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, searchTerm]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

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
      const boxNum = typeof item === 'object' ? item.toyBoxNumber : item;
      if (boxNum == null) return false;
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
    await updateOrderStatus(orderId, 'Confirmed');
  };

  const handleBulkExport = () => {
    if (displayOrders.length === 0) return;

    const exportRows = displayOrders.map((order, index) => ({
      serial: index + 1,
      order_id: order.id || '',
      status: order.status || '',
      customer_name: order.customer_name || '',
      phone: order.phone || '',
      address: order.address || '',
      shipping_zone: order.shipping_zone || '',
      product_name: order.product_name || '',
      product_details: formatProductSummary(order),
      total_quantity: Number(order.quantity) || (Array.isArray(order.ordered_items)
        ? order.ordered_items.reduce((sum, item) => sum + (Number(item?.quantity) || 1), 0)
        : 0),
      amount: Number(order.amount) || 0,
      delivery_charge: Number(order.delivery_charge) || 0,
      source: order.source || '',
      payment_status: order.payment_status || '',
      notes: order.notes || '',
      created_at: formatExportDate(order.created_at),
      updated_at: formatExportDate(order.updated_at)
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, activeTab === 'confirmed' ? 'Confirmed Orders' : 'Queued Orders');

    const dateLabel = new Date().toISOString().split('T')[0];
    const tabLabel = activeTab === 'confirmed' ? 'confirmed' : 'queue';
    XLSX.writeFile(workbook, `confirmed-panel-${tabLabel}-${dateLabel}.xlsx`);
  };

  return (
    <motion.div 
      className="factory-panel"
      initial="hidden"
      animate="visible"
      variants={containerVariants}
    >
      <header className="page-header">
        <div>
          <h1 className="premium-title">Confirmed Panel</h1>
          <p className="page-subtitle">Confirmed order review, distribution and inventory verification hub.</p>
        </div>
        <div className="factory-header-actions">
          <Button
            variant="ghost"
            onClick={handleBulkExport}
            disabled={displayOrders.length === 0}
            className="factory-export-btn"
          >
            <FileSpreadsheet size={18} />
            <span>Bulk Export ({displayOrders.length})</span>
            <Download size={16} />
          </Button>
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
      </header>

      {/* Result Toast */}
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
                  Distribution complete! <strong>{distributeResult.distributed}</strong> Approvals, 
                  <strong> {distributeResult.queued}</strong> Queued for stock.
                </>
              )}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stats */}
      <section className="factory-stats-row">
        <motion.div variants={itemVariants}>
          <Card className="factory-stat-card">
            <div className="stat-icon-box blue"><Package size={22} /></div>
            <div className="stat-info">
              <span className="label">Confirmed</span>
              <span className="value">{confirmedOrders.length}</span>
            </div>
          </Card>
        </motion.div>
        <motion.div variants={itemVariants}>
          <Card className="factory-stat-card">
            <div className="stat-icon-box orange"><AlertTriangle size={22} /></div>
            <div className="stat-info">
              <span className="label">Total Queued</span>
              <span className="value">{queuedOrders.length}</span>
            </div>
          </Card>
        </motion.div>
        <motion.div variants={itemVariants}>
          <Card className="factory-stat-card">
            <div className="stat-icon-box green"><CheckCircle size={22} /></div>
            <div className="stat-info">
              <span className="label">Courier Ready</span>
              <span className="value">{orders.filter(o => o.status === 'Courier Ready').length}</span>
            </div>
          </Card>
        </motion.div>
      </section>

      {/* Tab Toggle */}
      <div className="factory-tabs-container">
        <div className="factory-tabs">
          <button className={`factory-tab ${activeTab === 'confirmed' ? 'active' : ''}`} onClick={() => setActiveTab('confirmed')}>
            <Package size={16} /> Confirmed ({confirmedOrders.length})
          </button>
          <button className={`factory-tab ${activeTab === 'queued' ? 'active' : ''}`} onClick={() => setActiveTab('queued')}>
            <AlertTriangle size={16} /> Queue ({queuedOrders.length})
          </button>
        </div>
      </div>

      <Card className="table-card" noPadding>
        <div className="table-search-bar">
          <PremiumSearch
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by ID, name or product..."
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
            <span className="order-count-badge">{displayOrders.length} records found</span>
          </div>
        </div>
        
        <div className="factory-table-wrapper">
          <table className="factory-management-table">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Recipient</th>
                <th>Focus Products</th>
                <th>Stock Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence mode="popLayout">
                {paginatedOrders.map(order => {
                  const stock = getStockStatus(order);
                  const isToyBox = (order.product_name || '').toUpperCase().includes('TOY BOX');
                  
                  return (
                    <motion.tr 
                      key={order.id} 
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="factory-order-row cursor-pointer" 
                      onClick={() => handleRowClick(order)}
                    >
                      <td className="order-id-cell">
                        <span className="saas-id">#{(order.id || '').replace('ORD-', '')}</span>
                      </td>
                      <td>
                        <div className="factory-customer-stack">
                          <span className="saas-text-dark">{order.customer_name}</span>
                          <span className="saas-text">{order.phone}</span>
                        </div>
                      </td>
                      <td>
                        <div className="factory-product-stack">
                          <div className="factory-product-line">
                            <span className="saas-text-dark">{order.product_name}</span>
                            {order.size && <span className="factory-size-pill">T-{order.size}</span>}
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
                                    {item?.name ? `${item.name.charAt(0)}${boxNum}` : `#${boxNum}`}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="factory-stock-block">
                          <Badge variant={stock.matched ? 'success' : 'warning'} className="factory-stock-pill">
                            {stock.matched ? 'Full Stock' : `${stock.missing.length} Missing`}
                          </Badge>
                          {!stock.matched && (
                             <div className="factory-meta-note">Awaiting replenishment</div>
                          )}
                        </div>
                      </td>
                      <td className="factory-actions-cell">
                        <div className="factory-action-grid">
                          <button className="factory-action-btn edit" onClick={(e) => { e.stopPropagation(); handleOpenEditModal(order); }} title="Adjust Order">
                            <Edit2 size={14} /> <span>Edit</span>
                          </button>
                          {order.status === 'Confirmed' && stock.matched && (
                            <button className="factory-action-btn send" onClick={(e) => { e.stopPropagation(); handleManualSend(order.id); }} title="Dispatch to Courier">
                              <CheckCircle size={14} /> <span>Approve</span>
                            </button>
                          )}
                          {order.status === 'Factory Queue' && (
                            <button className="factory-action-btn retry" onClick={(e) => { e.stopPropagation(); handleRetryDistribute(order.id); }} title="Recheck Inventory">
                               <Zap size={14} /> <span>Recheck</span>
                             </button>
                          )}
                          {!stock.matched && (
                            <span className="factory-inline-note">{order.status === 'Confirmed' ? 'Blocked' : 'Insufficient'}</span>
                          )}
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
              {displayOrders.length === 0 && (
                <tr>
                  <td colSpan="5" className="empty-state-cell">
                    <motion.div 
                      className="empty-state-content"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                    >
                      <div className="empty-icon-wrapper" style={{ opacity: 0.2 }}>
                        <PackageSearch size={64} />
                      </div>
                      <h3>No records found</h3>
                      <p>
                        {activeTab === 'confirmed' 
                          ? 'Incoming confirmed orders will appear here for verification.' 
                          : 'Queue is empty. No orders are currently blocked due to stock.'}
                      </p>
                    </motion.div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {displayOrders.length > 0 && (
          <div className="factory-pagination-footer">
            <div className="factory-pagination-info">
              Showing {(currentPage - 1) * FACTORY_PAGE_SIZE + 1}-
              {Math.min(currentPage * FACTORY_PAGE_SIZE, displayOrders.length)} of {displayOrders.length} records
            </div>
            <div className="factory-pagination-actions">
              <button
                className="factory-page-btn"
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
              >
                Previous
              </button>
              <div className="factory-page-numbers">
                {visiblePages.map((pageNumber) => (
                  <button
                    key={pageNumber}
                    className={`factory-page-btn factory-page-num ${currentPage === pageNumber ? 'active' : ''}`}
                    onClick={() => setCurrentPage(pageNumber)}
                  >
                    {pageNumber}
                  </button>
                ))}
              </div>
              <button
                className="factory-page-btn"
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
              >
                Next
              </button>
            </div>
          </div>
        )}
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
    </motion.div>
  );
};
