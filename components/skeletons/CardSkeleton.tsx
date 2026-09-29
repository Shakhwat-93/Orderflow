import React from 'react';

export function CardSkeleton() {
  return (
    <div className="w-full p-4 sm:p-6 space-y-6 animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-white/[0.06]">
        <div className="space-y-2">
          <div className="h-7 w-48 bg-slate-200 dark:bg-[#242424] rounded-lg" />
          <div className="h-4 w-64 bg-slate-100 dark:bg-[#242424]/60 rounded" />
        </div>
        <div className="h-9 w-32 bg-slate-200 dark:bg-[#242424] rounded-lg" />
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-28 rounded-xl bg-white dark:bg-[#1c1c1e] border border-slate-200 dark:border-white/[0.06] p-4 space-y-3 shadow-sm">
            <div className="h-4 w-24 bg-slate-200 dark:bg-[#242424] rounded" />
            <div className="h-7 w-32 bg-slate-200 dark:bg-[#242424] rounded" />
          </div>
        ))}
      </div>

      {/* Chart card skeleton */}
      <div className="h-80 rounded-xl bg-white dark:bg-[#1c1c1e] border border-slate-200 dark:border-white/[0.06] p-6 shadow-sm flex items-center justify-center">
        <div className="h-48 w-full bg-slate-100 dark:bg-[#242424]/50 rounded-lg" />
      </div>
    </div>
  );
}

export default CardSkeleton;
