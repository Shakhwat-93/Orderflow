'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Package,
  Layers,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  History,
  Plus,
  RefreshCw,
  Search,
  Filter,
  CheckCircle,
  FileSpreadsheet,
  ArrowDownRight,
  ArrowUpRight,
  SlidersHorizontal,
} from 'lucide-react';
import {
  getParcelInventory,
  getParcelInventoryTransactions,
  adjustParcelInventoryStock,
} from '@/services/parcelService';
import type { ParcelInventory, ParcelInventoryTransaction } from '@/types/parcels';
import { useAuth } from '@/context/AuthContext';

export default function FactoryParcelInventoryPage() {
  const { profile } = useAuth();
  const operatorName = profile?.name || 'Inventory Manager';

  const [activeTab, setActiveTab] = useState<'balances' | 'ledger'>('balances');
  const [inventoryList, setInventoryList] = useState<ParcelInventory[]>([]);
  const [ledgerTransactions, setLedgerTransactions] = useState<ParcelInventoryTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [ledgerFilter, setLedgerFilter] = useState('ALL');

  // Adjustment Modal
  const [isAdjModalOpen, setIsAdjModalOpen] = useState(false);
  const [adjSku, setAdjSku] = useState('');
  const [adjProduct, setAdjProduct] = useState('');
  const [adjQty, setAdjQty] = useState<number>(0);
  const [adjType, setAdjType] = useState<'OPENING_STOCK' | 'STOCK_ADJUSTMENT'>('OPENING_STOCK');
  const [adjNotes, setAdjNotes] = useState('');
  const [isSubmittingAdj, setIsSubmittingAdj] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [inv, txs] = await Promise.all([
        getParcelInventory(),
        getParcelInventoryTransactions(150),
      ]);
      setInventoryList(inv);
      setLedgerTransactions(txs);
    } catch (err) {
      console.error('Failed to load parcel inventory data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSaveAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjSku.trim() || !adjProduct.trim() || adjQty === 0) {
      alert('Please fill out SKU, Product Name, and a non-zero quantity.');
      return;
    }

    setIsSubmittingAdj(true);
    try {
      await adjustParcelInventoryStock({
        sku: adjSku.trim().toUpperCase(),
        productName: adjProduct.trim(),
        adjustmentQty: Number(adjQty),
        movementType: adjType,
        operatorName,
        note: adjNotes,
      });

      setIsAdjModalOpen(false);
      setAdjSku('');
      setAdjProduct('');
      setAdjQty(0);
      setAdjNotes('');
      await loadData();
    } catch (err: any) {
      alert(`Adjustment error: ${err.message}`);
    } finally {
      setIsSubmittingAdj(false);
    }
  };

  // Filtered Stock Items
  const filteredInventory = inventoryList.filter((item) => {
    const q = searchQuery.toLowerCase();
    return (
      item.sku.toLowerCase().includes(q) ||
      item.product_name.toLowerCase().includes(q)
    );
  });

  // Filtered Transactions
  const filteredLedger = ledgerTransactions.filter((tx) => {
    if (ledgerFilter !== 'ALL' && tx.movement_type !== ledgerFilter) return false;
    const q = searchQuery.toLowerCase();
    return (
      tx.sku.toLowerCase().includes(q) ||
      tx.product_name.toLowerCase().includes(q) ||
      tx.transaction_id.toLowerCase().includes(q) ||
      (tx.parcel_id && tx.parcel_id.toLowerCase().includes(q))
    );
  });

  // Totals
  const totalStock = inventoryList.reduce((acc, it) => acc + it.current_stock, 0);
  const totalDispatched = inventoryList.reduce((acc, it) => acc + it.dispatched_stock, 0);
  const totalReturned = inventoryList.reduce((acc, it) => acc + it.returned_stock, 0);
  const totalDamaged = inventoryList.reduce((acc, it) => acc + it.damaged_stock, 0);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 text-xs font-bold uppercase tracking-wider mb-1">
            <span className="w-2 h-2 rounded-full bg-indigo-500" />
            <span>Independent Module · Separate Ledger</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            Factory Parcel Inventory
          </h1>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 max-w-2xl">
            Autonomous stock ledger dedicated to barcode-based parcel dispatches, returns, and damaged stock. Completely isolated from the classic inventory system.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={loadData}
            className="p-2.5 rounded-xl border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/5 text-slate-600 dark:text-zinc-300 transition-colors"
            title="Refresh Stock Data"
          >
            <RefreshCw size={15} />
          </button>

          <button
            type="button"
            onClick={() => setIsAdjModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-500/25 transition-all"
          >
            <Plus size={15} />
            <span>Adjust / Opening Stock</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 bg-white dark:bg-[#1a1a1e] border border-slate-200 dark:border-white/10 rounded-2xl">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-zinc-400 mb-1">
            <Package size={15} />
            <span>Available Stock</span>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white font-mono">
            {totalStock} <span className="text-xs font-sans text-slate-400 font-bold">PCS</span>
          </div>
        </div>

        <div className="p-4 bg-white dark:bg-[#1a1a1e] border border-slate-200 dark:border-white/10 rounded-2xl">
          <div className="flex items-center gap-2 text-xs font-bold text-amber-600 dark:text-amber-400 mb-1">
            <TrendingDown size={15} />
            <span>Total Dispatched</span>
          </div>
          <div className="text-2xl font-black text-amber-600 dark:text-amber-400 font-mono">
            {totalDispatched} <span className="text-xs font-sans text-slate-400 font-bold">PCS</span>
          </div>
        </div>

        <div className="p-4 bg-white dark:bg-[#1a1a1e] border border-slate-200 dark:border-white/10 rounded-2xl">
          <div className="flex items-center gap-2 text-xs font-bold text-purple-600 dark:text-purple-400 mb-1">
            <TrendingUp size={15} />
            <span>Total Returned</span>
          </div>
          <div className="text-2xl font-black text-purple-600 dark:text-purple-400 font-mono">
            {totalReturned} <span className="text-xs font-sans text-slate-400 font-bold">PCS</span>
          </div>
        </div>

        <div className="p-4 bg-white dark:bg-[#1a1a1e] border border-slate-200 dark:border-white/10 rounded-2xl">
          <div className="flex items-center gap-2 text-xs font-bold text-rose-600 dark:text-rose-400 mb-1">
            <AlertTriangle size={15} />
            <span>Damaged / Quarantined</span>
          </div>
          <div className="text-2xl font-black text-rose-600 dark:text-rose-400 font-mono">
            {totalDamaged} <span className="text-xs font-sans text-slate-400 font-bold">PCS</span>
          </div>
        </div>
      </div>

      {/* Main Switcher & Filters */}
      <div className="p-4 bg-white dark:bg-[#1a1a1e] border border-slate-200 dark:border-white/10 rounded-3xl shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Tab buttons */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-white/5 rounded-xl w-fit">
            <button
              type="button"
              onClick={() => setActiveTab('balances')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'balances'
                  ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-zinc-400 hover:text-slate-900'
              }`}
            >
              Current SKU Stock Balances
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('ledger')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'ledger'
                  ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-zinc-400 hover:text-slate-900'
              }`}
            >
              Immutable Movement Ledger ({ledgerTransactions.length})
            </button>
          </div>

          {/* Search bar & Ledger movement filter */}
          <div className="flex items-center gap-3 flex-1 md:justify-end">
            <div className="relative w-full md:w-64">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search SKU or product..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-9 pl-9 pr-3 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.02] text-xs outline-none"
              />
            </div>

            {activeTab === 'ledger' && (
              <select
                value={ledgerFilter}
                onChange={(e) => setLedgerFilter(e.target.value)}
                className="h-9 px-3 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.02] text-xs font-bold outline-none cursor-pointer"
              >
                <option value="ALL">All Movements</option>
                <option value="FACTORY_DISPATCH">Factory Dispatch (-)</option>
                <option value="RESTOCKED">Restocked (+)</option>
                <option value="DAMAGED_STOCK">Damaged Quarantine</option>
                <option value="OPENING_STOCK">Opening Stock</option>
                <option value="STOCK_ADJUSTMENT">Adjustment</option>
              </select>
            )}
          </div>
        </div>

        {/* Tab Content: SKU Balances */}
        {activeTab === 'balances' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-100 dark:border-white/10 text-slate-400 text-[10px] font-black uppercase tracking-wider">
                  <th className="py-3 px-3">SKU</th>
                  <th className="py-3 px-3">Product Name</th>
                  <th className="py-3 px-3 text-right">Available Stock</th>
                  <th className="py-3 px-3 text-right">Dispatched</th>
                  <th className="py-3 px-3 text-right">Returned</th>
                  <th className="py-3 px-3 text-right">Damaged/Quarantine</th>
                  <th className="py-3 px-3 text-right">Last Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      Loading Factory Parcel Inventory...
                    </td>
                  </tr>
                ) : filteredInventory.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      No stock records found. Use &ldquo;Adjust / Opening Stock&rdquo; to initialize SKUs.
                    </td>
                  </tr>
                ) : (
                  filteredInventory.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/70 dark:hover:bg-white/[0.02]">
                      <td className="py-3 px-3 font-mono font-bold text-slate-900 dark:text-white">
                        {item.sku}
                      </td>
                      <td className="py-3 px-3 font-semibold text-slate-800 dark:text-zinc-200">
                        {item.product_name}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-black text-sm text-emerald-600 dark:text-emerald-400">
                        {item.current_stock}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-amber-600 dark:text-amber-400">
                        {item.dispatched_stock}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-purple-600 dark:text-purple-400">
                        {item.returned_stock}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-rose-600 dark:text-rose-400">
                        {item.damaged_stock + item.quarantined_stock}
                      </td>
                      <td className="py-3 px-3 text-right text-[11px] font-mono text-slate-400">
                        {item.updated_at
                          ? new Date(item.updated_at).toLocaleDateString('en-GB')
                          : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab Content: Movement Ledger */}
        {activeTab === 'ledger' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-100 dark:border-white/10 text-slate-400 text-[10px] font-black uppercase tracking-wider">
                  <th className="py-3 px-3">Transaction ID</th>
                  <th className="py-3 px-3">Parcel / Order</th>
                  <th className="py-3 px-3">SKU & Product</th>
                  <th className="py-3 px-3">Type</th>
                  <th className="py-3 px-3 text-right">Movement Qty</th>
                  <th className="py-3 px-3 text-right">Previous → New</th>
                  <th className="py-3 px-3">Operator & Station</th>
                  <th className="py-3 px-3 text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400">
                      Loading inventory movement ledger...
                    </td>
                  </tr>
                ) : filteredLedger.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400">
                      No stock movement transactions recorded yet.
                    </td>
                  </tr>
                ) : (
                  filteredLedger.map((tx) => (
                    <tr key={tx.id} className="hover:bg-slate-50/70 dark:hover:bg-white/[0.02]">
                      <td className="py-3 px-3 font-mono font-bold text-slate-900 dark:text-white">
                        {tx.transaction_id}
                      </td>
                      <td className="py-3 px-3 font-mono text-[11px]">
                        <span className="font-bold text-indigo-600 dark:text-indigo-400">
                          {tx.parcel_id || '—'}
                        </span>
                        {tx.order_id && (
                          <span className="block text-slate-400 text-[10px]">
                            Ord: {tx.order_id}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-bold text-slate-800 dark:text-zinc-200">
                          {tx.sku}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-zinc-400 truncate max-w-xs">
                          {tx.product_name}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-zinc-300">
                          {tx.movement_type}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-black text-sm">
                        <span
                          className={
                            tx.quantity < 0
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'text-emerald-600 dark:text-emerald-400'
                          }
                        >
                          {tx.quantity > 0 ? `+${tx.quantity}` : tx.quantity}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-[11px] text-slate-500 dark:text-zinc-400">
                        {tx.previous_stock} → <strong>{tx.new_stock}</strong>
                      </td>
                      <td className="py-3 px-3 text-[11px] text-slate-600 dark:text-zinc-400">
                        <div>{tx.operator_name || 'System'}</div>
                        <div className="text-[10px] text-slate-400">{tx.station_id || 'Main'}</div>
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-[11px] text-slate-400">
                        {new Date(tx.created_at).toLocaleString('en-GB')}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Opening Stock / Adjustment Modal */}
      {isAdjModalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <form
            onSubmit={handleSaveAdjustment}
            className="w-full max-w-md bg-white dark:bg-[#1a1a1e] border border-slate-200 dark:border-white/10 rounded-3xl shadow-2xl p-6 space-y-4"
          >
            <h3 className="text-base font-black text-slate-900 dark:text-white">
              Factory Parcel Inventory Adjustment
            </h3>
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              Set opening stock or adjust baseline inventory for barcode tracking. (Leaves classic inventory completely untouched).
            </p>

            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 block mb-1">
                Product SKU
              </label>
              <input
                type="text"
                required
                placeholder="e.g. CB-07, LTB-04"
                value={adjSku}
                onChange={(e) => setAdjSku(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.02] text-xs font-mono font-bold outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 block mb-1">
                Product Name
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Camper Bag-(3D-7)"
                value={adjProduct}
                onChange={(e) => setAdjProduct(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.02] text-xs font-semibold outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 block mb-1">
                  Movement Type
                </label>
                <select
                  value={adjType}
                  onChange={(e) => setAdjType(e.target.value as any)}
                  className="w-full h-10 px-2 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.02] text-xs font-bold outline-none"
                >
                  <option value="OPENING_STOCK">Opening Stock</option>
                  <option value="STOCK_ADJUSTMENT">Adjustment</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 block mb-1">
                  Quantity (+ or -)
                </label>
                <input
                  type="number"
                  required
                  placeholder="e.g. 50"
                  value={adjQty || ''}
                  onChange={(e) => setAdjQty(parseInt(e.target.value) || 0)}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.02] text-xs font-mono font-bold outline-none"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 block mb-1">
                Reason / Note
              </label>
              <input
                type="text"
                placeholder="e.g. Initial factory batch count..."
                value={adjNotes}
                onChange={(e) => setAdjNotes(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.02] text-xs outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-white/10">
              <button
                type="button"
                onClick={() => setIsAdjModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmittingAdj}
                className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
              >
                {isSubmittingAdj ? 'Recording...' : 'Commit Transaction'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
