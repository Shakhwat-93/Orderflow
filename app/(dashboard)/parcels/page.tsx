'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Package,
  Barcode,
  Truck,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Layers,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Clock,
  Printer,
  Scan,
  ShieldCheck,
  RefreshCw,
  Search,
  Eye,
  Plus,
} from 'lucide-react';
import { getParcelMetrics, getParcels } from '@/services/parcelService';
import { ParcelDetailsModal } from '@/components/parcels/ParcelDetailsModal';
import { printParcelLabels } from '@/components/parcels/parcelPrintUtils';
import type { ParcelMetrics, ParcelRecord } from '@/types/parcels';

export default function ParcelManagementDashboardPage() {
  const [metrics, setMetrics] = useState<ParcelMetrics>({
    totalParcels: 0,
    dispatchedCount: 0,
    inTransitCount: 0,
    deliveredCount: 0,
    returnedCount: 0,
    underInspectionCount: 0,
    restockedCount: 0,
    damagedCount: 0,
    todayDispatchedCount: 0,
    todayReturnedCount: 0,
    inventoryTotalStock: 0,
  });

  const [recentParcels, setRecentParcels] = useState<ParcelRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedParcelId, setSelectedParcelId] = useState<string | null>(null);

  const loadDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      const [m, recents] = await Promise.all([
        getParcelMetrics(),
        getParcels({ page: 1, limit: 8 }),
      ]);
      setMetrics(m);
      setRecentParcels(recents.parcels);
    } catch (err) {
      console.error('Failed to load parcel dashboard metrics:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Header & Quick Action Launchers */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-6 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl shadow-xl border border-indigo-900/50">
        <div>
          <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold uppercase tracking-wider mb-1">
            <Barcode size={15} />
            <span>Enterprise Barcode & Dispatch Hub</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight">Factory Parcel & Barcode System</h1>
          <p className="text-xs text-slate-300 mt-1 max-w-xl">
            Physical parcel lifecycle tracking, zero-latency barcode scanning, and independent factory parcel inventory.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/parcels/dispatch"
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-500/25 transition-all"
          >
            <Scan size={15} />
            <span>Launch Dispatch Scanner</span>
          </Link>

          <Link
            href="/parcels/returns"
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 shadow-md shadow-purple-500/25 transition-all"
          >
            <RotateCcw size={15} />
            <span>Launch Return Scanner</span>
          </Link>

          <button
            type="button"
            onClick={loadDashboardData}
            className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
            title="Refresh Metrics"
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Total Registered Parcels */}
        <div className="p-4 bg-white dark:bg-[#1a1a1e] border border-slate-200 dark:border-white/10 rounded-2xl">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-zinc-400 mb-1">
            <span className="font-bold">Total Parcels Created</span>
            <Package size={16} className="text-indigo-600 dark:text-indigo-400" />
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white font-mono">
            {metrics.totalParcels}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">Assigned unique barcodes</span>
        </div>

        {/* Dispatched & In Transit */}
        <div className="p-4 bg-white dark:bg-[#1a1a1e] border border-slate-200 dark:border-white/10 rounded-2xl">
          <div className="flex items-center justify-between text-xs text-amber-600 dark:text-amber-400 mb-1">
            <span className="font-bold">Currently In Transit</span>
            <Truck size={16} />
          </div>
          <div className="text-2xl font-black text-amber-600 dark:text-amber-400 font-mono">
            {metrics.dispatchedCount + metrics.inTransitCount}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">
            Today Dispatched: <strong>+{metrics.todayDispatchedCount}</strong>
          </span>
        </div>

        {/* Returns & Restocked */}
        <div className="p-4 bg-white dark:bg-[#1a1a1e] border border-slate-200 dark:border-white/10 rounded-2xl">
          <div className="flex items-center justify-between text-xs text-purple-600 dark:text-purple-400 mb-1">
            <span className="font-bold">Total Returns Processed</span>
            <RotateCcw size={16} />
          </div>
          <div className="text-2xl font-black text-purple-600 dark:text-purple-400 font-mono">
            {metrics.returnedCount}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">
            Restocked: <strong>{metrics.restockedCount}</strong> · Today: <strong>+{metrics.todayReturnedCount}</strong>
          </span>
        </div>

        {/* Damaged / Quarantine */}
        <div className="p-4 bg-white dark:bg-[#1a1a1e] border border-slate-200 dark:border-white/10 rounded-2xl">
          <div className="flex items-center justify-between text-xs text-rose-600 dark:text-rose-400 mb-1">
            <span className="font-bold">Damaged / Quarantine</span>
            <AlertTriangle size={16} />
          </div>
          <div className="text-2xl font-black text-rose-600 dark:text-rose-400 font-mono">
            {metrics.damagedCount}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">Isolated from sellable stock</span>
        </div>
      </div>

      {/* Navigation Shortcut Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link
          href="/parcels/dispatch"
          className="p-5 bg-white dark:bg-[#1a1a1e] border border-slate-200 dark:border-white/10 rounded-3xl hover:border-indigo-500/50 hover:shadow-lg transition-all group"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <Scan size={20} />
            </div>
            <ArrowRight size={16} className="text-slate-400 group-hover:translate-x-1 transition-transform" />
          </div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            Factory Dispatch Scanner
          </h3>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
            High-speed barcode station. Deducts quantity from independent inventory on each scan with duplicate prevention.
          </p>
        </Link>

        <Link
          href="/parcels/returns"
          className="p-5 bg-white dark:bg-[#1a1a1e] border border-slate-200 dark:border-white/10 rounded-3xl hover:border-purple-500/50 hover:shadow-lg transition-all group"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-2xl bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <RotateCcw size={20} />
            </div>
            <ArrowRight size={16} className="text-slate-400 group-hover:translate-x-1 transition-transform" />
          </div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            Return Parcel Scanner & QC
          </h3>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
            Scans returned barcode, checks condition, restocks eligible sellable items, or moves damaged stock into quarantine.
          </p>
        </Link>

        <Link
          href="/parcels/inventory"
          className="p-5 bg-white dark:bg-[#1a1a1e] border border-slate-200 dark:border-white/10 rounded-3xl hover:border-emerald-500/50 hover:shadow-lg transition-all group"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Layers size={20} />
            </div>
            <ArrowRight size={16} className="text-slate-400 group-hover:translate-x-1 transition-transform" />
          </div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            Factory Parcel Inventory
          </h3>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
            Separate stock balances and immutable transaction ledger for factory parcel dispatches and reverse logistics.
          </p>
        </Link>
      </div>

      {/* Recent Parcels Activity */}
      <div className="bg-white dark:bg-[#1a1a1e] border border-slate-200 dark:border-white/10 rounded-3xl overflow-hidden shadow-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-white/10">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Recent Parcels Activity
            </h3>
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              Latest created or scanned packages in the factory terminal.
            </p>
          </div>

          <Link
            href="/parcels/tracking"
            className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            <span>View All Parcels</span>
            <ArrowRight size={14} />
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-100 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.01] text-slate-400 uppercase text-[10px] font-black tracking-wider">
                <th className="py-3 px-4">Parcel ID & Barcode</th>
                <th className="py-3 px-4">Order ID</th>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Quantity</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    Loading recent parcels...
                  </td>
                </tr>
              ) : recentParcels.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    No parcels generated yet. You can create parcels from confirmed orders or factory dispatch.
                  </td>
                </tr>
              ) : (
                recentParcels.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/70 dark:hover:bg-white/[0.02]">
                    <td className="py-3 px-4 font-mono">
                      <button
                        type="button"
                        onClick={() => setSelectedParcelId(p.parcel_id)}
                        className="font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1.5"
                      >
                        <Barcode size={13} className="text-slate-400" />
                        <span>{p.parcel_id}</span>
                      </button>
                    </td>

                    <td className="py-3 px-4 font-mono font-bold text-slate-800 dark:text-zinc-200">
                      {p.order_id || '—'}
                    </td>

                    <td className="py-3 px-4 font-medium text-slate-800 dark:text-zinc-200">
                      {p.customer_name || 'Customer'}
                    </td>

                    <td className="py-3 px-4 font-mono font-bold text-slate-900 dark:text-white">
                      {p.total_quantity} PCS
                    </td>

                    <td className="py-3 px-4">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-zinc-300">
                        {p.status}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-[11px] font-mono text-slate-400">
                      {new Date(p.created_at).toLocaleDateString('en-GB')}
                    </td>

                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setSelectedParcelId(p.parcel_id)}
                          className="p-1.5 rounded-lg border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-600 dark:text-zinc-300"
                          title="View Details"
                        >
                          <Eye size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => printParcelLabels([p])}
                          className="p-1.5 rounded-lg border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-600 dark:text-zinc-300"
                          title="Print Barcode Label"
                        >
                          <Printer size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Parcel Details Modal */}
      <ParcelDetailsModal
        parcelId={selectedParcelId}
        isOpen={Boolean(selectedParcelId)}
        onClose={() => setSelectedParcelId(null)}
      />
    </div>
  );
}
