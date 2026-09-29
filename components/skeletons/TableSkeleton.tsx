import React from 'react';

interface TableSkeletonProps {
  title?: string;
  subtitle?: string;
  rows?: number;
}

export function TableSkeleton({
  title = 'Loading...',
  subtitle = 'Retrieving data pipeline...',
  rows = 8
}: TableSkeletonProps) {
  return (
    <div className="w-full p-4 sm:p-6 space-y-6 animate-pulse">
      {/* Header bar skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100 dark:border-white/[0.06]">
        <div className="space-y-2">
          <div className="h-7 w-48 bg-slate-200 dark:bg-[#242424] rounded-lg" />
          <div className="h-4 w-72 bg-slate-100 dark:bg-[#242424]/60 rounded" />
        </div>
        <div className="flex items-center gap-3">
          <div className="h-9 w-28 bg-slate-200 dark:bg-[#242424] rounded-lg" />
          <div className="h-9 w-32 bg-slate-200 dark:bg-[#242424] rounded-lg" />
        </div>
      </div>

      {/* Filter / Status bar tabs skeleton */}
      <div className="flex items-center gap-2 overflow-x-hidden py-1">
        {[80, 100, 90, 110, 85, 95].map((w, i) => (
          <div
            key={i}
            className="h-8 rounded-full bg-slate-200 dark:bg-[#242424] shrink-0"
            style={{ width: `${w}px` }}
          />
        ))}
      </div>

      {/* Search and control bar skeleton */}
      <div className="flex items-center justify-between gap-4">
        <div className="h-10 w-72 max-w-full bg-slate-200 dark:bg-[#242424] rounded-lg" />
        <div className="flex items-center gap-2">
          <div className="h-10 w-24 bg-slate-200 dark:bg-[#242424] rounded-lg" />
          <div className="h-10 w-24 bg-slate-200 dark:bg-[#242424] rounded-lg" />
        </div>
      </div>

      {/* Table skeleton */}
      <div className="w-full bg-white dark:bg-[#1c1c1e] rounded-xl border border-slate-200 dark:border-white/[0.06] overflow-hidden shadow-sm">
        {/* Table Header */}
        <div className="h-12 bg-slate-50 dark:bg-[#141414] border-b border-slate-200 dark:border-white/[0.06] flex items-center px-4 gap-4">
          <div className="h-4 w-6 bg-slate-200 dark:bg-[#242424] rounded" />
          <div className="h-4 w-28 bg-slate-200 dark:bg-[#242424] rounded" />
          <div className="h-4 w-32 bg-slate-200 dark:bg-[#242424] rounded" />
          <div className="h-4 w-24 bg-slate-200 dark:bg-[#242424] rounded ml-auto" />
          <div className="h-4 w-20 bg-slate-200 dark:bg-[#242424] rounded" />
        </div>

        {/* Table Rows */}
        <div className="divide-y divide-slate-100 dark:divide-white/[0.04]">
          {Array.from({ length: rows }).map((_, idx) => (
            <div key={idx} className="h-16 flex items-center px-4 gap-4">
              <div className="h-4 w-4 bg-slate-100 dark:bg-[#242424] rounded" />
              <div className="space-y-1.5 flex-1">
                <div className="h-4 w-36 bg-slate-200 dark:bg-[#242424] rounded" />
                <div className="h-3 w-24 bg-slate-100 dark:bg-[#242424]/60 rounded" />
              </div>
              <div className="h-4 w-28 bg-slate-100 dark:bg-[#242424] rounded hidden md:block" />
              <div className="h-6 w-20 bg-slate-200 dark:bg-[#242424] rounded-full" />
              <div className="h-4 w-16 bg-slate-100 dark:bg-[#242424] rounded" />
              <div className="h-8 w-8 bg-slate-100 dark:bg-[#242424] rounded-lg ml-2" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default TableSkeleton;
