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

  // Product-wise & Source-wise Conversion Funnel Data
  const productFunnelData = useMemo(() => {
    const productsToTrack = [
      { id: 'stb_black', label: 'STB Black', keywords: ['stb black', 'black stb'] },
      { id: 'stb_beige', label: 'STB Beige', keywords: ['stb beige', 'beige stb'] },
      { id: 'sunglass', label: 'Sunglass', keywords: ['sunglass', 'sunglasses'] }
    ];

    const stats = productsToTrack.map(p => ({
      name: p.label,
      total: 0,
      confirmed: 0,
      cancelled: 0,
      fbConfirmed: 0,
      fbTotal: 0,
      ttConfirmed: 0,
      ttTotal: 0,
    }));

    filteredOrders.forEach(o => {
      const orderProducts = [];
      if (Array.isArray(o.ordered_items)) {
        o.ordered_items.forEach(item => {
          if (item.name) orderProducts.push(item.name.toLowerCase());
        });
      }
      if (o.product_name) {
        orderProducts.push(o.product_name.toLowerCase());
      }

      productsToTrack.forEach((p, idx) => {
        const matches = orderProducts.some(name => p.keywords.some(kw => name.includes(kw)));
        if (matches) {
          stats[idx].total += 1;
          const isConfirmed = o.status === 'Confirmed' || o.status === 'Confirmed & Printed';
          const isCancelled = o.status === 'Cancelled';
          
          if (isConfirmed) stats[idx].confirmed += 1;
          if (isCancelled) stats[idx].cancelled += 1;

          const src = String(o.source || '').toLowerCase();
          const isFB = src.includes('facebook') || src === 'fb';
          const isTT = src.includes('tiktok');

          if (isFB) {
            stats[idx].fbTotal += 1;
            if (isConfirmed) stats[idx].fbConfirmed += 1;
          } else if (isTT) {
            stats[idx].ttTotal += 1;
            if (isConfirmed) stats[idx].ttConfirmed += 1;
          }
        }
      });
    });

    return stats.map(s => {
      const confirmationRate = s.total > 0 ? Math.round((s.confirmed / s.total) * 100) : 0;
      const fbRate = s.fbTotal > 0 ? Math.round((s.fbConfirmed / s.fbTotal) * 100) : 0;
      const ttRate = s.ttTotal > 0 ? Math.round((s.ttConfirmed / s.ttTotal) * 100) : 0;

      return {
        name: s.name,
        'Confirmation Rate': confirmationRate,
        'Facebook Conf. Rate': fbRate,
        'TikTok Conf. Rate': ttRate,
        total: s.total,
        confirmed: s.confirmed,
        fbTotal: s.fbTotal,
        ttTotal: s.ttTotal
      };
    });
  }, [filteredOrders]);

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

  // ── User Performance Analytics — own date filter ──
  const [userPerfData,    setUserPerfData]    = useState(null);
  const [userPerfLoading, setUserPerfLoading] = useState(false);
  const [selectedUser,    setSelectedUser]    = useState('all');
  const [perfView,        setPerfView]        = useState('overview');

  // Helper: create a Date at local midnight (start) or 23:59:59.999 (end) for a day offset
  const mkDay = (off = 0, isStart = true) => {
    const d = new Date();
    d.setDate(d.getDate() + off);
    // Use local time, not UTC, so BD 12:00 AM is the true boundary
    if (isStart) {
      d.setHours(0, 0, 0, 0);      // local midnight = 12:00 AM BD
    } else {
      d.setHours(23, 59, 59, 999); // local end-of-day = 11:59:59 PM BD
    }
    return d;
  };
  const [perfDateRange, setPerfDateRange] = useState({ start: mkDay(0, true), end: mkDay(0, false) });
  const [perfPreset,    setPerfPreset]    = useState('today');
  const applyPerfPreset = (preset) => {
    const map = {
      today:     { start: mkDay(0,true),   end: mkDay(0,false) },
      yesterday: { start: mkDay(-1,true),  end: mkDay(-1,false) },
      '7d':      { start: mkDay(-6,true),  end: mkDay(0,false) },
      '30d':     { start: mkDay(-29,true), end: mkDay(0,false) },
    };
    if (map[preset]) { setPerfPreset(preset); setPerfDateRange(map[preset]); }
  };

  useEffect(() => {
    const fetchUserPerformance = async () => {
      setUserPerfLoading(true);
      try {
        /**
         * TIMEZONE FIX:
         * toISOString() always returns UTC. For BD (UTC+6), local midnight
         * = UTC previous day 18:00. So we must send the LOCAL time as ISO,
         * not the UTC-converted value.
         * We do this by shifting: localISO = UTCtime - tzOffset
         */
        const toLocalISO = (date) => {
          const tzOffset = date.getTimezoneOffset() * 60000; // offset in ms
          return new Date(date.getTime() - tzOffset).toISOString();
        };

        const startISO = toLocalISO(perfDateRange.start); // local 00:00:00
        const endISO   = toLocalISO(perfDateRange.end);   // local 23:59:59.999

        // Fetch STATUS_CHANGE logs from real agents (exclude System bulk ops)
        const { data: logs } = await supabase
          .from('order_activity_logs')
          .select('changed_by_user_name, new_status, timestamp, action_type, order_id')
          .in('action_type', ['STATUS_CHANGE'])
          .gte('timestamp', startISO)
          .lte('timestamp', endISO)
          .neq('changed_by_user_name', 'System')
          .order('timestamp', { ascending: true });

        if (!logs || logs.length === 0) {
          setUserPerfData({ byUser: [], byDay: [], allUsers: [] });
          return;
        }

        // Collect all unique users
        const allUsers = [...new Set(logs.map(l => l.changed_by_user_name))].filter(Boolean).sort();

        // ── Aggregate by user ──
        const userMap = {};
        for (const l of logs) {
          const u = l.changed_by_user_name || 'Unknown';
          if (!userMap[u]) userMap[u] = { name: u, attempted: 0, confirmed: 0, cancelled: 0, fake: 0, pending: 0, other: 0 };
          userMap[u].attempted++;
          const s = (l.new_status || '').toLowerCase();
          if (s === 'confirmed')        userMap[u].confirmed++;
          else if (s === 'cancelled')   userMap[u].cancelled++;
          else if (s === 'fake order')  userMap[u].fake++;
          else if (s.includes('pending')) userMap[u].pending++;
          else                          userMap[u].other++;
        }

        const byUser = Object.values(userMap).map(u => ({
          ...u,
          confirmRate: u.attempted > 0 ? +((u.confirmed / u.attempted) * 100).toFixed(1) : 0,
          cancelRate:  u.attempted > 0 ? +((u.cancelled / u.attempted) * 100).toFixed(1) : 0,
          fakeRate:    u.attempted > 0 ? +((u.fake      / u.attempted) * 100).toFixed(1) : 0,
        })).sort((a, b) => b.confirmed - a.confirmed);

        // ── Aggregate by day (for daily view) ──
        const dayMap = {};
        for (const l of logs) {
          const day  = l.timestamp.split('T')[0];
          const user = l.changed_by_user_name || 'Unknown';
          const key  = `${day}__${user}`;
          if (!dayMap[key]) dayMap[key] = { date: day, user, attempted: 0, confirmed: 0, cancelled: 0, fake: 0, pending: 0 };
          dayMap[key].attempted++;
          const s = (l.new_status || '').toLowerCase();
          if (s === 'confirmed')          dayMap[key].confirmed++;
          else if (s === 'cancelled')     dayMap[key].cancelled++;
          else if (s === 'fake order')    dayMap[key].fake++;
          else if (s.includes('pending')) dayMap[key].pending++;
        }

        // Group by day for chart (all users combined or filtered)
        const dayChartMap = {};
        for (const entry of Object.values(dayMap)) {
          const d = entry.date;
          if (!dayChartMap[d]) dayChartMap[d] = { name: new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }), date: d, confirmed: 0, cancelled: 0, fake: 0, attempted: 0 };
          dayChartMap[d].attempted  += entry.attempted;
          dayChartMap[d].confirmed  += entry.confirmed;
          dayChartMap[d].cancelled  += entry.cancelled;
          dayChartMap[d].fake       += entry.fake;
        }

        const byDay = Object.values(dayChartMap).sort((a, b) => a.date.localeCompare(b.date));

        setUserPerfData({ byUser, byDay, allUsers, byDayPerUser: Object.values(dayMap) });
      } catch (e) {
        console.error('[ReportsPanel] User perf fetch error:', e);
      } finally {
        setUserPerfLoading(false);
      }
    };

    fetchUserPerformance();
  }, [perfDateRange]);

  // Filtered day data for selected user
  const filteredDayData = useMemo(() => {
    if (!userPerfData?.byDayPerUser) return [];
    const rows = selectedUser === 'all'
      ? userPerfData.byDayPerUser
      : userPerfData.byDayPerUser.filter(r => r.user === selectedUser);

    // Group by date
    const m = {};
    for (const r of rows) {
      if (!m[r.date]) m[r.date] = { name: new Date(r.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }), date: r.date, confirmed: 0, cancelled: 0, fake: 0, attempted: 0 };
      m[r.date].attempted  += r.attempted;
      m[r.date].confirmed  += r.confirmed;
      m[r.date].cancelled  += r.cancelled;
      m[r.date].fake       += r.fake;
    }
    return Object.values(m).sort((a, b) => a.date.localeCompare(b.date));
  }, [userPerfData, selectedUser]);

  // Filtered user table data
  const filteredUserData = useMemo(() => {
    if (!userPerfData?.byUser) return [];
    if (selectedUser === 'all') return userPerfData.byUser;
    return userPerfData.byUser.filter(u => u.name === selectedUser);
  }, [userPerfData, selectedUser]);


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

      {/* ═══════════════════════════════════════════════════
          AGENT PERFORMANCE INTELLIGENCE
      ═══════════════════════════════════════════════════ */}
      <motion.div className="uperf-section" variants={itemVariants}>

        {/* ── Title Row ── */}
        <div className="uperf-title-row">
          <div className="section-header-elite" style={{ flex: 1 }}>
            <div className="heartbeat-pulse uperf-pulse">
              <Activity size={14} fill="currentColor" />
            </div>
            <h3>Agent Performance Intelligence</h3>
            <span className="uperf-badge">Live Tracking</span>
          </div>
        </div>

        {/* ── Filter Bar: Date Presets + Custom Range + View Toggle + Agent Select ── */}
        <div className="uperf-filter-bar">

          {/* Quick presets */}
          <div className="uperf-presets">
            {[
              { key: 'today',     label: 'Today' },
              { key: 'yesterday', label: 'Yesterday' },
              { key: '7d',        label: '7 Days' },
              { key: '30d',       label: '30 Days' },
            ].map(p => (
              <button
                key={p.key}
                className={`uperf-preset-btn ${perfPreset === p.key ? 'active' : ''}`}
                onClick={() => applyPerfPreset(p.key)}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Custom date inputs */}
          <div className="uperf-date-inputs">
            <input
              type="date"
              className="uperf-date-input"
              value={perfDateRange.start.toISOString().split('T')[0]}
              onChange={e => {
                const d = new Date(e.target.value); d.setHours(0,0,0,0);
                setPerfDateRange(r => ({ ...r, start: d }));
                setPerfPreset('custom');
              }}
            />
            <span className="uperf-date-sep">→</span>
            <input
              type="date"
              className="uperf-date-input"
              value={perfDateRange.end.toISOString().split('T')[0]}
              onChange={e => {
                const d = new Date(e.target.value); d.setHours(23,59,59,999);
                setPerfDateRange(r => ({ ...r, end: d }));
                setPerfPreset('custom');
              }}
            />
          </div>

          <div className="uperf-filter-right">
            {/* View Toggle */}
            <div className="uperf-view-toggle">
              <button className={`uperf-toggle-btn ${perfView === 'overview' ? 'active' : ''}`} onClick={() => setPerfView('overview')}>Overview</button>
              <button className={`uperf-toggle-btn ${perfView === 'daily' ? 'active' : ''}`}    onClick={() => setPerfView('daily')}>Day-wise</button>
            </div>

            {/* Agent select */}
            <select className="uperf-user-select" value={selectedUser} onChange={e => setSelectedUser(e.target.value)}>
              <option value="all">All Agents</option>
              {(userPerfData?.allUsers || []).map(u => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </div>
        </div>

        {userPerfLoading ? (
          <div className="ads-loading-state">
            <div className="ads-loader-spin" />
            <span>Loading agent performance data...</span>
          </div>
        ) : !userPerfData || userPerfData.byUser.length === 0 ? (
          <div className="ads-empty-state">
            <Activity size={28} />
            <p>No performance data found for the selected period.</p>
            <span>Agent activity logs will appear here as orders are processed.</span>
          </div>
        ) : (
          <>
            {/* ── OVERVIEW: Summary cards + Leaderboard ── */}
            {perfView === 'overview' && (
              <>
                {/* Per-agent summary cards */}
                <div className="uperf-cards-grid">
                  {filteredUserData.map(u => (
                    <div key={u.name} className={`uperf-agent-card ${selectedUser === u.name ? 'selected' : ''}`}
                      onClick={() => setSelectedUser(selectedUser === u.name ? 'all' : u.name)}>
                      <div className="uperf-agent-avatar">
                        {u.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="uperf-agent-info">
                        <span className="uperf-agent-name">{u.name}</span>
                        <span className="uperf-agent-total">{u.attempted} total actions</span>
                      </div>
                      <div className="uperf-agent-stats">
                        <div className="uperf-mini-stat confirmed">
                          <span>{u.confirmed}</span>
                          <label>Confirmed</label>
                        </div>
                        <div className="uperf-mini-stat cancelled">
                          <span>{u.cancelled}</span>
                          <label>Cancelled</label>
                        </div>
                        <div className="uperf-mini-stat fake">
                          <span>{u.fake}</span>
                          <label>Fake</label>
                        </div>
                      </div>
                      <div className="uperf-confirm-rate">
                        <span className="uperf-rate-val">{u.confirmRate}%</span>
                        <label>Confirm Rate</label>
                        <div className="uperf-rate-bar">
                          <div className="uperf-rate-fill confirmed" style={{ width: `${u.confirmRate}%` }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Leaderboard table */}
                <div className="uperf-leaderboard">
                  <div className="uperf-lb-head">
                    <span>Rank</span>
                    <span>Agent</span>
                    <span>Attempted</span>
                    <span>✅ Confirmed</span>
                    <span>❌ Cancelled</span>
                    <span>🚫 Fake</span>
                    <span>⏳ Pending</span>
                    <span>Confirm %</span>
                    <span>Cancel %</span>
                    <span>Fake %</span>
                  </div>
                  {filteredUserData.map((u, i) => (
                    <div key={u.name} className={`uperf-lb-row ${i === 0 && selectedUser === 'all' ? 'top-performer' : ''}`}>
                      <span className="uperf-rank">
                        {selectedUser === 'all' ? (i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`) : '—'}
                      </span>
                      <span className="uperf-lb-name">{u.name}</span>
                      <span className="uperf-lb-num">{u.attempted}</span>
                      <span className="uperf-lb-num green">{u.confirmed}</span>
                      <span className="uperf-lb-num red">{u.cancelled}</span>
                      <span className="uperf-lb-num orange">{u.fake}</span>
                      <span className="uperf-lb-num blue">{u.pending}</span>
                      <span className={`uperf-rate-pill ${u.confirmRate >= 50 ? 'good' : 'warn'}`}>{u.confirmRate}%</span>
                      <span className={`uperf-rate-pill ${u.cancelRate > 30 ? 'bad' : 'neutral'}`}>{u.cancelRate}%</span>
                      <span className={`uperf-rate-pill ${u.fakeRate > 15 ? 'bad' : 'neutral'}`}>{u.fakeRate}%</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* ── DAILY VIEW: Stacked bar chart + day table ── */}
            {perfView === 'daily' && (
              <>
                {/* Stacked bar chart */}
                <div className="uperf-chart-wrap">
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={filteredDayData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(99,102,241,0.05)" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false}
                        tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} dy={10} />
                      <YAxis axisLine={false} tickLine={false}
                        tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} />
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
                                  <strong>{p.value}</strong>
                                </div>
                              ))}
                            </div>
                          );
                        }}
                      />
                      <Bar dataKey="confirmed" name="Confirmed" stackId="a" fill="#10b981" radius={[0,0,0,0]} />
                      <Bar dataKey="cancelled" name="Cancelled" stackId="a" fill="#ef4444" radius={[0,0,0,0]} />
                      <Bar dataKey="fake"      name="Fake"      stackId="a" fill="#f59e0b" radius={[6,6,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="ads-chart-legend">
                    <span><i style={{ background: '#10b981' }} />Confirmed</span>
                    <span><i style={{ background: '#ef4444' }} />Cancelled</span>
                    <span><i style={{ background: '#f59e0b' }} />Fake</span>
                  </div>
                </div>

                {/* Day-wise detail table */}
                <div className="uperf-day-table">
                  <div className="uperf-day-head">
                    <span>Date</span>
                    {selectedUser === 'all' && <span>Agent</span>}
                    <span>Attempted</span>
                    <span>✅ Confirmed</span>
                    <span>❌ Cancelled</span>
                    <span>🚫 Fake</span>
                    <span>⏳ Pending</span>
                    <span>Confirm %</span>
                  </div>
                  {(selectedUser === 'all'
                    ? // Show per-user breakdown per day
                      (userPerfData?.byDayPerUser || [])
                        .sort((a, b) => b.date.localeCompare(a.date) || a.user.localeCompare(b.user))
                    : (userPerfData?.byDayPerUser || [])
                        .filter(r => r.user === selectedUser)
                        .sort((a, b) => b.date.localeCompare(a.date))
                  ).map((row, i) => {
                    const rate = row.attempted > 0 ? +((row.confirmed / row.attempted) * 100).toFixed(1) : 0;
                    return (
                      <div key={`${row.date}-${row.user}-${i}`} className="uperf-day-row">
                        <span className="uperf-day-date">
                          {new Date(row.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                        </span>
                        {selectedUser === 'all' && (
                          <span className="uperf-day-user">{row.user}</span>
                        )}
                        <span>{row.attempted}</span>
                        <span className="uperf-lb-num green">{row.confirmed}</span>
                        <span className="uperf-lb-num red">{row.cancelled}</span>
                        <span className="uperf-lb-num orange">{row.fake}</span>
                        <span className="uperf-lb-num blue">{row.pending}</span>
                        <span className={`uperf-rate-pill ${rate >= 50 ? 'good' : 'warn'}`}>{rate}%</span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}
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
          PRODUCT-WISE CONVERSION FUNNEL & CHANNEL ATTRIBUTION
      ══════════════════════════════════════════════════ */}
      <motion.div className="ads-analytics-section" variants={itemVariants} style={{ marginBottom: '24px' }}>
        <div className="section-header-elite">
          <div className="heartbeat-pulse" style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981' }}>
            <TrendingUp size={14} fill="currentColor" />
          </div>
          <h3>Product-wise Conversion Funnel</h3>
          <span className="ads-section-badge" style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981' }}>
            Attribution Analytics
          </span>
        </div>

        <div className="ads-kpi-strip" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginBottom: '20px' }}>
          {productFunnelData.map(p => (
            <div key={p.name} className="ads-kpi-card" style={{ borderLeft: '3px solid var(--accent)' }}>
              <span className="ads-kpi-label">{p.name} Total Orders</span>
              <span className="ads-kpi-value">{p.total}</span>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginTop: '6px', color: 'var(--text-secondary)' }}>
                <span>Confirmed: <strong>{p.confirmed}</strong></span>
                <span>Conv. Rate: <strong style={{ color: 'var(--color-success)' }}>{p['Confirmation Rate']}%</strong></span>
              </div>
            </div>
          ))}
        </div>

        <div className="ads-chart-container" style={{ padding: '20px' }}>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={productFunnelData} margin={{ top: 10, right: 20, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(99,102,241,0.06)" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} unit="%" />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div className="ads-custom-tooltip" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', padding: '10px', borderRadius: '8px' }}>
                      <p className="ads-tt-date" style={{ fontWeight: 'bold', marginBottom: '6px' }}>{label}</p>
                      {payload.map((p, i) => (
                        <div key={i} className="ads-tt-row" style={{ display: 'flex', justifyContent: 'space-between', gap: '20px', fontSize: '12px', margin: '4px 0' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span className="ads-tt-dot" style={{ background: p.fill, width: '8px', height: '8px', borderRadius: '50%', display: 'inline-block' }} />
                            {p.name}:
                          </span>
                          <strong>{p.value}%</strong>
                        </div>
                      ))}
                    </div>
                  );
                }}
              />
              <Bar dataKey="Confirmation Rate" name="Overall Confirmation Rate" fill="#6366f1" radius={[6, 6, 0, 0]} barSize={26} />
              <Bar dataKey="Facebook Conf. Rate" name="Facebook Confirmation Rate" fill="#1877f2" radius={[6, 6, 0, 0]} barSize={26} />
              <Bar dataKey="TikTok Conf. Rate" name="TikTok Confirmation Rate" fill="#000000" radius={[6, 6, 0, 0]} barSize={26} />
            </BarChart>
          </ResponsiveContainer>
          <div className="ads-chart-legend" style={{ marginTop: '16px', display: 'flex', justifyContent: 'center', gap: '20px', flexWrap: 'wrap' }}>
            <span><i style={{ background: '#6366f1', width: '12px', height: '12px', display: 'inline-block', marginRight: '6px', borderRadius: '2px' }} />Overall Conf. Rate</span>
            <span><i style={{ background: '#1877f2', width: '12px', height: '12px', display: 'inline-block', marginRight: '6px', borderRadius: '2px' }} />Facebook Conf. Rate</span>
            <span><i style={{ background: '#000000', width: '12px', height: '12px', display: 'inline-block', marginRight: '6px', borderRadius: '2px' }} />TikTok Conf. Rate</span>
          </div>
        </div>
      </motion.div>

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

      {/* ══════════════════════════════════════════════════
          USER PERFORMANCE ANALYTICS — per-agent tracking
      ══════════════════════════════════════════════════ */}

    </motion.div>
  );
};
