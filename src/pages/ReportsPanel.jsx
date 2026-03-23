import { useOrders } from '../context/OrderContext';
import { useAuth } from '../context/AuthContext';
import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { DateRangePicker } from '../components/DateRangePicker';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area,
  PieChart, Pie, Cell, 
  BarChart, Bar 
} from 'recharts';
import { Download, FileDown, TrendingUp, BarChart2, PieChart as PieChartIcon, Activity, Truck, Clock, AlertCircle } from 'lucide-react';
import { analytics } from '../utils/analytics';
import './ReportsPanel.css';

export const ReportsPanel = () => {
  const { orders, velocityMetrics } = useOrders();
  const { updatePresenceContext } = useAuth();

  useEffect(() => {
    updatePresenceContext('Analyzing Reports');
  }, [updatePresenceContext]);

  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().setDate(new Date().getDate() - 30)),
    end: new Date()
  });

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
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="page-header">
        <div>
          <h1>Reports & Analytics</h1>
          <p>Real-time business intelligence and operational KPIs.</p>
        </div>
        <div className="header-controls">
          <DateRangePicker value={dateRange} onChange={setDateRange} />
          <div className="export-actions">
          <Button variant="secondary" onClick={handleExportCSV}>
            <FileDown size={18} /> Export Orders (CSV)
          </Button>
          <Button variant="primary" onClick={handleDownloadReport}>
            <Download size={18} /> Daily Report
          </Button>
        </div>
      </div>
    </div>

      <div className="reports-grid">
        {/* Phase 6: Operational Heartbeat */}
        {velocityMetrics && (
          <div className="operational-heartbeat">
            <div className="section-title-wrap mb-4">
              <Activity className="text-primary" size={20} />
              <h2 className="text-xl font-bold">Operational Heartbeat</h2>
            </div>
            
            <div className="velocity-grid">
              <Card className="velocity-card liquid-glass">
                <span className="label">Confirmed → Factory</span>
                <div className="value">
                  {velocityMetrics.avgConfirmedToFactory}
                  <span className="unit">h</span>
                </div>
                <div className={`trend ${velocityMetrics.avgConfirmedToFactory < 8 ? 'good' : 'warn'}`}>
                  <Clock size={12} /> {velocityMetrics.avgConfirmedToFactory < 8 ? 'Healthy Pace' : 'Needs Optimization'}
                </div>
              </Card>

              <Card className="velocity-card liquid-glass">
                <span className="label">Factory → Courier</span>
                <div className="value">
                  {velocityMetrics.avgFactoryToCourier}
                  <span className="unit">h</span>
                </div>
                <div className={`trend ${velocityMetrics.avgFactoryToCourier < 18 ? 'good' : 'warn'}`}>
                  <Clock size={12} /> {velocityMetrics.avgFactoryToCourier < 18 ? 'Healthy Pace' : 'Delayed'}
                </div>
              </Card>

              <Card className="velocity-card liquid-glass">
                <span className="label">Orders Processed</span>
                <div className="value">{velocityMetrics.totalOrdersProcessed}</div>
                <div className="trend good">Analysis based on last 200 logs</div>
              </Card>
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
          </div>
        )}

        {/* Chart 1: Daily Order Volume */}
        <Card className="report-card liquid-glass report-chart-large">
          <div className="card-header">
            <div className="chart-title-wrap">
              <TrendingUp className="text-primary" size={20} />
              <h3>Daily Order Volume</h3>
            </div>
          </div>
          <div className="report-chart-container">
            <ResponsiveContainer width="100%" height={350}>
              <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorOrders" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#7c4dff" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#7c4dff" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.04)" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: 'var(--text-tertiary)', fontSize: 12}} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: 'var(--text-tertiary)', fontSize: 12}} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'rgba(255,255,255,0.8)', borderRadius: '16px', border: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.1)', backdropFilter: 'blur(10px)' }}
                />
                <Area type="monotone" dataKey="orders" stroke="var(--accent)" strokeWidth={4} fillOpacity={1} fill="url(#colorOrders)" activeDot={{ r: 8 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <div className="reports-secondary-grid">
          {/* Chart 2: Orders by Source */}
          <Card className="report-card liquid-glass">
            <div className="card-header">
              <div className="chart-title-wrap">
                <PieChartIcon className="text-indigo" size={20} />
                <h3>Orders by Source</h3>
              </div>
            </div>
            <div className="report-chart-container centered">
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={sourceData}
                    cx="50%"
                    cy="50%"
                    innerRadius={70}
                    outerRadius={90}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {sourceData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: '12px', border: '1px solid rgba(0,0,0,0.05)', boxShadow: '0 8px 24px rgba(0,0,0,0.08)' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="pie-legend">
                {sourceData.map(item => (
                  <div key={item.name} className="legend-item">
                    <span className="dot" style={{backgroundColor: item.color}}></span>
                    <span className="name">{item.name} <span className="value">({item.value})</span></span>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {/* Chart 3: Confirmation Rate */}
          <Card className="report-card liquid-glass">
            <div className="card-header">
              <div className="chart-title-wrap">
                <Activity className="text-teal" size={20} />
                <h3>Confirmation Rate (%)</h3>
              </div>
            </div>
            <div className="report-chart-container">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={confirmationData} margin={{top: 20, right: 10, left: -20, bottom: 0}}>
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: 'var(--text-tertiary)', fontSize: 12}} dy={10} />
                  <Tooltip 
                    cursor={{fill: 'rgba(var(--accent-rgb), 0.04)'}}
                    contentStyle={{ backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: '12px', border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}
                  />
                  <Bar dataKey="rate" fill="url(#colorConfirm)" radius={[6, 6, 0, 0]} barSize={30}>
                    {confirmationData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.rate > 85 ? '#2dd4bf' : '#94a3b8'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Chart 4: Logistics Success Rate */}
          <Card className="report-card liquid-glass">
            <div className="card-header">
              <div className="chart-title-wrap">
                <Truck className="text-purple" size={20} />
                <h3>Delivery Success Rate (%)</h3>
              </div>
            </div>
            <div className="report-chart-container">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={logisticsData} margin={{top: 20, right: 10, left: -20, bottom: 0}}>
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} dy={10} />
                  <Tooltip 
                    cursor={{fill: 'rgba(var(--accent-rgb), 0.04)'}}
                    contentStyle={{ backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: '12px', border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}
                  />
                  <Bar dataKey="rate" fill="url(#colorCourier)" radius={[6, 6, 0, 0]} barSize={30}>
                    {logisticsData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.rate > 90 ? '#3f51b5' : '#7c4dff'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      </div>
    </motion.div>
  );
};
