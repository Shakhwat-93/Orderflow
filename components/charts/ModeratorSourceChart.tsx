// @ts-nocheck
'use client';

import React from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip as RechartsTooltip } from 'recharts';

interface ModeratorSourceChartProps {
  sourceDistribution?: any[];
}

export function ModeratorSourceChart({ sourceDistribution = [] }: ModeratorSourceChartProps) {
  const isDark = typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark';

  return (
    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
      <PieChart>
        <defs>
          <filter id="premium-glow-mod" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          <filter id="inset-shadow-mod" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="#000" floodOpacity="0.5" />
          </filter>
        </defs>
        <Pie
          data={[{ value: 100 }]}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={80}
          fill={isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)'}
          stroke={isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)'}
          isAnimationActive={false}
          filter="url(#inset-shadow-mod)"
        />
        <Pie
          data={sourceDistribution}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={80}
          paddingAngle={8}
          cornerRadius={20}
          dataKey="value"
          stroke="none"
        >
          {sourceDistribution.map((entry: any, index: number) => (
            <Cell key={`cell-${index}`} fill={entry.color} filter="url(#premium-glow-mod)" />
          ))}
        </Pie>
        <RechartsTooltip 
          contentStyle={{ 
            backgroundColor: isDark ? '#1c1c1e' : '#fff', 
            borderRadius: '12px', 
            border: '1px solid ' + (isDark ? 'rgba(255,255,255,0.06)' : '#e2e8f0'), 
            boxShadow: '0 10px 30px rgba(0,0,0,0.1)', 
            color: isDark ? '#f4f4f5' : '#1e293b' 
          }} 
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

export default ModeratorSourceChart;
