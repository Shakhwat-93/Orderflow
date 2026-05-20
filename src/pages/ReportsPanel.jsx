import { useOrders } from '../context/OrderContext';
import { useAuth } from '../context/AuthContext';
import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { DateRangePicker } from '../components/DateRangePicker';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area,
  PieChart, Pie, Cell, 
  BarChart, Bar 
} from 'recharts';
import { Download, FileDown, TrendingUp, BarChart2, PieChart as PieChartIcon, Activity, Truck, Clock, AlertCircle, ArrowUpRight, ArrowDownRight, Zap, Megaphone } from 'lucide-react';
import { analytics } from '../utils/analytics';
import { deserializeDateRange, usePersistentState } from '../utils/persistentState';
import { supabase } from '../lib/supabase';
import './ReportsPanel.css';

// ── Custom Tooltip for Premium Charts ──
const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="reports-custom-tooltip">
        <p className="label">{label}</p>
        {payload.map((entry, index) => (
          <div key={index} className="tooltip-row">
            <span className="dot" style={{ backgroundColor: entry.color || entry.fill }}></span>
            <span className="name">{entry.name}:</span>
            <span className="value">{entry.value}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

// ── Animation Constants ──
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { type: 'spring', damping: 25, stiffness: 100 }
  }
};

export const ReportsPanel = () => {
  const { orders, velocityMetrics } = useOrders();
  const { updatePresenceContext } = useAuth();

  useEffect(() => {
    updatePresenceContext('Analyzing Reports');
  }, [updatePresenceContext]);

  const [dateRange, setDateRange] = usePersistentState(
    'panel:reports:dateRange',
    () => ({
      start: new Date(new Date().setDate(new Date().getDate() - 30)),
      end: new Date()
    }),
    { deserialize: deserializeDateRange }
  );

  // Filter orders by date range
  const filteredOrders = useMemo(() => {
    if (!orders) return [];
    return orders.filter(o => {
      const d = new Date(o.created_at);
      return d >= dateRange.start && d <= dateRange.end;
    });
  }, [orders, dateRange]);

  // Dynamic Data Calculation
  const trendData = useMemo(() => analytics.getDailyTrend(filteredOrders, 7), [filteredOrders]);
  const sourceData = useMemo(() => analytics.getSourceDistribution(filteredOrders), [filteredOrders]);
  const confirmationData = useMemo(() => analytics.getConfirmationRate(filteredOrders), [filteredOrders]);
  const logisticsData = useMemo(() => analytics.getLogisticsSuccessRate(filteredOrders), [filteredOrders]);

  // ── Ads Cost Analytics (day-wise) ──
  const [adsData, setAdsData] = useState([]);
  const [adsLoading, setAdsLoading] = useState(false);

  useEffect(() => {
    const fetchAdsData = async () => {
      setAdsLoading(true);
      try {
        const startStr = dateRange.start.toISOString().split('T')[0];
        const endStr   = dateRange.end.toISOString().split('T')[0];

        const { data: reports } = await supabase
          .from('ads_reports')
          .select(`
            id, report_date, total_spend, total_orders, submitted_by_name,
            ads_campaigns (
              spend, orders_received, quantity,
              bdt_per_purchase, bdt_av_value, order_value_bdt
            )
          `)
          .eq('status', 'submitted')
          .gte('report_date', startStr)
          .lte('report_date', endStr)
          .order('report_date', { ascending: true });

        if (!reports) { setAdsData([]); return; }

        // Aggregate by date (multiple submitters on same day → sum)
        const byDate = {};
        for (const r of reports) {
          const d = r.report_date;
          if (!byDate[d]) byDate[d] = { date: d, total_spend: 0, total_orders: 0, total_bdt_cost: 0, total_order_value_bdt: 0, qty: 0 };
          byDate[d].total_spend        += Number(r.total_spend || 0);
          byDate[d].total_orders       += Number(r.total_orders || 0);
          for (const c of (r.ads_campaigns || [])) {
            byDate[d].total_bdt_cost       += Number(c.bdt_per_purchase || 0) * Number(c.quantity || 0);
            byDate[d].total_order_value_bdt += Number(c.order_value_bdt || 0);
            byDate[d].qty                  += Number(c.quantity || 0);
          }
        }

        const formatted = Object.values(byDate).map(d => ({
          name:            new Date(d.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
          date:            d.date,
          spend:           Math.round(d.total_bdt_cost),
          orders:          d.total_orders,
          order_value:     Math.round(d.total_order_value_bdt),
          roas:            d.total_bdt_cost > 0 ? +(d.total_order_value_bdt / d.total_bdt_cost).toFixed(2) : 0,
          qty:             d.qty,
        }));

        setAdsData(formatted);
      } catch (e) {
        console.error('[ReportsPanel] Ads fetch error:', e);
      } finally {
        setAdsLoading(false);
      }
    };

    fetchAdsData();
  }, [dateRange]);

  // Export Orders as CSV
  const handleExportCSV = () => {
    if (!orders || orders.length === 0) return;

    // Build CSV header and rows
    const headers = ['Order ID', 'Customer Name', 'Phone', 'Product', 'Size', 'Quantity', 'Source', 'Status', 'Amount', 'Date'];
    const csvContent = [
      headers.join(','),
      ...orders.map(o => [
        o.id,
        `"${o.customer_name}"`, // Escape commas in name
        `"${o.phone}"`,
        `"${o.product_name}"`,
        o.size,
        o.quantity,
        o.source,
        o.status,
        o.amount,
        new Date(o.created_at).toLocaleDateString()
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `orders_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Mock download daily report (PDF or similar)
  const handleDownloadReport = () => {
    // In a real app, this would query a backend endpoint to generate a PDF report.
    // Here we'll simulate it by triggering a fake download.
    const blob = new Blob(['Daily Sales Report Content'], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `daily_report_${new Date().toISOString().split('T')[0]}.txt`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <motion.div 
      className="reports-panel"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <motion.div className="reports-control-hub-elite" variants={itemVariants}>
        <div className="hub-info">
          <div className="hub-title-group">
            <div className="hub-icon-wrap">
              <BarChart2 size={24} />
            </div>
            <div>
              <h1>Intelligence Center</h1>
              <p>Operational health & business performance metrics</p>
            </div>
          </div>
        </div>

        <div className="hub-actions">
          <div className="hub-picker-wrap">
            <DateRangePicker value={dateRange} onChange={setDateRange} />
          </div>
          <div className="hub-button-group">
            <button className="hub-btn secondary" onClick={handleExportCSV}>
              <FileDown size={18} /> <span>CSV</span>
            </button>
            <button className="hub-btn primary" onClick={handleDownloadReport}>
              <Download size={18} /> <span>Full Report</span>
            </button>
          </div>
        </div>
      </motion.div>

      <div className="reports-grid-elite">
        {velocityMetrics && (
          <motion.div className="operational-heartbeat-elite" variants={itemVariants}>
            <div className="section-header-elite">
              <div className="heartbeat-pulse">
                <Zap size={14} fill="currentColor" />
              </div>
              <h3>Live Operational Heartbeat</h3>
            </div>
            
            <div className="velocity-grid-elite">
              <div className="velocity-card-elite glass">
                <div className="v-card-top">
                  <span className="label">System Latency (Conf → Factory)</span>
                  <div className={`v-trend ${velocityMetrics.avgConfirmedToFactory < 8 ? 'positive' : 'negative'}`}>
                    {velocityMetrics.avgConfirmedToFactory < 8 ? <ArrowDownRight size={14} /> : <ArrowUpRight size={14} />}
                    <span>{velocityMetrics.avgConfirmedToFactory < 8 ? '-12%' : '+5%'}</span>
                  </div>
                </div>
                <div className="v-value-group">
                  <div className="value">
                    {velocityMetrics.avgConfirmedToFactory}
                    <span className="unit">h</span>
                  </div>
                  <div className={`status-pill ${velocityMetrics.avgConfirmedToFactory < 8 ? 'healthy' : 'warn'}`}>
                    {velocityMetrics.avgConfirmedToFactory < 8 ? 'Optimum' : 'Optimizing'}
                  </div>
                </div>
              </div>

              <div className="velocity-card-elite glass">
                <div className="v-card-top">
                  <span className="label">Processing Pipeline (Factory → Courier)</span>
                  <div className={`v-trend ${velocityMetrics.avgFactoryToCourier < 18 ? 'positive' : 'negative'}`}>
                    {velocityMetrics.avgFactoryToCourier < 18 ? <ArrowDownRight size={14} /> : <ArrowUpRight size={14} />}
                    <span>{velocityMetrics.avgFactoryToCourier < 18 ? '-8%' : '+15%'}</span>
                  </div>
                </div>
                <div className="v-value-group">
                  <div className="value">
                    {velocityMetrics.avgFactoryToCourier}
                    <span className="unit">h</span>
                  </div>
                  <div className={`status-pill ${velocityMetrics.avgFactoryToCourier < 18 ? 'healthy' : 'warn'}`}>
                    {velocityMetrics.avgFactoryToCourier < 18 ? 'Fluid' : 'Capacity Full'}
                  </div>
                </div>
              </div>

              <div className="velocity-card-elite glass">
                <div className="v-card-top">
                  <span className="label">Total Intelligence Assets</span>
                </div>
                <div className="v-value-group">
                  <div className="value">{velocityMetrics.totalOrdersProcessed}</div>
                  <div className="status-pill blue">Verified Logs</div>
                </div>
              </div>
            </div>

            {velocityMetrics.bottlenecks.length > 0 && (
              <div className="bottlenecks-section">
                {velocityMetrics.bottlenecks.map((bottleneck, idx) => (
                  <div key={idx} className={`bottleneck-alert ${bottleneck.severity}`}>
                    <div className="icon-wrap">
                      <AlertCircle size={20} />
                    </div>
                    <div className="content">
                      <div className="title">Bottleneck Detected: {bottleneck.stage}</div>
                      <div className="msg">{bottleneck.message}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        <motion.div className="main-chart-card-elite glass" variants={itemVariants}>
          <div className="chart-header-elite">
            <div className="chart-title-hub">
              <TrendingUp className="chart-icon" size={20} />
              <div>
                <h3>Growth Trajectory</h3>
                <p>Order volume trend analysis</p>
              </div>
            </div>
            <div className="chart-stats-mini">
              <div className="mini-stat">
                <span className="lv">Peak Vol</span>
                <span className="vv">142</span>
              </div>
              <div className="mini-stat">
                <span className="lv">Avg Vol</span>
                <span className="vv">86</span>
              </div>
            </div>
          </div>
          <div className="report-chart-container-elite">
            <ResponsiveContainer width="100%" height={400}>
              <AreaChart data={trendData} margin={{ top: 20, right: 30, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorOrdersElite" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="var(--accent)" stopOpacity={0.01}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(124, 77, 255, 0.05)" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{fill: 'var(--text-tertiary)', fontSize: 11, fontWeight: 500}} 
                  dy={15} 
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{fill: 'var(--text-tertiary)', fontSize: 11, fontWeight: 500}} 
                />
                <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'var(--accent)', strokeWidth: 1, strokeDasharray: '4 4' }} />
                <Area 
                  type="monotone" 
                  dataKey="orders" 
                  stroke="var(--accent)" 
                  strokeWidth={4} 
                  fillOpacity={1} 
                  fill="url(#colorOrdersElite)" 
                  activeDot={{ r: 6, strokeWidth: 0, fill: 'var(--accent)' }} 
                  animationDuration={1500}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        <div className="reports-secondary-grid-elite">
          <motion.div className="secondary-chart-card glass" variants={itemVariants}>
            <div className="card-header-elite">
              <PieChartIcon className="chart-icon icon-indigo" size={18} />
              <h3>Source Acquisition</h3>
            </div>
            <div className="report-chart-container centered">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={sourceData}
                    cx="50%"
                    cy="50%"
                    innerRadius={65}
                    outerRadius={85}
                    paddingAngle={8}
                    dataKey="value"
                  >
                    {sourceData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} strokeWidth={0} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pie-legend-elite">
                {sourceData.map(item => (
                  <div key={item.name} className="legend-item-elite">
                    <span className="dot" style={{backgroundColor: item.color}}></span>
                    <span className="name">{item.name}</span>
                    <span className="value">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>

          <motion.div className="secondary-chart-card glass" variants={itemVariants}>
            <div className="card-header-elite">
              <Activity className="chart-icon icon-teal" size={18} />
              <h3>Confirmation Logic</h3>
            </div>
            <div className="report-chart-container">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={confirmationData} margin={{top: 10, right: 10, left: -25, bottom: 0}}>
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: 'var(--text-tertiary)', fontSize: 10}} dy={10} />
                  <Tooltip content={<CustomTooltip />} cursor={{fill: 'rgba(255,255,255,0.05)'}} />
                  <Bar dataKey="rate" radius={[4, 4, 0, 0]} barSize={24}>
                    {confirmationData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.rate > 85 ? 'var(--color-success)' : 'var(--text-tertiary)'} fillOpacity={0.6} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </motion.div>

          <motion.div className="secondary-chart-card glass" variants={itemVariants}>
            <div className="card-header-elite">
              <Truck className="chart-icon icon-purple" size={18} />
              <h3>Logistics Success</h3>
            </div>
            <div className="report-chart-container">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={logisticsData} margin={{top: 10, right: 10, left: -25, bottom: 0}}>
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: 'var(--text-tertiary)', fontSize: 10}} dy={10} />
                  <Tooltip content={<CustomTooltip />} cursor={{fill: 'rgba(255,255,255,0.05)'}} />
                  <Bar dataKey="rate" radius={[4, 4, 0, 0]} barSize={24}>
                    {logisticsData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.rate > 90 ? 'var(--accent)' : 'var(--color-primary-soft)'} fillOpacity={0.6} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </motion.div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════
          DAILY ADS COST INTELLIGENCE — day-wise BDT analytics
      ══════════════════════════════════════════════════ */}
      <motion.div className="ads-analytics-section" variants={itemVariants}>
        <div className="section-header-elite">
          <div className="heartbeat-pulse ads-pulse">
            <Megaphone size={14} fill="currentColor" />
          </div>
          <h3>Daily Ads Cost Intelligence</h3>
          <span className="ads-section-badge">BDT Breakdown</span>
        </div>

        {adsLoading ? (
          <div className="ads-loading-state">
            <div className="ads-loader-spin" />
            <span>Fetching marketing data...</span>
          </div>
        ) : adsData.length === 0 ? (
          <div className="ads-empty-state">
            <Megaphone size={28} />
            <p>No submitted ads reports found for the selected date range.</p>
            <span>Go to Marketing → Submit a daily report to see data here.</span>
          </div>
        ) : (
          <>
            {/* Summary KPI strip */}
            <div className="ads-kpi-strip">
              <div className="ads-kpi-card">
                <span className="ads-kpi-label">Total Ads Cost (BDT)</span>
                <span className="ads-kpi-value">৳{adsData.reduce((s, d) => s + d.spend, 0).toLocaleString()}</span>
              </div>
              <div className="ads-kpi-card">
                <span className="ads-kpi-label">Total Order Value (BDT)</span>
                <span className="ads-kpi-value positive">৳{adsData.reduce((s, d) => s + d.order_value, 0).toLocaleString()}</span>
              </div>
              <div className="ads-kpi-card">
                <span className="ads-kpi-label">Avg. Daily Spend</span>
                <span className="ads-kpi-value">৳{Math.round(adsData.reduce((s, d) => s + d.spend, 0) / adsData.length).toLocaleString()}</span>
              </div>
              <div className="ads-kpi-card">
                <span className="ads-kpi-label">Avg. ROAS</span>
                <span className="ads-kpi-value accent">
                  {(adsData.reduce((s, d) => s + d.roas, 0) / adsData.length).toFixed(2)}x
                </span>
              </div>
            </div>

            {/* Day-wise Bar Chart */}
            <div className="ads-chart-container">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={adsData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(99,102,241,0.06)" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} tickFormatter={v => `৳${v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}`} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <div className="ads-custom-tooltip">
                          <p className="ads-tt-date">{label}</p>
                          {payload.map((p, i) => (
                            <div key={i} className="ads-tt-row">
                              <span className="ads-tt-dot" style={{ background: p.fill }} />
                              <span>{p.name}:</span>
                              <strong>৳{Number(p.value).toLocaleString()}</strong>
                            </div>
                          ))}
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="spend" name="Ads Cost" fill="#6366f1" fillOpacity={0.85} radius={[6, 6, 0, 0]} barSize={22} />
                  <Bar dataKey="order_value" name="Order Value" fill="#10b981" fillOpacity={0.75} radius={[6, 6, 0, 0]} barSize={22} />
                </BarChart>
              </ResponsiveContainer>
              <div className="ads-chart-legend">
                <span><i style={{ background: '#6366f1' }} />Ads Cost (৳)</span>
                <span><i style={{ background: '#10b981' }} />Order Value (৳)</span>
              </div>
            </div>

            {/* Day-wise detailed table */}
            <div className="ads-day-table">
              <div className="ads-day-table-head">
                <span>Date</span>
                <span>Qty</span>
                <span>Ads Cost (৳)</span>
                <span>Per Purchase Av.</span>
                <span>Order Value (৳)</span>
                <span>Orders</span>
                <span>ROAS</span>
              </div>
              {adsData.map((row) => (
                <div key={row.date} className={`ads-day-row ${row.roas >= 2 ? 'good-roas' : row.roas > 0 && row.roas < 1 ? 'poor-roas' : ''}`}>
                  <span className="ads-day-date">{row.name}</span>
                  <span>{row.qty || '—'}</span>
                  <span className="ads-spend-val">৳{row.spend.toLocaleString()}</span>
                  <span>{row.qty > 0 ? `৳${Math.round(row.spend / row.qty).toLocaleString()}` : '—'}</span>
                  <span className="ads-orderval-val">৳{row.order_value.toLocaleString()}</span>
                  <span>{row.orders}</span>
                  <span className={`ads-roas-badge ${row.roas >= 2 ? 'roas-good' : row.roas > 0 ? 'roas-ok' : 'roas-none'}`}>
                    {row.roas > 0 ? `${row.roas}x` : '—'}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  );
};
