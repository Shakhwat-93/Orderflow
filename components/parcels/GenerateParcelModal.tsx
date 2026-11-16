'use client';

import React, { useState } from 'react';
import {
  Package,
  Layers,
  X,
  Printer,
  CheckCircle,
  AlertCircle,
  Loader2,
  Barcode,
  Truck,
  ArrowRight,
} from 'lucide-react';
import { createParcelsFromOrder } from '@/services/parcelService';
import { printParcelLabels } from './parcelPrintUtils';
import type { ParcelRecord } from '@/types/parcels';
import type { Order } from '@/types/api';
import { extractProductDetails } from '@/components/PrintSystem/printUtils';

interface GenerateParcelModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: Order | any;
  onParcelCreated?: (parcels: ParcelRecord[]) => void;
}

export const GenerateParcelModal: React.FC<GenerateParcelModalProps> = ({
  isOpen,
  onClose,
  order,
  onParcelCreated,
}) => {
  const [splitMode, setSplitMode] = useState<'single' | 'multi_box'>('single');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdParcels, setCreatedParcels] = useState<ParcelRecord[] | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen || !order) return null;

  const items = extractProductDetails(order);

  const handleGenerate = async () => {
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const result = await createParcelsFromOrder(order, splitMode);
      setCreatedParcels(result);
      if (onParcelCreated) {
        onParcelCreated(result);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to generate parcels for this order');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePrint = () => {
    if (createdParcels && createdParcels.length > 0) {
      printParcelLabels(createdParcels, { companyName: 'CANVAS ORDER' });
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-white dark:bg-[#1a1a1e] border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <Package size={20} strokeWidth={2.2} />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Generate Parcel & Barcode
              </h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                Order <span className="font-semibold text-slate-700 dark:text-zinc-200">{order.id}</span> · {order.customer_name}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 overflow-y-auto space-y-5">
          {createdParcels ? (
            /* Success State */
            <div className="space-y-4 py-2 text-center">
              <div className="w-14 h-14 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center">
                <CheckCircle size={32} />
              </div>
              <div>
                <h4 className="text-lg font-bold text-slate-900 dark:text-white">
                  {createdParcels.length} Parcel{createdParcels.length > 1 ? 's' : ''} Created!
                </h4>
                <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">
                  Unique Parcel IDs and Code 128 barcodes have been registered.
                </p>
              </div>

              {/* Created parcels pill cards */}
              <div className="space-y-2 mt-4 text-left max-h-48 overflow-y-auto pr-1">
                {createdParcels.map((p) => (
                  <div
                    key={p.parcel_id}
                    className="p-3 bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-xl flex items-center justify-between"
                  >
                    <div>
                      <div className="font-mono font-bold text-sm text-indigo-600 dark:text-indigo-400">
                        {p.parcel_id}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-zinc-400">
                        Barcode: <span className="font-mono">{p.barcode}</span> · {p.total_quantity} item(s)
                      </div>
                    </div>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30">
                      READY TO SCAN
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* Creation Form */
            <>
              {errorMsg && (
                <div className="p-3.5 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 rounded-xl text-rose-700 dark:text-rose-400 text-xs flex items-center gap-2.5">
                  <AlertCircle size={16} className="shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Items in order */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 block mb-2">
                  Order Items ({items.length})
                </label>
                <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                  {items.map((it, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/5 rounded-lg flex items-center justify-between text-xs"
                    >
                      <div className="font-medium text-slate-800 dark:text-zinc-200">
                        {it.name} {it.size ? `(${it.size})` : ''}
                      </div>
                      <div className="font-bold text-slate-600 dark:text-zinc-300">
                        Qty: {it.quantity}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Packaging Split Strategy */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 block mb-2">
                  Packaging & Parcel Strategy
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setSplitMode('single')}
                    className={`p-3.5 rounded-xl border text-left transition-all ${
                      splitMode === 'single'
                        ? 'bg-indigo-50/60 dark:bg-indigo-500/10 border-indigo-500 text-indigo-900 dark:text-white shadow-sm ring-1 ring-indigo-500'
                        : 'bg-white dark:bg-white/[0.02] border-slate-200 dark:border-white/10 text-slate-700 dark:text-zinc-300 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Package size={16} className="text-indigo-600 dark:text-indigo-400" />
                      <span className="font-bold text-xs">Single Parcel</span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-tight">
                      All items packed into 1 physical package & 1 barcode.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSplitMode('multi_box')}
                    className={`p-3.5 rounded-xl border text-left transition-all ${
                      splitMode === 'multi_box'
                        ? 'bg-indigo-50/60 dark:bg-indigo-500/10 border-indigo-500 text-indigo-900 dark:text-white shadow-sm ring-1 ring-indigo-500'
                        : 'bg-white dark:bg-white/[0.02] border-slate-200 dark:border-white/10 text-slate-700 dark:text-zinc-300 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Layers size={16} className="text-indigo-600 dark:text-indigo-400" />
                      <span className="font-bold text-xs">Multi-Box Split</span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-tight">
                      Separate parcel & barcode per line item (Partial dispatch).
                    </p>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-slate-50/80 dark:bg-white/[0.02] border-t border-slate-100 dark:border-white/10 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-zinc-300 hover:bg-slate-200/60 dark:hover:bg-white/10 transition-colors"
          >
            {createdParcels ? 'Close' : 'Cancel'}
          </button>

          {createdParcels ? (
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-500/25 transition-all"
            >
              <Printer size={15} />
              <span>Print Barcode Label{createdParcels.length > 1 ? 's' : ''}</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleGenerate}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 shadow-md shadow-indigo-500/25 transition-all"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  <span>Generating...</span>
                </>
              ) : (
                <>
                  <Barcode size={15} />
                  <span>Generate Parcel Barcode</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
