'use client';

import React, { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useOrders } from '@/context/OrderContext';
import { useTasks } from '@/context/TaskContext';
import { Card } from '@/components/Card';
import { 
  Clock, Globe, Facebook, CheckCircle2, XCircle, TrendingUp, ShoppingBag, 
  BarChart3, Package, Users, RefreshCw, Zap, ShieldCheck, ClipboardList,
  Calendar, History, AlertCircle
} from 'lucide-react';

import { ActiveUsers } from '@/components/ActiveUsers';
import { LiveActivityFeed } from '@/components/LiveActivityFeed';
import { AIBriefing } from '@/components/AIBriefing';
import { DashboardTimeLeftBadge } from '@/components/DashboardTimeLeftBadge';
import CurrencyIcon from '@/components/CurrencyIcon';
import { useAuth } from '@/context/AuthContext';
import './DashboardOverview.css';

const DashboardCharts = dynamic(() => import('@/components/charts/DashboardCharts'), {
  ssr: false,
  loading: () => (
    <div className="analytics-left">
      <div className="chart-card liquid-glass p-6 min-h-[300px] flex items-center justify-center animate-pulse bg-slate-100/50 dark:bg-white/[0.02] rounded-2xl border border-[var(--glass-border)]">
        <span className="text-xs text-slate-400 font-medium">Loading performance analytics...</span>
      </div>
      <div className="charts-secondary grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <div className="chart-card liquid-glass p-6 min-h-[300px] flex items-center justify-center animate-pulse bg-slate-100/50 dark:bg-white/[0.02] rounded-2xl border border-[var(--glass-border)]" />
        <div className="chart-card liquid-glass p-6 min-h-[300px] flex items-center justify-center animate-pulse bg-slate-100/50 dark:bg-white/[0.02] rounded-2xl border border-[var(--glass-border)]" />
      </div>
    </div>
  ),
});

export default function DashboardOverview() {
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

    return orders.filter((o: any) => {
      if (o.status === 'Test') return false;
      const orderDate = new Date(o.created_at);
      const orderDateBD = new Date(orderDate.getTime() + bdOffset);
      return orderDateBD >= startOfDayBD;
    });
  }, [orders]);

  const dailySnapshot = useMemo(() => {
    const total = todayOrders.length;
    const confirmedOrders = todayOrders.filter((o: any) => o.status === 'Confirmed' || o.status === 'Confirmed & Printed');
    const confirmedPercent = total > 0 ? Math.round((confirmedOrders.length / total) * 100) : 0;
    const revenue = confirmedOrders.reduce((acc: number, o: any) => acc + Number(o.amount || 0), 0);

    const calledOrders = todayOrders.filter((o: any) => o.first_call_time);
    const totalDelay = calledOrders.reduce((acc: number, o: any) => {
      const delay = (new Date(o.first_call_time).getTime() - new Date(o.created_at).getTime()) / 60000;
      return acc + Math.max(0, delay);
    }, 0);
    const avgResponse = calledOrders.length > 0 ? Math.round(totalDelay / calledOrders.length) : 0;

    const agents: Record<string, number> = {};
    todayOrders.forEach((o: any) => {
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

  const { avgCallDelay, slaRate } = useMemo(() => {
    if (!orders || orders.length === 0) return { avgCallDelay: 0, slaRate: 100 };
    
    let totalDelay = 0;
    let callCount = 0;
    let withinSla = 0;

    orders.forEach((o: any) => {
      if (o.first_call_time && o.created_at) {
        const created = new Date(o.created_at).getTime();
        const firstCall = new Date(o.first_call_time).getTime();
        const diffMinutes = Math.max(0, Math.floor((firstCall - created) / 60000));
        
        totalDelay += diffMinutes;
        callCount++;
        if (diffMinutes <= 30) withinSla++;
      }
    });

    return {
      avgCallDelay: callCount > 0 ? Math.round(totalDelay / callCount) : 0,
      slaRate: callCount > 0 ? Math.round((withinSla / callCount) * 100) : 100
    };
  }, [orders]);

  useEffect(() => {
    updatePresenceContext('Viewing Dashboard');
  }, [updatePresenceContext]);

  return (
    <div className="dashboard-overview">
      <div className="dashboard-header-premium">
        <div className="header-left">
          <div className="greeting-pill">
            <span className="live-pulse"></span>
            System Live & Connected
          </div>
          <h1>Good Day, {profile?.name || 'Commander'}</h1>
          <p>Here is what is happening with your operations today.</p>
        </div>

        <div className="header-right-actions">
          <DashboardTimeLeftBadge />
        </div>
      </div>

      <AIBriefing stats={stats} avgCallDelay={avgCallDelay} slaRate={slaRate} />

      {/* ── Daily Performance Summary Snapshot ── */}
      <div className="daily-snapshot-wrap">
        <div className="daily-snapshot-card">
          <div className="snapshot-header">
            <div className="snapshot-title-group">
              <Calendar size={15} className="snapshot-calendar-icon" />
              <h3>Today Performance Summary</h3>
              <span className="snapshot-tz-badge">BD Time: 12:00 AM - Now</span>
            </div>
            <div className="snapshot-status">
              <History size={13} />
              <span>Real-time</span>
            </div>
          </div>

          <div className="snapshot-metrics-strip">
            <div className="snapshot-metric-item">
              <span className="snapshot-label">Today Orders</span>
              <strong className="snapshot-value">{dailySnapshot.total}</strong>
            </div>

            <div className="snapshot-metric-item">
              <span className="snapshot-label">Confirmed %</span>
              <strong className={`snapshot-value ${dailySnapshot.confirmedPercent >= 60 ? 'text-success' : 'text-warning'}`}>
                {dailySnapshot.confirmedPercent}%
              </strong>
            </div>

            <div className="snapshot-metric-item">
              <span className="snapshot-label">Today Revenue</span>
              <strong className="snapshot-value text-success">
                <CurrencyIcon size={16} className="currency-icon-elite" />
                {dailySnapshot.revenue.toLocaleString()}
              </strong>
            </div>

            <div className="snapshot-metric-item">
              <span className="snapshot-label">Avg Call Response</span>
              <strong className={`snapshot-value ${dailySnapshot.avgResponse <= 30 ? 'text-success' : 'text-danger'}`}>
                {dailySnapshot.avgResponse}m
              </strong>
            </div>

            <div className="snapshot-metric-item">
              <span className="snapshot-label">Today Top Performer</span>
              <div className="top-performer-chip">
                <span className="performer-avatar">
                  {dailySnapshot.topAgent.charAt(0)}
                </span>
                <span className="performer-name">{dailySnapshot.topAgent}</span>
                {dailySnapshot.maxConfirms > 0 && (
                  <span className="performer-confirms">({dailySnapshot.maxConfirms})</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="metrics-grid">
        <Card className="metric-card success-glow">
          <div className="metric-top-row">
            <div className="metric-icon-wrapper">
              <TrendingUp size={18} />
            </div>
            <span className="metric-label">Total Revenue</span>
          </div>
          <div className="metric-bottom-row">
            <span className="metric-value">
              <CurrencyIcon size={20} className="currency-icon-elite" style={{ color: 'inherit' }} />
              {stats.revenue?.toLocaleString() || '0'}
            </span>
          </div>
        </Card>

        <Card className="metric-card indigo-glow">
          <div className="metric-top-row">
            <div className="metric-icon-wrapper">
              <ShoppingBag size={18} />
            </div>
            <span className="metric-label">Total Orders</span>
          </div>
          <div className="metric-bottom-row">
            <span className="metric-value">{stats.total?.toLocaleString() || '0'}</span>
          </div>
        </Card>

        <Card className="metric-card teal-glow">
          <div className="metric-top-row">
            <div className="metric-icon-wrapper">
              <BarChart3 size={18} />
            </div>
            <span className="metric-label">Avg. Order Value</span>
          </div>
          <div className="metric-bottom-row">
            <span className="metric-value">
              <CurrencyIcon size={20} className="currency-icon-elite" style={{ color: 'inherit' }} />
              {Math.round(stats.averageOrderValue || 0).toLocaleString()}
            </span>
          </div>
        </Card>

        <Card className="metric-card neutral-glow">
          <div className="metric-top-row">
            <div className="metric-icon-wrapper">
              <Package size={18} />
            </div>
            <span className="metric-label">Total Products</span>
          </div>
          <div className="metric-bottom-row">
            <span className="metric-value">{stats.totalProducts?.toLocaleString() || '0'}</span>
          </div>
        </Card>

        <Card className="metric-card purple-glow">
          <div className="metric-top-row">
            <div className="metric-icon-wrapper">
              <Users size={18} />
            </div>
            <span className="metric-label">Total Customers</span>
          </div>
          <div className="metric-bottom-row">
            <span className="metric-value">{stats.totalCustomers?.toLocaleString() || '0'}</span>
          </div>
        </Card>

        <Card className="metric-card warning-glow">
          <div className="metric-top-row">
            <div className="metric-icon-wrapper">
              <Clock size={18} />
            </div>
            <span className="metric-label">Pending Orders</span>
          </div>
          <div className="metric-bottom-row">
            <span className="metric-value">{stats.pending?.toLocaleString() || '0'}</span>
          </div>
        </Card>

        <Card className="metric-card processing-glow">
          <div className="metric-top-row">
            <div className="metric-icon-wrapper">
              <RefreshCw size={18} />
            </div>
            <span className="metric-label">Processing Orders</span>
          </div>
          <div className="metric-bottom-row">
            <span className="metric-value">{stats.processing?.toLocaleString() || '0'}</span>
          </div>
        </Card>

        <Card className="metric-card danger-glow">
          <div className="metric-top-row">
            <div className="metric-icon-wrapper">
              <XCircle size={18} />
            </div>
            <span className="metric-label">Cancel Orders</span>
          </div>
          <div className="metric-bottom-row">
            <span className="metric-value">{stats.cancelledCount?.toLocaleString() || '0'}</span>
          </div>
        </Card>

        <Card className="metric-card orange-glow">
          <div className="metric-top-row">
            <div className="metric-icon-wrapper">
              <Zap size={18} />
            </div>
            <span className="metric-label">Avg. Call Delay</span>
          </div>
          <div className="metric-bottom-row">
            <span className="metric-value">{avgCallDelay}m</span>
          </div>
        </Card>

        <Card className="metric-card cyan-glow">
          <div className="metric-top-row">
            <div className="metric-icon-wrapper">
              <ShieldCheck size={18} />
            </div>
            <span className="metric-label">30m SLA Rate</span>
          </div>
          <div className="metric-bottom-row">
            <span className="metric-value">{slaRate}%</span>
          </div>
        </Card>
      </div>

      {/* My Tasks Widget */}
      <Link href="/tasks" className="task-dashboard-widget" style={{ textDecoration: 'none', color: 'inherit' }}>
        <div className="task-widget-inner">
          <div className="task-widget-icon">
            <ClipboardList size={18} />
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
        <DashboardCharts stats={stats} />

        <aside className="dashboard-activity-sidebar">
          <LiveActivityFeed />
        </aside>
      </div>
    </div>
  );
}
