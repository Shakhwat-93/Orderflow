'use client';

import React from 'react';
import { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts';

interface ProductFunnelChartProps {
  data: any[];
}

export const ProductFunnelChart: React.FC<ProductFunnelChartProps> = ({ data }) => {
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    const update = () => setIsMobile(window.innerWidth < 768);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return (
    <div className="ads-chart-container" style={{ padding: isMobile ? '14px 10px 10px' : '20px' }}>
      <ResponsiveContainer width="100%" height={isMobile ? 240 : 300} minWidth={0} minHeight={0}>
        <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(99,102,241,0.06)" />
          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'var(--text-tertiary)', fontSize: 10 }} />
          <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--text-tertiary)', fontSize: 10 }} unit="%" />
          <Tooltip
            content={({ active, payload, label }: any) => {
              if (!active || !payload?.length) return null;
              return (
                <div
                  className="ads-custom-tooltip"
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    padding: '8px 12px',
                    borderRadius: '8px'
                  }}
                >
                  <p className="ads-tt-date" style={{ fontWeight: 'bold', marginBottom: '4px', fontSize: '11px' }}>{label}</p>
                  {payload.map((p: any, i: number) => (
                    <div
                      key={i}
                      className="ads-tt-row"
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: '14px',
                        fontSize: '11px',
                        margin: '3px 0'
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span
                          className="ads-tt-dot"
                          style={{
                            background: p.fill,
                            width: '7px',
                            height: '7px',
                            borderRadius: '50%',
                            display: 'inline-block'
                          }}
                        />
                        {p.name}:
                      </span>
                      <strong>{p.value}%</strong>
                    </div>
                  ))}
                </div>
              );
            }}
          />
          <Bar dataKey="Confirmation Rate" name="Overall Conf. Rate" fill="#6366f1" radius={[4, 4, 0, 0]} barSize={isMobile ? 12 : 24} />
          <Bar dataKey="Facebook Conf. Rate" name="Facebook Conf. Rate" fill="#1877f2" radius={[4, 4, 0, 0]} barSize={isMobile ? 12 : 24} />
          <Bar dataKey="TikTok Conf. Rate" name="TikTok Conf. Rate" fill="#a1a1aa" radius={[4, 4, 0, 0]} barSize={isMobile ? 12 : 24} />
        </BarChart>
      </ResponsiveContainer>
      <div
        className="ads-chart-legend"
        style={{
          marginTop: '12px',
          display: 'flex',
          justifyContent: 'center',
          gap: isMobile ? '10px' : '20px',
          flexWrap: 'wrap',
          fontSize: isMobile ? '11px' : '12px'
        }}
      >
        <span>
          <i style={{ background: '#6366f1', width: '10px', height: '10px', display: 'inline-block', marginRight: '6px', borderRadius: '2px' }} />
          Overall Conf. Rate
        </span>
        <span>
          <i style={{ background: '#1877f2', width: '10px', height: '10px', display: 'inline-block', marginRight: '6px', borderRadius: '2px' }} />
          Facebook Conf. Rate
        </span>
        <span>
          <i style={{ background: '#a1a1aa', width: '10px', height: '10px', display: 'inline-block', marginRight: '6px', borderRadius: '2px' }} />
          TikTok Conf. Rate
        </span>
      </div>
    </div>
  );
};

export default ProductFunnelChart;
