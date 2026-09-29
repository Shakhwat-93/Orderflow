import React from 'react';
import { TableSkeleton } from '@/components/skeletons/TableSkeleton';

/**
 * DashboardRouteLoading
 * Content-area localized fallback.
 * Keeps Sidebar, Header, MobileBottomNav, and Global Providers 100% mounted at all times.
 * pointer-events: none ensures background loading never blocks user interaction.
 */
export default function DashboardRouteLoading() {
  return (
    <div
      className="dashboard-route-loader-zone w-full"
      style={{ pointerEvents: 'none' }}
      aria-busy="true"
      aria-live="polite"
    >
      <TableSkeleton rows={8} />
    </div>
  );
}
