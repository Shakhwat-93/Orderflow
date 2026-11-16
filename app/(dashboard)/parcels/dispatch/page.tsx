'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Scan,
  Barcode,
  Truck,
  CheckCircle2,
  AlertOctagon,
  AlertTriangle,
  History,
  Layers,
  User,
  Radio,
  Printer,
  Volume2,
  VolumeX,
  RefreshCw,
  Clock,
  ArrowRight,
  ShieldCheck,
  Search,
} from 'lucide-react';
import { dispatchParcelByBarcode, lookupParcel } from '@/services/parcelService';
import { playSuccessBeep, playDuplicateBeep, playErrorBeep } from '@/utils/scannerAudio';
import { printParcelLabels } from '@/components/parcels/parcelPrintUtils';
import type { DispatchScanResult, ParcelRecord } from '@/types/parcels';
import { useAuth } from '@/context/AuthContext';

interface ScanSessionLog {
  id: string;
  barcode: string;
  parcelId: string;
  orderId?: string;
  customerName?: string;
  totalQty: number;
  result: DispatchScanResult;
  timestamp: string;
  status: 'SUCCESS' | 'DUPLICATE' | 'ERROR';
}

export default function FactoryDispatchScannerPage() {
  const { profile } = useAuth();
  const operatorName = profile?.name || 'Factory Dispatcher';
  const operatorId = profile?.id;

  const [stationId, setStationId] = useState('STATION-DISPATCH-01');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);

  // Active scan state
  const [lastResult, setLastResult] = useState<DispatchScanResult | null>(null);
  const [lastParcel, setLastParcel] = useState<ParcelRecord | null>(null);
  const [sessionLogs, setSessionLogs] = useState<ScanSessionLog[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const lockRef = useRef<boolean>(false);

  // Maintain continuous focus for USB/Bluetooth barcode scanner
  useEffect(() => {
    const keepFocus = () => {
      // Don't steal focus if user is selecting an input elsewhere
      if (document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        inputRef.current?.focus();
      }
    };

    keepFocus();
    const interval = setInterval(keepFocus, 1500);
    return () => clearInterval(interval);
  }, []);

  const handleProcessBarcode = useCallback(
    async (rawCode: string) => {
      const code = rawCode.trim();
      if (!code || isProcessing || lockRef.current) return;

      lockRef.current = true;
      setIsProcessing(true);
      setBarcodeInput('');

      try {
        // 1. Fetch parcel details first for display
        const foundParcel = await lookupParcel(code);

        // 2. Perform atomic dispatch scan
        const res = await dispatchParcelByBarcode({
          barcode: code,
          operatorName,
          operatorUserId: operatorId,
          stationId,
        });

        setLastResult(res);
        setLastParcel(foundParcel);

        // Sound & Log handling
        let logStatus: 'SUCCESS' | 'DUPLICATE' | 'ERROR' = 'ERROR';

        if (res.success) {
          logStatus = 'SUCCESS';
          if (audioEnabled) playSuccessBeep();
        } else if (res.code === 'ALREADY_DISPATCHED') {
          logStatus = 'DUPLICATE';
          if (audioEnabled) playDuplicateBeep();
        } else {
          logStatus = 'ERROR';
          if (audioEnabled) playErrorBeep();
        }

        const newLog: ScanSessionLog = {
          id: `${Date.now()}-${Math.random()}`,
          barcode: code,
          parcelId: res.parcel_id || code,
          orderId: res.order_id || foundParcel?.order_id || undefined,
          customerName: res.customer_name || foundParcel?.customer_name || undefined,
          totalQty: res.total_quantity || foundParcel?.total_quantity || 1,
          result: res,
          timestamp: new Date().toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          status: logStatus,
        };

        setSessionLogs((prev) => [newLog, ...prev.slice(0, 49)]);
      } catch (err: any) {
        if (audioEnabled) playErrorBeep();
        setLastResult({
          success: false,
          code: 'ERROR',
          message: err.message || 'Network or execution failure',
        });
      } finally {
        setIsProcessing(false);
        lockRef.current = false;
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    },
    [isProcessing, operatorName, operatorId, stationId, audioEnabled]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleProcessBarcode(barcodeInput);
    }
  };

  const handleReprint = () => {
    if (lastParcel) {
      printParcelLabels([lastParcel]);
    }
  };

  const successCount = sessionLogs.filter((l) => l.status === 'SUCCESS').length;
  const duplicateCount = sessionLogs.filter((l) => l.status === 'DUPLICATE').length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl shadow-xl relative overflow-hidden border border-indigo-900/50">
        <div className="relative z-10">
          <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold uppercase tracking-wider mb-1">
            <Radio size={14} className="animate-pulse text-emerald-400" />
            <span>Factory Hardware Scanner Terminal</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight">Factory Dispatch Scanner</h1>
          <p className="text-sm text-slate-300 mt-1 max-w-xl">
            Point USB HID or Bluetooth barcode reader at parcel label. Dispatches are atomically deducted from Factory Parcel Inventory with duplicate scan protection.
          </p>
        </div>

        {/* Station and Operator Info */}
        <div className="relative z-10 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/10 backdrop-blur-md border border-white/15 text-xs">
            <User size={14} className="text-indigo-300" />
            <span className="font-semibold text-white">{operatorName}</span>
          </div>

          <select
            value={stationId}
            onChange={(e) => setStationId(e.target.value)}
            className="px-3.5 py-2 rounded-xl bg-white/10 backdrop-blur-md border border-white/15 text-xs text-white font-semibold outline-none cursor-pointer hover:bg-white/15 transition-all"
          >
            <option value="STATION-DISPATCH-01" className="text-slate-900">Station Bay 1 (Main)</option>
            <option value="STATION-DISPATCH-02" className="text-slate-900">Station Bay 2 (Express)</option>
          </select>

          <button
            type="button"
            onClick={() => setAudioEnabled(!audioEnabled)}
            className={`p-2.5 rounded-xl border transition-all ${
              audioEnabled
                ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                : 'bg-white/10 border-white/10 text-slate-400'
            }`}
            title={audioEnabled ? 'Sound Enabled' : 'Sound Muted'}
          >
            {audioEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>
        </div>
      </div>

      {/* Main Scanner Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Barcode Reader & Scanned Card */}
        <div className="lg:col-span-7 space-y-6">
          {/* Scanner Input Box */}
          <div className="p-6 bg-white dark:bg-[#1a1a1e] border-2 border-indigo-500/30 rounded-3xl shadow-sm focus-within:border-indigo-600 focus-within:ring-4 focus-within:ring-indigo-500/10 transition-all">
            <div className="flex items-center justify-between mb-3">
              <label
                htmlFor="scanner-input"
                className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400"
              >
                <Barcode size={16} />
                <span>Scanner Active Feed</span>
              </label>
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2.5 py-0.5 rounded-full">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                <span>READY FOR SCAN</span>
              </div>
            </div>

            <div className="relative">
              <input
                id="scanner-input"
                ref={inputRef}
                type="text"
                autoComplete="off"
                placeholder="Scan parcel barcode (e.g. PAR-2026-000001)..."
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isProcessing}
                className="w-full h-14 pl-12 pr-28 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 text-lg font-mono font-bold text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-500 outline-none transition-all"
              />
              <Scan
                size={22}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-indigo-500 pointer-events-none"
              />
              <button
                type="button"
                disabled={!barcodeInput.trim() || isProcessing}
                onClick={() => handleProcessBarcode(barcodeInput)}
                className="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl font-bold text-xs shadow-sm transition-all"
              >
                {isProcessing ? 'Processing...' : 'Dispatch'}
              </button>
            </div>
            <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-2">
              Tip: Standard USB HID barcode guns automatically trigger &ldquo;Enter&rdquo; after scanning. Auto-focus is always maintained.
            </p>
          </div>

          {/* Last Scanned Result Display */}
          {lastResult ? (
            <div
              className={`p-6 rounded-3xl border transition-all ${
                lastResult.success
                  ? 'bg-emerald-50/70 dark:bg-emerald-950/20 border-emerald-500/50'
                  : lastResult.code === 'ALREADY_DISPATCHED'
                  ? 'bg-amber-50/70 dark:bg-amber-950/20 border-amber-500/50'
                  : 'bg-rose-50/70 dark:bg-rose-950/20 border-rose-500/50'
              }`}
            >
              {/* Result Status Banner */}
              <div className="flex items-start justify-between gap-4 pb-4 border-b border-black/5 dark:border-white/5">
                <div className="flex items-center gap-3">
                  {lastResult.success ? (
                    <div className="w-12 h-12 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/30">
                      <CheckCircle2 size={26} strokeWidth={2.4} />
                    </div>
                  ) : lastResult.code === 'ALREADY_DISPATCHED' ? (
                    <div className="w-12 h-12 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-lg shadow-amber-500/30">
                      <AlertOctagon size={26} strokeWidth={2.4} />
                    </div>
                  ) : (
                    <div className="w-12 h-12 rounded-2xl bg-rose-500 text-white flex items-center justify-center shadow-lg shadow-rose-500/30">
                      <AlertTriangle size={26} strokeWidth={2.4} />
                    </div>
                  )}

                  <div>
                    <span
                      className={`text-[11px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${
                        lastResult.success
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300'
                          : lastResult.code === 'ALREADY_DISPATCHED'
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300'
                          : 'bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300'
                      }`}
                    >
                      {lastResult.code}
                    </span>
                    <h3 className="text-xl font-black text-slate-900 dark:text-white mt-1">
                      {lastResult.message}
                    </h3>
                  </div>
                </div>

                {lastParcel && (
                  <button
                    type="button"
                    onClick={handleReprint}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-700 dark:text-zinc-200 bg-white dark:bg-white/10 border border-slate-200 dark:border-white/10 shadow-sm hover:bg-slate-50 transition-all"
                  >
                    <Printer size={14} />
                    <span>Reprint Label</span>
                  </button>
                )}
              </div>

              {/* Scanned Details Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 text-xs">
                <div>
                  <span className="text-slate-500 dark:text-zinc-400 block font-semibold">PARCEL ID</span>
                  <span className="text-base font-black font-mono text-slate-900 dark:text-white">
                    {lastResult.parcel_id || 'N/A'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-zinc-400 block font-semibold">ORDER ID</span>
                  <span className="text-base font-black font-mono text-indigo-600 dark:text-indigo-400">
                    {lastResult.order_id || lastParcel?.order_id || 'N/A'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-zinc-400 block font-semibold">RECIPIENT</span>
                  <span className="text-sm font-bold text-slate-900 dark:text-white truncate block">
                    {lastResult.customer_name || lastParcel?.customer_name || 'N/A'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-zinc-400 block font-semibold">STOCK MOVEMENT</span>
                  <span className="text-base font-black text-emerald-600 dark:text-emerald-400">
                    {lastResult.success ? `-${lastResult.items_deducted || 1} PCS` : '0 PCS (Blocked)'}
                  </span>
                </div>
              </div>

              {/* Items detail list */}
              {lastParcel?.items && lastParcel.items.length > 0 && (
                <div className="mt-4 pt-3 border-t border-black/5 dark:border-white/5 space-y-1">
                  <span className="text-[11px] font-bold text-slate-500 dark:text-zinc-400">
                    PACKAGED ITEMS:
                  </span>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {lastParcel.items.map((it, idx) => (
                      <span
                        key={idx}
                        className="px-2.5 py-1 rounded-lg bg-white/80 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs font-semibold text-slate-800 dark:text-zinc-200"
                      >
                        {it.product_name} {it.size ? `(${it.size})` : ''} · <strong>Qty: {it.quantity}</strong>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Empty State */
            <div className="p-12 text-center bg-white dark:bg-[#1a1a1e] border border-slate-200 dark:border-white/10 rounded-3xl space-y-3">
              <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center mx-auto text-slate-400">
                <Scan size={32} />
              </div>
              <h3 className="text-base font-bold text-slate-800 dark:text-white">
                No Parcel Scanned Yet
              </h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400 max-w-sm mx-auto">
                Scan any parcel barcode label to execute an instant dispatch and update the Factory Parcel Inventory.
              </p>
            </div>
          )}
        </div>

        {/* Right Column: Live Session Scan Stream & KPI stats */}
        <div className="lg:col-span-5 space-y-6">
          {/* Quick Metrics */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-white dark:bg-[#1a1a1e] border border-slate-200 dark:border-white/10 rounded-2xl">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-600 dark:text-emerald-400 mb-1">
                <CheckCircle2 size={16} />
                <span>Session Dispatched</span>
              </div>
              <div className="text-3xl font-black text-slate-900 dark:text-white">
                {successCount}
              </div>
            </div>

            <div className="p-4 bg-white dark:bg-[#1a1a1e] border border-slate-200 dark:border-white/10 rounded-2xl">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-600 dark:text-amber-400 mb-1">
                <AlertOctagon size={16} />
                <span>Duplicates Blocked</span>
              </div>
              <div className="text-3xl font-black text-slate-900 dark:text-white">
                {duplicateCount}
              </div>
            </div>
          </div>

          {/* Real-time Session Scan History */}
          <div className="p-5 bg-white dark:bg-[#1a1a1e] border border-slate-200 dark:border-white/10 rounded-3xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-white/10 mb-3">
              <div className="flex items-center gap-2">
                <History size={16} className="text-slate-500 dark:text-zinc-400" />
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-white">
                  Live Terminal Scan Stream
                </h4>
              </div>
              <span className="text-[11px] font-mono font-bold text-slate-400">
                {sessionLogs.length} scans
              </span>
            </div>

            {sessionLogs.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400 dark:text-zinc-500">
                Scanned packages will appear here in real-time.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
                {sessionLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-3 bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/5 rounded-xl flex items-center justify-between text-xs transition-all hover:bg-slate-100/70"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-slate-900 dark:text-white">
                          {log.parcelId}
                        </span>
                        {log.orderId && (
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-200/70 dark:bg-white/10 text-slate-600 dark:text-zinc-300">
                            {log.orderId}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-zinc-400 truncate max-w-[200px]">
                        {log.customerName || 'Package'} · {log.totalQty} pc(s)
                      </div>
                    </div>

                    <div className="text-right space-y-1">
                      <span
                        className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full inline-block ${
                          log.status === 'SUCCESS'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-400'
                            : log.status === 'DUPLICATE'
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-400'
                            : 'bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-400'
                        }`}
                      >
                        {log.status === 'SUCCESS'
                          ? 'DISPATCHED'
                          : log.status === 'DUPLICATE'
                          ? 'DUPLICATE BLOCKED'
                          : 'FAILED'}
                      </span>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {log.timestamp}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
