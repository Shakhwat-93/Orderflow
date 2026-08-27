import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Package, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight,
  Plus, Minus, Edit2, Trash2, Clock, Calendar, AlertTriangle, CheckCircle2,
  Tag, RefreshCw, BarChart2, ShieldCheck, DollarSign, ChevronRight, Layers,
  Sparkles, History
} from 'lucide-react';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import CurrencyIcon from '../../components/CurrencyIcon';
import { supabase } from '../../lib/supabase';

export const ProductDetailDrawer = ({
  product,
  isOpen,
  onClose,
  onOpenEditModal,
  onOpenAdjustModal,
  onDeleteProduct,
  onQuickAdjust,
  isAdjusting
}) => {
  const [customDelta, setCustomDelta] = useState(1);
  const [adjustMode, setAdjustMode] = useState('add'); // 'add' or 'deduct'
  const [transactions, setTransactions] = useState([]);
  const [isLoadingTx, setIsLoadingTx] = useState(false);

  // Fetch stock audit trail / movement history from inventory_transactions
  const fetchTransactions = useCallback(async () => {
    if (!product?.id) return;
    setIsLoadingTx(true);
    try {
      const { data, error } = await supabase
        .from('inventory_transactions')
        .select('*')
        .eq('inventory_id', product.id)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error && !error.message.includes('relation "public.inventory_transactions" does not exist')) {
        throw error;
      }
      setTransactions(data || []);
    } catch (err) {
      console.warn('Could not fetch product stock movements:', err);
    } finally {
      setIsLoadingTx(false);
    }
  }, [product?.id]);

  useEffect(() => {
    if (isOpen && product?.id) {
      fetchTransactions();
    }
  }, [isOpen, product?.id, fetchTransactions]);

  if (!isOpen || !product) return null;

  const stock = Number(product.current_stock) || 0;
  const minStock = Number(product.min_stock_level) || 5;
  const sellingPrice = Number(product.selling_price) || Number(product.unit_price) || 0;
  const makingCost = Number(product.making_cost) || 0;
  const profitPerUnit = sellingPrice - makingCost;
  const marginPct = sellingPrice > 0 ? (profitPerUnit / sellingPrice) * 100 : 0;
  const isProfit = profitPerUnit >= 0;

  // Stock status badge
  let stockStatus = 'In Stock';
  let statusVariant = 'success';
  if (stock === 0) {
    stockStatus = 'Out of Stock';
    statusVariant = 'danger';
  } else if (stock <= minStock) {
    stockStatus = 'Low Stock';
    statusVariant = 'warning';
  }

  const handleApplyPreset = (amount) => {
    if (isAdjusting) return;
    onQuickAdjust(product, amount);
  };

  const handleApplyCustom = () => {
    if (isAdjusting || customDelta <= 0) return;
    const delta = adjustMode === 'add' ? customDelta : -customDelta;
    onQuickAdjust(product, delta);
  };

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="drawer-backdrop"
      />

      {/* Drawer Container */}
      <motion.aside
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 280 }}
        className="product-detail-drawer"
      >
        {/* Drawer Header */}
        <div className="drawer-header">
          <div className="drawer-header-left">
            <div className="drawer-icon-wrap">
              <Package size={20} />
            </div>
            <div className="drawer-header-titles">
              <h2 className="drawer-title">{product.name}</h2>
              <div className="drawer-sku-row">
                <span className="drawer-sku">SKU: {product.sku || 'N/A'}</span>
                <span className="drawer-dot">•</span>
                <span className="drawer-cat">{product.category || 'General'}</span>
              </div>
            </div>
          </div>
          <button
            type="button"
            className="drawer-close-btn"
            onClick={onClose}
            aria-label="Close details"
          >
            <X size={18} />
          </button>
        </div>

        {/* Drawer Body Scroll */}
        <div className="drawer-body-scroll">
          {/* Stock KPI Card */}
          <div className="drawer-stock-kpi-card">
            <div className="kpi-main-row">
              <div className="kpi-left">
                <span className="kpi-label">Current Stock</span>
                <div className="kpi-val-wrap">
                  <span className={`kpi-number ${stock === 0 ? 'text-danger' : stock <= minStock ? 'text-warning' : 'text-success'}`}>
                    {stock}
                  </span>
                  <span className="kpi-unit">units available</span>
                </div>
              </div>
              <Badge variant={statusVariant} size="md">
                {stockStatus}
              </Badge>
            </div>

            <div className="kpi-sub-row">
              <span>Min Alert: <strong>{minStock} units</strong></span>
              <span>Retail Val: <strong>৳{(stock * sellingPrice).toLocaleString('en-BD')}</strong></span>
            </div>
          </div>

          {/* Quick Adjustment Controls */}
          <div className="drawer-section">
            <h4 className="drawer-section-title">Quick Stock Adjustments</h4>
            <div className="drawer-adjust-presets">
              <button
                type="button"
                className="preset-btn plus"
                disabled={isAdjusting}
                onClick={() => handleApplyPreset(1)}
              >
                +1
              </button>
              <button
                type="button"
                className="preset-btn plus"
                disabled={isAdjusting}
                onClick={() => handleApplyPreset(5)}
              >
                +5
              </button>
              <button
                type="button"
                className="preset-btn plus"
                disabled={isAdjusting}
                onClick={() => handleApplyPreset(10)}
              >
                +10
              </button>
              <button
                type="button"
                className="preset-btn minus"
                disabled={isAdjusting || stock < 1}
                onClick={() => handleApplyPreset(-1)}
              >
                -1
              </button>
              <button
                type="button"
                className="preset-btn minus"
                disabled={isAdjusting || stock < 5}
                onClick={() => handleApplyPreset(-5)}
              >
                -5
              </button>
            </div>

            {/* Custom Incrementor */}
            <div className="custom-stepper-row">
              <div className="custom-mode-pills">
                <button
                  type="button"
                  className={`custom-mode-btn ${adjustMode === 'add' ? 'active add' : ''}`}
                  onClick={() => setAdjustMode('add')}
                >
                  <Plus size={12} /> Add
                </button>
                <button
                  type="button"
                  className={`custom-mode-btn ${adjustMode === 'deduct' ? 'active deduct' : ''}`}
                  onClick={() => setAdjustMode('deduct')}
                >
                  <Minus size={12} /> Deduct
                </button>
              </div>

              <div className="custom-input-stepper">
                <input
                  type="number"
                  min="1"
                  className="custom-qty-field"
                  value={customDelta}
                  onChange={(e) => setCustomDelta(Math.max(1, parseInt(e.target.value, 10) || 1))}
                />
                <Button
                  size="sm"
                  variant="primary"
                  onClick={handleApplyCustom}
                  disabled={isAdjusting}
                >
                  Apply
                </Button>
              </div>
            </div>
          </div>

          {/* Unit Economics Breakdown */}
          <div className="drawer-section">
            <h4 className="drawer-section-title">Unit Economics</h4>
            <div className="economics-grid-card">
              <div className="econ-item">
                <span className="label">Customer Price</span>
                <span className="value">৳{sellingPrice.toLocaleString('en-BD')}</span>
              </div>
              <div className="econ-item">
                <span className="label">Making Cost</span>
                <span className="value">৳{makingCost.toLocaleString('en-BD')}</span>
              </div>
              <div className="econ-item">
                <span className="label">Margin %</span>
                <span className={`value ${isProfit ? 'text-success' : 'text-danger'}`}>
                  {marginPct.toFixed(1)}%
                </span>
              </div>
            </div>
          </div>

          {/* Live Inventory Movement History Timeline */}
          <div className="drawer-section">
            <div className="drawer-section-header-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <h4 className="drawer-section-title" style={{ margin: 0 }}>Stock Movement History</h4>
              <button
                type="button"
                className="btn-text-link"
                style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px', background: 'transparent', border: 'none', color: 'var(--ip-accent)', cursor: 'pointer' }}
                onClick={fetchTransactions}
                disabled={isLoadingTx}
              >
                <RefreshCw size={12} className={isLoadingTx ? 'spin' : ''} />
                Refresh
              </button>
            </div>

            <div className="timeline-container">
              {transactions.length > 0 ? (
                transactions.map((tx) => {
                  const qty = Number(tx.quantity) || 0;
                  const isPositive = qty > 0 || tx.type === 'production_in' || tx.type === 'manual_add' || tx.type === 'order_returned';
                  const dateStr = tx.created_at ? new Date(tx.created_at).toLocaleDateString('en-BD', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Recent';

                  const typeLabel =
                    tx.type === 'order_created' ? 'Order Outflow' :
                    tx.type === 'order_returned' ? 'Order Return (Restored)' :
                    tx.type === 'manual_add' ? 'Manual Restock' :
                    tx.type === 'manual_deduct' ? 'Manual Deduct' :
                    tx.type === 'production_in' ? 'Factory Production In' :
                    tx.type === 'invoice_sync' ? 'AI Invoice Sync' : tx.type;

                  return (
                    <div key={tx.id} className="timeline-item">
                      <div className={`timeline-icon-dot ${isPositive ? 'plus' : 'minus'}`}>
                        {isPositive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                      </div>
                      <div className="timeline-content">
                        <div className="timeline-row-top">
                          <strong className="timeline-type">{typeLabel}</strong>
                          <span className={`timeline-qty ${isPositive ? 'plus' : 'minus'}`}>
                            {isPositive ? `+${Math.abs(qty)}` : `-${Math.abs(qty)}`} pcs
                          </span>
                        </div>
                        {tx.note && <p className="timeline-note">{tx.note}</p>}
                        <span className="timeline-date">{dateStr}</span>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="timeline-empty" style={{ textAlign: 'center', padding: '20px', color: 'var(--ip-text-muted)', fontSize: '0.82rem' }}>
                  <History size={24} style={{ opacity: 0.5, margin: '0 auto 8px' }} />
                  <p>No recent movements logged for this product.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Drawer Sticky Footer Actions */}
        <div className="drawer-footer-actions">
          <Button
            variant="outline"
            onClick={() => {
              onClose();
              onOpenEditModal(product);
            }}
          >
            <Edit2 size={14} /> Edit Product
          </Button>

          <Button
            variant="ghost"
            onClick={() => {
              onClose();
              onDeleteProduct(product.id);
            }}
            style={{ color: 'var(--ip-danger)' }}
          >
            <Trash2 size={14} /> Delete
          </Button>
        </div>
      </motion.aside>
    </>
  );
};
