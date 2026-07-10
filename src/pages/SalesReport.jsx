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
  ArrowUpRight, ArrowDownRight, Trophy, Flame
} from 'lucide-react';
import './SalesReport.css';

// ── Constants ─────────────────────────────────────────────────────
const CONFIRMED_STATUSES = [
  'Confirmed',
  'Confirmed & Printed',
  'Bulk Exported',
  'Courier Ready',
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

// ── Main Component ────────────────────────────────────────────────
export const SalesReport = () => {
  const { updatePresenceContext } = useAuth();

  const [preset, setPreset]     = useState('today');
  const [dateRange, setDateRange] = useState(getPresetRange('today'));
  const [chartType, setChartType] = useState('bar'); // 'bar' | 'area'
  const [productSort, setProductSort] = useState('confirmed'); // sort column
  const [reportOrders, setReportOrders] = useState([]);
  const [fetching, setFetching] = useState(false);

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

  // ── KPI Aggregates ──
  const kpi = useMemo(() => {
    const isConf  = o => isConfirmedStatus(o.status);
    const isCanc  = o => o.status === 'Cancelled';
    const isFake  = o => o.status === 'Fake Order';
    const isPend  = o => ['New','Pending Call','Final Call Pending','Hold'].includes(o.status);

    const confirmed = filtered.filter(isConf);
    const revenue   = confirmed.reduce((s,o) => s + (Number(o.amount)||0), 0);
    const avgVal    = confirmed.length > 0 ? revenue / confirmed.length : 0;
    const confRate  = filtered.length > 0 ? ((confirmed.length / filtered.length)*100).toFixed(1) : 0;

    return {
      total: filtered.length,
      confirmed: confirmed.length,
      cancelled: filtered.filter(isCanc).length,
      fake: filtered.filter(isFake).length,
      pending: filtered.filter(isPend).length,
      revenue,
      avgVal,
      confRate,
    };
  }, [filtered]);

  // ── Daily Trend with proper timezone key mapping ──
  const dailyData = useMemo(() => {
    const map = {};
    filtered.forEach(o => {
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
      if (isConfirmedStatus(s)) {
        map[dayKey].confirmed++;
        map[dayKey].revenue += Number(o.amount||0);
      }
      else if (s==='Cancelled') map[dayKey].cancelled++;
      else if (s==='Fake Order') map[dayKey].fake++;
    });
    return Object.values(map).sort((a,b) => a.date.localeCompare(b.date));
  }, [filtered]);

  // ── Product-wise stats ──
  const productData = useMemo(() => {
    const map = {};
    filtered.forEach(o => {
      const items = Array.isArray(o.ordered_items) && o.ordered_items.length > 0
        ? o.ordered_items
        : [{ name: o.product_name, quantity: o.quantity||1, price: o.amount||0 }];

      items.forEach(item => {
        const name = (item.name || o.product_name || 'Unknown').trim();
        if (!map[name]) map[name] = { name, total:0, confirmed:0, cancelled:0, fake:0, revenue:0, qty:0 };
        map[name].total++;
        const s = o.status;
        if (isConfirmedStatus(s)) {
          map[name].confirmed++;
          map[name].revenue += Number(item.price||o.amount||0);
          map[name].qty     += Number(item.quantity||1);
        } else if (s==='Cancelled') map[name].cancelled++;
        else if (s==='Fake Order')  map[name].fake++;
      });
    });
    return Object.values(map)
      .map(p => ({ ...p, confRate: p.total > 0 ? +((p.confirmed/p.total)*100).toFixed(1) : 0, fakeRate: p.total > 0 ? +((p.fake/p.total)*100).toFixed(1) : 0 }))
      .sort((a,b) => b[productSort] - a[productSort]);
  }, [filtered, productSort]);

  // ── Status distribution for Pie ──
  const statusDist = useMemo(() => {
    const map = {};
    filtered.forEach(o => { map[o.status] = (map[o.status]||0) + 1; });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value);
  }, [filtered]);

  // ── Source breakdown ──
  const sourceData = useMemo(() => {
    const map = {};
    filtered.forEach(o => {
      const src = o.source || 'Unknown';
      if (!map[src]) map[src] = { source: src, total:0, confirmed:0, revenue:0 };
      map[src].total++;
      if (isConfirmedStatus(o.status)) { map[src].confirmed++; map[src].revenue += Number(o.amount||0); }
    });
    return Object.values(map)
      .map(s => ({ ...s, confRate: s.total > 0 ? +((s.confirmed/s.total)*100).toFixed(1) : 0 }))
      .sort((a,b) => b.total - a.total);
  }, [filtered]);

  // ── Top Sellers & Top Fake ──
  const topSellers = [...productData].sort((a,b) => b.confirmed - a.confirmed).slice(0,10);
  const topFake    = [...productData].sort((a,b) => b.fake - a.fake).filter(p => p.fake > 0).slice(0,10);

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
          <button className="sr-btn-export" onClick={() => exportCSV(filtered, presetLabel)}>
            <FileDown size={15}/> Export CSV
          </button>
          <button className="sr-btn-print" onClick={() => window.print()}>
            <Printer size={15}/> Print
          </button>
        </div>
      </div>

      {/* ── Date Presets ── */}
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
        <span className="sr-order-count">
          {fetching ? 'Syncing Accurate Data...' : `${fmtNum(filtered.length)} orders in range`}
        </span>
      </div>

      {/* ── KPI Cards ── */}
      <div className="sr-kpi-grid">
        <KpiCard icon={ShoppingCart}  label="Total Orders"       value={fmtNum(kpi.total)}       color="#6366f1" />
        <KpiCard icon={CheckCircle2}  label="Confirmed"          value={fmtNum(kpi.confirmed)}   color="#10b981" sub={`${kpi.confRate}% confirm rate`} />
        <KpiCard icon={XCircle}       label="Cancelled"          value={fmtNum(kpi.cancelled)}   color="#ef4444" />
        <KpiCard icon={AlertTriangle} label="Fake Orders"        value={fmtNum(kpi.fake)}         color="#f59e0b" />
        <KpiCard icon={Clock}         label="Pending"            value={fmtNum(kpi.pending)}     color="#3b82f6" />
        <KpiCard icon={DollarSign}    label="Total Revenue"      value={fmtTk(kpi.revenue)}      color="#10b981" />
        <KpiCard icon={BarChart3}     label="Avg Order Value"    value={fmtTk(Math.round(kpi.avgVal))} color="#8b5cf6" />
        <KpiCard icon={TrendingUp}    label="Confirm Rate"       value={`${kpi.confRate}%`}      color={kpi.confRate >= 50 ? '#10b981' : '#ef4444'} />
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
          <ResponsiveContainer width="100%" height={280}>
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
              <ResponsiveContainer width="100%" height={220}>
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
            <ResponsiveContainer width="100%" height={380}>
              <BarChart data={topSellers} layout="vertical" margin={{ top:0, right:16, left:0, bottom:0 }}>
                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill:'var(--sr-text-muted)', fontSize:11 }} />
                <YAxis dataKey="name" type="category" width={130} axisLine={false} tickLine={false} tick={{ fill:'var(--sr-text-sub)', fontSize:11, fontWeight:600 }} tickFormatter={(val) => val.length > 22 ? val.substring(0, 20) + '...' : val} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="confirmed" name="Confirmed" fill="#10b981" radius={[0,6,6,0]} maxBarSize={20} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="sr-card">
          <div className="sr-card-header">
            <SectionTitle icon={Flame} title="Top Fake Order Products" sub="Products with most fake orders" />
          </div>
          {topFake.length === 0 ? <div className="sr-empty">No fake orders — great! 🎉</div> : (
            <ResponsiveContainer width="100%" height={380}>
              <BarChart data={topFake} layout="vertical" margin={{ top:0, right:16, left:0, bottom:0 }}>
                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill:'var(--sr-text-muted)', fontSize:11 }} />
                <YAxis dataKey="name" type="category" width={130} axisLine={false} tickLine={false} tick={{ fill:'var(--sr-text-sub)', fontSize:11, fontWeight:600 }} tickFormatter={(val) => val.length > 22 ? val.substring(0, 20) + '...' : val} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="fake" name="Fake Orders" fill="#f59e0b" radius={[0,6,6,0]} maxBarSize={20} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Product-wise Table ── */}
      <div className="sr-card">
        <div className="sr-card-header">
          <SectionTitle icon={Package} title="Product-wise Sales Breakdown" sub="Click column header to sort" />
        </div>
        {productData.length === 0 ? <div className="sr-empty">No product data in this period</div> : (
          <div className="sr-product-table-wrap">
            <table className="sr-product-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Product</th>
                  <th className="sr-sortable" onClick={() => setProductSort('total')}>Total {productSort==='total'&&'↓'}</th>
                  <th className="sr-sortable" onClick={() => setProductSort('confirmed')}>Confirmed {productSort==='confirmed'&&'↓'}</th>
                  <th className="sr-sortable" onClick={() => setProductSort('cancelled')}>Cancelled {productSort==='cancelled'&&'↓'}</th>
                  <th className="sr-sortable" onClick={() => setProductSort('fake')}>Fake {productSort==='fake'&&'↓'}</th>
                  <th className="sr-sortable" onClick={() => setProductSort('revenue')}>Revenue {productSort==='revenue'&&'↓'}</th>
                  <th className="sr-sortable" onClick={() => setProductSort('confRate')}>Conf% {productSort==='confRate'&&'↓'}</th>
                </tr>
              </thead>
              <tbody>
                {productData.map((p, i) => (
                  <tr key={p.name} className={i===0 && productSort==='confirmed' ? 'sr-top-row' : ''}>
                    <td className="sr-rank">
                      {productSort==='confirmed' ? (i===0 ? '🥇' : i===1 ? '🥈' : i===2 ? '🥉' : i+1) : i+1}
                    </td>
                    <td className="sr-prod-name">
                      {p.name}
                      {p.fakeRate > 20 && <span className="sr-fake-warn">⚠️ High Fake</span>}
                      {i===0 && productSort==='confirmed' && <span className="sr-top-badge">🔥 Top</span>}
                    </td>
                    <td>{p.total}</td>
                    <td className="sr-green">{p.confirmed}</td>
                    <td className="sr-red">{p.cancelled}</td>
                    <td className="sr-orange">{p.fake}</td>
                    <td className="sr-green">{fmtTk(p.revenue)}</td>
                    <td><span className={`sr-rate-pill ${p.confRate>=50?'good':'warn'}`}>{p.confRate}%</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
};
