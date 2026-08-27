import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useOrders } from '../context/OrderContext';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Modal } from '../components/Modal';
import CurrencyIcon from '../components/CurrencyIcon';
import {
  Search, Plus, Minus, Package, AlertTriangle, ArrowUpRight, ArrowDownRight,
  Edit2, Trash2, Tag, Bot, Loader2, CheckCircle2, CircleAlert, ChevronDown, ChevronRight, Sparkles,
  TrendingUp, TrendingDown, DollarSign, BarChart2, Layers, Filter, Clock, Calendar,
  Globe, X, CheckCircle, SlidersHorizontal, ArrowUpDown, CheckSquare, RefreshCw,
  Boxes, Check, ShieldAlert, Sparkle, LayoutGrid, List
} from 'lucide-react';
import { usePersistentState } from '../utils/persistentState';
import { getSerialTrackedProducts } from '../utils/productCatalog';
import { supabase } from '../lib/supabase';
import { parseProductionText } from '../services/productionAI';
import { ProductionPaymentModal } from '../components/ProductionPaymentModal';
import { GlobalProductionPaymentModal } from '../components/GlobalProductionPaymentModal';

// Subcomponents
import { MobileInventoryCard } from './inventory/MobileInventoryCard';
import { DesktopInventoryTable } from './inventory/DesktopInventoryTable';
import { ProductDetailDrawer } from './inventory/ProductDetailDrawer';
import { InventoryFilterSheet } from './inventory/InventoryFilterSheet';
import { InventorySortSheet } from './inventory/InventorySortSheet';
import { BulkActionBar } from './inventory/BulkActionBar';
import { SerialInventorySheet } from './inventory/SerialInventorySheet';

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

  // ── Route View & Tab States ──
  const [activeTab, setActiveTab] = usePersistentState('panel:inventory:activeTab', 'catalog');
  const [searchTerm, setSearchTerm] = usePersistentState('panel:inventory:search', '');
  const [categoryFilter, setCategoryFilter] = usePersistentState('panel:inventory:category', 'All');
  const [stockStatusFilter, setStockStatusFilter] = usePersistentState('panel:inventory:stockStatus', 'all');
  const [sortBy, setSortBy] = usePersistentState('panel:inventory:sort', 'name_asc');
  const [serialOnlyFilter, setSerialOnlyFilter] = useState(false);

  // ── Sheet & Modal States ──
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const [isSortSheetOpen, setIsSortSheetOpen] = useState(false);
  const [selectedProductForDrawer, setSelectedProductForDrawer] = useState(null);
  const [isSerialSheetOpen, setIsSerialSheetOpen] = useState(false);

  // ── Selection & Bulk Action States ──
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [isBatchAdjustModalOpen, setIsBatchAdjustModalOpen] = useState(false);
  const [batchAdjustMode, setBatchAdjustMode] = useState('add');
  const [batchAdjustAmount, setBatchAdjustAmount] = useState(5);
  const [isApplyingBatch, setIsApplyingBatch] = useState(false);

  // ── Optimistic Stock Adjust Tracking ──
  const [adjustingIds, setAdjustingIds] = useState(new Set());

  // ── Product Add/Edit & Quick Adjust Modals ──
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [adjustingProduct, setAdjustingProduct] = useState(null);
  const [adjustAmount, setAdjustAmount] = useState(1);
  const [adjustType, setAdjustType] = useState('add');

  // ── Product Form Data ──
  const [formData, setFormData] = useState({
    name: '', sku: '', category: 'Other', current_stock: 0, min_stock_level: 5,
    unit_price: 0, selling_price: 0, making_cost: 0, supports_serial_tracking: false
  });

  // ── AI Invoice Sync States ──
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [invoiceText, setInvoiceText] = useState('');
  const [invoicePreview, setInvoicePreview] = useState(null);
  const [invoiceError, setInvoiceError] = useState('');
  const [reviewError, setReviewError] = useState('');
  const [invoiceSuccess, setInvoiceSuccess] = useState('');
  const [isPreviewingInvoice, setIsPreviewingInvoice] = useState(false);
  const [isApplyingInvoice, setIsApplyingInvoice] = useState(false);
  const [confirmCommand] = useState('confirm');
  const [useManualBulkMode, setUseManualBulkMode] = useState(true);
  const [invoiceStockMode, setInvoiceStockMode] = useState('add');

  // ── Toy Box Serial State ──
  const [isToyBoxModalOpen, setIsToyBoxModalOpen] = useState(false);
  const [toyBoxSerialInput, setToyBoxSerialInput] = useState('');
  const [toyBoxInitialStock, setToyBoxInitialStock] = useState(0);
  const [toyBoxProductName, setToyBoxProductName] = useState('');

  // ── Production & Ledger Tab States ──
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
  const [isAiAutofillExpanded, setIsAiAutofillExpanded] = useState(false);

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

  // AI Autofill States
  const [aiInputText, setAiInputText] = useState('');
  const [isAILoading, setIsAILoading] = useState(false);
  const [aiConfidence, setAiConfidence] = useState(null);
  const [aiFilledFields, setAiFilledFields] = useState([]);
  const [aiSource, setAiSource] = useState(null);
  const aiInputRef = useRef(null);

  // Production Toast & Modals
  const [productionToast, setProductionToast] = useState(null);
  const [paymentModalLog, setPaymentModalLog] = useState(null);
  const [isGlobalPaymentModalOpen, setIsGlobalPaymentModalOpen] = useState(false);

  const uniqueProducts = useMemo(() => {
    return Array.from(new Set(inventory.map(item => item.name))).sort();
  }, [inventory]);

  const serialTrackedProducts = useMemo(() => {
    return getSerialTrackedProducts(inventory);
  }, [inventory]);

  const toyBoxGroups = useMemo(() => {
    return (toyBoxes || []).reduce((acc, item) => {
      const key = item.product_name || 'TOY BOX';
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {});
  }, [toyBoxes]);

  // ── P&L and Summary Statistics ──
  const totalInventoryValue = useMemo(() => {
    return inventory.reduce((s, i) => s + ((Number(i.selling_price) || Number(i.unit_price) || 0) * (Number(i.current_stock) || 0)), 0);
  }, [inventory]);

  const totalCOGSValue = useMemo(() => {
    return inventory.reduce((s, i) => s + ((Number(i.making_cost) || 0) * (Number(i.current_stock) || 0)), 0);
  }, [inventory]);

  const lowStockItems = useMemo(() => {
    return inventory.filter(item => (Number(item.current_stock) || 0) <= (Number(item.min_stock_level) || 5) && (Number(item.current_stock) || 0) > 0);
  }, [inventory]);

  const outOfStockItems = useMemo(() => {
    return inventory.filter(item => (Number(item.current_stock) || 0) === 0);
  }, [inventory]);

  const inStockItems = useMemo(() => {
    return inventory.filter(item => (Number(item.current_stock) || 0) > (Number(item.min_stock_level) || 5));
  }, [inventory]);

  // ── Filtered & Sorted Inventory ──
  const filteredAndSortedInventory = useMemo(() => {
    let result = inventory.filter(item => {
      const name = (item.name || '').toLowerCase();
      const sku = (item.sku || '').toLowerCase();
      const q = searchTerm.trim().toLowerCase();
      const matchesSearch = !q || name.includes(q) || sku.includes(q);

      const matchesCategory = categoryFilter === 'All' || item.category === categoryFilter;

      const stock = Number(item.current_stock) || 0;
      const minStock = Number(item.min_stock_level) || 5;

      let matchesStock = true;
      if (stockStatusFilter === 'in_stock') {
        matchesStock = stock > minStock;
      } else if (stockStatusFilter === 'low_stock') {
        matchesStock = stock <= minStock && stock > 0;
      } else if (stockStatusFilter === 'out_of_stock') {
        matchesStock = stock === 0;
      }

      const matchesSerial = !serialOnlyFilter || item.supports_serial_tracking || item.category === 'TOY BOX';

      return matchesSearch && matchesCategory && matchesStock && matchesSerial;
    });

    // Sorting
    result.sort((a, b) => {
      const stockA = Number(a.current_stock) || 0;
      const stockB = Number(b.current_stock) || 0;
      const priceA = Number(a.selling_price) || Number(a.unit_price) || 0;
      const priceB = Number(b.selling_price) || Number(b.unit_price) || 0;
      const marginA = priceA > 0 ? ((priceA - (Number(a.making_cost) || 0)) / priceA) : 0;
      const marginB = priceB > 0 ? ((priceB - (Number(b.making_cost) || 0)) / priceB) : 0;

      if (sortBy === 'name_asc') return (a.name || '').localeCompare(b.name || '');
      if (sortBy === 'name_desc') return (b.name || '').localeCompare(a.name || '');
      if (sortBy === 'stock_asc') return stockA - stockB;
      if (sortBy === 'stock_desc') return stockB - stockA;
      if (sortBy === 'price_asc') return priceA - priceB;
      if (sortBy === 'price_desc') return priceB - priceA;
      if (sortBy === 'margin_desc') return marginB - marginA;
      return 0;
    });

    return result;
  }, [inventory, searchTerm, categoryFilter, stockStatusFilter, serialOnlyFilter, sortBy]);

  // Active Filter Count Calculation
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (categoryFilter !== 'All') count++;
    if (stockStatusFilter !== 'all') count++;
    if (serialOnlyFilter) count++;
    return count;
  }, [categoryFilter, stockStatusFilter, serialOnlyFilter]);

  const activeSortLabel = useMemo(() => {
    const map = {
      name_asc: 'Name (A→Z)',
      name_desc: 'Name (Z→A)',
      stock_asc: 'Stock (Low→High)',
      stock_desc: 'Stock (High→Low)',
      price_desc: 'Price (High→Low)',
      price_asc: 'Price (Low→High)',
      margin_desc: 'Margin %'
    };
    return map[sortBy] || 'Sort';
  }, [sortBy]);

  // ── Quick Stock Stepper Mutation ──
  const handleQuickAdjust = useCallback(async (item, delta) => {
    if (!item?.id) return;
    setAdjustingIds(prev => new Set(prev).add(item.id));
    try {
      await adjustStock(item.id, delta);
      if (selectedProductForDrawer?.id === item.id) {
        setSelectedProductForDrawer(prev => ({
          ...prev,
          current_stock: Math.max(0, (Number(prev.current_stock) || 0) + delta)
        }));
      }
    } catch (err) {
      console.error('Quick adjust error:', err);
      alert('Failed to update stock: ' + (err?.message || 'Unknown error'));
    } finally {
      setAdjustingIds(prev => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  }, [adjustStock, selectedProductForDrawer]);

  // ── Multi-Select Actions ──
  const handleToggleSelect = useCallback((id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    if (selectedIds.size === filteredAndSortedInventory.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredAndSortedInventory.map(i => i.id)));
    }
  }, [selectedIds, filteredAndSortedInventory]);

  const handleClearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setSelectionMode(false);
  }, []);

  const handleOpenBatchAdjust = (mode) => {
    setBatchAdjustMode(mode);
    setIsBatchAdjustModalOpen(true);
  };

  const handleApplyBatchAdjust = async () => {
    if (selectedIds.size === 0) return;
    setIsApplyingBatch(true);
    const delta = batchAdjustMode === 'add' ? batchAdjustAmount : -batchAdjustAmount;

    try {
      const promises = Array.from(selectedIds).map(id => adjustStock(id, delta));
      await Promise.all(promises);
      setInvoiceSuccess(`✅ Updated ${selectedIds.size} products (${delta >= 0 ? '+' : ''}${delta} units each)`);
      setTimeout(() => setInvoiceSuccess(''), 5000);
      setIsBatchAdjustModalOpen(false);
      handleClearSelection();
    } catch (err) {
      console.error('Batch adjust error:', err);
      alert('Batch adjust failed: ' + err.message);
    } finally {
      setIsApplyingBatch(false);
    }
  };

  const handleDeleteBatch = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Are you sure you want to delete ${selectedIds.size} selected products? This cannot be undone.`)) return;

    try {
      const promises = Array.from(selectedIds).map(id => deleteInventoryItem(id));
      await Promise.all(promises);
      handleClearSelection();
    } catch (err) {
      console.error('Batch delete error:', err);
      alert('Batch delete failed: ' + err.message);
    }
  };

  // ── Product Modal Open/Save ──
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
        selling_price: Number(product.selling_price) || Number(product.unit_price) || 0,
        making_cost: Number(product.making_cost) || 0,
        supports_serial_tracking: Boolean(product.supports_serial_tracking ?? (product.category === 'TOY BOX'))
      });
    } else {
      setEditingProduct(null);
      setFormData({
        name: '', sku: '', category: 'Other', current_stock: 0, min_stock_level: 5,
        unit_price: 0, selling_price: 0, making_cost: 0, supports_serial_tracking: false
      });
    }
    setIsProductModalOpen(true);
  };

  const handleSaveProduct = async (e) => {
    e.preventDefault();
    if (editingProduct) {
      await updateInventoryItem(editingProduct.id, formData);
      if (selectedProductForDrawer?.id === editingProduct.id) {
        setSelectedProductForDrawer(prev => ({ ...prev, ...formData }));
      }
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
    if (!adjustingProduct) return;
    const amount = adjustType === 'add' ? adjustAmount : -adjustAmount;
    await adjustStock(adjustingProduct.id, amount);
    if (selectedProductForDrawer?.id === adjustingProduct.id) {
      setSelectedProductForDrawer(prev => ({
        ...prev,
        current_stock: Math.max(0, (Number(prev.current_stock) || 0) + amount)
      }));
    }
    setIsAdjustModalOpen(false);
  };

  const handleDeleteProduct = async (id) => {
    if (window.confirm('Are you sure you want to delete this product?')) {
      await deleteInventoryItem(id);
      if (selectedProductForDrawer?.id === id) {
        setSelectedProductForDrawer(null);
      }
    }
  };

  const handleResetFilters = () => {
    setCategoryFilter('All');
    setStockStatusFilter('all');
    setSerialOnlyFilter(false);
    setSearchTerm('');
    setIsFilterSheetOpen(false);
  };

  // ── Toy Box Serial Handlers ──
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

  // ── AI Invoice Handlers ──
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

      setIsReviewModalOpen(false);
      setIsInvoiceModalOpen(false);
      setInvoiceText('');
      setInvoicePreview(null);
      setInvoiceError('');
      setReviewError('');

      setInvoiceSuccess(`✅ Stock updated successfully! ${appliedCount} item(s) affected, ${totalChanged} total units ${modeLabel}.`);
      setTimeout(() => setInvoiceSuccess(''), 6000);
    } catch (error) {
      console.error('Invoice apply error:', error);
      setReviewError(error?.message || 'Failed to apply inventory update from invoice.');
    } finally {
      setIsApplyingInvoice(false);
    }
  };

  // ── Production & Ledger Tab Logic ──
  const fetchProductionLogs = useCallback(async () => {
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
          query = query.eq('production_date', yesterday.toISOString().slice(0, 10));
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
        if (logDateFrom) query = query.gte('production_date', logDateFrom);
        if (logDateTo) query = query.lte('production_date', logDateTo);
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
      if (error && !error.message.includes('relation "public.factory_production_logs" does not exist')) {
        throw error;
      }
      setProductionLogs(data || []);
      setTotalLogRecords(count || 0);
    } catch (err) {
      console.warn('Error fetching production logs:', err);
    } finally {
      setIsLogsLoading(false);
    }
  }, [logSearchTerm, logProductFilter, logPaymentFilter, logDatePreset, logDateFrom, logDateTo, logSortOrder, logPage, logPageSize]);

  const fetchProductionStats = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('factory_production_logs')
        .select('product_name, quantity_ready, total_cost, payment_status, paid_amount');
      if (error && !error.message.includes('relation "public.factory_production_logs" does not exist')) throw error;

      let totalQty = 0;
      let totalCost = 0;
      const breakdownMap = {};

      (data || []).forEach(log => {
        const qty = Number(log.quantity_ready) || 0;
        const cost = Number(log.total_cost) || 0;
        const paid = Number(log.paid_amount || 0);
        const due = Math.max(0, cost - paid);

        totalQty += qty;
        totalCost += cost;

        const name = log.product_name || 'Unknown Product';
        if (!breakdownMap[name]) {
          breakdownMap[name] = { name, qty: 0, cost: 0, paid: 0, due: 0 };
        }
        breakdownMap[name].qty += qty;
        breakdownMap[name].cost += cost;
        breakdownMap[name].paid += paid;
        breakdownMap[name].due += due;
      });

      const { data: payments } = await supabase
        .from('production_payments')
        .select('amount');

      const totalPaid = (payments || []).reduce((sum, p) => sum + Number(p.amount || 0), 0);
      const totalDue = Math.max(0, totalCost - totalPaid);

      setProductionStats({
        totalQty,
        totalCost,
        totalPaid,
        totalDue,
        breakdown: Object.values(breakdownMap).sort((a, b) => b.cost - a.cost)
      });
    } catch (err) {
      console.warn('Error fetching production stats:', err);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'production') {
      fetchProductionLogs();
      fetchProductionStats();
    }
  }, [activeTab, fetchProductionLogs, fetchProductionStats]);

  const syncToInventory = async (productName, qty, color, variant) => {
    try {
      const normalizeStr = (s = '') => String(s).toLowerCase().replace(/[_\-\s]+/g, ' ').trim();
      const targetNorm = normalizeStr(productName);

      let bestMatch = null;
      let bestScore = 0;

      for (const item of inventory) {
        const itemNorm = normalizeStr(item.name);
        if (itemNorm === targetNorm) { bestMatch = item; break; }
        if (itemNorm.includes(targetNorm) || targetNorm.includes(itemNorm)) {
          const score = 0.85;
          if (score > bestScore) { bestScore = score; bestMatch = item; }
          continue;
        }
        const targetTokens = new Set(targetNorm.split(' ').filter(t => t.length > 1));
        const itemTokens = new Set(itemNorm.split(' ').filter(t => t.length > 1));
        const overlap = [...targetTokens].filter(t => itemTokens.has(t)).length;
        const score = overlap / Math.max(targetTokens.size, itemTokens.size, 1);
        if (score > bestScore) { bestScore = score; bestMatch = item; }
      }

      if (!bestMatch || bestScore < 0.35) {
        return {
          synced: false, inventoryItem: null,
          warning: `No matching inventory item found for "${productName}". Stock NOT updated.`
        };
      }

      const { error: updateError } = await supabase
        .from('inventory')
        .update({ current_stock: (bestMatch.current_stock || 0) + qty })
        .eq('id', bestMatch.id);

      if (updateError) throw updateError;

      const parts = [productName];
      if (color) parts.push(color);
      if (variant) parts.push(variant);

      await supabase.from('inventory_transactions').insert([{
        inventory_id: bestMatch.id,
        type: 'production_in',
        quantity: qty,
        note: `Factory production: ${parts.join(' ')} × ${qty} pcs`,
        order_id: null,
        created_by: null,
      }]);

      return { synced: true, inventoryItem: bestMatch, warning: null };
    } catch (err) {
      return {
        synced: false, inventoryItem: null,
        warning: `Inventory sync failed: ${err.message}`
      };
    }
  };

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
    const productName = logFormData.product_name.trim();
    const colorVal = logFormData.color.trim() || null;
    const variantVal = logFormData.variant.trim() || null;

    try {
      const payload = {
        production_date: logFormData.production_date,
        product_name: productName,
        color: colorVal,
        variant: variantVal,
        quantity_ready: qty,
        unit_cost: ucost,
        total_cost: totalCost,
        payment_status: logFormData.payment_status,
        notes: logFormData.notes.trim() || null
      };

      let error;
      if (editingLogId) {
        const res = await supabase.from('factory_production_logs').update(payload).eq('id', editingLogId);
        error = res.error;
      } else {
        const res = await supabase.from('factory_production_logs').insert([payload]);
        error = res.error;
      }
      if (error) throw error;

      let toastMsg = null;
      let toastType = 'success';

      if (!editingLogId) {
        const syncResult = await syncToInventory(productName, qty, colorVal, variantVal);
        if (syncResult.synced) {
          const itemLabel = [productName, colorVal].filter(Boolean).join(' ');
          toastMsg = `✅ ${qty} pcs of "${itemLabel}" added to ${syncResult.inventoryItem.name} inventory!`;
          toastType = 'success';
        } else if (syncResult.warning) {
          toastMsg = `⚠️ Log saved. ${syncResult.warning}`;
          toastType = 'warning';
        }
      } else {
        toastMsg = '✅ Production log updated successfully!';
        toastType = 'success';
      }

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
      setAiInputText('');
      setAiConfidence(null);
      setAiFilledFields([]);
      setAiSource(null);

      if (toastMsg) {
        setProductionToast({ type: toastType, message: toastMsg });
        setTimeout(() => setProductionToast(null), 6000);
      }

      fetchProductionLogs();
      fetchProductionStats();
    } catch (err) {
      console.error('Error saving production log:', err);
      setLogFormError(err.message || 'An error occurred while saving the log.');
    } finally {
      setIsSubmittingLog(false);
    }
  };

  const handleAIAutofill = async () => {
    const text = aiInputText.trim();
    if (!text) return;
    setIsAILoading(true);
    setAiConfidence(null);
    setAiFilledFields([]);

    try {
      const allProductNames = Array.from(new Set(inventory.map(i => i.name)));
      const result = await parseProductionText(text, allProductNames);

      const filled = [];
      const updates = {};

      if (result.product_name) {
        updates.product_name = result.product_name;
        filled.push('product_name');
        const inDropdown = uniqueProducts.includes(result.product_name);
        setIsCustomProduct(!inDropdown);
      }
      if (result.quantity_ready) { updates.quantity_ready = String(result.quantity_ready); filled.push('quantity_ready'); }
      if (result.color) { updates.color = result.color; filled.push('color'); }
      if (result.variant) { updates.variant = result.variant; filled.push('variant'); }
      if (result.unit_cost) { updates.unit_cost = String(result.unit_cost); filled.push('unit_cost'); }
      if (result.notes) { updates.notes = result.notes; filled.push('notes'); }

      if (Object.keys(updates).length > 0) {
        setLogFormData(prev => ({ ...prev, ...updates }));
        setAiFilledFields(filled);
        setAiConfidence(result.confidence || 'medium');
        setAiSource(result.source || 'ai');
      } else {
        setAiConfidence('low');
      }
    } catch (err) {
      console.error('AI autofill error:', err);
      setAiConfidence('low');
    } finally {
      setIsAILoading(false);
    }
  };

  const handleTogglePaymentStatus = async (log) => {
    if (log.payment_status !== 'Paid') {
      setPaymentModalLog(log);
      return;
    }
    if (!window.confirm('Mark this entry as Due again? This will reset the paid amount.')) return;
    try {
      const { error } = await supabase
        .from('factory_production_logs')
        .update({ payment_status: 'Due', paid_amount: 0, updated_at: new Date().toISOString() })
        .eq('id', log.id);

      await supabase.from('production_payments').delete().eq('production_log_id', log.id);
      if (error) throw error;
      fetchProductionLogs();
      fetchProductionStats();
    } catch (err) {
      console.error('Error resetting payment status:', err);
    }
  };

  const handleDeleteProductionLog = async (id) => {
    if (!window.confirm('Are you sure you want to delete this production log entry?')) return;
    try {
      const { error } = await supabase
        .from('factory_production_logs').delete().eq('id', id);
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
      if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
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
    if (end - start + 1 < maxVisible) start = Math.max(1, end - maxVisible + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  };

  return (
    <div className="inventory-page-root">
      {/* ── 1. Top Header ── */}
      <header className="inv-topbar">
        <div className="inv-topbar-header-row">
          <div className="inv-topbar-title-wrap">
            <h1 className="inv-page-heading">Inventory</h1>
            <span className="inv-item-count-badge">{filteredAndSortedInventory.length} items</span>
          </div>

          <div className="inv-topbar-actions">
            {activeTab === 'catalog' && (
              <>
                <button
                  type="button"
                  onClick={handleOpenInvoiceModal}
                  className="inv-btn-ai-sync-icon"
                  title="Sync stock from pasted invoice text"
                  aria-label="AI Invoice Sync"
                >
                  <Bot size={16} className="text-accent" />
                  <span className="hide-on-mobile">AI Sync</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleOpenProductModal()}
                  className="inv-btn-add-product"
                  aria-label="Add Product"
                  title="Add Product"
                >
                  <Plus size={18} strokeWidth={2.5} />
                  <span className="hide-on-mobile">Add Product</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Segmented Route Tab Switcher */}
        <div className="inv-tab-pills">
          <button
            type="button"
            className={`inv-tab-pill ${activeTab === 'catalog' ? 'active' : ''}`}
            onClick={() => setActiveTab('catalog')}
          >
            <Package size={14} />
            <span>Stock & Catalog</span>
          </button>

          <button
            type="button"
            className={`inv-tab-pill ${activeTab === 'production' ? 'active' : ''}`}
            onClick={() => setActiveTab('production')}
          >
            <Layers size={14} />
            <span>Production & Ledger</span>
          </button>
        </div>
      </header>

      {/* Global Invoice / Production Toast */}
      <AnimatePresence>
        {invoiceSuccess && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.96 }}
            className="inv-toast-banner success"
          >
            <CheckCircle2 size={16} />
            <span>{invoiceSuccess}</span>
            <button type="button" onClick={() => setInvoiceSuccess('')} className="toast-dismiss">
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── 2. CATALOG & STOCK TAB ── */}
      {activeTab === 'catalog' && (
        <div className="inv-catalog-view">
          {/* Compact 2-Column Summary Cards on Mobile */}
          <section className="inv-summary-two-col">
            <div
              className={`summary-compact-card ${stockStatusFilter === 'all' ? 'pill-active' : ''}`}
              onClick={() => setStockStatusFilter('all')}
            >
              <span className="summary-compact-label">RETAIL VALUE</span>
              <span className="summary-compact-val">৳{totalInventoryValue.toLocaleString('en-BD')}</span>
            </div>

            <div className="summary-compact-card">
              <span className="summary-compact-label">COGS CAPITAL</span>
              <span className="summary-compact-val">৳{totalCOGSValue.toLocaleString('en-BD')}</span>
            </div>
          </section>

          {/* ── 3. Search & Filter Bar ── */}
          <section className="inv-toolbar-card">
            {/* Full-width Search Input */}
            <div className="inv-search-row">
              <div className="inv-search-box">
                <Search size={16} className="inv-search-icon" />
                <input
                  type="text"
                  className="inv-search-input"
                  placeholder="Search products or SKU..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                {searchTerm && (
                  <button
                    type="button"
                    className="inv-search-clear-btn"
                    onClick={() => setSearchTerm('')}
                    aria-label="Clear search"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>

            {/* Filter / Sort / Select Buttons */}
            <div className="inv-filter-btn-row">
              <button
                type="button"
                className={`inv-tool-btn ${activeFiltersCount > 0 ? 'tool-active' : ''}`}
                onClick={() => setIsFilterSheetOpen(true)}
                aria-label="Open filters"
              >
                <SlidersHorizontal size={14} />
                <span>Filter</span>
                {activeFiltersCount > 0 && (
                  <span className="tool-count-dot">{activeFiltersCount}</span>
                )}
              </button>

              <button
                type="button"
                className="inv-tool-btn"
                onClick={() => setIsSortSheetOpen(true)}
                aria-label="Open sorting options"
              >
                <ArrowUpDown size={14} />
                <span className="hide-on-mobile">{activeSortLabel}</span>
                <span className="show-on-mobile-inline">Sort</span>
              </button>

              <button
                type="button"
                className={`inv-tool-btn select-toggle ${selectionMode ? 'tool-active' : ''}`}
                onClick={() => {
                  if (selectionMode) {
                    handleClearSelection();
                  } else {
                    setSelectionMode(true);
                  }
                }}
                title={selectionMode ? 'Exit multi-select mode' : 'Select products for bulk action'}
              >
                <CheckSquare size={14} />
                <span>{selectionMode ? 'Done' : 'Select'}</span>
              </button>
            </div>

            {/* Category Horizontal Scrolling Rail */}
            <div className="inv-category-scroll-stream">
              {CATEGORIES.map(cat => {
                const isActive = categoryFilter === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    className={`inv-category-pill ${isActive ? 'active' : ''}`}
                    onClick={() => setCategoryFilter(cat)}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Active Filter Chips Banner */}
          {(activeFiltersCount > 0 || searchTerm) && (
            <div className="inv-active-chips-banner">
              <span className="active-chips-label">Active Filters:</span>
              <div className="chips-list">
                {searchTerm && (
                  <span className="filter-chip">
                    Search: "{searchTerm}"
                    <button type="button" onClick={() => setSearchTerm('')}><X size={12} /></button>
                  </span>
                )}
                {categoryFilter !== 'All' && (
                  <span className="filter-chip">
                    Category: {categoryFilter}
                    <button type="button" onClick={() => setCategoryFilter('All')}><X size={12} /></button>
                  </span>
                )}
                {stockStatusFilter !== 'all' && (
                  <span className="filter-chip">
                    Status: {stockStatusFilter.replace('_', ' ')}
                    <button type="button" onClick={() => setStockStatusFilter('all')}><X size={12} /></button>
                  </span>
                )}
                {serialOnlyFilter && (
                  <span className="filter-chip">
                    Serial Tracked Only
                    <button type="button" onClick={() => setSerialOnlyFilter(false)}><X size={12} /></button>
                  </span>
                )}
                <button type="button" className="btn-clear-all-chips" onClick={handleResetFilters}>
                  Clear all
                </button>
              </div>
            </div>
          )}

          {/* ── 4. Main Product Inventory Display (Mobile List + Desktop Table) ── */}
          {loading ? (
            <div className="inv-loading-state">
              <div className="inv-skeleton-grid">
                {[1, 2, 3, 4, 5].map((n) => (
                  <div key={n} className="inv-skeleton-card" />
                ))}
              </div>
            </div>
          ) : filteredAndSortedInventory.length > 0 ? (
            <div className="inv-content-layout">
              {/* Mobile View: Product Cards List */}
              <div className="inv-mobile-list-view">
                {filteredAndSortedInventory.map((item) => (
                  <MobileInventoryCard
                    key={item.id}
                    item={item}
                    onSelectProduct={(p) => setSelectedProductForDrawer(p)}
                    onQuickAdjust={handleQuickAdjust}
                    isSelected={selectedIds.has(item.id)}
                    onToggleSelect={handleToggleSelect}
                    selectionMode={selectionMode}
                    isAdjusting={adjustingIds.has(item.id)}
                  />
                ))}
              </div>

              {/* Desktop View: Data Table */}
              <div className="inv-desktop-table-view">
                <DesktopInventoryTable
                  items={filteredAndSortedInventory}
                  selectedIds={selectedIds}
                  onToggleSelect={handleToggleSelect}
                  onSelectAll={handleSelectAll}
                  onSelectProduct={(p) => setSelectedProductForDrawer(p)}
                  onOpenProductModal={handleOpenProductModal}
                  onOpenAdjustModal={handleOpenAdjustModal}
                  onDeleteProduct={handleDeleteProduct}
                  onQuickAdjust={handleQuickAdjust}
                  adjustingIds={adjustingIds}
                />
              </div>
            </div>
          ) : (
            <div className="inv-empty-state">
              <div className="inv-empty-icon-wrap">
                <Package size={36} />
              </div>
              <h3 className="inv-empty-title">No products match your criteria</h3>
              <p className="inv-empty-desc">
                {searchTerm || activeFiltersCount > 0
                  ? 'Try modifying your search keywords or clearing active filters.'
                  : 'Get started by creating your first catalog product.'}
              </p>
              <div className="inv-empty-actions">
                {searchTerm || activeFiltersCount > 0 ? (
                  <Button variant="outline" onClick={handleResetFilters}>
                    Clear Filters & Search
                  </Button>
                ) : (
                  <Button variant="primary" onClick={() => handleOpenProductModal()}>
                    <Plus size={16} /> Add First Product
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* ── 5. Serial Tracked Inventory Compact Summary Card (Replaces inline 43 cards) ── */}
          <section className="inv-serial-summary-card">
            <div className="serial-summary-info">
              <div className="serial-summary-icon">
                <Tag size={18} className="text-accent" />
              </div>
              <div className="serial-summary-text">
                <h3 className="serial-summary-title">Serial Tracked Inventory</h3>
                <span className="serial-summary-count">{toyBoxes.length} Serials</span>
                <p className="serial-summary-desc">Track individual serial stock for products.</p>
              </div>
            </div>

            <button
              type="button"
              className="btn-view-serials"
              onClick={() => setIsSerialSheetOpen(true)}
            >
              <span>View Serials</span>
              <ChevronRight size={16} />
            </button>
          </section>
        </div>
      )}

      {/* ── 6. PRODUCTION & LEDGER TAB ── */}
      {activeTab === 'production' && (
        <div className="inv-production-view">
          {/* Production KPI Summary Grid (2x2 on mobile, 4-col on desktop) */}
          <section className="prod-stats-grid">
            <div className="prod-stat-card">
              <span className="prod-stat-label">PRODUCED</span>
              <span className="prod-stat-num">{productionStats.totalQty}</span>
            </div>

            <div className="prod-stat-card">
              <span className="prod-stat-label">PROD. COST</span>
              <span className="prod-stat-num">৳{productionStats.totalCost.toLocaleString('en-BD')}</span>
            </div>

            <div className="prod-stat-card">
              <span className="prod-stat-label">PAID</span>
              <span className="prod-stat-num text-success">৳{productionStats.totalPaid.toLocaleString('en-BD')}</span>
            </div>

            <div
              className="prod-stat-card clickable"
              onClick={() => setIsGlobalPaymentModalOpen(true)}
              title="Click to manage and pay factory dues"
            >
              <span className="prod-stat-label">OUTSTANDING DUE</span>
              <span className="prod-stat-num text-danger">৳{productionStats.totalDue.toLocaleString('en-BD')}</span>
            </div>
          </section>

          <div className="production-grid-layout">
            {/* Left/Sidebar: Log Production Form & Breakdown */}
            <div className="production-sidebar-col">
              {/* Production Form Card */}
              <div className="production-form-card">
                <div className="card-head-compact">
                  <h3 className="card-title">{editingLogId ? 'Edit Production Entry' : 'Log New Production'}</h3>
                  <p className="card-desc">Record manufacturing batches and auto-sync to inventory.</p>
                </div>

                {/* Compact AI Magic Autofill Block */}
                <div className="ai-magic-compact-toggle">
                  <div className="ai-toggle-header">
                    <div className="ai-toggle-title">
                      <Sparkles size={14} className="text-accent" />
                      <span>AI Magic Autofill</span>
                    </div>
                    <button
                      type="button"
                      className="ai-toggle-action-btn"
                      onClick={() => setIsAiAutofillExpanded(!isAiAutofillExpanded)}
                    >
                      {isAiAutofillExpanded ? 'Hide' : 'Use AI'}
                    </button>
                  </div>

                  {isAiAutofillExpanded && (
                    <div className="ai-magic-expanded-area">
                      <textarea
                        ref={aiInputRef}
                        className="ai-autofill-textarea"
                        rows={2}
                        placeholder="Describe production e.g. '5 pcs Organizer Blue'..."
                        value={aiInputText}
                        onChange={(e) => setAiInputText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                            e.preventDefault();
                            handleAIAutofill();
                          }
                        }}
                        disabled={isAILoading}
                      />
                      <button
                        type="button"
                        className="btn-ai-submit"
                        onClick={handleAIAutofill}
                        disabled={isAILoading || !aiInputText.trim()}
                      >
                        {isAILoading ? <Loader2 size={13} className="spin" /> : <Sparkles size={13} />}
                        <span>{isAILoading ? 'Parsing...' : 'Autofill Form'}</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Production Form */}
                <form onSubmit={handleSaveProductionLog} className="production-form">
                  {logFormError && <div className="form-error-toast">{logFormError}</div>}

                  <div className="form-group">
                    <label>Production Date</label>
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
                          <option value="__custom__" style={{ fontStyle: 'italic', color: 'var(--accent)' }}>+ Enter Custom Product...</option>
                        </select>
                      </div>
                    ) : (
                      <div className="custom-input-wrapper">
                        <input
                          type="text"
                          placeholder="Enter custom product name"
                          value={logFormData.product_name}
                          onChange={(e) => setLogFormData(prev => ({ ...prev, product_name: e.target.value }))}
                          required
                        />
                        <button
                          type="button"
                          className="btn-text-link"
                          onClick={() => {
                            setIsCustomProduct(false);
                            setLogFormData(prev => ({ ...prev, product_name: '' }));
                          }}
                        >
                          Select Dropdown
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="form-row-responsive">
                    <div className="form-group">
                      <label>Variant</label>
                      <input
                        type="text"
                        placeholder="e.g. Standard"
                        value={logFormData.variant}
                        onChange={(e) => setLogFormData(prev => ({ ...prev, variant: e.target.value }))}
                      />
                    </div>
                    <div className="form-group">
                      <label>Color</label>
                      <input
                        type="text"
                        placeholder="e.g. Black"
                        value={logFormData.color}
                        onChange={(e) => setLogFormData(prev => ({ ...prev, color: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="form-row-responsive">
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
                    <div className="payment-status-radio-group">
                      <label className={`radio-label-pill ${logFormData.payment_status === 'Due' ? 'active due' : ''}`}>
                        <input
                          type="radio"
                          name="payment_status"
                          value="Due"
                          checked={logFormData.payment_status === 'Due'}
                          onChange={(e) => setLogFormData(prev => ({ ...prev, payment_status: e.target.value }))}
                          style={{ display: 'none' }}
                        />
                        DUE
                      </label>
                      <label className={`radio-label-pill ${logFormData.payment_status === 'Paid' ? 'active paid' : ''}`}>
                        <input
                          type="radio"
                          name="payment_status"
                          value="Paid"
                          checked={logFormData.payment_status === 'Paid'}
                          onChange={(e) => setLogFormData(prev => ({ ...prev, payment_status: e.target.value }))}
                          style={{ display: 'none' }}
                        />
                        PAID
                      </label>
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Notes</label>
                    <textarea
                      rows="2"
                      placeholder="Optional notes or batch details..."
                      value={logFormData.notes}
                      onChange={(e) => setLogFormData(prev => ({ ...prev, notes: e.target.value }))}
                    />
                  </div>

                  <button type="submit" className="btn-save-production" disabled={isSubmittingLog}>
                    {isSubmittingLog ? <Loader2 size={15} className="spin" /> : <Layers size={15} />}
                    <span>{editingLogId ? 'Update Log' : 'Save Production Log'}</span>
                  </button>

                  {editingLogId && (
                    <button
                      type="button"
                      className="btn-cancel-edit"
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
                    </button>
                  )}
                </form>
              </div>

              {/* Product Cost Breakdown */}
              <div className="product-breakdown-card">
                <h3 className="card-title">Production Cost Breakdown</h3>
                
                {/* Mobile Breakdown Card List */}
                <div className="breakdown-mobile-list">
                  {productionStats.breakdown.map(item => (
                    <div key={item.name} className="breakdown-mobile-item">
                      <div className="breakdown-item-head">
                        <span className="breakdown-item-name">{item.name}</span>
                        <span className="breakdown-item-qty">{item.qty} pcs</span>
                      </div>
                      <div className="breakdown-item-meta">
                        <span>Cost: <strong>৳{item.cost.toLocaleString('en-BD')}</strong></span>
                        <span className="text-success">Paid: <strong>৳{item.paid.toLocaleString('en-BD')}</strong></span>
                        <span className="text-danger">Due: <strong>৳{item.due.toLocaleString('en-BD')}</strong></span>
                      </div>
                    </div>
                  ))}
                  {productionStats.breakdown.length === 0 && (
                    <div className="breakdown-empty-text">No logs recorded yet.</div>
                  )}
                </div>

                {/* Desktop Breakdown Table */}
                <div className="breakdown-desktop-table-wrap">
                  <table className="breakdown-table">
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th className="num-col">Qty</th>
                        <th className="num-col">Cost</th>
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
              </div>
            </div>

            {/* Right/Main Column: Production Ledger */}
            <div className="production-main-col">
              <div className="ledger-card">
                {/* Search & Filter Toolbar */}
                <div className="table-search-bar">
                  <div className="elite-search-wrapper">
                    <Search size={15} className="elite-search-icon" />
                    <input
                      type="text"
                      className="elite-search-input"
                      placeholder="Search production logs..."
                      value={logSearchTerm}
                      onChange={(e) => { setLogSearchTerm(e.target.value); setLogPage(1); }}
                    />
                  </div>

                  <div className="filter-actions-group">
                    <select
                      className="factory-page-size-select"
                      value={logProductFilter}
                      onChange={(e) => { setLogProductFilter(e.target.value); setLogPage(1); }}
                    >
                      <option value="All">All Products</option>
                      {uniqueProducts.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>

                    <select
                      className="factory-page-size-select"
                      value={logPaymentFilter}
                      onChange={(e) => { setLogPaymentFilter(e.target.value); setLogPage(1); }}
                    >
                      <option value="All">All Statuses</option>
                      <option value="Paid">Paid</option>
                      <option value="Due">Due</option>
                    </select>

                    <select
                      className="factory-page-size-select"
                      value={logDatePreset}
                      onChange={(e) => { setLogDatePreset(e.target.value); setLogPage(1); }}
                    >
                      <option value="all">All Time</option>
                      <option value="today">Today</option>
                      <option value="yesterday">Yesterday</option>
                      <option value="7days">7 Days</option>
                      <option value="30days">30 Days</option>
                      <option value="thisMonth">This Month</option>
                    </select>

                    <button
                      type="button"
                      onClick={() => setIsGlobalPaymentModalOpen(true)}
                      className="btn-global-pay-trigger"
                    >
                      <DollarSign size={13} /> Pay Dues
                    </button>
                  </div>
                </div>

                {/* Mobile Log Cards List */}
                <div className="mobile-log-card-list">
                  {isLogsLoading ? (
                    <div className="mobile-log-loading">
                      <Loader2 className="spin" size={20} />
                      <span>Loading logs...</span>
                    </div>
                  ) : productionLogs.length > 0 ? (
                    productionLogs.map(log => {
                      const paid = Number(log.paid_amount || 0);
                      const due = Math.max(0, Number(log.total_cost) - paid);
                      const isPaid = (log.payment_status || 'due').toLowerCase() === 'paid';

                      return (
                        <div key={log.id} className="mobile-log-card">
                          <div className="mobile-log-header">
                            <span className="mobile-log-date">{formatSheetDate(log.production_date)}</span>
                            <button
                              type="button"
                              className={`payment-status-pill ${isPaid ? 'paid' : 'due'}`}
                              onClick={() => handleTogglePaymentStatus(log)}
                            >
                              {isPaid ? <CheckCircle2 size={11} /> : <Clock size={11} />}
                              <span>{log.payment_status || 'Due'}</span>
                            </button>
                          </div>

                          <div className="mobile-log-title-row">
                            <h4 className="mobile-log-prod">{log.product_name}</h4>
                            {(log.variant || log.color) && (
                              <span className="mobile-log-variant">
                                {[log.variant, log.color].filter(Boolean).join(' · ')}
                              </span>
                            )}
                          </div>

                          <div className="mobile-log-meta-grid">
                            <div className="mobile-log-stat">
                              <span className="stat-l">QTY</span>
                              <span className="stat-v">{log.quantity_ready}</span>
                            </div>
                            <div className="mobile-log-stat">
                              <span className="stat-l">TOTAL</span>
                              <span className="stat-v">৳{Number(log.total_cost).toLocaleString('en-BD')}</span>
                            </div>
                            <div className="mobile-log-stat">
                              <span className="stat-l">PAID</span>
                              <span className="stat-v text-success">৳{paid.toLocaleString('en-BD')}</span>
                            </div>
                            <div className="mobile-log-stat">
                              <span className="stat-l">DUE</span>
                              <span className="stat-v text-danger">৳{due.toLocaleString('en-BD')}</span>
                            </div>
                          </div>

                          <div className="mobile-log-footer">
                            {!isPaid && (
                              <button
                                type="button"
                                className="mobile-log-pay-btn"
                                onClick={() => setPaymentModalLog(log)}
                              >
                                <DollarSign size={12} /> Pay Due
                              </button>
                            )}
                            <div className="mobile-log-actions-right">
                              <button
                                type="button"
                                className="mobile-log-action-btn"
                                onClick={() => handleStartEditLog(log)}
                                title="Edit entry"
                              >
                                <Edit2 size={13} />
                              </button>
                              <button
                                type="button"
                                className="mobile-log-action-btn danger"
                                onClick={() => handleDeleteProductionLog(log.id)}
                                title="Delete entry"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="mobile-log-empty">No production logs found.</div>
                  )}
                </div>

                {/* Desktop Management Table */}
                <div className="table-container desktop-only-table">
                  <table className="management-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Product</th>
                        <th>Variant / Color</th>
                        <th className="text-right">Qty</th>
                        <th className="text-right">Unit Cost</th>
                        <th className="text-right">Total Cost</th>
                        <th className="text-right">Paid / Due</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {isLogsLoading ? (
                        <tr>
                          <td colSpan="9" className="empty-state-cell">
                            <Loader2 className="spin" size={24} style={{ margin: 'auto' }} />
                            <p style={{ marginTop: '8px' }}>Loading production ledger...</p>
                          </td>
                        </tr>
                      ) : (
                        productionLogs.map(log => (
                          <tr key={log.id}>
                            <td>{formatSheetDate(log.production_date)}</td>
                            <td className="bold">{log.product_name}</td>
                            <td>
                              <div className="variant-color-badge-stack">
                                {log.variant && <span className="text-tag variant">{log.variant}</span>}
                                {log.color && <span className="text-tag color">{log.color}</span>}
                                {!log.variant && !log.color && <span className="text-muted">—</span>}
                              </div>
                            </td>
                            <td className="bold text-right">{log.quantity_ready}</td>
                            <td className="text-right">৳{Number(log.unit_cost).toLocaleString('en-BD')}</td>
                            <td className="bold text-right text-accent">৳{Number(log.total_cost).toLocaleString('en-BD')}</td>
                            <td className="text-right">
                              {(() => {
                                const paid = Number(log.paid_amount || 0);
                                const due = Math.max(0, Number(log.total_cost) - paid);
                                return (
                                  <div className="paid-due-stack">
                                    {paid > 0 && <span className="paid-val">৳{paid.toLocaleString('en-BD')} paid</span>}
                                    {due > 0 && <span className="due-val">৳{due.toLocaleString('en-BD')} due</span>}
                                    {paid === 0 && due === 0 && <span className="text-muted">—</span>}
                                  </div>
                                );
                              })()}
                            </td>
                            <td>
                              <button
                                type="button"
                                className={`payment-status-pill ${(log.payment_status || 'due').toLowerCase().replace(' ', '-')}`}
                                onClick={() => handleTogglePaymentStatus(log)}
                                title={log.payment_status === 'Paid' ? 'Fully paid — click to reset' : 'Click to record payment'}
                              >
                                {log.payment_status === 'Paid' ? <CheckCircle2 size={12} /> : <Clock size={12} />}
                                <span>{log.payment_status || 'Due'}</span>
                              </button>
                            </td>
                            <td>
                              <div className="saas-row-actions">
                                {log.payment_status !== 'Paid' && (
                                  <button
                                    className="saas-pay-btn"
                                    onClick={() => setPaymentModalLog(log)}
                                    title="Record payment"
                                  >
                                    <DollarSign size={12} /> Pay
                                  </button>
                                )}
                                <button
                                  className="saas-icon-btn"
                                  onClick={() => handleStartEditLog(log)}
                                  title="Edit entry"
                                >
                                  <Edit2 size={13} />
                                </button>
                                <button
                                  className="saas-icon-btn danger"
                                  onClick={() => handleDeleteProductionLog(log.id)}
                                  title="Delete entry"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                      {!isLogsLoading && productionLogs.length === 0 && (
                        <tr>
                          <td colSpan="9" className="empty-state-cell">No matching production logs found.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Ledger Pagination */}
                {!isLogsLoading && totalLogRecords > logPageSize && (
                  <div className="factory-pagination-footer">
                    <div className="factory-pagination-info">
                      Showing {(logPage - 1) * logPageSize + 1}-{Math.min(logPage * logPageSize, totalLogRecords)} of {totalLogRecords}
                    </div>
                    <div className="factory-pagination-actions">
                      <button
                        className="factory-page-btn"
                        onClick={() => setLogPage(prev => Math.max(1, prev - 1))}
                        disabled={logPage === 1}
                      >
                        ‹
                      </button>
                      <span className="factory-page-compact-indicator">
                        {logPage} / {Math.ceil(totalLogRecords / logPageSize)}
                      </span>
                      <button
                        className="factory-page-btn"
                        onClick={() => setLogPage(prev => Math.min(Math.ceil(totalLogRecords / logPageSize), prev + 1))}
                        disabled={logPage === Math.ceil(totalLogRecords / logPageSize)}
                      >
                        ›
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 7. Floating Multi-Select Bulk Action Bar ── */}
      <BulkActionBar
        selectedCount={selectedIds.size}
        onClearSelection={handleClearSelection}
        onOpenBatchAdjust={handleOpenBatchAdjust}
        onDeleteBatch={handleDeleteBatch}
      />

      {/* ── 8. Product Detail Drawer / Bottom Sheet ── */}
      <AnimatePresence>
        {selectedProductForDrawer && (
          <ProductDetailDrawer
            product={selectedProductForDrawer}
            isOpen={Boolean(selectedProductForDrawer)}
            onClose={() => setSelectedProductForDrawer(null)}
            onOpenEditModal={handleOpenProductModal}
            onOpenAdjustModal={handleOpenAdjustModal}
            onDeleteProduct={handleDeleteProduct}
            onQuickAdjust={handleQuickAdjust}
            isAdjusting={adjustingIds.has(selectedProductForDrawer.id)}
          />
        )}
      </AnimatePresence>

      {/* ── 9. Mobile Filter Bottom Sheet ── */}
      <AnimatePresence>
        {isFilterSheetOpen && (
          <InventoryFilterSheet
            isOpen={isFilterSheetOpen}
            onClose={() => setIsFilterSheetOpen(false)}
            categories={CATEGORIES}
            selectedCategory={categoryFilter}
            onSelectCategory={(cat) => setCategoryFilter(cat)}
            stockStatusFilter={stockStatusFilter}
            onSelectStockStatus={(st) => setStockStatusFilter(st)}
            serialOnlyFilter={serialOnlyFilter}
            onToggleSerialOnly={(val) => setSerialOnlyFilter(val)}
            onResetFilters={handleResetFilters}
            totalMatching={filteredAndSortedInventory.length}
          />
        )}
      </AnimatePresence>

      {/* ── 10. Mobile Sort Bottom Sheet ── */}
      <AnimatePresence>
        {isSortSheetOpen && (
          <InventorySortSheet
            isOpen={isSortSheetOpen}
            onClose={() => setIsSortSheetOpen(false)}
            currentSort={sortBy}
            onSelectSort={(s) => setSortBy(s)}
          />
        )}
      </AnimatePresence>

      {/* ── 11. Batch Restock/Deduct Modal ── */}
      <Modal
        isOpen={isBatchAdjustModalOpen}
        onClose={() => setIsBatchAdjustModalOpen(false)}
        title={`Batch ${batchAdjustMode === 'add' ? 'Restock' : 'Deduct'} (${selectedIds.size} Items)`}
        subtitle="Apply stock quantity change across all selected products."
      >
        <div className="batch-adjust-content">
          <div className="adjust-mode-toggle">
            <button
              type="button"
              className={`mode-btn restock ${batchAdjustMode === 'add' ? 'active' : ''}`}
              onClick={() => setBatchAdjustMode('add')}
            >
              <ArrowUpRight size={16} /> Add Stock (+)
            </button>
            <button
              type="button"
              className={`mode-btn deduct ${batchAdjustMode === 'deduct' ? 'active' : ''}`}
              onClick={() => setBatchAdjustMode('deduct')}
            >
              <ArrowDownRight size={16} /> Deduct Stock (-)
            </button>
          </div>

          <div className="quantity-entry" style={{ marginTop: '16px' }}>
            <Input
              label="Quantity per item"
              type="number"
              min="1"
              value={batchAdjustAmount}
              onChange={(e) => setBatchAdjustAmount(Math.max(1, parseInt(e.target.value, 10) || 1))}
            />
          </div>

          <div className="modal-footer-actions">
            <Button variant="ghost" type="button" onClick={() => setIsBatchAdjustModalOpen(false)} disabled={isApplyingBatch}>
              Cancel
            </Button>
            <Button variant="primary" type="button" onClick={handleApplyBatchAdjust} disabled={isApplyingBatch}>
              {isApplyingBatch ? <Loader2 size={16} className="spin" /> : <Check size={16} />}
              <span>Apply to {selectedIds.size} Products</span>
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── 12. Add/Edit Product Modal ── */}
      <Modal
        isOpen={isProductModalOpen}
        onClose={() => setIsProductModalOpen(false)}
        title={editingProduct ? 'Edit Product Details' : 'Register New Product'}
        subtitle={editingProduct ? 'Refine inventory details, stock thresholds, and prices.' : 'Create a clean product record with pricing and stock logic.'}
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
            <Input
              label="Product Name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              placeholder="Enter full product name"
            />
            <div className="form-grid">
              <Input
                label="SKU / Identifier"
                value={formData.sku}
                onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                placeholder="SKU-XXX"
              />
              <div className="elite-select-wrapper inventory-elite-select-wrapper">
                <label className="input-label">Category</label>
                <select
                  className="elite-select inventory-elite-select"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                >
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
              <Input
                label="Initial Inventory"
                type="number"
                value={formData.current_stock}
                onChange={(e) => setFormData({ ...formData, current_stock: parseInt(e.target.value, 10) || 0 })}
                required
              />
              <Input
                label="Min Alert Level"
                type="number"
                value={formData.min_stock_level}
                onChange={(e) => setFormData({ ...formData, min_stock_level: parseInt(e.target.value, 10) || 0 })}
                required
              />
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
              const sp = Number(formData.selling_price) || 0;
              const mc = Number(formData.making_cost) || 0;
              const pct = sp > 0 ? ((sp - mc) / sp * 100) : 0;
              const profit = sp - mc;
              return (
                <div className={`margin-preview-card ${profit >= 0 ? 'profit' : 'loss'}`}>
                  <div className="margin-preview-row">
                    <span>Profit per Unit</span>
                    <strong className={profit >= 0 ? 'green' : 'red'}>৳{profit.toLocaleString('en-BD')}</strong>
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

      {/* ── 13. Quick Inventory Adjustment Modal ── */}
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
            <Input label="Adjustment Quantity" type="number" min="1" value={adjustAmount} onChange={(e) => setAdjustAmount(parseInt(e.target.value, 10) || 1)} />
          </div>

          <div className="modal-footer-actions">
            <Button variant="ghost" type="button" onClick={() => setIsAdjustModalOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleAdjustStock} className="confirm-btn">Confirm Transaction</Button>
          </div>
        </div>
      </Modal>

      {/* ── 14. Toy Box Serials Modal ── */}
      <Modal isOpen={isToyBoxModalOpen} onClose={() => setIsToyBoxModalOpen(false)} title="Add Serial Stock Numbers">
        <form onSubmit={handleAddToyBoxSerials} className="product-form premium-form">
          <div className="elite-select-wrapper">
            <label className="input-label">Product</label>
            <select className="elite-select" value={toyBoxProductName} onChange={(e) => setToyBoxProductName(e.target.value)} required>
              <option value="">Select serial-tracked product</option>
              {serialTrackedProducts.map((product) => <option key={product.name} value={product.name}>{product.name}</option>)}
            </select>
            <ChevronDown size={14} className="elite-select-chevron" />
          </div>
          <label className="input-label">Serial Numbers (comma or space separated)</label>
          <textarea
            className="invoice-textarea"
            value={toyBoxSerialInput}
            onChange={(e) => setToyBoxSerialInput(e.target.value)}
            placeholder="41, 42, 43, 44, 45"
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

      {/* ── 15. AI Invoice Modal ── */}
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

      {/* ── 16. Invoice Review Confirmation Modal ── */}
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

      {/* ── 17. Production Payment Modal ── */}
      {paymentModalLog && (
        <ProductionPaymentModal
          log={paymentModalLog}
          onClose={() => setPaymentModalLog(null)}
          onRefresh={() => {
            fetchProductionLogs();
            fetchProductionStats();
          }}
        />
      )}

      {/* ── 19. Dedicated Serial Inventory Sheet ── */}
      <SerialInventorySheet
        isOpen={isSerialSheetOpen}
        onClose={() => setIsSerialSheetOpen(false)}
        toyBoxes={toyBoxes}
        toyBoxGroups={toyBoxGroups}
        onOpenAddModal={() => {
          setToyBoxProductName(serialTrackedProducts[0]?.name || '');
          setIsToyBoxModalOpen(true);
        }}
        onUpdateStock={updateToyBoxStock}
      />
    </div>
  );
};
