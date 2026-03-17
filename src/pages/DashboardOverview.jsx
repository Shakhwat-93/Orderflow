import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, 
  BarChart, Bar 
} from 'recharts';
import { useOrders } from '../context/OrderContext';
import { Card } from '../components/Card';
import { 
  Clock, Globe, Facebook, CheckCircle2, XCircle, TrendingUp, ShoppingBag, 
  BarChart3, Package, Users, RefreshCw
} from 'lucide-react';

import { ActiveUsers } from '../components/ActiveUsers';
import { LiveActivityFeed } from '../components/LiveActivityFeed';
import './DashboardOverview.css';

export const DashboardOverview = () => {
  const { stats } = useOrders();

  return (
    <div className="dashboard-overview">
      <div className="page-header">
        <h1>Dashboard Overview</h1>
        <p>Real-time analytics and order performance.</p>
      </div>

      <div className="metrics-grid">
        <Card className="metric-card floating success-glow">
          <div className="metric-icon-wrapper">
            <TrendingUp size={24} />
          </div>
          <div className="metric-info">
            <span className="metric-label">Total Revenue</span>
            <span className="metric-value">৳{stats.revenue?.toLocaleString() || '0'}</span>
          </div>
        </Card>

        <Card className="metric-card floating indigo-glow">
          <div className="metric-icon-wrapper">
            <ShoppingBag size={24} />
          </div>
          <div className="metric-info">
            <span className="metric-label">Total Orders</span>
            <span className="metric-value">{stats.total}</span>
          </div>
        </Card>

        <Card className="metric-card floating teal-glow">
          <div className="metric-icon-wrapper">
            <BarChart3 size={24} />
          </div>
          <div className="metric-info">
            <span className="metric-label">Avg. Order Value</span>
            <span className="metric-value">৳{Math.round(stats.averageOrderValue || 0).toLocaleString()}</span>
          </div>
        </Card>

        <Card className="metric-card floating neutral-glow">
          <div className="metric-icon-wrapper">
            <Package size={24} />
          </div>
          <div className="metric-info">
            <span className="metric-label">Total Products</span>
            <span className="metric-value">{stats.totalProducts}</span>
          </div>
        </Card>

        <Card className="metric-card floating purple-glow">
          <div className="metric-icon-wrapper">
            <Users size={24} />
          </div>
          <div className="metric-info">
            <span className="metric-label">Total Customers</span>
            <span className="metric-value">{stats.totalCustomers}</span>
          </div>
        </Card>

        <Card className="metric-card floating warning-glow">
          <div className="metric-icon-wrapper">
            <Clock size={24} />
          </div>
          <div className="metric-info">
            <span className="metric-label">Pending Orders</span>
            <span className="metric-value">{stats.pending}</span>
          </div>
        </Card>

        <Card className="metric-card floating processing-glow">
          <div className="metric-icon-wrapper">
            <RefreshCw size={24} />
          </div>
          <div className="metric-info">
            <span className="metric-label">Processing Orders</span>
            <span className="metric-value">{stats.processing}</span>
          </div>
        </Card>

        <Card className="metric-card floating danger-glow">
          <div className="metric-icon-wrapper">
            <XCircle size={24} />
          </div>
          <div className="metric-info">
            <span className="metric-label">Cancel Orders</span>
            <span className="metric-value">{stats.cancelledCount}</span>
          </div>
        </Card>
      </div>

      <div className="active-presence-section">
        <ActiveUsers />
      </div>

      <div className="charts-grid dashboard-layout-main">
        <div className="analytics-left">
          <Card className="chart-card liquid-glass" noPadding>
            <div className="card-header">
              <h3>Daily Orders Trend</h3>
            </div>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={stats.trendData}>
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
              <div className="chart-container">
                <ResponsiveContainer width="100%" height={250}>
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
