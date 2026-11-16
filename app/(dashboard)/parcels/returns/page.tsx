'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  RotateCcw,
  Barcode,
  PackageCheck,
  CheckCircle,
  AlertTriangle,
  AlertOctagon,
  ShieldCheck,
  ShieldAlert,
  HelpCircle,
  Sparkles,
  User,
  Radio,
  Volume2,
  VolumeX,
  History,
  Info,
  Clock,
  ArrowRight,
  Package,
} from 'lucide-react';
import { lookupParcel, receiveReturnParcel } from '@/services/parcelService';
import { playReturnChime, playDuplicateBeep, playErrorBeep } from '@/utils/scannerAudio';
import type { ParcelRecord, ParcelReturnCondition, ReturnScanResult } from '@/types/parcels';
import { useAuth } from '@/context/AuthContext';

const RETURN_CONDITIONS: Array<{
  id: ParcelReturnCondition;
  label: string;
  badge: string;
  desc: string;
  color: string;
  isRestock: boolean;
}> = [
  {
    id: 'GOOD_RESELLABLE',
    label: 'Good / Resellable',
    badge: 'RESTOCK SELLABLE',
    desc: 'Unopened or pristine condition. Restocks directly into available Factory Parcel Inventory.',
    color: 'emerald',
    isRestock: true,
  },
  {
    id: 'DAMAGED',
    label: 'Damaged / Broken',
    badge: 'QUARANTINE DAMAGED',
    desc: 'Crushed box or broken contents during courier handling. Recorded in Damaged Stock.',
    color: 'rose',
    isRestock: false,
  },
  {
    id: 'DEFECTIVE',
    label: 'Manufacturing Defect',
    badge: 'QC INVESTIGATION',
    desc: 'Production stitching/material flaw. Routed to factory quality control.',
    color: 'amber',
    isRestock: false,
  },
  {
    id: 'INCOMPLETE',
    label: 'Incomplete / Missing Items',
    badge: 'PARTIAL QUANTITY',
    desc: 'Only some items in multi-product package returned. Enter verified returned quantity.',
    color: 'purple',
    isRestock: true,
  },
  {
    id: 'WRONG_PRODUCT',
    label: 'Wrong Product Sent',
    badge: 'DISPATCH ERROR',
    desc: 'Customer received wrong item. Sent for exchange inspection.',
    color: 'blue',
    isRestock: false,
  },
  {
    id: 'NEEDS_INSPECTION',
    label: 'Needs Senior Inspection',
    badge: 'PENDING DECISION',
    desc: 'Hold in returns dock until authorized floor manager inspects.',
    color: 'slate',
    isRestock: false,
  },
];

export default function ReturnParcelScannerPage() {
  const { profile } = useAuth();
  const operatorName = profile?.name || 'Returns QC Operator';
  const operatorId = profile?.id;

  const [stationId, setStationId] = useState('STATION-RETURN-01');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);

  // Scanned parcel state
  const [activeParcel, setActiveParcel] = useState<ParcelRecord | null>(null);
  const [selectedCondition, setSelectedCondition] = useState<ParcelReturnCondition>('GOOD_RESELLABLE');
  const [returnedQty, setReturnedQty] = useState<number>(1);
  const [inspectionNotes, setInspectionNotes] = useState<string>('');

  // Results & log history
  const [lastReturnResult, setLastReturnResult] = useState<ReturnScanResult | null>(null);
  const [sessionReturns, setSessionReturns] = useState<any[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);

  // Maintain scanner input focus
  useEffect(() => {
    const keepFocus = () => {
      if (document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        inputRef.current?.focus();
      }
    };
    keepFocus();
    const interval = setInterval(keepFocus, 2000);
    return () => clearInterval(interval);
  }, [activeParcel]);

  // Lookup parcel on barcode scan
  const handleScanBarcode = async (rawCode: string) => {
    const code = rawCode.trim();
    if (!code || isSearching) return;

    setIsSearching(true);
    setBarcodeInput('');
    setLastReturnResult(null);

    try {
      const found = await lookupParcel(code);
      if (!found) {
        if (audioEnabled) playErrorBeep();
        alert(`Parcel barcode "${code}" not recognized in the system.`);
        return;
      }

      // Check if already closed/restocked
      if (found.status === 'RESTOCKED' || found.status === 'DAMAGED') {
        if (audioEnabled) playDuplicateBeep();
        alert(`Parcel ${found.parcel_id} was already processed and closed (${found.status}). Duplicate return scan blocked.`);
        return;
      }

      setActiveParcel(found);
      setReturnedQty(found.total_quantity || 1);
      setSelectedCondition('GOOD_RESELLABLE');
      setInspectionNotes('');
    } catch (err: any) {
      if (audioEnabled) playErrorBeep();
      alert(`Lookup error: ${err.message}`);
    } finally {
      setIsSearching(false);
    }
  };

  const handleConfirmReturn = async () => {
    if (!activeParcel || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const res = await receiveReturnParcel({
        barcode: activeParcel.barcode,
        condition: selectedCondition,
        returnedQty: Number(returnedQty) || 1,
        operatorName,
        operatorUserId: operatorId,
        stationId,
        notes: inspectionNotes,
      });

      setLastReturnResult(res);

      if (res.success) {
        if (audioEnabled) playReturnChime();
        setSessionReturns((prev) => [
          {
            id: `${Date.now()}`,
            parcelId: activeParcel.parcel_id,
            orderId: activeParcel.order_id,
            condition: selectedCondition,
            qty: returnedQty,
            status: res.status,
            time: new Date().toLocaleTimeString(),
          },
          ...prev,
        ]);
        setActiveParcel(null);
      } else {
        if (audioEnabled) playErrorBeep();
      }
    } catch (err: any) {
      if (audioEnabled) playErrorBeep();
      alert(`Return receiving failed: ${err.message}`);
    } finally {
      setIsSubmitting(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 bg-gradient-to-r from-slate-900 via-purple-950 to-slate-900 text-white rounded-3xl shadow-xl relative overflow-hidden border border-purple-900/50">
        <div className="relative z-10">
          <div className="flex items-center gap-2 text-purple-400 text-xs font-bold uppercase tracking-wider mb-1">
            <RotateCcw size={14} className="text-purple-400 animate-spin" style={{ animationDuration: '8s' }} />
            <span>Factory Reverse Logistics & QC Terminal</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight">Return Parcel Scanner</h1>
          <p className="text-sm text-slate-300 mt-1 max-w-xl">
            Scan returned parcels by original barcode. Inspect item condition and atomically restock eligible goods into Factory Parcel Inventory or route to damaged quarantine.
          </p>
        </div>

        {/* Station Selector */}
        <div className="relative z-10 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/10 backdrop-blur-md border border-white/15 text-xs">
            <User size={14} className="text-purple-300" />
            <span className="font-semibold text-white">{operatorName}</span>
          </div>

          <select
            value={stationId}
            onChange={(e) => setStationId(e.target.value)}
            className="px-3.5 py-2 rounded-xl bg-white/10 backdrop-blur-md border border-white/15 text-xs text-white font-semibold outline-none cursor-pointer hover:bg-white/15 transition-all"
          >
            <option value="STATION-RETURN-01" className="text-slate-900">Dock 1 (Main Returns)</option>
            <option value="STATION-RETURN-02" className="text-slate-900">QC Inspection Table</option>
          </select>

          <button
            type="button"
            onClick={() => setAudioEnabled(!audioEnabled)}
            className={`p-2.5 rounded-xl border transition-all ${
              audioEnabled
                ? 'bg-purple-500/20 border-purple-500/40 text-purple-300'
                : 'bg-white/10 border-white/10 text-slate-400'
            }`}
            title={audioEnabled ? 'Sound Enabled' : 'Sound Muted'}
          >
            {audioEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>
        </div>
      </div>

      {/* Main Scanner Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Barcode Reader & Inspection Form */}
        <div className="lg:col-span-8 space-y-6">
          {/* Barcode Scanner Input */}
          <div className="p-6 bg-white dark:bg-[#1a1a1e] border-2 border-purple-500/30 rounded-3xl shadow-sm focus-within:border-purple-600 focus-within:ring-4 focus-within:ring-purple-500/10 transition-all">
            <div className="flex items-center justify-between mb-3">
              <label
                htmlFor="return-scanner-input"
                className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-purple-600 dark:text-purple-400"
              >
                <Barcode size={16} />
                <span>Return Barcode Reader</span>
              </label>
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-500/10 px-2.5 py-0.5 rounded-full">
                <span className="w-2 h-2 rounded-full bg-purple-500 animate-ping" />
                <span>READY FOR RETURN SCAN</span>
              </div>
            </div>

            <div className="relative">
              <input
                id="return-scanner-input"
                ref={inputRef}
                type="text"
                autoComplete="off"
                placeholder="Scan returned barcode label on package..."
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleScanBarcode(barcodeInput);
                  }
                }}
                disabled={isSearching}
                className="w-full h-14 pl-12 pr-28 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 text-lg font-mono font-bold text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-500 outline-none transition-all"
              />
              <RotateCcw
                size={22}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-purple-500 pointer-events-none"
              />
              <button
                type="button"
                disabled={!barcodeInput.trim() || isSearching}
                onClick={() => handleScanBarcode(barcodeInput)}
                className="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white rounded-xl font-bold text-xs shadow-sm transition-all"
              >
                {isSearching ? 'Looking up...' : 'Lookup'}
              </button>
            </div>
          </div>

          {/* Active Return Inspection Form */}
          {activeParcel ? (
            <div className="p-6 bg-white dark:bg-[#1a1a1e] border-2 border-purple-500/40 rounded-3xl shadow-lg space-y-6">
              {/* Parcel Header Information */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-white/10">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xl font-black text-slate-900 dark:text-white">
                      {activeParcel.parcel_id}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/30">
                      ORDER: {activeParcel.order_id || 'N/A'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
                    Customer: <strong>{activeParcel.customer_name}</strong> · Phone: {activeParcel.customer_phone || 'N/A'}
                  </p>
                </div>

                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">CURRENT STATUS</span>
                  <span className="text-sm font-black text-amber-600 dark:text-amber-400">
                    {activeParcel.status}
                  </span>
                </div>
              </div>

              {/* Packaged Items */}
              <div>
                <label className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400 block mb-2">
                  Original Packaged Items
                </label>
                <div className="space-y-2">
                  {(activeParcel.items || []).map((it, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/5 rounded-xl flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-bold text-slate-900 dark:text-white">
                          {it.product_name} {it.size ? `(${it.size})` : ''}
                        </div>
                        <div className="font-mono text-[11px] text-slate-500 dark:text-zinc-400">
                          SKU: {it.sku}
                        </div>
                      </div>
                      <span className="font-mono font-bold text-sm px-2.5 py-1 rounded-lg bg-white dark:bg-white/10 border border-slate-200 dark:border-white/10">
                        Qty: {it.quantity}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Inspection Condition Selector */}
              <div>
                <label className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400 block mb-2.5">
                  Select Return Condition & Action
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {RETURN_CONDITIONS.map((cond) => {
                    const isSelected = selectedCondition === cond.id;
                    return (
                      <button
                        key={cond.id}
                        type="button"
                        onClick={() => setSelectedCondition(cond.id)}
                        className={`p-3.5 rounded-2xl border text-left transition-all relative ${
                          isSelected
                            ? 'bg-purple-50/60 dark:bg-purple-500/10 border-purple-500 ring-2 ring-purple-500 text-purple-900 dark:text-white'
                            : 'bg-white dark:bg-white/[0.02] border-slate-200 dark:border-white/10 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold text-xs text-slate-900 dark:text-white">
                            {cond.label}
                          </span>
                          <span
                            className={`text-[9px] font-black tracking-wider px-2 py-0.5 rounded-full ${
                              cond.isRestock
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300'
                                : 'bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300'
                            }`}
                          >
                            {cond.badge}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-tight">
                          {cond.desc}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Quantity input & Inspection Notes */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 block mb-1">
                    Verified Returned Qty
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={activeParcel.total_quantity || 99}
                    value={returnedQty}
                    onChange={(e) => setReturnedQty(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full h-11 px-3 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.02] text-sm font-bold text-slate-900 dark:text-white outline-none"
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    Original total was {activeParcel.total_quantity} pcs
                  </span>
                </div>

                <div className="md:col-span-2">
                  <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 block mb-1">
                    QC Inspection Notes (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Courier plastic intact, packaging unopened..."
                    value={inspectionNotes}
                    onChange={(e) => setInspectionNotes(e.target.value)}
                    className="w-full h-11 px-3.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.02] text-xs text-slate-900 dark:text-white outline-none"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-white/10">
                <button
                  type="button"
                  onClick={() => setActiveParcel(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                >
                  Cancel / Clear Scan
                </button>

                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleConfirmReturn}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 shadow-lg shadow-purple-500/25 transition-all disabled:opacity-50"
                >
                  {isSubmitting ? (
                    'Recording Return...'
                  ) : (
                    <>
                      <PackageCheck size={16} />
                      <span>Confirm Return & Update Inventory</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : lastReturnResult ? (
            /* Return Completed Banner */
            <div className="p-6 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-500/40 rounded-3xl space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center shadow-md">
                  <CheckCircle size={22} />
                </div>
                <div>
                  <h4 className="text-base font-bold text-slate-900 dark:text-white">
                    {lastReturnResult.message}
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">
                    Restocked: <strong>{lastReturnResult.restocked_quantity || 0} pcs</strong> · Damaged: <strong>{lastReturnResult.damaged_quantity || 0} pcs</strong>
                  </p>
                </div>
              </div>
            </div>
          ) : (
            /* Empty State */
            <div className="p-12 text-center bg-white dark:bg-[#1a1a1e] border border-slate-200 dark:border-white/10 rounded-3xl space-y-3">
              <div className="w-16 h-16 rounded-full bg-purple-50 dark:bg-purple-500/10 flex items-center justify-center mx-auto text-purple-600 dark:text-purple-400">
                <RotateCcw size={32} />
              </div>
              <h3 className="text-base font-bold text-slate-800 dark:text-white">
                No Return Scanned Yet
              </h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400 max-w-sm mx-auto">
                Scan the original barcode on any returned box to retrieve its order journey and inspect condition.
              </p>
            </div>
          )}
        </div>

        {/* Right Column: Return Session Log & Quick Guide */}
        <div className="lg:col-span-4 space-y-6">
          {/* Session Returns Log */}
          <div className="p-5 bg-white dark:bg-[#1a1a1e] border border-slate-200 dark:border-white/10 rounded-3xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-white/10 mb-3">
              <div className="flex items-center gap-2">
                <History size={16} className="text-slate-500 dark:text-zinc-400" />
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-white">
                  Session Returns Log
                </h4>
              </div>
              <span className="text-[11px] font-mono font-bold text-purple-600 dark:text-purple-400">
                {sessionReturns.length} returned
              </span>
            </div>

            {sessionReturns.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400 dark:text-zinc-500">
                Processed returns in this session will be recorded here.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
                {sessionReturns.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/5 rounded-xl flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-mono font-bold text-slate-900 dark:text-white">
                        {item.parcelId}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-zinc-400">
                        {item.condition} · <strong>{item.qty} pc(s)</strong>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300">
                        {item.status}
                      </span>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                        {item.time}
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
