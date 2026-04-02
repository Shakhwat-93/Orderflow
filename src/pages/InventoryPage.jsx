import { useState } from 'react';
import { useOrders } from '../context/OrderContext';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Modal } from '../components/Modal';
import CurrencyIcon from '../components/CurrencyIcon';
import {
  Search, Plus, Package, AlertTriangle, ArrowUpRight, ArrowDownRight,
  Edit2, Trash2, Tag, Bot, Loader2, CheckCircle2, CircleAlert, ChevronDown, Sparkles
} from 'lucide-react';
import { PremiumSearch } from '../components/PremiumSearch';
import { usePersistentState } from '../utils/persistentState';
import { getSerialTrackedProducts } from '../utils/productCatalog';
import './InventoryPage.css';

const CATEGORIES = ['All', 'TOY BOX', 'ORGANIZER', 'Bags', 'Accessories', 'Religious', 'Other'];

export const InventoryPage = () => {
  const {
    inventory,
    toyBoxes,
    loading,
    addInventoryItem,
    updateInventoryItem,
    deleteInventoryItem,
    adjustStock,
    updateToyBoxStock,
    addToyBoxStocks,
    previewInvoiceStockUpdate,
    applyInvoiceStockUpdate
  } = useOrders();
  const [searchTerm, setSearchTerm] = usePersistentState('panel:inventory:search', '');
  const [categoryFilter, setCategoryFilter] = usePersistentState('panel:inventory:category', 'All');

  // Modal states
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [isToyBoxModalOpen, setIsToyBoxModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [adjustingProduct, setAdjustingProduct] = useState(null);
  const [adjustAmount, setAdjustAmount] = useState(1);
  const [adjustType, setAdjustType] = useState('add'); // 'add' or 'deduct'
  const [invoiceText, setInvoiceText] = useState('');
  const [invoicePreview, setInvoicePreview] = useState(null);
  const [invoiceError, setInvoiceError] = useState('');
  const [isPreviewingInvoice, setIsPreviewingInvoice] = useState(false);
  const [isApplyingInvoice, setIsApplyingInvoice] = useState(false);
  const [confirmCommand] = useState('confirm');
  const [useManualBulkMode, setUseManualBulkMode] = useState(true);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [invoiceStockMode, setInvoiceStockMode] = useState('add'); // 'add' or 'deduct'
  const [toyBoxSerialInput, setToyBoxSerialInput] = useState('');
  const [toyBoxInitialStock, setToyBoxInitialStock] = useState(0);
  const [toyBoxProductName, setToyBoxProductName] = useState('');

  const [formData, setFormData] = useState({
    name: '', sku: '', category: 'Other', current_stock: 0, min_stock_level: 5, unit_price: 0, supports_serial_tracking: false
  });

  const serialTrackedProducts = getSerialTrackedProducts(inventory);
  const toyBoxGroups = (toyBoxes || []).reduce((acc, item) => {
    const key = item.product_name || 'TOY BOX';
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  const filteredInventory = inventory.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.sku && item.sku.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCategory = categoryFilter === 'All' || item.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const lowStockItems = inventory.filter(item => item.current_stock <= item.min_stock_level);
  const outOfStockItems = inventory.filter(item => item.current_stock === 0);

  const handleOpenProductModal = (product = null) => {
    if (product) {
      setEditingProduct(product);
      setFormData({
        name: product.name,
        sku: product.sku || '',
        category: product.category || 'Other',
        current_stock: product.current_stock,
        min_stock_level: product.min_stock_level,
        unit_price: product.unit_price,
        supports_serial_tracking: Boolean(product.supports_serial_tracking ?? (product.category === 'TOY BOX'))
      });
    } else {
      setEditingProduct(null);
      setFormData({ name: '', sku: '', category: 'Other', current_stock: 0, min_stock_level: 5, unit_price: 0, supports_serial_tracking: false });
    }
    setIsProductModalOpen(true);
  };

  const handleSaveProduct = async (e) => {
    e.preventDefault();
    if (editingProduct) {
      await updateInventoryItem(editingProduct.id, formData);
    } else {
      await addInventoryItem(formData);
    }
    setIsProductModalOpen(false);
  };

  const handleOpenAdjustModal = (product) => {
    setAdjustingProduct(product);
    setAdjustAmount(1);
    setAdjustType('add');
    setIsAdjustModalOpen(true);
  };

  const handleAdjustStock = async () => {
    const amount = adjustType === 'add' ? adjustAmount : -adjustAmount;
    await adjustStock(adjustingProduct.id, amount);
    setIsAdjustModalOpen(false);
  };

  const handleDeleteProduct = async (id) => {
    if (window.confirm('Are you sure you want to delete this product?')) {
      await deleteInventoryItem(id);
    }
  };

  const handleAddToyBoxSerials = async (e) => {
    e.preventDefault();

    if (!toyBoxProductName) {
      alert('Select a product for these serials.');
      return;
    }

    const requested = toyBoxSerialInput
      .split(/[,\s]+/)
      .map((value) => parseInt(value.trim(), 10))
      .filter((value) => Number.isInteger(value) && value > 0);

    const uniqueRequested = [...new Set(requested)];
    const existing = new Set(
      (toyBoxes || [])
        .filter((box) => (box.product_name || 'TOY BOX') === toyBoxProductName)
        .map((box) => Number(box.toy_box_number))
    );
    const entries = uniqueRequested
      .filter((serial) => !existing.has(serial))
      .map((serial) => ({
        product_name: toyBoxProductName,
        toy_box_number: serial,
        stock_quantity: toyBoxInitialStock
      }));

    if (entries.length === 0) {
      alert('No new serial numbers found to add.');
      return;
    }

    await addToyBoxStocks(entries);
    setToyBoxSerialInput('');
    setToyBoxInitialStock(0);
    setToyBoxProductName('');
    setIsToyBoxModalOpen(false);
  };

  const handleOpenInvoiceModal = () => {
    setIsInvoiceModalOpen(true);
    setInvoiceError('');
    setInvoicePreview(null);
    setIsReviewModalOpen(false);
    setInvoiceStockMode('add');
  };

  const handlePreviewInvoice = async () => {
    if (!invoiceText.trim()) {
      setInvoiceError('Please paste invoice lines first.');
      return;
    }

    setIsPreviewingInvoice(true);
    setInvoiceError('');
    try {
      const preview = await previewInvoiceStockUpdate(invoiceText, { preferManualBulk: useManualBulkMode, stockMode: invoiceStockMode });
      setInvoicePreview(preview);
    } catch (error) {
      setInvoiceError(error?.message || 'Failed to analyze invoice.');
      setInvoicePreview(null);
    } finally {
      setIsPreviewingInvoice(false);
    }
  };

  const handleApplyInvoiceSync = async () => {
    if (!invoicePreview) {
      await handlePreviewInvoice();
      return;
    }
    setInvoiceError('');
    setIsReviewModalOpen(true);
  };

  const [reviewError, setReviewError] = useState('');
  const [invoiceSuccess, setInvoiceSuccess] = useState('');

  const handleFinalConfirmApply = async () => {
    if (!invoicePreview || !(invoicePreview?.matched?.length > 0)) return;

    setIsApplyingInvoice(true);
    setReviewError('');
    setInvoiceError('');
    try {
      const result = await applyInvoiceStockUpdate(invoiceText, {
        preferManualBulk: useManualBulkMode,
        confirmCommand,
        stockMode: invoiceStockMode
      });
      const appliedCount = result?.applied?.length || result?.matched?.length || 0;
      const totalChanged = result?.summary?.totalDeducted || result?.summary?.totalQty || 0;
      const modeLabel = invoiceStockMode === 'add' ? 'added' : 'deducted';

      // Close both modals
      setIsReviewModalOpen(false);
      setIsInvoiceModalOpen(false);

      // Reset all invoice state
      setInvoiceText('');
      setInvoicePreview(null);
      setInvoiceError('');
      setReviewError('');

      // Show success feedback
      setInvoiceSuccess(`✅ Stock updated successfully! ${appliedCount} item(s) affected, ${totalChanged} total units ${modeLabel}.`);
      setTimeout(() => setInvoiceSuccess(''), 6000);
    } catch (error) {
      console.error('Invoice apply error:', error);
      setReviewError(error?.message || 'Failed to apply inventory update from invoice.');
    } finally {
      setIsApplyingInvoice(false);
    }
  };

  return (
    <div className="inventory-page">
      <div className="page-header">
        <div>
          <h1 className="premium-title">Inventory Management</h1>
          <p className="page-subtitle">Monitor stock levels, manage products, and track warehouse movements.</p>
        </div>
        <div className="inventory-header-actions">
          <Button variant="ghost" onClick={handleOpenInvoiceModal} className="ai-sync-btn">
            <Bot size={18} /> <span>AI Invoice Sync</span>
          </Button>
          <Button variant="primary" onClick={() => handleOpenProductModal()} className="add-product-btn">
            <Plus size={18} /> <span>Add New Product</span>
          </Button>
        </div>
      </div>

      {invoiceSuccess && (
        <div className="invoice-success-toast">
          <CheckCircle2 size={18} />
          <span>{invoiceSuccess}</span>
        </div>
      )}

      <div className="inventory-stats">
        <Card className="stat-card glass-card">
          <div className="stat-icon-box blue">
            <Package size={22} />
          </div>
          <div className="stat-info">
            <span className="label">Total Products</span>
            <span className="value">{inventory.length}</span>
          </div>
        </Card>
        <Card className="stat-card glass-card">
          <div className="stat-icon-box orange">
            <AlertTriangle size={22} />
          </div>
          <div className="stat-info">
            <span className="label">Low Stock Items</span>
            <span className="value">{lowStockItems.length}</span>
          </div>
        </Card>
        <Card className="stat-card glass-card">
          <div className="stat-icon-box red">
            <Package size={22} />
          </div>
          <div className="stat-info">
            <span className="label">Out of Stock</span>
            <span className="value">{outOfStockItems.length}</span>
          </div>
        </Card>
      </div>

      <div className="inventory-controls-strip">
        <div className="unified-filter-bar glass">
          <PremiumSearch
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search products by name or SKU..."
            suggestions={
              searchTerm ? (inventory || []).filter(p => 
                p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                p.sku?.toLowerCase().includes(searchTerm.toLowerCase())
              ).slice(0, 5).map(p => ({
                id: p.id,
                label: p.name,
                sub: `SKU: ${p.sku || 'N/A'} — Stock: ${p.current_stock}`,
                type: 'product',
                original: p
              })) : []
            }
            onSuggestionClick={(item) => {
              if (item.type === 'product') {
                setSearchTerm(item.label);
              }
            }}
          />
          <div className="filter-divider"></div>
          <div className="category-scroll-container">
            <div className="category-tabs-mini">
              {CATEGORIES.map(cat => (
                <button
                  key={cat}
                  className={`mini-tab ${categoryFilter === cat ? 'active' : ''}`}
                  onClick={() => setCategoryFilter(cat)}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <Card className="table-card premium-glass" noPadding>
        <div className="table-container">
          <table className="management-table">
            <thead>
              <tr>
                <th>Product Information</th>
                <th>Category</th>
                <th>Price</th>
                <th>Stock Availability</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredInventory.map(item => {
                const stockStatus = item.current_stock === 0 ? 'Out of Stock' :
                  item.current_stock <= item.min_stock_level ? 'Low Stock' : 'In Stock';
                const statusVariant = stockStatus === 'Out of Stock' ? 'danger' :
                  stockStatus === 'Low Stock' ? 'warning' : 'success';

                // Calculate stock percentage for the progress bar
                // Let's assume a healthy stock is 4x the min level
                const maxRef = Math.max(item.min_stock_level * 4, item.current_stock, 10);
                const stockPercent = Math.min((item.current_stock / maxRef) * 100, 100);

                return (
                  <tr key={item.id} className="inventory-row">
                    <td data-label="Product">
                      <div className="product-info-cell">
                        <div className="product-avatar">
                          <Package size={20} />
                        </div>
                        <div className="product-meta">
                          <span className="product-name">{item.name}</span>
                          <span className="product-sku">{item.sku || 'No SKU'}</span>
                        </div>
                      </div>
                    </td>
                    <td data-label="Category"><span className="category-pill">{item.category}</span></td>
                    <td data-label="Price">
                      <div className="price-cell">
                        <CurrencyIcon size={12} className="currency-icon-elite" />
                        <span className="amount-val">{Number(item.unit_price).toLocaleString()}</span>
                      </div>
                    </td>
                    <td data-label="Stock">
                      <div className="stock-visual-group">
                        <div className="stock-labels">
                          <span className="stock-count"><b>{item.current_stock}</b> items</span>
                          <span className="stock-min-label">Min: {item.min_stock_level}</span>
                        </div>
                        <div className="stock-progress-track">
                          <div
                            className={`stock-progress-bar ${statusVariant}`}
                            style={{ width: `${stockPercent}%` }}
                          ></div>
                        </div>
                      </div>
                    </td>
                    <td data-label="Status">
                      <Badge variant={statusVariant} size="sm">{stockStatus}</Badge>
                    </td>
                    <td data-label="Actions" className="text-right">
                      <div className="inventory-actions">
                        <button className="action-btn adjust" onClick={() => handleOpenAdjustModal(item)} title="Update Stock">
                          <Plus size={16} /> Stock
                        </button>
                        <button className="icon-action-btn edit" onClick={() => handleOpenProductModal(item)} title="Edit Product">
                          <Edit2 size={16} />
                        </button>
                        <button className="icon-action-btn delete" onClick={() => handleDeleteProduct(item.id)} title="Remove">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!loading && filteredInventory.length === 0 && (
                <tr>
                  <td colSpan="6" className="empty-state-cell">
                    <div className="empty-state-content">
                      <Search size={40} />
                      <h3>No products found</h3>
                      <p>Try adjusting your search or category filters.</p>
                      <Button variant="ghost" onClick={() => { setSearchTerm(''); setCategoryFilter('All'); }}>
                        Clear All Filters
                      </Button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Toy Box Special Inventory Section */}
      <div className="toy-box-inventory-section">
        <div className="section-header">
          <div className="title-group">
            <Tag size={20} className="accent-icon" />
            <h2>Serial Stock Products ({toyBoxes.length} Serials)</h2>
          </div>
          <div className="inventory-header-actions">
            <p>Each serial is now tracked per product, so identical serial numbers can exist in different products.</p>
            <Button
              variant="primary"
              onClick={() => {
                setToyBoxProductName(serialTrackedProducts[0]?.name || '');
                setIsToyBoxModalOpen(true);
              }}
              className="add-product-btn"
            >
              <Plus size={18} /> <span>Add Serials</span>
            </Button>
          </div>
        </div>

        <div className="toy-box-grid-management">
          {Object.entries(toyBoxGroups)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([productName, productBoxes]) => (
              <div key={productName} className="toy-box-product-group">
                <div className="toy-box-product-heading">
                  <span>{productName}</span>
                  <Badge variant="default" size="sm">{productBoxes.length} serials</Badge>
                </div>
                <div className="toy-box-grid-management">
                  {[...productBoxes]
                    .sort((a, b) => a.toy_box_number - b.toy_box_number)
                    .map((box) => (
                      <div key={box.id} className={`toy-box-stock-card ${box.stock_quantity === 0 ? 'out' : box.stock_quantity <= 5 ? 'low' : ''}`}>
                        <div className="box-num-badge">#{box.toy_box_number}</div>
                        <div className="stock-input-wrap">
                          <input
                            type="number"
                            min="0"
                            defaultValue={box.stock_quantity}
                            onBlur={(e) => {
                              const newVal = parseInt(e.target.value, 10);
                              if (!isNaN(newVal) && newVal !== box.stock_quantity) {
                                updateToyBoxStock(box.id, newVal);
                              }
                            }}
                            className="stock-edit-input"
                          />
                          <span className="unit-label">pcs</span>
                        </div>
                        <div className="stock-status-dot"></div>
                      </div>
                    ))}
                </div>
              </div>
            ))}
        </div>
      </div>

      {/* Product Modals remain functional but will look better with updated CSS */}
      <Modal isOpen={isProductModalOpen} onClose={() => setIsProductModalOpen(false)} title={editingProduct ? 'Edit Product Details' : 'Register New Product'}>
        <form onSubmit={handleSaveProduct} className="product-form premium-form">
          <Input label="Product Name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required placeholder="Enter full product name" />
          <div className="form-grid">
            <Input label="SKU / Identifer" value={formData.sku} onChange={(e) => setFormData({ ...formData, sku: e.target.value })} placeholder="SKU-XXX" />
            <div className="elite-select-wrapper">
              <label className="input-label">Category</label>
              <select className="elite-select" value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })}>
                {CATEGORIES.filter(c => c !== 'All').map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <ChevronDown size={14} className="elite-select-chevron" />
            </div>
          </div>
          <div className="form-grid three-cols">
            <Input label="Initial Inventory" type="number" value={formData.current_stock} onChange={(e) => setFormData({ ...formData, current_stock: parseInt(e.target.value) })} required />
            <Input label="Min Alert Level" type="number" value={formData.min_stock_level} onChange={(e) => setFormData({ ...formData, min_stock_level: parseInt(e.target.value) })} required />
            <Input 
              label={<>Fixed Price (<CurrencyIcon size={12} className="currency-icon-elite" />)</>}
              type="number" 
              value={formData.unit_price} 
              onChange={(e) => setFormData({ ...formData, unit_price: parseFloat(e.target.value) })} 
              required 
            />
          </div>
          <label className="invoice-manual-toggle">
            <input
              type="checkbox"
              checked={formData.supports_serial_tracking}
              onChange={(e) => setFormData({ ...formData, supports_serial_tracking: e.target.checked })}
            />
            <span>Enable serial-wise stock for this product</span>
          </label>
          <div className="modal-footer-actions">
            <Button variant="ghost" type="button" onClick={() => setIsProductModalOpen(false)}>Cancel</Button>
            <Button variant="primary" type="submit" className="save-btn">Save Product</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={isAdjustModalOpen} onClose={() => setIsAdjustModalOpen(false)} title="Quick Inventory Adjustment">
        <div className="adjust-stock-content premium-adjust">
          <div className="adjust-header">
            <div className="product-chip">{adjustingProduct?.category}</div>
            <h3>{adjustingProduct?.name}</h3>
            <span className="current-badge">Current Stock: {adjustingProduct?.current_stock}</span>
          </div>

          <div className="adjust-mode-toggle">
            <button className={`mode-btn restock ${adjustType === 'add' ? 'active' : ''}`} onClick={() => setAdjustType('add')}>
              <ArrowUpRight size={18} /> <span>Restock</span>
            </button>
            <button className={`mode-btn deduct ${adjustType === 'deduct' ? 'active' : ''}`} onClick={() => setAdjustType('deduct')}>
              <ArrowDownRight size={18} /> <span>Deduct</span>
            </button>
          </div>

          <div className="quantity-entry">
            <Input label="Adjustment Quantity" type="number" min="1" value={adjustAmount} onChange={(e) => setAdjustAmount(parseInt(e.target.value))} />
          </div>

          <div className="modal-footer-actions">
            <Button variant="ghost" type="button" onClick={() => setIsAdjustModalOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleAdjustStock} className="confirm-btn">Confirm Transaction</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={isToyBoxModalOpen} onClose={() => setIsToyBoxModalOpen(false)} title="Add Toy Box Serials">
        <form onSubmit={handleAddToyBoxSerials} className="product-form premium-form">
          <div className="elite-select-wrapper">
            <label className="input-label">Product</label>
            <select className="elite-select" value={toyBoxProductName} onChange={(e) => setToyBoxProductName(e.target.value)} required>
              <option value="">Select serial-tracked product</option>
              {serialTrackedProducts.map((product) => <option key={product.name} value={product.name}>{product.name}</option>)}
            </select>
            <ChevronDown size={14} className="elite-select-chevron" />
          </div>
          <label className="input-label">Serial Numbers</label>
          <textarea
            className="invoice-textarea"
            value={toyBoxSerialInput}
            onChange={(e) => setToyBoxSerialInput(e.target.value)}
            placeholder="41,42,43,44,45"
            rows={4}
            required
          />
          <Input
            label="Initial Stock Per Serial"
            type="number"
            min="0"
            value={toyBoxInitialStock}
            onChange={(e) => setToyBoxInitialStock(Math.max(0, parseInt(e.target.value, 10) || 0))}
            required
          />
          <div className="modal-footer-actions">
            <Button variant="ghost" type="button" onClick={() => setIsToyBoxModalOpen(false)}>Cancel</Button>
            <Button variant="primary" type="submit" className="save-btn">Add Serials</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={isInvoiceModalOpen} onClose={() => setIsInvoiceModalOpen(false)} title="AI Invoice → Inventory Stock Sync">
        <div className="invoice-sync-wrap">
          <p className="invoice-help-text">
            Paste your invoice lines. Manual bulk format supported: <b>toybox1 4 pis,, toybox2 10 pis,,, toybox38 5 pis</b>.
            Multiple commas/new lines/extra spaces are tolerated.
          </p>

          <div className="adjust-mode-toggle">
            <button className={`mode-btn restock ${invoiceStockMode === 'add' ? 'active' : ''}`} onClick={() => setInvoiceStockMode('add')}>
              <ArrowUpRight size={18} /> <span>Add Stock</span>
            </button>
            <button className={`mode-btn deduct ${invoiceStockMode === 'deduct' ? 'active' : ''}`} onClick={() => setInvoiceStockMode('deduct')}>
              <ArrowDownRight size={18} /> <span>Deduct Stock</span>
            </button>
          </div>

          <label className="invoice-manual-toggle">
            <input
              type="checkbox"
              checked={useManualBulkMode}
              onChange={(e) => setUseManualBulkMode(e.target.checked)}
            />
            <span>Use Manual Bulk Parser (recommended for toybox style input)</span>
          </label>

          <label className="invoice-label">Invoice Text</label>
          <textarea
            className="invoice-textarea"
            value={invoiceText}
            onChange={(e) => setInvoiceText(e.target.value)}
            placeholder={'2x Organizer\nToy Box - 3\nGift Bag x 1'}
            rows={8}
          />

          <div className="invoice-action-row">
            <Button variant="ghost" onClick={handlePreviewInvoice} disabled={isPreviewingInvoice || isApplyingInvoice}>
              {isPreviewingInvoice ? <Loader2 size={16} className="spin" /> : <Search size={16} />} Preview Detection
            </Button>
            <Button variant="primary" onClick={handleApplyInvoiceSync} disabled={isPreviewingInvoice || isApplyingInvoice}>
              <CheckCircle2 size={16} /> Review & Continue
            </Button>
          </div>

          <div className="invoice-confirm-wrap">
            <label className="invoice-label">Flow: Preview → Modal Review → Final Confirm</label>
          </div>

          {invoiceError && (
            <div className="invoice-error-box">
              <CircleAlert size={16} />
              <span>{invoiceError}</span>
            </div>
          )}

          {invoicePreview && (
            <div className="invoice-preview-panel">
              <div className="invoice-preview-summary">
                <span>Parsed: <b>{invoicePreview.summary?.lines || 0}</b></span>
                <span>Matched: <b>{invoicePreview.summary?.matchedLines || 0}</b></span>
                <span>Unmatched: <b>{invoicePreview.summary?.unmatchedLines || 0}</b></span>
                <span>Total Qty: <b>{invoicePreview.summary?.totalQty || 0}</b></span>
              </div>

              <div className="invoice-preview-grid">
                <div>
                  <h4>Matched Products</h4>
                  {invoicePreview.matched?.length ? (
                    <div className="invoice-match-list">
                      {invoicePreview.matched.map((m) => (
                        <div key={m.inventory_id} className="invoice-match-item">
                          <strong>{m.inventory_name}</strong>
                          <p>
                            {invoiceStockMode === 'add' ? 'Add' : 'Deduct'}: {m.quantity} • Stock: {m.current_stock} → {m.next_stock}
                            {m.shortfall > 0 ? ` • Shortfall: ${m.shortfall}` : ''}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="invoice-empty">No matched products detected.</p>
                  )}
                </div>

                <div>
                  <h4>Unmatched Lines</h4>
                  {invoicePreview.unmatched?.length ? (
                    <div className="invoice-unmatched-list">
                      {invoicePreview.unmatched.map((u, idx) => (
                        <div key={`${u.sourceLine}-${idx}`} className="invoice-unmatched-item">
                          <strong>{u.sourceLine}</strong>
                          {u.reason ? <p>{u.reason}</p> : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="invoice-empty">All parsed lines matched inventory.</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </Modal>

      <Modal isOpen={isReviewModalOpen} onClose={() => setIsReviewModalOpen(false)} title="Review Pending Inventory Changes">
        <div className="invoice-sync-wrap">
          <p className="invoice-help-text">
            This is a review-only step. Press final <b>Confirm</b> to apply; cancel/close/ESC/outside click will apply nothing.
          </p>

          <div className="invoice-preview-summary">
            <span>Affected Items: <b>{invoicePreview?.matched?.length || 0}</b></span>
            <span>Skipped Items: <b>{invoicePreview?.unmatched?.length || 0}</b></span>
            <span>Total Qty Change: <b>{invoicePreview?.summary?.totalQty || 0}</b></span>
          </div>

          <div className="invoice-preview-grid">
            <div>
              <h4>Matched (Will Apply)</h4>
              {invoicePreview?.matched?.length ? (
                <div className="invoice-match-list">
                  {invoicePreview.matched.map((m) => (
                    <div key={`review-${m.inventory_id}`} className="invoice-match-item">
                      <strong>{m.inventory_name}</strong>
                      <p>{invoiceStockMode === 'add' ? 'Add' : 'Deduct'}: {m.quantity} • Stock: {m.current_stock} → {m.next_stock}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="invoice-empty">No matched products. Nothing will be updated.</p>
              )}
            </div>

            <div>
              <h4>Unmatched / Skipped</h4>
              {invoicePreview?.unmatched?.length ? (
                <div className="invoice-unmatched-list">
                  {invoicePreview.unmatched.map((u, idx) => (
                    <div key={`review-unmatched-${idx}`} className="invoice-unmatched-item">
                      <strong>{u.sourceLine}</strong>
                      {u.reason ? <p>{u.reason}</p> : null}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="invoice-empty">No skipped lines.</p>
              )}
            </div>
          </div>

          {reviewError && (
            <div className="invoice-error-box">
              <CircleAlert size={16} />
              <span>{reviewError}</span>
            </div>
          )}

          <div className="modal-footer-actions">
            <Button variant="ghost" type="button" onClick={() => { setIsReviewModalOpen(false); setReviewError(''); }} disabled={isApplyingInvoice}>Cancel</Button>
            <Button variant="primary" type="button" onClick={handleFinalConfirmApply} disabled={isApplyingInvoice || !(invoicePreview?.matched?.length > 0)}>
              {isApplyingInvoice ? <Loader2 size={16} className="spin" /> : <CheckCircle2 size={16} />} Confirm
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
