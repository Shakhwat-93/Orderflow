'use client';

import React, { useEffect, useState } from 'react';
import {
  X,
  Package,
  Barcode,
  Truck,
  RotateCcw,
  CheckCircle2,
  Clock,
  MapPin,
  User,
  Printer,
  History,
  AlertTriangle,
  ArrowRight,
  Layers,
  Calendar,
  Phone,
  ShieldCheck,
} from 'lucide-react';
import { getParcelDetails } from '@/services/parcelService';
import { printParcelLabels } from './parcelPrintUtils';
import { generateCode128Svg } from '@/utils/barcodeGenerator';
import type {
  ParcelRecord,
  ParcelScanEvent,
  ParcelReturnRecord,
  ParcelInventoryTransaction,
} from '@/types/parcels';

interface ParcelDetailsModalProps {
  parcelId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export const ParcelDetailsModal: React.FC<ParcelDetailsModalProps> = ({
  parcelId,
  isOpen,
  onClose,
}) => {
  const [loading, setLoading] = useState(true);
  const [parcel, setParcel] = useState<ParcelRecord | null>(null);
  const [scanEvents, setScanEvents] = useState<ParcelScanEvent[]>([]);
  const [returns, setReturns] = useState<ParcelReturnRecord[]>([]);
  const [transactions, setTransactions] = useState<ParcelInventoryTransaction[]>([]);
  const [activeTab, setActiveTab] = useState<'journey' | 'items' | 'scans' | 'ledger'>('journey');

  useEffect(() => {
    if (!isOpen || !parcelId) return;

    let mounted = true;
    setLoading(true);

    getParcelDetails(parcelId)
      .then((data) => {
        if (!mounted) return;
        setParcel(data.parcel);
        setScanEvents(data.scanEvents);
        setReturns(data.returns);
        setTransactions(data.transactions);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [isOpen, parcelId]);

  if (!isOpen || !parcelId) return null;

  const handlePrintLabel = () => {
    if (parcel) {
      printParcelLabels([parcel]);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'CREATED':
      case 'PACKED':
        return 'bg-blue-50 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300 border-blue-200';
      case 'DISPATCHED':
      case 'IN TRANSIT':
        return 'bg-amber-50 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300 border-amber-200';
      case 'DELIVERED':
      case 'RESTOCKED':
        return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300 border-emerald-200';
      case 'DAMAGED':
      case 'QUARANTINED':
      case 'LOST':
        return 'bg-rose-50 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300 border-rose-200';
      case 'RETURN RECEIVED':
      case 'UNDER INSPECTION':
        return 'bg-purple-50 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300 border-purple-200';
      default:
        return 'bg-slate-50 text-slate-700 dark:bg-zinc-800 dark:text-zinc-300 border-slate-200';
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl bg-white dark:bg-[#1a1a1e] border border-slate-200 dark:border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Top Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-white/10 bg-slate-50/60 dark:bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <Package size={20} strokeWidth={2.2} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black font-mono text-slate-900 dark:text-white">
                  {parcelId}
                </h3>
                {parcel && (
                  <span
                    className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${getStatusColor(
                      parcel.status
                    )}`}
                  >
                    {parcel.status}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                Order Reference:{' '}
                <strong className="text-slate-800 dark:text-zinc-200">
                  {parcel?.order_id || 'N/A'}
                </strong>{' '}
                · Location: {parcel?.current_location || 'Factory'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {parcel && (
              <button
                type="button"
                onClick={handlePrintLabel}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-700 dark:text-zinc-200 bg-white dark:bg-white/10 border border-slate-200 dark:border-white/10 hover:bg-slate-50 transition-all shadow-sm"
              >
                <Printer size={13} />
                <span>Thermal Label</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Modal Tab Switcher */}
        <div className="flex items-center gap-1 px-6 border-b border-slate-100 dark:border-white/10 bg-white dark:bg-[#1a1a1e] text-xs font-bold">
          <button
            onClick={() => setActiveTab('journey')}
            className={`py-3 px-3 border-b-2 transition-all ${
              activeTab === 'journey'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 dark:text-zinc-400 hover:text-slate-900'
            }`}
          >
            Lifecycle Journey
          </button>
          <button
            onClick={() => setActiveTab('items')}
            className={`py-3 px-3 border-b-2 transition-all ${
              activeTab === 'items'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 dark:text-zinc-400 hover:text-slate-900'
            }`}
          >
            Packaged Items ({(parcel?.items || []).length})
          </button>
          <button
            onClick={() => setActiveTab('scans')}
            className={`py-3 px-3 border-b-2 transition-all ${
              activeTab === 'scans'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 dark:text-zinc-400 hover:text-slate-900'
            }`}
          >
            Barcode Scan Log ({scanEvents.length})
          </button>
          <button
            onClick={() => setActiveTab('ledger')}
            className={`py-3 px-3 border-b-2 transition-all ${
              activeTab === 'ledger'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 dark:text-zinc-400 hover:text-slate-900'
            }`}
          >
            Inventory Movement Ledger ({transactions.length})
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {loading ? (
            <div className="py-20 text-center text-xs text-slate-400 dark:text-zinc-500">
              Loading complete parcel history...
            </div>
          ) : !parcel ? (
            <div className="py-20 text-center text-xs text-slate-500">
              Parcel not found in system.
            </div>
          ) : (
            <>
              {/* TAB 1: JOURNEY TIMELINE */}
              {activeTab === 'journey' && (
                <div className="space-y-6">
                  {/* Embedded Barcode preview */}
                  <div className="p-4 bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/10 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4">
                    <div className="overflow-x-auto max-w-full">
                      <div
                        dangerouslySetInnerHTML={{
                          __html: generateCode128Svg(parcel.barcode, {
                            height: 40,
                            includeText: true,
                            width: 1.8,
                          }),
                        }}
                      />
                    </div>
                    <div className="text-right text-xs space-y-1">
                      <span className="text-slate-400 font-mono text-[11px] block">
                        BARCODE VALUE
                      </span>
                      <span className="font-mono font-bold text-slate-800 dark:text-white text-sm">
                        {parcel.barcode}
                      </span>
                      <span className="text-slate-500 dark:text-zinc-400 block text-[11px]">
                        Format: Code 128 (100% Thermal Printer Verified)
                      </span>
                    </div>
                  </div>

                  {/* Customer and Recipient Summary */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                    <div className="p-3.5 bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/5 rounded-xl space-y-1">
                      <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                        Recipient Customer
                      </span>
                      <div className="font-bold text-slate-900 dark:text-white text-sm">
                        {parcel.customer_name || 'N/A'}
                      </div>
                      <div className="text-slate-600 dark:text-zinc-400 font-mono">
                        📞 {parcel.customer_phone || 'N/A'}
                      </div>
                    </div>

                    <div className="p-3.5 bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/5 rounded-xl space-y-1">
                      <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                        Delivery Address
                      </span>
                      <div className="font-medium text-slate-800 dark:text-zinc-300 line-clamp-2">
                        {parcel.customer_address || 'N/A'}
                      </div>
                      <div className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400">
                        {parcel.shipping_zone || 'Standard Shipping'}
                      </div>
                    </div>

                    <div className="p-3.5 bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/5 rounded-xl space-y-1">
                      <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                        Courier & Tracking
                      </span>
                      <div className="font-bold text-slate-900 dark:text-white text-sm">
                        {parcel.courier_name || 'Factory Dispatch'}
                      </div>
                      <div className="text-slate-500 font-mono text-[11px]">
                        Tracking ID: {parcel.courier_tracking_id || 'Pending Courier Pickup'}
                      </div>
                    </div>
                  </div>

                  {/* Visual Journey Timeline */}
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-zinc-300 mb-4">
                      Physical Parcel Journey
                    </h4>
                    <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 dark:before:bg-white/10">
                      {/* Step 1: Created */}
                      <div className="relative">
                        <div className="absolute -left-[27px] top-0 w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-md">
                          <CheckCircle2 size={14} />
                        </div>
                        <div className="space-y-0.5">
                          <div className="text-xs font-bold text-slate-900 dark:text-white">
                            Parcel Created & Barcode Assigned
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                            Created by {parcel.created_by || 'System'} on{' '}
                            {new Date(parcel.created_at).toLocaleString('en-GB')}
                          </p>
                        </div>
                      </div>

                      {/* Step 2: Dispatched */}
                      {parcel.dispatched_at && (
                        <div className="relative">
                          <div className="absolute -left-[27px] top-0 w-6 h-6 rounded-full bg-amber-500 text-white flex items-center justify-center shadow-md">
                            <Truck size={13} />
                          </div>
                          <div className="space-y-0.5">
                            <div className="text-xs font-bold text-slate-900 dark:text-white">
                              Factory Dispatch Scan Completed
                            </div>
                            <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                              Dispatched by {parcel.dispatched_by || 'Operator'} on{' '}
                              {new Date(parcel.dispatched_at).toLocaleString('en-GB')} via{' '}
                              {parcel.last_scanner_station || 'Bay 1'}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Step 3: Returns if any */}
                      {returns.map((ret, idx) => (
                        <div key={idx} className="relative">
                          <div className="absolute -left-[27px] top-0 w-6 h-6 rounded-full bg-purple-500 text-white flex items-center justify-center shadow-md">
                            <RotateCcw size={13} />
                          </div>
                          <div className="space-y-0.5">
                            <div className="text-xs font-bold text-slate-900 dark:text-white">
                              Return Received & Inspected ({ret.return_condition})
                            </div>
                            <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                              Inspected by {ret.inspected_by} on{' '}
                              {new Date(ret.created_at).toLocaleString('en-GB')} · Action:{' '}
                              <strong>{ret.action_taken}</strong> (Restocked: {ret.restocked_quantity}, Damaged: {ret.damaged_quantity})
                            </p>
                            {ret.inspection_notes && (
                              <p className="text-[11px] text-purple-700 dark:text-purple-300 italic pt-0.5">
                                &ldquo;{ret.inspection_notes}&rdquo;
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: PACKAGED ITEMS */}
              {activeTab === 'items' && (
                <div className="space-y-3">
                  {(parcel.items || []).map((it, idx) => (
                    <div
                      key={idx}
                      className="p-4 bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/5 rounded-2xl flex items-center justify-between text-xs"
                    >
                      <div className="space-y-1">
                        <div className="text-sm font-bold text-slate-900 dark:text-white">
                          {it.product_name} {it.size ? `(${it.size})` : ''}
                        </div>
                        <div className="font-mono text-slate-500 dark:text-zinc-400">
                          SKU: <strong className="text-slate-800 dark:text-zinc-200">{it.sku}</strong>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono font-bold text-base text-indigo-600 dark:text-indigo-400">
                          {it.quantity} PCS
                        </div>
                        <div className="text-[11px] text-slate-400">
                          ৳{Number(it.unit_price || 0).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* TAB 3: SCAN EVENTS */}
              {activeTab === 'scans' && (
                <div className="space-y-2.5">
                  {scanEvents.length === 0 ? (
                    <div className="py-12 text-center text-xs text-slate-400">
                      No scan events recorded yet.
                    </div>
                  ) : (
                    scanEvents.map((ev) => (
                      <div
                        key={ev.id}
                        className="p-3 bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/5 rounded-xl flex items-center justify-between text-xs"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 dark:text-white">
                              {ev.event_type}
                            </span>
                            <span
                              className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                                ev.scan_result === 'SUCCESS'
                                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-400'
                                  : ev.scan_result === 'BLOCKED_DUPLICATE'
                                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-400'
                                  : 'bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-400'
                              }`}
                            >
                              {ev.scan_result}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
                            Operator: {ev.operator_name || 'Staff'} · Station: {ev.station_id || 'Main'}
                          </div>
                          {ev.notes && (
                            <div className="text-[10px] text-slate-400 mt-0.5 italic">
                              {ev.notes}
                            </div>
                          )}
                        </div>
                        <div className="text-[11px] font-mono text-slate-400">
                          {new Date(ev.scanned_at).toLocaleString('en-GB')}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* TAB 4: INVENTORY TRANSACTIONS */}
              {activeTab === 'ledger' && (
                <div className="space-y-2.5">
                  {transactions.length === 0 ? (
                    <div className="py-12 text-center text-xs text-slate-400">
                      No stock movement transactions recorded yet for this parcel.
                    </div>
                  ) : (
                    transactions.map((tx) => (
                      <div
                        key={tx.id}
                        className="p-3 bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/5 rounded-xl flex items-center justify-between text-xs"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-slate-900 dark:text-white">
                              {tx.transaction_id}
                            </span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-zinc-200">
                              {tx.movement_type}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-zinc-400">
                            SKU: <strong>{tx.sku}</strong> · By: {tx.operator_name || 'System'}
                          </div>
                        </div>

                        <div className="text-right">
                          <div
                            className={`font-mono font-black text-sm ${
                              tx.quantity < 0
                                ? 'text-rose-600 dark:text-rose-400'
                                : 'text-emerald-600 dark:text-emerald-400'
                            }`}
                          >
                            {tx.quantity > 0 ? `+${tx.quantity}` : tx.quantity} PCS
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            Stock: {tx.previous_stock} → {tx.new_stock}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
