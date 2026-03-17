import { useState, useRef } from 'react';
import { useOrders } from '../context/OrderContext';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Modal } from '../components/Modal';
import { Search, Plus, Package, AlertTriangle, ArrowUpRight, ArrowDownRight, Edit2, Trash2, Tag, ChevronLeft, ChevronRight } from 'lucide-react';
import './InventoryPage.css';

const CATEGORIES = ['All', 'TOY BOX', 'ORGANIZER', 'Bags', 'Accessories', 'Religious', 'Other'];

export const InventoryPage = () => {
  const { inventory, toyBoxes, loading, addInventoryItem, updateInventoryItem, deleteInventoryItem, adjustStock, updateToyBoxStock } = useOrders();
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  
  // Modal states
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [adjustingProduct, setAdjustingProduct] = useState(null);
  const [adjustAmount, setAdjustAmount] = useState(1);
  const [adjustType, setAdjustType] = useState('add'); // 'add' or 'deduct'

  const [formData, setFormData] = useState({
    name: '', sku: '', category: 'Other', current_stock: 0, min_stock_level: 5, unit_price: 0
  });

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
        unit_price: product.unit_price
      });
    } else {
      setEditingProduct(null);
      setFormData({ name: '', sku: '', category: 'Other', current_stock: 0, min_stock_level: 5, unit_price: 0 });
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

  return (
    <div className="inventory-page">
      <div className="page-header">
        <div>
          <h1 className="premium-title">Inventory Management</h1>
          <p className="page-subtitle">Monitor stock levels, manage products, and track warehouse movements.</p>
        </div>
        <Button variant="primary" onClick={() => handleOpenProductModal()} className="add-product-btn">
          <Plus size={18} /> <span>Add New Product</span>
        </Button>
      </div>

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
          <div className="search-box">
            <Search size={18} className="search-icon" />
            <input 
              type="text" 
              placeholder="Search by name or SKU..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
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
                    <td>
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
                    <td><span className="category-pill">{item.category}</span></td>
                    <td>
                      <div className="price-cell">
                        <span className="currency-symbol">৳</span>
                        <span className="amount-val">{Number(item.unit_price).toLocaleString()}</span>
                      </div>
                    </td>
                    <td>
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
                    <td>
                      <Badge variant={statusVariant} size="sm">{stockStatus}</Badge>
                    </td>
                    <td>
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
            <h2>Toy Box Designs (38 Variants)</h2>
          </div>
          <p>Direct serial stock management for the automatic distribution engine.</p>
        </div>

        <div className="toy-box-grid-management">
          {toyBoxes.sort((a,b) => a.toy_box_number - b.toy_box_number).map((box) => (
            <div key={box.id} className={`toy-box-stock-card ${box.stock_quantity === 0 ? 'out' : box.stock_quantity <= 5 ? 'low' : ''}`}>
              <div className="box-num-badge">#{box.toy_box_number}</div>
              <div className="stock-input-wrap">
                <input
                  type="number"
                  min="0"
                  defaultValue={box.stock_quantity}
                  onBlur={(e) => {
                    const newVal = parseInt(e.target.value);
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

      {/* Product Modals remain functional but will look better with updated CSS */}
      <Modal isOpen={isProductModalOpen} onClose={() => setIsProductModalOpen(false)} title={editingProduct ? 'Edit Product Details' : 'Register New Product'}>
        <form onSubmit={handleSaveProduct} className="product-form premium-form">
          <Input label="Product Name" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} required placeholder="Enter full product name" />
          <div className="form-grid">
            <Input label="SKU / Identifer" value={formData.sku} onChange={(e) => setFormData({...formData, sku: e.target.value})} placeholder="SKU-XXX" />
            <div className="select-group">
              <label className="input-label">Category</label>
              <select className="premium-select" value={formData.category} onChange={(e) => setFormData({...formData, category: e.target.value})}>
                {CATEGORIES.filter(c => c !== 'All').map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="form-grid three-cols">
            <Input label="Initial Inventory" type="number" value={formData.current_stock} onChange={(e) => setFormData({...formData, current_stock: parseInt(e.target.value)})} required />
            <Input label="Min Alert Level" type="number" value={formData.min_stock_level} onChange={(e) => setFormData({...formData, min_stock_level: parseInt(e.target.value)})} required />
            <Input label="Unit Price (৳)" type="number" value={formData.unit_price} onChange={(e) => setFormData({...formData, unit_price: parseFloat(e.target.value)})} required />
          </div>
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
    </div>
  );
};
