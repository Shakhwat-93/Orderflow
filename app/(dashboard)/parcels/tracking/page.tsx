'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  Package,
  Barcode,
  Truck,
  RotateCcw,
  CheckCircle2,
  Filter,
  Calendar,
  Eye,
  Printer,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Plus,
} from 'lucide-react';
import { getParcels } from '@/services/parcelService';
import { printParcelLabels } from '@/components/parcels/parcelPrintUtils';
import { ParcelDetailsModal } from '@/components/parcels/ParcelDetailsModal';
import type { ParcelRecord } from '@/types/parcels';

const STATUS_FILTERS = [
  'ALL',
  'CREATED',
  'PACKED',
  'DISPATCHED',
  'IN TRANSIT',
  'DELIVERED',
  'RETURN RECEIVED',
  'RESTOCKED',
  'DAMAGED',
  'QUARANTINED',
  'CANCELLED',
];

export default function ParcelTrackingPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const [limit] = useState(25);

  const [parcels, setParcels] = useState<ParcelRecord[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // Modal inspection state
  const [selectedParcelId, setSelectedParcelId] = useState<string | null>(null);

  const fetchParcels = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await getParcels({
        status: statusFilter,
        searchTerm,
        page,
        limit,
      });
      setParcels(res.parcels);
      setTotalCount(res.totalCount);
    } catch (err) {
      console.error('Failed to load parcels:', err);
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, searchTerm, page, limit]);

  useEffect(() => {
    const handler = setTimeout(() => {
      fetchParcels();
    }, 250);
    return () => clearTimeout(handler);
  }, [fetchParcels]);

  const totalPages = Math.ceil(totalCount / limit) || 1;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'CREATED':
      case 'PACKED':
        return 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400 border-blue-200 dark:border-blue-500/20';
      case 'DISPATCHED':
      case 'IN TRANSIT':
        return 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 border-amber-200 dark:border-amber-500/20';
      case 'DELIVERED':
      case 'RESTOCKED':
        return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20';
      case 'DAMAGED':
      case 'QUARANTINED':
      case 'LOST':
        return 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400 border-rose-200 dark:border-rose-500/20';
      case 'RETURN RECEIVED':
      case 'UNDER INSPECTION':
        return 'bg-purple-50 text-purple-700 dark:bg-purple-500/10 dark:text-purple-400 border-purple-200 dark:border-purple-500/20';
      default:
        return 'bg-slate-100 text-slate-700 dark:bg-white/5 dark:text-zinc-400 border-slate-200 dark:border-white/10';
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            Parcel Search & Tracking
          </h1>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
            Real-time parcel identity lookup, barcode tracking, and physical transit journey.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-500 dark:text-zinc-400">
            Total Registered: <strong className="text-slate-900 dark:text-white">{totalCount}</strong>
          </span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 bg-white dark:bg-[#1a1a1e] border border-slate-200 dark:border-white/10 rounded-2xl shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          {/* Search box */}
          <div className="relative flex-1">
            <Search
              size={18}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />
            <input
              type="text"
              placeholder="Search by Parcel ID, Barcode, Order ID, Customer Phone, or Name..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              className="w-full h-11 pl-10 pr-4 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.02] text-xs font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 outline-none focus:border-indigo-500 transition-all"
            />
          </div>

          {/* Status selector */}
          <div className="flex items-center gap-2">
            <Filter size={15} className="text-slate-400 shrink-0" />
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="h-11 px-3.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.02] text-xs font-bold text-slate-800 dark:text-zinc-200 outline-none cursor-pointer"
            >
              {STATUS_FILTERS.map((st) => (
                <option key={st} value={st} className="text-slate-900">
                  Status: {st}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Parcels Table */}
      <div className="bg-white dark:bg-[#1a1a1e] border border-slate-200 dark:border-white/10 rounded-3xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-100 dark:border-white/10 bg-slate-50/60 dark:bg-white/[0.02] text-slate-400 uppercase text-[10px] font-black tracking-wider">
                <th className="py-3.5 px-4">Parcel ID & Barcode</th>
                <th className="py-3.5 px-4">Order ID</th>
                <th className="py-3.5 px-4">Recipient</th>
                <th className="py-3.5 px-4">Items Summary</th>
                <th className="py-3.5 px-4">Location</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4">Created Date</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-slate-400">
                    Loading parcel registry...
                  </td>
                </tr>
              ) : parcels.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-slate-400">
                    No parcels found matching your filter.
                  </td>
                </tr>
              ) : (
                parcels.map((p) => {
                  const itemsText = (p.items || [])
                    .map((it) => `${it.product_name} × ${it.quantity}`)
                    .join(', ');

                  return (
                    <tr
                      key={p.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="py-3.5 px-4 font-mono">
                        <button
                          type="button"
                          onClick={() => setSelectedParcelId(p.parcel_id)}
                          className="font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1.5"
                        >
                          <Barcode size={13} className="text-slate-400" />
                          <span>{p.parcel_id}</span>
                        </button>
                        <span className="text-[10px] text-slate-400 block font-normal">
                          {p.barcode}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 font-mono font-bold text-slate-800 dark:text-zinc-200">
                        {p.order_id || '—'}
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900 dark:text-white">
                          {p.customer_name || 'Customer'}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-zinc-400 font-mono">
                          {p.customer_phone || ''}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 max-w-xs truncate text-slate-700 dark:text-zinc-300">
                        {itemsText || `${p.total_quantity} item(s)`}
                      </td>

                      <td className="py-3.5 px-4 text-slate-600 dark:text-zinc-400">
                        {p.current_location}
                      </td>

                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${getStatusBadge(
                            p.status
                          )}`}
                        >
                          {p.status}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 font-mono text-[11px] text-slate-400">
                        {new Date(p.created_at).toLocaleDateString('en-GB', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedParcelId(p.parcel_id)}
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-600 dark:text-zinc-300 transition-colors"
                            title="Inspect Complete Parcel Journey"
                          >
                            <Eye size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => printParcelLabels([p])}
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-600 dark:text-zinc-300 transition-colors"
                            title="Thermal Barcode Label"
                          >
                            <Printer size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.01] text-xs">
          <span className="text-slate-500 dark:text-zinc-400">
            Page {page} of {totalPages} ({totalCount} total parcels)
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="p-2 rounded-xl border border-slate-200 dark:border-white/10 text-slate-700 dark:text-zinc-200 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="p-2 rounded-xl border border-slate-200 dark:border-white/10 text-slate-700 dark:text-zinc-200 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Detailed Parcel Inspection Modal */}
      <ParcelDetailsModal
        parcelId={selectedParcelId}
        isOpen={Boolean(selectedParcelId)}
        onClose={() => setSelectedParcelId(null)}
      />
    </div>
  );
}
