'use client';

import React from 'react';
import { ResponsiveContainer, AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts';

interface GrowthTrajectoryChartProps {
  data: any[];
  height?: number;
}

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) => {
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

export const GrowthTrajectoryChart: React.FC<GrowthTrajectoryChartProps> = ({ data, height }) => {
  const [chartHeight, setChartHeight] = React.useState(height || 360);

  React.useEffect(() => {
    if (height) {
      setChartHeight(height);
      return;
    }
    const update = () => {
      setChartHeight(window.innerWidth < 768 ? 240 : 360);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [height]);

  return (
    <div className="report-chart-container-elite" style={{ height: chartHeight, width: '100%', minWidth: 0 }}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
        <AreaChart data={data} margin={{ top: 12, right: 10, left: -22, bottom: 0 }}>
          <defs>
            <linearGradient id="colorOrdersElite" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.18}/>
              <stop offset="95%" stopColor="var(--accent)" stopOpacity={0.01}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(124, 77, 255, 0.05)" />
          <XAxis 
            dataKey="name" 
            axisLine={false} 
            tickLine={false} 
            tick={{ fill: 'var(--text-tertiary)', fontSize: 10, fontWeight: 500 }} 
            dy={8}
            minTickGap={20}
            interval="preserveStartEnd"
          />
          <YAxis 
            axisLine={false} 
            tickLine={false} 
            tick={{ fill: 'var(--text-tertiary)', fontSize: 10, fontWeight: 500 }} 
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'var(--accent)', strokeWidth: 1, strokeDasharray: '4 4' }} />
          <Area 
            type="monotone" 
            dataKey="orders" 
            stroke="var(--accent)" 
            strokeWidth={3} 
            fillOpacity={1} 
            fill="url(#colorOrdersElite)" 
            activeDot={{ r: 5, strokeWidth: 0, fill: 'var(--accent)' }} 
            animationDuration={1200}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

export default GrowthTrajectoryChart;
