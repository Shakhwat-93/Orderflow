import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, 
  BarChart, Bar 
} from 'recharts';
import { useOrders } from '../context/OrderContext';
import { useTasks } from '../context/TaskContext';
import { Card } from '../components/Card';
import { 
  Clock, Globe, Facebook, CheckCircle2, XCircle, TrendingUp, ShoppingBag, 
  BarChart3, Package, Users, RefreshCw, Zap, ShieldCheck, ClipboardList,
  Calendar, History
} from 'lucide-react';

import { ActiveUsers } from '../components/ActiveUsers';
import { LiveActivityFeed } from '../components/LiveActivityFeed';
import { AIBriefing } from '../components/AIBriefing';
import CurrencyIcon from '../components/CurrencyIcon';
import { useAuth } from '../context/AuthContext';
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import './DashboardOverview.css';

export const DashboardOverview = () => {
  const { stats, orders } = useOrders();
  const { myPendingAssigned, myIncompleteDailyCount } = useTasks();
  const { updatePresenceContext, profile } = useAuth();

  // SLA Calculations
  const ordersWithCalls = orders?.filter(o => o.first_call_time) || [];
  const totalDelayMins = ordersWithCalls.reduce((acc, o) => {
    const delay = (new Date(o.first_call_time) - new Date(o.created_at)) / 60000;
    return acc + Math.max(0, delay);
  }, 0);
  const avgCallDelay = ordersWithCalls.length > 0 ? Math.round(totalDelayMins / ordersWithCalls.length) : 0;
  
  const metSlaCount = ordersWithCalls.filter(o => {
    const delay = (new Date(o.first_call_time) - new Date(o.created_at)) / 60000;
    return delay <= 30; // 30 min SLA
  }).length;
  const slaRate = ordersWithCalls.length > 0 ? Math.round((metSlaCount / ordersWithCalls.length) * 100) : 0;

  useEffect(() => {
    updatePresenceContext('Viewing Dashboard');
  }, []);

  return (
    <div className="dashboard-overview">
      <div className="welcome-banner-premium">
        <div className="banner-content">
          <div className="welcome-text-group">
            <h1 className="banner-title">Welcome back! 👋</h1>
            <p className="banner-subtitle">Here's what's happening with your business today.</p>
          </div>
          <div className="banner-stats-group">
            <div className="banner-stat-glass">
              <Calendar size={18} className="stat-icon" />
              <div className="stat-text">
                <span className="label">Today</span>
                <span className="value">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</span>
              </div>
            </div>
            <div className="banner-stat-glass mobile-hide">
              <History size={18} className="stat-icon" />
              <div className="stat-text">
                <span className="label">Last Used</span>
                <span className="value">Just now</span>
              </div>
            </div>
          </div>
        </div>
        <div className="banner-abstract-shapes">
          <div className="shape s1" />
          <div className="shape s2" />
        </div>
      </div>

      <AIBriefing stats={stats} avgCallDelay={avgCallDelay} slaRate={slaRate} />

      <div className="metrics-grid">
        <Card className="metric-card floating success-glow" style={{ animationDelay: '0.1s' }}>
          <div className="glass-layer" />
          <div className="metric-icon-wrapper">
            <TrendingUp size={24} />
          </div>
          <div className="metric-info">
            <span className="metric-label">Total Revenue</span>
            <span className="metric-value">
              <CurrencyIcon size={20} className="currency-icon-elite" style={{ color: 'inherit' }} />
              {stats.revenue?.toLocaleString() || '0'}
            </span>
          </div>
        </Card>

        <Card className="metric-card floating indigo-glow" style={{ animationDelay: '0.2s' }}>
          <div className="glass-layer" />
          <div className="metric-icon-wrapper">
            <ShoppingBag size={24} />
          </div>
          <div className="metric-info">
            <span className="metric-label">Total Orders</span>
            <span className="metric-value">{stats.total}</span>
          </div>
        </Card>

        <Card className="metric-card floating teal-glow" style={{ animationDelay: '0.3s' }}>
          <div className="glass-layer" />
          <div className="metric-icon-wrapper">
            <BarChart3 size={24} />
          </div>
          <div className="metric-info">
            <span className="metric-label">Avg. Order Value</span>
            <span className="metric-value">
              <CurrencyIcon size={20} className="currency-icon-elite" style={{ color: 'inherit' }} />
              {Math.round(stats.averageOrderValue || 0).toLocaleString()}
            </span>
          </div>
        </Card>

        <Card className="metric-card floating neutral-glow" style={{ animationDelay: '0.4s' }}>
          <div className="glass-layer" />
          <div className="metric-icon-wrapper">
            <Package size={24} />
          </div>
          <div className="metric-info">
            <span className="metric-label">Total Products</span>
            <span className="metric-value">{stats.totalProducts}</span>
          </div>
        </Card>

        <Card className="metric-card floating purple-glow">
          <div className="glass-layer" />
          <div className="metric-icon-wrapper">
            <Users size={24} />
          </div>
          <div className="metric-info">
            <span className="metric-label">Total Customers</span>
            <span className="metric-value">{stats.totalCustomers}</span>
          </div>
        </Card>

        <Card className="metric-card floating warning-glow">
          <div className="glass-layer" />
          <div className="metric-icon-wrapper">
            <Clock size={24} />
          </div>
          <div className="metric-info">
            <span className="metric-label">Pending Orders</span>
            <span className="metric-value">{stats.pending}</span>
          </div>
        </Card>

        <Card className="metric-card floating processing-glow">
          <div className="glass-layer" />
          <div className="metric-icon-wrapper">
            <RefreshCw size={24} />
          </div>
          <div className="metric-info">
            <span className="metric-label">Processing Orders</span>
            <span className="metric-value">{stats.processing}</span>
          </div>
        </Card>

        <Card className="metric-card floating danger-glow">
          <div className="glass-layer" />
          <div className="metric-icon-wrapper">
            <XCircle size={24} />
          </div>
          <div className="metric-info">
            <span className="metric-label">Cancel Orders</span>
            <span className="metric-value">{stats.cancelledCount}</span>
          </div>
        </Card>

        <Card className="metric-card floating orange-glow">
          <div className="glass-layer" />
          <div className="metric-icon-wrapper">
            <Zap size={24} />
          </div>
          <div className="metric-info">
            <span className="metric-label">Avg. Call Delay</span>
            <span className="metric-value">{avgCallDelay}m</span>
          </div>
        </Card>

        <Card className="metric-card floating cyan-glow">
          <div className="glass-layer" />
          <div className="metric-icon-wrapper">
            <ShieldCheck size={24} />
          </div>
          <div className="metric-info">
            <span className="metric-label">30m SLA Rate</span>
            <span className="metric-value">{slaRate}%</span>
          </div>
        </Card>
      </div>

      {/* My Tasks Widget */}
      <Link to="/tasks" className="task-dashboard-widget liquid-glass" style={{ textDecoration: 'none', color: 'inherit' }}>
        <div className="task-widget-inner">
          <div className="task-widget-icon">
            <ClipboardList size={22} />
          </div>
          <div className="task-widget-info">
            <span className="task-widget-label">My Tasks</span>
            <span className="task-widget-value">
              {myPendingAssigned + myIncompleteDailyCount} pending
            </span>
          </div>
          <div className="task-widget-breakdown">
            <span>{myIncompleteDailyCount} daily</span>
            <span>·</span>
            <span>{myPendingAssigned} assigned</span>
          </div>
        </div>
      </Link>

      <div className="active-presence-section">
        <ActiveUsers />
      </div>

      <div className="charts-grid dashboard-layout-main">
        <div className="analytics-left">
          <Card className="chart-card liquid-glass" noPadding>
            <div className="card-header">
              <h3>Daily Orders Trend</h3>
            </div>
            <div className="chart-container" style={{ minHeight: '300px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stats.orderTrend}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.04)" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: 'var(--text-tertiary)', fontSize: 12}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fill: 'var(--text-tertiary)', fontSize: 12}} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: '16px', border: '1px solid rgba(0,0,0,0.05)', boxShadow: '0 10px 30px rgba(0,0,0,0.06)', backdropFilter: 'blur(10px)' }}
                  />
                  <Line type="monotone" dataKey="orders" stroke="var(--accent)" strokeWidth={4} dot={{ r: 6, fill: 'var(--accent)', strokeWidth: 2, stroke: 'var(--bg-card)' }} activeDot={{ r: 8 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div className="charts-secondary">
            <Card className="chart-card liquid-glass" noPadding>
              <div className="card-header">
                <h3>Orders by Source</h3>
              </div>
              <div className="chart-container centered" style={{ position: 'relative' }}>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <defs>
                      <filter id="premium-glow" x="-20%" y="-20%" width="140%" height="140%">
                        <feGaussianBlur stdDeviation="6" result="blur" />
                        <feComposite in="SourceGraphic" in2="blur" operator="over" />
                      </filter>
                      <filter id="inset-shadow" x="-20%" y="-20%" width="140%" height="140%">
                        <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="#000" floodOpacity="0.5" />
                      </filter>
                    </defs>
                    <Pie
                      data={[{value: 100}]}
                      cx="50%"
                      cy="50%"
                      innerRadius={70}
                      outerRadius={90}
                      fill="rgba(255, 255, 255, 0.02)"
                      stroke="rgba(255, 255, 255, 0.05)"
                      isAnimationActive={false}
                      filter="url(#inset-shadow)"
                    />
                    <Pie
                      data={stats.sourceDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={70}
                      outerRadius={90}
                      paddingAngle={8}
                      cornerRadius={20}
                      dataKey="value"
                      stroke="none"
                    >
                      {stats.sourceDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} filter="url(#premium-glow)" />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: 'rgba(28,29,36,0.95)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pie-legend">
                  {stats.sourceDistribution.map(item => (
                    <div key={item.name} className="legend-item">
                      <span className="dot" style={{backgroundColor: item.color}}></span>
                      <span className="name">{item.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            <Card className="chart-card liquid-glass" noPadding>
              <div className="card-header">
                <h3>Confirmation Rate (%)</h3>
              </div>
              <div className="chart-container" style={{ minHeight: '300px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.confirmationData}>
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: 'var(--text-tertiary)', fontSize: 12}} />
                    <Tooltip 
                      cursor={{fill: 'rgba(var(--accent-rgb), 0.04)'}}
                      contentStyle={{ backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: '12px', border: '1px solid rgba(0,0,0,0.05)', boxShadow: '0 8px 24px rgba(0,0,0,0.08)' }}
                    />
                    <Bar dataKey="rate" fill="url(#colorRate)" radius={[10, 10, 0, 0]} />
                    <defs>
                      <linearGradient id="colorRate" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="var(--accent)" stopOpacity={0.3}/>
                      </linearGradient>
                    </defs>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>
        </div>

        <aside className="dashboard-activity-sidebar">
          <LiveActivityFeed />
        </aside>
      </div>
    </div>
  );
};
