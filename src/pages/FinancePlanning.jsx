import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import {
  TrendingUp, DollarSign, Target, Percent, AlertCircle, Sparkles,
  ArrowRight, ShieldAlert, Check, X, RefreshCw, Layers, ArrowUpRight,
  ArrowDownRight, HelpCircle, Save, ChevronDown, CheckCircle, Search,
  Eye, EyeOff, ShieldCheck, Landmark
} from 'lucide-react';
import './FinancePlanning.css';

export const FinancePlanning = () => {
  const { hasAnyRole } = useAuth();
  
  // Date configuration
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return `${months[d.getMonth()]} ${d.getFullYear()}`;
  });

  const monthOptions = useMemo(() => {
    const list = [];
    const d = new Date();
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    for (let i = -6; i <= 6; i++) {
      const targetDate = new Date(d.getFullYear(), d.getMonth() + i, 1);
      list.push(`${months[targetDate.getMonth()]} ${targetDate.getFullYear()}`);
    }
    return list;
  }, []);

  // Constants
  const DEFAULT_RETURN_FEE = 60; // BDT per returned parcel

  // State Management
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [inventoryList, setInventoryList] = useState([]);
  const [financePlans, setFinancePlans] = useState([]);
  const [actualOrders, setActualOrders] = useState([]);
  const [contentPlans, setContentPlans] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false); // default to false on all devices for simpler view
  
  // Return fee config state
  const [returnFee, setReturnFee] = useState(DEFAULT_RETURN_FEE);
  const [isEditingReturnFee, setIsEditingReturnFee] = useState(false);
  const [tempReturnFee, setTempReturnFee] = useState(DEFAULT_RETURN_FEE);

  // Grid editing states
  const [gridData, setGridData] = useState([]); // Draft state of the target grid
  const [editedCells, setEditedCells] = useState({}); // Tracking cell changes

  // Risk confirmation modal state
  const [riskModal, setRiskModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    changes: [],
    onConfirm: null,
    onCancel: null
  });

  // Parse selectedMonth to timestamps
  const monthRange = useMemo(() => {
    const [monthName, yearStr] = selectedMonth.split(' ');
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const monthIdx = months.indexOf(monthName);
    const start = new Date(parseInt(yearStr), monthIdx, 1, 0, 0, 0, 0);
    const end = new Date(parseInt(yearStr), monthIdx + 1, 0, 23, 59, 59, 999);
    return { start, end };
  }, [selectedMonth]);

  // Load inventory list
  const fetchInventory = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('inventory')
        .select('*')
        .order('name', { ascending: true });
      if (error) throw error;
      return data || [];
    } catch (e) {
      console.error('Failed to load inventory:', e);
      return [];
    }
  }, []);

  // Load finance plans
  const fetchFinancePlans = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('finance_plans')
        .select('*')
        .eq('month', selectedMonth);
      if (error) throw error;
      return data || [];
    } catch (e) {
      console.error('Failed to load finance plans:', e);
      return [];
    }
  }, [selectedMonth]);

  // Load content plans
  const fetchContentPlans = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('content_plans')
        .select('*')
        .eq('month', selectedMonth);
      if (error) throw error;
      return data || [];
    } catch (e) {
      console.error('Failed to load content plans:', e);
      return [];
    }
  }, [selectedMonth]);

  // Load orders
  const fetchActualOrders = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('product_name, status, amount, created_at, quantity')
        .gte('created_at', monthRange.start.toISOString())
        .lte('created_at', monthRange.end.toISOString());
      if (error) throw error;
      return data || [];
    } catch (e) {
      console.error('Failed to load orders:', e);
      return [];
    }
  }, [monthRange]);

  // Main aggregator
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [inv, plans, orders, contents] = await Promise.all([
        fetchInventory(),
        fetchFinancePlans(),
        fetchActualOrders(),
        fetchContentPlans()
      ]);

      setInventoryList(inv);
      setFinancePlans(plans);
      setActualOrders(orders);
      setContentPlans(contents);

      const rows = inv.map(product => {
        const existingPlan = plans.find(p => p.product_id === product.id || p.product_name.toLowerCase() === product.name.toLowerCase());
        
        return {
          id: existingPlan?.id || null,
          product_id: product.id,
          product_name: product.name,
          target_sales_qty: existingPlan ? existingPlan.target_sales_qty : 0,
          mrp: existingPlan ? Number(existingPlan.mrp) : Number(product.selling_price || 0),
          lifting_cost: existingPlan ? Number(existingPlan.lifting_cost) : Number(product.making_cost || product.unit_price || 0),
          packing_cost: existingPlan ? Number(existingPlan.packing_cost) : 50,
          cod_cost: existingPlan ? Number(existingPlan.cod_cost) : 6,
          ad_cost_unit_bdt: existingPlan ? Number(existingPlan.ad_cost_unit_bdt) : 100,
          ad_cost_unit_usd: existingPlan ? Number(existingPlan.ad_cost_unit_usd) : 1.0,
          opex_cost_unit: existingPlan ? Number(existingPlan.opex_cost_unit) : 100,
        };
      });

      setGridData(rows);
      setEditedCells({});
    } catch (err) {
      console.error('Error loading dashboard data:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedMonth, fetchInventory, fetchFinancePlans, fetchActualOrders, fetchContentPlans]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle cell edit
  const handleCellChange = (productName, field, value) => {
    const numValue = value === '' ? 0 : Number(value);
    
    setGridData(prev => prev.map(row => {
      if (row.product_name === productName) {
        if (field === 'ad_cost_unit_bdt') {
          return {
            ...row,
            ad_cost_unit_bdt: numValue,
            ad_cost_unit_usd: parseFloat((numValue / 120).toFixed(2))
          };
        }
        if (field === 'ad_cost_unit_usd') {
          return {
            ...row,
            ad_cost_unit_usd: numValue,
            ad_cost_unit_bdt: Math.round(numValue * 120)
          };
        }
        return { ...row, [field]: numValue };
      }
      return row;
    }));

    setEditedCells(prev => ({
      ...prev,
      [productName]: {
        ...(prev[productName] || {}),
        [field]: true
      }
    }));
  };

  const isDirty = useMemo(() => {
    return Object.keys(editedCells).length > 0;
  }, [editedCells]);

  const triggerSaveGrid = () => {
    if (!isDirty) return;

    const changeSummary = [];
    gridData.forEach(row => {
      const rowEdits = editedCells[row.product_name];
      if (rowEdits) {
        const dbPlan = financePlans.find(p => p.product_name.toLowerCase() === row.product_name.toLowerCase());
        const fieldChanges = [];
        
        Object.keys(rowEdits).forEach(field => {
          const oldVal = dbPlan ? dbPlan[field] || 0 : 0;
          const newVal = row[field];
          if (oldVal !== newVal) {
            fieldChanges.push(`${field.replace(/_/g, ' ')} (${oldVal} ➔ ${newVal})`);
          }
        });

        if (fieldChanges.length > 0) {
          changeSummary.push({
            product: row.product_name,
            details: fieldChanges.join(', ')
          });
        }
      }
    });

    if (changeSummary.length === 0) {
      setEditedCells({});
      return;
    }

    setRiskModal({
      isOpen: true,
      title: '⚠️ CONFIRM HIGH-RISK FINANCIAL ACTION',
      message: `You are modifying target variables for monthly planning. Changing sales volume, ad budgets, or COGS shifts your predicted net margins and ROI forecasts.`,
      changes: changeSummary,
      onConfirm: async () => {
        setRiskModal(prev => ({ ...prev, isOpen: false }));
        await executeSave();
      },
      onCancel: () => {
        setRiskModal(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const executeSave = async () => {
    setSaving(true);
    try {
      const editPromises = gridData.map(async (row) => {
        const rowEdits = editedCells[row.product_name];
        if (!rowEdits) return;

        const payload = {
          month: selectedMonth,
          product_id: row.product_id,
          product_name: row.product_name,
          target_sales_qty: row.target_sales_qty,
          mrp: row.mrp,
          lifting_cost: row.lifting_cost,
          packing_cost: row.packing_cost,
          cod_cost: row.cod_cost,
          ad_cost_unit_bdt: row.ad_cost_unit_bdt,
          ad_cost_unit_usd: row.ad_cost_unit_usd,
          opex_cost_unit: row.opex_cost_unit,
          updated_at: new Date()
        };

        if (row.id) {
          const { error } = await supabase
            .from('finance_plans')
            .update(payload)
            .eq('id', row.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('finance_plans')
            .insert([payload]);
          if (error) throw error;
        }
      });

      await Promise.all(editPromises);
      await loadData();
    } catch (e) {
      console.error('Failed saving target changes:', e);
      alert('Error updating targets: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const discardEdits = () => {
    loadData();
  };

  // Calculations
  const computedTargets = useMemo(() => {
    return gridData.map(row => {
      const totalSales = row.target_sales_qty * row.mrp;
      const grossUnit = row.mrp - row.lifting_cost;
      const totalGross = row.target_sales_qty * grossUnit;
      const totalPack = row.target_sales_qty * row.packing_cost;
      const totalCod = row.target_sales_qty * row.cod_cost;
      const totalOpex = row.target_sales_qty * row.opex_cost_unit;
      const totalAd = row.target_sales_qty * row.ad_cost_unit_bdt;
      
      const netUnit = grossUnit - row.packing_cost - row.cod_cost - row.ad_cost_unit_bdt - row.opex_cost_unit;
      const totalNetProfit = row.target_sales_qty * netUnit;
      const totalInvestment = row.target_sales_qty * row.lifting_cost;

      return {
        ...row,
        totalSales,
        grossUnit,
        totalGross,
        totalPack,
        totalCod,
        totalOpex,
        totalAd,
        netUnit,
        totalNetProfit,
        totalInvestment
      };
    });
  }, [gridData]);

  const filteredTargets = useMemo(() => {
    if (!searchQuery.trim()) return computedTargets;
    return computedTargets.filter(row => 
      row.product_name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [computedTargets, searchQuery]);

  const targetSums = useMemo(() => {
    return filteredTargets.reduce((acc, row) => ({
      qty: acc.qty + row.target_sales_qty,
      sales: acc.sales + row.totalSales,
      gross: acc.gross + row.totalGross,
      pack: acc.pack + row.totalPack,
      cod: acc.cod + row.totalCod,
      opex: acc.opex + row.totalOpex,
      ad: acc.ad + row.totalAd,
      net: acc.net + row.totalNetProfit,
      investment: acc.investment + row.totalInvestment
    }), { qty: 0, sales: 0, gross: 0, pack: 0, cod: 0, opex: 0, ad: 0, net: 0, investment: 0 });
  }, [filteredTargets]);

  const liveActualsByProduct = useMemo(() => {
    const acc = {};
    
    const contentCostsByProduct = {};
    contentPlans.forEach(cp => {
      const prodName = cp.product_name.toLowerCase();
      const inhouseTotal = (cp.inhouse_count || 0) * (cp.inhouse_unit_cost || 0);
      const brandTotal = (cp.brand_unit_count || 0) * (cp.brand_unit_cost || 0);
      const otherTotal = cp.other_cost || 0;
      contentCostsByProduct[prodName] = (contentCostsByProduct[prodName] || 0) + inhouseTotal + brandTotal + otherTotal;
    });

    actualOrders.forEach(order => {
      if (!order.product_name) return;
      const prodKey = order.product_name.toLowerCase();
      if (!acc[prodKey]) {
        acc[prodKey] = {
          confirmedCount: 0,
          deliveredCount: 0,
          cancelledCount: 0,
          totalQty: 0,
          revenue: 0,
        };
      }

      const isConfirmed = ['Confirmed', 'Bulk Exported', 'Courier Submitted', 'Courier Ready', 'Completed'].includes(order.status);
      const isDelivered = ['Completed'].includes(order.status);
      const isCancelled = ['Cancelled', 'Fake Order'].includes(order.status);
      const orderQty = order.quantity || 1;

      if (isConfirmed) acc[prodKey].confirmedCount += orderQty;
      if (isDelivered) {
        acc[prodKey].deliveredCount += orderQty;
        acc[prodKey].revenue += Number(order.amount || 0);
      }
      if (isCancelled) acc[prodKey].cancelledCount += orderQty;
      acc[prodKey].totalQty += orderQty;
    });

    return filteredTargets.map(target => {
      const prodKey = target.product_name.toLowerCase();
      const actuals = acc[prodKey] || { confirmedCount: 0, deliveredCount: 0, cancelledCount: 0, revenue: 0 };
      const contentCost = contentCostsByProduct[prodKey] || 0;

      const actualLiftingCost = actuals.confirmedCount * target.lifting_cost;
      const actualPackingCost = actuals.confirmedCount * target.packing_cost;
      const actualCodCost = actuals.deliveredCount * target.cod_cost;
      const actualOpexCost = actuals.confirmedCount * target.opex_cost_unit;
      const actualAdCost = actuals.confirmedCount * target.ad_cost_unit_bdt;
      const actualReturnCost = actuals.cancelledCount * returnFee;

      const actualNetProfit = actuals.revenue - (actualLiftingCost + actualPackingCost + actualCodCost + actualOpexCost + actualAdCost + actualReturnCost + contentCost);

      return {
        product_name: target.product_name,
        targetQty: target.target_sales_qty,
        targetSales: target.totalSales,
        targetNet: target.totalNetProfit,
        confirmedCount: actuals.confirmedCount,
        deliveredCount: actuals.deliveredCount,
        cancelledCount: actuals.cancelledCount,
        revenue: actuals.revenue,
        liftingCost: actualLiftingCost,
        packingCost: actualPackingCost,
        codCost: actualCodCost,
        opexCost: actualOpexCost,
        adCost: actualAdCost,
        returnCost: actualReturnCost,
        contentCost,
        netProfit: actualNetProfit
      };
    });
  }, [actualOrders, filteredTargets, contentPlans, returnFee]);

  const actualSums = useMemo(() => {
    return liveActualsByProduct.reduce((acc, row) => ({
      confirmed: acc.confirmed + row.confirmedCount,
      delivered: acc.delivered + row.deliveredCount,
      cancelled: acc.cancelled + row.cancelledCount,
      revenue: acc.revenue + row.revenue,
      lifting: acc.lifting + row.liftingCost,
      packing: acc.packing + row.packingCost,
      cod: acc.cod + row.codCost,
      opex: acc.opex + row.opexCost,
      ad: acc.ad + row.adCost,
      content: acc.content + row.contentCost,
      returnCost: acc.returnCost + row.returnCost,
      net: acc.net + row.netProfit
    }), { confirmed: 0, delivered: 0, cancelled: 0, revenue: 0, lifting: 0, packing: 0, cod: 0, opex: 0, ad: 0, content: 0, returnCost: 0, net: 0 });
  }, [liveActualsByProduct]);

  // Advisory engine
  const advisoryInsights = useMemo(() => {
    const insights = [];
    
    liveActualsByProduct.forEach(p => {
      const totalAttempts = p.confirmedCount + p.cancelledCount;
      const cancelRate = totalAttempts > 0 ? (p.cancelledCount / totalAttempts) * 100 : 0;
      if (cancelRate > 15) {
        insights.push({
          type: 'danger',
          product: p.product_name,
          title: `High Cancel Rate: ${cancelRate.toFixed(1)}%`,
          suggestion: 'A return surge degrades net margins. Verify customer address details or require phone confirmation prior to shipping.'
        });
      }

      if (p.targetQty > 0) {
        const targetProgress = (p.confirmedCount / p.targetQty) * 100;
        if (targetProgress < 30 && monthRange.end < new Date()) {
          insights.push({
            type: 'warning',
            product: p.product_name,
            title: `Missed Target: Only ${targetProgress.toFixed(1)}% achieved`,
            suggestion: 'Underachieved monthly projection. Audit marketing campaign budget distribution or review unit pricing strategies.'
          });
        } else if (targetProgress > 80 && targetProgress < 100) {
          insights.push({
            type: 'success',
            product: p.product_name,
            title: `Nearing Target: ${targetProgress.toFixed(1)}% complete`,
            suggestion: 'Excellent progress. Secure inventory stock and scale digital advertising allocation.'
          });
        }
      }

      if (p.revenue > 0) {
        const netMarginPercent = (p.netProfit / p.revenue) * 100;
        if (netMarginPercent < 5 && p.netProfit < p.targetNet) {
          insights.push({
            type: 'info',
            product: p.product_name,
            title: `Compressed Net Margin: ${netMarginPercent.toFixed(1)}%`,
            suggestion: `High ad spend or operational leaks. Renegotiate shipping rates or optimize ad creative funnels.`
          });
        }
      }
    });

    if (actualSums.revenue > 0 && targetSums.sales > 0) {
      const overallRevProgress = (actualSums.revenue / targetSums.sales) * 100;
      if (overallRevProgress < 50) {
        insights.unshift({
          type: 'global',
          title: `Revenue Target Gap: ৳${(targetSums.sales - actualSums.revenue).toLocaleString()}`,
          suggestion: `Currently at ${overallRevProgress.toFixed(1)}% of sales targets. Promote high-performing product inventories.`
        });
      }
    }

    return insights;
  }, [liveActualsByProduct, targetSums, actualSums, monthRange]);

  const handleSaveReturnFee = () => {
    setReturnFee(Number(tempReturnFee) || 0);
    setIsEditingReturnFee(false);
  };

  return (
    <div className="tb-wrapper finance-wrapper">
      {/* Header controls */}
      <div className="tb-page-header">
        <div className="tb-page-header-left">
          <div className="tb-breadcrumbs">
            <span>Marketing</span>
            <span>/</span>
            <span className="tb-breadcrumb-active">Finance Plan & Projections</span>
          </div>
          <h1 className="tb-page-title">Finance Planning Board</h1>
        </div>

        <div className="tb-page-header-right">
          <div className="tb-header-meta">
            <span className="text-xs uppercase tracking-wider font-semibold opacity-70">Month:</span>
            <select
              value={selectedMonth}
              onChange={(e) => {
                if (isDirty) {
                  if (confirm('Discard unsaved changes?')) setSelectedMonth(e.target.value);
                } else {
                  setSelectedMonth(e.target.value);
                }
              }}
              className="month-inline-select"
            >
              {monthOptions.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          <div className="tb-header-meta">
            <span className="text-xs uppercase tracking-wider font-semibold opacity-70">Return Fee:</span>
            {isEditingReturnFee ? (
              <div className="return-edit-wrapper">
                <input
                  type="number"
                  value={tempReturnFee}
                  onChange={(e) => setTempReturnFee(e.target.value)}
                  className="return-edit-input"
                  autoFocus
                  onBlur={handleSaveReturnFee}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveReturnFee()}
                />
              </div>
            ) : (
              <span className="return-interactive-value" onClick={() => setIsEditingReturnFee(true)}>
                ৳{returnFee}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Summary KPIs Banner */}
      <div className="tb-welcome-banner finance-aggregates-banner">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <h2>Month Operations Overview</h2>
          <div className="banner-badge-flex">
            <span className="tb-badge-pill pill-blue">
              Planned Sales: ৳{targetSums.sales.toLocaleString()}
            </span>
            <span className="tb-badge-pill pill-green">
              Delivered: ৳{actualSums.revenue.toLocaleString()}
            </span>
            <span className="tb-badge-pill pill-red">
              Return Fees: ৳{actualSums.returnCost.toLocaleString()}
            </span>
          </div>
        </div>
        <div className="banner-kpis-flex">
          <div className="kpi-banner-card">
            <span className="kpi-label">Forecasted Net Profit</span>
            <strong className={targetSums.net >= 0 ? 'text-emerald-400' : 'text-red-400'}>
              ৳{targetSums.net.toLocaleString()}
            </strong>
          </div>
          <div className="kpi-banner-card">
            <span className="kpi-label">Actual Live Net</span>
            <strong className={actualSums.net >= 0 ? 'text-emerald-400' : 'text-red-400'}>
              ৳{Math.round(actualSums.net).toLocaleString()}
            </strong>
          </div>
        </div>
      </div>

      {/* 1. Target Projections Worksheet */}
      <div className="tb-welcome-banner finance-sheet-container">
        <div className="sheet-header-actions">
          <div className="sheet-title-area">
            <h3>1. Target Projections Worksheet</h3>
            <p>Define monthly sales targets, unit COGS, packaging, and ad budgets.</p>
          </div>

          <div className="sheet-buttons-tray">
            {/* Search */}
            <div className="sheet-search-wrapper">
              <Search size={14} className="search-icon-inside" />
              <input
                type="text"
                placeholder="Filter by product..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="sheet-search-input"
              />
            </div>

            {/* Toggle Advanced */}
            <button 
              onClick={() => setShowAdvanced(!showAdvanced)} 
              className="btn-toggle-columns"
            >
              {showAdvanced ? <EyeOff size={14} /> : <Eye size={14} />}
              <span>{showAdvanced ? 'Simple View' : 'Full Sheet'}</span>
            </button>

            {/* Actions */}
            {isDirty && (
              <div className="changes-action-flex">
                <button onClick={discardEdits} className="btn-discard-changes">
                  Discard
                </button>
                <button onClick={triggerSaveGrid} className="tb-export-btn" disabled={saving}>
                  {saving ? <RefreshCw className="animate-spin" size={14} /> : <Save size={14} />}
                  <span>Save Plan</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {loading ? (
          <div className="finance-loading">
            <RefreshCw size={24} className="animate-spin text-indigo-500" />
            <p>Loading parameters...</p>
          </div>
        ) : filteredTargets.length === 0 ? (
          <div className="finance-empty">
            <Layers size={36} />
            <p>No products match your search filter.</p>
          </div>
        ) : (
          <>
            {/* Desktop Table View (No Scroll on Desktops) */}
            <div className="desktop-view-container">
              <table className="finance-table">
                <thead>
                  <tr>
                    <th>Product Name</th>
                    <th className="qty-col highlight-head">Target Qty</th>
                    <th className="val-col">MRP (৳)</th>
                    <th className="val-col highlight-calc">Total Sales</th>
                    <th className="val-col">Lifting (COGS)</th>
                    {showAdvanced && <th className="val-col highlight-calc">Gross Unit</th>}
                    {showAdvanced && <th className="val-col highlight-calc">Total Gross</th>}
                    {showAdvanced && <th className="val-col">Packing</th>}
                    {showAdvanced && <th className="val-col highlight-calc">Total Pack</th>}
                    {showAdvanced && <th className="val-col">COD (৳)</th>}
                    {showAdvanced && <th className="val-col highlight-calc">Total COD</th>}
                    <th className="val-col">Ad BDT</th>
                    {showAdvanced && <th className="val-col">Ad USD</th>}
                    {showAdvanced && <th className="val-col">OPEX</th>}
                    {showAdvanced && <th className="val-col highlight-calc">Total OPEX</th>}
                    <th className="val-col highlight-calc text-emerald-400 font-bold">Net Unit</th>
                    <th className="val-col highlight-calc text-emerald-300 font-bold">Total Net</th>
                    <th className="val-col highlight-calc text-orange-400 font-bold">Investment</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTargets.map((row) => (
                    <tr key={row.product_name}>
                      <td className="product-title-bold">{row.product_name}</td>
                      
                      <td className="qty-col highlight-cell editable-cell">
                        <input
                          type="number"
                          min="0"
                          value={row.target_sales_qty}
                          onChange={(e) => handleCellChange(row.product_name, 'target_sales_qty', e.target.value)}
                          className={`spreadsheet-cell-input ${editedCells[row.product_name]?.target_sales_qty ? 'dirty' : ''}`}
                        />
                      </td>

                      <td className="editable-cell">
                        <input
                          type="number"
                          min="0"
                          value={row.mrp}
                          onChange={(e) => handleCellChange(row.product_name, 'mrp', e.target.value)}
                          className={`spreadsheet-cell-input ${editedCells[row.product_name]?.mrp ? 'dirty' : ''}`}
                        />
                      </td>

                      <td className="calc-cell">৳{row.totalSales.toLocaleString()}</td>

                      <td className="editable-cell">
                        <input
                          type="number"
                          min="0"
                          value={row.lifting_cost}
                          onChange={(e) => handleCellChange(row.product_name, 'lifting_cost', e.target.value)}
                          className={`spreadsheet-cell-input ${editedCells[row.product_name]?.lifting_cost ? 'dirty' : ''}`}
                        />
                      </td>

                      {showAdvanced && <td className="calc-cell">৳{row.grossUnit.toLocaleString()}</td>}
                      {showAdvanced && <td className="calc-cell">৳{row.totalGross.toLocaleString()}</td>}
                      
                      {showAdvanced && (
                        <td className="editable-cell">
                          <input
                            type="number"
                            min="0"
                            value={row.packing_cost}
                            onChange={(e) => handleCellChange(row.product_name, 'packing_cost', e.target.value)}
                            className={`spreadsheet-cell-input ${editedCells[row.product_name]?.packing_cost ? 'dirty' : ''}`}
                          />
                        </td>
                      )}
                      {showAdvanced && <td className="calc-cell">৳{row.totalPack.toLocaleString()}</td>}

                      {showAdvanced && (
                        <td className="editable-cell">
                          <input
                            type="number"
                            min="0"
                            step="0.5"
                            value={row.cod_cost}
                            onChange={(e) => handleCellChange(row.product_name, 'cod_cost', e.target.value)}
                            className={`spreadsheet-cell-input ${editedCells[row.product_name]?.cod_cost ? 'dirty' : ''}`}
                          />
                        </td>
                      )}
                      {showAdvanced && <td className="calc-cell">৳{row.totalCod.toLocaleString()}</td>}

                      <td className="editable-cell">
                        <input
                          type="number"
                          min="0"
                          value={row.ad_cost_unit_bdt}
                          onChange={(e) => handleCellChange(row.product_name, 'ad_cost_unit_bdt', e.target.value)}
                          className={`spreadsheet-cell-input ${editedCells[row.product_name]?.ad_cost_unit_bdt ? 'dirty' : ''}`}
                        />
                      </td>

                      {showAdvanced && (
                        <td className="editable-cell">
                          <input
                            type="number"
                            min="0"
                            step="0.05"
                            value={row.ad_cost_unit_usd}
                            onChange={(e) => handleCellChange(row.product_name, 'ad_cost_unit_usd', e.target.value)}
                            className={`spreadsheet-cell-input ${editedCells[row.product_name]?.ad_cost_unit_usd ? 'dirty' : ''}`}
                          />
                        </td>
                      )}

                      {showAdvanced && (
                        <td className="editable-cell">
                          <input
                            type="number"
                            min="0"
                            value={row.opex_cost_unit}
                            onChange={(e) => handleCellChange(row.product_name, 'opex_cost_unit', e.target.value)}
                            className={`spreadsheet-cell-input ${editedCells[row.product_name]?.opex_cost_unit ? 'dirty' : ''}`}
                          />
                        </td>
                      )}
                      {showAdvanced && <td className="calc-cell">৳{row.totalOpex.toLocaleString()}</td>}

                      <td className={`calc-cell font-bold ${row.netUnit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        ৳{row.netUnit.toLocaleString()}
                      </td>

                      <td className={`calc-cell font-bold ${row.totalNetProfit >= 0 ? 'text-emerald-300' : 'text-red-400'}`}>
                        ৳{row.totalNetProfit.toLocaleString()}
                      </td>

                      <td className="calc-cell font-bold text-orange-400">৳{row.totalInvestment.toLocaleString()}</td>
                    </tr>
                  ))}
                  
                  <tr className="totals-row font-bold">
                    <td>Grand Total</td>
                    <td>{targetSums.qty}</td>
                    <td>—</td>
                    <td>৳{targetSums.sales.toLocaleString()}</td>
                    <td>—</td>
                    {showAdvanced && <td>—</td>}
                    {showAdvanced && <td>৳{targetSums.gross.toLocaleString()}</td>}
                    {showAdvanced && <td>—</td>}
                    {showAdvanced && <td>৳{targetSums.pack.toLocaleString()}</td>}
                    {showAdvanced && <td>—</td>}
                    {showAdvanced && <td>৳{targetSums.cod.toLocaleString()}</td>}
                    <td>—</td>
                    {showAdvanced && <td>—</td>}
                    {showAdvanced && <td>—</td>}
                    {showAdvanced && <td>৳{targetSums.opex.toLocaleString()}</td>}
                    <td>—</td>
                    <td className={targetSums.net >= 0 ? 'text-emerald-300' : 'text-red-400'}>
                      ৳{targetSums.net.toLocaleString()}
                    </td>
                    <td className="text-orange-400">৳{targetSums.investment.toLocaleString()}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Mobile Stacked Cards View (No horizontal scroll) */}
            <div className="mobile-cards-container">
              {filteredTargets.map((row) => (
                <div key={row.product_name} className="mobile-product-card">
                  <div className="mobile-card-header">
                    <h4>{row.product_name}</h4>
                  </div>
                  
                  <div className="mobile-card-grid">
                    {/* Inputs */}
                    <div className="mobile-grid-item edit-item">
                      <span className="mobile-item-label">Target Qty</span>
                      <input
                        type="number"
                        min="0"
                        value={row.target_sales_qty}
                        onChange={(e) => handleCellChange(row.product_name, 'target_sales_qty', e.target.value)}
                        className={`spreadsheet-cell-input ${editedCells[row.product_name]?.target_sales_qty ? 'dirty' : ''}`}
                      />
                    </div>

                    <div className="mobile-grid-item edit-item">
                      <span className="mobile-item-label">MRP (৳)</span>
                      <input
                        type="number"
                        min="0"
                        value={row.mrp}
                        onChange={(e) => handleCellChange(row.product_name, 'mrp', e.target.value)}
                        className={`spreadsheet-cell-input ${editedCells[row.product_name]?.mrp ? 'dirty' : ''}`}
                      />
                    </div>

                    <div className="mobile-grid-item edit-item">
                      <span className="mobile-item-label">Lifting (COGS)</span>
                      <input
                        type="number"
                        min="0"
                        value={row.lifting_cost}
                        onChange={(e) => handleCellChange(row.product_name, 'lifting_cost', e.target.value)}
                        className={`spreadsheet-cell-input ${editedCells[row.product_name]?.lifting_cost ? 'dirty' : ''}`}
                      />
                    </div>

                    <div className="mobile-grid-item edit-item">
                      <span className="mobile-item-label">Ad BDT</span>
                      <input
                        type="number"
                        min="0"
                        value={row.ad_cost_unit_bdt}
                        onChange={(e) => handleCellChange(row.product_name, 'ad_cost_unit_bdt', e.target.value)}
                        className={`spreadsheet-cell-input ${editedCells[row.product_name]?.ad_cost_unit_bdt ? 'dirty' : ''}`}
                      />
                    </div>

                    {showAdvanced && (
                      <>
                        <div className="mobile-grid-item edit-item">
                          <span className="mobile-item-label">Packing</span>
                          <input
                            type="number"
                            min="0"
                            value={row.packing_cost}
                            onChange={(e) => handleCellChange(row.product_name, 'packing_cost', e.target.value)}
                            className={`spreadsheet-cell-input ${editedCells[row.product_name]?.packing_cost ? 'dirty' : ''}`}
                          />
                        </div>

                        <div className="mobile-grid-item edit-item">
                          <span className="mobile-item-label">COD BDT</span>
                          <input
                            type="number"
                            min="0"
                            step="0.5"
                            value={row.cod_cost}
                            onChange={(e) => handleCellChange(row.product_name, 'cod_cost', e.target.value)}
                            className={`spreadsheet-cell-input ${editedCells[row.product_name]?.cod_cost ? 'dirty' : ''}`}
                          />
                        </div>

                        <div className="mobile-grid-item edit-item">
                          <span className="mobile-item-label">OPEX</span>
                          <input
                            type="number"
                            min="0"
                            value={row.opex_cost_unit}
                            onChange={(e) => handleCellChange(row.product_name, 'opex_cost_unit', e.target.value)}
                            className={`spreadsheet-cell-input ${editedCells[row.product_name]?.opex_cost_unit ? 'dirty' : ''}`}
                          />
                        </div>

                        <div className="mobile-grid-item edit-item">
                          <span className="mobile-item-label">Ad USD</span>
                          <input
                            type="number"
                            min="0"
                            step="0.05"
                            value={row.ad_cost_unit_usd}
                            onChange={(e) => handleCellChange(row.product_name, 'ad_cost_unit_usd', e.target.value)}
                            className={`spreadsheet-cell-input ${editedCells[row.product_name]?.ad_cost_unit_usd ? 'dirty' : ''}`}
                          />
                        </div>
                      </>
                    )}

                    {/* Calculated values */}
                    <div className="mobile-grid-item">
                      <span className="mobile-item-label">Total Sales</span>
                      <span className="mobile-item-val">৳{row.totalSales.toLocaleString()}</span>
                    </div>

                    <div className="mobile-grid-item">
                      <span className="mobile-item-label">Net / Unit</span>
                      <span className={`mobile-item-val font-bold ${row.netUnit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        ৳{row.netUnit.toLocaleString()}
                      </span>
                    </div>

                    <div className="mobile-grid-item">
                      <span className="mobile-item-label">Total Net</span>
                      <span className={`mobile-item-val font-bold ${row.totalNetProfit >= 0 ? 'text-emerald-300' : 'text-red-400'}`}>
                        ৳{row.totalNetProfit.toLocaleString()}
                      </span>
                    </div>

                    <div className="mobile-grid-item">
                      <span className="mobile-item-label">Investment</span>
                      <span className="mobile-item-val text-orange-400 font-bold">৳{row.totalInvestment.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              ))}

              {/* Mobile Grand Totals Card */}
              <div className="mobile-product-card mobile-totals-card">
                <div className="mobile-card-header">
                  <h4>Grand Totals</h4>
                </div>
                <div className="mobile-card-grid">
                  <div className="mobile-grid-item">
                    <span className="mobile-item-label">Total Qty</span>
                    <span className="mobile-item-val font-bold">{targetSums.qty}</span>
                  </div>
                  <div className="mobile-grid-item">
                    <span className="mobile-item-label">Total Sales</span>
                    <span className="mobile-item-val font-bold">৳{targetSums.sales.toLocaleString()}</span>
                  </div>
                  <div className="mobile-grid-item">
                    <span className="mobile-item-label">Total Net Profit</span>
                    <span className={`mobile-item-val font-bold ${targetSums.net >= 0 ? 'text-emerald-300' : 'text-red-400'}`}>
                      ৳{targetSums.net.toLocaleString()}
                    </span>
                  </div>
                  <div className="mobile-grid-item">
                    <span className="mobile-item-label">Total Investment</span>
                    <span className="mobile-item-val font-bold text-orange-400">৳{targetSums.investment.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Actuals vs Target Variance Layout */}
      <div className="finance-grid-layout">
        
        {/* 2. Live Performance Analytics */}
        <div className="tb-welcome-banner actuals-card">
          <div className="sheet-title-area">
            <h3>2. Live Performance Analytics</h3>
            <p>Live metrics from the CRM order base for the current billing cycle.</p>
          </div>

          {/* Desktop view */}
          <div className="desktop-view-container">
            <table className="actuals-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th className="num-col">Confirmed</th>
                  <th className="num-col">Delivered</th>
                  <th className="num-col">Returned</th>
                  <th className="cost-col">Delivered Rev</th>
                  <th className="cost-col">Return Fees</th>
                  <th className="cost-col">Content Cost</th>
                  <th className="cost-col text-emerald-300 font-bold">Actual Net</th>
                </tr>
              </thead>
              <tbody>
                {liveActualsByProduct.map(row => (
                  <tr key={row.product_name}>
                    <td className="font-bold">{row.product_name}</td>
                    <td className="num-col text-sky-400 font-semibold">{row.confirmedCount}</td>
                    <td className="num-col text-emerald-400 font-semibold">{row.deliveredCount}</td>
                    <td className="num-col text-rose-400 font-semibold">{row.cancelledCount}</td>
                    <td className="cost-col font-semibold">৳{row.revenue.toLocaleString()}</td>
                    <td className="cost-col text-rose-400 font-semibold">৳{row.returnCost.toLocaleString()}</td>
                    <td className="cost-col text-indigo-400">৳{row.contentCost.toLocaleString()}</td>
                    <td className={`cost-col font-bold ${row.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      ৳{Math.round(row.netProfit).toLocaleString()}
                    </td>
                  </tr>
                ))}
                
                <tr className="totals-row font-bold">
                  <td>Total Actuals</td>
                  <td className="text-sky-400">{actualSums.confirmed}</td>
                  <td className="text-emerald-400">{actualSums.delivered}</td>
                  <td className="text-rose-400">{actualSums.cancelled}</td>
                  <td>৳{actualSums.revenue.toLocaleString()}</td>
                  <td className="text-rose-400">৳{actualSums.returnCost.toLocaleString()}</td>
                  <td className="text-indigo-400">৳{actualSums.content}</td>
                  <td className={actualSums.net >= 0 ? 'text-emerald-300' : 'text-red-400'}>
                    ৳{Math.round(actualSums.net).toLocaleString()}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Mobile view */}
          <div className="mobile-cards-container">
            {liveActualsByProduct.map(row => (
              <div key={row.product_name} className="mobile-product-card actual-item-card">
                <div className="mobile-card-header">
                  <h4>{row.product_name}</h4>
                </div>
                <div className="mobile-card-grid">
                  <div className="mobile-grid-item">
                    <span className="mobile-item-label">Confirmed</span>
                    <span className="mobile-item-val text-sky-400 font-semibold">{row.confirmedCount}</span>
                  </div>
                  <div className="mobile-grid-item">
                    <span className="mobile-item-label">Delivered</span>
                    <span className="mobile-item-val text-emerald-400 font-semibold">{row.deliveredCount}</span>
                  </div>
                  <div className="mobile-grid-item">
                    <span className="mobile-item-label">Returned</span>
                    <span className="mobile-item-val text-rose-400 font-semibold">{row.cancelledCount}</span>
                  </div>
                  <div className="mobile-grid-item">
                    <span className="mobile-item-label">Revenue</span>
                    <span className="mobile-item-val font-semibold">৳{row.revenue.toLocaleString()}</span>
                  </div>
                  <div className="mobile-grid-item">
                    <span className="mobile-item-label">Return Fees</span>
                    <span className="mobile-item-val text-rose-400">৳{row.returnCost.toLocaleString()}</span>
                  </div>
                  <div className="mobile-grid-item">
                    <span className="mobile-item-label">Content Cost</span>
                    <span className="mobile-item-val text-indigo-400">৳{row.contentCost.toLocaleString()}</span>
                  </div>
                  <div className="mobile-grid-item full-width-item">
                    <span className="mobile-item-label">Actual Net Profit</span>
                    <span className={`mobile-item-val font-bold ${row.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      ৳{Math.round(row.netProfit).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            ))}

            {/* Mobile Actuals Totals Card */}
            <div className="mobile-product-card mobile-totals-card">
              <div className="mobile-card-header">
                <h4>Total Actuals</h4>
              </div>
              <div className="mobile-card-grid">
                <div className="mobile-grid-item">
                  <span className="mobile-item-label">Confirmed</span>
                  <span className="mobile-item-val text-sky-400">{actualSums.confirmed}</span>
                </div>
                <div className="mobile-grid-item">
                  <span className="mobile-item-label">Delivered</span>
                  <span className="mobile-item-val text-emerald-400">{actualSums.delivered}</span>
                </div>
                <div className="mobile-grid-item">
                  <span className="mobile-item-label">Revenue</span>
                  <span className="mobile-item-val">৳{actualSums.revenue.toLocaleString()}</span>
                </div>
                <div className="mobile-grid-item">
                  <span className="mobile-item-label">Net Profit</span>
                  <span className={`mobile-item-val font-bold ${actualSums.net >= 0 ? 'text-emerald-300' : 'text-red-400'}`}>
                    ৳{Math.round(actualSums.net).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 3. Target vs Live Variance */}
        <div className="tb-welcome-banner targets-gauge-card">
          <div className="sheet-title-area">
            <h3>3. Target vs Live Variance</h3>
            <p>Live progress tracking towards targeted indicators.</p>
          </div>

          <div className="kpi-compare-grid">
            <div className="kpi-gauge-pill">
              <div className="kpi-labels-row">
                <span className="kpi-meta-name">Confirmations Volume</span>
                <span className="kpi-pct-delta text-sky-400">
                  {targetSums.qty > 0 ? ((actualSums.confirmed / targetSums.qty) * 100).toFixed(0) : 0}%
                </span>
              </div>
              <div className="kpi-nums-row">
                <strong>{actualSums.confirmed}</strong>
                <span className="separator">/</span>
                <span className="target-num">{targetSums.qty} Qty</span>
              </div>
              <div className="kpi-progress-bar-bg">
                <div 
                  className="kpi-progress-bar-fill progress-blue" 
                  style={{ width: `${Math.min(targetSums.qty > 0 ? (actualSums.confirmed / targetSums.qty) * 100 : 0, 100)}%` }} 
                />
              </div>
            </div>

            <div className="kpi-gauge-pill">
              <div className="kpi-labels-row">
                <span className="kpi-meta-name">Delivered Sales Revenue</span>
                <span className="kpi-pct-delta text-emerald-400">
                  {targetSums.sales > 0 ? ((actualSums.revenue / targetSums.sales) * 100).toFixed(0) : 0}%
                </span>
              </div>
              <div className="kpi-nums-row">
                <strong>৳{actualSums.revenue.toLocaleString()}</strong>
                <span className="separator">/</span>
                <span className="target-num">৳{targetSums.sales.toLocaleString()}</span>
              </div>
              <div className="kpi-progress-bar-bg">
                <div 
                  className="kpi-progress-bar-fill progress-green" 
                  style={{ width: `${Math.min(targetSums.sales > 0 ? (actualSums.revenue / targetSums.sales) * 100 : 0, 100)}%` }} 
                />
              </div>
            </div>

            <div className="kpi-gauge-pill">
              <div className="kpi-labels-row">
                <span className="kpi-meta-name">Net Operating Profits</span>
                <span className="kpi-pct-delta text-orange-400">
                  {targetSums.net > 0 ? ((actualSums.net / targetSums.net) * 100).toFixed(0) : 0}%
                </span>
              </div>
              <div className="kpi-nums-row">
                <strong>৳{Math.round(actualSums.net).toLocaleString()}</strong>
                <span className="separator">/</span>
                <span className="target-num">৳{targetSums.net.toLocaleString()}</span>
              </div>
              <div className="kpi-progress-bar-bg">
                <div 
                  className="kpi-progress-bar-fill progress-orange" 
                  style={{ width: `${Math.min(targetSums.net > 0 ? (actualSums.net / targetSums.net) * 100 : 0, 100)}%` }} 
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* AI Strategist Recommendations */}
      <div className="tb-welcome-banner advisory-card-outer">
        <div className="advisory-title-bar">
          <Sparkles className="spark-glowing" size={18} />
          <div>
            <h3>AI Strategist Playbook Optimizer</h3>
            <p>Heuristics comparing live revenue data against marketing target budgets.</p>
          </div>
        </div>

        {advisoryInsights.length === 0 ? (
          <div className="advisory-empty">
            <CheckCircle className="text-emerald-400 animate-bounce" size={20} />
            <p>Operations are running optimally with zero margin leaks or volume gaps detected.</p>
          </div>
        ) : (
          <div className="advisory-grid">
            {advisoryInsights.map((insight, idx) => (
              <motion.div 
                key={idx}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                className={`advisory-pill border-${insight.type}`}
              >
                <div className="insight-header">
                  <span className={`badge-indicator badge-${insight.type}`}>
                    {insight.type === 'danger' && 'Margin Leak'}
                    {insight.type === 'warning' && 'Volume Gap'}
                    {insight.type === 'success' && 'Scaling Opportunity'}
                    {insight.type === 'info' && 'Margin Compression'}
                    {insight.type === 'global' && 'Strategic Notice'}
                  </span>
                  {insight.product && <span className="insight-product-label">{insight.product}</span>}
                </div>
                <h4>{insight.title}</h4>
                <p>{insight.suggestion}</p>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* ⚠️ Risk Confirmation Overlay Modal */}
      <AnimatePresence>
        {riskModal.isOpen && (
          <div className="finance-modal-overlay">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="finance-modal-card"
            >
              <div className="modal-header-warn">
                <ShieldAlert size={20} />
                <h3>{riskModal.title}</h3>
              </div>
              <div className="modal-body-warn">
                <p className="description-text">{riskModal.message}</p>
                
                <div className="change-details-scroll">
                  <h4>Proposed target adjustments:</h4>
                  <ul>
                    {riskModal.changes.map((c, i) => (
                      <li key={i}>
                        <strong>{c.product}</strong>: {c.details}
                      </li>
                    ))}
                  </ul>
                </div>
                
                <div className="warning-notice-footer">
                  🚨 Saving skews marketing dashboard statistics. Verify parameters carefully before confirming.
                </div>
              </div>
              
              <div className="modal-footer-buttons">
                <button onClick={riskModal.onCancel} className="btn-modal-cancel">
                  Discard changes
                </button>
                <button onClick={riskModal.onConfirm} className="btn-modal-confirm">
                  Confirm & Write targets
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
