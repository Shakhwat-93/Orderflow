import { useOrders } from '../context/OrderContext';
import { useAuth } from '../context/AuthContext';
import { useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { DateRangePicker } from '../components/DateRangePicker';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area,
  PieChart, Pie, Cell, 
  BarChart, Bar 
} from 'recharts';
import { Download, FileDown, TrendingUp, BarChart2, PieChart as PieChartIcon, Activity, Truck, Clock, AlertCircle, ArrowUpRight, ArrowDownRight, Zap } from 'lucide-react';
import { analytics } from '../utils/analytics';
import { deserializeDateRange, usePersistentState } from '../utils/persistentState';
import { createStaggerContainer, slideUpVariants } from '../lib/motion';
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
const reportContainerVariants = createStaggerContainer(0.08, 0.04);

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
      variants={reportContainerVariants}
      initial="hidden"
      animate="visible"
    >
      <motion.div className="reports-control-hub-elite" variants={slideUpVariants}>
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
          <motion.div className="operational-heartbeat-elite" variants={slideUpVariants}>
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

        <motion.div className="main-chart-card-elite glass" variants={slideUpVariants}>
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
                  animationDuration={360}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        <div className="reports-secondary-grid-elite">
          <motion.div className="secondary-chart-card glass" variants={slideUpVariants}>
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

          <motion.div className="secondary-chart-card glass" variants={slideUpVariants}>
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

          <motion.div className="secondary-chart-card glass" variants={slideUpVariants}>
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
    </motion.div>
  );
};
