'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  FileSpreadsheet,
  Download,
  Calendar,
  Filter,
  Package,
  RotateCcw,
  Truck,
  AlertTriangle,
  RefreshCw,
  Printer,
  Search,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

const REPORT_TYPES = [
  { id: 'DAILY_DISPATCH', label: '1. Daily Factory Dispatch Report', desc: 'All parcels dispatched by date and station' },
  { id: 'DAILY_RETURNS', label: '2. Daily Return & Inspection Report', desc: 'All returned packages and condition breakdown' },
  { id: 'PRODUCT_MOVEMENT', label: '3. Product-wise Parcel Movement', desc: 'Dispatches and returns grouped by product and SKU' },
  { id: 'SKU_INVENTORY', label: '4. SKU-wise Independent Inventory', desc: 'Current available, dispatched, returned, and damaged balances' },
  { id: 'DAMAGED_REPORT', label: '5. Damaged & Quarantine Report', desc: 'Packages broken during courier transit' },
  { id: 'SCAN_AUDIT', label: '6. Duplicate Scan & Error Audit', desc: 'Audit log of blocked duplicate and invalid scans' },
  { id: 'OPERATOR_ACTIVITY', label: '7. Operator Terminal Performance', desc: 'Scans and dispatches logged per operator' },
];

export default function ParcelReportsPage() {
  const supabase = createClient();

  const [selectedReport, setSelectedReport] = useState('DAILY_DISPATCH');
  const [dateStart, setDateStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  });
  const [dateEnd, setDateEnd] = useState(() => new Date().toISOString().split('T')[0]);
  const [searchTerm, setSearchTerm] = useState('');

  const [reportData, setReportData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      let data: any[] = [];

      if (selectedReport === 'DAILY_DISPATCH') {
        const { data: rows } = await supabase
          .from('parcel_records')
          .select('parcel_id, barcode, order_id, customer_name, total_quantity, dispatched_at, dispatched_by, last_scanner_station')
          .not('dispatched_at', 'is', null)
          .gte('dispatched_at', `${dateStart}T00:00:00Z`)
          .lte('dispatched_at', `${dateEnd}T23:59:59Z`)
          .order('dispatched_at', { ascending: false });
        data = rows || [];
      } else if (selectedReport === 'DAILY_RETURNS') {
        const { data: rows } = await supabase
          .from('parcel_returns')
          .select('parcel_id, order_id, return_condition, original_quantity, returned_quantity, restocked_quantity, damaged_quantity, inspected_by, action_taken, created_at')
          .gte('created_at', `${dateStart}T00:00:00Z`)
          .lte('created_at', `${dateEnd}T23:59:59Z`)
          .order('created_at', { ascending: false });
        data = rows || [];
      } else if (selectedReport === 'SKU_INVENTORY') {
        const { data: rows } = await supabase
          .from('parcel_inventory')
          .select('*')
          .order('current_stock', { ascending: false });
        data = rows || [];
      } else if (selectedReport === 'PRODUCT_MOVEMENT') {
        const { data: rows } = await supabase
          .from('parcel_inventory_transactions')
          .select('transaction_id, parcel_id, sku, product_name, movement_type, quantity, previous_stock, new_stock, operator_name, created_at')
          .gte('created_at', `${dateStart}T00:00:00Z`)
          .lte('created_at', `${dateEnd}T23:59:59Z`)
          .order('created_at', { ascending: false });
        data = rows || [];
      } else if (selectedReport === 'DAMAGED_REPORT') {
        const { data: rows } = await supabase
          .from('parcel_returns')
          .select('parcel_id, order_id, return_condition, damaged_quantity, inspected_by, inspection_notes, created_at')
          .in('return_condition', ['DAMAGED', 'DEFECTIVE', 'QUARANTINE'])
          .gte('created_at', `${dateStart}T00:00:00Z`)
          .lte('created_at', `${dateEnd}T23:59:59Z`)
          .order('created_at', { ascending: false });
        data = rows || [];
      } else if (selectedReport === 'SCAN_AUDIT') {
        const { data: rows } = await supabase
          .from('parcel_scan_events')
          .select('parcel_id, barcode, event_type, scan_result, operator_name, station_id, notes, scanned_at')
          .gte('scanned_at', `${dateStart}T00:00:00Z`)
          .lte('scanned_at', `${dateEnd}T23:59:59Z`)
          .order('scanned_at', { ascending: false });
        data = rows || [];
      } else if (selectedReport === 'OPERATOR_ACTIVITY') {
        const { data: rows } = await supabase
          .from('parcel_scan_events')
          .select('operator_name, station_id, event_type, scan_result, scanned_at')
          .gte('scanned_at', `${dateStart}T00:00:00Z`)
          .lte('scanned_at', `${dateEnd}T23:59:59Z`);
        data = rows || [];
      }

      setReportData(data);
    } catch (err) {
      console.error('Failed to load report data:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedReport, dateStart, dateEnd, supabase]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const exportCSV = () => {
    if (!reportData || reportData.length === 0) {
      alert('No data available to export.');
      return;
    }

    const headers = Object.keys(reportData[0]);
    const csvRows = [headers.join(',')];

    for (const row of reportData) {
      const values = headers.map((h) => {
        const val = row[h];
        if (val === null || val === undefined) return '""';
        return `"${String(val).replace(/"/g, '""')}"`;
      });
      csvRows.push(values.join(','));
    }

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${selectedReport}_${dateStart}_to_${dateEnd}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            Factory Parcel Reports & Analytics
          </h1>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
            Historical audit logs, daily dispatch throughput, return inspection ratios, and independent inventory ledger.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchReport}
            className="p-2.5 rounded-xl border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/5 text-slate-600 dark:text-zinc-300 transition-colors"
            title="Refresh Report Data"
          >
            <RefreshCw size={15} />
          </button>

          <button
            type="button"
            onClick={exportCSV}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-500/25 transition-all"
          >
            <Download size={15} />
            <span>Export CSV / Excel</span>
          </button>
        </div>
      </div>

      {/* Report Controls Card */}
      <div className="p-5 bg-white dark:bg-[#1a1a1e] border border-slate-200 dark:border-white/10 rounded-3xl shadow-sm space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Report Type Selector */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 block mb-1.5">
              Select Report Type
            </label>
            <select
              value={selectedReport}
              onChange={(e) => setSelectedReport(e.target.value)}
              className="w-full h-11 px-3.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.02] text-xs font-bold text-slate-900 dark:text-white outline-none cursor-pointer"
            >
              {REPORT_TYPES.map((r) => (
                <option key={r.id} value={r.id} className="text-slate-900">
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          {/* Start Date */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 block mb-1.5">
              Date From
            </label>
            <input
              type="date"
              value={dateStart}
              onChange={(e) => setDateStart(e.target.value)}
              className="w-full h-11 px-3.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.02] text-xs font-bold text-slate-900 dark:text-white outline-none"
            />
          </div>

          {/* End Date */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 block mb-1.5">
              Date To
            </label>
            <input
              type="date"
              value={dateEnd}
              onChange={(e) => setDateEnd(e.target.value)}
              className="w-full h-11 px-3.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.02] text-xs font-bold text-slate-900 dark:text-white outline-none"
            />
          </div>
        </div>
      </div>

      {/* Report Data Table */}
      <div className="bg-white dark:bg-[#1a1a1e] border border-slate-200 dark:border-white/10 rounded-3xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-white/10 flex items-center justify-between">
          <div className="text-xs font-bold text-slate-700 dark:text-zinc-300">
            Showing {reportData.length} records
          </div>
        </div>

        <div className="overflow-x-auto max-h-[560px]">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-100 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.01] text-slate-400 uppercase text-[10px] font-black tracking-wider sticky top-0 bg-slate-50 dark:bg-[#1a1a1e]">
                {reportData.length > 0 &&
                  Object.keys(reportData[0]).map((key) => (
                    <th key={key} className="py-3 px-4 capitalize">
                      {key.replace(/_/g, ' ')}
                    </th>
                  ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5 font-mono">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-slate-400 font-sans">
                    Generating report data...
                  </td>
                </tr>
              ) : reportData.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-slate-400 font-sans">
                    No records found for the selected report and date window.
                  </td>
                </tr>
              ) : (
                reportData.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/70 dark:hover:bg-white/[0.02]">
                    {Object.keys(row).map((k) => (
                      <td key={k} className="py-3 px-4 truncate max-w-xs text-slate-800 dark:text-zinc-300">
                        {String(row[k] ?? '—')}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
