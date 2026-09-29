'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, XAxis, Tooltip } from 'recharts';
import { PieChart as PieChartIcon, Activity, Truck } from 'lucide-react';

interface SecondaryReportsChartsProps {
  sourceData: { name: string; value: number; color: string }[];
  confirmationData: { name: string; rate: number }[];
  logisticsData: { name: string; rate: number }[];
  itemVariants?: any;
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

export const SecondaryReportsCharts: React.FC<SecondaryReportsChartsProps> = ({
  sourceData,
  confirmationData,
  logisticsData,
  itemVariants
}) => {
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    const update = () => setIsMobile(window.innerWidth < 768);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return (
    <div className="reports-secondary-grid-elite">
      <motion.div className="secondary-chart-card glass" variants={itemVariants}>
        <div className="card-header-elite">
          <PieChartIcon className="chart-icon icon-indigo" size={18} />
          <h3>Source Acquisition</h3>
        </div>
        <div className="report-chart-container centered">
          <ResponsiveContainer width="100%" height={isMobile ? 190 : 220} minWidth={0} minHeight={0}>
            <PieChart>
              <Pie
                data={sourceData}
                cx="50%"
                cy="50%"
                innerRadius={isMobile ? 48 : 65}
                outerRadius={isMobile ? 68 : 85}
                paddingAngle={6}
                dataKey="value"
              >
                {sourceData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} strokeWidth={0} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="pie-legend-elite">
            {sourceData.map((item) => (
              <div key={item.name} className="legend-item-elite">
                <span className="dot" style={{ backgroundColor: item.color }}></span>
                <span className="name">{item.name}</span>
                <span className="value">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      <motion.div className="secondary-chart-card glass" variants={itemVariants}>
        <div className="card-header-elite">
          <Activity className="chart-icon icon-teal" size={18} />
          <h3>Confirmation Logic</h3>
        </div>
        <div className="report-chart-container">
          <ResponsiveContainer width="100%" height={isMobile ? 190 : 220} minWidth={0} minHeight={0}>
            <BarChart data={confirmationData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
              <XAxis
                dataKey="name"
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'var(--text-tertiary)', fontSize: 10 }}
                dy={8}
                interval="preserveStartEnd"
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
              <Bar dataKey="rate" radius={[4, 4, 0, 0]} barSize={isMobile ? 16 : 24}>
                {confirmationData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.rate > 85 ? 'var(--color-success)' : 'var(--text-tertiary)'}
                    fillOpacity={0.6}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </motion.div>

      <motion.div className="secondary-chart-card glass" variants={itemVariants}>
        <div className="card-header-elite">
          <Truck className="chart-icon icon-purple" size={18} />
          <h3>Logistics Success</h3>
        </div>
        <div className="report-chart-container">
          <ResponsiveContainer width="100%" height={isMobile ? 190 : 220} minWidth={0} minHeight={0}>
            <BarChart data={logisticsData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
              <XAxis
                dataKey="name"
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'var(--text-tertiary)', fontSize: 10 }}
                dy={8}
                interval="preserveStartEnd"
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
              <Bar dataKey="rate" radius={[4, 4, 0, 0]} barSize={isMobile ? 16 : 24}>
                {logisticsData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.rate > 90 ? 'var(--accent)' : 'var(--color-primary-soft)'}
                    fillOpacity={0.6}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </motion.div>
    </div>
  );
};

export default SecondaryReportsCharts;
