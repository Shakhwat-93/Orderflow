import React, { useState, useEffect, useMemo } from 'react';
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
  Calendar, History, AlertCircle
} from 'lucide-react';

import { ActiveUsers } from '../components/ActiveUsers';
import { LiveActivityFeed } from '../components/LiveActivityFeed';
import { AIBriefing } from '../components/AIBriefing';
import CurrencyIcon from '../components/CurrencyIcon';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';
import './DashboardOverview.css';

export const DashboardOverview = () => {
  const { stats, orders } = useOrders();
  const { myPendingAssigned, myIncompleteDailyCount } = useTasks();
  const { updatePresenceContext, profile } = useAuth();

  // Daily Snapshot BD Time Calculation
  const todayOrders = useMemo(() => {
    if (!orders) return [];
    const now = new Date();
    // BD timezone offset (+6 hours)
    const bdOffset = 6 * 60 * 60 * 1000;
    const utc = now.getTime() + now.getTimezoneOffset() * 60000;
    const bdTime = new Date(utc + bdOffset);
    
    const startOfDayBD = new Date(bdTime);
    startOfDayBD.setHours(0, 0, 0, 0);

    return orders.filter(o => {
      if (o.status === 'Test') return false;
      const orderDate = new Date(o.created_at);
      const orderDateBD = new Date(orderDate.getTime() + bdOffset);
      return orderDateBD >= startOfDayBD;
    });
  }, [orders]);

  const dailySnapshot = useMemo(() => {
    const total = todayOrders.length;
    const confirmedOrders = todayOrders.filter(o => o.status === 'Confirmed' || o.status === 'Confirmed & Printed');
    const confirmedPercent = total > 0 ? Math.round((confirmedOrders.length / total) * 100) : 0;
    const revenue = confirmedOrders.reduce((acc, o) => acc + Number(o.amount || 0), 0);

    const calledOrders = todayOrders.filter(o => o.first_call_time);
    const totalDelay = calledOrders.reduce((acc, o) => {
      const delay = (new Date(o.first_call_time) - new Date(o.created_at)) / 60000;
      return acc + Math.max(0, delay);
    }, 0);
    const avgResponse = calledOrders.length > 0 ? Math.round(totalDelay / calledOrders.length) : 0;

    const agents = {};
    todayOrders.forEach(o => {
      if ((o.status === 'Confirmed' || o.status === 'Confirmed & Printed') && o.called_by) {
        agents[o.called_by] = (agents[o.called_by] || 0) + 1;
      }
    });

    let topAgent = 'None';
    let maxConfirms = 0;
    Object.entries(agents).forEach(([name, count]) => {
      if (count > maxConfirms) {
        maxConfirms = count;
        topAgent = name;
      }
    });

    return {
      total,
      confirmedPercent,
      revenue,
      avgResponse,
      topAgent,
      maxConfirms
    };
  }, [todayOrders]);

  const [timeLeft, setTimeLeft] = useState('');
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      const target = new Date();
      target.setHours(23, 59, 0, 0);
      const diff = target - now;

      if (diff <= 0) {
        setTimeLeft('Completed');
      } else {
        const hours = Math.floor(diff / 3600000);
        const mins = Math.floor((diff % 3600000) / 60000);
        const secs = Math.floor((diff % 60000) / 1000);
        setTimeLeft(`${hours}h ${mins}m ${secs}s`);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // SLA Calculations
  const { userRoles } = useAuth();
  const isAdmin = profile?.role === 'admin' || profile?.role === 'superadmin' || (userRoles && (userRoles.includes('admin') || userRoles.includes('superadmin')));

  const idleOrders = useMemo(() => {
    if (!orders) return [];
    const now = new Date();
    return orders.filter(o => {
      const isPending = o.status === 'Pending' || o.status === 'Pending Call';
      if (!isPending) return false;

      // Idle defined as no call attempts and no first_call_time
      const hasNoCalls = !o.first_call_time && (!o.call_attempts || o.call_attempts === 0);
      if (!hasNoCalls) return false;

      // Created more than 30 minutes ago
      const ageMins = (now - new Date(o.created_at)) / 60000;
      return ageMins > 30;
    });
  }, [orders]);

  // SLA Calculations
  const ordersWithCalls = orders?.filter(o => o.status !== 'Test' && o.first_call_time) || [];
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
  }, [updatePresenceContext]);

  return (
    <div className="dashboard-overview">
      <div className="welcome-banner-premium">
        <div className="banner-content">
          <div className="welcome-text-group">
            <div className="banner-user-chip">
              <div className="banner-user-avatar">
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt={profile?.name || 'User'} />
                ) : (
                  profile?.name?.substring(0, 2)?.toUpperCase() || 'OF'
                )}
              </div>
              <div className="banner-user-meta">
                <span className="banner-user-label">Dashboard</span>
                <strong>{profile?.name?.split(' ')[0] || 'Partner'}</strong>
              </div>
            </div>
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

      {/* ── Admin Idle Orders Alert Banner ── */}
      {isAdmin && idleOrders.length > 0 && (
        <div className="admin-idle-alert-banner" style={{
          background: 'linear-gradient(135deg, rgba(239,68,68,0.15) 0%, rgba(220,38,38,0.25) 100%)',
          border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: '12px',
          padding: '14px 20px',
          marginBottom: '20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '16px',
          flexWrap: 'wrap',
          boxShadow: '0 8px 24px rgba(239,68,68,0.12)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              background: '#ef4444',
              color: '#fff',
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <AlertCircle size={18} className="animate-pulse" />
            </div>
            <div>
              <h4 style={{ margin: 0, color: '#ef4444', fontWeight: 700, fontSize: '14px' }}>
                CRITICAL ALERT: {idleOrders.length} Idle Orders Detected!
              </h4>
              <p style={{ margin: '2px 0 0 0', color: 'var(--text-secondary)', fontSize: '12px' }}>
                There are {idleOrders.length} orders created more than 30 minutes ago that have NOT been called by any agent.
              </p>
            </div>
          </div>
          <Link 
            to="/orders" 
            style={{
              background: '#ef4444',
              color: '#fff',
              padding: '8px 16px',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 700,
              textDecoration: 'none',
              transition: 'background 0.2s',
              boxShadow: '0 4px 12px rgba(239,68,68,0.2)'
            }}
          >
            Take Action Now →
          </Link>
        </div>
      )}

      <AIBriefing stats={stats} avgCallDelay={avgCallDelay} slaRate={slaRate} />

      {/* ── Daily Performance Summary Snapshot ── */}
      <div className="daily-snapshot-wrap" style={{ marginBottom: '24px' }}>
        <div className="glass-card" style={{
          background: 'linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(16,185,129,0.08) 100%)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '16px',
          padding: '20px',
          backdropFilter: 'blur(12px)',
          boxShadow: '0 8px 32px 0 rgba(0,0,0,0.1)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '14px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ background: 'var(--accent)', color: '#fff', width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Clock size={16} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>Daily Snapshot</h3>
                <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Calculates live today & resets at 11:59 PM (BD Time)</span>
              </div>
            </div>
            <div style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', padding: '6px 12px', borderRadius: '999px', fontSize: '12px', fontWeight: 600, color: '#6366f1', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>Resetting In:</span>
              <strong style={{ fontFamily: 'monospace' }}>{timeLeft}</strong>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: '12px', padding: '12px', display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Today Total Orders</span>
              <strong style={{ fontSize: '20px', color: 'var(--text-primary)', marginTop: '4px' }}>{dailySnapshot.total}</strong>
            </div>
            
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: '12px', padding: '12px', display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Confirmation Rate</span>
              <strong style={{ fontSize: '20px', color: 'var(--color-success)', marginTop: '4px' }}>{dailySnapshot.confirmedPercent}%</strong>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: '12px', padding: '12px', display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Avg Call Response</span>
              <strong style={{ fontSize: '20px', color: 'var(--accent)', marginTop: '4px' }}>{dailySnapshot.avgResponse}m</strong>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: '12px', padding: '12px', display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Today Revenue</span>
              <strong style={{ fontSize: '20px', color: 'var(--text-primary)', marginTop: '4px', display: 'flex', alignItems: 'center' }}>
                <CurrencyIcon size={18} className="currency-icon-elite" style={{ marginRight: '2px' }} />
                {dailySnapshot.revenue.toLocaleString()}
              </strong>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: '12px', padding: '12px', display: 'flex', flexDirection: 'column', gridColumn: 'span 1' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Today Top Performer</span>
              <strong style={{ fontSize: '15px', color: 'var(--text-primary)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ background: 'var(--accent)', color: '#fff', width: '18px', height: '18px', borderRadius: '50%', fontSize: '10px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', textTransform: 'uppercase' }}>
                  {dailySnapshot.topAgent.charAt(0)}
                </span>
                {dailySnapshot.topAgent} {dailySnapshot.maxConfirms > 0 && `(${dailySnapshot.maxConfirms} confirms)`}
              </strong>
            </div>
          </div>
        </div>
      </div>

      <div className="metrics-grid">
        <Card className="metric-card floating success-glow" style={{ animationDelay: '0.1s' }}>
          <div className="card-decoration top-right"></div>
          <div className="card-decoration bottom-left"></div>
          <div className="metric-top-row">
            <div className="metric-icon-wrapper">
              <TrendingUp size={22} />
            </div>
            <span className="metric-value">
              <CurrencyIcon size={24} className="currency-icon-elite" style={{ color: 'inherit' }} />
              {stats.revenue?.toLocaleString() || '0'}
            </span>
          </div>
          <div className="metric-bottom-row">
            <span className="metric-label">Total Revenue</span>
          </div>
        </Card>

        <Card className="metric-card floating indigo-glow" style={{ animationDelay: '0.2s' }}>
          <div className="card-decoration top-right"></div>
          <div className="card-decoration bottom-left"></div>
          <div className="metric-top-row">
            <div className="metric-icon-wrapper">
              <ShoppingBag size={22} />
            </div>
            <span className="metric-value">{stats.total}</span>
          </div>
          <div className="metric-bottom-row">
            <span className="metric-label">Total Orders</span>
          </div>
        </Card>

        <Card className="metric-card floating teal-glow" style={{ animationDelay: '0.3s' }}>
          <div className="card-decoration top-right"></div>
          <div className="card-decoration bottom-left"></div>
          <div className="metric-top-row">
            <div className="metric-icon-wrapper">
              <BarChart3 size={22} />
            </div>
            <span className="metric-value">
              <CurrencyIcon size={24} className="currency-icon-elite" style={{ color: 'inherit' }} />
              {Math.round(stats.averageOrderValue || 0).toLocaleString()}
            </span>
          </div>
          <div className="metric-bottom-row">
            <span className="metric-label">Avg. Order Value</span>
          </div>
        </Card>

        <Card className="metric-card floating neutral-glow" style={{ animationDelay: '0.4s' }}>
          <div className="card-decoration top-right"></div>
          <div className="card-decoration bottom-left"></div>
          <div className="metric-top-row">
            <div className="metric-icon-wrapper">
              <Package size={22} />
            </div>
            <span className="metric-value">{stats.totalProducts}</span>
          </div>
          <div className="metric-bottom-row">
            <span className="metric-label">Total Products</span>
          </div>
        </Card>

        <Card className="metric-card floating purple-glow">
          <div className="card-decoration top-right"></div>
          <div className="card-decoration bottom-left"></div>
          <div className="metric-top-row">
            <div className="metric-icon-wrapper">
              <Users size={22} />
            </div>
            <span className="metric-value">{stats.totalCustomers}</span>
          </div>
          <div className="metric-bottom-row">
            <span className="metric-label">Total Customers</span>
          </div>
        </Card>

        <Card className="metric-card floating warning-glow">
          <div className="card-decoration top-right"></div>
          <div className="card-decoration bottom-left"></div>
          <div className="metric-top-row">
            <div className="metric-icon-wrapper">
              <Clock size={22} />
            </div>
            <span className="metric-value">{stats.pending}</span>
          </div>
          <div className="metric-bottom-row">
            <span className="metric-label">Pending Orders</span>
          </div>
        </Card>

        <Card className="metric-card floating processing-glow">
          <div className="card-decoration top-right"></div>
          <div className="card-decoration bottom-left"></div>
          <div className="metric-top-row">
            <div className="metric-icon-wrapper">
              <RefreshCw size={22} />
            </div>
            <span className="metric-value">{stats.processing}</span>
          </div>
          <div className="metric-bottom-row">
            <span className="metric-label">Processing Orders</span>
          </div>
        </Card>

        <Card className="metric-card floating danger-glow">
          <div className="card-decoration top-right"></div>
          <div className="card-decoration bottom-left"></div>
          <div className="metric-top-row">
            <div className="metric-icon-wrapper">
              <XCircle size={22} />
            </div>
            <span className="metric-value">{stats.cancelledCount}</span>
          </div>
          <div className="metric-bottom-row">
            <span className="metric-label">Cancel Orders</span>
          </div>
        </Card>

        <Card className="metric-card floating orange-glow">
          <div className="card-decoration top-right"></div>
          <div className="card-decoration bottom-left"></div>
          <div className="metric-top-row">
            <div className="metric-icon-wrapper">
              <Zap size={22} />
            </div>
            <span className="metric-value">{avgCallDelay}m</span>
          </div>
          <div className="metric-bottom-row">
            <span className="metric-label">Avg. Call Delay</span>
          </div>
        </Card>

        <Card className="metric-card floating cyan-glow">
          <div className="card-decoration top-right"></div>
          <div className="card-decoration bottom-left"></div>
          <div className="metric-top-row">
            <div className="metric-icon-wrapper">
              <ShieldCheck size={22} />
            </div>
            <span className="metric-value">{slaRate}%</span>
          </div>
          <div className="metric-bottom-row">
            <span className="metric-label">30m SLA Rate</span>
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
            <Card className="chart-card liquid-glass source-chart-card" noPadding>
              <div className="card-header">
                <h3>Orders by Source</h3>
              </div>
              <div className="chart-container centered source-chart-layout">
                <div className="source-chart-canvas">
                  <ResponsiveContainer width="100%" height="100%">
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
                </div>
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
