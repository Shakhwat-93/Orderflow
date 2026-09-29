'use client';

import React from 'react';

interface ReportChartSkeletonProps {
  height?: number | string;
  className?: string;
}

export const ReportChartSkeleton: React.FC<ReportChartSkeletonProps> = ({
  height = 300,
  className = ''
}) => {
  return (
    <div
      className={`report-chart-skeleton-elite ${className}`}
      style={{
        height,
        width: '100%',
        borderRadius: '12px',
        background: 'linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.07) 50%, rgba(255,255,255,0.03) 75%)',
        backgroundSize: '200% 100%',
        animation: 'skeleton-pulse 1.5s ease-in-out infinite',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      <div
        style={{
          width: '32px',
          height: '32px',
          borderRadius: '50%',
          border: '2px solid rgba(99, 102, 241, 0.2)',
          borderTopColor: 'var(--accent, #6366f1)',
          animation: 'spin 1s linear infinite'
        }}
      />
    </div>
  );
};
