import { useMemo, useState, useCallback, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import {
  BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import {
  TrendingUp, ShoppingCart, CheckCircle2, XCircle, AlertTriangle,
  Clock, DollarSign, FileDown, Printer, BarChart3, Package,
  ArrowUpRight, ArrowDownRight, Trophy, Flame, Gift, Settings, Save, X, Edit3
} from 'lucide-react';
import './SalesReport.css';

// ── Constants ─────────────────────────────────────────────────────
const CONFIRMED_STATUSES = [
  'Confirmed',
  'Confirmed & Printed',
  'Bulk Exported',
  'Courier Ready',
  'Courier Submitted',
  'Factory Processing',
  'Processing',
  'Shipped',
  'Completed'
];

const isConfirmedStatus = (status) => CONFIRMED_STATUSES.includes(status);

const STATUS_COLORS = {
  'Confirmed': '#10b981', 
  'Confirmed & Printed': '#10b981',
  'Bulk Exported': '#10b981', 
  'Courier Ready': '#10b981', 
  'Courier Submitted': '#06b6d4',
  'Factory Processing': '#eab308',
  'Processing': '#06b6d4', 
  'Shipped': '#3b82f6', 
  'Completed': '#059669',
  'Cancelled': '#ef4444', 
  'Fake Order': '#f59e0b',
  'New': '#6366f1', 
  'Pending Call': '#3b82f6',
  'Final Call Pending': '#8b5cf6', 
  'Hold': '#94a3b8',
  'Incomplete': '#ec4899',
};
const PIE_COLORS = ['#10b981','#6366f1','#ef4444','#f59e0b','#3b82f6','#8b5cf6','#94a3b8','#14b8a6'];

// ── Date Helpers ──────────────────────────────────────────────────
const midnight = (d) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
const endOfDay = (d) => { const x = new Date(d); x.setHours(23,59,59,999); return x; };
const today    = () => midnight(new Date());
const fmtDate  = (d) => new Date(d).toLocaleDateString('en-GB', { day:'2-digit', month:'short' });
const fmtNum   = (n) => Number(n||0).toLocaleString();
const fmtTk    = (n) => '৳' + fmtNum(n);

const PRESETS = [
  { key:'today',      label:'Today' },
  { key:'yesterday',  label:'Yesterday' },
  { key:'week',       label:'This Week' },
  { key:'lastweek',   label:'Last Week' },
  { key:'month',      label:'This Month' },
  { key:'lastmonth',  label:'Last Month' },
  { key:'custom',     label:'Custom' },
];

const getPresetRange = (key) => {
  const now = new Date();
  switch (key) {
    case 'today':     return { start: today(), end: endOfDay(now) };
    case 'yesterday': { const y = new Date(now); y.setDate(y.getDate()-1); return { start: midnight(y), end: endOfDay(y) }; }
    case 'week':      { const s = new Date(now); s.setDate(now.getDate()-now.getDay()+1); return { start: midnight(s), end: endOfDay(now) }; }
    case 'lastweek':  { const s = new Date(now); s.setDate(now.getDate()-now.getDay()-6); const e = new Date(s); e.setDate(s.getDate()+6); return { start: midnight(s), end: endOfDay(e) }; }
    case 'month':     return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: endOfDay(now) };
    case 'lastmonth': { const s = new Date(now.getFullYear(), now.getMonth()-1, 1); const e = new Date(now.getFullYear(), now.getMonth(), 0); return { start: s, end: endOfDay(e) }; }
    default:          return { start: today(), end: endOfDay(now) };
  }
};

// ── CSV Export ────────────────────────────────────────────────────
const exportCSV = (orders, label) => {
  const headers = ['Order ID','Date','Customer','Phone','Product','Qty','Amount','Status','Source'];
  const rows = orders.map(o => [
    o.id,
    new Date(o.created_at).toLocaleDateString('en-GB'),
    `"${o.customer_name || ''}"`,
    `"${o.phone || ''}"`,
    `"${o.product_name || ''}"`,
    o.quantity||1,
    o.amount||0,
    o.status || '',
    o.source||''
  ].join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob(['\uFEFF'+csv], { type:'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `sales_report_${label}_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
};

// ── Sub-components ────────────────────────────────────────────────
const KpiCard = ({ icon: Icon, label, value, sub, color, trend, trendUp }) => (
  <div className="sr-kpi-card" style={{ '--kc': color }}>
    <div className="sr-kpi-icon"><Icon size={20} /></div>
    <div className="sr-kpi-body">
      <p className="sr-kpi-label">{label}</p>
      <h3 className="sr-kpi-value">{value}</h3>
      {sub && <p className="sr-kpi-sub">{sub}</p>}
    </div>
    {trend != null && (
      <div className={`sr-kpi-trend ${trendUp ? 'up' : 'down'}`}>
        {trendUp ? <ArrowUpRight size={13}/> : <ArrowDownRight size={13}/>}
        <span>{trend}%</span>
      </div>
    )}
  </div>
);

const SectionTitle = ({ icon: Icon, title, sub }) => (
  <div className="sr-section-title">
    <div className="sr-section-icon"><Icon size={16}/></div>
    <div>
      <h3>{title}</h3>
      {sub && <p>{sub}</p>}
    </div>
  </div>
);

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="sr-tooltip">
      <p className="sr-tt-label">{label}</p>
      {payload.map((p,i) => (
        <div key={i} className="sr-tt-row">
          <span className="sr-tt-dot" style={{ background: p.color||p.fill }} />
          <span>{p.name}:</span>
          <strong>{typeof p.value === 'number' && p.name?.toLowerCase().includes('revenue') ? fmtTk(p.value) : p.value}</strong>
        </div>
      ))}
    </div>
  );
};

const extractColor = (itemName, orderItem) => {
  if (orderItem?.color) return orderItem.color.trim();
  
  const commonColors = [
    'black', 'blue', 'beige', 'olive', 'pink', 'white', 'golden', 'gold', 
    'silver', 'grey', 'gray', 'red', 'green', 'yellow', 'purple', 'orange', 'brown'
  ];
  
  const nameLower = String(itemName || '').toLowerCase();
  for (const c of commonColors) {
    if (nameLower.includes(c)) {
      return c.charAt(0).toUpperCase() + c.slice(1);
    }
  }
  return null;
};

const getBaseProductName = (rawName) => {
  if (!rawName) return 'Unknown Product';
  let name = String(rawName).trim();

  // 1. Remove bracketed specs like [Black x2, White x1], [Olive x1]
  name = name.replace(/\[[^\]]+\]/g, '');

  // 2. Remove parenthesized specs like (Color: Black), (Color: Black, Golden, Silver)
  name = name.replace(/\([^)]+\)/g, '');

  // 3. Remove "x\d+" or "x \d+" (multipliers) e.g., "Sunglass x2" -> "Sunglass"
  name = name.replace(/\s+x\d+\b/gi, '');

  // 4. Remove common color suffixes and descriptors after a hyphen, comma or space
  const wordsToRemove = [
    'black', 'blue', 'beige', 'standard', 'olive', 'pink', 'white', 'golden', 'gold', 
    'silver', 'grey', 'gray', 'red', 'green', 'yellow', 'purple', 'orange', 'brown', 
    'navy', 'maroon', 'teal', 'combo', '1 pcs', '2 pcs', '3 pcs', '1pcs', '2pcs', '3pcs'
  ];

  const parts = name.split(/\s*[-–—,]\s*/);
  if (parts.length > 1) {
    const lastPart = parts[parts.length - 1].toLowerCase().trim();
    const isColorOrDescriptor = wordsToRemove.some(word => lastPart.includes(word)) || lastPart.match(/^\d+\s*pcs?$/i);
    if (isColorOrDescriptor) {
      parts.pop();
      name = parts.join(' - ');
    }
  }

  const parts2 = name.split(/\s*[-–—,]\s*/);
  if (parts2.length > 1) {
    const lastPart = parts2[parts2.length - 1].toLowerCase().trim();
    const isColorOrDescriptor = wordsToRemove.some(word => lastPart.includes(word)) || lastPart.match(/^\d+\s*pcs?$/i);
    if (isColorOrDescriptor) {
      parts2.pop();
      name = parts2.join(' - ');
    }
  }

  name = name.replace(/\s*[-–—,]\s*$/, '').trim();

  const lower = name.toLowerCase();
  if (lower.includes('magnetic gym') || lower.includes('magentic gym')) {
    return 'Magnetic Gym Crossbody Bag';
  }
  if (lower.includes('smart travel')) {
    return 'Smart Travel Bag';
  }
  if (lower.includes('polarized sunglass')) {
    return 'Adjustable Dimming Polarized Sunglass';
  }
  if (lower.includes('canvas family')) {
    return 'Canvas Family Bag';
  }
  if (lower.includes('yoga stretch band')) {
    return 'Professional Yoga Stretch Band';
  }
  if (lower.includes('healthy healing tea')) {
    return 'Healthy Healing Tea';
  }
  if (lower.includes('ac sticker')) {
    return 'Transparent AC Sticker';
  }

  return name.split(/\s+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
};

// ── Main Component ────────────────────────────────────────────────
export const SalesReport = () => {
  const { updatePresenceContext } = useAuth();

  const [preset, setPreset]     = useState('today');
  const [dateRange, setDateRange] = useState(getPresetRange('today'));
  const [chartType, setChartType] = useState('bar'); // 'bar' | 'area'
  const [productSort, setProductSort] = useState('revenueQty'); // default sort by Revenue Qty (Confirmed + Pending)
  const [colorFilter, setColorFilter] = useState('All');
  const [reportOrders, setReportOrders] = useState([]);
  const [fetching, setFetching] = useState(false);

  // Unit Cost Management state (persistent in localStorage & synced with inventory table)
  const [productUnitCosts, setProductUnitCosts] = useState(() => {
    try {
      const cached = localStorage.getItem('sr_product_unit_costs');
      return cached ? JSON.parse(cached) : {};
    } catch {
      return {};
    }
  });

  const [isUnitCostModalOpen, setIsUnitCostModalOpen] = useState(false);

  // Sync default unit costs from inventory table
  useEffect(() => {
    const fetchInventoryCosts = async () => {
      try {
        const { data } = await supabase.from('inventory').select('name, making_cost, unit_price');
        if (data && data.length > 0) {
          setProductUnitCosts(prev => {
            const next = { ...prev };
            let updated = false;
            data.forEach(item => {
              const baseName = getBaseProductName(item.name);
              const cost = Number(item.making_cost) || Number(item.unit_price) || 0;
              if (cost > 0 && (next[baseName] === undefined || next[baseName] === 0)) {
                next[baseName] = cost;
                updated = true;
              }
            });
            if (updated) {
              localStorage.setItem('sr_product_unit_costs', JSON.stringify(next));
            }
            return next;
          });
        }
      } catch (err) {
        console.error('Error fetching inventory unit costs:', err);
      }
    };
    fetchInventoryCosts();
  }, []);

  const handleUnitCostChange = async (productName, val) => {
    const cost = Math.max(0, parseFloat(val) || 0);
    const next = { ...productUnitCosts, [productName]: cost };
    setProductUnitCosts(next);
    localStorage.setItem('sr_product_unit_costs', JSON.stringify(next));

    try {
      const { data: invItems } = await supabase.from('inventory').select('id, name');
      if (invItems) {
        const normName = productName.toLowerCase().replace(/\s+/g, '');
        const match = invItems.find(i => i.name.toLowerCase().replace(/\s+/g, '') === normName || i.name.toLowerCase().includes(productName.toLowerCase()));
        if (match) {
          await supabase.from('inventory').update({ making_cost: cost }).eq('id', match.id);
        }
      }
    } catch (e) {
      console.error('Error syncing unit cost to inventory:', e);
    }
  };

  // Fetch all orders in date range directly from Supabase to guarantee accuracy
  useEffect(() => {
    let active = true;
    const loadReportOrders = async () => {
      setFetching(true);
      try {
        let allData = [];
        let from = 0;
        const limit = 1000;
        let hasMore = true;

        while (hasMore) {
          const { data, error } = await supabase
            .from('orders')
            .select('id, created_at, customer_name, phone, product_name, quantity, amount, status, source, ordered_items')
            .gte('created_at', dateRange.start.toISOString())
            .lte('created_at', dateRange.end.toISOString())
            .order('created_at', { ascending: false })
            .range(from, from + limit - 1);

          if (error) throw error;

          if (data && data.length > 0) {
            allData = [...allData, ...data];
            if (data.length < limit) {
              hasMore = false;
            } else {
              from += limit;
            }
          } else {
            hasMore = false;
          }
        }

        if (active) {
          setReportOrders(allData);
        }
      } catch (err) {
        console.error('Error loading report orders:', err);
      } finally {
        if (active) {
          setFetching(false);
        }
      }
    };

    loadReportOrders();
    return () => {
      active = false;
    };
  }, [dateRange]);

  const applyPreset = useCallback((key) => {
    setPreset(key);
    if (key !== 'custom') setDateRange(getPresetRange(key));
  }, []);

  // ── Filtered orders (exclude Test) ──
  const filtered = useMemo(() => {
    if (!reportOrders?.length) return [];
    return reportOrders.filter(o => o.status !== 'Test');
  }, [reportOrders]);

  // ── Unique Colors List ──
  const uniqueColors = useMemo(() => {
    const colors = new Set();
    filtered.forEach(o => {
      const items = Array.isArray(o.ordered_items) && o.ordered_items.length > 0
        ? o.ordered_items
        : [{ name: o.product_name }];
      
      items.forEach(item => {
        const color = extractColor(item.name || o.product_name, item);
        if (color) {
          colors.add(color);
        }
      });
    });
    return ['All', ...Array.from(colors).sort()];
  }, [filtered]);

  // ── Color Filtered Data ──
  const colorFilteredData = useMemo(() => {
    if (colorFilter === 'All') return filtered;

    return filtered.map(o => {
      const items = Array.isArray(o.ordered_items) && o.ordered_items.length > 0
        ? o.ordered_items
        : [{ name: o.product_name, quantity: o.quantity||1, price: o.amount||0 }];

      const matchingItems = items.filter(item => {
        const itemColor = extractColor(item.name || o.product_name, item);
        return itemColor === colorFilter;
      });

      if (matchingItems.length === 0) return null;

      const matchingAmount = matchingItems.reduce((acc, item) => acc + (Number(item.price) || 0) * (Number(item.quantity) || 1), 0);

      return {
        ...o,
        ordered_items: matchingItems,
        amount: matchingAmount > 0 ? matchingAmount : o.amount,
        quantity: matchingItems.reduce((acc, item) => acc + (Number(item.quantity) || 1), 0)
      };
    }).filter(Boolean);
  }, [filtered, colorFilter]);

  // ── KPI Aggregates ──
  const kpi = useMemo(() => {
    const isConf  = o => isConfirmedStatus(o.status) && !(o.notes && o.notes.includes('[Was Incomplete]'));
    const isCanc  = o => o.status === 'Cancelled';
    const isFake  = o => o.status === 'Fake Order';
    const isPend  = o => ['New','Pending Call','Final Call Pending','Hold'].includes(o.status);

    const confirmed = colorFilteredData.filter(isConf);
    const pending   = colorFilteredData.filter(isPend);

    // Revenue includes BOTH Confirmed + Pending orders per user specification
    const confRevenue = confirmed.reduce((s,o) => s + (Number(o.amount)||0), 0);
    const pendRevenue = pending.reduce((s,o) => s + (Number(o.amount)||0), 0);
    const totalRevenue = confRevenue + pendRevenue;

    const revenueOrderCount = confirmed.length + pending.length;
    const avgVal    = revenueOrderCount > 0 ? totalRevenue / revenueOrderCount : 0;
    const confRate  = colorFilteredData.length > 0 ? ((confirmed.length / colorFilteredData.length)*100).toFixed(1) : 0;

    const isBonus = o => isConfirmedStatus(o.status) && o.notes && o.notes.includes('[Was Incomplete]');
    const bonusOrders = colorFilteredData.filter(isBonus);
    const bonusRevenue = bonusOrders.reduce((s,o) => s + (Number(o.amount)||0), 0);

    return {
      total: colorFilteredData.length,
      confirmed: confirmed.length,
      cancelled: colorFilteredData.filter(isCanc).length,
      fake: colorFilteredData.filter(isFake).length,
      pending: pending.length,
      totalRevenue,
      confRevenue,
      pendRevenue,
      avgVal,
      confRate,
      bonus: bonusOrders.length,
      bonusRevenue
    };
  }, [colorFilteredData]);

  // ── Daily Trend with proper timezone key mapping ──
  const dailyData = useMemo(() => {
    const map = {};
    colorFilteredData.forEach(o => {
      const d = new Date(o.created_at);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dayKey = `${year}-${month}-${day}`;

      if (!map[dayKey]) {
        map[dayKey] = {
          name: d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
          date: dayKey,
          total: 0,
          confirmed: 0,
          cancelled: 0,
          fake: 0,
          revenue: 0
        };
      }
      map[dayKey].total++;
      const s = o.status;
      if (isConfirmedStatus(s) && !(o.notes && o.notes.includes('[Was Incomplete]'))) {
        map[dayKey].confirmed++;
        map[dayKey].revenue += Number(o.amount||0);
      }
      else if (s==='Cancelled') map[dayKey].cancelled++;
      else if (s==='Fake Order') map[dayKey].fake++;
    });
    return Object.values(map).sort((a,b) => a.date.localeCompare(b.date));
  }, [colorFilteredData]);

  // ── Product-wise stats (Revenue from Pending + Confirmed) ──
  const productData = useMemo(() => {
    const map = {};
    colorFilteredData.forEach(o => {
      const items = Array.isArray(o.ordered_items) && o.ordered_items.length > 0
        ? o.ordered_items
        : [{ name: o.product_name, quantity: o.quantity||1, price: o.amount||0 }];

      items.forEach(item => {
        const baseName = getBaseProductName(item.name || o.product_name);
        if (!map[baseName]) {
          map[baseName] = { 
            name: baseName, 
            total: 0, 
            totalQty: 0, 
            confirmed: 0, 
            confirmedQty: 0, 
            cancelled: 0, 
            cancelledQty: 0, 
            fake: 0, 
            fakeQty: 0, 
            pending: 0,
            pendingQty: 0,
            confRevenue: 0,
            pendRevenue: 0,
            revenue: 0 
          };
        }
        
        const q = Number(item.quantity || 1);
        map[baseName].total++;
        map[baseName].totalQty += q;
        
        const s = o.status;
        const itemRevenue = Number(item.line_total ?? (item.price ? Number(item.price) * q : o.amount)) || 0;

        if (isConfirmedStatus(s) && !(o.notes && o.notes.includes('[Was Incomplete]'))) {
          map[baseName].confirmed++;
          map[baseName].confirmedQty += q;
          map[baseName].confRevenue += itemRevenue;
          map[baseName].revenue += itemRevenue;
        } else if (['New', 'Pending Call', 'Final Call Pending', 'Hold'].includes(s)) {
          // Pending orders — also count towards revenue quantity per user specification!
          map[baseName].pending++;
          map[baseName].pendingQty += q;
          map[baseName].pendRevenue += itemRevenue;
          map[baseName].revenue += itemRevenue;
        } else if (s === 'Cancelled') {
          map[baseName].cancelled++;
          map[baseName].cancelledQty += q;
        } else if (s === 'Fake Order') {
          map[baseName].fake++;
          map[baseName].fakeQty += q;
        }
      });
    });

    return Object.values(map)
      .map(p => {
        const revenueQty   = p.confirmedQty + p.pendingQty; // Total Revenue Qty (Confirmed + Pending)
        const unitCost     = Number(productUnitCosts[p.name]) || 0;
        const totalCost    = unitCost * revenueQty; // COGS
        const netProfit    = p.revenue - totalCost;
        const profitMargin = p.revenue > 0 ? +((netProfit / p.revenue) * 100).toFixed(1) : 0;
        const confRate     = p.total > 0 ? +((p.confirmed / p.total) * 100).toFixed(1) : 0;
        const fakeRate     = p.total > 0 ? +((p.fake / p.total) * 100).toFixed(1) : 0;

        return {
          ...p,
          revenueQty,
          unitCost,
          totalCost,
          netProfit,
          profitMargin,
          confRate,
          fakeRate
        };
      })
      .sort((a, b) => (Number(b[productSort]) || 0) - (Number(a[productSort]) || 0));
  }, [colorFilteredData, productSort, productUnitCosts]);

  // Overall COGS & Profit metrics across filtered dataset
  const totalCOGS = useMemo(() => {
    return productData.reduce((s, p) => s + (p.totalCost || 0), 0);
  }, [productData]);

  const netProfit = kpi.totalRevenue - totalCOGS;
  const overallMargin = kpi.totalRevenue > 0 ? +((netProfit / kpi.totalRevenue) * 100).toFixed(1) : 0;

  // ── Status distribution for Pie ──
  const statusDist = useMemo(() => {
    const map = {};
    colorFilteredData.forEach(o => { map[o.status] = (map[o.status]||0) + 1; });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value);
  }, [colorFilteredData]);

  // ── Source breakdown ──
  const sourceData = useMemo(() => {
    const map = {};
    colorFilteredData.forEach(o => {
      const src = o.source || 'Unknown';
      if (!map[src]) map[src] = { source: src, total:0, confirmed:0, revenue:0 };
      map[src].total++;
      if (isConfirmedStatus(o.status) && !(o.notes && o.notes.includes('[Was Incomplete]'))) { map[src].confirmed++; map[src].revenue += Number(o.amount||0); }
    });
    return Object.values(map)
      .map(s => ({ ...s, confRate: s.total > 0 ? +((s.confirmed/s.total)*100).toFixed(1) : 0 }))
      .sort((a,b) => b.total - a.total);
  }, [colorFilteredData]);

  // ── Top Sellers & Top Fake ──
  const topSellers = useMemo(() => {
    return [...productData].sort((a,b) => b.confirmedQty - a.confirmedQty).slice(0,10);
  }, [productData]);

  const topFake = useMemo(() => {
    return [...productData].sort((a,b) => b.fakeQty - a.fakeQty).filter(p => p.fakeQty > 0).slice(0,10);
  }, [productData]);

  const presetLabel = PRESETS.find(p => p.key === preset)?.label || 'Custom';

  return (
    <div className={`sr-panel ${fetching ? 'fetching' : ''}`}>

      {/* ── Header ── */}
      <div className="sr-header">
        <div className="sr-header-left">
          <div className="sr-header-icon"><TrendingUp size={22}/></div>
          <div>
            <h1>Sales Report</h1>
            <p>Real-time business performance dashboard</p>
          </div>
        </div>
        <div className="sr-header-right">
          <button className="sr-btn-cost" onClick={() => setIsUnitCostModalOpen(true)} title="Set Unit Cost for products">
            <Settings size={15}/> Unit Costs
          </button>
          <button className="sr-btn-export" onClick={() => exportCSV(colorFilteredData, presetLabel)}>
            <FileDown size={15}/> Export CSV
          </button>
          <button className="sr-btn-print" onClick={() => window.print()}>
            <Printer size={15}/> Print
          </button>
        </div>
      </div>

      {/* ── Date Presets & Filters Bar ── */}
      <div className="sr-presets-bar">
        <div className="sr-presets">
          {PRESETS.map(p => (
            <button key={p.key} className={`sr-preset-btn ${preset===p.key ? 'active' : ''}`} onClick={() => applyPreset(p.key)}>
              {p.label}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <div className="sr-custom-dates">
            <input type="date" className="sr-date-input"
              value={dateRange.start.toISOString().split('T')[0]}
              onChange={e => { const d = new Date(e.target.value); d.setHours(0,0,0,0); setDateRange(r => ({...r, start:d})); }} />
            <span>→</span>
            <input type="date" className="sr-date-input"
              value={dateRange.end.toISOString().split('T')[0]}
              onChange={e => { const d = new Date(e.target.value); d.setHours(23,59,59,999); setDateRange(r => ({...r, end:d})); }} />
          </div>
        )}

        {/* Color Filter Dropdown */}
        <div className="sr-color-filter-wrapper" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
          <span style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--sr-text-sub)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Color:</span>
          <select 
            className="sr-date-input" 
            value={colorFilter} 
            onChange={e => setColorFilter(e.target.value)}
            style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--sr-btn-bdr)', background: 'var(--sr-btn-bg)', color: 'var(--sr-text)', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}
          >
            {uniqueColors.map(c => (
              <option key={c} value={c}>{c === 'All' ? 'All Colors' : c}</option>
            ))}
          </select>
        </div>

        <span className="sr-order-count" style={{ marginLeft: '12px' }}>
          {fetching ? 'Syncing Accurate Data...' : `${fmtNum(colorFilteredData.length)} orders`}
        </span>
      </div>

      {/* ── KPI Cards ── */}
      <div className="sr-kpi-grid">
        <KpiCard icon={ShoppingCart}  label="Total Orders"       value={fmtNum(kpi.total)}       color="#6366f1" />
        <KpiCard icon={CheckCircle2}  label="Confirmed"          value={fmtNum(kpi.confirmed)}   color="#10b981" sub={`${kpi.confRate}% confirm rate`} />
        <KpiCard icon={Clock}         label="Pending Orders"     value={fmtNum(kpi.pending)}     color="#3b82f6" sub="Pending Call / Hold" />
        <KpiCard icon={DollarSign}    label="Total Revenue"      value={fmtTk(kpi.totalRevenue)} color="#10b981" sub={`Conf: ${fmtTk(kpi.confRevenue)} · Pend: ${fmtTk(kpi.pendRevenue)}`} />
        <KpiCard icon={Package}       label="COGS (Total Cost)"   value={fmtTk(totalCOGS)}        color="#eab308" sub="Unit Cost × Rev Qty" />
        <KpiCard icon={TrendingUp}    label="Net Profit"         value={fmtTk(netProfit)}        color={netProfit >= 0 ? '#10b981' : '#ef4444'} sub={`Margin: ${overallMargin}%`} />
        <KpiCard icon={BarChart3}     label="Avg Order Value"    value={fmtTk(Math.round(kpi.avgVal))} color="#8b5cf6" />
        <KpiCard icon={Gift}          label="Bonus Conversions"  value={fmtNum(kpi.bonus)}       color="#eab308" sub={`${fmtTk(kpi.bonusRevenue)} bonus rev`} />
        <KpiCard icon={XCircle}       label="Cancelled"          value={fmtNum(kpi.cancelled)}   color="#ef4444" />
        <KpiCard icon={AlertTriangle} label="Fake Orders"        value={fmtNum(kpi.fake)}         color="#f59e0b" />
      </div>

      {/* ── Daily Trend Chart ── */}
      <div className="sr-card">
        <div className="sr-card-header">
          <SectionTitle icon={BarChart3} title="Daily Sales Trend" sub="Orders vs Confirmed vs Cancelled vs Fake" />
          <div className="sr-toggle-group">
            <button className={`sr-toggle-btn ${chartType==='bar'?'active':''}`} onClick={() => setChartType('bar')}>Bar</button>
            <button className={`sr-toggle-btn ${chartType==='area'?'active':''}`} onClick={() => setChartType('area')}>Area</button>
          </div>
        </div>
        {dailyData.length === 0 ? (
          <div className="sr-empty">No orders in this period</div>
        ) : (
          <ResponsiveContainer width="100%" height={280} minWidth={0} minHeight={0}>
            {chartType === 'bar' ? (
              <BarChart data={dailyData} margin={{ top:10, right:10, left:-10, bottom:0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(99,102,241,0.06)" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill:'var(--sr-text-muted)', fontSize:11 }} dy={8} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill:'var(--sr-text-muted)', fontSize:11 }} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize:12, paddingTop:12 }} />
                <Bar dataKey="total"     name="Total"     fill="#6366f1" radius={[4,4,0,0]} maxBarSize={32} />
                <Bar dataKey="confirmed" name="Confirmed" fill="#10b981" radius={[4,4,0,0]} maxBarSize={32} />
                <Bar dataKey="cancelled" name="Cancelled" fill="#ef4444" radius={[4,4,0,0]} maxBarSize={32} />
                <Bar dataKey="fake"      name="Fake"      fill="#f59e0b" radius={[4,4,0,0]} maxBarSize={32} />
              </BarChart>
            ) : (
              <AreaChart data={dailyData} margin={{ top:10, right:10, left:-10, bottom:0 }}>
                <defs>
                  {[['conf','#10b981'],['canc','#ef4444'],['fake','#f59e0b'],['total','#6366f1']].map(([id,c]) => (
                    <linearGradient key={id} id={`sr-grad-${id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={c} stopOpacity={0.25}/>
                      <stop offset="95%" stopColor={c} stopOpacity={0}/>
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(99,102,241,0.06)" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill:'var(--sr-text-muted)', fontSize:11 }} dy={8} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill:'var(--sr-text-muted)', fontSize:11 }} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize:12, paddingTop:12 }} />
                <Area dataKey="total"     name="Total"     stroke="#6366f1" fill="url(#sr-grad-total)" strokeWidth={2} dot={false} />
                <Area dataKey="confirmed" name="Confirmed" stroke="#10b981" fill="url(#sr-grad-conf)"  strokeWidth={2} dot={false} />
                <Area dataKey="cancelled" name="Cancelled" stroke="#ef4444" fill="url(#sr-grad-canc)"  strokeWidth={2} dot={false} />
                <Area dataKey="fake"      name="Fake"      stroke="#f59e0b" fill="url(#sr-grad-fake)"  strokeWidth={2} dot={false} />
              </AreaChart>
            )}
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Two Column: Pie + Source ── */}
      <div className="sr-two-col">

        {/* Status Pie */}
        <div className="sr-card">
          <div className="sr-card-header">
            <SectionTitle icon={BarChart3} title="Order Status Distribution" />
          </div>
          {statusDist.length === 0 ? <div className="sr-empty">No data</div> : (
            <>
              <ResponsiveContainer width="100%" height={220} minWidth={0} minHeight={0}>
                <PieChart>
                  <Pie data={statusDist} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={3}>
                    {statusDist.map((entry, i) => (
                      <Cell key={i} fill={STATUS_COLORS[entry.name] || PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v, n) => [v, n]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="sr-pie-legend">
                {statusDist.map((d,i) => (
                  <div key={d.name} className="sr-pie-legend-row">
                    <span className="sr-pie-dot" style={{ background: STATUS_COLORS[d.name] || PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span className="sr-pie-name">{d.name}</span>
                    <strong>{d.value}</strong>
                    <span className="sr-pie-pct">{filtered.length > 0 ? ((d.value/filtered.length)*100).toFixed(1) : 0}%</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Source Breakdown */}
        <div className="sr-card">
          <div className="sr-card-header">
            <SectionTitle icon={BarChart3} title="Source Breakdown" sub="Where orders are coming from" />
          </div>
          <div className="sr-source-table-wrap">
            <div className="sr-source-table">
              <div className="sr-source-head">
                <span>Source</span><span>Total</span><span>Confirmed</span><span>Revenue</span><span>Conf%</span>
              </div>
              {sourceData.length === 0 ? <div className="sr-empty">No data</div> : sourceData.map(s => (
                <div key={s.source} className="sr-source-row">
                  <span className="sr-source-name">{s.source || 'Unknown'}</span>
                  <span>{s.total}</span>
                  <span className="sr-green">{s.confirmed}</span>
                  <span className="sr-green">{fmtTk(s.revenue)}</span>
                  <span className={`sr-rate-pill ${s.confRate >= 50 ? 'good' : 'warn'}`}>{s.confRate}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Top Selling + Top Fake Bar Charts ── */}
      <div className="sr-two-col">
        <div className="sr-card">
          <div className="sr-card-header">
            <SectionTitle icon={Trophy} title="Top Selling Products" sub="By confirmed orders" />
          </div>
          {topSellers.length === 0 ? <div className="sr-empty">No confirmed orders</div> : (
            <ResponsiveContainer width="100%" height={380} minWidth={0} minHeight={0}>
              <BarChart data={topSellers} layout="vertical" margin={{ top:0, right:16, left:0, bottom:0 }}>
                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill:'var(--sr-text-muted)', fontSize:11 }} />
                <YAxis dataKey="name" type="category" width={130} axisLine={false} tickLine={false} tick={{ fill:'var(--sr-text-sub)', fontSize:11, fontWeight:600 }} tickFormatter={(val) => val.length > 22 ? val.substring(0, 20) + '...' : val} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="confirmedQty" name="Confirmed Qty" fill="#10b981" radius={[0,6,6,0]} maxBarSize={20} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="sr-card">
          <div className="sr-card-header">
            <SectionTitle icon={Flame} title="Top Fake Order Products" sub="Products with most fake orders" />
          </div>
          {topFake.length === 0 ? <div className="sr-empty">No fake orders — great! 🎉</div> : (
            <ResponsiveContainer width="100%" height={380} minWidth={0} minHeight={0}>
              <BarChart data={topFake} layout="vertical" margin={{ top:0, right:16, left:0, bottom:0 }}>
                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill:'var(--sr-text-muted)', fontSize:11 }} />
                <YAxis dataKey="name" type="category" width={130} axisLine={false} tickLine={false} tick={{ fill:'var(--sr-text-sub)', fontSize:11, fontWeight:600 }} tickFormatter={(val) => val.length > 22 ? val.substring(0, 20) + '...' : val} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="fakeQty" name="Fake Qty" fill="#f59e0b" radius={[0,6,6,0]} maxBarSize={20} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Product-wise Table ── */}
      <div className="sr-card">
        <div className="sr-card-header">
          <SectionTitle icon={Package} title="Product-wise Sales & Profit Breakdown" sub="Revenue = Confirmed + Pending orders. Type Unit Cost directly to calculate Net Profit." />
          <button className="sr-btn-cost" onClick={() => setIsUnitCostModalOpen(true)} style={{ fontSize: '0.78rem', padding: '6px 12px' }}>
            <Settings size={14}/> Unit Cost Config
          </button>
        </div>
        {productData.length === 0 ? <div className="sr-empty">No product data in this period</div> : (
          <div className="sr-product-table-wrap">
            <table className="sr-product-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Product</th>
                  <th className="sr-sortable" onClick={() => setProductSort('unitCost')}>Unit Cost (৳) {productSort==='unitCost'&&'↓'}</th>
                  <th className="sr-sortable" onClick={() => setProductSort('confirmedQty')}>Confirmed {productSort==='confirmedQty'&&'↓'}</th>
                  <th className="sr-sortable" onClick={() => setProductSort('pendingQty')}>Pending {productSort==='pendingQty'&&'↓'}</th>
                  <th className="sr-sortable" onClick={() => setProductSort('revenueQty')}>Rev Qty {productSort==='revenueQty'&&'↓'}</th>
                  <th className="sr-sortable" onClick={() => setProductSort('revenue')}>Gross Revenue {productSort==='revenue'&&'↓'}</th>
                  <th className="sr-sortable" onClick={() => setProductSort('totalCost')}>COGS (Cost) {productSort==='totalCost'&&'↓'}</th>
                  <th className="sr-sortable" onClick={() => setProductSort('netProfit')}>Net Profit {productSort==='netProfit'&&'↓'}</th>
                  <th className="sr-sortable" onClick={() => setProductSort('profitMargin')}>Margin % {productSort==='profitMargin'&&'↓'}</th>
                  <th className="sr-sortable" onClick={() => setProductSort('confRate')}>Conf% {productSort==='confRate'&&'↓'}</th>
                </tr>
              </thead>
              <tbody>
                {productData.map((p, i) => (
                  <tr key={p.name} className={i===0 && productSort==='revenueQty' ? 'sr-top-row' : ''}>
                    <td className="sr-rank">
                      {productSort==='revenueQty' ? (i===0 ? '🥇' : i===1 ? '🥈' : i===2 ? '🥉' : i+1) : i+1}
                    </td>
                    <td className="sr-prod-name">
                      {p.name}
                      {p.fakeRate > 20 && <span className="sr-fake-warn">⚠️ High Fake</span>}
                      {i===0 && productSort==='revenueQty' && <span className="sr-top-badge">🔥 Top</span>}
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        className="sr-unit-cost-input"
                        value={p.unitCost || ''}
                        onChange={(e) => handleUnitCostChange(p.name, e.target.value)}
                        placeholder="৳ Cost"
                        title="Set unit making cost for this product"
                      />
                    </td>
                    <td className="sr-green" style={{ fontWeight: 700 }}>{p.confirmedQty}</td>
                    <td className="sr-pending" style={{ fontWeight: 700 }}>{p.pendingQty || 0}</td>
                    <td style={{ fontWeight: 800, color: 'var(--sr-text)' }}>{p.revenueQty}</td>
                    <td className="sr-green" style={{ fontWeight: 800 }}>{fmtTk(p.revenue)}</td>
                    <td style={{ fontWeight: 700, color: '#eab308' }}>{fmtTk(p.totalCost)}</td>
                    <td style={{ fontWeight: 800, color: p.netProfit >= 0 ? '#10b981' : '#ef4444' }}>
                      {fmtTk(p.netProfit)}
                    </td>
                    <td>
                      <span className={`sr-rate-pill ${p.profitMargin >= 30 ? 'good' : p.profitMargin > 0 ? 'neutral' : 'warn'}`}>
                        {p.profitMargin}%
                      </span>
                    </td>
                    <td><span className={`sr-rate-pill ${p.confRate>=50?'good':'warn'}`}>{p.confRate}%</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Unit Cost Configuration Modal ── */}
      {isUnitCostModalOpen && (
        <div className="sr-modal-backdrop" onClick={() => setIsUnitCostModalOpen(false)}>
          <div className="sr-modal-shell" onClick={e => e.stopPropagation()}>
            <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--sr-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'var(--sr-accent-bg)', color: 'var(--sr-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Settings size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--sr-text)' }}>Product Unit Cost Manager</h3>
                  <p style={{ margin: 0, fontSize: '12px', color: 'var(--sr-text-muted)' }}>Configure COGS per unit for exact revenue & profit analytics</p>
                </div>
              </div>
              <button onClick={() => setIsUnitCostModalOpen(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--sr-text-muted)' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {productData.map(p => (
                <div key={p.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: '12px', background: 'var(--sr-btn-bg)', border: '1px solid var(--sr-btn-bdr)' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--sr-text)' }}>{p.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--sr-text-muted)' }}>Rev Qty: {p.revenueQty} pcs · Gross Rev: {fmtTk(p.revenue)}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--sr-text-sub)' }}>৳</span>
                    <input
                      type="number"
                      min="0"
                      className="sr-unit-cost-input"
                      value={p.unitCost || ''}
                      onChange={e => handleUnitCostChange(p.name, e.target.value)}
                      placeholder="0"
                      style={{ width: '100px', fontSize: '13px', padding: '6px 10px' }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--sr-border)', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setIsUnitCostModalOpen(false)}
                style={{ padding: '9px 20px', borderRadius: '10px', background: 'var(--sr-accent)', color: '#fff', border: 'none', fontWeight: 800, fontSize: '13px', cursor: 'pointer' }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
