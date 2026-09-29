'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Wallet,
  CheckCircle2,
  Clock,
  ArrowDownLeft,
  Receipt,
  CreditCard,
  RefreshCw,
  Search,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Copy,
  Check,
  Eye,
  X,
  AlertCircle,
  Filter,
  Layers,
  Package,
  User,
  Phone,
  Calendar,
  Sparkles,
  ArrowRight,
  Info,
  Scale,
  AlertTriangle,
  FileCheck2,
  TrendingDown,
  CheckCircle,
  ShieldCheck,
  RotateCcw
} from 'lucide-react';
import { Card } from '@/components/Card';
import { OrderDetailsModal } from '@/components/OrderDetailsModal';
import api from '@/services/api';
import type {
  SteadfastPayment,
  SteadfastConsignment,
  ReconciliationRecord,
  ReconciliationSummary,
  ReconciliationStatus
} from '@/lib/steadfast';

// Helper for generating smart pagination pages with ellipsis (e.g. 1 2 3 ... 28)
function generatePaginationPages(current: number, total: number): (number | string)[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  if (current <= 4) {
    return [1, 2, 3, 4, 5, '...', total];
  }
  if (current >= total - 3) {
    return [1, '...', total - 4, total - 3, total - 2, total - 1, total];
  }
  return [1, '...', current - 1, current, current + 1, '...', total];
}

export default function PaymentsPage() {
  // ── State Management ──
  const [payments, setPayments] = useState<SteadfastPayment[]>([]);
  const [recentConsignments, setRecentConsignments] = useState<SteadfastConsignment[]>([]);
  const [balance, setBalance] = useState<number>(0);
  const [summary, setSummary] = useState({
    current_balance: 0,
    total_disbursed_cod: 0,
    total_charges: 0,
    total_net_payout: 0,
    total_due_bills: 0,
    total_batches: 0
  });

  // Reconciliation State
  const [reconciliationRecords, setReconciliationRecords] = useState<ReconciliationRecord[]>([]);
  const [reconciliationSummary, setReconciliationSummary] = useState<ReconciliationSummary>({
    total_candidates: 0,
    eligible_delivered: 0,
    partial_delivered: 0,
    settled_count: 0,
    processing_count: 0,
    partially_paid_count: 0,
    potentially_unsettled_count: 0,
    manual_verification_count: 0,
    not_eligible_count: 0,
    total_expected_collectible: 0,
    total_settled_amount: 0,
    total_potentially_unsettled_amount: 0,
    total_processing_amount: 0
  });
  const [reconciliationCoverage, setReconciliationCoverage] = useState<{
    batches_checked: number;
    total_batch_parcels: number;
    dispatched_orders_checked: number;
    date_range_start: string | null;
    date_range_end: string | null;
    last_reconciled: string;
  }>({
    batches_checked: 0,
    total_batch_parcels: 0,
    dispatched_orders_checked: 0,
    date_range_start: null,
    date_range_end: null,
    last_reconciled: ''
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isFetchingPage, setIsFetchingPage] = useState(false);
  const [isLoadingReconciliation, setIsLoadingReconciliation] = useState(false);
  const [isRefreshingReconciliation, setIsRefreshingReconciliation] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>('');

  // View switch: 'batches' | 'consignments' | 'reconciliation'
  const [activeView, setActiveView] = useState<'batches' | 'consignments' | 'reconciliation'>('batches');

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // all | paid | processing | pending
  const [methodFilter, setMethodFilter] = useState('all'); // all | Bank | Cash
  const [deliveryStatusFilter, setDeliveryStatusFilter] = useState('all'); // all | delivered | cancelled | in_review
  const [reconStatusFilter, setReconStatusFilter] = useState('all'); // all | POTENTIALLY_UNSETTLED | SETTLED | PROCESSING | PARTIALLY_PAID | NOT_ELIGIBLE

  // Debounce search input by 350ms for server-side queries
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 350);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  // Selected Reconciliation Record Drawer
  const [selectedReconRecord, setSelectedReconRecord] = useState<ReconciliationRecord | null>(null);
  const [showReconRawJson, setShowReconRawJson] = useState(false);

  // Pagination for Batches (Server-side)
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(20);
  const [pagination, setPagination] = useState<{
    currentPage: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  }>({
    currentPage: 1,
    pageSize: 20,
    totalCount: 0,
    totalPages: 1,
    hasNextPage: false,
    hasPrevPage: false
  });

  // When filters or pageSize change, reset page to 1
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, methodFilter, pageSize]);

  // Pagination for Consignments Table
  const [consignmentPage, setConsignmentPage] = useState(1);
  const consignmentPageSize = 25;

  // Pagination for Reconciliation Table
  const [reconPage, setReconPage] = useState(1);
  const reconPageSize = 25;

  // Selected Payment Drawer / Modal
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [batchDetails, setBatchDetails] = useState<SteadfastPayment | null>(null);
  const [isLoadingBatchDetails, setIsLoadingBatchDetails] = useState(false);
  const [batchModalSearch, setBatchModalSearch] = useState('');
  const [showRawJson, setShowRawJson] = useState(false);

  // OMS Order Modal
  const [selectedOmsOrder, setSelectedOmsOrder] = useState<any | null>(null);
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);

  // Copy state helper
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyToClipboard = (text: string, key: string) => {
    if (!text) return;
    navigator.clipboard.writeText(String(text));
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // ── Fetch Payments API ──
  const fetchPaymentsData = useCallback(async (isManualRefresh = false, isPageChange = false) => {
    if (isManualRefresh) setIsRefreshing(true);
    else if (isPageChange) setIsFetchingPage(true);
    else setIsLoading(true);
    setError(null);

    try {
      const queryParams = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        status: statusFilter,
        method: methodFilter,
        search: debouncedSearch,
        includeConsignments: 'true'
      });

      const res = await fetch(`/api/steadfast/payments?${queryParams.toString()}`);
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to communicate with Steadfast Courier API.');
      }

      setBalance(Number(data.balance) || 0);
      setPayments(data.payments || []);
      setRecentConsignments(data.recentConsignments || []);
      if (data.summary) {
        setSummary(data.summary);
      }
      if (data.pagination) {
        setPagination(data.pagination);
      }

      const now = new Date();
      setLastUpdated(
        now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      );
    } catch (err: any) {
      console.error('[Payments Page Error]:', err);
      setError(err.message || 'An unexpected error occurred while loading payment data.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
      setIsFetchingPage(false);
    }
  }, [page, pageSize, statusFilter, methodFilter, debouncedSearch]);

  const isInitialMount = React.useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      fetchPaymentsData(false, false);
    } else {
      fetchPaymentsData(false, true);
    }
  }, [fetchPaymentsData]);

  // ── Fetch Reconciliation Data ──
  const fetchReconciliation = useCallback(async (isForceRefresh = false) => {
    if (isForceRefresh) setIsRefreshingReconciliation(true);
    else setIsLoadingReconciliation(true);

    try {
      const res = await fetch(`/api/steadfast/reconciliation${isForceRefresh ? '?forceRefresh=true' : ''}`);
      const data = await res.json();
      if (data.success) {
        setReconciliationRecords(data.records || []);
        if (data.summary) setReconciliationSummary(data.summary);
        if (data.coverage) setReconciliationCoverage(data.coverage);
      }
    } catch (err: any) {
      console.error('Reconciliation fetch error:', err);
    } finally {
      setIsLoadingReconciliation(false);
      setIsRefreshingReconciliation(false);
    }
  }, []);

  useEffect(() => {
    fetchReconciliation();
  }, [fetchReconciliation]);

  // ── Fetch Individual Batch Detail ──
  const handleOpenBatchDetails = async (batchId: string) => {
    setSelectedBatchId(batchId);
    setBatchDetails(null);
    setIsLoadingBatchDetails(true);
    setBatchModalSearch('');
    setShowRawJson(false);

    try {
      const res = await fetch(`/api/steadfast/payments/${encodeURIComponent(batchId)}`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to load batch details.');
      }
      setBatchDetails(data.payment);
    } catch (err: any) {
      console.error('Error fetching batch detail:', err);
    } finally {
      setIsLoadingBatchDetails(false);
    }
  };

  // ── View OMS Order ──
  const handleOpenOmsOrder = async (orderId: string) => {
    try {
      const order = await api.getOrderById(orderId);
      if (order) {
        setSelectedOmsOrder(order);
        setIsOrderModalOpen(true);
      }
    } catch (e) {
      console.error('Failed to fetch OMS order:', e);
    }
  };

  // ── Filtered Payments Batches ──
  // Payments are already queried and filtered by status, method, and search on the server
  const filteredBatches = useMemo(() => {
    return payments;
  }, [payments]);

  // ── Filtered Consignments ──
  const filteredConsignments = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();
    return recentConsignments.filter((c) => {
      if (deliveryStatusFilter !== 'all' && (c.status || '').toLowerCase() !== deliveryStatusFilter.toLowerCase()) {
        return false;
      }
      if (search) {
        const trackingMatch = (c.tracking_code || '').toLowerCase().includes(search);
        const cidMatch = String(c.consignment_id || '').toLowerCase().includes(search);
        const invoiceMatch = (c.invoice || '').toLowerCase().includes(search);
        const nameMatch = (c.recipient_name || '').toLowerCase().includes(search);
        const phoneMatch = (c.recipient_phone || '').includes(search);
        const omsIdMatch = (c.oms_order?.id || '').toLowerCase().includes(search);
        const omsProductMatch = (c.oms_order?.product_name || '').toLowerCase().includes(search);

        if (!trackingMatch && !cidMatch && !invoiceMatch && !nameMatch && !phoneMatch && !omsIdMatch && !omsProductMatch) {
          return false;
        }
      }
      return true;
    });
  }, [recentConsignments, deliveryStatusFilter, searchTerm]);

  // Consignments pagination
  useEffect(() => {
    setConsignmentPage(1);
  }, [deliveryStatusFilter, searchTerm]);

  const totalConsignmentPages = Math.max(1, Math.ceil(filteredConsignments.length / consignmentPageSize));

  const paginatedConsignments = useMemo(() => {
    const start = (consignmentPage - 1) * consignmentPageSize;
    return filteredConsignments.slice(start, start + consignmentPageSize);
  }, [filteredConsignments, consignmentPage, consignmentPageSize]);

  // ── Filtered Reconciliation Records ──
  const filteredReconRecords = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();
    return reconciliationRecords.filter((r) => {
      if (reconStatusFilter !== 'all') {
        if (reconStatusFilter === 'POTENTIALLY_UNSETTLED') {
          if (r.reconciliation_status !== 'POTENTIALLY_UNSETTLED' && r.reconciliation_status !== 'PARTIAL_UNSETTLED') {
            return false;
          }
        } else if (r.reconciliation_status !== reconStatusFilter) {
          return false;
        }
      }
      if (search) {
        const trackingMatch = (r.tracking_code || '').toLowerCase().includes(search);
        const cidMatch = String(r.consignment_id || '').includes(search);
        const omsIdMatch = (r.oms_order_id || '').toLowerCase().includes(search);
        const nameMatch = (r.customer_name || '').toLowerCase().includes(search);
        const phoneMatch = (r.customer_phone || '').includes(search);
        const batchMatch = (r.payment_batches || []).some((b) => b.toLowerCase().includes(search));
        if (!trackingMatch && !cidMatch && !omsIdMatch && !nameMatch && !phoneMatch && !batchMatch) {
          return false;
        }
      }
      return true;
    });
  }, [reconciliationRecords, reconStatusFilter, searchTerm]);

  // Reset page when filter or search changes
  useEffect(() => {
    setReconPage(1);
  }, [reconStatusFilter, searchTerm]);

  const totalReconPages = Math.max(1, Math.ceil(filteredReconRecords.length / reconPageSize));

  const paginatedReconRecords = useMemo(() => {
    const start = (reconPage - 1) * reconPageSize;
    return filteredReconRecords.slice(start, start + reconPageSize);
  }, [filteredReconRecords, reconPage, reconPageSize]);

  // ── Filtered Consignments in Modal ──
  const modalFilteredConsignments = useMemo(() => {
    if (!batchDetails?.consignments) return [];
    const q = batchModalSearch.trim().toLowerCase();
    if (!q) return batchDetails.consignments;
    return batchDetails.consignments.filter((c) => {
      return (
        (c.tracking_code || '').toLowerCase().includes(q) ||
        String(c.consignment_id || '').includes(q) ||
        (c.invoice || '').toLowerCase().includes(q) ||
        (c.recipient_name || '').toLowerCase().includes(q) ||
        (c.recipient_phone || '').includes(q) ||
        (c.oms_order?.id || '').toLowerCase().includes(q)
      );
    });
  }, [batchDetails, batchModalSearch]);

  const handleResetFilters = () => {
    setSearchTerm('');
    setDebouncedSearch('');
    setStatusFilter('all');
    setMethodFilter('all');
    setDeliveryStatusFilter('all');
    setReconStatusFilter('all');
    setPage(1);
    setReconPage(1);
    setConsignmentPage(1);
  };

  // ── Calculation Period / Date Range Memos ──
  const batchesDateRange = useMemo(() => {
    if (!payments || payments.length === 0) return null;
    let min: string | null = null;
    let max: string | null = null;
    payments.forEach((p) => {
      const d = p.paid_at || p.created_at;
      if (d) {
        if (!min || d < min) min = d;
        if (!max || d > max) max = d;
      }
    });
    if (!min || !max) return null;
    const d1 = new Date(min);
    const d2 = new Date(max);
    const days = Math.max(1, Math.round(Math.abs(d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24))) + 1;
    const format = (dt: Date) =>
      dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    return {
      start: format(d1),
      end: format(d2),
      days,
      label: `Last ${days} Days · ${format(d1)} – ${format(d2)}`
    };
  }, [payments]);

  const reconDateRange = useMemo(() => {
    if (!reconciliationCoverage.date_range_start || !reconciliationCoverage.date_range_end) return null;
    const d1 = new Date(reconciliationCoverage.date_range_start);
    const d2 = new Date(reconciliationCoverage.date_range_end);
    const days = Math.max(1, Math.round(Math.abs(d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24))) + 1;
    const format = (dt: Date) =>
      dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    return {
      start: format(d1),
      end: format(d2),
      days,
      label: `Last ${days} Days · ${format(d1)} – ${format(d2)}`
    };
  }, [reconciliationCoverage]);

  return (
    <div className="min-h-full bg-[#f8fafc] dark:bg-[#141414] text-slate-900 dark:text-[#f4f4f5] space-y-4 sm:space-y-6">
      {/* ── 1. Page Header ── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 pb-3 border-b border-slate-200/80 dark:border-white/[0.06]"
      >
        <div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-[#f4f4f5]">
            Payments
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-[#a1a1aa] mt-0.5">
            Steadfast payment settlements and COD collections.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center flex-wrap sm:flex-nowrap">
          {/* Live Status Indicator */}
          <div className="flex items-center gap-1.5 h-9 px-3 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>API Live</span>
          </div>

          {/* Last Updated Timestamp */}
          {lastUpdated && (
            <span className="hidden md:inline-flex items-center gap-1 text-xs font-medium text-slate-400">
              <Clock className="w-3 h-3" />
              <span>Updated {lastUpdated}</span>
            </span>
          )}

          {/* Refresh Button */}
          <button
            type="button"
            onClick={() => fetchPaymentsData(true)}
            disabled={isRefreshing || isLoading}
            className="flex items-center gap-2 h-9 px-3.5 text-xs sm:text-sm font-semibold text-indigo-600 dark:text-indigo-300 bg-white dark:bg-[#242424] border border-slate-200 dark:border-white/[0.06] rounded-xl hover:bg-slate-50 dark:hover:bg-[#2a2a2a] shadow-xs transition-all disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>
      </motion.div>

      {/* ── Error Banner ── */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 flex items-center justify-between gap-3 text-rose-800 dark:text-rose-200"
        >
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-600 dark:text-rose-400" />
            <p className="text-sm font-semibold">Unable to load payment statements.</p>
          </div>
          <button
            type="button"
            onClick={() => fetchPaymentsData(true)}
            className="px-3 py-1.5 bg-rose-600 text-white rounded-lg text-xs font-bold hover:bg-rose-700 transition-colors shadow-sm cursor-pointer"
          >
            Retry
          </button>
        </motion.div>
      )}

      {/* ── 2. Summary KPI Cards ── */}
      {activeView === 'reconciliation' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-4">
          {/* Recon Card 1: Eligible Delivered */}
          <Card className="p-3 sm:p-4 bg-white dark:bg-[#1c1c1e] border border-slate-200/80 dark:border-white/[0.06] rounded-xl sm:rounded-2xl shadow-xs relative overflow-hidden group hover:border-blue-500/30 transition-all min-w-0">
            <div className="flex items-center justify-between text-blue-600 dark:text-blue-400 mb-1.5 sm:mb-2">
              <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-[#a1a1aa] truncate">
                Eligible Delivered
              </span>
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-200/40 dark:border-blue-800/40 flex items-center justify-center flex-shrink-0">
                <Package className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="text-lg xs:text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-[#f4f4f5] tabular-nums truncate">
              {reconciliationSummary.eligible_delivered}
            </div>
            <div className="mt-0.5 sm:mt-1 text-[10px] sm:text-[11px] font-medium text-slate-500 dark:text-[#a1a1aa] truncate tabular-nums">
              ৳ {Number(reconciliationSummary.total_expected_collectible || 0).toLocaleString()}
            </div>
          </Card>

          {/* Recon Card 2: Settled / Paid */}
          <Card className="p-3 sm:p-4 bg-white dark:bg-[#1c1c1e] border border-emerald-500/20 dark:border-emerald-500/20 rounded-xl sm:rounded-2xl shadow-xs relative overflow-hidden group hover:border-emerald-500/40 transition-all min-w-0">
            <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 mb-1.5 sm:mb-2">
              <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-[#a1a1aa] truncate">
                Settled
              </span>
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border border-emerald-200/40 dark:border-emerald-800/40 flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="text-lg xs:text-xl sm:text-2xl font-extrabold tracking-tight text-emerald-600 dark:text-emerald-400 tabular-nums truncate">
              ৳ {Number(reconciliationSummary.total_settled_amount || 0).toLocaleString()}
            </div>
            <div className="mt-0.5 sm:mt-1 text-[10px] sm:text-[11px] font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1 truncate">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
              <span className="truncate">{reconciliationSummary.settled_count} paid</span>
            </div>
          </Card>

          {/* Recon Card 3: Potentially Unsettled */}
          <Card className="p-3 sm:p-4 bg-white dark:bg-[#1c1c1e] border border-amber-200/80 dark:border-amber-900/50 rounded-xl sm:rounded-2xl shadow-xs relative overflow-hidden group bg-gradient-to-br from-white via-white to-amber-500/5 dark:from-[#1c1c1e] dark:via-[#1c1c1e] dark:to-amber-500/10 hover:border-amber-500/40 transition-all min-w-0">
            <div className="flex items-center justify-between text-amber-600 dark:text-amber-400 mb-1.5 sm:mb-2">
              <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 truncate">
                Unsettled
              </span>
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 border border-amber-200/40 dark:border-amber-800/40 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="text-lg xs:text-xl sm:text-2xl font-extrabold tracking-tight text-amber-600 dark:text-amber-400 tabular-nums truncate">
              ৳ {Number(reconciliationSummary.total_potentially_unsettled_amount || 0).toLocaleString()}
            </div>
            <div className="mt-0.5 sm:mt-1 text-[10px] sm:text-[11px] font-semibold text-amber-600 dark:text-amber-400 truncate">
              {reconciliationSummary.potentially_unsettled_count} pending
            </div>
          </Card>

          {/* Recon Card 4: In Processing Queue */}
          <Card className="p-3 sm:p-4 bg-white dark:bg-[#1c1c1e] border border-slate-200/80 dark:border-white/[0.06] rounded-xl sm:rounded-2xl shadow-xs relative overflow-hidden group hover:border-indigo-500/30 transition-all min-w-0">
            <div className="flex items-center justify-between text-indigo-600 dark:text-indigo-400 mb-1.5 sm:mb-2">
              <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-[#a1a1aa] truncate">
                Processing
              </span>
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-200/40 dark:border-indigo-800/40 flex items-center justify-center flex-shrink-0">
                <Clock className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="text-lg xs:text-xl sm:text-2xl font-extrabold tracking-tight text-indigo-600 dark:text-indigo-400 tabular-nums truncate">
              ৳ {Number(reconciliationSummary.total_processing_amount || 0).toLocaleString()}
            </div>
            <div className="mt-0.5 sm:mt-1 text-[10px] sm:text-[11px] font-medium text-slate-500 dark:text-[#a1a1aa] truncate">
              {reconciliationSummary.processing_count} in queue
            </div>
          </Card>

          {/* Recon Card 5: Partial Delivered */}
          <Card className="p-3 sm:p-4 bg-white dark:bg-[#1c1c1e] border border-slate-200/80 dark:border-white/[0.06] rounded-xl sm:rounded-2xl shadow-xs relative overflow-hidden group hover:border-purple-500/30 transition-all min-w-0">
            <div className="flex items-center justify-between text-purple-600 dark:text-purple-400 mb-1.5 sm:mb-2">
              <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-[#a1a1aa] truncate">
                Partial
              </span>
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400 border border-purple-200/40 dark:border-purple-800/40 flex items-center justify-center flex-shrink-0">
                <Layers className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="text-lg xs:text-xl sm:text-2xl font-extrabold tracking-tight text-purple-600 dark:text-purple-400 tabular-nums truncate">
              {reconciliationSummary.partial_delivered}
            </div>
            <div className="mt-0.5 sm:mt-1 text-[10px] sm:text-[11px] font-medium text-slate-500 dark:text-[#a1a1aa] truncate">
              Rate adjusted
            </div>
          </Card>

          {/* Recon Card 6: Returns / Excluded */}
          <Card className="p-3 sm:p-4 bg-white dark:bg-[#1c1c1e] border border-slate-200/80 dark:border-white/[0.06] rounded-xl sm:rounded-2xl shadow-xs relative overflow-hidden group hover:border-slate-500/30 transition-all min-w-0">
            <div className="flex items-center justify-between text-slate-500 dark:text-[#a1a1aa] mb-1.5 sm:mb-2">
              <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-[#a1a1aa] truncate">
                Cancelled
              </span>
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-slate-100 dark:bg-[#242424] text-slate-600 dark:text-[#a1a1aa] border border-slate-200 dark:border-white/[0.06] flex items-center justify-center flex-shrink-0">
                <RotateCcw className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="text-lg xs:text-xl sm:text-2xl font-extrabold tracking-tight text-slate-700 dark:text-[#a1a1aa] tabular-nums truncate">
              {reconciliationSummary.not_eligible_count}
            </div>
            <div className="mt-0.5 sm:mt-1 text-[10px] sm:text-[11px] font-medium text-slate-500 dark:text-[#a1a1aa] truncate">
              Fee deducted
            </div>
          </Card>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-4">
          {/* Card 1: Available Balance */}
          <Card className="p-3 sm:p-4 bg-white dark:bg-[#1c1c1e] border border-slate-200/80 dark:border-white/[0.06] rounded-xl sm:rounded-2xl shadow-xs relative overflow-hidden group hover:border-indigo-500/30 transition-all min-w-0">
            <div className="flex items-center justify-between text-indigo-600 dark:text-indigo-400 mb-1.5 sm:mb-2">
              <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-[#a1a1aa] truncate">
                Live Balance
              </span>
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-200/40 dark:border-indigo-800/40 flex items-center justify-center flex-shrink-0">
                <Wallet className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="text-lg xs:text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-[#f4f4f5] tabular-nums truncate">
              ৳ {Number(balance || 0).toLocaleString()}
            </div>
            <div className="mt-0.5 sm:mt-1 text-[10px] sm:text-[11px] font-medium text-slate-500 dark:text-[#a1a1aa] truncate">
              Steadfast Account
            </div>
          </Card>

          {/* Card 2: Total Disbursed COD */}
          <Card className="p-3 sm:p-4 bg-white dark:bg-[#1c1c1e] border border-slate-200/80 dark:border-white/[0.06] rounded-xl sm:rounded-2xl shadow-xs relative overflow-hidden group hover:border-blue-500/30 transition-all min-w-0">
            <div className="flex items-center justify-between text-blue-600 dark:text-blue-400 mb-1.5 sm:mb-2">
              <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-[#a1a1aa] truncate">
                Gross COD
              </span>
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-200/40 dark:border-blue-800/40 flex items-center justify-center flex-shrink-0">
                <ArrowDownLeft className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="text-lg xs:text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-[#f4f4f5] tabular-nums truncate">
              ৳ {Number(summary.total_disbursed_cod || 0).toLocaleString()}
            </div>
            <div className="mt-0.5 sm:mt-1 text-[10px] sm:text-[11px] font-medium text-slate-500 dark:text-[#a1a1aa] truncate">
              Total collected
            </div>
          </Card>

          {/* Card 3: Net Received Payout */}
          <Card className="p-3 sm:p-4 bg-white dark:bg-[#1c1c1e] border border-emerald-500/20 dark:border-emerald-500/20 rounded-xl sm:rounded-2xl shadow-xs relative overflow-hidden group hover:border-emerald-500/40 transition-all min-w-0">
            <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 mb-1.5 sm:mb-2">
              <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-[#a1a1aa] truncate">
                Net Received
              </span>
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border border-emerald-200/40 dark:border-emerald-800/40 flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="text-lg xs:text-xl sm:text-2xl font-extrabold tracking-tight text-emerald-600 dark:text-emerald-400 tabular-nums truncate">
              ৳ {Number(summary.total_net_payout || 0).toLocaleString()}
            </div>
            <div className="mt-0.5 sm:mt-1 text-[10px] sm:text-[11px] font-medium text-emerald-600 dark:text-emerald-400 truncate">
              After fees
            </div>
          </Card>

          {/* Card 4: Courier Charges */}
          <Card className="p-3 sm:p-4 bg-white dark:bg-[#1c1c1e] border border-slate-200/80 dark:border-white/[0.06] rounded-xl sm:rounded-2xl shadow-xs relative overflow-hidden group hover:border-rose-500/30 transition-all min-w-0">
            <div className="flex items-center justify-between text-rose-500 dark:text-rose-400 mb-1.5 sm:mb-2">
              <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-[#a1a1aa] truncate">
                Deductions
              </span>
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 border border-rose-200/40 dark:border-rose-800/40 flex items-center justify-center flex-shrink-0">
                <Receipt className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="text-lg xs:text-xl sm:text-2xl font-extrabold tracking-tight text-rose-600 dark:text-rose-400 tabular-nums truncate">
              -৳ {Number(summary.total_charges || 0).toLocaleString()}
            </div>
            <div className="mt-0.5 sm:mt-1 text-[10px] sm:text-[11px] font-medium text-slate-500 dark:text-[#a1a1aa] truncate">
              Courier fees
            </div>
          </Card>

          {/* Card 5: Due / Adjusting Bills */}
          <Card className="p-3 sm:p-4 bg-white dark:bg-[#1c1c1e] border border-slate-200/80 dark:border-white/[0.06] rounded-xl sm:rounded-2xl shadow-xs relative overflow-hidden group hover:border-amber-500/30 transition-all min-w-0">
            <div className="flex items-center justify-between text-amber-500 dark:text-amber-400 mb-1.5 sm:mb-2">
              <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-[#a1a1aa] truncate">
                Due Bills
              </span>
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 border border-amber-200/40 dark:border-amber-800/40 flex items-center justify-center flex-shrink-0">
                <Clock className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="text-lg xs:text-xl sm:text-2xl font-extrabold tracking-tight text-amber-600 dark:text-amber-400 tabular-nums truncate">
              ৳ {Number(summary.total_due_bills || 0).toLocaleString()}
            </div>
            <div className="mt-0.5 sm:mt-1 text-[10px] sm:text-[11px] font-medium text-slate-500 dark:text-[#a1a1aa] truncate">
              Outstanding
            </div>
          </Card>

          {/* Card 6: Statements */}
          <Card className="p-3 sm:p-4 bg-white dark:bg-[#1c1c1e] border border-slate-200/80 dark:border-white/[0.06] rounded-xl sm:rounded-2xl shadow-xs relative overflow-hidden group hover:border-slate-400/40 transition-all min-w-0">
            <div className="flex items-center justify-between text-slate-600 dark:text-[#a1a1aa] mb-1.5 sm:mb-2">
              <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-[#a1a1aa] truncate">
                Statements
              </span>
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-slate-100 dark:bg-[#242424] text-slate-600 dark:text-[#a1a1aa] border border-slate-200 dark:border-white/[0.06] flex items-center justify-center flex-shrink-0">
                <Layers className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="text-lg xs:text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-[#f4f4f5] tabular-nums truncate">
              {payments.length}{' '}
              <span className="text-xs font-normal text-slate-400">
                / {pagination.totalCount || summary.total_batches || 551}
              </span>
            </div>
            <div className="mt-0.5 sm:mt-1 text-[10px] sm:text-[11px] font-medium text-slate-500 dark:text-[#a1a1aa] truncate">
              Page {pagination.currentPage} of {pagination.totalPages}
            </div>
          </Card>
        </div>
      )}

      {/* ── High-Priority Alert: Potentially Unsettled Courier Payments ── */}
      {activeView === 'reconciliation' && reconciliationSummary.potentially_unsettled_count > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-3.5 sm:p-5 rounded-2xl bg-gradient-to-r from-amber-500/10 via-rose-500/10 to-transparent border border-amber-500/30 dark:border-amber-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 sm:gap-4 shadow-sm"
        >
          <div className="flex items-start sm:items-center gap-3">
            <div className="p-2 sm:p-2.5 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5 sm:mt-0">
              <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-[#f4f4f5] flex flex-wrap items-center gap-1.5 sm:gap-2">
                <span>Potentially Unsettled Courier Payments</span>
                <span className="px-2 py-0.5 text-xs font-extrabold rounded-full bg-rose-600 text-white shadow-sm">
                  {reconciliationSummary.potentially_unsettled_count} Parcels
                </span>
              </h2>
              <p className="text-xs text-slate-600 dark:text-[#a1a1aa] mt-1 leading-relaxed">
                {reconciliationSummary.potentially_unsettled_count} delivered parcel{reconciliationSummary.potentially_unsettled_count > 1 ? 's have' : ' has'} no matching settled payment in active statements. Estimated <strong className="text-amber-600 dark:text-amber-400 font-bold">৳ {reconciliationSummary.total_potentially_unsettled_amount.toLocaleString()}</strong> awaiting subsequent disbursement.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 flex-shrink-0 w-full sm:w-auto pt-1 sm:pt-0">
            <button
              type="button"
              onClick={() => setReconStatusFilter('POTENTIALLY_UNSETTLED')}
              className="h-10 px-3 sm:px-4 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Review ({reconciliationSummary.potentially_unsettled_count})</span>
            </button>
            <button
              type="button"
              onClick={() => fetchReconciliation(true)}
              disabled={isRefreshingReconciliation || isLoadingReconciliation}
              className="h-10 px-3 bg-white dark:bg-[#242424] border border-slate-200 dark:border-white/[0.06] rounded-xl text-xs font-bold text-slate-700 dark:text-[#a1a1aa] hover:bg-slate-50 dark:hover:bg-[#2a2a2a] transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingReconciliation ? 'animate-spin' : ''}`} />
              <span>{isRefreshingReconciliation ? 'Running...' : 'Re-Run'}</span>
            </button>
          </div>
        </motion.div>
      )}

      {/* ── 3. View Switcher & Control Bar ── */}
      <div className="bg-white dark:bg-[#1c1c1e] p-3 sm:p-4 rounded-2xl border border-slate-200/80 dark:border-white/[0.06] shadow-xs space-y-3 sm:space-y-4">
        {/* Top Controls: View Segmented Control */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 sm:gap-3">
          <div className="flex items-center p-1 bg-slate-100 dark:bg-[#141414] rounded-xl overflow-x-auto max-w-full gap-1 border border-slate-200/60 dark:border-white/[0.06] shrink-0 [scrollbar-width:none] [-webkit-overflow-scrolling:touch]">
            <button
              type="button"
              onClick={() => setActiveView('batches')}
              className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 h-9 sm:h-10 rounded-lg text-xs sm:text-sm font-semibold whitespace-nowrap transition-all cursor-pointer shrink-0 ${
                activeView === 'batches'
                  ? 'bg-white dark:bg-[#242424] text-indigo-600 dark:text-indigo-400 shadow-xs font-bold'
                  : 'text-slate-600 dark:text-[#a1a1aa] hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <CreditCard className="w-4 h-4 flex-shrink-0" />
              <span>Payment Batches</span>
              <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-slate-200/70 dark:bg-[#1c1c1e] text-slate-700 dark:text-[#a1a1aa]">
                {pagination.totalCount || payments.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveView('consignments')}
              className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 h-9 sm:h-10 rounded-lg text-xs sm:text-sm font-semibold whitespace-nowrap transition-all cursor-pointer shrink-0 ${
                activeView === 'consignments'
                  ? 'bg-white dark:bg-[#242424] text-indigo-600 dark:text-indigo-400 shadow-xs font-bold'
                  : 'text-slate-600 dark:text-[#a1a1aa] hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Package className="w-4 h-4 flex-shrink-0" />
              <span>Order Collections</span>
              <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-slate-200/70 dark:bg-[#1c1c1e] text-slate-700 dark:text-[#a1a1aa]">
                {filteredConsignments.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveView('reconciliation')}
              className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 h-9 sm:h-10 rounded-lg text-xs sm:text-sm font-semibold whitespace-nowrap transition-all cursor-pointer shrink-0 ${
                activeView === 'reconciliation'
                  ? 'bg-white dark:bg-[#242424] text-indigo-600 dark:text-indigo-400 shadow-xs font-bold'
                  : 'text-slate-600 dark:text-[#a1a1aa] hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Scale className="w-4 h-4 flex-shrink-0" />
              <span>Reconciliation</span>
              {reconciliationSummary.potentially_unsettled_count > 0 ? (
                <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950/70 dark:text-rose-300 animate-pulse">
                  {reconciliationSummary.potentially_unsettled_count}
                </span>
              ) : (
                <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300">
                  {reconciliationSummary.settled_count}
                </span>
              )}
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs w-full lg:w-auto">
            {activeView === 'reconciliation' ? (
              reconDateRange && (
                <div className="flex items-center justify-center sm:justify-start gap-1.5 px-3 py-1.5 sm:py-2 rounded-xl bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200/60 dark:border-indigo-800/60 text-indigo-700 dark:text-indigo-300 font-medium text-xs w-full sm:w-auto">
                  <Calendar className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />
                  <span className="truncate">Last {reconDateRange.days} Days · {reconDateRange.start} – {reconDateRange.end}</span>
                </div>
              )
            ) : (
              batchesDateRange && (
                <div className="flex items-center justify-center sm:justify-start gap-1.5 px-3 py-1.5 sm:py-2 rounded-xl bg-slate-100 dark:bg-[#242424] border border-slate-200/80 dark:border-white/[0.06] text-slate-600 dark:text-[#a1a1aa] font-medium text-xs w-full sm:w-auto">
                  <Calendar className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                  <span className="truncate">Last {batchesDateRange.days} Days · {batchesDateRange.start} – {batchesDateRange.end}</span>
                </div>
              )
            )}
          </div>
        </div>

        {/* Filter Controls Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-12 gap-2.5 sm:gap-3 pt-3 border-t border-slate-100 dark:border-white/[0.06]">
          {/* Search Input */}
          <div className={`${activeView === 'batches' ? 'col-span-2 lg:col-span-5' : 'col-span-2 lg:col-span-6'} relative`}>
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={
                activeView === 'batches'
                  ? 'Search payments...'
                  : activeView === 'consignments'
                  ? 'Search consignments...'
                  : 'Search reconciliation...'
              }
              className="w-full h-10 pl-10 pr-9 py-2 bg-slate-50 dark:bg-[#141414] border border-slate-200 dark:border-white/[0.06] rounded-xl text-xs sm:text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-slate-900 dark:text-[#f4f4f5]"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-[#f4f4f5] p-1"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Status Filter */}
          {activeView === 'batches' ? (
            <div className="col-span-1 lg:col-span-3">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                aria-label="Filter payment status"
                className="w-full h-10 px-3 py-2 bg-slate-50 dark:bg-[#141414] border border-slate-200 dark:border-white/[0.06] rounded-xl text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-slate-800 dark:text-[#f4f4f5] cursor-pointer"
              >
                <option value="all">All Statuses</option>
                <option value="paid">Paid</option>
                <option value="processing">Processing</option>
                <option value="pending">Pending</option>
              </select>
            </div>
          ) : activeView === 'consignments' ? (
            <div className="col-span-2 sm:col-span-1 lg:col-span-3">
              <select
                value={deliveryStatusFilter}
                onChange={(e) => setDeliveryStatusFilter(e.target.value)}
                aria-label="Filter parcel delivery status"
                className="w-full h-10 px-3 py-2 bg-slate-50 dark:bg-[#141414] border border-slate-200 dark:border-white/[0.06] rounded-xl text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-slate-800 dark:text-[#f4f4f5] cursor-pointer"
              >
                <option value="all">All Statuses</option>
                <option value="delivered">Delivered</option>
                <option value="cancelled">Cancelled</option>
                <option value="in_review">In Transit</option>
              </select>
            </div>
          ) : (
            <div className="col-span-2 sm:col-span-1 lg:col-span-3">
              <select
                value={reconStatusFilter}
                onChange={(e) => setReconStatusFilter(e.target.value)}
                aria-label="Filter reconciliation status"
                className="w-full h-10 px-3 py-2 bg-slate-50 dark:bg-[#141414] border border-slate-200 dark:border-white/[0.06] rounded-xl text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-slate-800 dark:text-[#f4f4f5] cursor-pointer"
              >
                <option value="all">All Records ({reconciliationRecords.length})</option>
                <option value="POTENTIALLY_UNSETTLED">Potentially Unsettled ({reconciliationSummary.potentially_unsettled_count})</option>
                <option value="SETTLED">Settled ({reconciliationSummary.settled_count})</option>
                <option value="PROCESSING">Processing ({reconciliationSummary.processing_count})</option>
                <option value="PARTIALLY_PAID">Partially Paid ({reconciliationSummary.partially_paid_count})</option>
                <option value="MANUAL_VERIFICATION">Manual Verification ({reconciliationSummary.manual_verification_count})</option>
                <option value="NOT_ELIGIBLE">Cancelled / Returns ({reconciliationSummary.not_eligible_count})</option>
              </select>
            </div>
          )}

          {/* Method Filter (for batches) or Quick Info */}
          {activeView === 'batches' ? (
            <div className="col-span-1 lg:col-span-2">
              <select
                value={methodFilter}
                onChange={(e) => setMethodFilter(e.target.value)}
                aria-label="Filter disbursement method"
                className="w-full h-10 px-3 py-2 bg-slate-50 dark:bg-[#141414] border border-slate-200 dark:border-white/[0.06] rounded-xl text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-slate-800 dark:text-[#f4f4f5] cursor-pointer"
              >
                <option value="all">All Methods</option>
                <option value="Bank">Bank Transfer</option>
                <option value="Cash">Cash</option>
              </select>
            </div>
          ) : (
            <div className="hidden lg:flex lg:col-span-2 items-center justify-center">
              <span className="text-xs text-slate-500 dark:text-[#a1a1aa] font-medium flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-indigo-500" /> Auto-Mapped OMS
              </span>
            </div>
          )}

          {/* Page Size Selector (for Batches) */}
          {activeView === 'batches' ? (
            <div className="col-span-1 lg:col-span-1">
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                aria-label="Page size"
                className="w-full h-10 px-2 py-2 bg-slate-50 dark:bg-[#141414] border border-slate-200 dark:border-white/[0.06] rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-slate-800 dark:text-[#f4f4f5] cursor-pointer"
              >
                <option value={20}>20 / p</option>
                <option value={50}>50 / p</option>
                <option value={100}>100 / p</option>
              </select>
            </div>
          ) : null}

          {/* Reset Button */}
          <div className={`${activeView === 'batches' ? 'col-span-1 lg:col-span-1' : 'col-span-2 sm:col-span-1 lg:col-span-1'} flex items-center`}>
            <button
              type="button"
              onClick={handleResetFilters}
              title="Reset search and filters"
              className="w-full h-10 py-2 px-3 bg-slate-100 dark:bg-[#242424] text-slate-600 dark:text-[#a1a1aa] hover:bg-slate-200 dark:hover:bg-[#2a2a2a] rounded-xl text-xs font-semibold transition-all text-center flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Filter className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── 4. Main Table / Content Area ── */}
      {isLoading ? (
        <div className="bg-white dark:bg-[#1c1c1e] rounded-2xl border border-slate-200/80 dark:border-white/[0.06] p-8 flex flex-col items-center justify-center gap-3 min-h-[350px]">
          <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin" />
          <p className="text-sm font-semibold text-slate-600 dark:text-[#a1a1aa]">
            Loading payments...
          </p>
        </div>
      ) : activeView === 'batches' ? (
        /* ── VIEW 1: PAYMENT BATCHES TABLE & CARDS ── */
        <div className="space-y-3">
          {/* Compact Coverage Indicator for Batches */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-2 px-3.5 sm:px-4 py-2.5 bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200/50 dark:border-indigo-900/30 rounded-xl text-xs text-indigo-900 dark:text-indigo-300">
            <div className="flex items-center gap-2">
              <Info className="w-3.5 h-3.5 flex-shrink-0 text-indigo-600 dark:text-indigo-400" />
              <span>
                <strong>Payment coverage:</strong> {pagination.totalCount || summary.total_batches || 551} statements{batchesDateRange ? ` · ${batchesDateRange.start} – ${batchesDateRange.end}` : ''}
              </span>
            </div>
            <span className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 flex items-center gap-1">
              <span className="text-slate-500 dark:text-[#a1a1aa] font-normal">Disbursed COD:</span> ৳{Number(summary.total_disbursed_cod || 0).toLocaleString()}
            </span>
          </div>

          <div className="bg-white dark:bg-[#1c1c1e] rounded-2xl border border-slate-200/80 dark:border-white/[0.06] shadow-xs overflow-hidden relative">
            {/* Non-blocking page loading overlay */}
            {isFetchingPage && (
              <div className="absolute inset-0 bg-white/60 dark:bg-[#1c1c1e]/60 backdrop-blur-[1px] z-20 flex items-center justify-center transition-all">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white dark:bg-[#242424] shadow-lg border border-slate-200/80 dark:border-white/[0.06] text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Loading payments...</span>
                </div>
              </div>
            )}

            {/* Desktop Table View (Hidden on <1024px) */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200/80 dark:border-white/[0.06] bg-slate-50/70 dark:bg-[#1c1c1e] text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-[#a1a1aa]">
                    <th className="py-3 px-4 sm:px-6">PAYMENT ID</th>
                    <th className="py-3 px-4">GROSS COD</th>
                    <th className="py-3 px-4">COURIER CHARGES</th>
                    <th className="py-3 px-4">DUE BILLS</th>
                    <th className="py-3 px-4">NET TRANSFER</th>
                    <th className="py-3 px-4">METHOD</th>
                    <th className="py-3 px-4">STATUS</th>
                    <th className="py-3 px-4">CONSIGNMENTS</th>
                    <th className="py-3 px-4">DATE</th>
                    <th className="py-3 px-4 text-right">ACTION</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/[0.04] text-xs sm:text-sm">
                  {filteredBatches.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-16 text-center text-slate-500 dark:text-[#a1a1aa]">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <CreditCard className="w-8 h-8 text-slate-300 dark:text-[#52525b]" />
                          <p className="font-semibold text-sm">No payment statements found.</p>
                          <button
                            type="button"
                            onClick={handleResetFilters}
                            className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold hover:underline mt-1 cursor-pointer"
                          >
                            Clear filters
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredBatches.map((batch) => {
                      const statusLower = (batch.status_label || '').toLowerCase();
                      const isPaid = statusLower === 'paid';
                      const isProcessing = statusLower === 'processing';

                      return (
                        <tr
                          key={batch.payment_id}
                          onClick={() => handleOpenBatchDetails(batch.payment_id)}
                          className="hover:bg-slate-50/80 dark:hover:bg-[#242424] transition-colors cursor-pointer group h-[58px]"
                        >
                          {/* Statement ID */}
                          <td className="py-3 px-4 sm:px-6 font-mono font-bold text-slate-900 dark:text-[#f4f4f5]">
                            <div className="flex items-center gap-2">
                              <span className="px-2.5 py-1 rounded-md bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/50 text-xs font-mono">
                                {batch.payment_id}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  copyToClipboard(batch.payment_id, batch.payment_id);
                                }}
                                className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-slate-700 dark:hover:text-[#f4f4f5] transition-opacity p-1 rounded hover:bg-slate-100 dark:hover:bg-[#242424] cursor-pointer"
                                title="Copy Statement ID"
                              >
                                {copiedKey === batch.payment_id ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          </td>

                          {/* Gross COD */}
                          <td className="py-3 px-4 font-semibold text-slate-900 dark:text-[#f4f4f5]">
                            ৳ {Number(batch.amount || 0).toLocaleString()}
                          </td>

                          {/* Charges */}
                          <td className="py-3 px-4 font-medium text-rose-600 dark:text-rose-400">
                            {Number(batch.charges || 0) > 0 ? `-৳ ${Number(batch.charges || 0).toLocaleString()}` : '৳ 0'}
                          </td>

                          {/* Due Bills */}
                          <td className="py-3 px-4 font-medium text-amber-600 dark:text-amber-400">
                            {Number(batch.due_bills || 0) > 0 ? `-৳ ${Number(batch.due_bills || 0).toLocaleString()}` : '—'}
                          </td>

                          {/* Net Transfer */}
                          <td className="py-3 px-4 font-bold text-emerald-600 dark:text-emerald-400">
                            ৳ {Number(batch.total || 0).toLocaleString()}
                          </td>

                          {/* Method */}
                          <td className="py-3 px-4">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-[#242424] text-slate-700 dark:text-[#a1a1aa] border border-slate-200/60 dark:border-white/[0.06]">
                              {batch.method || 'Standard'}
                            </span>
                          </td>

                          {/* Status */}
                          <td className="py-3 px-4">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold capitalize ${
                                isPaid
                                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/60'
                                  : isProcessing
                                  ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/60'
                                  : 'bg-slate-100 dark:bg-[#242424] text-slate-700 dark:text-[#a1a1aa] border border-slate-200 dark:border-white/[0.06]'
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  isPaid ? 'bg-emerald-500' : isProcessing ? 'bg-amber-500 animate-pulse' : 'bg-slate-400'
                                }`}
                              />
                              {batch.status_label || 'Pending'}
                            </span>
                          </td>

                          {/* Consignments Count */}
                          <td className="py-3 px-4">
                            {batch.consignment_count !== undefined ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 border border-indigo-200/50 dark:border-indigo-800/50">
                                {batch.consignment_count} parcels
                              </span>
                            ) : (
                              <span className="text-slate-400 text-xs">Included</span>
                            )}
                          </td>

                          {/* Date */}
                          <td className="py-3 px-4 text-xs text-slate-500 dark:text-[#a1a1aa] whitespace-nowrap">
                            {batch.paid_at || batch.created_at || '—'}
                          </td>

                          {/* Action */}
                          <td className="py-3 px-4 text-right">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenBatchDetails(batch.payment_id);
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-colors shadow-xs cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>Inspect</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile Card List View (Visible on <1024px) */}
            <div className="block lg:hidden divide-y divide-slate-100 dark:divide-white/[0.06]">
              {filteredBatches.length === 0 ? (
                <div className="py-12 px-4 text-center text-slate-500 dark:text-[#a1a1aa]">
                  <CreditCard className="w-8 h-8 text-slate-300 dark:text-[#52525b] mx-auto mb-2" />
                  <p className="font-semibold text-sm">No payment statements found.</p>
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold hover:underline mt-2 inline-block cursor-pointer"
                  >
                    Clear filters
                  </button>
                </div>
              ) : (
                filteredBatches.map((batch) => {
                  const statusLower = (batch.status_label || '').toLowerCase();
                  const isPaid = statusLower === 'paid';
                  const isProcessing = statusLower === 'processing';

                  return (
                    <div
                      key={batch.payment_id}
                      onClick={() => handleOpenBatchDetails(batch.payment_id)}
                      className="p-3.5 sm:p-4 hover:bg-slate-50/70 dark:hover:bg-[#242424]/40 transition-colors space-y-3 cursor-pointer"
                    >
                      {/* Top Row: Payment ID badge & Copy, Status Pill */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className="px-2.5 py-1 rounded-md bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/50 text-xs font-mono font-bold">
                            {batch.payment_id}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              copyToClipboard(batch.payment_id, batch.payment_id);
                            }}
                            className="text-slate-400 hover:text-slate-700 dark:hover:text-[#f4f4f5] p-1 rounded hover:bg-slate-100 dark:hover:bg-[#242424] cursor-pointer"
                            title="Copy Statement ID"
                          >
                            {copiedKey === batch.payment_id ? (
                              <Check className="w-3.5 h-3.5 text-emerald-500" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>

                        {/* Status */}
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold capitalize ${
                            isPaid
                              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/60'
                              : isProcessing
                              ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/60'
                              : 'bg-slate-100 dark:bg-[#242424] text-slate-700 dark:text-[#a1a1aa] border border-slate-200 dark:border-white/[0.06]'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              isPaid ? 'bg-emerald-500' : isProcessing ? 'bg-amber-500 animate-pulse' : 'bg-slate-400'
                            }`}
                          />
                          {batch.status_label || 'Pending'}
                        </span>
                      </div>

                      {/* Middle: Financial Ledger Breakdown */}
                      <div className="grid grid-cols-2 gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-[#141414] border border-slate-100 dark:border-white/[0.04] text-xs">
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Gross COD</span>
                          <div className="font-bold text-slate-900 dark:text-[#f4f4f5] text-sm tabular-nums mt-0.5">
                            ৳ {Number(batch.amount || 0).toLocaleString()}
                          </div>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Net Transfer</span>
                          <div className="font-extrabold text-emerald-600 dark:text-emerald-400 text-sm tabular-nums mt-0.5">
                            ৳ {Number(batch.total || 0).toLocaleString()}
                          </div>
                        </div>
                        <div className="pt-1.5 border-t border-slate-200/60 dark:border-white/[0.04]">
                          <span className="text-[10px] font-medium text-slate-400">Courier Charges:</span>
                          <span className="ml-1 font-semibold text-rose-600 dark:text-rose-400 tabular-nums">
                            {Number(batch.charges || 0) > 0 ? `-৳ ${Number(batch.charges || 0).toLocaleString()}` : '৳ 0'}
                          </span>
                        </div>
                        <div className="pt-1.5 border-t border-slate-200/60 dark:border-white/[0.04]">
                          <span className="text-[10px] font-medium text-slate-400">Due Bills:</span>
                          <span className="ml-1 font-semibold text-amber-600 dark:text-amber-400 tabular-nums">
                            {Number(batch.due_bills || 0) > 0 ? `-৳ ${Number(batch.due_bills || 0).toLocaleString()}` : '—'}
                          </span>
                        </div>
                      </div>

                      {/* Bottom Row: Metadata & Inspect Button */}
                      <div className="flex items-center justify-between gap-2 pt-0.5 text-xs text-slate-500 dark:text-[#a1a1aa]">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 dark:bg-[#242424] text-slate-700 dark:text-[#a1a1aa]">
                            {batch.method || 'Standard'}
                          </span>
                          {batch.consignment_count !== undefined && (
                            <span className="text-[11px] text-indigo-600 dark:text-indigo-400 font-medium">
                              {batch.consignment_count} parcels
                            </span>
                          )}
                          <span className="text-[11px] text-slate-400">
                            {batch.paid_at || batch.created_at || '—'}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenBatchDetails(batch.payment_id);
                          }}
                          className="h-8 px-3 rounded-lg text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-colors shadow-xs cursor-pointer shrink-0 flex items-center gap-1.5"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Inspect</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Smart Financial Pagination Bar (Desktop >= 768px) */}
            <div className="hidden md:flex p-4 border-t border-slate-100 dark:border-white/[0.06] bg-white/80 dark:bg-[#1c1c1e]/80 items-center justify-between gap-4 text-xs font-medium text-slate-500 dark:text-[#a1a1aa]">
              {/* Left: Range and Total */}
              <div className="flex items-center gap-1.5">
                <span>
                  Showing{' '}
                  <strong className="text-slate-900 dark:text-[#f4f4f5] font-semibold">
                    {pagination.totalCount === 0 ? 0 : (pagination.currentPage - 1) * pagination.pageSize + 1}
                  </strong>
                  –
                  <strong className="text-slate-900 dark:text-[#f4f4f5] font-semibold">
                    {Math.min(pagination.currentPage * pagination.pageSize, pagination.totalCount)}
                  </strong>{' '}
                  of{' '}
                  <strong className="text-slate-900 dark:text-[#f4f4f5] font-semibold">
                    {pagination.totalCount.toLocaleString()}
                  </strong>
                </span>
              </div>

              {/* Center: Numbered Page Buttons with Smart Ellipsis */}
              <div className="flex items-center justify-center gap-1 flex-wrap">
                {generatePaginationPages(pagination.currentPage, pagination.totalPages).map((p, idx) =>
                  p === '...' ? (
                    <span key={`ellipsis-${idx}`} className="px-2 text-slate-400 select-none">
                      ...
                    </span>
                  ) : (
                    <button
                      key={p}
                      type="button"
                      disabled={isFetchingPage}
                      onClick={() => setPage(Number(p))}
                      className={`min-w-[32px] h-8 px-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                        pagination.currentPage === p
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'text-slate-600 dark:text-[#a1a1aa] hover:bg-slate-100 dark:hover:bg-[#242424]'
                      }`}
                    >
                      {p}
                    </button>
                  )
                )}
              </div>

              {/* Right: Page Size & Prev/Next */}
              <div className="flex items-center justify-end gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400 text-[11px]">Rows:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                    aria-label="Statements per page"
                    className="px-2 py-1 bg-slate-50 dark:bg-[#242424] border border-slate-200 dark:border-white/[0.06] rounded-lg text-xs font-semibold text-slate-700 dark:text-[#f4f4f5] focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                  >
                    <option value={20}>20 / page</option>
                    <option value={50}>50 / page</option>
                    <option value={100}>100 / page</option>
                  </select>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={!pagination.hasPrevPage || isFetchingPage}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#242424] hover:bg-slate-50 dark:hover:bg-[#2a2a2a]/60 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1 font-semibold text-slate-700 dark:text-[#f4f4f5] shadow-xs cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>Previous</span>
                  </button>

                  <button
                    type="button"
                    disabled={!pagination.hasNextPage || isFetchingPage}
                    onClick={() => setPage((p) => p + 1)}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#242424] hover:bg-slate-50 dark:hover:bg-[#2a2a2a]/60 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1 font-semibold text-slate-700 dark:text-[#f4f4f5] shadow-xs cursor-pointer"
                  >
                    <span>Next</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Mobile Pagination Bar (< 768px) */}
            <div className="flex md:hidden p-3 border-t border-slate-100 dark:border-white/[0.06] bg-white dark:bg-[#1c1c1e] flex-col gap-2.5 text-xs text-slate-500 dark:text-[#a1a1aa]">
              {/* Row 1: Showing indicator & Rows selector */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px]">
                  Showing{' '}
                  <strong className="text-slate-900 dark:text-[#f4f4f5]">
                    {pagination.totalCount === 0 ? 0 : (pagination.currentPage - 1) * pagination.pageSize + 1}–{Math.min(pagination.currentPage * pagination.pageSize, pagination.totalCount)}
                  </strong>{' '}
                  of <strong className="text-slate-900 dark:text-[#f4f4f5]">{pagination.totalCount.toLocaleString()}</strong>
                </span>

                <div className="flex items-center gap-1">
                  <span className="text-[11px] text-slate-400">Rows:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                    aria-label="Statements per page"
                    className="h-8 px-2 bg-slate-50 dark:bg-[#242424] border border-slate-200 dark:border-white/[0.06] rounded-lg text-xs font-semibold text-slate-700 dark:text-[#f4f4f5] focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                  >
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>
              </div>

              {/* Row 2: Touch pagination buttons */}
              <div className="grid grid-cols-3 items-center gap-2">
                <button
                  type="button"
                  disabled={!pagination.hasPrevPage || isFetchingPage}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="h-10 px-2 rounded-xl border border-slate-200 dark:border-white/[0.06] bg-slate-50 dark:bg-[#242424] hover:bg-slate-100 dark:hover:bg-[#2a2a2a] disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-1 font-bold text-slate-700 dark:text-[#f4f4f5] cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Prev</span>
                </button>

                <div className="text-center font-bold text-xs text-slate-800 dark:text-[#f4f4f5]">
                  {pagination.currentPage} / {pagination.totalPages}
                </div>

                <button
                  type="button"
                  disabled={!pagination.hasNextPage || isFetchingPage}
                  onClick={() => setPage((p) => p + 1)}
                  className="h-10 px-2 rounded-xl border border-slate-200 dark:border-white/[0.06] bg-slate-50 dark:bg-[#242424] hover:bg-slate-100 dark:hover:bg-[#2a2a2a] disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-1 font-bold text-slate-700 dark:text-[#f4f4f5] cursor-pointer"
                >
                  <span>Next</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : activeView === 'consignments' ? (
        /* ── VIEW 2: ORDER COLLECTIONS (CONSIGNMENTS) TABLE & CARDS ── */
        <div className="space-y-3">
          {/* Compact Coverage Indicator for Consignments */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-2 px-3.5 sm:px-4 py-2.5 bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200/50 dark:border-indigo-900/30 rounded-xl text-xs text-indigo-900 dark:text-indigo-300">
            <div className="flex items-center gap-2">
              <Info className="w-3.5 h-3.5 flex-shrink-0 text-indigo-600 dark:text-indigo-400" />
              <span>
                <strong>Parcel coverage:</strong> {filteredConsignments.length} parcels{batchesDateRange ? ` · ${batchesDateRange.start} – ${batchesDateRange.end}` : ''}
              </span>
            </div>
            <span className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-300">
              Filtered: {filteredConsignments.length}
            </span>
          </div>

          <div className="bg-white dark:bg-[#1c1c1e] rounded-2xl border border-slate-200/80 dark:border-white/[0.06] shadow-xs overflow-hidden">
            {/* Desktop Table (Hidden on <1024px) */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200/80 dark:border-white/[0.06] bg-slate-50/70 dark:bg-[#1c1c1e] text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-[#a1a1aa]">
                    <th className="py-3 px-4 sm:px-6">OMS ORDER</th>
                    <th className="py-3 px-4">TRACKING</th>
                    <th className="py-3 px-4">CONSIGNMENT ID</th>
                    <th className="py-3 px-4">CUSTOMER</th>
                    <th className="py-3 px-4">COD AMOUNT</th>
                    <th className="py-3 px-4">STATUS</th>
                    <th className="py-3 px-4">STATEMENT</th>
                    <th className="py-3 px-4">DATE</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/[0.04] text-xs sm:text-sm">
                  {filteredConsignments.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-16 text-center text-slate-500 dark:text-[#a1a1aa]">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <Package className="w-8 h-8 text-slate-300 dark:text-[#52525b]" />
                          <p className="font-semibold text-sm">No consignment records found.</p>
                          <button
                            type="button"
                            onClick={handleResetFilters}
                            className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold hover:underline mt-1 cursor-pointer"
                          >
                            Clear filters
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    paginatedConsignments.map((c) => {
                      const isDelivered = (c.status || '').toLowerCase() === 'delivered';
                      const isCancelled = (c.status || '').toLowerCase() === 'cancelled';
                      const hasOmsOrder = Boolean(c.oms_order?.id);

                      return (
                        <tr
                          key={c.consignment_id}
                          className="hover:bg-slate-50/80 dark:hover:bg-[#242424] transition-colors h-[56px]"
                        >
                          {/* OMS Order ID */}
                          <td className="py-3 px-4 sm:px-6 font-bold">
                            {hasOmsOrder ? (
                              <button
                                type="button"
                                onClick={() => handleOpenOmsOrder(c.oms_order!.id)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors text-xs font-mono cursor-pointer"
                              >
                                <span>#{c.oms_order!.id}</span>
                                <ExternalLink className="w-3 h-3 text-indigo-500" />
                              </button>
                            ) : c.invoice && c.invoice !== 'N/A' ? (
                              <span className="font-mono text-xs text-slate-700 dark:text-[#a1a1aa] bg-slate-100 dark:bg-[#242424] px-2 py-0.5 rounded">
                                {c.invoice}
                              </span>
                            ) : (
                              <span className="text-xs text-slate-400 italic">Unmapped</span>
                            )}
                          </td>

                          {/* Steadfast Tracking Code */}
                          <td className="py-3 px-4 font-mono text-xs">
                            <div className="flex items-center gap-1.5">
                              <span className="text-slate-900 dark:text-[#f4f4f5] font-medium">{c.tracking_code}</span>
                              {c.tracking_link && (
                                <a
                                  href={c.tracking_link}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-indigo-500 hover:text-indigo-700 p-0.5"
                                  title="Open Steadfast Live Tracking"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                              )}
                            </div>
                          </td>

                          {/* Consignment ID */}
                          <td className="py-3 px-4 font-mono text-xs text-slate-500 dark:text-[#a1a1aa]">
                            {c.consignment_id}
                          </td>

                          {/* Customer */}
                          <td className="py-3 px-4">
                            <div className="font-medium text-slate-900 dark:text-[#f4f4f5]">
                              {c.recipient_name || 'Customer'}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-[#a1a1aa] font-mono">
                              {c.recipient_phone}
                            </div>
                          </td>

                          {/* COD Amount */}
                          <td className="py-3 px-4 font-bold text-slate-900 dark:text-[#f4f4f5]">
                            ৳ {Number(c.cod_amount || 0).toLocaleString()}
                          </td>

                          {/* Delivery Status */}
                          <td className="py-3 px-4">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold capitalize ${
                                isDelivered
                                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60'
                                  : isCancelled
                                  ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60'
                                  : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60'
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  isDelivered ? 'bg-emerald-500' : isCancelled ? 'bg-rose-500' : 'bg-amber-500'
                                }`}
                              />
                              {c.status || 'In Review'}
                            </span>
                          </td>

                          {/* Payment Batch */}
                          <td className="py-3 px-4">
                            <span
                              onClick={() => (c as any).payment_id && handleOpenBatchDetails((c as any).payment_id)}
                              className="text-xs font-mono font-medium text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                            >
                              {(c as any).payment_id || '—'}
                            </span>
                          </td>

                          {/* Date */}
                          <td className="py-3 px-4 text-xs text-slate-500 dark:text-[#a1a1aa] whitespace-nowrap">
                            {c.created_at ? new Date(c.created_at).toLocaleDateString() : '—'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile Consignments Card List (< 1024px) */}
            <div className="block lg:hidden divide-y divide-slate-100 dark:divide-white/[0.06]">
              {filteredConsignments.length === 0 ? (
                <div className="py-12 px-4 text-center text-slate-500 dark:text-[#a1a1aa]">
                  <Package className="w-8 h-8 text-slate-300 dark:text-[#52525b] mx-auto mb-2" />
                  <p className="font-semibold text-sm">No consignment records found.</p>
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold hover:underline mt-2 inline-block cursor-pointer"
                  >
                    Clear filters
                  </button>
                </div>
              ) : (
                paginatedConsignments.map((c) => {
                  const isDelivered = (c.status || '').toLowerCase() === 'delivered';
                  const isCancelled = (c.status || '').toLowerCase() === 'cancelled';
                  const hasOmsOrder = Boolean(c.oms_order?.id);

                  return (
                    <div
                      key={c.consignment_id}
                      className="p-3.5 sm:p-4 hover:bg-slate-50/70 dark:hover:bg-[#242424]/40 transition-colors space-y-2.5"
                    >
                      {/* Top: Order Badge & Status */}
                      <div className="flex items-center justify-between gap-2">
                        {hasOmsOrder ? (
                          <button
                            type="button"
                            onClick={() => handleOpenOmsOrder(c.oms_order!.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors text-xs font-mono font-bold cursor-pointer"
                          >
                            <span>#{c.oms_order!.id}</span>
                            <ExternalLink className="w-3 h-3 text-indigo-500" />
                          </button>
                        ) : c.invoice && c.invoice !== 'N/A' ? (
                          <span className="font-mono text-xs text-slate-700 dark:text-[#a1a1aa] bg-slate-100 dark:bg-[#242424] px-2 py-0.5 rounded font-bold">
                            {c.invoice}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400 italic">Unmapped OMS</span>
                        )}

                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold capitalize ${
                            isDelivered
                              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60'
                              : isCancelled
                              ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60'
                              : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              isDelivered ? 'bg-emerald-500' : isCancelled ? 'bg-rose-500' : 'bg-amber-500'
                            }`}
                          />
                          {c.status || 'In Review'}
                        </span>
                      </div>

                      {/* Customer and Tracking Info */}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-semibold text-slate-900 dark:text-[#f4f4f5] text-xs">
                            {c.recipient_name || 'Customer'}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-[#a1a1aa] font-mono">
                            {c.recipient_phone}
                          </div>
                        </div>

                        <div className="text-right">
                          <span className="text-[10px] uppercase font-bold text-slate-400 block">COD Amount</span>
                          <span className="font-extrabold text-sm text-slate-900 dark:text-[#f4f4f5] tabular-nums">
                            ৳ {Number(c.cod_amount || 0).toLocaleString()}
                          </span>
                        </div>
                      </div>

                      {/* Footer Row: Tracking code link, Statement ID, Date */}
                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100 dark:border-white/[0.04] text-[11px] text-slate-500 dark:text-[#a1a1aa]">
                        <div className="flex items-center gap-1 font-mono">
                          <span>{c.tracking_code}</span>
                          {c.tracking_link && (
                            <a
                              href={c.tracking_link}
                              target="_blank"
                              rel="noreferrer"
                              className="text-indigo-500 hover:text-indigo-700 p-0.5"
                              title="Open Steadfast Live Tracking"
                            >
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          {(c as any).payment_id && (
                            <span
                              onClick={() => handleOpenBatchDetails((c as any).payment_id)}
                              className="font-mono text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                            >
                              {(c as any).payment_id}
                            </span>
                          )}
                          <span className="text-slate-400">
                            {c.created_at ? new Date(c.created_at).toLocaleDateString() : '—'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Consignments Pagination Bar (Desktop >= 640px) */}
            <div className="hidden sm:flex p-4 border-t border-slate-100 dark:border-white/[0.06] bg-white/80 dark:bg-[#1c1c1e]/80 items-center justify-between gap-3 text-xs font-medium text-slate-500 dark:text-[#a1a1aa]">
              <div>
                Showing {filteredConsignments.length === 0 ? 0 : (consignmentPage - 1) * consignmentPageSize + 1}–
                {Math.min(consignmentPage * consignmentPageSize, filteredConsignments.length)} of {filteredConsignments.length}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={consignmentPage <= 1}
                  onClick={() => setConsignmentPage((p) => Math.max(1, p - 1))}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#242424] hover:bg-slate-50 dark:hover:bg-[#2a2a2a]/60 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1 font-semibold text-slate-700 dark:text-[#f4f4f5] shadow-xs cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Previous
                </button>
                <span className="px-2 font-bold text-slate-700 dark:text-[#a1a1aa]">
                  Page {consignmentPage} of {totalConsignmentPages}
                </span>
                <button
                  type="button"
                  disabled={consignmentPage >= totalConsignmentPages}
                  onClick={() => setConsignmentPage((p) => Math.min(totalConsignmentPages, p + 1))}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#242424] hover:bg-slate-50 dark:hover:bg-[#2a2a2a]/60 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1 font-semibold text-slate-700 dark:text-[#f4f4f5] shadow-xs cursor-pointer"
                >
                  Next <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Consignments Mobile Pagination Bar (< 640px) */}
            <div className="flex sm:hidden p-3 border-t border-slate-100 dark:border-white/[0.06] bg-white dark:bg-[#1c1c1e] flex-col gap-2.5 text-xs text-slate-500 dark:text-[#a1a1aa]">
              <div className="text-[11px] text-center">
                Showing{' '}
                <strong className="text-slate-900 dark:text-[#f4f4f5]">
                  {filteredConsignments.length === 0 ? 0 : (consignmentPage - 1) * consignmentPageSize + 1}–{Math.min(consignmentPage * consignmentPageSize, filteredConsignments.length)}
                </strong>{' '}
                of <strong className="text-slate-900 dark:text-[#f4f4f5]">{filteredConsignments.length}</strong>
              </div>

              <div className="grid grid-cols-3 items-center gap-2">
                <button
                  type="button"
                  disabled={consignmentPage <= 1}
                  onClick={() => setConsignmentPage((p) => Math.max(1, p - 1))}
                  className="h-10 px-2 rounded-xl border border-slate-200 dark:border-white/[0.06] bg-slate-50 dark:bg-[#242424] hover:bg-slate-100 dark:hover:bg-[#2a2a2a] disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-1 font-bold text-slate-700 dark:text-[#f4f4f5] cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Prev</span>
                </button>

                <div className="text-center font-bold text-xs text-slate-800 dark:text-[#f4f4f5]">
                  {consignmentPage} / {totalConsignmentPages}
                </div>

                <button
                  type="button"
                  disabled={consignmentPage >= totalConsignmentPages}
                  onClick={() => setConsignmentPage((p) => Math.min(totalConsignmentPages, p + 1))}
                  className="h-10 px-2 rounded-xl border border-slate-200 dark:border-white/[0.06] bg-slate-50 dark:bg-[#242424] hover:bg-slate-100 dark:hover:bg-[#2a2a2a] disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-1 font-bold text-slate-700 dark:text-[#f4f4f5] cursor-pointer"
                >
                  <span>Next</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ── VIEW 3: PAYMENT RECONCILIATION TABLE & CARDS ── */
        <div className="bg-white dark:bg-[#1c1c1e] rounded-2xl border border-slate-200/80 dark:border-white/[0.06] shadow-xs overflow-hidden">
          {/* Table Header Bar with coverage indicator and refresh */}
          <div className="p-3 sm:p-4 border-b border-slate-100 dark:border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50 dark:bg-[#242424]/20">
            <div className="flex items-center gap-1.5 sm:gap-2 text-xs text-slate-600 dark:text-[#a1a1aa] flex-wrap">
              <span className="font-bold text-slate-900 dark:text-[#f4f4f5] flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                Audit Coverage:
              </span>
              <span className="px-2 sm:px-2.5 py-0.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800/60 font-semibold text-indigo-700 dark:text-indigo-300 text-[11px] sm:text-xs shadow-xs">
                {reconDateRange ? `Last ${reconDateRange.days} Days (${reconDateRange.start} – ${reconDateRange.end})` : 'Active Statements'}
              </span>
              <span className="px-2 sm:px-2.5 py-0.5 rounded-lg bg-white dark:bg-[#242424] border border-slate-200 dark:border-white/[0.06] font-mono text-[11px] shadow-xs text-slate-700 dark:text-[#a1a1aa]">
                {reconciliationCoverage.batches_checked} batches ({reconciliationCoverage.total_batch_parcels} parcels)
              </span>
            </div>

            <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto">
              {reconciliationCoverage.last_reconciled && (
                <span className="text-[11px] text-slate-400">
                  Last Checked: {new Date(reconciliationCoverage.last_reconciled).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
              <button
                type="button"
                onClick={() => fetchReconciliation(true)}
                disabled={isRefreshingReconciliation || isLoadingReconciliation}
                className="inline-flex items-center justify-center gap-1.5 h-9 sm:h-8 px-3.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 transition-colors disabled:opacity-60 cursor-pointer shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingReconciliation ? 'animate-spin' : ''}`} />
                <span>{isRefreshingReconciliation ? 'Reconciling...' : 'Run Reconciliation'}</span>
              </button>
            </div>
          </div>

          {/* Desktop Table (Hidden on <1024px) */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200/80 dark:border-white/[0.06] bg-slate-50/70 dark:bg-[#1c1c1e] text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-[#a1a1aa]">
                  <th className="py-3 px-4 sm:px-6">OMS ORDER</th>
                  <th className="py-3 px-4">TRACKING CODE</th>
                  <th className="py-3 px-4">CUSTOMER</th>
                  <th className="py-3 px-4">DELIVERY STATUS</th>
                  <th className="py-3 px-4">EXPECTED COD</th>
                  <th className="py-3 px-4">SETTLEMENT</th>
                  <th className="py-3 px-4">SETTLED AMOUNT</th>
                  <th className="py-3 px-4">STATEMENT</th>
                  <th className="py-3 px-4">AUDIT STATUS</th>
                  <th className="py-3 px-4 text-right">ACTION</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/[0.04] text-xs sm:text-sm">
                {isLoadingReconciliation ? (
                  <tr>
                    <td colSpan={10} className="py-16 text-center text-slate-500 dark:text-[#a1a1aa]">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <RefreshCw className="w-7 h-7 text-indigo-600 animate-spin" />
                        <p className="font-semibold text-sm">Auditing reconciliation records...</p>
                      </div>
                    </td>
                  </tr>
                ) : filteredReconRecords.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-16 text-center text-slate-500 dark:text-[#a1a1aa]">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                        <p className="font-semibold text-sm">No reconciliation records found.</p>
                        <button
                          type="button"
                          onClick={handleResetFilters}
                          className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold hover:underline mt-1 cursor-pointer"
                        >
                          Clear filters
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedReconRecords.map((r) => {
                    const isSettled = r.reconciliation_status === 'SETTLED';
                    const isPotentiallyUnsettled = r.reconciliation_status === 'POTENTIALLY_UNSETTLED' || r.reconciliation_status === 'PARTIAL_UNSETTLED';
                    const isProcessing = r.reconciliation_status === 'PROCESSING';
                    const isPartiallyPaid = r.reconciliation_status === 'PARTIALLY_PAID';

                    return (
                      <tr
                        key={r.id}
                        onClick={() => setSelectedReconRecord(r)}
                        className={`hover:bg-slate-50/80 dark:hover:bg-[#242424] transition-colors cursor-pointer group h-[56px] ${
                          isPotentiallyUnsettled ? 'bg-amber-50/30 dark:bg-amber-950/10' : ''
                        }`}
                      >
                        {/* OMS Order */}
                        <td className="py-3 px-4 sm:px-6 font-bold">
                          {r.oms_order_id ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenOmsOrder(r.oms_order_id!);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/60 hover:bg-indigo-100 transition-colors text-xs font-mono cursor-pointer"
                            >
                              <span>#{r.oms_order_id}</span>
                              <ExternalLink className="w-3 h-3 text-indigo-500" />
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400 italic">Unmapped</span>
                          )}
                        </td>

                        {/* Tracking Code */}
                        <td className="py-3 px-4 font-mono text-xs">
                          <div className="flex items-center gap-1.5">
                            <span className="text-slate-900 dark:text-[#f4f4f5] font-medium">{r.tracking_code || '—'}</span>
                            {r.tracking_code && (
                              <a
                                href={`https://steadfast.com.bd/t/${r.tracking_code}`}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-indigo-500 hover:text-indigo-700 p-0.5"
                                title="Open Live Tracking"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            )}
                          </div>
                        </td>

                        {/* Customer */}
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-900 dark:text-[#f4f4f5] truncate max-w-[130px]">
                            {r.customer_name}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-[#a1a1aa] font-mono">
                            {r.customer_phone || '—'}
                          </div>
                        </td>

                        {/* Delivery Status */}
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold capitalize ${
                              r.delivery_status === 'delivered'
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60'
                                : r.delivery_status === 'partial_delivered'
                                ? 'bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border border-purple-200 dark:border-purple-800/60'
                                : r.delivery_status === 'cancelled'
                                ? 'bg-slate-100 text-slate-600 dark:bg-[#242424] dark:text-[#a1a1aa]'
                                : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                            }`}
                          >
                            {r.delivery_status.replace('_', ' ')}
                          </span>
                        </td>

                        {/* Expected Collectable */}
                        <td className="py-3 px-4 font-bold text-slate-900 dark:text-[#f4f4f5]">
                          ৳ {Number(r.expected_collectible || 0).toLocaleString()}
                        </td>

                        {/* Settlement Status */}
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                              isSettled
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                                : isProcessing
                                ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'
                                : isPotentiallyUnsettled
                                ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                                : 'bg-slate-100 text-slate-600 dark:bg-[#242424] dark:text-[#a1a1aa]'
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                isSettled ? 'bg-emerald-500' : isProcessing ? 'bg-indigo-500 animate-pulse' : isPotentiallyUnsettled ? 'bg-amber-500' : 'bg-slate-400'
                              }`}
                            />
                            {r.settlement_found ? (isProcessing ? 'In Queue' : 'Settled') : 'Not Found'}
                          </span>
                        </td>

                        {/* Settled Amount */}
                        <td className="py-3 px-4 font-bold">
                          {r.settled_amount > 0 ? (
                            <span className="text-emerald-600 dark:text-emerald-400">
                              ৳ {r.settled_amount.toLocaleString()}
                            </span>
                          ) : (
                            <span className="text-slate-400">৳ 0</span>
                          )}
                        </td>

                        {/* Payment Batch */}
                        <td className="py-3 px-4 font-mono text-xs">
                          {r.payment_batches.length > 0 ? (
                            <span
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenBatchDetails(r.payment_batches[0]);
                              }}
                              className="text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                            >
                              {r.payment_batches.join(', ')}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>

                        {/* Reconciliation Badge */}
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold ${
                              isSettled
                                ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-800'
                                : isProcessing
                                ? 'bg-indigo-100 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-200 border border-indigo-300 dark:border-indigo-800'
                                : isPotentiallyUnsettled
                                ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-800'
                                : isPartiallyPaid
                                ? 'bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-200 border border-purple-300 dark:border-purple-800'
                                : 'bg-slate-100 dark:bg-[#242424] text-slate-600 dark:text-[#a1a1aa]'
                            }`}
                          >
                            {isSettled
                              ? 'Settled'
                              : isProcessing
                              ? 'Processing'
                              : isPotentiallyUnsettled
                              ? 'Potentially Unsettled'
                              : isPartiallyPaid
                              ? 'Partially Paid'
                              : 'Not Eligible'}
                          </span>
                        </td>

                        {/* Audit Action */}
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedReconRecord(r);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 transition-colors shadow-xs cursor-pointer"
                          >
                            <FileCheck2 className="w-3.5 h-3.5" />
                            <span>Audit</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Reconciliation Card List (< 1024px) */}
          <div className="block lg:hidden divide-y divide-slate-100 dark:divide-white/[0.06]">
            {isLoadingReconciliation ? (
              <div className="py-12 px-4 text-center text-slate-500 dark:text-[#a1a1aa]">
                <RefreshCw className="w-7 h-7 text-indigo-600 animate-spin mx-auto mb-2" />
                <p className="font-semibold text-sm">Auditing reconciliation records...</p>
              </div>
            ) : filteredReconRecords.length === 0 ? (
              <div className="py-12 px-4 text-center text-slate-500 dark:text-[#a1a1aa]">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                <p className="font-semibold text-sm">No reconciliation records found.</p>
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold hover:underline mt-2 inline-block cursor-pointer"
                >
                  Clear filters
                </button>
              </div>
            ) : (
              paginatedReconRecords.map((r) => {
                const isSettled = r.reconciliation_status === 'SETTLED';
                const isPotentiallyUnsettled = r.reconciliation_status === 'POTENTIALLY_UNSETTLED' || r.reconciliation_status === 'PARTIAL_UNSETTLED';
                const isProcessing = r.reconciliation_status === 'PROCESSING';
                const isPartiallyPaid = r.reconciliation_status === 'PARTIALLY_PAID';

                return (
                  <div
                    key={r.id}
                    onClick={() => setSelectedReconRecord(r)}
                    className={`p-3.5 sm:p-4 hover:bg-slate-50/70 dark:hover:bg-[#242424]/40 transition-colors space-y-2.5 cursor-pointer ${
                      isPotentiallyUnsettled ? 'bg-amber-50/20 dark:bg-amber-950/10' : ''
                    }`}
                  >
                    {/* Top Row: Order ID badge & Audit Status Badge */}
                    <div className="flex items-center justify-between gap-2">
                      {r.oms_order_id ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenOmsOrder(r.oms_order_id!);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/60 hover:bg-indigo-100 transition-colors text-xs font-mono font-bold cursor-pointer"
                        >
                          <span>#{r.oms_order_id}</span>
                          <ExternalLink className="w-3 h-3 text-indigo-500" />
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400 italic">Unmapped OMS</span>
                      )}

                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-xs font-bold ${
                          isSettled
                            ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-800'
                            : isProcessing
                            ? 'bg-indigo-100 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-200 border border-indigo-300 dark:border-indigo-800'
                            : isPotentiallyUnsettled
                            ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-800'
                            : isPartiallyPaid
                            ? 'bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-200 border border-purple-300 dark:border-purple-800'
                            : 'bg-slate-100 dark:bg-[#242424] text-slate-600 dark:text-[#a1a1aa]'
                        }`}
                      >
                        {isSettled
                          ? 'Settled'
                          : isProcessing
                          ? 'Processing'
                          : isPotentiallyUnsettled
                          ? 'Potentially Unsettled'
                          : isPartiallyPaid
                          ? 'Partially Paid'
                          : 'Not Eligible'}
                      </span>
                    </div>

                    {/* Customer & Delivery Status */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-[#f4f4f5] text-xs">
                          {r.customer_name || 'Customer'}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-[#a1a1aa] font-mono">
                          {r.customer_phone || '—'}
                        </div>
                      </div>

                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold capitalize ${
                          r.delivery_status === 'delivered'
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                            : r.delivery_status === 'partial_delivered'
                            ? 'bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300'
                            : r.delivery_status === 'cancelled'
                            ? 'bg-slate-100 text-slate-600 dark:bg-[#242424] dark:text-[#a1a1aa]'
                            : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                        }`}
                      >
                        {r.delivery_status.replace('_', ' ')}
                      </span>
                    </div>

                    {/* Financial Comparison Grid */}
                    <div className="grid grid-cols-2 gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-[#141414] border border-slate-100 dark:border-white/[0.04] text-xs">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Expected COD</span>
                        <div className="font-bold text-slate-900 dark:text-[#f4f4f5] text-sm tabular-nums mt-0.5">
                          ৳ {Number(r.expected_collectible || 0).toLocaleString()}
                        </div>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Settled Amount</span>
                        <div className={`font-extrabold text-sm tabular-nums mt-0.5 ${r.settled_amount > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                          ৳ {Number(r.settled_amount || 0).toLocaleString()}
                        </div>
                      </div>
                    </div>

                    {/* Footer Row: Tracking code, Statement batch link, Audit CTA */}
                    <div className="flex items-center justify-between gap-2 pt-0.5 text-xs text-slate-500 dark:text-[#a1a1aa]">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="flex items-center gap-1 font-mono text-[11px]">
                          <span>{r.tracking_code || '—'}</span>
                          {r.tracking_code && (
                            <a
                              href={`https://steadfast.com.bd/t/${r.tracking_code}`}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-indigo-500 hover:text-indigo-700 p-0.5"
                              title="Open Live Tracking"
                            >
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>

                        {r.payment_batches.length > 0 && (
                          <span
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenBatchDetails(r.payment_batches[0]);
                            }}
                            className="font-mono text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                          >
                            {r.payment_batches[0]}
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedReconRecord(r);
                        }}
                        className="h-8 px-3 rounded-lg text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 transition-colors shadow-xs cursor-pointer flex items-center gap-1 shrink-0"
                      >
                        <FileCheck2 className="w-3.5 h-3.5" />
                        <span>Audit</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Reconciliation Table Pagination Bar (Desktop >= 768px) */}
          <div className="hidden md:flex p-4 border-t border-slate-100 dark:border-white/[0.06] bg-white/80 dark:bg-[#1c1c1e]/80 items-center justify-between gap-3 text-xs font-medium text-slate-500 dark:text-[#a1a1aa]">
            <div>
              Showing {filteredReconRecords.length === 0 ? 0 : (reconPage - 1) * reconPageSize + 1}–
              {Math.min(reconPage * reconPageSize, filteredReconRecords.length)} of {filteredReconRecords.length}
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                disabled={reconPage <= 1}
                onClick={() => setReconPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#242424] hover:bg-slate-50 dark:hover:bg-[#2a2a2a]/60 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1 font-semibold text-slate-700 dark:text-[#f4f4f5] shadow-xs cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Previous
              </button>

              {generatePaginationPages(reconPage, totalReconPages).map((p, idx) =>
                p === '...' ? (
                  <span key={`recon-ellipsis-${idx}`} className="px-1 text-slate-400 select-none">
                    ...
                  </span>
                ) : (
                  <button
                    key={`recon-${p}`}
                    type="button"
                    onClick={() => setReconPage(Number(p))}
                    className={`min-w-[28px] h-7 px-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      reconPage === p
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-600 dark:text-[#a1a1aa] hover:bg-slate-100 dark:hover:bg-[#242424]'
                    }`}
                  >
                    {p}
                  </button>
                )
              )}

              <button
                type="button"
                disabled={reconPage >= totalReconPages}
                onClick={() => setReconPage((p) => Math.min(totalReconPages, p + 1))}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#242424] hover:bg-slate-50 dark:hover:bg-[#2a2a2a]/60 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1 font-semibold text-slate-700 dark:text-[#f4f4f5] shadow-xs cursor-pointer"
              >
                Next <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Reconciliation Table Mobile Pagination Bar (< 768px) */}
          <div className="flex md:hidden p-3 border-t border-slate-100 dark:border-white/[0.06] bg-white dark:bg-[#1c1c1e] flex-col gap-2.5 text-xs text-slate-500 dark:text-[#a1a1aa]">
            <div className="text-[11px] text-center">
              Showing{' '}
              <strong className="text-slate-900 dark:text-[#f4f4f5]">
                {filteredReconRecords.length === 0 ? 0 : (reconPage - 1) * reconPageSize + 1}–{Math.min(reconPage * reconPageSize, filteredReconRecords.length)}
              </strong>{' '}
              of <strong className="text-slate-900 dark:text-[#f4f4f5]">{filteredReconRecords.length}</strong>
            </div>

            <div className="grid grid-cols-3 items-center gap-2">
              <button
                type="button"
                disabled={reconPage <= 1}
                onClick={() => setReconPage((p) => Math.max(1, p - 1))}
                className="h-10 px-2 rounded-xl border border-slate-200 dark:border-white/[0.06] bg-slate-50 dark:bg-[#242424] hover:bg-slate-100 dark:hover:bg-[#2a2a2a] disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-1 font-bold text-slate-700 dark:text-[#f4f4f5] cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Prev</span>
              </button>

              <div className="text-center font-bold text-xs text-slate-800 dark:text-[#f4f4f5]">
                {reconPage} / {totalReconPages}
              </div>

              <button
                type="button"
                disabled={reconPage >= totalReconPages}
                onClick={() => setReconPage((p) => Math.min(totalReconPages, p + 1))}
                className="h-10 px-2 rounded-xl border border-slate-200 dark:border-white/[0.06] bg-slate-50 dark:bg-[#242424] hover:bg-slate-100 dark:hover:bg-[#2a2a2a] disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-1 font-bold text-slate-700 dark:text-[#f4f4f5] cursor-pointer"
              >
                <span>Next</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 5. Payment Batch Detail Drawer / Modal ── */}
      <AnimatePresence>
        {selectedBatchId && (
          <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedBatchId(null)}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
            />

            {/* Slide-over Drawer */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              className="relative w-full max-w-3xl bg-white dark:bg-[#1c1c1e] shadow-2xl z-10 flex flex-col h-full border-l border-slate-200 dark:border-white/[0.06]"
            >
              {/* Drawer Header */}
              <div className="p-4 sm:p-6 border-b border-slate-100 dark:border-white/[0.06] flex items-center justify-between gap-3">
                <div className="min-w-0 pr-1">
                  <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                    <span className="text-lg sm:text-2xl font-bold font-mono text-slate-900 dark:text-[#f4f4f5] truncate">
                      {selectedBatchId}
                    </span>
                    {batchDetails?.status_label && (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold capitalize bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
                        {batchDetails.status_label}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-[#a1a1aa] mt-1">
                    Settlement Statement
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedBatchId(null)}
                  className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-[#f4f4f5] rounded-lg hover:bg-slate-100 dark:hover:bg-[#242424] cursor-pointer shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Drawer Body */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 sm:space-y-6">
                {isLoadingBatchDetails ? (
                  <div className="py-20 flex flex-col items-center justify-center gap-3">
                    <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin" />
                    <p className="text-sm font-semibold text-slate-500">Loading statement parcels...</p>
                  </div>
                ) : batchDetails ? (
                  <>
                    {/* Financial Summary Card */}
                    <div className="p-4 sm:p-5 rounded-2xl bg-slate-50 dark:bg-[#242424]/50 border border-slate-200/80 dark:border-white/[0.06] grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                      <div>
                        <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-400">
                          Gross COD
                        </span>
                        <div className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-[#f4f4f5] mt-0.5 tabular-nums">
                          ৳ {Number(batchDetails.amount || 0).toLocaleString()}
                        </div>
                      </div>
                      <div>
                        <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-400">
                          Courier Charges
                        </span>
                        <div className="text-base sm:text-lg font-extrabold text-rose-600 dark:text-rose-400 mt-0.5 tabular-nums">
                          -৳ {Number(batchDetails.charges || 0).toLocaleString()}
                        </div>
                      </div>
                      <div>
                        <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-400">
                          Due Bills
                        </span>
                        <div className="text-base sm:text-lg font-extrabold text-amber-600 dark:text-amber-400 mt-0.5 tabular-nums">
                          -৳ {Number(batchDetails.due_bills || 0).toLocaleString()}
                        </div>
                      </div>
                      <div>
                        <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-400">
                          Net Disbursed
                        </span>
                        <div className="text-base sm:text-lg font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5 tabular-nums">
                          ৳ {Number(batchDetails.total || 0).toLocaleString()}
                        </div>
                      </div>
                    </div>

                    {/* Metadata strip */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs text-slate-500 bg-white dark:bg-[#141414] p-3 rounded-xl border border-slate-200/60 dark:border-white/[0.06]">
                      <div>
                        <span className="text-slate-400 block">Method:</span>
                        <span className="font-semibold text-slate-800 dark:text-[#f4f4f5]">
                          {batchDetails.method || 'Bank'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Created At:</span>
                        <span className="font-semibold text-slate-800 dark:text-[#f4f4f5]">
                          {batchDetails.created_at || '—'}
                        </span>
                      </div>
                      <div className="col-span-2 sm:col-span-1">
                        <span className="text-slate-400 block">Paid At:</span>
                        <span className="font-semibold text-slate-800 dark:text-[#f4f4f5]">
                          {batchDetails.paid_at || '—'}
                        </span>
                      </div>
                    </div>

                    {/* Consignments Table in Batch */}
                    <div className="space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-slate-900 dark:text-[#f4f4f5] uppercase tracking-wider">
                            Statement Parcels
                          </h3>
                          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400">
                            {batchDetails.consignments?.length || 0}
                          </span>
                        </div>

                        {/* Search inside modal */}
                        <div className="relative w-full sm:w-64">
                          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input
                            type="text"
                            value={batchModalSearch}
                            onChange={(e) => setBatchModalSearch(e.target.value)}
                            placeholder="Filter parcels..."
                            className="w-full pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-[#242424] border border-slate-200 dark:border-white/[0.06] rounded-lg text-xs placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                        </div>
                      </div>

                      <div className="rounded-xl border border-slate-200/80 dark:border-white/[0.06] overflow-hidden">
                        <div className="max-h-[380px] overflow-y-auto overflow-x-auto">
                          <table className="w-full text-left text-xs min-w-[500px]">
                            <thead className="sticky top-0 bg-slate-50 dark:bg-[#242424] text-slate-500 text-[10px] uppercase font-bold border-b border-slate-200 dark:border-white/[0.06]">
                              <tr>
                                <th className="py-2.5 px-3">OMS Order</th>
                                <th className="py-2.5 px-3">Tracking</th>
                                <th className="py-2.5 px-3">Customer</th>
                                <th className="py-2.5 px-3">COD</th>
                                <th className="py-2.5 px-3">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-white/[0.04]">
                              {modalFilteredConsignments.map((c) => (
                                <tr key={c.consignment_id} className="hover:bg-slate-50/60 dark:hover:bg-[#242424]/30">
                                  <td className="py-2.5 px-3 font-bold">
                                    {c.oms_order?.id ? (
                                      <button
                                        type="button"
                                        onClick={() => handleOpenOmsOrder(c.oms_order!.id)}
                                        className="text-indigo-600 dark:text-indigo-400 hover:underline font-mono text-xs cursor-pointer"
                                      >
                                        #{c.oms_order.id}
                                      </button>
                                    ) : c.invoice && c.invoice !== 'N/A' ? (
                                      <span className="font-mono text-slate-600 dark:text-[#a1a1aa]">{c.invoice}</span>
                                    ) : (
                                      <span className="text-slate-400 italic">Unmapped</span>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-3 font-mono">
                                    <div className="flex items-center gap-1">
                                      <span className="text-slate-800 dark:text-[#f4f4f5]">{c.tracking_code}</span>
                                      {c.tracking_link && (
                                        <a
                                          href={c.tracking_link}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="text-indigo-500 hover:text-indigo-700"
                                        >
                                          <ExternalLink className="w-3 h-3" />
                                        </a>
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-2.5 px-3">
                                    <div className="font-medium text-slate-900 dark:text-[#f4f4f5] truncate max-w-[130px]">
                                      {c.recipient_name}
                                    </div>
                                    <div className="text-[11px] text-slate-400 font-mono">
                                      {c.recipient_phone}
                                    </div>
                                  </td>
                                  <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-[#f4f4f5] tabular-nums">
                                    ৳ {Number(c.cod_amount || 0).toLocaleString()}
                                  </td>
                                  <td className="py-2.5 px-3 capitalize">
                                    <span
                                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                        c.status === 'delivered'
                                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                                          : c.status === 'cancelled'
                                          ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                                          : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                                      }`}
                                    >
                                      {c.status}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>

                    {/* Raw Technical API Response Toggle */}
                    <div className="pt-4 border-t border-slate-100 dark:border-white/[0.06]">
                      <button
                        type="button"
                        onClick={() => setShowRawJson(!showRawJson)}
                        className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold hover:underline flex items-center gap-1"
                      >
                        <Info className="w-3.5 h-3.5" />
                        <span>{showRawJson ? 'Hide Raw JSON' : 'View Raw JSON'}</span>
                      </button>

                      {showRawJson && (
                        <pre className="mt-2 p-3 rounded-xl bg-slate-900 text-slate-200 text-[11px] font-mono overflow-x-auto max-h-60">
                          {JSON.stringify(batchDetails, null, 2)}
                        </pre>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="py-12 text-center text-slate-500">
                    Failed to load statement details.
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── 5b. Reconciliation Audit Detail Drawer ── */}
      <AnimatePresence>
        {selectedReconRecord && (
          <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedReconRecord(null)}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
            />

            {/* Slide-over Drawer */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              className="relative w-full max-w-2xl bg-white dark:bg-[#1c1c1e] shadow-2xl z-10 flex flex-col h-full border-l border-slate-200 dark:border-white/[0.06]"
            >
              {/* Drawer Header */}
              <div className="p-4 sm:p-6 border-b border-slate-100 dark:border-white/[0.06] flex items-center justify-between gap-3">
                <div className="min-w-0 pr-1">
                  <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                    <span className="text-lg sm:text-2xl font-bold font-mono text-slate-900 dark:text-[#f4f4f5] truncate">
                      {selectedReconRecord.tracking_code || selectedReconRecord.id}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        copyToClipboard(
                          selectedReconRecord.tracking_code || selectedReconRecord.id,
                          `recon-${selectedReconRecord.id}`
                        )
                      }
                      className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-[#242424] cursor-pointer"
                      title="Copy Tracking ID"
                    >
                      {copiedKey === `recon-${selectedReconRecord.id}` ? (
                        <Check className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                        selectedReconRecord.reconciliation_status === 'SETTLED'
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                          : selectedReconRecord.reconciliation_status === 'PROCESSING'
                          ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800'
                          : selectedReconRecord.reconciliation_status === 'POTENTIALLY_UNSETTLED' ||
                            selectedReconRecord.reconciliation_status === 'PARTIAL_UNSETTLED'
                          ? 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200 border border-amber-300 dark:border-amber-800'
                          : selectedReconRecord.reconciliation_status === 'PARTIALLY_PAID'
                          ? 'bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border border-purple-200 dark:border-purple-800'
                          : 'bg-slate-100 text-slate-700 dark:bg-[#242424] dark:text-[#a1a1aa]'
                      }`}
                    >
                      {selectedReconRecord.reconciliation_status.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-[#a1a1aa] mt-1 flex items-center gap-1.5">
                    <Scale className="w-3.5 h-3.5 text-indigo-500" />
                    Financial Reconciliation Audit
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedReconRecord(null)}
                  className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-[#f4f4f5] rounded-lg hover:bg-slate-100 dark:hover:bg-[#242424] cursor-pointer shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Drawer Body */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 sm:space-y-6">
                {/* Financial Summary Strip */}
                <div className="p-4 sm:p-5 rounded-2xl bg-slate-50 dark:bg-[#242424]/50 border border-slate-200/80 dark:border-white/[0.06] grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
                  <div>
                    <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Expected Collectible
                    </span>
                    <div className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-[#f4f4f5] mt-0.5 tabular-nums">
                      ৳ {selectedReconRecord.expected_collectible.toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Settled Amount
                    </span>
                    <div className="text-base sm:text-lg font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5 tabular-nums">
                      ৳ {selectedReconRecord.settled_amount.toLocaleString()}
                    </div>
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Unsettled Balance
                    </span>
                    <div
                      className={`text-base sm:text-lg font-extrabold mt-0.5 tabular-nums ${
                        selectedReconRecord.unsettled_amount > 0
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-slate-400'
                      }`}
                    >
                      ৳ {selectedReconRecord.unsettled_amount.toLocaleString()}
                    </div>
                  </div>
                </div>

                {/* Audit Verdict Banner */}
                <div
                  className={`p-3.5 sm:p-4 rounded-xl border flex items-start gap-3 ${
                    selectedReconRecord.reconciliation_status === 'SETTLED'
                      ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/50 text-emerald-900 dark:text-emerald-200'
                      : selectedReconRecord.reconciliation_status === 'PROCESSING'
                      ? 'bg-indigo-50/70 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800/50 text-indigo-900 dark:text-indigo-200'
                      : selectedReconRecord.reconciliation_status === 'POTENTIALLY_UNSETTLED' ||
                        selectedReconRecord.reconciliation_status === 'PARTIAL_UNSETTLED'
                      ? 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800/60 text-amber-900 dark:text-amber-200'
                      : 'bg-slate-50 dark:bg-[#1c1c1e] border-slate-200 dark:border-white/[0.06] text-slate-800 dark:text-[#f4f4f5]'
                  }`}
                >
                  <div className="p-1 rounded-lg bg-white/60 dark:bg-[#141414]/60 shrink-0">
                    {selectedReconRecord.reconciliation_status === 'SETTLED' ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    ) : selectedReconRecord.reconciliation_status === 'PROCESSING' ? (
                      <Clock className="w-5 h-5 text-indigo-600" />
                    ) : selectedReconRecord.reconciliation_status === 'POTENTIALLY_UNSETTLED' ||
                      selectedReconRecord.reconciliation_status === 'PARTIAL_UNSETTLED' ? (
                      <AlertTriangle className="w-5 h-5 text-amber-600" />
                    ) : (
                      <Info className="w-5 h-5 text-slate-500" />
                    )}
                  </div>
                  <div>
                    <h4 className="text-xs sm:text-sm font-bold">Audit Conclusion & Verification</h4>
                    <p className="text-xs mt-1 leading-relaxed">{selectedReconRecord.verification_reason}</p>
                  </div>
                </div>

                {/* 7-Point Audit Checklist */}
                <div className="space-y-2.5 sm:space-y-3">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-[#f4f4f5]">
                      7-Point Verification Protocol Checks
                    </h3>
                  </div>

                  <div className="space-y-2 bg-slate-50 dark:bg-[#1c1c1e] p-3.5 sm:p-4 rounded-xl border border-slate-200/70 dark:border-white/[0.06]/50">
                    {(selectedReconRecord.audit_details?.checks_passed || []).map((check, idx) => (
                      <div key={idx} className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-[#a1a1aa]">
                        <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                        <span className="leading-snug">{check}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Matched Settlement Statements */}
                <div className="space-y-2.5 sm:space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-[#f4f4f5]">
                      Linked Statements ({selectedReconRecord.settlement_records.length})
                    </h3>
                  </div>

                  {selectedReconRecord.settlement_records.length > 0 ? (
                    <div className="space-y-2">
                      {selectedReconRecord.settlement_records.map((s, idx) => (
                        <div
                          key={idx}
                          className="p-3.5 rounded-xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#141414] flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-sm hover:border-indigo-300 transition-colors"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400">
                                {s.payment_id}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                  s.payment_status === 'paid'
                                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                                    : 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300'
                                }`}
                              >
                                {s.payment_status}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500 flex items-center gap-3">
                              <span>Date: {s.payment_date ? new Date(s.payment_date).toLocaleDateString() : '—'}</span>
                              <span>Method: {s.payment_method}</span>
                            </div>
                          </div>

                          <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-white/[0.04]">
                            <div className="text-left sm:text-right">
                              <span className="text-[10px] uppercase tracking-wider text-slate-400 block font-semibold">
                                Collected
                              </span>
                              <span className="font-extrabold text-sm text-emerald-600 dark:text-emerald-400 tabular-nums">
                                ৳ {s.cod_amount.toLocaleString()}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                handleOpenBatchDetails(s.payment_id);
                              }}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-[#242424] cursor-pointer"
                              title="Inspect Statement Batch"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl border border-dashed border-amber-300/80 dark:border-amber-800/60 bg-amber-50/40 dark:bg-amber-950/20 text-center text-xs text-amber-800 dark:text-amber-300 font-medium">
                      No matching settlement statement found in active disbursement batches.
                    </div>
                  )}
                </div>

                {/* Parcel & Recipient Metadata */}
                <div className="space-y-2.5 sm:space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-[#f4f4f5]">
                    Parcel & Customer Information
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-slate-50 dark:bg-[#1c1c1e] p-3.5 rounded-xl border border-slate-200/70 dark:border-white/[0.06]/50">
                    <div>
                      <span className="text-slate-400 block">Recipient Name:</span>
                      <span className="font-semibold text-slate-800 dark:text-[#f4f4f5]">
                        {selectedReconRecord.customer_name || 'Customer'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Recipient Phone:</span>
                      <span className="font-mono font-semibold text-slate-800 dark:text-[#f4f4f5]">
                        {selectedReconRecord.customer_phone || '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Consignment ID:</span>
                      <span className="font-mono font-semibold text-slate-800 dark:text-[#f4f4f5]">
                        {selectedReconRecord.consignment_id || '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Delivery Date:</span>
                      <span className="font-semibold text-slate-800 dark:text-[#f4f4f5]">
                        {selectedReconRecord.delivery_date
                          ? new Date(selectedReconRecord.delivery_date).toLocaleString()
                          : '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">OMS Order ID:</span>
                      {selectedReconRecord.oms_order_id ? (
                        <button
                          type="button"
                          onClick={() => handleOpenOmsOrder(selectedReconRecord.oms_order_id!)}
                          className="font-mono font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 mt-0.5 cursor-pointer"
                        >
                          <span>{selectedReconRecord.oms_order_id}</span>
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      ) : (
                        <span className="font-mono text-slate-400">Direct Courier Parcel</span>
                      )}
                    </div>
                    <div>
                      <span className="text-slate-400 block">Delivery Outcome:</span>
                      <span className="font-semibold capitalize text-slate-800 dark:text-[#f4f4f5]">
                        {selectedReconRecord.delivery_status.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Technical Raw Audit JSON Toggle */}
                <div className="pt-3 border-t border-slate-100 dark:border-white/[0.06]">
                  <button
                    type="button"
                    onClick={() => setShowReconRawJson(!showReconRawJson)}
                    className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Info className="w-3.5 h-3.5" />
                    <span>{showReconRawJson ? 'Hide Raw JSON' : 'View Raw JSON'}</span>
                  </button>

                  {showReconRawJson && (
                    <pre className="mt-2 p-3 rounded-xl bg-slate-900 text-slate-200 text-[11px] font-mono overflow-x-auto max-h-60">
                      {JSON.stringify(selectedReconRecord, null, 2)}
                    </pre>
                  )}
                </div>
              </div>

              {/* Drawer Footer Actions */}
              <div className="p-4 border-t border-slate-100 dark:border-white/[0.06] flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 bg-slate-50/50 dark:bg-[#141414]/50">
                <button
                  type="button"
                  onClick={() => setSelectedReconRecord(null)}
                  className="h-10 sm:h-9 px-4 py-2 text-xs font-bold text-slate-600 dark:text-[#a1a1aa] hover:bg-slate-100 dark:hover:bg-[#242424] rounded-xl transition-colors cursor-pointer text-center"
                >
                  Close Audit
                </button>

                <div className="grid grid-cols-2 sm:flex sm:items-center gap-2">
                  {selectedReconRecord.payment_batches.length > 0 && (
                    <button
                      type="button"
                      onClick={() => handleOpenBatchDetails(selectedReconRecord.payment_batches[0])}
                      className="h-10 sm:h-9 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white dark:bg-[#242424] border border-slate-200 dark:border-white/[0.06] text-slate-700 dark:text-[#f4f4f5] hover:bg-slate-50 transition-colors shadow-sm cursor-pointer"
                    >
                      <Receipt className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Statement</span>
                    </button>
                  )}

                  {selectedReconRecord.oms_order_id && (
                    <button
                      type="button"
                      onClick={() => handleOpenOmsOrder(selectedReconRecord.oms_order_id!)}
                      className="h-10 sm:h-9 inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors shadow-sm cursor-pointer"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>OMS Order</span>
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── 6. OMS Order Details Modal Integration ── */}
      {isOrderModalOpen && selectedOmsOrder && (
        <OrderDetailsModal
          isOpen={isOrderModalOpen}
          onClose={() => {
            setIsOrderModalOpen(false);
            setSelectedOmsOrder(null);
          }}
          order={selectedOmsOrder}
        />
      )}
    </div>
  );
}
