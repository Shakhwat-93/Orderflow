'use client';

import React from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip
} from 'recharts';

export interface SalesTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string;
}

const fmtTk = (n: number | string) => '৳' + Number(n || 0).toLocaleString();

export const SalesChartTooltip: React.FC<SalesTooltipProps> = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="sr-tooltip" style={{
      background: 'rgba(15, 23, 42, 0.94)',
      backdropFilter: 'blur(12px)',
      border: '1px solid rgba(255, 255, 255, 0.12)',
      padding: '10px 14px',
      borderRadius: '10px',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.28)',
      color: '#f8fafc',
      fontSize: '0.82rem'
    }}>
      <p className="sr-tt-label" style={{ fontWeight: 600, marginBottom: '6px', color: '#94a3b8' }}>{label}</p>
      {payload.map((p, i) => (
        <div key={i} className="sr-tt-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', margin: '3px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span className="sr-tt-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: p.color || p.fill }} />
            <span style={{ color: '#cbd5e1' }}>{p.name}:</span>
          </div>
          <strong style={{ color: '#ffffff' }}>
            {typeof p.value === 'number' && p.name?.toLowerCase().includes('revenue') ? fmtTk(p.value) : p.value}
          </strong>
        </div>
      ))}
    </div>
  );
};

// Sales Status Donut / Pie Chart
export const SalesStatusPieChart: React.FC<{ data: any[]; colors: string[] }> = ({ data, colors }) => {
  if (!data || data.length === 0) {
    return <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)' }}>No status breakdown</div>;
  }
  return (
    <div style={{ width: '100%', height: 260 }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="count"
            nameKey="status"
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={80}
            paddingAngle={3}
          >
            {data.map((entry, index) => (
              <Cell key={'cell-' + index} fill={entry.color || colors[index % colors.length]} />
            ))}
          </Pie>
          <Tooltip content={<SalesChartTooltip />} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};

// Sales Trend Area / Bar Chart
export const SalesTrendChart: React.FC<{ data: any[]; chartType: 'bar' | 'area' }> = ({ data, chartType }) => {
  if (!data || data.length === 0) {
    return <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)' }}>No timeline data available</div>;
  }

  return (
    <div style={{ width: '100%', height: 260 }}>
      <ResponsiveContainer width="100%" height="100%">
        {chartType === 'area' ? (
          <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="srRevenueGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(226, 232, 240, 0.5)" />
            <XAxis dataKey="label" stroke="#94a3b8" fontSize={12} tickLine={false} />
            <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
            <Tooltip content={<SalesChartTooltip />} />
            <Area
              type="monotone"
              dataKey="revenue"
              name="Revenue"
              stroke="#10b981"
              strokeWidth={2.5}
              fillOpacity={1}
              fill="url(#srRevenueGrad)"
            />
          </AreaChart>
        ) : (
          <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(226, 232, 240, 0.5)" />
            <XAxis dataKey="label" stroke="#94a3b8" fontSize={12} tickLine={false} />
            <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
            <Tooltip content={<SalesChartTooltip />} />
            <Bar dataKey="orders" name="Total Orders" fill="#6366f1" radius={[4, 4, 0, 0]} />
            <Bar dataKey="confirmed" name="Confirmed Orders" fill="#10b981" radius={[4, 4, 0, 0]} />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
};