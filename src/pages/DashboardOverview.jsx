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
  BarChart3, Package, Users, RefreshCw, Zap, ShieldCheck, ClipboardList
} from 'lucide-react';

import { ActiveUsers } from '../components/ActiveUsers';
import { LiveActivityFeed } from '../components/LiveActivityFeed';
import { AIBriefing } from '../components/AIBriefing';
import { useAuth } from '../context/AuthContext';
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import './DashboardOverview.css';

export const DashboardOverview = () => {
  const { stats, orders } = useOrders();
  const { myPendingAssigned, myIncompleteDailyCount } = useTasks();
  const { updatePresenceContext } = useAuth();

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
      <div className="page-header">
        <h1>Dashboard Overview</h1>
        <p>Real-time analytics and order performance.</p>
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
              <span className="currency">৳</span>{stats.revenue?.toLocaleString() || '0'}
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
              <span className="currency">৳</span>{Math.round(stats.averageOrderValue || 0).toLocaleString()}
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
          <div className="task-widget-icon" style={{ background: 'rgba(var(--accent-rgb), 0.1)', color: 'var(--accent)' }}>
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
              <div className="chart-container centered">
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={stats.sourceDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {stats.sourceDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
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
