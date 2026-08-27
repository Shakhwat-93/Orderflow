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
  ArrowUpRight, ArrowDownRight, Trophy, Flame, Gift, Settings, Save, X, Edit3, HelpCircle,
  ChevronDown, MoreHorizontal, Calendar, SlidersHorizontal
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
  if (lower.includes('smart travel') || lower.includes('canvas travel')) {
    return 'Smart Travel Bag';
  }
  if (lower.includes('polarized sunglass') || lower.includes('sunglass')) {
    return 'Adjustable Dimming Polarized Sunglass';
  }
  if (lower.includes('canvas family')) {
    return 'Canvas Family Bag';
  }
  if (lower.includes('yoga') || lower.includes('stretch') || lower.includes('strech') || lower.includes('leg strech') || lower.includes('leg stretch')) {
    return 'Professional Yoga Stretch Band';
  }
  if (lower.includes('money management') || lower.includes('mmb')) {
    return 'Smart Money Management Bag';
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
  const [isMoreMetricsOpen, setIsMoreMetricsOpen] = useState(false);
  const [isDateSheetOpen, setIsDateSheetOpen] = useState(false);
  const [isColorSheetOpen, setIsColorSheetOpen] = useState(false);
  const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false);

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
    const isInco  = o => o.status === 'Incomplete';

    const confirmed = colorFilteredData.filter(isConf);
    const pending   = colorFilteredData.filter(isPend);
    const incomplete = colorFilteredData.filter(isInco);

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
      incomplete: incomplete.length,
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
        const revenueQty     = p.confirmedQty + p.pendingQty; // Total Revenue Qty (Confirmed + Pending)
        const unitCost       = Number(productUnitCosts[p.name]) || 0;
        const totalOrderCost = unitCost * p.totalQty; // Unit Cost * Total Order Qty per user request
        const totalCost      = unitCost * revenueQty; // COGS for Revenue Qty
        const netProfit      = p.revenue - totalCost;
        const profitMargin   = p.revenue > 0 ? +((netProfit / p.revenue) * 100).toFixed(1) : 0;
        const confRate       = p.total > 0 ? +((p.confirmed / p.total) * 100).toFixed(1) : 0;
        const fakeRate       = p.total > 0 ? +((p.fake / p.total) * 100).toFixed(1) : 0;

        return {
          ...p,
          revenueQty,
          unitCost,
          totalOrderCost,
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
          <div className="sr-header-icon"><TrendingUp size={20}/></div>
          <div>
            <h1>Sales Report</h1>
            <p>Real-time business performance</p>
          </div>
        </div>
        <div className="sr-header-right desktop-only-actions">
          <button className="sr-btn-cost" onClick={() => setIsUnitCostModalOpen(true)} title="Set Unit Cost for products">
            <Settings size={14}/> Unit Costs
          </button>
          <button className="sr-btn-export" onClick={() => exportCSV(colorFilteredData, presetLabel)}>
            <FileDown size={14}/> Export CSV
          </button>
          <button className="sr-btn-print" onClick={() => window.print()}>
            <Printer size={14}/> Print
          </button>
        </div>

        {/* Mobile Header Actions */}
        <div className="sr-header-right mobile-only-actions">
          <button className="sr-btn-cost" onClick={() => setIsUnitCostModalOpen(true)}>
            <Settings size={14}/> Unit Costs
          </button>
          <button className="sr-btn-more-menu" onClick={() => setIsHeaderMenuOpen(true)} aria-label="More options">
            <MoreHorizontal size={16} />
          </button>
        </div>
      </div>

      {/* ── Mobile Compact Filter Bar (<640px) ── */}
      <div className="sr-mobile-filter-bar">
        <button className="sr-mobile-filter-pill" onClick={() => setIsDateSheetOpen(true)}>
          <Calendar size={13} />
          <span>{presetLabel}</span>
          <ChevronDown size={12} />
        </button>

        <button className="sr-mobile-filter-pill" onClick={() => setIsColorSheetOpen(true)}>
          <SlidersHorizontal size={13} />
          <span>{colorFilter === 'All' ? 'All Colors' : colorFilter}</span>
          <ChevronDown size={12} />
        </button>

        <span className="sr-mobile-order-count">
          {fetching ? '...' : `${fmtNum(colorFilteredData.length)} orders`}
        </span>
      </div>

      {/* ── Desktop Date Presets & Filters Bar (≥640px) ── */}
      <div className="sr-presets-bar desktop-only-presets">
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
        <div className="sr-color-filter-wrapper">
          <span className="sr-color-label">Color:</span>
          <select 
            className="sr-date-input" 
            value={colorFilter} 
            onChange={e => setColorFilter(e.target.value)}
          >
            {uniqueColors.map(c => (
              <option key={c} value={c}>{c === 'All' ? 'All Colors' : c}</option>
            ))}
          </select>
        </div>

        <span className="sr-order-count">
          {fetching ? 'Syncing...' : `${fmtNum(colorFilteredData.length)} orders`}
        </span>
      </div>

      {/* ── Mobile 2x2 Primary KPI Grid (<640px) ── */}
      <div className="sr-mobile-kpi-wrapper">
        <div className="sr-kpi-grid-mobile">
          <div className="sr-kpi-card-compact">
            <span className="kpi-c-label">TOTAL ORDERS</span>
            <span className="kpi-c-val">{fmtNum(kpi.total)}</span>
          </div>

          <div className="sr-kpi-card-compact">
            <span className="kpi-c-label">TOTAL REVENUE</span>
            <span className="kpi-c-val text-success">{fmtTk(kpi.totalRevenue)}</span>
          </div>

          <div className="sr-kpi-card-compact">
            <span className="kpi-c-label">NET PROFIT</span>
            <span className={`kpi-c-val ${netProfit >= 0 ? 'text-success' : 'text-danger'}`}>{fmtTk(netProfit)}</span>
          </div>

          <div className="sr-kpi-card-compact">
            <span className="kpi-c-label">PENDING</span>
            <span className="kpi-c-val text-accent">{fmtNum(kpi.pending)}</span>
          </div>
        </div>

        {/* Expandable Secondary Metrics */}
        <button
          type="button"
          className="sr-btn-toggle-metrics"
          onClick={() => setIsMoreMetricsOpen(!isMoreMetricsOpen)}
        >
          <span>{isMoreMetricsOpen ? 'Hide Secondary Metrics' : 'More Metrics'}</span>
          <ChevronDown size={14} className={isMoreMetricsOpen ? 'rotate-180' : ''} />
        </button>

        {isMoreMetricsOpen && (
          <div className="sr-secondary-metrics-list">
            <div className="sr-secondary-row">
              <span className="sec-label">Confirmed Orders</span>
              <span className="sec-val text-success">{fmtNum(kpi.confirmed)} ({kpi.confRate}%)</span>
            </div>
            <div className="sr-secondary-row">
              <span className="sec-label">COGS (Total Cost)</span>
              <span className="sec-val">{fmtTk(totalCOGS)}</span>
            </div>
            <div className="sr-secondary-row">
              <span className="sec-label">Avg Order Value</span>
              <span className="sec-val">{fmtTk(Math.round(kpi.avgVal))}</span>
            </div>
            <div className="sr-secondary-row">
              <span className="sec-label">Cancelled Orders</span>
              <span className="sec-val text-danger">{fmtNum(kpi.cancelled)}</span>
            </div>
            <div className="sr-secondary-row">
              <span className="sec-label">Fake Orders</span>
              <span className="sec-val text-warning">{fmtNum(kpi.fake)}</span>
            </div>
            <div className="sr-secondary-row">
              <span className="sec-label">Incomplete Orders</span>
              <span className="sec-val">{fmtNum(kpi.incomplete)}</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Desktop Full KPI Cards (≥640px) ── */}
      <div className="sr-kpi-grid desktop-only-kpi">
        <KpiCard icon={ShoppingCart}  label="Total Orders"       value={fmtNum(kpi.total)}       color="#6366f1" />
        <KpiCard icon={CheckCircle2}  label="Confirmed"          value={fmtNum(kpi.confirmed)}   color="#10b981" sub={`${kpi.confRate}% confirm rate`} />
        <KpiCard icon={Clock}         label="Pending Orders"     value={fmtNum(kpi.pending)}     color="#3b82f6" sub="Pending Call / Hold" />
        <KpiCard icon={DollarSign}    label="Total Revenue"      value={fmtTk(kpi.totalRevenue)} color="#10b981" sub={`Conf: ${fmtTk(kpi.confRevenue)} · Pend: ${fmtTk(kpi.pendRevenue)}`} />
        <KpiCard icon={Package}       label="COGS (Total Cost)"   value={fmtTk(totalCOGS)}        color="#eab308" sub="Unit Cost × Rev Qty" />
        <KpiCard icon={TrendingUp}    label="Net Profit"         value={fmtTk(netProfit)}        color={netProfit >= 0 ? '#10b981' : '#ef4444'} sub={`Margin: ${overallMargin}%`} />
        <KpiCard icon={BarChart3}     label="Avg Order Value"    value={fmtTk(Math.round(kpi.avgVal))} color="#8b5cf6" />
        <KpiCard icon={XCircle}       label="Cancelled"          value={fmtNum(kpi.cancelled)}   color="#ef4444" />
        <KpiCard icon={AlertTriangle} label="Fake Orders"        value={fmtNum(kpi.fake)}         color="#f59e0b" />
        <KpiCard icon={HelpCircle}    label="Incomplete Orders"  value={fmtNum(kpi.incomplete)}   color="#ec4899" sub="Checkout Auto-save" />
      </div>

      {/* ── Daily Trend Chart ── */}
      <div className="sr-card">
        <div className="sr-card-header">
          <SectionTitle icon={BarChart3} title="Daily Sales Trend" sub="Orders vs Confirmed vs Cancelled" />
          <div className="sr-toggle-group">
            <button className={`sr-toggle-btn ${chartType==='bar'?'active':''}`} onClick={() => setChartType('bar')}>Bar</button>
            <button className={`sr-toggle-btn ${chartType==='area'?'active':''}`} onClick={() => setChartType('area')}>Area</button>
          </div>
        </div>
        {dailyData.length === 0 ? (
          <div className="sr-empty-compact">No sales data for this period.</div>
        ) : (
          <ResponsiveContainer width="100%" height={240} minWidth={0} minHeight={0}>
            {chartType === 'bar' ? (
              <BarChart data={dailyData} margin={{ top:10, right:10, left:-15, bottom:0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(99,102,241,0.06)" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill:'var(--sr-text-muted)', fontSize:11 }} dy={8} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill:'var(--sr-text-muted)', fontSize:11 }} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize:11, paddingTop:8 }} />
                <Bar dataKey="total"     name="Total"     fill="#6366f1" radius={[4,4,0,0]} maxBarSize={28} />
                <Bar dataKey="confirmed" name="Confirmed" fill="#10b981" radius={[4,4,0,0]} maxBarSize={28} />
                <Bar dataKey="cancelled" name="Cancelled" fill="#ef4444" radius={[4,4,0,0]} maxBarSize={28} />
                <Bar dataKey="fake"      name="Fake"      fill="#f59e0b" radius={[4,4,0,0]} maxBarSize={28} />
              </BarChart>
            ) : (
              <AreaChart data={dailyData} margin={{ top:10, right:10, left:-15, bottom:0 }}>
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
                <Legend wrapperStyle={{ fontSize:11, paddingTop:8 }} />
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
          {statusDist.length === 0 ? <div className="sr-empty-compact">No order status data.</div> : (
            <>
              <ResponsiveContainer width="100%" height={200} minWidth={0} minHeight={0}>
                <PieChart>
                  <Pie data={statusDist} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={78} paddingAngle={3}>
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

        {/* Source Breakdown (Mobile Card List + Desktop Table) */}
        <div className="sr-card">
          <div className="sr-card-header">
            <SectionTitle icon={BarChart3} title="Source Breakdown" sub="Where orders originate" />
          </div>

          {/* Mobile Source Card List */}
          <div className="sr-source-mobile-list">
            {sourceData.length === 0 ? (
              <div className="sr-empty-compact">No source data for this period.</div>
            ) : (
              sourceData.map(s => (
                <div key={s.source} className="sr-source-mobile-item">
                  <div className="sr-source-m-top">
                    <span className="sr-source-m-name">{s.source || 'Unknown'}</span>
                    <span className="sr-source-m-tot">{s.total} orders</span>
                  </div>
                  <div className="sr-source-m-bottom">
                    <span>Conf: <strong>{s.confirmed}</strong></span>
                    <span className="sr-green">Rev: <strong>{fmtTk(s.revenue)}</strong></span>
                    <span className={`sr-rate-pill ${s.confRate >= 50 ? 'good' : 'warn'}`}>{s.confRate}%</span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Desktop Source Table */}
          <div className="sr-source-table-wrap desktop-only-table-wrap">
            <div className="sr-source-table">
              <div className="sr-source-head">
                <span>Source</span><span>Total</span><span>Confirmed</span><span>Revenue</span><span>Conf%</span>
              </div>
              {sourceData.length === 0 ? <div className="sr-empty-compact">No data</div> : sourceData.map(s => (
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
          {topSellers.length === 0 ? <div className="sr-empty-compact">No confirmed orders yet.</div> : (
            <ResponsiveContainer width="100%" height={320} minWidth={0} minHeight={0}>
              <BarChart data={topSellers} layout="vertical" margin={{ top:0, right:16, left:0, bottom:0 }}>
                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill:'var(--sr-text-muted)', fontSize:11 }} />
                <YAxis dataKey="name" type="category" width={110} axisLine={false} tickLine={false} tick={{ fill:'var(--sr-text-sub)', fontSize:10.5, fontWeight:600 }} tickFormatter={(val) => val.length > 18 ? val.substring(0, 16) + '...' : val} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="confirmedQty" name="Confirmed Qty" fill="#10b981" radius={[0,6,6,0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="sr-card">
          <div className="sr-card-header">
            <SectionTitle icon={Flame} title="Top Fake Order Products" sub="Products with most fake orders" />
          </div>
          {topFake.length === 0 ? <div className="sr-empty-compact">No fake orders in this period 🎉</div> : (
            <ResponsiveContainer width="100%" height={320} minWidth={0} minHeight={0}>
              <BarChart data={topFake} layout="vertical" margin={{ top:0, right:16, left:0, bottom:0 }}>
                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill:'var(--sr-text-muted)', fontSize:11 }} />
                <YAxis dataKey="name" type="category" width={110} axisLine={false} tickLine={false} tick={{ fill:'var(--sr-text-sub)', fontSize:10.5, fontWeight:600 }} tickFormatter={(val) => val.length > 18 ? val.substring(0, 16) + '...' : val} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="fakeQty" name="Fake Qty" fill="#f59e0b" radius={[0,6,6,0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Product-wise Sales & Profit Breakdown ── */}
      <div className="sr-card">
        <div className="sr-card-header">
          <SectionTitle icon={Package} title="Product-wise Sales & Profit" sub="Revenue = Confirmed + Pending" />
          <button className="sr-btn-cost desktop-only-actions" onClick={() => setIsUnitCostModalOpen(true)} style={{ fontSize: '0.78rem', padding: '6px 12px' }}>
            <Settings size={14}/> Unit Cost Config
          </button>
        </div>

        {productData.length === 0 ? (
          <div className="sr-empty-compact">No product data for this period.</div>
        ) : (
          <>
            {/* Mobile Product Card List (<1024px) */}
            <div className="sr-product-mobile-list">
              {productData.map((p, i) => (
                <div key={p.name} className="sr-prod-m-card">
                  <div className="sr-prod-m-top">
                    <span className="sr-prod-m-rank">#{i + 1}</span>
                    <div className="sr-prod-m-title-wrap">
                      <h4 className="sr-prod-m-name">{p.name}</h4>
                      {i === 0 && productSort === 'revenueQty' && <span className="sr-top-badge">🔥 Top</span>}
                      {p.fakeRate > 20 && <span className="sr-fake-warn">⚠️ High Fake</span>}
                    </div>
                  </div>

                  <div className="sr-prod-m-grid">
                    <div className="sr-prod-m-stat">
                      <span className="lbl">REV QTY</span>
                      <span className="val">{p.revenueQty} pcs</span>
                    </div>
                    <div className="sr-prod-m-stat">
                      <span className="lbl">GROSS REV</span>
                      <span className="val sr-green">{fmtTk(p.revenue)}</span>
                    </div>
                    <div className="sr-prod-m-stat">
                      <span className="lbl">NET PROFIT</span>
                      <span className={`val ${p.netProfit >= 0 ? 'sr-green' : 'sr-red'}`}>{fmtTk(p.netProfit)}</span>
                    </div>
                    <div className="sr-prod-m-stat">
                      <span className="lbl">MARGIN</span>
                      <span className="val">{p.profitMargin}%</span>
                    </div>
                  </div>

                  <div className="sr-prod-m-footer">
                    <div className="sr-prod-m-cost-edit">
                      <span className="cost-lbl">Unit Cost:</span>
                      <div className="cost-input-box">
                        <span>৳</span>
                        <input
                          type="number"
                          min="0"
                          value={p.unitCost || ''}
                          onChange={(e) => handleUnitCostChange(p.name, e.target.value)}
                          placeholder="0"
                        />
                      </div>
                    </div>
                    <div className="sr-prod-m-rates">
                      <span>Conf: {p.confRate}%</span>
                      <span>COGS: {fmtTk(p.totalCost)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Product Table (≥1024px) */}
            <div className="sr-product-table-wrap desktop-only-table-wrap">
              <table className="sr-product-table">
                <thead>
                  <tr>
                    <th style={{ width: '22px', textAlign: 'center' }}>#</th>
                    <th>Product</th>
                    <th className="sr-sortable" onClick={() => setProductSort('unitCost')}>Unit Cost {productSort==='unitCost'&&'↓'}</th>
                    <th className="sr-sortable" onClick={() => setProductSort('total')}>Orders {productSort==='total'&&'↓'}</th>
                    <th className="sr-sortable" onClick={() => setProductSort('totalQty')}>Ord Qty {productSort==='totalQty'&&'↓'}</th>
                    <th className="sr-sortable" onClick={() => setProductSort('totalOrderCost')}>Ord Cost {productSort==='totalOrderCost'&&'↓'}</th>
                    <th className="sr-sortable" onClick={() => setProductSort('confirmedQty')}>Conf Qty {productSort==='confirmedQty'&&'↓'}</th>
                    <th className="sr-sortable" onClick={() => setProductSort('pendingQty')}>Pend Qty {productSort==='pendingQty'&&'↓'}</th>
                    <th className="sr-sortable" onClick={() => setProductSort('revenueQty')}>Rev Qty {productSort==='revenueQty'&&'↓'}</th>
                    <th className="sr-sortable" onClick={() => setProductSort('revenue')}>Revenue {productSort==='revenue'&&'↓'}</th>
                    <th className="sr-sortable" onClick={() => setProductSort('totalCost')}>COGS {productSort==='totalCost'&&'↓'}</th>
                    <th className="sr-sortable" onClick={() => setProductSort('netProfit')}>Net Profit {productSort==='netProfit'&&'↓'}</th>
                    <th className="sr-sortable" onClick={() => setProductSort('profitMargin')}>Margin {productSort==='profitMargin'&&'↓'}</th>
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
                      <td style={{ fontWeight: 700 }}>{p.total}</td>
                      <td style={{ fontWeight: 800, color: 'var(--sr-text)' }}>{p.totalQty}</td>
                      <td style={{ fontWeight: 700, color: '#eab308' }} title="Unit Cost × Total Order Qty">{fmtTk(p.totalOrderCost)}</td>
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
          </>
        )}
      </div>

      {/* ── Mobile Date Range Bottom Sheet ── */}
      {isDateSheetOpen && (
        <div className="sr-sheet-backdrop" onClick={() => setIsDateSheetOpen(false)}>
          <div className="sr-bottom-sheet" onClick={e => e.stopPropagation()}>
            <div className="sr-sheet-head">
              <h3>Select Date Range</h3>
              <button className="sr-sheet-close" onClick={() => setIsDateSheetOpen(false)}><X size={18} /></button>
            </div>
            <div className="sr-sheet-body">
              <div className="sr-sheet-options">
                {PRESETS.map(p => (
                  <button
                    key={p.key}
                    className={`sr-sheet-option-btn ${preset === p.key ? 'active' : ''}`}
                    onClick={() => {
                      applyPreset(p.key);
                      if (p.key !== 'custom') setIsDateSheetOpen(false);
                    }}
                  >
                    <span>{p.label}</span>
                    {preset === p.key && <CheckCircle2 size={15} className="text-accent" />}
                  </button>
                ))}
              </div>

              {preset === 'custom' && (
                <div className="sr-sheet-custom-dates">
                  <label>From:
                    <input
                      type="date"
                      className="sr-date-input"
                      value={dateRange.start.toISOString().split('T')[0]}
                      onChange={e => { const d = new Date(e.target.value); d.setHours(0,0,0,0); setDateRange(r => ({...r, start:d})); }}
                    />
                  </label>
                  <label>To:
                    <input
                      type="date"
                      className="sr-date-input"
                      value={dateRange.end.toISOString().split('T')[0]}
                      onChange={e => { const d = new Date(e.target.value); d.setHours(23,59,59,999); setDateRange(r => ({...r, end:d})); }}
                    />
                  </label>
                  <button className="sr-sheet-apply-btn" onClick={() => setIsDateSheetOpen(false)}>Apply Custom Range</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Mobile Color Filter Bottom Sheet ── */}
      {isColorSheetOpen && (
        <div className="sr-sheet-backdrop" onClick={() => setIsColorSheetOpen(false)}>
          <div className="sr-bottom-sheet" onClick={e => e.stopPropagation()}>
            <div className="sr-sheet-head">
              <h3>Filter by Color</h3>
              <button className="sr-sheet-close" onClick={() => setIsColorSheetOpen(false)}><X size={18} /></button>
            </div>
            <div className="sr-sheet-body">
              <div className="sr-sheet-options">
                {uniqueColors.map(c => (
                  <button
                    key={c}
                    className={`sr-sheet-option-btn ${colorFilter === c ? 'active' : ''}`}
                    onClick={() => {
                      setColorFilter(c);
                      setIsColorSheetOpen(false);
                    }}
                  >
                    <span>{c === 'All' ? 'All Colors' : c}</span>
                    {colorFilter === c && <CheckCircle2 size={15} className="text-accent" />}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Mobile Header Actions Menu ── */}
      {isHeaderMenuOpen && (
        <div className="sr-sheet-backdrop" onClick={() => setIsHeaderMenuOpen(false)}>
          <div className="sr-bottom-sheet" onClick={e => e.stopPropagation()}>
            <div className="sr-sheet-head">
              <h3>Report Actions</h3>
              <button className="sr-sheet-close" onClick={() => setIsHeaderMenuOpen(false)}><X size={18} /></button>
            </div>
            <div className="sr-sheet-body" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                className="sr-sheet-action-item"
                onClick={() => {
                  exportCSV(colorFilteredData, presetLabel);
                  setIsHeaderMenuOpen(false);
                }}
              >
                <FileDown size={16} />
                <span>Export CSV ({presetLabel})</span>
              </button>
              <button
                className="sr-sheet-action-item"
                onClick={() => {
                  setIsHeaderMenuOpen(false);
                  window.print();
                }}
              >
                <Printer size={16} />
                <span>Print Report</span>
              </button>
            </div>
          </div>
        </div>
      )}

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
