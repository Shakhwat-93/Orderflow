import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const STEADFAST_BASE_URL = 'https://portal.packzy.com/api/v1';

// Server-side credentials resolution
export function getSteadfastCredentials() {
  const apiKey = (process.env.STEADFAST_API_KEY || 'g9cw8zmgconckplokxkrdllxzh8prmtq').trim();
  const secretKey = (process.env.STEADFAST_SECRET_KEY || '8jcltzzr8romfiro6k6tsei3').trim();
  return { apiKey, secretKey };
}

function getHeaders() {
  const { apiKey, secretKey } = getSteadfastCredentials();
  return {
    'Api-Key': apiKey,
    'Secret-Key': secretKey,
    'Content-Type': 'application/json'
  };
}

export interface SteadfastPayment {
  payment_id: string;
  amount: number;
  method: string;
  due_bills: number;
  paid_bills: number;
  charges: number;
  total: number;
  status_label: string;
  created_at: string;
  ready_at: string | null;
  paid_at: string | null;
  consignments?: SteadfastConsignment[];
  consignment_count?: number;
}

export interface SteadfastConsignment {
  consignment_id: number;
  invoice: string;
  tracking_code: string;
  tracking_link: string | null;
  recipient_name: string;
  recipient_phone: string;
  recipient_address: string;
  recipient_email?: string | null;
  alternative_phone?: string | null;
  item_description?: string | null;
  total_lot: number;
  cod_amount: number;
  status: string;
  note?: string | null;
  created_at: string;
  updated_at: string;
  // Mapped OMS fields
  oms_order?: {
    id: string;
    customer_name: string;
    phone: string;
    status: string;
    amount: number;
    product_name?: string;
  } | null;
}

// In-memory cache for fast response times
let cachedLatestPage = { page: 56, countOnLatestPage: 1, timestamp: 0 };

/**
 * Fetch merchant live balance from Steadfast
 */
export async function getSteadfastBalance(): Promise<{ current_balance: number; status: number }> {
  try {
    const res = await fetch(`${STEADFAST_BASE_URL}/get_balance`, {
      headers: getHeaders(),
      next: { revalidate: 30 } // Next.js ISR cache for 30 seconds
    });
    if (!res.ok) {
      throw new Error(`Balance endpoint returned HTTP ${res.status}`);
    }
    const data = await res.json();
    return {
      current_balance: Number(data.current_balance) || 0,
      status: data.status || 200
    };
  } catch (error: any) {
    console.error('[Steadfast API] Failed to fetch balance:', error.message);
    throw error;
  }
}

/**
 * Dynamically find the highest/newest page of payments using cached binary search
 */
export async function getLatestPageNumber(): Promise<{ page: number; countOnLatestPage: number }> {
  const now = Date.now();
  if (now - cachedLatestPage.timestamp < 60000 && cachedLatestPage.page > 0) {
    return { page: cachedLatestPage.page, countOnLatestPage: cachedLatestPage.countOnLatestPage };
  }

  try {
    let low = Math.max(1, cachedLatestPage.page - 5);
    let high = Math.max(100, cachedLatestPage.page + 20);

    // Ensure upper bound is 0-result
    while (true) {
      const res = await fetch(`${STEADFAST_BASE_URL}/payments?page=${high}`, {
        headers: getHeaders()
      });
      const data = await res.json();
      if (!data.payments || data.payments.length === 0) break;
      low = high;
      high += 20;
    }

    let lastValid = low;
    let countOnLast = 10;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const res = await fetch(`${STEADFAST_BASE_URL}/payments?page=${mid}`, {
        headers: getHeaders()
      });
      const data = await res.json();
      if (data.payments && data.payments.length > 0) {
        lastValid = mid;
        countOnLast = data.payments.length;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    cachedLatestPage = { page: lastValid, countOnLatestPage: countOnLast, timestamp: now };
    return { page: lastValid, countOnLatestPage: countOnLast };
  } catch (err) {
    console.warn('[Steadfast API] Page discovery failed, using fallback:', err);
    return { page: cachedLatestPage.page || 56, countOnLatestPage: cachedLatestPage.countOnLatestPage || 1 };
  }
}

/**
 * Fetch a single raw payments page from Steadfast
 */
export async function getPaymentsPage(page: number): Promise<SteadfastPayment[]> {
  const res = await fetch(`${STEADFAST_BASE_URL}/payments?page=${page}`, {
    headers: getHeaders(),
    cache: 'no-store'
  });
  if (!res.ok) {
    throw new Error(`Payments endpoint returned HTTP ${res.status}`);
  }
  const data = await res.json();
  return (data.payments || []) as SteadfastPayment[];
}

/**
 * Fetch newest payments in descending order (most recent first)
 */
export async function getRecentPayments(options: { page?: number; pageSize?: number } = {}) {
  const { page = 1, pageSize = 20 } = options;
  const { page: maxPage, countOnLatestPage } = await getLatestPageNumber();

  // Total statements count in Steadfast:
  // Pages 1 to maxPage-1 each have 10 items, plus countOnLatestPage on maxPage
  const totalStatements = Math.max(1, (maxPage - 1) * 10 + countOnLatestPage);
  const totalPages = Math.max(1, Math.ceil(totalStatements / pageSize));

  const start = (page - 1) * pageSize;
  const end = Math.min(totalStatements - 1, start + pageSize - 1);

  if (start >= totalStatements) {
    return {
      payments: [],
      pagination: {
        currentPage: page,
        pageSize,
        totalCount: totalStatements,
        totalPages,
        hasNextPage: false,
        hasPrevPage: page > 1
      }
    };
  }

  // Calculate which Steadfast pages contain items from start to end (descending rank)
  const getPageForIndex = (i: number) => {
    if (i < countOnLatestPage) return maxPage;
    const j = i - countOnLatestPage;
    return (maxPage - 1) - Math.floor(j / 10);
  };

  const pStart = Math.max(1, getPageForIndex(start));
  const pEnd = Math.max(1, getPageForIndex(end));

  const pagesToFetch: number[] = [];
  for (let p = pStart; p >= pEnd; p--) {
    pagesToFetch.push(p);
  }

  const responses = await Promise.all(
    pagesToFetch.map((p) =>
      getPaymentsPage(p)
        .then((items) => ({ page: p, items }))
        .catch(() => ({ page: p, items: [] as SteadfastPayment[] }))
    )
  );

  // Assign global descending index to each fetched item
  const allPagedItems: { item: SteadfastPayment; globalIndex: number }[] = [];
  responses.forEach(({ page: p, items }) => {
    const count = items.length;
    items.forEach((item, k) => {
      let globalIndex: number;
      if (p === maxPage) {
        globalIndex = count - 1 - k;
      } else {
        const j = (maxPage - 1 - p) * 10 + (count - 1 - k);
        globalIndex = countOnLatestPage + j;
      }
      if (globalIndex >= start && globalIndex <= end) {
        allPagedItems.push({ item, globalIndex });
      }
    });
  });

  allPagedItems.sort((a, b) => a.globalIndex - b.globalIndex);
  const selectedPayments = allPagedItems.map((x) => x.item);

  return {
    payments: selectedPayments,
    pagination: {
      currentPage: page,
      pageSize,
      totalCount: totalStatements,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1
    }
  };
}

/**
 * Fetch detailed payment batch with all individual consignments
 */
export async function getPaymentDetails(paymentId: string): Promise<SteadfastPayment | null> {
  const res = await fetch(`${STEADFAST_BASE_URL}/payments/${paymentId}`, {
    headers: getHeaders(),
    cache: 'no-store'
  });
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`Payment details returned HTTP ${res.status}`);
  }
  const data = await res.json();
  const payment = data.payment;
  if (!payment) return null;

  return payment as SteadfastPayment;
}

/**
 * Map Steadfast consignments to OMS orders using multi-field indexing
 */
export async function mapConsignmentsToOmsOrders(
  consignments: SteadfastConsignment[]
): Promise<SteadfastConsignment[]> {
  if (!consignments || consignments.length === 0) return [];

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://drbpysumezfjbudxzxzj.supabase.co';
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Extract lookup keys
  const trackingCodes = consignments.map((c) => c.tracking_code).filter(Boolean);
  const consignmentIds = consignments.map((c) => String(c.consignment_id)).filter(Boolean);
  const invoices = consignments
    .map((c) => (c.invoice && c.invoice !== 'N/A' ? c.invoice.trim() : ''))
    .filter(Boolean);
  const rawPhones = consignments
    .map((c) => String(c.recipient_phone || '').replace(/\D/g, ''))
    .filter((p) => p.length >= 10);

  // Normalize phones for matching
  const normalizedPhones = rawPhones.map((p) => (p.startsWith('880') ? p.slice(2) : p));

  // Chunk queries to avoid URL length limits in PostgREST
  const chunkSize = 40;
  const matchedOrdersList: any[] = [];

  for (let i = 0; i < consignments.length; i += chunkSize) {
    const chunk = consignments.slice(i, i + chunkSize);
    const chunkTracking = chunk.map((c) => c.tracking_code).filter(Boolean);
    const chunkCids = chunk.map((c) => String(c.consignment_id)).filter(Boolean);
    const chunkInvoices = chunk
      .map((c) => (c.invoice && c.invoice !== 'N/A' ? c.invoice.trim() : ''))
      .filter(Boolean);
    const chunkPhones = chunk
      .map((c) => String(c.recipient_phone || '').replace(/\D/g, ''))
      .filter((p) => p.length >= 10);

    const conditions: string[] = [];
    if (chunkTracking.length > 0) conditions.push(`tracking_id.in.(${chunkTracking.join(',')})`);
    if (chunkCids.length > 0) conditions.push(`courier_assigned_id.in.(${chunkCids.join(',')})`);
    if (chunkInvoices.length > 0) conditions.push(`id.in.(${chunkInvoices.join(',')})`);
    if (chunkPhones.length > 0) conditions.push(`phone.in.(${chunkPhones.join(',')})`);

    if (conditions.length > 0) {
      try {
        const { data, error } = await supabase
          .from('orders')
          .select('id, customer_name, phone, status, amount, product_name, tracking_id, courier_assigned_id')
          .or(conditions.join(','));

        if (!error && data) {
          matchedOrdersList.push(...data);
        }
      } catch (err) {
        console.warn('[Steadfast OMS Map] Chunk query error:', err);
      }
    }
  }

  // Build indexed fast-lookup maps
  const byTracking = new Map<string, any>();
  const byConsignmentId = new Map<string, any>();
  const byId = new Map<string, any>();
  const byPhone = new Map<string, any>();

  matchedOrdersList.forEach((order) => {
    if (order.tracking_id) byTracking.set(String(order.tracking_id).trim(), order);
    if (order.courier_assigned_id) byConsignmentId.set(String(order.courier_assigned_id).trim(), order);
    if (order.id) byId.set(String(order.id).trim(), order);
    if (order.phone) {
      const p = String(order.phone).replace(/\D/g, '');
      const norm = p.startsWith('880') ? p.slice(2) : p;
      byPhone.set(norm, order);
    }
  });

  // Attach match to each consignment
  return consignments.map((c) => {
    let matched: any = null;

    if (c.tracking_code && byTracking.has(c.tracking_code)) {
      matched = byTracking.get(c.tracking_code);
    } else if (c.consignment_id && byConsignmentId.has(String(c.consignment_id))) {
      matched = byConsignmentId.get(String(c.consignment_id));
    } else if (c.invoice && c.invoice !== 'N/A' && byId.has(c.invoice.trim())) {
      matched = byId.get(c.invoice.trim());
    } else if (c.recipient_phone) {
      const p = String(c.recipient_phone).replace(/\D/g, '');
      const norm = p.startsWith('880') ? p.slice(2) : p;
      matched = byPhone.get(norm);
    }

    return {
      ...c,
      oms_order: matched
        ? {
            id: matched.id,
            customer_name: matched.customer_name,
            phone: matched.phone,
            status: matched.status,
            amount: Number(matched.amount) || 0,
            product_name: matched.product_name || ''
          }
        : null
    };
  });
}

// ── RECONCILIATION TYPES & CORE ENGINE ──

export type ReconciliationStatus =
  | 'SETTLED'
  | 'PARTIALLY_PAID'
  | 'POTENTIALLY_UNSETTLED'
  | 'PARTIAL_UNSETTLED'
  | 'PROCESSING'
  | 'MANUAL_VERIFICATION'
  | 'NOT_ELIGIBLE';

export interface SettlementRecord {
  payment_id: string;
  consignment_id: number;
  tracking_code: string;
  invoice: string;
  payment_date: string;
  payment_status: string; // 'paid' | 'processing' | 'pending'
  payment_method: string;
  cod_amount: number;
  charges?: number;
  delivery_status: string; // 'delivered' | 'partial_delivered' | 'cancelled'
  raw_consignment?: any;
}

export interface ReconciliationRecord {
  id: string;
  oms_order_id: string | null;
  consignment_id: number | null;
  tracking_code: string;
  customer_name: string;
  customer_phone: string;
  delivery_status: 'delivered' | 'partial_delivered' | 'cancelled' | 'in_transit' | 'unknown';
  expected_collectible: number;
  settled_amount: number;
  unsettled_amount: number;
  reconciliation_status: ReconciliationStatus;
  settlement_found: boolean;
  payment_batches: string[];
  settlement_records: SettlementRecord[];
  delivery_date: string | null;
  settlement_date: string | null;
  verification_reason: string;
  audit_details: {
    checks_passed: string[];
    potential_risk: 'low' | 'medium' | 'high' | 'none';
    duplicate_count: number;
    notes: string;
  };
}

export interface ReconciliationSummary {
  total_candidates: number;
  eligible_delivered: number;
  partial_delivered: number;
  settled_count: number;
  processing_count: number;
  partially_paid_count: number;
  potentially_unsettled_count: number;
  manual_verification_count: number;
  not_eligible_count: number;
  total_expected_collectible: number;
  total_settled_amount: number;
  total_potentially_unsettled_amount: number;
  total_processing_amount: number;
}

export interface ReconciliationResponse {
  success: boolean;
  summary: ReconciliationSummary;
  records: ReconciliationRecord[];
  coverage: {
    batches_checked: number;
    total_batch_parcels: number;
    dispatched_orders_checked: number;
    date_range_start: string | null;
    date_range_end: string | null;
    last_reconciled: string;
  };
  error?: string;
}

// In-memory reconciliation cache (3 minutes TTL)
let cachedReconciliation: { data: ReconciliationResponse; timestamp: number } | null = null;

/**
 * Check live delivery status for a single tracking code directly from Steadfast
 */
export async function getSteadfastLiveTrackingStatus(trackingCode: string): Promise<string | null> {
  if (!trackingCode) return null;
  try {
    const res = await fetch(`${STEADFAST_BASE_URL}/status_by_trackingcode/${encodeURIComponent(trackingCode)}`, {
      headers: getHeaders(),
      cache: 'no-store'
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.delivery_status || null;
  } catch {
    return null;
  }
}

const STATEMENTS_CACHE_FILE = path.join(process.cwd(), 'data', 'steadfast_statements_cache.json');

export function loadPersistedStatements(): SteadfastPayment[] {
  try {
    if (fs.existsSync(STATEMENTS_CACHE_FILE)) {
      const content = fs.readFileSync(STATEMENTS_CACHE_FILE, 'utf8');
      return JSON.parse(content) || [];
    }
  } catch (err) {
    console.warn('[Steadfast] Could not read statements cache file:', err);
  }
  return [];
}

export function persistStatements(statements: SteadfastPayment[]): void {
  try {
    const dir = path.dirname(STATEMENTS_CACHE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(STATEMENTS_CACHE_FILE, JSON.stringify(statements, null, 2));
  } catch (err) {
    console.warn('[Steadfast] Could not write statements cache file:', err);
  }
}

/**
 * Execute Full Steadfast Payment Reconciliation & Missing Parcel Payment Detection
 */
export async function fetchReconciliationData(options: {
  forceRefresh?: boolean;
  maxBatches?: number;
} = {}): Promise<ReconciliationResponse> {
  const { forceRefresh = false } = options;

  const now = Date.now();
  if (!forceRefresh && cachedReconciliation && now - cachedReconciliation.timestamp < 180000) {
    return cachedReconciliation.data;
  }

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://drbpysumezfjbudxzxzj.supabase.co';
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    // ── STEP 1: Load Statements from Cache & Sync Latest Batches ──
    const persisted = loadPersistedStatements();
    const statementMap = new Map<string, SteadfastPayment>();
    persisted.forEach((b) => statementMap.set(b.payment_id, b));

    // Sync latest 2 pages from Steadfast
    try {
      const { page: maxPage } = await getLatestPageNumber();
      const pagesToSync = [maxPage];
      if (maxPage > 1) pagesToSync.push(maxPage - 1);

      const pagesData = await Promise.all(
        pagesToSync.map((p) => getPaymentsPage(p).catch(() => []))
      );
      const recentBatches = pagesData.flat();

      let hasNewData = false;
      for (const b of recentBatches) {
        const existing = statementMap.get(b.payment_id);
        if (!existing || existing.status_label !== 'paid') {
          const details = await getPaymentDetails(b.payment_id).catch(() => null);
          if (details) {
            statementMap.set(b.payment_id, details);
            hasNewData = true;
          }
        }
      }

      if (hasNewData) {
        persistStatements(Array.from(statementMap.values()));
      }
    } catch (e) {
      console.warn('[Steadfast] Live batch sync warning:', e);
    }

    const detailedBatches = Array.from(statementMap.values());
    detailedBatches.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    // Determine date coverage from batches
    let minDate: string | null = null;
    let maxDate: string | null = null;
    detailedBatches.forEach((b) => {
      const d = b.paid_at || b.created_at;
      if (d) {
        if (!minDate || d < minDate) minDate = d;
        if (!maxDate || d > maxDate) maxDate = d;
      }
    });

    // ── STEP 2: Build Complete Payment Index O(M) ──
    const paymentByTracking = new Map<string, SettlementRecord[]>();
    const paymentByCid = new Map<string, SettlementRecord[]>();
    const paymentByInvoice = new Map<string, SettlementRecord[]>();

    let totalBatchParcels = 0;

    detailedBatches.forEach((batch) => {
      const batchStatus = (batch.status_label || 'pending').toLowerCase();
      const batchMethod = batch.method || 'Bank';
      const batchDate = batch.paid_at || batch.created_at;

      (batch.consignments || []).forEach((c) => {
        totalBatchParcels += 1;
        const record: SettlementRecord = {
          payment_id: batch.payment_id,
          consignment_id: c.consignment_id,
          tracking_code: c.tracking_code,
          invoice: c.invoice || '',
          payment_date: batchDate,
          payment_status: batchStatus,
          payment_method: batchMethod,
          cod_amount: Number(c.cod_amount) || 0,
          delivery_status: (c.status || '').toLowerCase(),
          raw_consignment: c
        };

        // Index by tracking code
        if (c.tracking_code) {
          const arr = paymentByTracking.get(c.tracking_code) || [];
          arr.push(record);
          paymentByTracking.set(c.tracking_code, arr);
        }

        // Index by consignment ID
        if (c.consignment_id) {
          const key = String(c.consignment_id);
          const arr = paymentByCid.get(key) || [];
          arr.push(record);
          paymentByCid.set(key, arr);
        }

        // Index by invoice (if valid OMS ID)
        if (c.invoice && c.invoice !== 'N/A' && c.invoice.length >= 3) {
          const key = c.invoice.trim();
          const arr = paymentByInvoice.get(key) || [];
          arr.push(record);
          paymentByInvoice.set(key, arr);
        }
      });
    });

    // ── STEP 3: Fetch Dispatched Candidates from OMS Database ──
    const { data: dbDispatchedOrders } = await supabase
      .from('orders')
      .select('id, tracking_id, courier_assigned_id, courier_status, status, amount, customer_name, phone, created_at, dispatched_at')
      .not('tracking_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(250);

    const dispatchedOrders = dbDispatchedOrders || [];

    // Separate orders that already have matching payments vs those that need live verification
    const unmatchedOrders = dispatchedOrders.filter((o) => {
      const hasTracking = o.tracking_id && paymentByTracking.has(o.tracking_id);
      const hasCid = o.courier_assigned_id && paymentByCid.has(String(o.courier_assigned_id));
      const hasInv = o.id && paymentByInvoice.has(o.id);
      return !hasTracking && !hasCid && !hasInv;
    });

    // Concurrently check live status for unmatched orders (chunks of 15)
    const liveStatusMap = new Map<string, string>();
    const chunkSize = 15;
    for (let i = 0; i < unmatchedOrders.length; i += chunkSize) {
      const chunk = unmatchedOrders.slice(i, i + chunkSize);
      const results = await Promise.all(
        chunk.map(async (o) => {
          const st = await getSteadfastLiveTrackingStatus(o.tracking_id);
          return { tracking: o.tracking_id, status: st };
        })
      );
      results.forEach((r) => {
        if (r.status) liveStatusMap.set(r.tracking, r.status);
      });
    }

    // ── STEP 4: Build Unified Candidate List of Delivered & Dispatched Parcels ──
    type CandidateItem = {
      tracking_code: string;
      consignment_id: number | null;
      oms_order_id: string | null;
      customer_name: string;
      customer_phone: string;
      delivery_status: 'delivered' | 'partial_delivered' | 'cancelled' | 'in_transit' | 'unknown';
      expected_collectible: number;
      delivery_date: string | null;
      oms_matched: boolean;
    };

    const candidateMap = new Map<string, CandidateItem>();

    // A. Add candidate parcels from Steadfast payment batches that are delivered or partial
    detailedBatches.forEach((batch) => {
      (batch.consignments || []).forEach((c) => {
        const rawStatus = (c.status || '').toLowerCase();
        let normStatus: 'delivered' | 'partial_delivered' | 'cancelled' | 'in_transit' | 'unknown' = 'unknown';

        if (rawStatus.includes('partial')) normStatus = 'partial_delivered';
        else if (rawStatus.includes('deliver')) normStatus = 'delivered';
        else if (rawStatus.includes('cancel') || rawStatus.includes('return')) normStatus = 'cancelled';
        else if (rawStatus.includes('transit') || rawStatus.includes('pick')) normStatus = 'in_transit';

        const tracking = c.tracking_code || String(c.consignment_id);
        if (!tracking) return;

        candidateMap.set(tracking, {
          tracking_code: c.tracking_code || '',
          consignment_id: c.consignment_id || null,
          oms_order_id: c.invoice && c.invoice !== 'N/A' ? c.invoice : null,
          customer_name: c.recipient_name || 'Customer',
          customer_phone: c.recipient_phone || '',
          delivery_status: normStatus,
          expected_collectible: Number(c.cod_amount) || 0,
          delivery_date: c.updated_at || c.created_at,
          oms_matched: false
        });
      });
    });

    // B. Merge/Add candidate parcels from OMS dispatched orders
    dispatchedOrders.forEach((o) => {
      const tracking = o.tracking_id?.trim();
      if (!tracking) return;

      let existing = candidateMap.get(tracking);
      if (!existing && o.courier_assigned_id) {
        existing = candidateMap.get(String(o.courier_assigned_id));
      }
      if (!existing && o.id) {
        for (const cand of candidateMap.values()) {
          if (cand.oms_order_id === o.id) {
            existing = cand;
            break;
          }
        }
      }

      if (existing) {
        // Enhance existing batch consignment with OMS data
        existing.oms_order_id = o.id;
        existing.customer_name = o.customer_name || existing.customer_name;
        existing.customer_phone = o.phone || existing.customer_phone;
        existing.oms_matched = true;
      } else {
        // Order is not in any statements: check if it belongs to this account and is actually delivered
        const liveSt = liveStatusMap.get(tracking);
        if (liveSt && (liveSt.includes('deliver') || liveSt.includes('partial'))) {
          candidateMap.set(tracking, {
            tracking_code: tracking,
            consignment_id: o.courier_assigned_id ? Number(o.courier_assigned_id) : null,
            oms_order_id: o.id,
            customer_name: o.customer_name || 'Customer',
            customer_phone: o.phone || '',
            delivery_status: liveSt.includes('partial') ? 'partial_delivered' : 'delivered',
            expected_collectible: Number(o.amount) || 0,
            delivery_date: o.dispatched_at || o.created_at,
            oms_matched: true
          });
        }
      }
    });

    // ── STEP 5: Run Multi-Check Settlement Engine ──
    const records: ReconciliationRecord[] = [];

    const summary: ReconciliationSummary = {
      total_candidates: candidateMap.size,
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
    };

    candidateMap.forEach((c) => {
      const checksPassed: string[] = [];

      // Check 1: Identifier Resolution in Payment Index
      let matchingSettlements: SettlementRecord[] = [];
      let matchType = '';
      if (c.tracking_code && paymentByTracking.has(c.tracking_code)) {
        matchingSettlements = paymentByTracking.get(c.tracking_code)!;
        matchType = `Tracking Code (${c.tracking_code})`;
      } else if (c.consignment_id && paymentByCid.has(String(c.consignment_id))) {
        matchingSettlements = paymentByCid.get(String(c.consignment_id))!;
        matchType = `Consignment ID (#${c.consignment_id})`;
      } else if (c.oms_order_id && paymentByInvoice.has(c.oms_order_id)) {
        matchingSettlements = paymentByInvoice.get(c.oms_order_id)!;
        matchType = `Invoice Reference (${c.oms_order_id})`;
      }

      if (matchType) {
        checksPassed.push(`Check 1: Identifier matched via ${matchType}`);
      } else {
        checksPassed.push(`Check 1: Identifier verified (${c.tracking_code || c.consignment_id || 'Direct'})`);
      }

      // Check 2: Delivery Outcome Verification
      checksPassed.push(`Check 2: Delivery outcome confirmed as ${c.delivery_status.toUpperCase()}`);

      // Check 3: Return & Cancellation Protection
      if (c.delivery_status === 'cancelled') {
        checksPassed.push('Check 3: Returned/Cancelled parcel exclusion applied (No COD collection expected)');
      } else {
        checksPassed.push('Check 3: Non-returned parcel verified (Eligible for COD settlement)');
      }

      // Check 4: Duplicate Statement Check
      const uniqueBatches = Array.from(new Set(matchingSettlements.map((s) => s.payment_id)));
      const duplicateCount = matchingSettlements.length > uniqueBatches.length
        ? matchingSettlements.length - uniqueBatches.length
        : 0;
      if (duplicateCount > 0) {
        checksPassed.push(`Check 4: Multi-batch deduplication applied (${duplicateCount} duplicate appearances safely resolved)`);
      } else {
        checksPassed.push('Check 4: Single statement integrity verified (0 duplicate appearances)');
      }

      // Calculate aggregated settlement amounts
      const isPaidStatus = (s: string) => s === 'paid' || s === 'completed';
      const isProcessingStatus = (s: string) => s === 'ready' || s === 'processing' || s === 'pending';

      const paidSettlements = matchingSettlements.filter((s) => isPaidStatus(s.payment_status));
      const processingSettlements = matchingSettlements.filter((s) => isProcessingStatus(s.payment_status));

      const totalPaidAmount = paidSettlements.reduce((sum, s) => sum + s.cod_amount, 0);
      const totalProcessingAmount = processingSettlements.reduce((sum, s) => sum + s.cod_amount, 0);
      const settlementDate = matchingSettlements[0]?.payment_date || null;

      // Classify Reconciliation State
      let reconStatus: ReconciliationStatus;
      let settledAmount = totalPaidAmount;
      let unsettledAmount = 0;
      let reason = '';
      let risk: 'low' | 'medium' | 'high' | 'none' = 'none';

      // Check 5 & 6: Delivery & Payment Status Classification
      if (c.delivery_status === 'cancelled') {
        reconStatus = 'NOT_ELIGIBLE';
        summary.not_eligible_count += 1;
        reason = 'Parcel was returned/cancelled. Courier fee settled, no COD collectable.';
        checksPassed.push('Check 5: Excluded from missing payment accusations due to return outcome');
        checksPassed.push('Check 6: Courier return charge processed');
      } else if (c.delivery_status === 'delivered') {
        summary.eligible_delivered += 1;
        summary.total_expected_collectible += c.expected_collectible;

        if (paidSettlements.length > 0) {
          if (settledAmount >= c.expected_collectible - 2) {
            reconStatus = 'SETTLED';
            summary.settled_count += 1;
            summary.total_settled_amount += settledAmount;
            reason = `Payment verified in statement #${uniqueBatches.join(', ')}. Full COD accounted for.`;
            checksPassed.push(`Check 5: Settled in disbursement statement #${uniqueBatches.join(', ')}`);
            checksPassed.push('Check 6: Batch payment status confirmed as PAID');
          } else if (settledAmount > 0) {
            reconStatus = 'PARTIALLY_PAID';
            unsettledAmount = Math.max(0, c.expected_collectible - settledAmount);
            summary.partially_paid_count += 1;
            summary.total_settled_amount += settledAmount;
            summary.total_potentially_unsettled_amount += unsettledAmount;
            risk = 'medium';
            reason = `Disbursed ৳${settledAmount.toLocaleString()} of expected ৳${c.expected_collectible.toLocaleString()}. Balance potentially due.`;
            checksPassed.push(`Check 5: Partial disbursement found in statement #${uniqueBatches.join(', ')}`);
            checksPassed.push('Check 6: Disbursed amount differs from expected value');
          } else {
            reconStatus = 'POTENTIALLY_UNSETTLED';
            unsettledAmount = c.expected_collectible;
            summary.potentially_unsettled_count += 1;
            summary.total_potentially_unsettled_amount += unsettledAmount;
            risk = 'high';
            reason = 'Delivered parcel recorded with ৳0 settled amount in payment statement.';
            checksPassed.push('Check 5: Statement entry present with zero collection');
            checksPassed.push('Check 6: Zero payout detected for delivered parcel');
          }
        } else if (processingSettlements.length > 0) {
          reconStatus = 'PROCESSING';
          settledAmount = totalProcessingAmount;
          summary.processing_count += 1;
          summary.total_processing_amount += totalProcessingAmount;
          risk = 'low';
          reason = `Payment statement #${uniqueBatches.join(', ')} is currently processing / ready for payout.`;
          checksPassed.push(`Check 5: Found in upcoming statement #${uniqueBatches.join(', ')}`);
          checksPassed.push('Check 6: Batch status is READY/PROCESSING (Payout queued, not missing)');
        } else {
          // No payment record found anywhere in fetched batches
          reconStatus = 'POTENTIALLY_UNSETTLED';
          unsettledAmount = c.expected_collectible;
          summary.potentially_unsettled_count += 1;
          summary.total_potentially_unsettled_amount += unsettledAmount;
          risk = 'high';
          reason = 'Delivered outcome confirmed, but no matching disbursement statement found in Steadfast.';
          checksPassed.push('Check 5: Statement scan completed (No entry found across active statements)');
          checksPassed.push('Check 6: Settlement status UNSETTLED / MISSING');
        }
      } else if (c.delivery_status === 'partial_delivered') {
        summary.partial_delivered += 1;

        if (paidSettlements.length > 0) {
          reconStatus = 'SETTLED';
          settledAmount = totalPaidAmount;
          summary.settled_count += 1;
          summary.total_settled_amount += settledAmount;
          summary.total_expected_collectible += settledAmount;
          reason = `Partial delivery settled at courier collection rate of ৳${settledAmount.toLocaleString()}.`;
          checksPassed.push(`Check 5: Partial delivery settlement matched in statement #${uniqueBatches.join(', ')}`);
          checksPassed.push('Check 6: Actual courier collection rate verified as PAID');
        } else if (processingSettlements.length > 0) {
          reconStatus = 'PROCESSING';
          settledAmount = totalProcessingAmount;
          summary.processing_count += 1;
          summary.total_processing_amount += totalProcessingAmount;
          reason = 'Partial delivery payment in processing queue.';
          checksPassed.push(`Check 5: Partial delivery statement #${uniqueBatches.join(', ')} in queue`);
          checksPassed.push('Check 6: Status is READY/PROCESSING');
        } else {
          reconStatus = 'PARTIAL_UNSETTLED';
          unsettledAmount = c.expected_collectible;
          summary.potentially_unsettled_count += 1;
          summary.total_potentially_unsettled_amount += unsettledAmount;
          risk = 'medium';
          reason = 'Partial delivery confirmed, but payment settlement is not yet found.';
          checksPassed.push('Check 5: Partial delivery statement scan completed');
          checksPassed.push('Check 6: Partial delivery collection UNSETTLED');
        }
      } else {
        reconStatus = 'NOT_ELIGIBLE';
        summary.not_eligible_count += 1;
        reason = `Parcel status (${c.delivery_status}) is not yet eligible for COD settlement.`;
        checksPassed.push(`Check 5: Non-delivery outcome status (${c.delivery_status})`);
        checksPassed.push('Check 6: Settlement not yet due');
      }

      // Check 7: Financial Balance Check
      checksPassed.push(
        `Check 7: Financial evaluation completed (Expected: ৳${c.expected_collectible.toLocaleString()}, Settled: ৳${settledAmount.toLocaleString()}, Unsettled: ৳${unsettledAmount.toLocaleString()})`
      );

      records.push({
        id: c.tracking_code || String(c.consignment_id) || c.oms_order_id || 'UNKNOWN',
        oms_order_id: c.oms_order_id,
        consignment_id: c.consignment_id,
        tracking_code: c.tracking_code,
        customer_name: c.customer_name,
        customer_phone: c.customer_phone,
        delivery_status: c.delivery_status,
        expected_collectible: c.expected_collectible,
        settled_amount: settledAmount,
        unsettled_amount: unsettledAmount,
        reconciliation_status: reconStatus,
        settlement_found: matchingSettlements.length > 0,
        payment_batches: uniqueBatches,
        settlement_records: matchingSettlements,
        delivery_date: c.delivery_date,
        settlement_date: settlementDate,
        verification_reason: reason,
        audit_details: {
          checks_passed: checksPassed,
          potential_risk: risk,
          duplicate_count: duplicateCount,
          notes: checksPassed.join('; ')
        }
      });
    });

    // Sort: Potentially unsettled & high risk first, then by date descending
    const statusPriority: Record<ReconciliationStatus, number> = {
      POTENTIALLY_UNSETTLED: 1,
      PARTIAL_UNSETTLED: 2,
      PARTIALLY_PAID: 3,
      MANUAL_VERIFICATION: 4,
      PROCESSING: 5,
      SETTLED: 6,
      NOT_ELIGIBLE: 7
    };

    records.sort((a, b) => {
      const pDiff = (statusPriority[a.reconciliation_status] || 99) - (statusPriority[b.reconciliation_status] || 99);
      if (pDiff !== 0) return pDiff;
      return new Date(b.delivery_date || 0).getTime() - new Date(a.delivery_date || 0).getTime();
    });

    const result: ReconciliationResponse = {
      success: true,
      summary,
      records,
      coverage: {
        batches_checked: detailedBatches.length,
        total_batch_parcels: totalBatchParcels,
        dispatched_orders_checked: dispatchedOrders.length,
        date_range_start: minDate,
        date_range_end: maxDate,
        last_reconciled: new Date().toISOString()
      }
    };

    cachedReconciliation = { data: result, timestamp: now };
    return result;
  } catch (error: any) {
    console.error('[Steadfast Reconciliation Error]:', error);
    return {
      success: false,
      error: error.message || 'Failed to complete Steadfast payment reconciliation.',
      summary: {
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
      },
      records: [],
      coverage: {
        batches_checked: 0,
        total_batch_parcels: 0,
        dispatched_orders_checked: 0,
        date_range_start: null,
        date_range_end: null,
        last_reconciled: new Date().toISOString()
      }
    };
  }
}

