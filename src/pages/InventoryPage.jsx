import { useState, useEffect } from 'react';
import { useOrders } from '../context/OrderContext';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Modal } from '../components/Modal';
import CurrencyIcon from '../components/CurrencyIcon';
import {
  Search, Plus, Package, AlertTriangle, ArrowUpRight, ArrowDownRight,
  Edit2, Trash2, Tag, Bot, Loader2, CheckCircle2, CircleAlert, ChevronDown, Sparkles,
  TrendingUp, TrendingDown, DollarSign, BarChart2, Layers, Filter, Clock, Calendar, Globe
} from 'lucide-react';
import { PremiumSearch } from '../components/PremiumSearch';
import { usePersistentState } from '../utils/persistentState';
import { getSerialTrackedProducts } from '../utils/productCatalog';
import { supabase } from '../lib/supabase';
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
  const [activeTab, setActiveTab] = usePersistentState('panel:inventory:activeTab', 'catalog');

  // ── Production & Ledger States (for Inventory view) ──
  const [productionLogs, setProductionLogs] = useState([]);
  const [isLogsLoading, setIsLogsLoading] = useState(false);
  const [logSearchTerm, setLogSearchTerm] = useState('');
  const [logDatePreset, setLogDatePreset] = useState('all');
  const [logDateFrom, setLogDateFrom] = useState('');
  const [logDateTo, setLogDateTo] = useState('');
  const [logProductFilter, setLogProductFilter] = useState('All');
  const [logPaymentFilter, setLogPaymentFilter] = useState('All');
  const [logSortOrder, setLogSortOrder] = useState('newest');
  const [logPage, setLogPage] = useState(1);
  const [logPageSize, setLogPageSize] = useState(10);
  const [totalLogRecords, setTotalLogRecords] = useState(0);

  const [productionStats, setProductionStats] = useState({
    totalQty: 0,
    totalCost: 0,
    totalPaid: 0,
    totalDue: 0,
    breakdown: []
  });

  const getTodayDateString = () => {
    const today = new Date();
    const offsetMs = today.getTimezoneOffset() * 60 * 1000;
    return new Date(today.getTime() - offsetMs).toISOString().slice(0, 10);
  };

  const [logFormData, setLogFormData] = useState({
    production_date: getTodayDateString(),
    product_name: '',
    color: '',
    variant: '',
    quantity_ready: '',
    unit_cost: '',
    notes: '',
    payment_status: 'Due'
  });
  const [isCustomProduct, setIsCustomProduct] = useState(false);
  const [isSubmittingLog, setIsSubmittingLog] = useState(false);
  const [logFormError, setLogFormError] = useState('');
  const [editingLogId, setEditingLogId] = useState(null);

  const uniqueProducts = Array.from(new Set(inventory.map(item => item.name))).sort();

  const fetchProductionLogs = async () => {
    setIsLogsLoading(true);
    try {
      let query = supabase
        .from('factory_production_logs')
        .select('*', { count: 'exact' });

      if (logSearchTerm.trim()) {
        query = query.or(`product_name.ilike.%${logSearchTerm}%,color.ilike.%${logSearchTerm}%,variant.ilike.%${logSearchTerm}%,notes.ilike.%${logSearchTerm}%`);
      }

      if (logProductFilter !== 'All') {
        query = query.eq('product_name', logProductFilter);
      }

      if (logPaymentFilter !== 'All') {
        query = query.eq('payment_status', logPaymentFilter);
      }

      if (logDatePreset !== 'all') {
        const now = new Date();
        const todayStr = now.toISOString().slice(0, 10);
        
        if (logDatePreset === 'today') {
          query = query.eq('production_date', todayStr);
        } else if (logDatePreset === 'yesterday') {
          const yesterday = new Date(now);
          yesterday.setDate(now.getDate() - 1);
          const yesterdayStr = yesterday.toISOString().slice(0, 10);
          query = query.eq('production_date', yesterdayStr);
        } else if (logDatePreset === '7days') {
          const start = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
          query = query.gte('production_date', start).lte('production_date', todayStr);
        } else if (logDatePreset === '30days') {
          const start = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
          query = query.gte('production_date', start).lte('production_date', todayStr);
        } else if (logDatePreset === 'thisMonth') {
          const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
          query = query.gte('production_date', start).lte('production_date', todayStr);
        }
      } else {
        if (logDateFrom) {
          query = query.gte('production_date', logDateFrom);
        }
        if (logDateTo) {
          query = query.lte('production_date', logDateTo);
        }
      }

      if (logSortOrder === 'newest') {
        query = query.order('production_date', { ascending: false }).order('created_at', { ascending: false });
      } else if (logSortOrder === 'oldest') {
        query = query.order('production_date', { ascending: true }).order('created_at', { ascending: true });
      } else if (logSortOrder === 'cost-high') {
        query = query.order('total_cost', { ascending: false });
      } else if (logSortOrder === 'cost-low') {
        query = query.order('total_cost', { ascending: true });
      } else if (logSortOrder === 'qty-high') {
        query = query.order('quantity_ready', { ascending: false });
      }

      const from = (logPage - 1) * logPageSize;
      const to = from + logPageSize - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;
      if (error) throw error;

      setProductionLogs(data || []);
      setTotalLogRecords(count || 0);
    } catch (err) {
      console.error('Error fetching production logs:', err);
    } finally {
      setIsLogsLoading(false);
    }
  };

  const fetchProductionStats = async () => {
    try {
      const { data, error } = await supabase
        .from('factory_production_logs')
        .select('product_name, quantity_ready, total_cost, payment_status');
      if (error) throw error;

      let totalQty = 0;
      let totalCost = 0;
      let totalPaid = 0;
      let totalDue = 0;
      const breakdownMap = {};

      (data || []).forEach(log => {
        const qty = Number(log.quantity_ready) || 0;
        const cost = Number(log.total_cost) || 0;
        const isPaid = log.payment_status === 'Paid';

        totalQty += qty;
        totalCost += cost;
        if (isPaid) {
          totalPaid += cost;
        } else {
          totalDue += cost;
        }

        const name = log.product_name || 'Unknown Product';
        if (!breakdownMap[name]) {
          breakdownMap[name] = { name, qty: 0, cost: 0, paid: 0, due: 0 };
        }
        breakdownMap[name].qty += qty;
        breakdownMap[name].cost += cost;
        if (isPaid) {
          breakdownMap[name].paid += cost;
        } else {
          breakdownMap[name].due += cost;
        }
      });

      setProductionStats({
        totalQty,
        totalCost,
        totalPaid,
        totalDue,
        breakdown: Object.values(breakdownMap).sort((a, b) => b.cost - a.cost)
      });
    } catch (err) {
      console.error('Error fetching production stats:', err);
    }
  };

  useEffect(() => {
    if (activeTab === 'production') {
      fetchProductionLogs();
      fetchProductionStats();
    }
  }, [
    activeTab,
    logSearchTerm,
    logDatePreset,
    logDateFrom,
    logDateTo,
    logProductFilter,
    logPaymentFilter,
    logSortOrder,
    logPage,
    logPageSize
  ]);

  const handleSaveProductionLog = async (e) => {
    e.preventDefault();
    setLogFormError('');
    setIsSubmittingLog(true);

    const qty = parseInt(logFormData.quantity_ready, 10);
    const ucost = parseFloat(logFormData.unit_cost);

    if (!logFormData.product_name.trim()) {
      setLogFormError('Product Name is required.');
      setIsSubmittingLog(false);
      return;
    }
    if (Number.isNaN(qty) || qty <= 0) {
      setLogFormError('Quantity must be greater than 0.');
      setIsSubmittingLog(false);
      return;
    }
    if (Number.isNaN(ucost) || ucost < 0) {
      setLogFormError('Unit cost must be at least 0.');
      setIsSubmittingLog(false);
      return;
    }

    const totalCost = qty * ucost;

    try {
      const payload = {
        production_date: logFormData.production_date,
        product_name: logFormData.product_name.trim(),
        color: logFormData.color.trim() || null,
        variant: logFormData.variant.trim() || null,
        quantity_ready: qty,
        unit_cost: ucost,
        total_cost: totalCost,
        payment_status: logFormData.payment_status,
        notes: logFormData.notes.trim() || null
      };

      let error;
      if (editingLogId) {
        const res = await supabase
          .from('factory_production_logs')
          .update(payload)
          .eq('id', editingLogId);
        error = res.error;
      } else {
        const res = await supabase
          .from('factory_production_logs')
          .insert([payload]);
        error = res.error;
      }

      if (error) throw error;

      setLogFormData({
        production_date: getTodayDateString(),
        product_name: '',
        color: '',
        variant: '',
        quantity_ready: '',
        unit_cost: '',
        notes: '',
        payment_status: 'Due'
      });
      setIsCustomProduct(false);
      setEditingLogId(null);
      fetchProductionLogs();
      fetchProductionStats();
    } catch (err) {
      console.error('Error saving production log:', err);
      setLogFormError(err.message || 'An error occurred while saving the log.');
    } finally {
      setIsSubmittingLog(false);
    }
  };

  const handleTogglePaymentStatus = async (log) => {
    const nextStatus = log.payment_status === 'Paid' ? 'Due' : 'Paid';
    try {
      const { error } = await supabase
        .from('factory_production_logs')
        .update({ payment_status: nextStatus })
        .eq('id', log.id);

      if (error) throw error;
      fetchProductionLogs();
      fetchProductionStats();
    } catch (err) {
      console.error('Error toggling payment status:', err);
    }
  };

  const handleDeleteProductionLog = async (id) => {
    if (!window.confirm('Are you sure you want to delete this production log entry?')) return;

    try {
      const { error } = await supabase
        .from('factory_production_logs')
        .delete()
        .eq('id', id);

      if (error) throw error;
      fetchProductionLogs();
      fetchProductionStats();
    } catch (err) {
      console.error('Error deleting production log:', err);
    }
  };

  const handleStartEditLog = (log) => {
    setEditingLogId(log.id);
    const hasProductInDropdown = uniqueProducts.includes(log.product_name);
    
    setLogFormData({
      production_date: log.production_date,
      product_name: log.product_name,
      color: log.color || '',
      variant: log.variant || '',
      quantity_ready: String(log.quantity_ready),
      unit_cost: String(log.unit_cost),
      notes: log.notes || '',
      payment_status: log.payment_status
    });
    setIsCustomProduct(!hasProductInDropdown);
  };

  const formatSheetDate = (dateStr) => {
    if (!dateStr) return '';
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
      return dateStr;
    } catch {
      return dateStr;
    }
  };

  const getVisiblePageNumbers = (curr, total) => {
    const pages = [];
    const maxVisible = 5;
    let start = Math.max(1, curr - Math.floor(maxVisible / 2));
    let end = Math.min(total, start + maxVisible - 1);
    
    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  };

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
    name: '', sku: '', category: 'Other', current_stock: 0, min_stock_level: 5,
    unit_price: 0, selling_price: 0, making_cost: 0, supports_serial_tracking: false
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

  // --- Computed P&L stats across all inventory ---
  const totalInventoryValue = inventory.reduce((s, i) => s + ((Number(i.selling_price) || Number(i.unit_price) || 0) * (Number(i.current_stock) || 0)), 0);
  const totalCOGSValue      = inventory.reduce((s, i) => s + ((Number(i.making_cost) || 0) * (Number(i.current_stock) || 0)), 0);

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
        // selling_price falls back to unit_price for legacy records
        selling_price: Number(product.selling_price) || Number(product.unit_price) || 0,
        making_cost: Number(product.making_cost) || 0,
        supports_serial_tracking: Boolean(product.supports_serial_tracking ?? (product.category === 'TOY BOX'))
      });
    } else {
      setEditingProduct(null);
      setFormData({ name: '', sku: '', category: 'Other', current_stock: 0, min_stock_level: 5, unit_price: 0, selling_price: 0, making_cost: 0, supports_serial_tracking: false });
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

    try {
      await addToyBoxStocks(entries);
      setToyBoxSerialInput('');
      setToyBoxInitialStock(0);
      setToyBoxProductName('');
      setIsToyBoxModalOpen(false);
    } catch (error) {
      console.error('Failed to add toy box serials:', error);
      alert(error?.message || 'Failed to add serial numbers. Please try again.');
    }
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
        {activeTab === 'catalog' && (
          <div className="inventory-header-actions">
            <Button variant="ghost" onClick={handleOpenInvoiceModal} className="ai-sync-btn">
              <Bot size={18} /> <span>AI Invoice Sync</span>
            </Button>
            <Button variant="primary" onClick={() => handleOpenProductModal()} className="add-product-btn">
              <Plus size={18} /> <span>Add New Product</span>
            </Button>
          </div>
        )}
      </div>

      {invoiceSuccess && (
        <div className="invoice-success-toast">
          <CheckCircle2 size={18} />
          <span>{invoiceSuccess}</span>
        </div>
      )}

      {/* Tab Toggle */}
      <div className="factory-tabs-container" style={{ marginBottom: '24px' }}>
        <div className="factory-tabs">
          <button className={`factory-tab ${activeTab === 'catalog' ? 'active' : ''}`} onClick={() => setActiveTab('catalog')}>
            <Package size={16} /> Stock & Catalog ({inventory.length})
          </button>
          <button className={`factory-tab ${activeTab === 'production' ? 'active' : ''}`} onClick={() => setActiveTab('production')}>
            <Layers size={16} /> Production & Ledger
          </button>
        </div>
      </div>

      {/* Stats Row */}
      {activeTab === 'catalog' ? (
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
          <Card className="stat-card glass-card">
            <div className="stat-icon-box green">
              <TrendingUp size={22} />
            </div>
            <div className="stat-info">
              <span className="label">Stock Value (Retail)</span>
              <span className="value">৳{totalInventoryValue.toLocaleString()}</span>
            </div>
          </Card>
          <Card className="stat-card glass-card">
            <div className="stat-icon-box purple">
              <BarChart2 size={22} />
            </div>
            <div className="stat-info">
              <span className="label">Stock COGS (Cost)</span>
              <span className="value">৳{totalCOGSValue.toLocaleString()}</span>
            </div>
          </Card>
        </div>
      ) : (
        <div className="inventory-stats factory-stats-row">
          <Card className="stat-card glass-card factory-stat-card">
            <div className="stat-icon-box blue"><Layers size={22} /></div>
            <div className="stat-info">
              <span className="label">Total Qty Produced</span>
              <span className="value">{productionStats.totalQty}</span>
            </div>
          </Card>
          <Card className="stat-card glass-card factory-stat-card">
            <div className="stat-icon-box orange"><Tag size={22} /></div>
            <div className="stat-info">
              <span className="label">Total Cost</span>
              <span className="value">৳{productionStats.totalCost.toLocaleString('en-BD')}</span>
            </div>
          </Card>
          <Card className="stat-card glass-card factory-stat-card">
            <div className="stat-icon-box green"><CheckCircle2 size={22} /></div>
            <div className="stat-info">
              <span className="label">Total Paid</span>
              <span className="value">৳{productionStats.totalPaid.toLocaleString('en-BD')}</span>
            </div>
          </Card>
          <Card className="stat-card glass-card factory-stat-card">
            <div className="stat-icon-box red" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}><AlertTriangle size={22} /></div>
            <div className="stat-info">
              <span className="label">Total Due</span>
              <span className="value" style={{ color: '#ef4444' }}>৳{productionStats.totalDue.toLocaleString('en-BD')}</span>
            </div>
          </Card>
        </div>
      )}

      {activeTab === 'catalog' ? (
        <>
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
                <th>Price / Cost</th>
                <th>Margin</th>
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

                // Stock progress bar calculation
                const maxRef = Math.max(item.min_stock_level * 4, item.current_stock, 10);
                const stockPercent = Math.min((item.current_stock / maxRef) * 100, 100);

                // Profit margin calculation
                const sellingPrice = Number(item.selling_price) || Number(item.unit_price) || 0;
                const makingCost   = Number(item.making_cost) || 0;
                const marginPct    = sellingPrice > 0 ? ((sellingPrice - makingCost) / sellingPrice * 100) : 0;
                const isProfit     = marginPct >= 0;

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
                    <td data-label="Price / Cost">
                      <div className="price-cost-cell">
                        <div className="price-cell">
                          <CurrencyIcon size={11} className="currency-icon-elite" />
                          <span className="amount-val">{sellingPrice.toLocaleString()}</span>
                        </div>
                        {makingCost > 0 && (
                          <div className="cost-cell">
                            <span className="cost-label">Cost: </span>
                            <span className="cost-val">৳{makingCost.toLocaleString()}</span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td data-label="Margin">
                      {sellingPrice > 0 ? (
                        <span className={`margin-badge ${isProfit ? 'profit' : 'loss'}`}>
                          {isProfit ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                          {marginPct.toFixed(1)}%
                        </span>
                      ) : (
                        <span className="margin-badge neutral">—</span>
                      )}
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
      </>
      ) : (
        <div className="production-grid">
          <div className="production-sidebar-col">
            {/* Form Card */}
            <Card className="production-form-card">
              <h3 className="card-title">Log Production</h3>
              <form onSubmit={handleSaveProductionLog} className="production-form">
                {logFormError && <div className="form-error-toast">{logFormError}</div>}
                
                <div className="form-group">
                  <label>Date</label>
                  <input
                    type="date"
                    value={logFormData.production_date}
                    onChange={(e) => setLogFormData(prev => ({ ...prev, production_date: e.target.value }))}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Product Name</label>
                  {!isCustomProduct ? (
                    <div className="select-input-container">
                      <select
                        value={logFormData.product_name}
                        onChange={(e) => {
                          if (e.target.value === '__custom__') {
                            setIsCustomProduct(true);
                            setLogFormData(prev => ({ ...prev, product_name: '' }));
                          } else {
                            setLogFormData(prev => ({ ...prev, product_name: e.target.value }));
                          }
                        }}
                        required
                      >
                        <option value="">Select a Product</option>
                        {uniqueProducts.map(p => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                        <option value="__custom__" style={{ fontStyle: 'italic', color: 'var(--fp-accent)' }}>+ Enter Custom Product...</option>
                      </select>
                    </div>
                  ) : (
                    <div className="custom-input-wrapper" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <input
                        type="text"
                        placeholder="Enter custom product name"
                        value={logFormData.product_name}
                        onChange={(e) => setLogFormData(prev => ({ ...prev, product_name: e.target.value }))}
                        required
                        style={{ flex: 1 }}
                      />
                      <button 
                        type="button" 
                        className="btn-text-link" 
                        onClick={() => {
                          setIsCustomProduct(false);
                          setLogFormData(prev => ({ ...prev, product_name: '' }));
                        }}
                        style={{ fontSize: '0.8rem', whiteSpace: 'nowrap', border: 'none', background: 'transparent', color: 'var(--fp-accent)', cursor: 'pointer' }}
                      >
                        Dropdown
                      </button>
                    </div>
                  )}
                </div>

                <div className="form-row-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label>Variant</label>
                    <input
                      type="text"
                      placeholder="e.g., Standard"
                      value={logFormData.variant}
                      onChange={(e) => setLogFormData(prev => ({ ...prev, variant: e.target.value }))}
                    />
                  </div>
                  <div className="form-group">
                    <label>Color</label>
                    <input
                      type="text"
                      placeholder="e.g., Black"
                      value={logFormData.color}
                      onChange={(e) => setLogFormData(prev => ({ ...prev, color: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="form-row-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label>Quantity Ready</label>
                    <input
                      type="number"
                      min="1"
                      placeholder="0"
                      value={logFormData.quantity_ready}
                      onChange={(e) => setLogFormData(prev => ({ ...prev, quantity_ready: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Unit Cost (৳)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={logFormData.unit_cost}
                      onChange={(e) => setLogFormData(prev => ({ ...prev, unit_cost: e.target.value }))}
                      required
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Payment Status</label>
                  <div className="payment-status-radio-group" style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                    <label className={`radio-label-pill ${logFormData.payment_status === 'Due' ? 'active due' : ''}`} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '8px', border: '1px solid var(--fp-border)', borderRadius: '8px', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600 }}>
                      <input
                        type="radio"
                        name="payment_status"
                        value="Due"
                        checked={logFormData.payment_status === 'Due'}
                        onChange={(e) => setLogFormData(prev => ({ ...prev, payment_status: e.target.value }))}
                        style={{ display: 'none' }}
                      />
                      Due
                    </label>
                    <label className={`radio-label-pill ${logFormData.payment_status === 'Paid' ? 'active paid' : ''}`} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '8px', border: '1px solid var(--fp-border)', borderRadius: '8px', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600 }}>
                      <input
                        type="radio"
                        name="payment_status"
                        value="Paid"
                        checked={logFormData.payment_status === 'Paid'}
                        onChange={(e) => setLogFormData(prev => ({ ...prev, payment_status: e.target.value }))}
                        style={{ display: 'none' }}
                      />
                      Paid
                    </label>
                  </div>
                </div>

                <div className="form-group">
                  <label>Notes</label>
                  <textarea
                    rows="2"
                    placeholder="Optional notes..."
                    value={logFormData.notes}
                    onChange={(e) => setLogFormData(prev => ({ ...prev, notes: e.target.value }))}
                  />
                </div>

                <Button type="submit" variant="primary" className="btn-full-width" disabled={isSubmittingLog}>
                  {isSubmittingLog ? <Loader2 size={16} className="spin" /> : <Layers size={16} />}
                  <span>{editingLogId ? 'Update Entry' : 'Log Production'}</span>
                </Button>
                {editingLogId && (
                  <Button 
                    type="button" 
                    variant="outline" 
                    className="btn-full-width" 
                    style={{ marginTop: '8px' }}
                    onClick={() => {
                      setEditingLogId(null);
                      setLogFormData({
                        production_date: getTodayDateString(),
                        product_name: '',
                        color: '',
                        variant: '',
                        quantity_ready: '',
                        unit_cost: '',
                        notes: '',
                        payment_status: 'Due'
                      });
                      setIsCustomProduct(false);
                    }}
                  >
                    Cancel Edit
                  </Button>
                )}
              </form>
            </Card>

            {/* Product Cost Breakdown Card */}
            <Card className="product-breakdown-card">
              <h3 className="card-title">Cost Breakdown</h3>
              <div className="breakdown-table-wrapper">
                <table className="breakdown-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th className="num-col">Qty</th>
                      <th className="num-col">Total Cost</th>
                      <th className="num-col">Paid</th>
                      <th className="num-col">Due</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productionStats.breakdown.map(item => (
                      <tr key={item.name}>
                        <td className="prod-name-col" title={item.name}>{item.name}</td>
                        <td className="num-col bold">{item.qty}</td>
                        <td className="num-col">৳{item.cost.toLocaleString('en-BD')}</td>
                        <td className="num-col green">৳{item.paid.toLocaleString('en-BD')}</td>
                        <td className="num-col red">৳{item.due.toLocaleString('en-BD')}</td>
                      </tr>
                    ))}
                    {productionStats.breakdown.length === 0 && (
                      <tr>
                        <td colSpan="5" className="empty-state-cell">No logs entered yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          <div className="production-main-col">
            {/* Ledger Table & Filters Card */}
            <Card className="ledger-card" noPadding>
              <div className="table-search-bar">
                <div className="elite-search-wrapper">
                  <Filter size={18} className="elite-search-icon" />
                  <input
                    type="text"
                    className="elite-search-input"
                    placeholder="Search by product, variant, color or notes..."
                    value={logSearchTerm}
                    onChange={(e) => { setLogSearchTerm(e.target.value); setLogPage(1); }}
                  />
                </div>

                <div className="filter-actions-group">
                  <select
                    className="factory-page-size-select"
                    style={{ minWidth: '130px' }}
                    value={logProductFilter}
                    onChange={(e) => { setLogProductFilter(e.target.value); setLogPage(1); }}
                  >
                    <option value="All">All Products</option>
                    {uniqueProducts.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>

                  <select
                    className="factory-page-size-select"
                    style={{ minWidth: '110px' }}
                    value={logPaymentFilter}
                    onChange={(e) => { setLogPaymentFilter(e.target.value); setLogPage(1); }}
                  >
                    <option value="All">All Statuses</option>
                    <option value="Paid">Paid</option>
                    <option value="Due">Due</option>
                  </select>

                  <select
                    className="factory-page-size-select"
                    style={{ minWidth: '130px' }}
                    value={logDatePreset}
                    onChange={(e) => { setLogDatePreset(e.target.value); setLogPage(1); }}
                  >
                    <option value="all">All Time</option>
                    <option value="today">Today</option>
                    <option value="yesterday">Yesterday</option>
                    <option value="7days">Last 7 Days</option>
                    <option value="30days">Last 30 Days</option>
                    <option value="thisMonth">This Month</option>
                  </select>
                </div>
              </div>

              {/* Custom Date Picker Fields */}
              {logDatePreset === 'all' && (
                <div className="custom-date-row" style={{ display: 'flex', gap: '12px', padding: '10px 20px', borderBottom: '1px solid var(--fp-border-row)', background: 'var(--fp-input-bg)' }}>
                  <div className="date-field" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--fp-text-sub)' }}>From:</span>
                    <input
                      type="date"
                      style={{ padding: '4px 8px', fontSize: '0.8rem', borderRadius: '6px', border: '1px solid var(--fp-border)', background: 'var(--fp-card)', color: 'var(--fp-text)' }}
                      value={logDateFrom}
                      onChange={(e) => { setLogDateFrom(e.target.value); setLogPage(1); }}
                    />
                  </div>
                  <div className="date-field" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--fp-text-sub)' }}>To:</span>
                    <input
                      type="date"
                      style={{ padding: '4px 8px', fontSize: '0.8rem', borderRadius: '6px', border: '1px solid var(--fp-border)', background: 'var(--fp-card)', color: 'var(--fp-text)' }}
                      value={logDateTo}
                      onChange={(e) => { setLogDateTo(e.target.value); setLogPage(1); }}
                    />
                  </div>
                  {(logDateFrom || logDateTo) && (
                    <button
                      className="btn-text-link"
                      style={{ fontSize: '0.75rem', color: '#ef4444', border: 'none', background: 'transparent', cursor: 'pointer' }}
                      onClick={() => { setLogDateFrom(''); setLogDateTo(''); setLogPage(1); }}
                    >
                      Clear Range
                    </button>
                  )}
                </div>
              )}

              <div className="table-container">
                <table className="management-table">
                  <thead>
                    <tr>
                      <th style={{ width: '100px' }}>Date</th>
                      <th>Product</th>
                      <th>Variant/Color</th>
                      <th style={{ width: '80px', textAlign: 'right' }}>Qty</th>
                      <th style={{ width: '100px', textAlign: 'right' }}>Unit Cost</th>
                      <th style={{ width: '110px', textAlign: 'right' }}>Total Cost</th>
                      <th style={{ width: '100px' }}>Status</th>
                      <th style={{ width: '110px' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLogsLoading ? (
                      <tr>
                        <td colSpan="8" className="empty-state-cell">
                          <Loader2 className="spin" size={24} style={{ margin: 'auto' }} />
                          <p style={{ marginTop: '8px' }}>Loading production ledger...</p>
                        </td>
                      </tr>
                    ) : (
                      productionLogs.map(log => (
                        <tr key={log.id}>
                          <td>{formatSheetDate(log.production_date)}</td>
                          <td className="bold" style={{ color: 'var(--fp-text)' }}>{log.product_name}</td>
                          <td>
                            <div className="variant-color-badge-stack" style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                              {log.variant && <span className="text-tag variant" style={{ fontSize: '0.72rem', padding: '2px 6px', background: 'var(--fp-btn-bg)', color: 'var(--fp-text-sub)', borderRadius: '4px' }}>{log.variant}</span>}
                              {log.color && <span className="text-tag color" style={{ fontSize: '0.72rem', padding: '2px 6px', background: 'var(--fp-accent-bg)', color: 'var(--fp-accent)', borderRadius: '4px' }}>{log.color}</span>}
                              {!log.variant && !log.color && <span style={{ color: 'var(--fp-text-muted)', fontSize: '0.75rem' }}>—</span>}
                            </div>
                          </td>
                          <td className="bold" style={{ textAlign: 'right' }}>{log.quantity_ready}</td>
                          <td style={{ textAlign: 'right' }}>৳{log.unit_cost.toLocaleString('en-BD')}</td>
                          <td className="bold" style={{ textAlign: 'right', color: 'var(--fp-accent)' }}>৳{log.total_cost.toLocaleString('en-BD')}</td>
                          <td>
                            <button
                              type="button"
                              className={`payment-status-pill ${log.payment_status.toLowerCase()}`}
                              onClick={() => handleTogglePaymentStatus(log)}
                              title="Click to toggle payment status"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px', borderRadius: '12px', border: '1px solid transparent', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}
                            >
                              {log.payment_status === 'Paid' ? <CheckCircle2 size={12} /> : <Clock size={12} />}
                              <span>{log.payment_status}</span>
                            </button>
                          </td>
                          <td>
                            <div className="saas-row-actions" style={{ display: 'flex', gap: '6px' }}>
                              <button className="saas-icon-btn" title="Edit Log Entry" onClick={() => handleStartEditLog(log)} style={{ padding: '6px', borderRadius: '6px', border: '1px solid var(--fp-border)', background: 'var(--fp-card)', color: 'var(--fp-text-sub)', cursor: 'pointer' }}>
                                <Edit2 size={13} />
                              </button>
                              <button className="saas-icon-btn danger" title="Delete Log Entry" onClick={() => handleDeleteProductionLog(log.id)} style={{ padding: '6px', borderRadius: '6px', border: '1px solid rgba(239, 68, 68, 0.15)', background: 'rgba(239, 68, 68, 0.05)', color: '#ef4444', cursor: 'pointer' }}>
                                <AlertTriangle size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                    {!isLogsLoading && productionLogs.length === 0 && (
                      <tr>
                        <td colSpan="8" className="empty-state-cell">No matching production logs found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Ledger Pagination */}
              {!isLogsLoading && totalLogRecords > logPageSize && (
                <div className="factory-pagination-footer" style={{ borderTop: '1px solid var(--fp-border-row)', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--fp-card)' }}>
                  <div className="factory-pagination-info" style={{ fontSize: '0.8rem', color: 'var(--fp-text-muted)', fontWeight: 500 }}>
                    Showing {(logPage - 1) * logPageSize + 1}-
                    {Math.min(logPage * logPageSize, totalLogRecords)} of {totalLogRecords} records
                  </div>
                  <div className="factory-pagination-actions" style={{ display: 'flex', gap: '6px' }}>
                    <button
                      className="factory-page-btn"
                      onClick={() => setLogPage(prev => Math.max(1, prev - 1))}
                      disabled={logPage === 1}
                      style={{ padding: '6px 12px', fontSize: '0.8rem', borderRadius: '6px', border: '1px solid var(--fp-btn-border)', background: 'var(--fp-btn-bg)', color: 'var(--fp-text-sub)', cursor: 'pointer' }}
                    >
                      Previous
                    </button>
                    <div className="factory-page-numbers" style={{ display: 'flex', gap: '4px' }}>
                      {getVisiblePageNumbers(logPage, Math.ceil(totalLogRecords / logPageSize)).map((pageNumber) => (
                        <button
                          key={pageNumber}
                          className={`factory-page-btn factory-page-num ${logPage === pageNumber ? 'active' : ''}`}
                          onClick={() => setLogPage(pageNumber)}
                          style={{ minWidth: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 600, borderRadius: '6px', border: '1px solid var(--fp-btn-border)', background: logPage === pageNumber ? 'var(--fp-accent)' : 'transparent', color: logPage === pageNumber ? '#fff' : 'var(--fp-text-sub)', cursor: 'pointer' }}
                        >
                          {pageNumber}
                        </button>
                      ))}
                    </div>
                    <button
                      className="factory-page-btn"
                      onClick={() => setLogPage(prev => Math.min(Math.ceil(totalLogRecords / logPageSize), prev + 1))}
                      disabled={logPage === Math.ceil(totalLogRecords / logPageSize)}
                      style={{ padding: '6px 12px', fontSize: '0.8rem', borderRadius: '6px', border: '1px solid var(--fp-btn-border)', background: 'var(--fp-btn-bg)', color: 'var(--fp-text-sub)', cursor: 'pointer' }}
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      {/* Product Modals remain functional but will look better with updated CSS */}
      <Modal
        isOpen={isProductModalOpen}
        onClose={() => setIsProductModalOpen(false)}
        title={editingProduct ? 'Edit Product Details' : 'Register New Product'}
        subtitle={editingProduct ? 'Refine inventory details, stock thresholds, and price without breaking flow.' : 'Create a clean product record with pricing and stock logic.'}
      >
        <form onSubmit={handleSaveProduct} className="product-form premium-form product-modal-shell">
          <div className="modal-hero-card">
            <div className="modal-hero-icon product">
              <Package size={20} />
            </div>
            <div className="modal-hero-copy">
              <span className="modal-hero-eyebrow">Catalog Setup</span>
              <h3 className="modal-hero-title">{editingProduct ? 'Polish this inventory record' : 'Add a new product with confidence'}</h3>
              <p className="modal-hero-text">Keep identity, stock alerts, and pricing structured so inventory stays clean, searchable, and premium.</p>
            </div>
          </div>

          <section className="inventory-form-section">
            <div className="inventory-form-section-head">
              <span className="section-kicker">Product Identity</span>
              <p>Define how the item appears across search, category filters, and table rows.</p>
            </div>
            <Input label="Product Name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required placeholder="Enter full product name" />
            <div className="form-grid">
              <Input label="SKU / Identifier" value={formData.sku} onChange={(e) => setFormData({ ...formData, sku: e.target.value })} placeholder="SKU-XXX" />
              <div className="elite-select-wrapper inventory-elite-select-wrapper">
                <label className="input-label">Category</label>
                <select className="elite-select inventory-elite-select" value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })}>
                  {CATEGORIES.filter(c => c !== 'All').map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <ChevronDown size={14} className="elite-select-chevron" />
              </div>
            </div>
          </section>

          <section className="inventory-form-section">
            <div className="inventory-form-section-head">
              <span className="section-kicker">Stock & Pricing</span>
              <p>Set quantity thresholds, selling price, and production cost for profit tracking.</p>
            </div>
            <div className="form-grid">
              <Input label="Initial Inventory" type="number" value={formData.current_stock} onChange={(e) => setFormData({ ...formData, current_stock: parseInt(e.target.value) })} required />
              <Input label="Min Alert Level" type="number" value={formData.min_stock_level} onChange={(e) => setFormData({ ...formData, min_stock_level: parseInt(e.target.value) })} required />
            </div>
            <div className="form-grid">
              <Input
                label={<>Selling Price (<CurrencyIcon size={12} className="currency-icon-elite" />)</>}
                type="number"
                value={formData.selling_price}
                onChange={(e) => setFormData({ ...formData, selling_price: parseFloat(e.target.value) || 0 })}
                required
                placeholder="Customer-facing price"
              />
              <Input
                label={<>Making Cost (<CurrencyIcon size={12} className="currency-icon-elite" />) — Production</>}
                type="number"
                value={formData.making_cost}
                onChange={(e) => setFormData({ ...formData, making_cost: parseFloat(e.target.value) || 0 })}
                placeholder="Your cost to produce"
              />
            </div>

            {/* Live Profit Margin Preview */}
            {formData.selling_price > 0 && (() => {
              const sp  = Number(formData.selling_price) || 0;
              const mc  = Number(formData.making_cost)   || 0;
              const pct = sp > 0 ? ((sp - mc) / sp * 100) : 0;
              const profit = sp - mc;
              return (
                <div className={`margin-preview-card ${profit >= 0 ? 'profit' : 'loss'}`}>
                  <div className="margin-preview-row">
                    <span>Profit per Unit</span>
                    <strong className={profit >= 0 ? 'green' : 'red'}>৳{profit.toLocaleString()}</strong>
                  </div>
                  <div className="margin-preview-row">
                    <span>Profit Margin</span>
                    <strong className={profit >= 0 ? 'green' : 'red'}>{pct.toFixed(1)}%</strong>
                  </div>
                </div>
              );
            })()}
          </section>

          <label className="feature-toggle-row">
            <input
              type="checkbox"
              checked={formData.supports_serial_tracking}
              onChange={(e) => setFormData({ ...formData, supports_serial_tracking: e.target.checked })}
            />
            <span className="feature-toggle-copy">
              <strong>Enable serial-wise stock tracking</strong>
              <small>Use this for products that need per-unit inventory control like Toy Box variants.</small>
            </span>
          </label>

          <div className="modal-footer-actions">
            <Button variant="ghost" type="button" onClick={() => setIsProductModalOpen(false)}>Cancel</Button>
            <Button variant="primary" type="submit" className="save-btn">{editingProduct ? 'Update Product' : 'Save Product'}</Button>
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
        <div className="invoice-sync-wrap invoice-modal-shell">
          <div className="modal-hero-card invoice-hero-card">
            <div className="modal-hero-icon invoice">
              <Bot size={20} />
            </div>
            <div className="modal-hero-copy">
              <span className="modal-hero-eyebrow">Smart Stock Workflow</span>
              <h3 className="modal-hero-title">Paste invoice lines and let the parser organize the update</h3>
              <p className="modal-hero-text">
                Manual bulk format supported: <b>toybox1 4 pis,, toybox2 10 pis,,, toybox38 5 pis</b>. Multiple commas, line breaks, and extra spaces are handled.
              </p>
            </div>
          </div>

          <div className="invoice-surface-card">
            <div className="adjust-mode-toggle">
              <button className={`mode-btn restock ${invoiceStockMode === 'add' ? 'active' : ''}`} onClick={() => setInvoiceStockMode('add')}>
                <ArrowUpRight size={18} /> <span>Add Stock</span>
              </button>
              <button className={`mode-btn deduct ${invoiceStockMode === 'deduct' ? 'active' : ''}`} onClick={() => setInvoiceStockMode('deduct')}>
                <ArrowDownRight size={18} /> <span>Deduct Stock</span>
              </button>
            </div>

            <label className="invoice-manual-toggle invoice-manual-toggle--surface">
              <input
                type="checkbox"
                checked={useManualBulkMode}
                onChange={(e) => setUseManualBulkMode(e.target.checked)}
              />
              <span>Use Manual Bulk Parser (recommended for toybox style input)</span>
            </label>
          </div>

          <div className="invoice-surface-card invoice-editor-card">
            <div className="inventory-form-section-head compact">
              <span className="section-kicker">Invoice Input</span>
              <p>Paste line items naturally. The preview step will summarize matched, unmatched, and quantity changes.</p>
            </div>
            <label className="invoice-label">Invoice Text</label>
            <textarea
              className="invoice-textarea"
              value={invoiceText}
              onChange={(e) => setInvoiceText(e.target.value)}
              placeholder={'2x Organizer\nToy Box - 3\nGift Bag x 1'}
              rows={8}
            />
          </div>

          <div className="invoice-action-row">
            <Button variant="ghost" onClick={handlePreviewInvoice} disabled={isPreviewingInvoice || isApplyingInvoice}>
              {isPreviewingInvoice ? <Loader2 size={16} className="spin" /> : <Search size={16} />} Preview Detection
            </Button>
            <Button variant="primary" onClick={handleApplyInvoiceSync} disabled={isPreviewingInvoice || isApplyingInvoice}>
              <CheckCircle2 size={16} /> Review & Continue
            </Button>
          </div>

          <div className="invoice-confirm-wrap invoice-flow-note">
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
