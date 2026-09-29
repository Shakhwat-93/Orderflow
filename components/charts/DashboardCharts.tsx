// @ts-nocheck
'use client';

import React from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, 
  BarChart, Bar 
} from 'recharts';
import { Card } from '@/components/Card';
import { TrendingUp, PieChart as PieChartIcon, CheckCircle2 } from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';

interface DashboardChartsProps {
  stats: {
    orderTrend?: any[];
    trendData?: any[];
    sourceDistribution?: any[];
    confirmationData?: any[];
    total?: number;
    [key: string]: any;
  };
}

function ChartEmptyState({ icon: Icon, message }: { icon: any; message: string }) {
  return (
    <div className="chart-empty-state">
      <Icon size={24} className="chart-empty-icon" />
      <span className="chart-empty-text">{message}</span>
    </div>
  );
}

export function DashboardCharts({ stats }: DashboardChartsProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const orderTrend = stats?.trendData || stats?.orderTrend || [];
  const sourceDistribution = stats?.sourceDistribution || [];
  const confirmationData = stats?.confirmationData || [];

  const hasTrendData = Array.isArray(orderTrend) && orderTrend.length > 0;
  const hasSourceData = Array.isArray(sourceDistribution) && sourceDistribution.length > 0 && sourceDistribution.some((s: any) => s.value > 0);
  const hasConfirmationData = Array.isArray(confirmationData) && confirmationData.length > 0 && (stats?.total || 0) > 0;

  const gridStroke = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)';
  const tickFill = isDark ? '#52525b' : '#94a3b8';
  const tooltipStyle = {
    backgroundColor: isDark ? '#1c1c1e' : '#ffffff',
    borderRadius: '10px',
    border: isDark ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid rgba(0, 0, 0, 0.08)',
    boxShadow: isDark ? '0 2px 10px rgba(0, 0, 0, 0.35)' : '0 4px 16px rgba(0, 0, 0, 0.06)',
    color: isDark ? '#f4f4f5' : '#0f172a',
    fontSize: '12px',
    fontWeight: 600,
    padding: '8px 12px',
  };

  return (
    <div className="analytics-left">
      <Card className="chart-card" noPadding>
        <div className="card-header">
          <div className="chart-title-wrap">
            <h3>Daily Orders Trend</h3>
            <span className="chart-subtitle">Last 7 Days Activity</span>
          </div>
        </div>
        <div className="chart-container">
          {hasTrendData ? (
            <ResponsiveContainer width="100%" height={210} minWidth={0} minHeight={0}>
              <LineChart data={orderTrend} margin={{ top: 12, right: 14, left: -22, bottom: 0 }}>
                <defs>
                  <linearGradient id="orderTrendLineGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#6366f1" />
                    <stop offset="100%" stopColor="#818cf8" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridStroke} />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: tickFill, fontSize: 11, fontWeight: 500 }} 
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  allowDecimals={false}
                  tick={{ fill: tickFill, fontSize: 11, fontWeight: 500 }} 
                />
                <Tooltip 
                  formatter={(val: any) => [`${val} orders`, 'Volume']}
                  contentStyle={tooltipStyle}
                />
                <Line 
                  type="monotone" 
                  dataKey="orders" 
                  stroke="url(#orderTrendLineGrad)" 
                  strokeWidth={3} 
                  dot={{ r: 3.5, fill: '#6366f1', strokeWidth: 2, stroke: isDark ? '#1c1c1e' : '#ffffff' }} 
                  activeDot={{ r: 6, stroke: '#6366f1', strokeWidth: 2, fill: isDark ? '#1c1c1e' : '#fff' }} 
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <ChartEmptyState icon={TrendingUp} message="No order activity recorded in the last 7 days" />
          )}
        </div>
      </Card>

      <div className="charts-secondary">
        <Card className="chart-card source-chart-card" noPadding>
          <div className="card-header">
            <div className="chart-title-wrap">
              <h3>Orders by Source</h3>
              <span className="chart-subtitle">Acquisition Channels</span>
            </div>
          </div>
          <div className="chart-container centered source-chart-layout">
            {hasSourceData ? (
              <>
                <div className="source-chart-canvas">
                  <ResponsiveContainer width="100%" height={170} minWidth={0} minHeight={0}>
                    <PieChart>
                      <Pie
                        data={sourceDistribution}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={72}
                        paddingAngle={4}
                        cornerRadius={6}
                        dataKey="value"
                        stroke={isDark ? '#1c1c1e' : '#ffffff'}
                        strokeWidth={2}
                      >
                        {sourceDistribution.map((entry: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={entry.color || '#6366f1'} />
                        ))}
                      </Pie>
                      <Tooltip 
                        formatter={(val: any, name: any) => [`${val} orders`, name]}
                        contentStyle={tooltipStyle}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="pie-legend">
                  {sourceDistribution.map((item: any) => (
                    <div key={item.name} className="legend-item">
                      <span className="dot" style={{ backgroundColor: item.color }}></span>
                      <span className="name">{item.name}</span>
                      <span className="value">({item.value})</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <ChartEmptyState icon={PieChartIcon} message="No order source data available yet" />
            )}
          </div>
        </Card>

        <Card className="chart-card" noPadding>
          <div className="card-header">
            <div className="chart-title-wrap">
              <h3>Confirmation Rate (%)</h3>
              <span className="chart-subtitle">Confirmed vs Cancelled</span>
            </div>
          </div>
          <div className="chart-container">
            {hasConfirmationData ? (
              <ResponsiveContainer width="100%" height={210} minWidth={0} minHeight={0}>
                <BarChart data={confirmationData} margin={{ top: 12, right: 14, left: -22, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridStroke} />
                  <XAxis 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: tickFill, fontSize: 11, fontWeight: 500 }} 
                  />
                  <YAxis 
                    domain={[0, 100]}
                    ticks={[0, 25, 50, 75, 100]}
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: tickFill, fontSize: 11, fontWeight: 500 }}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip 
                    cursor={{ fill: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(99, 102, 241, 0.04)' }}
                    formatter={(val: any) => [`${val}%`, 'Rate']}
                    contentStyle={tooltipStyle}
                  />
                  <Bar dataKey="rate" radius={[6, 6, 0, 0]} maxBarSize={38}>
                    {confirmationData.map((entry: any, index: number) => {
                      const isCancel = entry.name?.toLowerCase().includes('cancel');
                      return (
                        <Cell 
                          key={`cell-bar-${index}`} 
                          fill={isCancel ? '#ef4444' : '#10b981'} 
                        />
                      );
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <ChartEmptyState icon={CheckCircle2} message="No order confirmation rate data recorded" />
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

export default DashboardCharts;
