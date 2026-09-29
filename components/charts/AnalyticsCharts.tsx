'use client';

import React from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts';

export interface CustomTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string;
}

export const CustomChartTooltip: React.FC<CustomTooltipProps> = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="reports-custom-tooltip" style={{
        background: 'rgba(15, 23, 42, 0.92)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        padding: '10px 14px',
        borderRadius: '10px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.28)',
        color: '#f8fafc',
        fontSize: '0.82rem',
        minWidth: '140px'
      }}>
        <p className="label" style={{ fontWeight: 600, marginBottom: '6px', color: '#94a3b8' }}>{label}</p>
        {payload.map((entry, index) => (
          <div key={index} className="tooltip-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', margin: '3px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span className="dot" style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: entry.color || entry.fill }}></span>
              <span className="name" style={{ color: '#cbd5e1' }}>{entry.name}:</span>
            </div>
            <span className="value" style={{ fontWeight: 700, color: '#ffffff' }}>{entry.value}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

// Daily Trend Chart
export const DailyTrendChart: React.FC<{ data: any[] }> = ({ data }) => {
  if (!data || data.length === 0) {
    return <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)' }}>No trend data available</div>;
  }
  return (
    <div style={{ width: '100%', height: 260 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="orderVolumeGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(226, 232, 240, 0.5)" />
          <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} />
          <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
          <Tooltip content={<CustomChartTooltip />} />
          <Area
            type="monotone"
            dataKey="orders"
            name="Orders"
            stroke="#6366f1"
            strokeWidth={2.5}
            fillOpacity={1}
            fill="url(#orderVolumeGrad)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

// Source Distribution Pie Chart
export const SourceDistributionChart: React.FC<{ data: any[] }> = ({ data }) => {
  if (!data || data.length === 0) {
    return <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)' }}>No source data available</div>;
  }
  return (
    <div style={{ width: '100%', height: 260 }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={85}
            paddingAngle={4}
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell key={'cell-' + index} fill={entry.color || '#6366f1'} />
            ))}
          </Pie>
          <Tooltip content={<CustomChartTooltip />} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};

// Conversion Funnel Grouped Bar Chart
export const ConversionFunnelChart: React.FC<{ data: any[] }> = ({ data }) => {
  if (!data || data.length === 0) {
    return <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)' }}>No conversion data available</div>;
  }
  return (
    <div style={{ width: '100%', height: 280 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 20, right: 10, left: -15, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(226, 232, 240, 0.5)" />
          <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} />
          <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} unit="%" />
          <Tooltip content={<CustomChartTooltip />} />
          <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
          <Bar dataKey="Confirmation Rate" fill="#10b981" radius={[4, 4, 0, 0]} />
          <Bar dataKey="Facebook Conf. Rate" fill="#1877f2" radius={[4, 4, 0, 0]} />
          <Bar dataKey="TikTok Conf. Rate" fill="#000000" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

// Agent Performance Bar Chart
export const AgentPerformanceChart: React.FC<{ data: any[] }> = ({ data }) => {
  if (!data || data.length === 0) {
    return <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)' }}>No agent activity data</div>;
  }
  return (
    <div style={{ width: '100%', height: 260 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 15, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(226, 232, 240, 0.5)" />
          <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} />
          <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
          <Tooltip content={<CustomChartTooltip />} />
          <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '6px' }} />
          <Bar dataKey="confirmed" name="Confirmed" fill="#10b981" radius={[4, 4, 0, 0]} stackId="a" />
          <Bar dataKey="cancelled" name="Cancelled" fill="#ef4444" radius={[4, 4, 0, 0]} stackId="a" />
          <Bar dataKey="fake" name="Fake" fill="#f59e0b" radius={[4, 4, 0, 0]} stackId="a" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

// Ads Marketing Spend vs ROAS Chart
export const AdsTrendChart: React.FC<{ data: any[] }> = ({ data }) => {
  if (!data || data.length === 0) {
    return <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)' }}>No ads performance data</div>;
  }
  return (
    <div style={{ width: '100%', height: 280 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 15, right: 10, left: -10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(226, 232, 240, 0.5)" />
          <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} />
          <YAxis yAxisId="left" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
          <YAxis yAxisId="right" orientation="right" stroke="#10b981" fontSize={12} tickLine={false} axisLine={false} unit="x" />
          <Tooltip content={<CustomChartTooltip />} />
          <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '6px' }} />
          <Bar yAxisId="left" dataKey="spend" name="Spend (BDT)" fill="#6366f1" radius={[4, 4, 0, 0]} />
          <Bar yAxisId="left" dataKey="orders" name="Orders" fill="#06b6d4" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};