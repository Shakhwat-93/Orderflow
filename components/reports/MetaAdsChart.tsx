'use client';

import React from 'react';
import { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts';

interface MetaAdsChartProps {
  data: any[];
}

export const MetaAdsChart: React.FC<MetaAdsChartProps> = ({ data }) => {
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    const update = () => setIsMobile(window.innerWidth < 768);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return (
    <div className="ads-chart-container" style={{ padding: isMobile ? '12px 8px 8px' : '18px 12px 12px' }}>
      <ResponsiveContainer width="100%" height={isMobile ? 220 : 280} minWidth={0} minHeight={0}>
        <BarChart data={data} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(99,102,241,0.06)" />
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
            tickFormatter={(v) => `৳${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
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
                      <strong>৳{Number(p.value).toLocaleString()}</strong>
                    </div>
                  ))}
                </div>
              );
            }}
          />
          <Bar dataKey="spend" name="Ads Cost" fill="#6366f1" fillOpacity={0.85} radius={[4, 4, 0, 0]} barSize={isMobile ? 12 : 20} />
          <Bar dataKey="order_value" name="Order Value" fill="#10b981" fillOpacity={0.75} radius={[4, 4, 0, 0]} barSize={isMobile ? 12 : 20} />
        </BarChart>
      </ResponsiveContainer>
      <div className="ads-chart-legend" style={{ marginTop: '10px', fontSize: isMobile ? '11px' : '12px' }}>
        <span><i style={{ background: '#6366f1' }} />Ads Cost (৳)</span>
        <span><i style={{ background: '#10b981' }} />Order Value (৳)</span>
      </div>
    </div>
  );
};

export default MetaAdsChart;
