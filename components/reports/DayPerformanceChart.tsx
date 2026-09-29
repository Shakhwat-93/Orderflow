'use client';

import React from 'react';
import { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts';

interface DayPerformanceChartProps {
  data: any[];
}

export const DayPerformanceChart: React.FC<DayPerformanceChartProps> = ({ data }) => {
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    const update = () => setIsMobile(window.innerWidth < 768);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return (
    <div className="uperf-chart-wrap" style={{ padding: isMobile ? '12px 8px 8px' : '18px 12px 12px' }}>
      <ResponsiveContainer width="100%" height={isMobile ? 240 : 300} minWidth={0} minHeight={0}>
        <BarChart data={data} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(99,102,241,0.05)" />
          <XAxis
            dataKey="name"
            axisLine={false}
            tickLine={false}
            tick={{ fill: 'var(--text-tertiary)', fontSize: 10 }}
            dy={8}
            interval="preserveStartEnd"
            minTickGap={15}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: 'var(--text-tertiary)', fontSize: 10 }}
          />
          <Tooltip
            content={({ active, payload, label }: any) => {
              if (!active || !payload?.length) return null;
              return (
                <div className="ads-custom-tooltip">
                  <p className="ads-tt-date">{label}</p>
                  {payload.map((p: any, i: number) => (
                    <div key={i} className="ads-tt-row">
                      <span className="ads-tt-dot" style={{ background: p.fill }} />
                      <span>{p.name}:</span>
                      <strong>{p.value}</strong>
                    </div>
                  ))}
                </div>
              );
            }}
          />
          <Bar dataKey="confirmed" name="Confirmed" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} barSize={isMobile ? 16 : 24} />
          <Bar dataKey="cancelled" name="Cancelled" stackId="a" fill="#ef4444" radius={[0, 0, 0, 0]} barSize={isMobile ? 16 : 24} />
          <Bar dataKey="fake" name="Fake" stackId="a" fill="#f59e0b" radius={[4, 4, 0, 0]} barSize={isMobile ? 16 : 24} />
        </BarChart>
      </ResponsiveContainer>
      <div className="ads-chart-legend" style={{ marginTop: '10px', fontSize: isMobile ? '11px' : '12px' }}>
        <span><i style={{ background: '#10b981' }} />Confirmed</span>
        <span><i style={{ background: '#ef4444' }} />Cancelled</span>
        <span><i style={{ background: '#f59e0b' }} />Fake</span>
      </div>
    </div>
  );
};

export default DayPerformanceChart;
