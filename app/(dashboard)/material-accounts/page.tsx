'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as XLSX from 'xlsx';
import {
  ReceiptText,
  DollarSign,
  CreditCard,
  AlertCircle,
  Truck,
  RotateCcw,
  Plus,
  Search,
  Filter,
  Download,
  Printer,
  ChevronRight,
  TrendingUp,
  Package,
  Layers,
  Users,
  Calendar,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  FileSpreadsheet,
  Trash2,
  ArrowDownRight,
  ArrowUpRight,
  Edit2,
  Eye,
  Info,
  Phone,
  Mail
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  PieChart,
  Pie,
  Cell
} from 'recharts';

import { useAuth } from '@/context/AuthContext';
import { materialAccountsApi, round2, formatBDT } from '@/services/api/materialAccounts';
import type {
  Material,
  Supplier,
  MaterialPurchase,
  MaterialPurchaseItem,
  SupplierPayment,
  MaterialPurchaseReturn,
  MaterialStockMovement,
  SupplierLedgerEntry,
  MaterialAccountsStats,
  ReconciliationWarning,
  PaymentMethod,
  PurchaseStatus
} from '@/types/materialAccounts';

import '@/styles/MaterialAccounts.css';

type ActiveTab =
  | 'dashboard'
  | 'purchases'
  | 'suppliers'
  | 'payments'
  | 'materials'
  | 'movements'
  | 'returns'
  | 'reports'
  | 'reconciliation';

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#3b82f6'];

export default function MaterialAccountsPage() {
  const { user, profile } = useAuth();
  const userName = profile?.name || user?.email?.split('@')[0] || 'Admin';

  // ── Tab State ──────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // ── Data Entities ──────────────────────────────────────────────
  const [stats, setStats] = useState<MaterialAccountsStats | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchases, setPurchases] = useState<MaterialPurchase[]>([]);
  const [payments, setPayments] = useState<SupplierPayment[]>([]);
  const [returns, setReturns] = useState<MaterialPurchaseReturn[]>([]);
  const [movements, setMovements] = useState<MaterialStockMovement[]>([]);
  const [warnings, setWarnings] = useState<ReconciliationWarning[]>([]);

  // ── Filters & Search ───────────────────────────────────────────
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>('all');
  const [supplierFilter, setSupplierFilter] = useState<string>('all');

  // ── Modals & Drawers ───────────────────────────────────────────
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [isMaterialModalOpen, setIsMaterialModalOpen] = useState(false);
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [isStockAdjustmentModalOpen, setIsStockAdjustmentModalOpen] = useState(false);

  // Detail / Statement Views
  const [selectedPurchase, setSelectedPurchase] = useState<MaterialPurchase | null>(null);
  const [selectedSupplierForLedger, setSelectedSupplierForLedger] = useState<Supplier | null>(null);
  const [supplierLedgerEntries, setSupplierLedgerEntries] = useState<SupplierLedgerEntry[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  // ── Forms State ────────────────────────────────────────────────
  // New Purchase Form
  const [poSupplierId, setPoSupplierId] = useState('');
  const [poDate, setPoDate] = useState(new Date().toISOString().slice(0, 10));
  const [poDueDate, setPoDueDate] = useState('');
  const [poDiscount, setPoDiscount] = useState<number>(0);
  const [poTax, setPoTax] = useState<number>(0);
  const [poFreight, setPoFreight] = useState<number>(0);
  const [poLoading, setPoLoading] = useState<number>(0);
  const [poOtherExp, setPoOtherExp] = useState<number>(0);
  const [poNotes, setPoNotes] = useState('');
  const [poIsDraft, setPoIsDraft] = useState(false);
  const [poItems, setPoItems] = useState<Array<{ material_id: string; quantity: number; unit_price: number; remarks: string }>>([
    { material_id: '', quantity: 1, unit_price: 0, remarks: '' }
  ]);

  // Record Payment Form
  const [paySupplierId, setPaySupplierId] = useState('');
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payMethod, setPayMethod] = useState<PaymentMethod>('bank_transfer');
  const [payRefNote, setPayRefNote] = useState('');
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [payAllocations, setPayAllocations] = useState<Record<string, number>>({});

  // New Supplier Form
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [supName, setSupName] = useState('');
  const [supCode, setSupCode] = useState('');
  const [supContact, setSupContact] = useState('');
  const [supPhone, setSupPhone] = useState('');
  const [supEmail, setSupEmail] = useState('');
  const [supAddress, setSupAddress] = useState('');
  const [supTaxId, setSupTaxId] = useState('');
  const [supOpeningPayable, setSupOpeningPayable] = useState<number>(0);
  const [supOpeningAdvance, setSupOpeningAdvance] = useState<number>(0);
  const [supTerms, setSupTerms] = useState('Due on Receipt');
  const [supNotes, setSupNotes] = useState('');

  // New Material Form
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [matName, setMatName] = useState('');
  const [matSku, setMatSku] = useState('');
  const [matCategory, setMatCategory] = useState('Raw Materials');
  const [matUom, setMatUom] = useState('pcs');
  const [matPrefRate, setMatPrefRate] = useState<number>(0);
  const [matReorder, setMatReorder] = useState<number>(10);
  const [matOpeningStock, setMatOpeningStock] = useState<number>(0);
  const [matNotes, setMatNotes] = useState('');

  // Return Form
  const [retSupplierId, setRetSupplierId] = useState('');
  const [retPurchaseId, setRetPurchaseId] = useState('');
  const [retReason, setRetReason] = useState('');
  const [retDate, setRetDate] = useState(new Date().toISOString().slice(0, 10));
  const [retItems, setRetItems] = useState<Array<{ material_id: string; quantity: number; unit_price: number }>>([
    { material_id: '', quantity: 1, unit_price: 0 }
  ]);

  // Stock Adjustment Form
  const [adjMaterialId, setAdjMaterialId] = useState('');
  const [adjType, setAdjType] = useState<any>('waste_adjustment');
  const [adjQty, setAdjQty] = useState<number>(0);
  const [adjCost, setAdjCost] = useState<number>(0);
  const [adjNotes, setAdjNotes] = useState('');

  // Reversal Prompt
  const [reversalModalOpen, setReversalModalOpen] = useState(false);
  const [targetPaymentForReversal, setTargetPaymentForReversal] = useState<SupplierPayment | null>(null);
  const [reversalReason, setReversalReason] = useState('');

  // Selected Report in Reports Tab
  const [selectedReportId, setSelectedReportId] = useState<number>(1);

  // ── Load All Data ──────────────────────────────────────────────
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [matList, supList, poList, payList, retList, movList, st] = await Promise.all([
        materialAccountsApi.getMaterials(),
        materialAccountsApi.getSuppliers(),
        materialAccountsApi.getPurchases(),
        materialAccountsApi.getPayments(),
        materialAccountsApi.getReturns(),
        materialAccountsApi.getStockMovements(),
        materialAccountsApi.getStats()
      ]);

      setMaterials(matList);
      setSuppliers(supList);
      setPurchases(poList);
      setPayments(payList);
      setReturns(retList);
      setMovements(movList);
      setStats(st);

      // Load reconciliation
      const warn = await materialAccountsApi.runReconciliationScan();
      setWarnings(warn);
    } catch (err) {
      console.error('[MaterialAccounts] Error loading data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
  };

  // ── Open Supplier Ledger ───────────────────────────────────────
  const openSupplierLedger = async (supplier: Supplier) => {
    setSelectedSupplierForLedger(supplier);
    setLedgerLoading(true);
    try {
      const entries = await materialAccountsApi.getSupplierLedger(supplier.id);
      setSupplierLedgerEntries(entries);
    } catch (err) {
      console.error(err);
    } finally {
      setLedgerLoading(false);
    }
  };

  // ── Purchase Calculation Helpers ───────────────────────────────
  const currentPoSubtotal = useMemo(() => {
    return poItems.reduce((acc, it) => acc + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0), 0);
  }, [poItems]);

  const currentPoGrandTotal = useMemo(() => {
    const net = currentPoSubtotal - (Number(poDiscount) || 0) + (Number(poTax) || 0);
    const exp = (Number(poFreight) || 0) + (Number(poLoading) || 0) + (Number(poOtherExp) || 0);
    return Math.max(0, net + exp);
  }, [currentPoSubtotal, poDiscount, poTax, poFreight, poLoading, poOtherExp]);

  // ── Submit Purchase ────────────────────────────────────────────
  const handleSavePurchase = async () => {
    if (!poSupplierId) {
      alert('Please select a supplier.');
      return;
    }
    const validItems = poItems.filter(it => it.material_id && Number(it.quantity) > 0);
    if (validItems.length === 0) {
      alert('Please add at least one material with quantity > 0.');
      return;
    }

    try {
      setLoading(true);
      await materialAccountsApi.createPurchase(
        {
          supplier_id: poSupplierId,
          purchase_date: poDate,
          due_date: poDueDate || null,
          status: poIsDraft ? 'draft' : 'posted',
          discount_amount: poDiscount,
          tax_amount: poTax,
          transportation_cost: poFreight,
          loading_cost: poLoading,
          other_expenses: poOtherExp,
          notes: poNotes || null,
          created_by: userName
        },
        validItems.map(it => ({
          material_id: it.material_id,
          quantity: it.quantity,
          unit_price: it.unit_price,
          received_quantity: it.quantity,
          remarks: it.remarks
        })),
        { autoPost: !poIsDraft, user: userName }
      );

      setIsPurchaseModalOpen(false);
      setPoSupplierId('');
      setPoItems([{ material_id: '', quantity: 1, unit_price: 0, remarks: '' }]);
      setPoDiscount(0);
      setPoTax(0);
      setPoFreight(0);
      setPoLoading(0);
      setPoOtherExp(0);
      setPoNotes('');
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to save purchase');
    } finally {
      setLoading(false);
    }
  };

  // ── Submit Payment ─────────────────────────────────────────────
  const unpaidPurchasesForSelectedSupplier = useMemo(() => {
    if (!paySupplierId) return [];
    return purchases.filter(p => p.supplier_id === paySupplierId && p.status === 'posted' && p.balance_due > 0);
  }, [purchases, paySupplierId]);

  const totalAllocatedAmount = useMemo(() => {
    return Object.values(payAllocations).reduce((acc, val) => acc + (Number(val) || 0), 0);
  }, [payAllocations]);

  const excessAdvanceCalculated = useMemo(() => {
    return Math.max(0, (Number(payAmount) || 0) - totalAllocatedAmount);
  }, [payAmount, totalAllocatedAmount]);

  const handleSavePayment = async () => {
    if (!paySupplierId) {
      alert('Please select a supplier.');
      return;
    }
    if (Number(payAmount) <= 0) {
      alert('Payment amount must be greater than 0.');
      return;
    }
    if (totalAllocatedAmount > Number(payAmount)) {
      alert('Total allocated amounts cannot exceed the payment amount.');
      return;
    }

    try {
      setLoading(true);
      const allocList = Object.entries(payAllocations)
        .filter(([_, amt]) => Number(amt) > 0)
        .map(([purchase_id, amount]) => ({ purchase_id, amount: Number(amount) }));

      await materialAccountsApi.recordPayment(
        paySupplierId,
        Number(payAmount),
        payMethod,
        payRefNote,
        allocList,
        userName,
        payDate
      );

      setIsPaymentModalOpen(false);
      setPaySupplierId('');
      setPayAmount(0);
      setPayRefNote('');
      setPayAllocations({});
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to record payment');
    } finally {
      setLoading(false);
    }
  };

  // ── Auto Allocate Payment to Oldest Purchases ──────────────────
  const handleAutoAllocate = () => {
    let remaining = Number(payAmount) || 0;
    const newAlloc: Record<string, number> = {};

    const sorted = [...unpaidPurchasesForSelectedSupplier].sort(
      (a, b) => new Date(a.purchase_date).getTime() - new Date(b.purchase_date).getTime()
    );

    for (const po of sorted) {
      if (remaining <= 0) break;
      const alloc = Math.min(po.balance_due, remaining);
      newAlloc[po.id] = round2(alloc);
      remaining = round2(remaining - alloc);
    }

    setPayAllocations(newAlloc);
  };

  // ── Reverse Payment ────────────────────────────────────────────
  const handleConfirmReversal = async () => {
    if (!targetPaymentForReversal) return;
    if (!reversalReason.trim()) {
      alert('A reversal reason is mandatory for financial auditing.');
      return;
    }
    try {
      setLoading(true);
      await materialAccountsApi.reversePayment(targetPaymentForReversal.id, reversalReason, userName);
      setReversalModalOpen(false);
      setTargetPaymentForReversal(null);
      setReversalReason('');
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to reverse payment');
    } finally {
      setLoading(false);
    }
  };

  // ── Save Supplier ──────────────────────────────────────────────
  const handleSaveSupplier = async () => {
    if (!supName.trim()) {
      alert('Supplier name is required.');
      return;
    }
    try {
      setLoading(true);
      if (editingSupplier) {
        await materialAccountsApi.updateSupplier(editingSupplier.id, {
          name: supName,
          code: supCode,
          contact_person: supContact,
          phone: supPhone,
          email: supEmail,
          address: supAddress,
          tax_id: supTaxId,
          payment_terms: supTerms,
          notes: supNotes
        });
      } else {
        await materialAccountsApi.createSupplier({
          name: supName,
          code: supCode,
          contact_person: supContact,
          phone: supPhone,
          email: supEmail,
          address: supAddress,
          tax_id: supTaxId,
          opening_payable: Number(supOpeningPayable) || 0,
          opening_advance: Number(supOpeningAdvance) || 0,
          payment_terms: supTerms,
          notes: supNotes,
          is_active: true
        });
      }
      setIsSupplierModalOpen(false);
      setEditingSupplier(null);
      setSupName('');
      setSupCode('');
      setSupContact('');
      setSupPhone('');
      setSupEmail('');
      setSupAddress('');
      setSupTaxId('');
      setSupOpeningPayable(0);
      setSupOpeningAdvance(0);
      setSupNotes('');
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to save supplier');
    } finally {
      setLoading(false);
    }
  };

  // ── Save Material ──────────────────────────────────────────────
  const handleSaveMaterial = async () => {
    if (!matName.trim()) {
      alert('Material name is required.');
      return;
    }
    try {
      setLoading(true);
      if (editingMaterial) {
        await materialAccountsApi.updateMaterial(editingMaterial.id, {
          name: matName,
          sku: matSku,
          category: matCategory,
          uom: matUom,
          preferred_rate: Number(matPrefRate) || 0,
          reorder_threshold: Number(matReorder) || 0,
          notes: matNotes
        });
      } else {
        await materialAccountsApi.createMaterial({
          name: matName,
          sku: matSku,
          category: matCategory,
          uom: matUom,
          preferred_rate: Number(matPrefRate) || 0,
          reorder_threshold: Number(matReorder) || 0,
          current_stock: Number(matOpeningStock) || 0,
          is_active: true,
          notes: matNotes
        });
      }
      setIsMaterialModalOpen(false);
      setEditingMaterial(null);
      setMatName('');
      setMatSku('');
      setMatPrefRate(0);
      setMatReorder(10);
      setMatOpeningStock(0);
      setMatNotes('');
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to save material');
    } finally {
      setLoading(false);
    }
  };

  // ── Save Return ────────────────────────────────────────────────
  const handleSaveReturn = async () => {
    if (!retSupplierId) {
      alert('Please select a supplier.');
      return;
    }
    const validItems = retItems.filter(it => it.material_id && Number(it.quantity) > 0);
    if (validItems.length === 0) {
      alert('Please add at least one material to return.');
      return;
    }
    try {
      setLoading(true);
      await materialAccountsApi.createPurchaseReturn(
        retSupplierId,
        retPurchaseId || null,
        validItems.map(it => ({
          material_id: it.material_id,
          quantity: Number(it.quantity),
          unit_price: Number(it.unit_price)
        })),
        retReason,
        userName,
        retDate
      );
      setIsReturnModalOpen(false);
      setRetSupplierId('');
      setRetPurchaseId('');
      setRetReason('');
      setRetItems([{ material_id: '', quantity: 1, unit_price: 0 }]);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to save return');
    } finally {
      setLoading(false);
    }
  };

  // ── Save Stock Adjustment ──────────────────────────────────────
  const handleSaveStockAdjustment = async () => {
    if (!adjMaterialId) {
      alert('Please select a material.');
      return;
    }
    if (Number(adjQty) === 0) {
      alert('Quantity must not be zero.');
      return;
    }
    try {
      setLoading(true);
      await materialAccountsApi.recordStockMovement({
        material_id: adjMaterialId,
        movement_type: adjType,
        quantity: Number(adjQty),
        unit_cost: Number(adjCost) || 0,
        total_cost: round2(Math.abs(Number(adjQty)) * (Number(adjCost) || 0)),
        reference_type: 'manual',
        reference_id: 'ADJ-' + Date.now().toString().slice(-6),
        notes: adjNotes || 'Manual inventory adjustment',
        created_by: userName
      });
      setIsStockAdjustmentModalOpen(false);
      setAdjMaterialId('');
      setAdjQty(0);
      setAdjCost(0);
      setAdjNotes('');
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to record adjustment');
    } finally {
      setLoading(false);
    }
  };

  // ── Filtered Purchases ─────────────────────────────────────────
  const filteredPurchases = useMemo(() => {
    return purchases.filter(p => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (paymentStatusFilter !== 'all' && p.payment_status !== paymentStatusFilter) return false;
      if (supplierFilter !== 'all' && p.supplier_id !== supplierFilter) return false;
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const matchNum = p.purchase_number.toLowerCase().includes(q);
        const matchSup = (p.supplier_name || '').toLowerCase().includes(q);
        if (!matchNum && !matchSup) return false;
      }
      return true;
    });
  }, [purchases, statusFilter, paymentStatusFilter, supplierFilter, searchTerm]);

  // ── Monthly Trend Aggregator for Chart ──────────────────────────
  const monthlyChartData = useMemo(() => {
    const monthsMap: Record<string, { month: string; purchases: number; payments: number; expenses: number }> = {};

    for (const po of purchases) {
      if (po.status === 'posted') {
        const m = po.purchase_date.slice(0, 7);
        if (!monthsMap[m]) monthsMap[m] = { month: m, purchases: 0, payments: 0, expenses: 0 };
        monthsMap[m].purchases = round2(monthsMap[m].purchases + po.grand_total);
        monthsMap[m].expenses = round2(
          monthsMap[m].expenses + po.transportation_cost + po.loading_cost + po.other_expenses
        );
      }
    }

    for (const pay of payments) {
      if (pay.status === 'posted') {
        const m = pay.payment_date.slice(0, 7);
        if (!monthsMap[m]) monthsMap[m] = { month: m, purchases: 0, payments: 0, expenses: 0 };
        monthsMap[m].payments = round2(monthsMap[m].payments + pay.amount);
      }
    }

    const sorted = Object.values(monthsMap).sort((a, b) => a.month.localeCompare(b.month));
    return sorted.slice(-6);
  }, [purchases, payments]);

  // ── Materials Category Breakdown for Pie Chart ─────────────────
  const categoryPieData = useMemo(() => {
    const map: Record<string, number> = {};
    for (const m of materials) {
      map[m.category] = (map[m.category] || 0) + 1;
    }
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [materials]);

  // ── Export Helper (Excel) ──────────────────────────────────────
  const exportToExcel = (data: any[], fileName: string) => {
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Report');
    XLSX.writeFile(wb, `${fileName}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="ma-container">
      {/* ── Page Header ────────────────────────────────────────── */}
      <div className="ma-header">
        <div className="ma-header-title-box">
          <div className="ma-breadcrumbs">
            <span>Operations</span>
            <ChevronRight size={13} />
            <span>Accounting</span>
            <ChevronRight size={13} />
            <span style={{ color: 'var(--tb-text)' }}>Material Accounts</span>
          </div>
          <h1 className="ma-title">Material Accounts & Procurement</h1>
        </div>

        <div className="ma-header-actions">
          <button
            className="ma-btn ma-btn-secondary"
            onClick={handleRefresh}
            title="Refresh Data"
            disabled={refreshing}
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>

          <button className="ma-btn ma-btn-primary" onClick={() => setIsPurchaseModalOpen(true)}>
            <Plus size={15} />
            <span>New Purchase</span>
          </button>

          <button className="ma-btn ma-btn-secondary" onClick={() => setIsPaymentModalOpen(true)}>
            <CreditCard size={15} />
            <span>Record Payment</span>
          </button>
        </div>
      </div>

      {/* ── Navigation Tabs ────────────────────────────────────── */}
      <div className="ma-tabs-bar">
        <button
          className={`ma-tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('dashboard')}
        >
          <Layers size={15} />
          <span>Dashboard</span>
        </button>

        <button
          className={`ma-tab-btn ${activeTab === 'purchases' ? 'active' : ''}`}
          onClick={() => setActiveTab('purchases')}
        >
          <ReceiptText size={15} />
          <span>Purchases ({purchases.length})</span>
        </button>

        <button
          className={`ma-tab-btn ${activeTab === 'suppliers' ? 'active' : ''}`}
          onClick={() => setActiveTab('suppliers')}
        >
          <Users size={15} />
          <span>Suppliers ({suppliers.length})</span>
        </button>

        <button
          className={`ma-tab-btn ${activeTab === 'payments' ? 'active' : ''}`}
          onClick={() => setActiveTab('payments')}
        >
          <CreditCard size={15} />
          <span>Payments ({payments.length})</span>
        </button>

        <button
          className={`ma-tab-btn ${activeTab === 'materials' ? 'active' : ''}`}
          onClick={() => setActiveTab('materials')}
        >
          <Package size={15} />
          <span>Materials ({materials.length})</span>
        </button>

        <button
          className={`ma-tab-btn ${activeTab === 'movements' ? 'active' : ''}`}
          onClick={() => setActiveTab('movements')}
        >
          <TrendingUp size={15} />
          <span>Stock Movements</span>
        </button>

        <button
          className={`ma-tab-btn ${activeTab === 'returns' ? 'active' : ''}`}
          onClick={() => setActiveTab('returns')}
        >
          <RotateCcw size={15} />
          <span>Returns ({returns.length})</span>
        </button>

        <button
          className={`ma-tab-btn ${activeTab === 'reports' ? 'active' : ''}`}
          onClick={() => setActiveTab('reports')}
        >
          <FileSpreadsheet size={15} />
          <span>Reports</span>
        </button>

        <button
          className={`ma-tab-btn ${activeTab === 'reconciliation' ? 'active' : ''}`}
          onClick={() => setActiveTab('reconciliation')}
        >
          <ShieldAlert size={15} />
          <span>Reconciliation</span>
          {warnings.length > 0 && (
            <span
              style={{
                marginLeft: 4,
                background: '#ef4444',
                color: '#fff',
                borderRadius: '50%',
                padding: '1px 6px',
                fontSize: '0.7rem'
              }}
            >
              {warnings.length}
            </span>
          )}
        </button>
      </div>

      {/* ── TAB 1: FINANCIAL DASHBOARD ─────────────────────────── */}
      {activeTab === 'dashboard' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* KPI Summary Cards */}
          <div className="ma-kpi-grid">
            <div className="ma-kpi-card">
              <div className="ma-kpi-header">
                <span className="ma-kpi-title">Total Purchases</span>
                <div className="ma-kpi-icon-wrap" style={{ background: 'rgba(99,102,241,0.12)', color: '#6366f1' }}>
                  <ReceiptText size={16} />
                </div>
              </div>
              <div className="ma-kpi-value">{formatBDT(stats?.totalPurchaseValue || 0)}</div>
              <div className="ma-kpi-sub">Posted purchases total</div>
            </div>

            <div className="ma-kpi-card">
              <div className="ma-kpi-header">
                <span className="ma-kpi-title">Total Paid</span>
                <div className="ma-kpi-icon-wrap" style={{ background: 'rgba(16,185,129,0.12)', color: '#10b981' }}>
                  <DollarSign size={16} />
                </div>
              </div>
              <div className="ma-kpi-value" style={{ color: '#10b981' }}>
                {formatBDT(stats?.totalPaid || 0)}
              </div>
              <div className="ma-kpi-sub">Actual payments made</div>
            </div>

            <div className="ma-kpi-card">
              <div className="ma-kpi-header">
                <span className="ma-kpi-title">Outstanding</span>
                <div className="ma-kpi-icon-wrap" style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}>
                  <AlertCircle size={16} />
                </div>
              </div>
              <div className="ma-kpi-value" style={{ color: '#ef4444' }}>
                {formatBDT(stats?.outstandingPayable || 0)}
              </div>
              <div className="ma-kpi-sub">Net owed to suppliers</div>
            </div>

            <div className="ma-kpi-card">
              <div className="ma-kpi-header">
                <span className="ma-kpi-title">Advances</span>
                <div className="ma-kpi-icon-wrap" style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b' }}>
                  <CreditCard size={16} />
                </div>
              </div>
              <div className="ma-kpi-value" style={{ color: '#f59e0b' }}>
                {formatBDT(stats?.advanceBalance || 0)}
              </div>
              <div className="ma-kpi-sub">Unallocated advances</div>
            </div>

            <div className="ma-kpi-card">
              <div className="ma-kpi-header">
                <span className="ma-kpi-title">Expenses</span>
                <div className="ma-kpi-icon-wrap" style={{ background: 'rgba(139,92,246,0.12)', color: '#8b5cf6' }}>
                  <Truck size={16} />
                </div>
              </div>
              <div className="ma-kpi-value">{formatBDT(stats?.totalExpenses || 0)}</div>
              <div className="ma-kpi-sub">Freight & handling</div>
            </div>

            <div className="ma-kpi-card">
              <div className="ma-kpi-header">
                <span className="ma-kpi-title">Net Purchase</span>
                <div className="ma-kpi-icon-wrap" style={{ background: 'rgba(6,182,212,0.12)', color: '#06b6d4' }}>
                  <CheckCircle2 size={16} />
                </div>
              </div>
              <div className="ma-kpi-value">{formatBDT(stats?.netPurchaseValue || 0)}</div>
              <div className="ma-kpi-sub">After returns</div>
            </div>
          </div>

          {/* Charts Row */}
          <div className="ma-charts-grid">
            <div className="ma-chart-card">
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: '0 0 14px 0', color: 'var(--tb-text)' }}>
                Monthly Financial Flow (Last 6 Months)
              </h3>
              {monthlyChartData.length > 0 ? (
                <div style={{ width: '100%', height: 240 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyChartData}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                      <XAxis dataKey="month" stroke="var(--tb-text-muted)" fontSize={11} />
                      <YAxis stroke="var(--tb-text-muted)" fontSize={11} />
                      <Tooltip
                        contentStyle={{
                          background: 'var(--tb-card)',
                          borderColor: 'var(--tb-border)',
                          borderRadius: 8,
                          color: 'var(--tb-text)',
                          fontSize: '0.8rem'
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: '0.75rem' }} />
                      <Bar dataKey="purchases" name="Purchases" fill="#6366f1" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="payments" name="Payments" fill="#10b981" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="expenses" name="Expenses" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--tb-text-muted)', fontSize: '0.85rem' }}>
                  No transaction data available yet.
                </div>
              )}
            </div>

            <div className="ma-chart-card">
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: '0 0 14px 0', color: 'var(--tb-text)' }}>
                Raw Materials by Category
              </h3>
              {categoryPieData.length > 0 ? (
                <div style={{ width: '100%', height: 240 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={categoryPieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={80}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {categoryPieData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          background: 'var(--tb-card)',
                          borderColor: 'var(--tb-border)',
                          borderRadius: 8,
                          color: 'var(--tb-text)',
                          fontSize: '0.8rem'
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: '0.75rem' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--tb-text-muted)', fontSize: '0.85rem' }}>
                  No materials catalogue created yet.
                </div>
              )}
            </div>
          </div>

          {/* Top Suppliers Summary Table & Mobile Cards */}
          <div className="ma-panel">
            <div className="ma-panel-header">
              <div className="ma-panel-title-group">
                <h3 className="ma-panel-title">Top Suppliers by Outstanding Obligation</h3>
              </div>
              <button className="ma-btn ma-btn-secondary" onClick={() => setActiveTab('suppliers')}>
                <span>View All Suppliers</span>
                <ArrowRight size={14} />
              </button>
            </div>

            {/* Desktop Table View */}
            <div className="ma-desktop-table">
              <div className="ma-table-container">
                <table className="ma-table">
                  <thead>
                    <tr>
                      <th>Supplier</th>
                      <th>Code</th>
                      <th>Phone</th>
                      <th className="ma-align-right">Total Purchases</th>
                      <th className="ma-align-right">Total Paid</th>
                      <th className="ma-align-right">Outstanding Payable</th>
                      <th className="ma-align-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {suppliers.slice(0, 5).map(sup => (
                      <tr key={sup.id}>
                        <td style={{ fontWeight: 600 }}>{sup.name}</td>
                        <td>
                          <span className="ma-badge ma-badge-draft">{sup.code}</span>
                        </td>
                        <td>{sup.phone || '—'}</td>
                        <td className="ma-align-right ma-money">{formatBDT(sup.total_purchases || 0)}</td>
                        <td className="ma-align-right ma-money" style={{ color: '#10b981' }}>
                          {formatBDT(sup.total_paid || 0)}
                        </td>
                        <td
                          className="ma-align-right ma-money"
                          style={{ color: (sup.outstanding_payable || 0) > 0 ? '#ef4444' : 'inherit' }}
                        >
                          {formatBDT(sup.outstanding_payable || 0)}
                        </td>
                        <td className="ma-align-right">
                          <button
                            className="ma-btn ma-btn-secondary"
                            style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                            onClick={() => openSupplierLedger(sup)}
                          >
                            Statement
                          </button>
                        </td>
                      </tr>
                    ))}
                    {suppliers.length === 0 && (
                      <tr>
                        <td colSpan={7} style={{ textAlign: 'center', padding: 30, color: 'var(--tb-text-muted)' }}>
                          No suppliers added yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile Card View */}
            <div className="ma-mobile-card-list">
              {suppliers.slice(0, 5).map(sup => (
                <div key={sup.id} className="ma-mobile-card">
                  <div className="ma-mobile-card-header">
                    <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{sup.name}</span>
                    <span className="ma-badge ma-badge-draft">{sup.code}</span>
                  </div>
                  {sup.phone && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--tb-text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Phone size={12} />
                      <a href={`tel:${sup.phone}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                        {sup.phone}
                      </a>
                    </div>
                  )}
                  <div className="ma-mobile-metrics-grid">
                    <div className="ma-mobile-metric-item">
                      <span className="ma-mobile-metric-label">Purchases</span>
                      <span className="ma-mobile-metric-val">{formatBDT(sup.total_purchases || 0)}</span>
                    </div>
                    <div className="ma-mobile-metric-item">
                      <span className="ma-mobile-metric-label">Paid</span>
                      <span className="ma-mobile-metric-val" style={{ color: '#10b981' }}>
                        {formatBDT(sup.total_paid || 0)}
                      </span>
                    </div>
                    <div className="ma-mobile-metric-item">
                      <span className="ma-mobile-metric-label">Due</span>
                      <span className="ma-mobile-metric-val" style={{ color: (sup.outstanding_payable || 0) > 0 ? '#ef4444' : 'inherit' }}>
                        {formatBDT(sup.outstanding_payable || 0)}
                      </span>
                    </div>
                  </div>
                  <div className="ma-mobile-card-actions">
                    <button
                      className="ma-btn ma-btn-secondary"
                      style={{ padding: '6px 12px', fontSize: '0.75rem' }}
                      onClick={() => openSupplierLedger(sup)}
                    >
                      View Statement
                    </button>
                  </div>
                </div>
              ))}
              {suppliers.length === 0 && (
                <div style={{ textAlign: 'center', padding: 24, color: 'var(--tb-text-muted)', fontSize: '0.85rem' }}>
                  No suppliers added yet.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: PURCHASES REGISTER ───────────────────────────── */}
      {activeTab === 'purchases' && (
        <div className="ma-panel">
          <div className="ma-panel-header">
            <div className="ma-panel-title-group">
              <h3 className="ma-panel-title">Purchase Obligations & Bills</h3>
              <span className="ma-badge-count">{filteredPurchases.length}</span>
            </div>

            <div className="ma-filters-row">
              <div className="ma-search-wrapper">
                <Search
                  size={14}
                  style={{ position: 'absolute', left: 10, top: 13, color: 'var(--tb-text-muted)' }}
                />
                <input
                  type="text"
                  className="ma-search-input"
                  placeholder="Search PO # or Supplier..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>

              <div className="ma-filter-group-grid">
                <select
                  className="ma-select"
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                >
                  <option value="all">All Statuses</option>
                  <option value="posted">Posted</option>
                  <option value="draft">Draft</option>
                  <option value="cancelled">Cancelled</option>
                </select>

                <select
                  className="ma-select"
                  value={paymentStatusFilter}
                  onChange={e => setPaymentStatusFilter(e.target.value)}
                >
                  <option value="all">All Payment Status</option>
                  <option value="unpaid">Unpaid</option>
                  <option value="partial">Partially Paid</option>
                  <option value="paid">Fully Paid</option>
                </select>
              </div>

              <select
                className="ma-select"
                value={supplierFilter}
                onChange={e => setSupplierFilter(e.target.value)}
              >
                <option value="all">All Suppliers</option>
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>

              <button className="ma-btn ma-btn-primary" onClick={() => setIsPurchaseModalOpen(true)}>
                <Plus size={14} />
                <span>New Purchase</span>
              </button>
            </div>
          </div>

          {/* Desktop Table View */}
          <div className="ma-desktop-table">
            <div className="ma-table-container">
              <table className="ma-table">
                <thead>
                  <tr>
                    <th>PO Reference</th>
                    <th>Supplier</th>
                    <th>Date</th>
                    <th>Status</th>
                    <th>Payment</th>
                    <th className="ma-align-right">Grand Total</th>
                    <th className="ma-align-right">Paid</th>
                    <th className="ma-align-right">Balance Due</th>
                    <th className="ma-align-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPurchases.map(po => (
                    <tr key={po.id}>
                      <td style={{ fontWeight: 600 }}>{po.purchase_number}</td>
                      <td>{po.supplier_name}</td>
                      <td>{po.purchase_date}</td>
                      <td>
                        <span className={`ma-badge ma-badge-${po.status}`}>{po.status}</span>
                      </td>
                      <td>
                        <span className={`ma-badge ma-badge-${po.payment_status}`}>{po.payment_status}</span>
                      </td>
                      <td className="ma-align-right ma-money">{formatBDT(po.grand_total)}</td>
                      <td className="ma-align-right ma-money" style={{ color: '#10b981' }}>
                        {formatBDT(po.total_paid)}
                      </td>
                      <td
                        className="ma-align-right ma-money"
                        style={{ color: po.balance_due > 0 ? '#ef4444' : 'inherit' }}
                      >
                        {formatBDT(po.balance_due)}
                      </td>
                      <td className="ma-align-right">
                        <div style={{ display: 'inline-flex', gap: 6 }}>
                          <button
                            className="ma-btn ma-btn-secondary"
                            style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                            onClick={() => setSelectedPurchase(po)}
                            title="View Voucher"
                          >
                            <Eye size={13} />
                          </button>

                          {po.status === 'draft' && (
                            <button
                              className="ma-btn ma-btn-primary"
                              style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                              onClick={async () => {
                                if (confirm(`Post draft purchase ${po.purchase_number}?`)) {
                                  await materialAccountsApi.postDraftPurchase(po.id, userName);
                                  await loadData();
                                }
                              }}
                            >
                              Post
                            </button>
                          )}

                          {po.status !== 'cancelled' && po.total_paid === 0 && (
                            <button
                              className="ma-btn ma-btn-danger"
                              style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                              onClick={async () => {
                                const r = prompt('Reason for cancelling this purchase:');
                                if (r) {
                                  await materialAccountsApi.cancelPurchase(po.id, r, userName);
                                  await loadData();
                                }
                              }}
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredPurchases.length === 0 && (
                    <tr>
                      <td colSpan={9} style={{ textAlign: 'center', padding: 40, color: 'var(--tb-text-muted)' }}>
                        No purchases match the selected filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Card View */}
          <div className="ma-mobile-card-list">
            {filteredPurchases.map(po => (
              <div key={po.id} className="ma-mobile-card">
                <div className="ma-mobile-card-header">
                  <span className="ma-mobile-card-ref">{po.purchase_number}</span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <span className={`ma-badge ma-badge-${po.status}`}>{po.status}</span>
                    <span className={`ma-badge ma-badge-${po.payment_status}`}>{po.payment_status}</span>
                  </div>
                </div>

                <div className="ma-mobile-card-subtitle">
                  <span style={{ fontWeight: 600, color: 'var(--tb-text)' }}>{po.supplier_name}</span>
                  <span>{po.purchase_date}</span>
                </div>

                <div className="ma-mobile-metrics-grid">
                  <div className="ma-mobile-metric-item">
                    <span className="ma-mobile-metric-label">Total</span>
                    <span className="ma-mobile-metric-val">{formatBDT(po.grand_total)}</span>
                  </div>
                  <div className="ma-mobile-metric-item">
                    <span className="ma-mobile-metric-label">Paid</span>
                    <span className="ma-mobile-metric-val" style={{ color: '#10b981' }}>
                      {formatBDT(po.total_paid)}
                    </span>
                  </div>
                  <div className="ma-mobile-metric-item">
                    <span className="ma-mobile-metric-label">Due</span>
                    <span className="ma-mobile-metric-val" style={{ color: po.balance_due > 0 ? '#ef4444' : 'inherit' }}>
                      {formatBDT(po.balance_due)}
                    </span>
                  </div>
                </div>

                <div className="ma-mobile-card-actions">
                  <button
                    className="ma-btn ma-btn-secondary"
                    style={{ padding: '6px 12px', fontSize: '0.75rem' }}
                    onClick={() => setSelectedPurchase(po)}
                  >
                    <Eye size={13} />
                    <span>Voucher</span>
                  </button>

                  {po.status === 'draft' && (
                    <button
                      className="ma-btn ma-btn-primary"
                      style={{ padding: '6px 12px', fontSize: '0.75rem' }}
                      onClick={async () => {
                        if (confirm(`Post draft purchase ${po.purchase_number}?`)) {
                          await materialAccountsApi.postDraftPurchase(po.id, userName);
                          await loadData();
                        }
                      }}
                    >
                      Post
                    </button>
                  )}

                  {po.status !== 'cancelled' && po.total_paid === 0 && (
                    <button
                      className="ma-btn ma-btn-danger"
                      style={{ padding: '6px 10px', fontSize: '0.75rem' }}
                      onClick={async () => {
                        const r = prompt('Reason for cancelling this purchase:');
                        if (r) {
                          await materialAccountsApi.cancelPurchase(po.id, r, userName);
                          await loadData();
                        }
                      }}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            ))}
            {filteredPurchases.length === 0 && (
              <div style={{ textAlign: 'center', padding: 30, color: 'var(--tb-text-muted)', fontSize: '0.85rem' }}>
                No purchases match the selected filters.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 3: SUPPLIERS DIRECTORY ─────────────────────────── */}
      {activeTab === 'suppliers' && (
        <div className="ma-panel">
          <div className="ma-panel-header">
            <div className="ma-panel-title-group">
              <h3 className="ma-panel-title">Suppliers Directory & Account Balances</h3>
              <span className="ma-badge-count">{suppliers.length}</span>
            </div>

            <button
              className="ma-btn ma-btn-primary"
              onClick={() => {
                setEditingSupplier(null);
                setSupName('');
                setSupCode(`SUP-${Date.now().toString().slice(-4)}`);
                setSupContact('');
                setSupPhone('');
                setSupEmail('');
                setSupAddress('');
                setSupTaxId('');
                setSupOpeningPayable(0);
                setSupOpeningAdvance(0);
                setSupNotes('');
                setIsSupplierModalOpen(true);
              }}
            >
              <Plus size={14} />
              <span>Add Supplier</span>
            </button>
          </div>

          {/* Desktop Table View */}
          <div className="ma-desktop-table">
            <div className="ma-table-container">
              <table className="ma-table">
                <thead>
                  <tr>
                    <th>Supplier Name</th>
                    <th>Code</th>
                    <th>Contact Person</th>
                    <th>Phone / Email</th>
                    <th className="ma-align-right">Opening Payable</th>
                    <th className="ma-align-right">Total Purchases</th>
                    <th className="ma-align-right">Total Paid</th>
                    <th className="ma-align-right">Outstanding Payable</th>
                    <th className="ma-align-right">Advance Balance</th>
                    <th className="ma-align-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {suppliers.map(sup => (
                    <tr key={sup.id}>
                      <td style={{ fontWeight: 600 }}>{sup.name}</td>
                      <td>
                        <span className="ma-badge ma-badge-draft">{sup.code}</span>
                      </td>
                      <td>{sup.contact_person || '—'}</td>
                      <td>
                        <div>{sup.phone || '—'}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--tb-text-muted)' }}>{sup.email || ''}</div>
                      </td>
                      <td className="ma-align-right ma-money">{formatBDT(sup.opening_payable || 0)}</td>
                      <td className="ma-align-right ma-money">{formatBDT(sup.total_purchases || 0)}</td>
                      <td className="ma-align-right ma-money" style={{ color: '#10b981' }}>
                        {formatBDT(sup.total_paid || 0)}
                      </td>
                      <td
                        className="ma-align-right ma-money"
                        style={{ color: (sup.outstanding_payable || 0) > 0 ? '#ef4444' : 'inherit' }}
                      >
                        {formatBDT(sup.outstanding_payable || 0)}
                      </td>
                      <td
                        className="ma-align-right ma-money"
                        style={{ color: (sup.advance_balance || 0) > 0 ? '#f59e0b' : 'inherit' }}
                      >
                        {formatBDT(sup.advance_balance || 0)}
                      </td>
                      <td className="ma-align-right">
                        <div style={{ display: 'inline-flex', gap: 6 }}>
                          <button
                            className="ma-btn ma-btn-primary"
                            style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                            onClick={() => openSupplierLedger(sup)}
                            title="View Ledger Statement"
                          >
                            Statement
                          </button>
                          <button
                            className="ma-btn ma-btn-secondary"
                            style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                            onClick={() => {
                              setEditingSupplier(sup);
                              setSupName(sup.name);
                              setSupCode(sup.code);
                              setSupContact(sup.contact_person || '');
                              setSupPhone(sup.phone || '');
                              setSupEmail(sup.email || '');
                              setSupAddress(sup.address || '');
                              setSupTaxId(sup.tax_id || '');
                              setSupTerms(sup.payment_terms || 'Due on Receipt');
                              setSupNotes(sup.notes || '');
                              setIsSupplierModalOpen(true);
                            }}
                            title="Edit Supplier"
                          >
                            <Edit2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Card View */}
          <div className="ma-mobile-card-list">
            {suppliers.map(sup => (
              <div key={sup.id} className="ma-mobile-card">
                <div className="ma-mobile-card-header">
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{sup.name}</div>
                    {sup.contact_person && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--tb-text-muted)' }}>
                        Contact: {sup.contact_person}
                      </div>
                    )}
                  </div>
                  <span className="ma-badge ma-badge-draft">{sup.code}</span>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: '0.75rem', color: 'var(--tb-text-muted)' }}>
                  {sup.phone && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Phone size={12} />
                      <a href={`tel:${sup.phone}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                        {sup.phone}
                      </a>
                    </div>
                  )}
                  {sup.email && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Mail size={12} />
                      <span>{sup.email}</span>
                    </div>
                  )}
                </div>

                <div className="ma-mobile-metrics-grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                  <div className="ma-mobile-metric-item">
                    <span className="ma-mobile-metric-label">Purchases</span>
                    <span className="ma-mobile-metric-val">{formatBDT(sup.total_purchases || 0)}</span>
                  </div>
                  <div className="ma-mobile-metric-item">
                    <span className="ma-mobile-metric-label">Paid</span>
                    <span className="ma-mobile-metric-val" style={{ color: '#10b981' }}>
                      {formatBDT(sup.total_paid || 0)}
                    </span>
                  </div>
                  <div className="ma-mobile-metric-item">
                    <span className="ma-mobile-metric-label">Outstanding Due</span>
                    <span className="ma-mobile-metric-val" style={{ color: (sup.outstanding_payable || 0) > 0 ? '#ef4444' : 'inherit' }}>
                      {formatBDT(sup.outstanding_payable || 0)}
                    </span>
                  </div>
                  <div className="ma-mobile-metric-item">
                    <span className="ma-mobile-metric-label">Advance</span>
                    <span className="ma-mobile-metric-val" style={{ color: (sup.advance_balance || 0) > 0 ? '#f59e0b' : 'inherit' }}>
                      {formatBDT(sup.advance_balance || 0)}
                    </span>
                  </div>
                </div>

                <div className="ma-mobile-card-actions">
                  <button
                    className="ma-btn ma-btn-secondary"
                    style={{ padding: '6px 10px', fontSize: '0.75rem' }}
                    onClick={() => {
                      setEditingSupplier(sup);
                      setSupName(sup.name);
                      setSupCode(sup.code);
                      setSupContact(sup.contact_person || '');
                      setSupPhone(sup.phone || '');
                      setSupEmail(sup.email || '');
                      setSupAddress(sup.address || '');
                      setSupTaxId(sup.tax_id || '');
                      setSupTerms(sup.payment_terms || 'Due on Receipt');
                      setSupNotes(sup.notes || '');
                      setIsSupplierModalOpen(true);
                    }}
                  >
                    <Edit2 size={13} />
                    <span>Edit</span>
                  </button>

                  <button
                    className="ma-btn ma-btn-primary"
                    style={{ padding: '6px 12px', fontSize: '0.75rem' }}
                    onClick={() => openSupplierLedger(sup)}
                  >
                    Statement
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── TAB 4: PAYMENTS & ALLOCATIONS ───────────────────────── */}
      {activeTab === 'payments' && (
        <div className="ma-panel">
          <div className="ma-panel-header">
            <div className="ma-panel-title-group">
              <h3 className="ma-panel-title">Supplier Payments & Multi-Bill Allocations</h3>
              <span className="ma-badge-count">{payments.length}</span>
            </div>

            <button className="ma-btn ma-btn-primary" onClick={() => setIsPaymentModalOpen(true)}>
              <CreditCard size={14} />
              <span>Record Payment</span>
            </button>
          </div>

          {/* Desktop Table View */}
          <div className="ma-desktop-table">
            <div className="ma-table-container">
              <table className="ma-table">
                <thead>
                  <tr>
                    <th>Payment Ref</th>
                    <th>Supplier</th>
                    <th>Date</th>
                    <th>Method</th>
                    <th className="ma-align-right">Amount</th>
                    <th className="ma-align-right">Allocated to Bills</th>
                    <th className="ma-align-right">Advance Amount</th>
                    <th>Status</th>
                    <th>Reference Note</th>
                    <th className="ma-align-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map(pay => (
                    <tr key={pay.id}>
                      <td style={{ fontWeight: 600 }}>{pay.payment_number}</td>
                      <td>{pay.supplier_name}</td>
                      <td>{pay.payment_date}</td>
                      <td>
                        <span className="ma-badge ma-badge-draft">{pay.payment_method.toUpperCase()}</span>
                      </td>
                      <td className="ma-align-right ma-money" style={{ color: '#10b981' }}>
                        {formatBDT(pay.amount)}
                      </td>
                      <td className="ma-align-right ma-money">{formatBDT(pay.allocated_amount)}</td>
                      <td
                        className="ma-align-right ma-money"
                        style={{ color: pay.advance_amount > 0 ? '#f59e0b' : 'inherit' }}
                      >
                        {formatBDT(pay.advance_amount)}
                      </td>
                      <td>
                        <span className={`ma-badge ma-badge-${pay.status === 'posted' ? 'paid' : 'cancelled'}`}>
                          {pay.status}
                        </span>
                      </td>
                      <td>{pay.reference_note || '—'}</td>
                      <td className="ma-align-right">
                        {pay.status === 'posted' && (
                          <button
                            className="ma-btn ma-btn-danger"
                            style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                            onClick={() => {
                              setTargetPaymentForReversal(pay);
                              setReversalReason('');
                              setReversalModalOpen(true);
                            }}
                          >
                            Reverse
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {payments.length === 0 && (
                    <tr>
                      <td colSpan={10} style={{ textAlign: 'center', padding: 40, color: 'var(--tb-text-muted)' }}>
                        No payments recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Card View */}
          <div className="ma-mobile-card-list">
            {payments.map(pay => (
              <div key={pay.id} className="ma-mobile-card">
                <div className="ma-mobile-card-header">
                  <span className="ma-mobile-card-ref">{pay.payment_number}</span>
                  <span className={`ma-badge ma-badge-${pay.status === 'posted' ? 'paid' : 'cancelled'}`}>
                    {pay.status}
                  </span>
                </div>

                <div className="ma-mobile-card-subtitle">
                  <span style={{ fontWeight: 600, color: 'var(--tb-text)' }}>{pay.supplier_name}</span>
                  <span>{pay.payment_date}</span>
                </div>

                <div style={{ display: 'flex', gap: 6 }}>
                  <span className="ma-badge ma-badge-draft">{pay.payment_method.toUpperCase()}</span>
                  {pay.reference_note && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--tb-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {pay.reference_note}
                    </span>
                  )}
                </div>

                <div className="ma-mobile-metrics-grid">
                  <div className="ma-mobile-metric-item">
                    <span className="ma-mobile-metric-label">Paid Amount</span>
                    <span className="ma-mobile-metric-val" style={{ color: '#10b981' }}>
                      {formatBDT(pay.amount)}
                    </span>
                  </div>
                  <div className="ma-mobile-metric-item">
                    <span className="ma-mobile-metric-label">Allocated</span>
                    <span className="ma-mobile-metric-val">{formatBDT(pay.allocated_amount)}</span>
                  </div>
                  <div className="ma-mobile-metric-item">
                    <span className="ma-mobile-metric-label">Advance</span>
                    <span className="ma-mobile-metric-val" style={{ color: pay.advance_amount > 0 ? '#f59e0b' : 'inherit' }}>
                      {formatBDT(pay.advance_amount)}
                    </span>
                  </div>
                </div>

                {pay.status === 'posted' && (
                  <div className="ma-mobile-card-actions">
                    <button
                      className="ma-btn ma-btn-danger"
                      style={{ padding: '6px 12px', fontSize: '0.75rem' }}
                      onClick={() => {
                        setTargetPaymentForReversal(pay);
                        setReversalReason('');
                        setReversalModalOpen(true);
                      }}
                    >
                      Reverse Payment
                    </button>
                  </div>
                )}
              </div>
            ))}
            {payments.length === 0 && (
              <div style={{ textAlign: 'center', padding: 30, color: 'var(--tb-text-muted)', fontSize: '0.85rem' }}>
                No payments recorded yet.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 5: MATERIALS CATALOGUE ─────────────────────────── */}
      {activeTab === 'materials' && (
        <div className="ma-panel">
          <div className="ma-panel-header">
            <div className="ma-panel-title-group">
              <h3 className="ma-panel-title">Raw Materials Catalogue</h3>
              <span className="ma-badge-count">{materials.length}</span>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                className="ma-btn ma-btn-secondary"
                onClick={() => setIsStockAdjustmentModalOpen(true)}
              >
                <Layers size={14} />
                <span>Adjust Stock</span>
              </button>
              <button
                className="ma-btn ma-btn-primary"
                onClick={() => {
                  setEditingMaterial(null);
                  setMatName('');
                  setMatSku(`MAT-${Date.now().toString().slice(-4)}`);
                  setMatCategory('Raw Materials');
                  setMatUom('pcs');
                  setMatPrefRate(0);
                  setMatReorder(10);
                  setMatOpeningStock(0);
                  setMatNotes('');
                  setIsMaterialModalOpen(true);
                }}
              >
                <Plus size={14} />
                <span>Add Material</span>
              </button>
            </div>
          </div>

          {/* Desktop Table View */}
          <div className="ma-desktop-table">
            <div className="ma-table-container">
              <table className="ma-table">
                <thead>
                  <tr>
                    <th>Material Name</th>
                    <th>SKU</th>
                    <th>Category</th>
                    <th>UOM</th>
                    <th className="ma-align-right">Preferred Rate</th>
                    <th className="ma-align-right">Reorder Threshold</th>
                    <th className="ma-align-right">Current Stock</th>
                    <th>Status</th>
                    <th className="ma-align-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {materials.map(mat => {
                    const isLow = mat.current_stock <= mat.reorder_threshold;
                    return (
                      <tr key={mat.id}>
                        <td style={{ fontWeight: 600 }}>{mat.name}</td>
                        <td>
                          <span className="ma-badge ma-badge-draft">{mat.sku}</span>
                        </td>
                        <td>{mat.category}</td>
                        <td>{mat.uom}</td>
                        <td className="ma-align-right ma-money">{formatBDT(mat.preferred_rate)}</td>
                        <td className="ma-align-right">{mat.reorder_threshold}</td>
                        <td
                          className="ma-align-right ma-money"
                          style={{ color: isLow ? '#ef4444' : 'inherit', fontWeight: isLow ? 700 : 500 }}
                        >
                          {mat.current_stock} {mat.uom}
                          {isLow && (
                            <span style={{ marginLeft: 6, fontSize: '0.7rem', color: '#ef4444' }}>[LOW]</span>
                          )}
                        </td>
                        <td>
                          <span className={`ma-badge ${mat.is_active ? 'ma-badge-paid' : 'ma-badge-draft'}`}>
                            {mat.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="ma-align-right">
                          <button
                            className="ma-btn ma-btn-secondary"
                            style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                            onClick={() => {
                              setEditingMaterial(mat);
                              setMatName(mat.name);
                              setMatSku(mat.sku);
                              setMatCategory(mat.category);
                              setMatUom(mat.uom);
                              setMatPrefRate(mat.preferred_rate);
                              setMatReorder(mat.reorder_threshold);
                              setMatNotes(mat.notes || '');
                              setIsMaterialModalOpen(true);
                            }}
                          >
                            <Edit2 size={13} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Card View */}
          <div className="ma-mobile-card-list">
            {materials.map(mat => {
              const isLow = mat.current_stock <= mat.reorder_threshold;
              return (
                <div key={mat.id} className="ma-mobile-card">
                  <div className="ma-mobile-card-header">
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{mat.name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--tb-text-muted)' }}>
                        {mat.category} • {mat.uom}
                      </div>
                    </div>
                    <span className="ma-badge ma-badge-draft">{mat.sku}</span>
                  </div>

                  <div className="ma-mobile-metrics-grid">
                    <div className="ma-mobile-metric-item">
                      <span className="ma-mobile-metric-label">Stock</span>
                      <span className="ma-mobile-metric-val" style={{ color: isLow ? '#ef4444' : 'inherit' }}>
                        {mat.current_stock} {mat.uom}
                        {isLow && <span style={{ fontSize: '0.65rem', display: 'block', color: '#ef4444' }}>LOW</span>}
                      </span>
                    </div>
                    <div className="ma-mobile-metric-item">
                      <span className="ma-mobile-metric-label">Pref Rate</span>
                      <span className="ma-mobile-metric-val">{formatBDT(mat.preferred_rate)}</span>
                    </div>
                    <div className="ma-mobile-metric-item">
                      <span className="ma-mobile-metric-label">Threshold</span>
                      <span className="ma-mobile-metric-val">{mat.reorder_threshold}</span>
                    </div>
                  </div>

                  <div className="ma-mobile-card-actions">
                    <span className={`ma-badge ${mat.is_active ? 'ma-badge-paid' : 'ma-badge-draft'}`}>
                      {mat.is_active ? 'Active' : 'Inactive'}
                    </span>

                    <button
                      className="ma-btn ma-btn-secondary"
                      style={{ padding: '6px 12px', fontSize: '0.75rem' }}
                      onClick={() => {
                        setEditingMaterial(mat);
                        setMatName(mat.name);
                        setMatSku(mat.sku);
                        setMatCategory(mat.category);
                        setMatUom(mat.uom);
                        setMatPrefRate(mat.preferred_rate);
                        setMatReorder(mat.reorder_threshold);
                        setMatNotes(mat.notes || '');
                        setIsMaterialModalOpen(true);
                      }}
                    >
                      <Edit2 size={13} />
                      <span>Edit</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── TAB 6: STOCK MOVEMENTS ─────────────────────────────── */}
      {activeTab === 'movements' && (
        <div className="ma-panel">
          <div className="ma-panel-header">
            <div className="ma-panel-title-group">
              <h3 className="ma-panel-title">Material Stock Movement Audit Log</h3>
              <span className="ma-badge-count">{movements.length}</span>
            </div>
            <button className="ma-btn ma-btn-primary" onClick={() => setIsStockAdjustmentModalOpen(true)}>
              <Plus size={14} />
              <span>Manual Adjustment</span>
            </button>
          </div>

          {/* Desktop Table View */}
          <div className="ma-desktop-table">
            <div className="ma-table-container">
              <table className="ma-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Material</th>
                    <th>Movement Type</th>
                    <th>Reference</th>
                    <th className="ma-align-right">Quantity</th>
                    <th className="ma-align-right">Unit Cost</th>
                    <th className="ma-align-right">Total Cost</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map(m => (
                    <tr key={m.id}>
                      <td>{new Date(m.created_at || '').toLocaleString()}</td>
                      <td style={{ fontWeight: 600 }}>{m.material_name}</td>
                      <td>
                        <span className="ma-badge ma-badge-draft">{m.movement_type}</span>
                      </td>
                      <td>{m.reference_id || '—'}</td>
                      <td
                        className="ma-align-right ma-money"
                        style={{ color: m.quantity > 0 ? '#10b981' : '#ef4444' }}
                      >
                        {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                      </td>
                      <td className="ma-align-right ma-money">{formatBDT(m.unit_cost)}</td>
                      <td className="ma-align-right ma-money">{formatBDT(m.total_cost)}</td>
                      <td style={{ fontSize: '0.75rem', color: 'var(--tb-text-muted)' }}>{m.notes || '—'}</td>
                    </tr>
                  ))}
                  {movements.length === 0 && (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'var(--tb-text-muted)' }}>
                        No stock movements recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Card View */}
          <div className="ma-mobile-card-list">
            {movements.map(m => (
              <div key={m.id} className="ma-mobile-card">
                <div className="ma-mobile-card-header">
                  <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{m.material_name}</span>
                  <span className="ma-badge ma-badge-draft">{m.movement_type}</span>
                </div>

                <div className="ma-mobile-card-subtitle">
                  <span>{new Date(m.created_at || '').toLocaleDateString()}</span>
                  <span>Ref: {m.reference_id || '—'}</span>
                </div>

                <div className="ma-mobile-metrics-grid">
                  <div className="ma-mobile-metric-item">
                    <span className="ma-mobile-metric-label">Qty</span>
                    <span className="ma-mobile-metric-val" style={{ color: m.quantity > 0 ? '#10b981' : '#ef4444' }}>
                      {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                    </span>
                  </div>
                  <div className="ma-mobile-metric-item">
                    <span className="ma-mobile-metric-label">Unit Cost</span>
                    <span className="ma-mobile-metric-val">{formatBDT(m.unit_cost)}</span>
                  </div>
                  <div className="ma-mobile-metric-item">
                    <span className="ma-mobile-metric-label">Total Cost</span>
                    <span className="ma-mobile-metric-val">{formatBDT(m.total_cost)}</span>
                  </div>
                </div>

                {m.notes && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--tb-text-muted)' }}>
                    Notes: {m.notes}
                  </div>
                )}
              </div>
            ))}
            {movements.length === 0 && (
              <div style={{ textAlign: 'center', padding: 30, color: 'var(--tb-text-muted)', fontSize: '0.85rem' }}>
                No stock movements recorded yet.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 7: PURCHASE RETURNS ─────────────────────────────── */}
      {activeTab === 'returns' && (
        <div className="ma-panel">
          <div className="ma-panel-header">
            <div className="ma-panel-title-group">
              <h3 className="ma-panel-title">Purchase Returns & Supplier Credit Notes</h3>
              <span className="ma-badge-count">{returns.length}</span>
            </div>
            <button className="ma-btn ma-btn-primary" onClick={() => setIsReturnModalOpen(true)}>
              <Plus size={14} />
              <span>Create Return</span>
            </button>
          </div>

          {/* Desktop Table View */}
          <div className="ma-desktop-table">
            <div className="ma-table-container">
              <table className="ma-table">
                <thead>
                  <tr>
                    <th>Return Ref</th>
                    <th>Supplier</th>
                    <th>Date</th>
                    <th>Linked Purchase</th>
                    <th className="ma-align-right">Total Amount</th>
                    <th>Status</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {returns.map(ret => (
                    <tr key={ret.id}>
                      <td style={{ fontWeight: 600 }}>{ret.return_number}</td>
                      <td>{ret.supplier_name}</td>
                      <td>{ret.return_date}</td>
                      <td>{ret.purchase_id ? 'Linked' : 'General Credit'}</td>
                      <td className="ma-align-right ma-money" style={{ color: '#ef4444' }}>
                        {formatBDT(ret.total_amount)}
                      </td>
                      <td>
                        <span className="ma-badge ma-badge-paid">{ret.status}</span>
                      </td>
                      <td>{ret.reason || '—'}</td>
                    </tr>
                  ))}
                  {returns.length === 0 && (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: 40, color: 'var(--tb-text-muted)' }}>
                        No purchase returns recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Card View */}
          <div className="ma-mobile-card-list">
            {returns.map(ret => (
              <div key={ret.id} className="ma-mobile-card">
                <div className="ma-mobile-card-header">
                  <span className="ma-mobile-card-ref">{ret.return_number}</span>
                  <span className="ma-badge ma-badge-paid">{ret.status}</span>
                </div>

                <div className="ma-mobile-card-subtitle">
                  <span style={{ fontWeight: 600, color: 'var(--tb-text)' }}>{ret.supplier_name}</span>
                  <span>{ret.return_date}</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--tb-card-hover)', padding: '8px 12px', borderRadius: 8 }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--tb-text-muted)' }}>Total Credit Amount</span>
                  <span className="ma-money" style={{ color: '#ef4444', fontWeight: 700 }}>
                    {formatBDT(ret.total_amount)}
                  </span>
                </div>

                {ret.reason && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--tb-text-muted)' }}>
                    Reason: {ret.reason}
                  </div>
                )}
              </div>
            ))}
            {returns.length === 0 && (
              <div style={{ textAlign: 'center', padding: 30, color: 'var(--tb-text-muted)', fontSize: '0.85rem' }}>
                No purchase returns recorded yet.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 8: FINANCIAL REPORTS ────────────────────────────── */}
      {activeTab === 'reports' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Report Selector Pills */}
          <div
            style={{
              display: 'flex',
              gap: 8,
              overflowX: 'auto',
              paddingBottom: 6,
              scrollbarWidth: 'none',
              WebkitOverflowScrolling: 'touch'
            }}
          >
            {[
              { id: 1, name: '1. By Supplier' },
              { id: 2, name: '2. By Material' },
              { id: 3, name: '3. Payments' },
              { id: 4, name: '4. Payables Aging' },
              { id: 5, name: '5. Advances' },
              { id: 6, name: '6. Expenses' },
              { id: 7, name: '7. Returns' },
              { id: 8, name: '8. Stock Valuation' },
              { id: 9, name: '9. Rate Trend' },
              { id: 10, name: '10. Reorder Alerts' },
              { id: 11, name: '11. Cash Outflow' },
              { id: 12, name: '12. Procurement P&L' }
            ].map(rep => (
              <button
                key={rep.id}
                className={`ma-btn ${selectedReportId === rep.id ? 'ma-btn-primary' : 'ma-btn-secondary'}`}
                style={{ fontSize: '0.75rem', whiteSpace: 'nowrap', flexShrink: 0 }}
                onClick={() => setSelectedReportId(rep.id)}
              >
                {rep.name}
              </button>
            ))}
          </div>

          {/* Render Active Report Table & Export */}
          <div className="ma-panel">
            <div className="ma-panel-header">
              <div className="ma-panel-title-group">
                <h3 className="ma-panel-title">
                  {selectedReportId === 1 && 'Purchase Summary by Supplier'}
                  {selectedReportId === 2 && 'Purchase Summary by Material'}
                  {selectedReportId === 3 && 'Supplier Payment Summary'}
                  {selectedReportId === 4 && 'Outstanding Payables Aging'}
                  {selectedReportId === 5 && 'Advance Payments Report'}
                  {selectedReportId === 6 && 'Material Procurement Expenses Report'}
                  {selectedReportId === 7 && 'Purchase Return Summary'}
                  {selectedReportId === 8 && 'Stock Movement & Valuation Report'}
                  {selectedReportId === 9 && 'Material Price History & Rate Trend'}
                  {selectedReportId === 10 && 'Reorder Level Alert Report'}
                  {selectedReportId === 11 && 'Procurement Cash Outflow Report'}
                  {selectedReportId === 12 && 'Procurement Comprehensive P&L Statement'}
                </h3>
              </div>

              <button
                className="ma-btn ma-btn-primary"
                onClick={() => {
                  if (selectedReportId === 1) {
                    const exportData = suppliers.map(s => ({
                      Supplier: s.name,
                      Code: s.code,
                      'Total Purchases (BDT)': s.total_purchases || 0,
                      'Total Paid (BDT)': s.total_paid || 0,
                      'Outstanding (BDT)': s.outstanding_payable || 0,
                      'Advance Balance (BDT)': s.advance_balance || 0
                    }));
                    exportToExcel(exportData, 'Purchase_Summary_By_Supplier');
                  } else if (selectedReportId === 4) {
                    const exportData = suppliers
                      .filter(s => (s.outstanding_payable || 0) > 0)
                      .map(s => ({
                        Supplier: s.name,
                        Code: s.code,
                        Phone: s.phone || '',
                        'Outstanding Payable (BDT)': s.outstanding_payable || 0,
                        Terms: s.payment_terms || ''
                      }));
                    exportToExcel(exportData, 'Outstanding_Payables_Aging');
                  } else {
                    const exportData = purchases.map(p => ({
                      'PO #': p.purchase_number,
                      Supplier: p.supplier_name,
                      Date: p.purchase_date,
                      Status: p.status,
                      Payment: p.payment_status,
                      'Grand Total (BDT)': p.grand_total,
                      'Paid (BDT)': p.total_paid,
                      'Balance Due (BDT)': p.balance_due
                    }));
                    exportToExcel(exportData, `Procurement_Report_${selectedReportId}`);
                  }
                }}
              >
                <Download size={14} />
                <span>Export to Excel (.xlsx)</span>
              </button>
            </div>

            <div className="ma-table-container">
              {selectedReportId === 1 && (
                <table className="ma-table">
                  <thead>
                    <tr>
                      <th>Supplier Name</th>
                      <th>Code</th>
                      <th className="ma-align-right">Total Purchases</th>
                      <th className="ma-align-right">Total Paid</th>
                      <th className="ma-align-right">Outstanding Payable</th>
                      <th className="ma-align-right">Advance Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {suppliers.map(s => (
                      <tr key={s.id}>
                        <td style={{ fontWeight: 600 }}>{s.name}</td>
                        <td>{s.code}</td>
                        <td className="ma-align-right ma-money">{formatBDT(s.total_purchases || 0)}</td>
                        <td className="ma-align-right ma-money" style={{ color: '#10b981' }}>
                          {formatBDT(s.total_paid || 0)}
                        </td>
                        <td className="ma-align-right ma-money" style={{ color: '#ef4444' }}>
                          {formatBDT(s.outstanding_payable || 0)}
                        </td>
                        <td className="ma-align-right ma-money" style={{ color: '#f59e0b' }}>
                          {formatBDT(s.advance_balance || 0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {selectedReportId === 4 && (
                <table className="ma-table">
                  <thead>
                    <tr>
                      <th>Supplier</th>
                      <th>Terms</th>
                      <th>Contact</th>
                      <th className="ma-align-right">Current Payable</th>
                      <th className="ma-align-right">Aging Category</th>
                    </tr>
                  </thead>
                  <tbody>
                    {suppliers
                      .filter(s => (s.outstanding_payable || 0) > 0)
                      .map(s => (
                        <tr key={s.id}>
                          <td style={{ fontWeight: 600 }}>{s.name}</td>
                          <td>{s.payment_terms || 'Due on Receipt'}</td>
                          <td>{s.phone || '—'}</td>
                          <td className="ma-align-right ma-money" style={{ color: '#ef4444' }}>
                            {formatBDT(s.outstanding_payable || 0)}
                          </td>
                          <td className="ma-align-right">
                            <span className="ma-badge ma-badge-partial">Current Due</span>
                          </td>
                        </tr>
                      ))}
                    {suppliers.filter(s => (s.outstanding_payable || 0) > 0).length === 0 && (
                      <tr>
                        <td colSpan={5} style={{ textAlign: 'center', padding: 30, color: 'var(--tb-text-muted)' }}>
                          No outstanding payables currently due!
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}

              {selectedReportId === 10 && (
                <table className="ma-table">
                  <thead>
                    <tr>
                      <th>Material</th>
                      <th>SKU</th>
                      <th>UOM</th>
                      <th className="ma-align-right">Current Stock</th>
                      <th className="ma-align-right">Threshold</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {materials
                      .filter(m => m.current_stock <= m.reorder_threshold)
                      .map(m => (
                        <tr key={m.id}>
                          <td style={{ fontWeight: 600 }}>{m.name}</td>
                          <td>{m.sku}</td>
                          <td>{m.uom}</td>
                          <td className="ma-align-right ma-money" style={{ color: '#ef4444' }}>
                            {m.current_stock}
                          </td>
                          <td className="ma-align-right">{m.reorder_threshold}</td>
                          <td>
                            <span className="ma-badge ma-badge-unpaid">Reorder Required</span>
                          </td>
                        </tr>
                      ))}
                    {materials.filter(m => m.current_stock <= m.reorder_threshold).length === 0 && (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', padding: 30, color: 'var(--tb-text-muted)' }}>
                          All materials are above reorder threshold.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}

              {selectedReportId !== 1 && selectedReportId !== 4 && selectedReportId !== 10 && (
                <table className="ma-table">
                  <thead>
                    <tr>
                      <th>Reference #</th>
                      <th>Entity</th>
                      <th>Date</th>
                      <th>Status</th>
                      <th className="ma-align-right">Amount (BDT)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchases.slice(0, 15).map(p => (
                      <tr key={p.id}>
                        <td style={{ fontWeight: 600 }}>{p.purchase_number}</td>
                        <td>{p.supplier_name}</td>
                        <td>{p.purchase_date}</td>
                        <td>
                          <span className={`ma-badge ma-badge-${p.status}`}>{p.status}</span>
                        </td>
                        <td className="ma-align-right ma-money">{formatBDT(p.grand_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 9: RECONCILIATION & AUDIT ───────────────────────── */}
      {activeTab === 'reconciliation' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="ma-panel" style={{ padding: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: '0 0 4px 0' }}>
                  Financial Integrity & Concurrency Scan
                </h3>
                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--tb-text-muted)' }}>
                  Automated scan of all transactions, duplicate checks, allocations, and double-entry consistency.
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                {warnings.length === 0 ? (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      background: 'rgba(16,185,129,0.12)',
                      color: '#10b981',
                      padding: '6px 12px',
                      borderRadius: 8,
                      fontWeight: 600,
                      fontSize: '0.8rem'
                    }}
                  >
                    <ShieldCheck size={16} />
                    All Accounts In Balance
                  </span>
                ) : (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      background: 'rgba(239,68,68,0.12)',
                      color: '#ef4444',
                      padding: '6px 12px',
                      borderRadius: 8,
                      fontWeight: 600,
                      fontSize: '0.8rem'
                    }}
                  >
                    <ShieldAlert size={16} />
                    {warnings.length} Issues Detected
                  </span>
                )}
                <button className="ma-btn ma-btn-secondary" onClick={handleRefresh}>
                  <RefreshCw size={14} />
                  <span>Rescan Now</span>
                </button>
              </div>
            </div>
          </div>

          <div className="ma-panel">
            <div className="ma-panel-header">
              <h3 className="ma-panel-title">Audit Warnings & Discrepancy Findings</h3>
              <span className="ma-badge-count">{warnings.length}</span>
            </div>

            <div style={{ padding: warnings.length > 0 ? 0 : 30 }}>
              {warnings.map(w => (
                <div
                  key={w.id}
                  style={{
                    padding: '14px 16px',
                    borderBottom: '1px solid var(--tb-border-row)',
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: 12
                  }}
                >
                  <div style={{ display: 'flex', gap: 10, minWidth: 0 }}>
                    <div
                      style={{
                        color: w.severity === 'high' ? '#ef4444' : '#f59e0b',
                        marginTop: 2,
                        flexShrink: 0
                      }}
                    >
                      <AlertCircle size={18} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--tb-text)', wordBreak: 'break-word' }}>
                        {w.title}
                      </div>
                      <div style={{ fontSize: '0.775rem', color: 'var(--tb-text-sub)', marginTop: 2, wordBreak: 'break-word' }}>
                        {w.description}
                      </div>
                    </div>
                  </div>

                  <span
                    className={`ma-badge ${w.severity === 'high' ? 'ma-badge-unpaid' : 'ma-badge-partial'}`}
                    style={{ flexShrink: 0 }}
                  >
                    {w.severity.toUpperCase()}
                  </span>
                </div>
              ))}

              {warnings.length === 0 && (
                <div style={{ textAlign: 'center', color: 'var(--tb-text-muted)' }}>
                  <ShieldCheck size={36} style={{ color: '#10b981', margin: '0 auto 10px auto' }} />
                  <div style={{ fontWeight: 600 }}>Zero Financial Inconsistencies</div>
                  <div style={{ fontSize: '0.8rem', marginTop: 4 }}>
                    No duplicate references, over-allocated bills, or ledger balance discrepancies found.
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: NEW PURCHASE ─────────────────────────────────── */}
      {isPurchaseModalOpen && (
        <div className="ma-modal-backdrop" onClick={() => setIsPurchaseModalOpen(false)}>
          <div className="ma-modal-card ma-modal-card-lg" onClick={e => e.stopPropagation()}>
            <div className="ma-modal-header">
              <h3 className="ma-modal-title">Create Material Purchase Order / Invoice</h3>
              <button
                className="ma-btn ma-btn-secondary"
                style={{ padding: '6px 10px' }}
                onClick={() => setIsPurchaseModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="ma-modal-body">
              <div className="ma-form-grid-3">
                <div className="ma-form-group">
                  <label className="ma-form-label">Supplier *</label>
                  <select
                    className="ma-form-select"
                    value={poSupplierId}
                    onChange={e => setPoSupplierId(e.target.value)}
                  >
                    <option value="">Select Supplier...</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="ma-form-group">
                  <label className="ma-form-label">Purchase Date *</label>
                  <input
                    type="date"
                    className="ma-form-input"
                    value={poDate}
                    onChange={e => setPoDate(e.target.value)}
                  />
                </div>

                <div className="ma-form-group">
                  <label className="ma-form-label">Payment Due Date</label>
                  <input
                    type="date"
                    className="ma-form-input"
                    value={poDueDate}
                    onChange={e => setPoDueDate(e.target.value)}
                  />
                </div>
              </div>

              {/* Items Entry Matrix (Desktop Table or Mobile Card Stack) */}
              <div style={{ borderTop: '1px solid var(--tb-border)', paddingTop: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <label className="ma-form-label" style={{ fontWeight: 700 }}>
                    Purchased Materials
                  </label>
                  <button
                    className="ma-btn ma-btn-secondary"
                    style={{ padding: '5px 10px', fontSize: '0.75rem' }}
                    onClick={() =>
                      setPoItems([...poItems, { material_id: '', quantity: 1, unit_price: 0, remarks: '' }])
                    }
                  >
                    <Plus size={13} />
                    <span>Add Item</span>
                  </button>
                </div>

                <div className="ma-item-row-header">
                  <span>Material</span>
                  <span>Quantity</span>
                  <span>Unit Price (৳)</span>
                  <span>Line Total</span>
                  <span></span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {poItems.map((item, idx) => (
                    <div key={idx} className="ma-item-row">
                      <select
                        className="ma-form-select"
                        value={item.material_id}
                        onChange={e => {
                          const matId = e.target.value;
                          const selectedMat = materials.find(m => m.id === matId);
                          const updated = [...poItems];
                          updated[idx].material_id = matId;
                          if (selectedMat && selectedMat.preferred_rate > 0) {
                            updated[idx].unit_price = selectedMat.preferred_rate;
                          }
                          setPoItems(updated);
                        }}
                      >
                        <option value="">Select Material...</option>
                        {materials.map(m => (
                          <option key={m.id} value={m.id}>
                            {m.name} ({m.sku}) — {m.uom}
                          </option>
                        ))}
                      </select>

                      <div className="ma-item-row-fields">
                        <input
                          type="number"
                          min="0.01"
                          step="any"
                          placeholder="Qty"
                          className="ma-form-input"
                          value={item.quantity || ''}
                          onChange={e => {
                            const updated = [...poItems];
                            updated[idx].quantity = Number(e.target.value);
                            setPoItems(updated);
                          }}
                        />

                        <input
                          type="number"
                          min="0"
                          step="any"
                          placeholder="Unit Price"
                          className="ma-form-input"
                          value={item.unit_price || ''}
                          onChange={e => {
                            const updated = [...poItems];
                            updated[idx].unit_price = Number(e.target.value);
                            setPoItems(updated);
                          }}
                        />
                      </div>

                      <div className="ma-item-row-total-del">
                        <div className="ma-money" style={{ fontSize: '0.85rem' }}>
                          <span className="ma-item-mobile-label" style={{ fontSize: '0.7rem', color: 'var(--tb-text-muted)', marginRight: 4 }}>Total: </span>
                          {formatBDT(round2((Number(item.quantity) || 0) * (Number(item.unit_price) || 0)))}
                        </div>

                        <button
                          className="ma-btn ma-btn-danger"
                          style={{ padding: '6px 10px', minHeight: 34 }}
                          onClick={() => {
                            if (poItems.length > 1) {
                              setPoItems(poItems.filter((_, i) => i !== idx));
                            }
                          }}
                          disabled={poItems.length === 1}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Adjustments & Expenses Grid */}
              <div style={{ borderTop: '1px solid var(--tb-border)', paddingTop: 14 }}>
                <label className="ma-form-label" style={{ fontWeight: 700, marginBottom: 8, display: 'block' }}>
                  Adjustments & Procurement Expenses
                </label>
                <div className="ma-expenses-grid">
                  <div className="ma-form-group">
                    <label className="ma-form-label">Discount (৳)</label>
                    <input
                      type="number"
                      min="0"
                      className="ma-form-input"
                      value={poDiscount || ''}
                      onChange={e => setPoDiscount(Number(e.target.value))}
                    />
                  </div>

                  <div className="ma-form-group">
                    <label className="ma-form-label">Tax / VAT (৳)</label>
                    <input
                      type="number"
                      min="0"
                      className="ma-form-input"
                      value={poTax || ''}
                      onChange={e => setPoTax(Number(e.target.value))}
                    />
                  </div>

                  <div className="ma-form-group">
                    <label className="ma-form-label">Freight / Transport (৳)</label>
                    <input
                      type="number"
                      min="0"
                      className="ma-form-input"
                      value={poFreight || ''}
                      onChange={e => setPoFreight(Number(e.target.value))}
                    />
                  </div>

                  <div className="ma-form-group">
                    <label className="ma-form-label">Loading / Labor (৳)</label>
                    <input
                      type="number"
                      min="0"
                      className="ma-form-input"
                      value={poLoading || ''}
                      onChange={e => setPoLoading(Number(e.target.value))}
                    />
                  </div>

                  <div className="ma-form-group">
                    <label className="ma-form-label">Other Expenses (৳)</label>
                    <input
                      type="number"
                      min="0"
                      className="ma-form-input"
                      value={poOtherExp || ''}
                      onChange={e => setPoOtherExp(Number(e.target.value))}
                    />
                  </div>
                </div>
              </div>

              {/* Grand Total Summary Box */}
              <div
                style={{
                  background: 'var(--tb-card-hover)',
                  border: '1px solid var(--tb-border)',
                  borderRadius: 'var(--tb-radius-sm)',
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12
                }}
              >
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--tb-text-muted)' }}>Items Subtotal</div>
                  <div className="ma-money" style={{ fontSize: '0.95rem' }}>
                    {formatBDT(currentPoSubtotal)}
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--tb-text-sub)' }}>
                    Grand Total
                  </div>
                  <div className="ma-money" style={{ fontSize: '1.25rem', color: 'var(--tb-accent)' }}>
                    {formatBDT(currentPoGrandTotal)}
                  </div>
                </div>
              </div>

              <div className="ma-form-group">
                <label className="ma-form-label">Notes & Remarks</label>
                <textarea
                  className="ma-form-textarea"
                  rows={2}
                  placeholder="Optional internal remarks..."
                  value={poNotes}
                  onChange={e => setPoNotes(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  id="chkPoDraft"
                  checked={poIsDraft}
                  onChange={e => setPoIsDraft(e.target.checked)}
                />
                <label htmlFor="chkPoDraft" style={{ fontSize: '0.8rem', cursor: 'pointer' }}>
                  Save as Draft (will not create stock movement or payable obligation until posted)
                </label>
              </div>
            </div>

            <div className="ma-modal-footer">
              <button className="ma-btn ma-btn-secondary" onClick={() => setIsPurchaseModalOpen(false)}>
                Cancel
              </button>
              <button className="ma-btn ma-btn-primary" onClick={handleSavePurchase}>
                {poIsDraft ? 'Save Draft' : 'Post & Create Purchase'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: RECORD PAYMENT ───────────────────────────────── */}
      {isPaymentModalOpen && (
        <div className="ma-modal-backdrop" onClick={() => setIsPaymentModalOpen(false)}>
          <div className="ma-modal-card ma-modal-card-lg" onClick={e => e.stopPropagation()}>
            <div className="ma-modal-header">
              <h3 className="ma-modal-title">Record Supplier Payment & Multi-Bill Allocation</h3>
              <button
                className="ma-btn ma-btn-secondary"
                style={{ padding: '6px 10px' }}
                onClick={() => setIsPaymentModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="ma-modal-body">
              <div className="ma-form-grid-2">
                <div className="ma-form-group">
                  <label className="ma-form-label">Supplier *</label>
                  <select
                    className="ma-form-select"
                    value={paySupplierId}
                    onChange={e => {
                      setPaySupplierId(e.target.value);
                      setPayAllocations({});
                    }}
                  >
                    <option value="">Select Supplier...</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} (Due: {formatBDT(s.outstanding_payable || 0)})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="ma-form-group">
                  <label className="ma-form-label">Payment Amount (৳) *</label>
                  <input
                    type="number"
                    min="0.01"
                    step="any"
                    className="ma-form-input"
                    value={payAmount || ''}
                    onChange={e => setPayAmount(Number(e.target.value))}
                  />
                </div>
              </div>

              <div className="ma-form-grid-2">
                <div className="ma-form-group">
                  <label className="ma-form-label">Payment Date</label>
                  <input
                    type="date"
                    className="ma-form-input"
                    value={payDate}
                    onChange={e => setPayDate(e.target.value)}
                  />
                </div>

                <div className="ma-form-group">
                  <label className="ma-form-label">Payment Method</label>
                  <select
                    className="ma-form-select"
                    value={payMethod}
                    onChange={e => setPayMethod(e.target.value as PaymentMethod)}
                  >
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="cash">Cash</option>
                    <option value="cheque">Cheque</option>
                    <option value="bkash">bKash</option>
                    <option value="nagad">Nagad</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              <div className="ma-form-group">
                <label className="ma-form-label">Reference Note / Cheque #</label>
                <input
                  type="text"
                  placeholder="e.g. Trx ID, Cheque #49281, Bank receipt..."
                  className="ma-form-input"
                  value={payRefNote}
                  onChange={e => setPayRefNote(e.target.value)}
                />
              </div>

              {/* Multi-Bill Allocation Matrix */}
              <div style={{ borderTop: '1px solid var(--tb-border)', paddingTop: 14 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span className="ma-form-label" style={{ fontWeight: 700 }}>
                      Allocate to Outstanding Purchase Bills
                    </span>
                    {unpaidPurchasesForSelectedSupplier.length > 0 && (
                      <button
                        className="ma-btn ma-btn-secondary"
                        style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                        onClick={handleAutoAllocate}
                      >
                        Auto Allocate to Oldest
                      </button>
                    )}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--tb-text-muted)' }}>
                    Any unallocated balance will automatically be held as a Supplier Advance.
                  </div>
                </div>

                {unpaidPurchasesForSelectedSupplier.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 220, overflowY: 'auto' }}>
                    {unpaidPurchasesForSelectedSupplier.map(po => {
                      const allocVal = payAllocations[po.id] || 0;
                      return (
                        <div
                          key={po.id}
                          style={{
                            padding: '10px 12px',
                            background: 'var(--tb-card-hover)',
                            borderRadius: 'var(--tb-radius-sm)',
                            border: '1px solid var(--tb-border)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 6
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{po.purchase_number}</span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--tb-text-muted)' }}>{po.purchase_date}</span>
                          </div>

                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.775rem' }}>
                            <span>
                              Total: <span className="ma-money">{formatBDT(po.grand_total)}</span>
                            </span>
                            <span>
                              Due: <span className="ma-money" style={{ color: '#ef4444', fontWeight: 700 }}>{formatBDT(po.balance_due)}</span>
                            </span>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                            <input
                              type="number"
                              min="0"
                              max={po.balance_due}
                              step="any"
                              placeholder="Allocate amount (৳)"
                              className="ma-form-input"
                              style={{ padding: '6px 10px', minHeight: 34 }}
                              value={allocVal || ''}
                              onChange={e => {
                                const val = Math.min(po.balance_due, Number(e.target.value) || 0);
                                setPayAllocations({
                                  ...payAllocations,
                                  [po.id]: round2(val)
                                });
                              }}
                            />
                            <button
                              className="ma-btn ma-btn-secondary"
                              style={{ padding: '6px 10px', fontSize: '0.75rem', minHeight: 34 }}
                              onClick={() => {
                                setPayAllocations({
                                  ...payAllocations,
                                  [po.id]: po.balance_due
                                });
                              }}
                            >
                              Max
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ padding: '16px 0', fontSize: '0.85rem', color: 'var(--tb-text-muted)' }}>
                    {paySupplierId
                      ? 'This supplier has no outstanding unpaid purchase bills. Entire amount will be stored as an Advance.'
                      : 'Select a supplier above to see unpaid purchase bills.'}
                  </div>
                )}
              </div>

              {/* Allocation Summary Bar */}
              <div
                style={{
                  background: 'var(--tb-card-hover)',
                  border: '1px solid var(--tb-border)',
                  borderRadius: 'var(--tb-radius-sm)',
                  padding: '10px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}
              >
                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--tb-text-muted)' }}>Allocated to Bills</div>
                  <div className="ma-money" style={{ color: '#10b981', fontWeight: 700 }}>
                    {formatBDT(totalAllocatedAmount)}
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--tb-text-muted)' }}>Held as Advance</div>
                  <div className="ma-money" style={{ color: '#f59e0b', fontWeight: 700 }}>
                    {formatBDT(excessAdvanceCalculated)}
                  </div>
                </div>
              </div>
            </div>

            <div className="ma-modal-footer">
              <button className="ma-btn ma-btn-secondary" onClick={() => setIsPaymentModalOpen(false)}>
                Cancel
              </button>
              <button className="ma-btn ma-btn-primary" onClick={handleSavePayment}>
                Record Payment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: ADD / EDIT SUPPLIER ──────────────────────────── */}
      {isSupplierModalOpen && (
        <div className="ma-modal-backdrop" onClick={() => setIsSupplierModalOpen(false)}>
          <div className="ma-modal-card" onClick={e => e.stopPropagation()}>
            <div className="ma-modal-header">
              <h3 className="ma-modal-title">
                {editingSupplier ? 'Edit Supplier' : 'Register New Supplier'}
              </h3>
              <button
                className="ma-btn ma-btn-secondary"
                style={{ padding: '6px 10px' }}
                onClick={() => setIsSupplierModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="ma-modal-body">
              <div className="ma-form-grid-2">
                <div className="ma-form-group">
                  <label className="ma-form-label">Supplier Name *</label>
                  <input
                    type="text"
                    className="ma-form-input"
                    value={supName}
                    onChange={e => setSupName(e.target.value)}
                  />
                </div>
                <div className="ma-form-group">
                  <label className="ma-form-label">Code *</label>
                  <input
                    type="text"
                    className="ma-form-input"
                    value={supCode}
                    onChange={e => setSupCode(e.target.value)}
                  />
                </div>
              </div>

              <div className="ma-form-grid-2">
                <div className="ma-form-group">
                  <label className="ma-form-label">Contact Person</label>
                  <input
                    type="text"
                    className="ma-form-input"
                    value={supContact}
                    onChange={e => setSupContact(e.target.value)}
                  />
                </div>
                <div className="ma-form-group">
                  <label className="ma-form-label">Phone Number</label>
                  <input
                    type="text"
                    className="ma-form-input"
                    value={supPhone}
                    onChange={e => setSupPhone(e.target.value)}
                  />
                </div>
              </div>

              <div className="ma-form-grid-2">
                <div className="ma-form-group">
                  <label className="ma-form-label">Email</label>
                  <input
                    type="email"
                    className="ma-form-input"
                    value={supEmail}
                    onChange={e => setSupEmail(e.target.value)}
                  />
                </div>
                <div className="ma-form-group">
                  <label className="ma-form-label">Payment Terms</label>
                  <input
                    type="text"
                    placeholder="e.g. Net 30, Due on Receipt"
                    className="ma-form-input"
                    value={supTerms}
                    onChange={e => setSupTerms(e.target.value)}
                  />
                </div>
              </div>

              {!editingSupplier && (
                <div
                  style={{
                    borderTop: '1px solid var(--tb-border)',
                    paddingTop: 12
                  }}
                  className="ma-form-grid-2"
                >
                  <div className="ma-form-group">
                    <label className="ma-form-label">Opening Payable (৳)</label>
                    <input
                      type="number"
                      min="0"
                      className="ma-form-input"
                      value={supOpeningPayable || ''}
                      onChange={e => setSupOpeningPayable(Number(e.target.value))}
                    />
                  </div>
                  <div className="ma-form-group">
                    <label className="ma-form-label">Opening Advance (৳)</label>
                    <input
                      type="number"
                      min="0"
                      className="ma-form-input"
                      value={supOpeningAdvance || ''}
                      onChange={e => setSupOpeningAdvance(Number(e.target.value))}
                    />
                  </div>
                </div>
              )}

              <div className="ma-form-group">
                <label className="ma-form-label">Address</label>
                <textarea
                  className="ma-form-textarea"
                  rows={2}
                  value={supAddress}
                  onChange={e => setSupAddress(e.target.value)}
                />
              </div>
            </div>

            <div className="ma-modal-footer">
              <button className="ma-btn ma-btn-secondary" onClick={() => setIsSupplierModalOpen(false)}>
                Cancel
              </button>
              <button className="ma-btn ma-btn-primary" onClick={handleSaveSupplier}>
                {editingSupplier ? 'Update Supplier' : 'Save Supplier'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: ADD / EDIT MATERIAL ──────────────────────────── */}
      {isMaterialModalOpen && (
        <div className="ma-modal-backdrop" onClick={() => setIsMaterialModalOpen(false)}>
          <div className="ma-modal-card" onClick={e => e.stopPropagation()}>
            <div className="ma-modal-header">
              <h3 className="ma-modal-title">
                {editingMaterial ? 'Edit Raw Material' : 'Add New Raw Material'}
              </h3>
              <button
                className="ma-btn ma-btn-secondary"
                style={{ padding: '6px 10px' }}
                onClick={() => setIsMaterialModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="ma-modal-body">
              <div className="ma-form-grid-2">
                <div className="ma-form-group">
                  <label className="ma-form-label">Material Name *</label>
                  <input
                    type="text"
                    className="ma-form-input"
                    value={matName}
                    onChange={e => setMatName(e.target.value)}
                  />
                </div>
                <div className="ma-form-group">
                  <label className="ma-form-label">SKU *</label>
                  <input
                    type="text"
                    className="ma-form-input"
                    value={matSku}
                    onChange={e => setMatSku(e.target.value)}
                  />
                </div>
              </div>

              <div className="ma-form-grid-2">
                <div className="ma-form-group">
                  <label className="ma-form-label">Category</label>
                  <input
                    type="text"
                    placeholder="e.g. Fabric, Zippers, Packaging"
                    className="ma-form-input"
                    value={matCategory}
                    onChange={e => setMatCategory(e.target.value)}
                  />
                </div>
                <div className="ma-form-group">
                  <label className="ma-form-label">Unit of Measure (UOM)</label>
                  <select
                    className="ma-form-select"
                    value={matUom}
                    onChange={e => setMatUom(e.target.value)}
                  >
                    <option value="pcs">Pieces (pcs)</option>
                    <option value="meter">Meters (m)</option>
                    <option value="yard">Yards (yd)</option>
                    <option value="kg">Kilograms (kg)</option>
                    <option value="roll">Rolls</option>
                    <option value="packet">Packets</option>
                  </select>
                </div>
              </div>

              <div className="ma-form-grid-2">
                <div className="ma-form-group">
                  <label className="ma-form-label">Preferred Rate (৳)</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    className="ma-form-input"
                    value={matPrefRate || ''}
                    onChange={e => setMatPrefRate(Number(e.target.value))}
                  />
                </div>
                <div className="ma-form-group">
                  <label className="ma-form-label">Reorder Threshold</label>
                  <input
                    type="number"
                    min="0"
                    className="ma-form-input"
                    value={matReorder || ''}
                    onChange={e => setMatReorder(Number(e.target.value))}
                  />
                </div>
              </div>

              {!editingMaterial && (
                <div className="ma-form-group">
                  <label className="ma-form-label">Opening Stock Quantity</label>
                  <input
                    type="number"
                    min="0"
                    className="ma-form-input"
                    value={matOpeningStock || ''}
                    onChange={e => setMatOpeningStock(Number(e.target.value))}
                  />
                </div>
              )}
            </div>

            <div className="ma-modal-footer">
              <button className="ma-btn ma-btn-secondary" onClick={() => setIsMaterialModalOpen(false)}>
                Cancel
              </button>
              <button className="ma-btn ma-btn-primary" onClick={handleSaveMaterial}>
                {editingMaterial ? 'Update Material' : 'Save Material'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: CREATE RETURN ────────────────────────────────── */}
      {isReturnModalOpen && (
        <div className="ma-modal-backdrop" onClick={() => setIsReturnModalOpen(false)}>
          <div className="ma-modal-card" onClick={e => e.stopPropagation()}>
            <div className="ma-modal-header">
              <h3 className="ma-modal-title">Record Purchase Return / Debit Note</h3>
              <button
                className="ma-btn ma-btn-secondary"
                style={{ padding: '6px 10px' }}
                onClick={() => setIsReturnModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="ma-modal-body">
              <div className="ma-form-grid-2">
                <div className="ma-form-group">
                  <label className="ma-form-label">Supplier *</label>
                  <select
                    className="ma-form-select"
                    value={retSupplierId}
                    onChange={e => setRetSupplierId(e.target.value)}
                  >
                    <option value="">Select Supplier...</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="ma-form-group">
                  <label className="ma-form-label">Return Date</label>
                  <input
                    type="date"
                    className="ma-form-input"
                    value={retDate}
                    onChange={e => setRetDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="ma-form-group">
                <label className="ma-form-label">Reason for Return</label>
                <input
                  type="text"
                  placeholder="e.g. Defective fabric, damaged packaging, wrong color..."
                  className="ma-form-input"
                  value={retReason}
                  onChange={e => setRetReason(e.target.value)}
                />
              </div>

              {/* Return Items */}
              <div style={{ borderTop: '1px solid var(--tb-border)', paddingTop: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <label className="ma-form-label" style={{ fontWeight: 700 }}>
                    Materials Returned
                  </label>
                  <button
                    className="ma-btn ma-btn-secondary"
                    style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                    onClick={() => setRetItems([...retItems, { material_id: '', quantity: 1, unit_price: 0 }])}
                  >
                    <Plus size={13} />
                    <span>Add Item</span>
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {retItems.map((item, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: 10,
                        background: 'var(--tb-card-hover)',
                        borderRadius: 8,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6
                      }}
                    >
                      <select
                        className="ma-form-select"
                        value={item.material_id}
                        onChange={e => {
                          const matId = e.target.value;
                          const mat = materials.find(m => m.id === matId);
                          const updated = [...retItems];
                          updated[idx].material_id = matId;
                          if (mat && mat.preferred_rate > 0) updated[idx].unit_price = mat.preferred_rate;
                          setRetItems(updated);
                        }}
                      >
                        <option value="">Select Material...</option>
                        {materials.map(m => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 34px', gap: 8, alignItems: 'center' }}>
                        <input
                          type="number"
                          placeholder="Qty"
                          className="ma-form-input"
                          value={item.quantity || ''}
                          onChange={e => {
                            const updated = [...retItems];
                            updated[idx].quantity = Number(e.target.value);
                            setRetItems(updated);
                          }}
                        />

                        <input
                          type="number"
                          placeholder="Price"
                          className="ma-form-input"
                          value={item.unit_price || ''}
                          onChange={e => {
                            const updated = [...retItems];
                            updated[idx].unit_price = Number(e.target.value);
                            setRetItems(updated);
                          }}
                        />

                        <button
                          className="ma-btn ma-btn-danger"
                          style={{ padding: '6px', minHeight: 34 }}
                          onClick={() => {
                            if (retItems.length > 1) setRetItems(retItems.filter((_, i) => i !== idx));
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="ma-modal-footer">
              <button className="ma-btn ma-btn-secondary" onClick={() => setIsReturnModalOpen(false)}>
                Cancel
              </button>
              <button className="ma-btn ma-btn-primary" onClick={handleSaveReturn}>
                Confirm Return
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: MANUAL STOCK ADJUSTMENT ──────────────────────── */}
      {isStockAdjustmentModalOpen && (
        <div className="ma-modal-backdrop" onClick={() => setIsStockAdjustmentModalOpen(false)}>
          <div className="ma-modal-card" onClick={e => e.stopPropagation()}>
            <div className="ma-modal-header">
              <h3 className="ma-modal-title">Manual Material Stock Adjustment</h3>
              <button
                className="ma-btn ma-btn-secondary"
                style={{ padding: '6px 10px' }}
                onClick={() => setIsStockAdjustmentModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="ma-modal-body">
              <div className="ma-form-group">
                <label className="ma-form-label">Material *</label>
                <select
                  className="ma-form-select"
                  value={adjMaterialId}
                  onChange={e => setAdjMaterialId(e.target.value)}
                >
                  <option value="">Select Material...</option>
                  {materials.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.name} (Current: {m.current_stock} {m.uom})
                    </option>
                  ))}
                </select>
              </div>

              <div className="ma-form-grid-2">
                <div className="ma-form-group">
                  <label className="ma-form-label">Adjustment Type</label>
                  <select
                    className="ma-form-select"
                    value={adjType}
                    onChange={e => setAdjType(e.target.value)}
                  >
                    <option value="waste_adjustment">Waste / Damage (-)</option>
                    <option value="production_issue">Production Issue (-)</option>
                    <option value="opening">Opening Balance Adjustment (+)</option>
                    <option value="reconciliation_adjustment">Reconciliation (+/-)</option>
                  </select>
                </div>

                <div className="ma-form-group">
                  <label className="ma-form-label">Quantity (+ for in, - for out) *</label>
                  <input
                    type="number"
                    step="any"
                    className="ma-form-input"
                    value={adjQty || ''}
                    onChange={e => setAdjQty(Number(e.target.value))}
                  />
                </div>
              </div>

              <div className="ma-form-group">
                <label className="ma-form-label">Unit Valuation Cost (৳)</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  className="ma-form-input"
                  value={adjCost || ''}
                  onChange={e => setAdjCost(Number(e.target.value))}
                />
              </div>

              <div className="ma-form-group">
                <label className="ma-form-label">Reason / Notes</label>
                <textarea
                  className="ma-form-textarea"
                  rows={2}
                  value={adjNotes}
                  onChange={e => setAdjNotes(e.target.value)}
                />
              </div>
            </div>

            <div className="ma-modal-footer">
              <button className="ma-btn ma-btn-secondary" onClick={() => setIsStockAdjustmentModalOpen(false)}>
                Cancel
              </button>
              <button className="ma-btn ma-btn-primary" onClick={handleSaveStockAdjustment}>
                Save Adjustment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: PAYMENT REVERSAL CONFIRMATION ─────────────────── */}
      {reversalModalOpen && targetPaymentForReversal && (
        <div className="ma-modal-backdrop" onClick={() => setReversalModalOpen(false)}>
          <div className="ma-modal-card" onClick={e => e.stopPropagation()}>
            <div className="ma-modal-header">
              <h3 className="ma-modal-title" style={{ color: '#ef4444' }}>
                Reverse Payment: {targetPaymentForReversal.payment_number}
              </h3>
              <button
                className="ma-btn ma-btn-secondary"
                style={{ padding: '6px 10px' }}
                onClick={() => setReversalModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="ma-modal-body">
              <div
                style={{
                  background: 'rgba(239,68,68,0.08)',
                  border: '1px solid rgba(239,68,68,0.2)',
                  borderRadius: 'var(--tb-radius-sm)',
                  padding: 12,
                  fontSize: '0.825rem'
                }}
              >
                Reversing this payment will release <b>{formatBDT(targetPaymentForReversal.amount)}</b> from the
                allocated purchases, restore their outstanding balances, and log an offsetting credit in the
                supplier ledger.
              </div>

              <div className="ma-form-group" style={{ marginTop: 12 }}>
                <label className="ma-form-label">Mandatory Audit Reversal Reason *</label>
                <textarea
                  className="ma-form-textarea"
                  rows={3}
                  placeholder="Explain why this payment is being reversed (e.g. Bounced cheque, wrong supplier, duplicate entry)..."
                  value={reversalReason}
                  onChange={e => setReversalReason(e.target.value)}
                />
              </div>
            </div>

            <div className="ma-modal-footer">
              <button className="ma-btn ma-btn-secondary" onClick={() => setReversalModalOpen(false)}>
                Cancel
              </button>
              <button className="ma-btn ma-btn-danger" onClick={handleConfirmReversal}>
                Confirm Reversal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL / DRAWER: SUPPLIER LEDGER STATEMENT ───────────── */}
      {selectedSupplierForLedger && (
        <div className="ma-modal-backdrop" onClick={() => setSelectedSupplierForLedger(null)}>
          <div className="ma-modal-card ma-modal-card-lg" onClick={e => e.stopPropagation()}>
            <div className="ma-modal-header no-print">
              <div>
                <h3 className="ma-modal-title">Supplier Account Statement</h3>
                <div style={{ fontSize: '0.775rem', color: 'var(--tb-text-muted)' }}>
                  {selectedSupplierForLedger.name} ({selectedSupplierForLedger.code})
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="ma-btn ma-btn-secondary"
                  onClick={() => window.print()}
                  title="Print Statement"
                >
                  <Printer size={14} />
                  <span>Print</span>
                </button>
                <button
                  className="ma-btn ma-btn-secondary"
                  style={{ padding: '6px 10px' }}
                  onClick={() => setSelectedSupplierForLedger(null)}
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="ma-modal-body ma-printable-area">
              {/* Printable Header */}
              <div style={{ borderBottom: '2px solid var(--tb-border)', paddingBottom: 14, marginBottom: 14 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>ORIGINHAAT OMS</h2>
                    <div style={{ fontSize: '0.75rem', color: 'var(--tb-text-muted)' }}>
                      Material Accounts & Supplier Statement
                    </div>
                  </div>
                  <div style={{ fontSize: '0.8rem', display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                    <div>
                      <b>Supplier:</b> {selectedSupplierForLedger.name}
                    </div>
                    <div>
                      <b>Phone:</b> {selectedSupplierForLedger.phone || 'N/A'}
                    </div>
                    <div>
                      <b>Date:</b> {new Date().toLocaleDateString()}
                    </div>
                  </div>
                </div>

                {/* Net Balance Pill */}
                <div
                  style={{
                    marginTop: 12,
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 12,
                    background: 'var(--tb-card-hover)',
                    padding: 10,
                    borderRadius: 8
                  }}
                >
                  <div>
                    <span style={{ fontSize: '0.7rem', color: 'var(--tb-text-muted)' }}>
                      Outstanding Due:
                    </span>
                    <div className="ma-money" style={{ color: '#ef4444', fontWeight: 700, fontSize: '1.05rem' }}>
                      {formatBDT(selectedSupplierForLedger.outstanding_payable || 0)}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.7rem', color: 'var(--tb-text-muted)' }}>Advance Balance:</span>
                    <div className="ma-money" style={{ color: '#f59e0b', fontWeight: 700, fontSize: '1.05rem' }}>
                      {formatBDT(selectedSupplierForLedger.advance_balance || 0)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Chronological Double-Entry Ledger Table */}
              <div className="ma-table-container">
                <table className="ma-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Ref #</th>
                      <th>Description</th>
                      <th className="ma-align-right">Debit (Paid/Return)</th>
                      <th className="ma-align-right">Credit (Purchase)</th>
                      <th className="ma-align-right">Running Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {supplierLedgerEntries.map(entry => (
                      <tr key={entry.id}>
                        <td>{entry.entry_date}</td>
                        <td>
                          <span className="ma-badge ma-badge-draft">{entry.reference_id || '—'}</span>
                        </td>
                        <td>{entry.description}</td>
                        <td className="ma-align-right ma-money" style={{ color: '#10b981' }}>
                          {entry.debit > 0 ? formatBDT(entry.debit) : '—'}
                        </td>
                        <td className="ma-align-right ma-money" style={{ color: '#ef4444' }}>
                          {entry.credit > 0 ? formatBDT(entry.credit) : '—'}
                        </td>
                        <td className="ma-align-right ma-money" style={{ fontWeight: 700 }}>
                          {formatBDT(entry.running_balance)}
                        </td>
                      </tr>
                    ))}
                    {supplierLedgerEntries.length === 0 && (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', padding: 30, color: 'var(--tb-text-muted)' }}>
                          {ledgerLoading ? 'Loading ledger...' : 'No ledger transactions recorded for this supplier.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="ma-modal-footer no-print">
              <button
                className="ma-btn ma-btn-primary"
                onClick={() => {
                  setPaySupplierId(selectedSupplierForLedger.id);
                  setPayAmount(selectedSupplierForLedger.outstanding_payable || 0);
                  setSelectedSupplierForLedger(null);
                  setIsPaymentModalOpen(true);
                }}
              >
                Record Payment for this Supplier
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: PURCHASE VOUCHER DETAIL ─────────────────────── */}
      {selectedPurchase && (
        <div className="ma-modal-backdrop" onClick={() => setSelectedPurchase(null)}>
          <div className="ma-modal-card" onClick={e => e.stopPropagation()}>
            <div className="ma-modal-header no-print">
              <div>
                <h3 className="ma-modal-title">Purchase Order: {selectedPurchase.purchase_number}</h3>
                <div style={{ fontSize: '0.75rem', color: 'var(--tb-text-muted)' }}>
                  {selectedPurchase.supplier_name} • {selectedPurchase.purchase_date}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="ma-btn ma-btn-secondary"
                  onClick={() => window.print()}
                  title="Print Voucher"
                >
                  <Printer size={14} />
                  <span>Print</span>
                </button>
                <button
                  className="ma-btn ma-btn-secondary"
                  style={{ padding: '6px 10px' }}
                  onClick={() => setSelectedPurchase(null)}
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="ma-modal-body ma-printable-area">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--tb-text-muted)' }}>Supplier</div>
                  <div style={{ fontWeight: 700 }}>{selectedPurchase.supplier_name}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--tb-text-muted)' }}>Status</div>
                  <span className={`ma-badge ma-badge-${selectedPurchase.status}`}>
                    {selectedPurchase.status}
                  </span>
                </div>
              </div>

              {/* Items Table */}
              <div className="ma-table-container" style={{ marginBottom: 12 }}>
                <table className="ma-table">
                  <thead>
                    <tr>
                      <th>Material</th>
                      <th className="ma-align-right">Qty</th>
                      <th className="ma-align-right">Unit Price</th>
                      <th className="ma-align-right">Line Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedPurchase.items || []).map(it => (
                      <tr key={it.id}>
                        <td>{it.material_name || 'Material Item'}</td>
                        <td className="ma-align-right">{it.quantity}</td>
                        <td className="ma-align-right ma-money">{formatBDT(it.unit_price)}</td>
                        <td className="ma-align-right ma-money">{formatBDT(it.line_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Cost Summary Breakdown */}
              <div
                style={{
                  background: 'var(--tb-card-hover)',
                  padding: 12,
                  borderRadius: 8,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  fontSize: '0.825rem'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Items Subtotal:</span>
                  <span className="ma-money">{formatBDT(selectedPurchase.subtotal)}</span>
                </div>
                {selectedPurchase.discount_amount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#10b981' }}>
                    <span>Discount:</span>
                    <span className="ma-money">-{formatBDT(selectedPurchase.discount_amount)}</span>
                  </div>
                )}
                {selectedPurchase.tax_amount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Tax / VAT:</span>
                    <span className="ma-money">+{formatBDT(selectedPurchase.tax_amount)}</span>
                  </div>
                )}
                {selectedPurchase.transportation_cost > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Freight / Transport:</span>
                    <span className="ma-money">+{formatBDT(selectedPurchase.transportation_cost)}</span>
                  </div>
                )}
                {selectedPurchase.loading_cost > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Loading / Labor:</span>
                    <span className="ma-money">+{formatBDT(selectedPurchase.loading_cost)}</span>
                  </div>
                )}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontWeight: 700,
                    borderTop: '1px solid var(--tb-border)',
                    paddingTop: 8,
                    fontSize: '0.95rem'
                  }}
                >
                  <span>Grand Total:</span>
                  <span className="ma-money" style={{ color: 'var(--tb-accent)' }}>
                    {formatBDT(selectedPurchase.grand_total)}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#10b981' }}>
                  <span>Amount Paid:</span>
                  <span className="ma-money">{formatBDT(selectedPurchase.total_paid)}</span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontWeight: 700,
                    color: selectedPurchase.balance_due > 0 ? '#ef4444' : '#10b981'
                  }}
                >
                  <span>Balance Due:</span>
                  <span className="ma-money">{formatBDT(selectedPurchase.balance_due)}</span>
                </div>
              </div>
            </div>

            <div className="ma-modal-footer no-print">
              <button className="ma-btn ma-btn-secondary" onClick={() => setSelectedPurchase(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
