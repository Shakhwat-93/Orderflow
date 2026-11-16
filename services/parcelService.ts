/**
 * Parcel Service
 * ──────────────
 * Unified enterprise service layer for factory parcel tracking,
 * barcode generation, atomic dispatch/return scanning, and independent inventory.
 */

import { createClient } from '@/lib/supabase/client';
import type {
  ParcelRecord,
  ParcelItem,
  ParcelScanEvent,
  ParcelInventory,
  ParcelInventoryTransaction,
  ParcelReturnRecord,
  CreateParcelInput,
  DispatchScanResult,
  ReturnScanResult,
  ParcelMetrics,
  ParcelReturnCondition,
} from '@/types/parcels';
import type { Order } from '@/types/api';
import { extractProductDetails } from '@/components/PrintSystem/printUtils';

const supabase = createClient();

/**
 * Generate a sequential Parcel ID & Barcode (PAR-YYYY-XXXXXX)
 */
export async function generateNextParcelId(): Promise<{ parcel_id: string; barcode: string }> {
  const { data, error } = await supabase.rpc('fn_generate_next_parcel_id');
  if (error || !data || data.length === 0) {
    // Fallback if RPC fails: generate ISO-based format
    const year = new Date().getFullYear();
    const rand = Math.floor(100000 + Math.random() * 900000);
    const pid = `PAR-${year}-${rand}`;
    return { parcel_id: pid, barcode: pid };
  }
  return {
    parcel_id: data[0].next_parcel_id,
    barcode: data[0].next_barcode,
  };
}

/**
 * Create a new physical parcel with line items
 */
export async function createParcel(input: CreateParcelInput): Promise<ParcelRecord> {
  const { parcel_id, barcode } = await generateNextParcelId();
  const totalQty = input.items.reduce((sum, it) => sum + (Number(it.quantity) || 1), 0);

  const { data: record, error: recErr } = await supabase
    .from('parcel_records')
    .insert({
      parcel_id,
      barcode,
      order_id: input.order_id || null,
      customer_name: input.customer_name || null,
      customer_phone: input.customer_phone || null,
      customer_address: input.customer_address || null,
      shipping_zone: input.shipping_zone || null,
      courier_name: input.courier_name || null,
      status: 'CREATED',
      current_location: 'Factory Floor',
      total_quantity: totalQty,
      notes: input.notes || null,
      created_by: input.created_by || 'Factory Operator',
    })
    .select('*')
    .single();

  if (recErr || !record) {
    throw new Error(recErr?.message || 'Failed to create parcel record');
  }

  // Insert items
  const itemsToInsert = input.items.map((it) => ({
    parcel_record_id: record.id,
    parcel_id: record.parcel_id,
    order_id: input.order_id || null,
    product_name: it.product_name,
    sku: it.sku || it.product_name.replace(/\s+/g, '-').toUpperCase(),
    variant: it.variant || null,
    size: it.size || null,
    color: it.color || null,
    quantity: Number(it.quantity) || 1,
    unit_price: Number(it.unit_price) || 0,
  }));

  const { data: items, error: itemsErr } = await supabase
    .from('parcel_items')
    .insert(itemsToInsert)
    .select('*');

  if (itemsErr) {
    console.warn('Warning: Failed to insert parcel line items:', itemsErr.message);
  }

  return {
    ...record,
    items: items || [],
  };
}

/**
 * Generate Parcel(s) directly from an existing live Order.
 * Supports:
 *  - 'single': packs all products in the order into 1 parcel
 *  - 'multi_box': creates 1 parcel per distinct line item
 */
export async function createParcelsFromOrder(
  order: Order | any,
  mode: 'single' | 'multi_box' = 'single',
  operatorName = 'Factory Dispatcher'
): Promise<ParcelRecord[]> {
  const rawItems = extractProductDetails(order);

  const normalizedItems = rawItems.map((p) => {
    const rawSku = (p as any).sku || p.name;
    const cleanSku = String(rawSku)
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .toUpperCase();

    return {
      product_name: p.name,
      sku: cleanSku || 'GEN-SKU',
      variant: p.size || null,
      size: p.size || null,
      color: (p as any).color || null,
      quantity: Number(p.quantity) || 1,
      unit_price: Number(p.unitPrice) || 0,
    };
  });

  if (normalizedItems.length === 0) {
    normalizedItems.push({
      product_name: order.product_name || 'Standard Package',
      sku: String(order.product_name || 'GEN-SKU').replace(/\s+/g, '-').toUpperCase(),
      variant: order.size || null,
      size: order.size || null,
      color: null,
      quantity: Number(order.quantity) || 1,
      unit_price: Number(order.amount) || 0,
    });
  }

  const baseInput = {
    order_id: String(order.id),
    customer_name: order.customer_name,
    customer_phone: order.phone,
    customer_address: order.address,
    shipping_zone: order.shipping_zone,
    courier_name: order.courier_name,
    created_by: operatorName,
  };

  if (mode === 'single' || normalizedItems.length <= 1) {
    const parcel = await createParcel({
      ...baseInput,
      notes: `Single parcel for Order ${order.id}`,
      items: normalizedItems,
    });
    return [parcel];
  }

  // Multi-box mode: 1 parcel per item
  const created: ParcelRecord[] = [];
  for (let i = 0; i < normalizedItems.length; i++) {
    const it = normalizedItems[i];
    const parcel = await createParcel({
      ...baseInput,
      notes: `Box ${i + 1} of ${normalizedItems.length} for Order ${order.id}`,
      items: [it],
    });
    created.push(parcel);
  }
  return created;
}

/**
 * Atomic Factory Dispatch Scan
 * Calls PostgreSQL atomic procedure to lock row, deduct from Factory Parcel Inventory,
 * change status to DISPATCHED, and write immutable ledger entry.
 */
export async function dispatchParcelByBarcode(params: {
  barcode: string;
  operatorName?: string;
  operatorUserId?: string;
  stationId?: string;
}): Promise<DispatchScanResult> {
  const { barcode, operatorName = 'Factory Dispatcher', operatorUserId, stationId = 'STATION-DISPATCH-01' } = params;

  const { data, error } = await supabase.rpc('fn_dispatch_parcel_atomic', {
    p_barcode: barcode.trim(),
    p_operator_name: operatorName,
    p_operator_user_id: operatorUserId || null,
    p_station_id: stationId,
  });

  if (error) {
    return {
      success: false,
      code: 'ERROR',
      message: `Database error: ${error.message}`,
    };
  }

  return data as DispatchScanResult;
}

/**
 * Atomic Return Parcel Scan
 * Calls PostgreSQL atomic procedure to check original parcel, verify previous dispatch,
 * record inspection condition, and restock eligible quantities into Factory Parcel Inventory.
 */
export async function receiveReturnParcel(params: {
  barcode: string;
  condition: ParcelReturnCondition;
  returnedQty: number;
  operatorName?: string;
  operatorUserId?: string;
  stationId?: string;
  notes?: string;
}): Promise<ReturnScanResult> {
  const {
    barcode,
    condition,
    returnedQty,
    operatorName = 'Returns QC Operator',
    operatorUserId,
    stationId = 'STATION-RETURN-01',
    notes = '',
  } = params;

  const { data, error } = await supabase.rpc('fn_receive_return_parcel_atomic', {
    p_barcode: barcode.trim(),
    p_condition: condition,
    p_returned_qty: Number(returnedQty) || 1,
    p_operator_name: operatorName,
    p_operator_user_id: operatorUserId || null,
    p_station_id: stationId,
    p_notes: notes,
  });

  if (error) {
    return {
      success: false,
      code: 'ERROR',
      message: `Database error: ${error.message}`,
    };
  }

  return data as ReturnScanResult;
}

/**
 * Fast lookup by Barcode or Parcel ID
 */
export async function lookupParcel(query: string): Promise<ParcelRecord | null> {
  const clean = query.trim();
  if (!clean) return null;

  const { data, error } = await supabase
    .from('parcel_records')
    .select('*, items:parcel_items(*)')
    .or(`barcode.eq.${clean},parcel_id.eq.${clean}`)
    .maybeSingle();

  if (error || !data) return null;
  return data as ParcelRecord;
}

/**
 * Fetch complete Parcel journey, items, scan history, and return events
 */
export async function getParcelDetails(parcelId: string): Promise<{
  parcel: ParcelRecord | null;
  scanEvents: ParcelScanEvent[];
  returns: ParcelReturnRecord[];
  transactions: ParcelInventoryTransaction[];
}> {
  const clean = parcelId.trim();

  const [parcelRes, scanRes, retRes, txRes] = await Promise.all([
    supabase
      .from('parcel_records')
      .select('*, items:parcel_items(*)')
      .or(`parcel_id.eq.${clean},barcode.eq.${clean}`)
      .maybeSingle(),
    supabase
      .from('parcel_scan_events')
      .select('*')
      .or(`parcel_id.eq.${clean},barcode.eq.${clean}`)
      .order('scanned_at', { ascending: false }),
    supabase
      .from('parcel_returns')
      .select('*')
      .eq('parcel_id', clean)
      .order('created_at', { ascending: false }),
    supabase
      .from('parcel_inventory_transactions')
      .select('*')
      .eq('parcel_id', clean)
      .order('created_at', { ascending: false }),
  ]);

  return {
    parcel: (parcelRes.data as ParcelRecord) || null,
    scanEvents: (scanRes.data as ParcelScanEvent[]) || [],
    returns: (retRes.data as ParcelReturnRecord[]) || [],
    transactions: (txRes.data as ParcelInventoryTransaction[]) || [],
  };
}

/**
 * Fetch paginated parcels with filters
 */
export async function getParcels(params: {
  status?: string;
  searchTerm?: string;
  dateStart?: string;
  dateEnd?: string;
  page?: number;
  limit?: number;
}): Promise<{ parcels: ParcelRecord[]; totalCount: number }> {
  const { status, searchTerm, dateStart, dateEnd, page = 1, limit = 20 } = params;

  let query = supabase.from('parcel_records').select('*, items:parcel_items(*)', { count: 'exact' });

  if (status && status !== 'ALL') {
    query = query.eq('status', status);
  }

  if (searchTerm && searchTerm.trim()) {
    const s = `%${searchTerm.trim()}%`;
    query = query.or(
      `parcel_id.ilike.${s},barcode.ilike.${s},order_id.ilike.${s},customer_name.ilike.${s},customer_phone.ilike.${s}`
    );
  }

  if (dateStart) {
    query = query.gte('created_at', dateStart);
  }
  if (dateEnd) {
    query = query.lte('created_at', dateEnd);
  }

  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const { data, count, error } = await query
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) {
    console.error('Error fetching parcels:', error.message);
    return { parcels: [], totalCount: 0 };
  }

  return {
    parcels: (data as ParcelRecord[]) || [],
    totalCount: count || 0,
  };
}

/**
 * Fetch independent Factory Parcel Inventory stock records
 */
export async function getParcelInventory(): Promise<ParcelInventory[]> {
  const { data, error } = await supabase
    .from('parcel_inventory')
    .select('*')
    .order('sku', { ascending: true });

  if (error) {
    console.error('Error fetching parcel inventory:', error.message);
    return [];
  }
  return data as ParcelInventory[];
}

/**
 * Adjust independent Factory Parcel Inventory balance (opening stock / manual audit)
 */
export async function adjustParcelInventoryStock(params: {
  sku: string;
  productName: string;
  adjustmentQty: number;
  movementType?: 'OPENING_STOCK' | 'STOCK_ADJUSTMENT';
  operatorName?: string;
  note?: string;
}): Promise<boolean> {
  const { sku, productName, adjustmentQty, movementType = 'STOCK_ADJUSTMENT', operatorName = 'Inventory Manager', note = '' } = params;

  // 1. Get current stock
  const { data: existing } = await supabase
    .from('parcel_inventory')
    .select('*')
    .eq('sku', sku)
    .maybeSingle();

  const prevStock = existing ? existing.current_stock : 0;
  const newStock = prevStock + adjustmentQty;

  // 2. Upsert inventory
  const { error: invErr } = await supabase
    .from('parcel_inventory')
    .upsert({
      sku,
      product_name: productName,
      current_stock: newStock,
      updated_at: new Date().toISOString(),
    });

  if (invErr) {
    throw new Error(invErr.message);
  }

  // 3. Record transaction in immutable ledger
  const txnId = `TXN-ADJ-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  await supabase.from('parcel_inventory_transactions').insert({
    transaction_id: txnId,
    sku,
    product_name: productName,
    movement_type: movementType,
    quantity: adjustmentQty,
    previous_stock: prevStock,
    new_stock: newStock,
    operator_name: operatorName,
    notes: note || `Manual adjustment by ${operatorName}`,
  });

  return true;
}

/**
 * Fetch immutable inventory transactions ledger
 */
export async function getParcelInventoryTransactions(limit = 100): Promise<ParcelInventoryTransaction[]> {
  const { data, error } = await supabase
    .from('parcel_inventory_transactions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching parcel inventory transactions:', error.message);
    return [];
  }
  return data as ParcelInventoryTransaction[];
}

/**
 * Compute real-time KPI metrics for Parcel Dashboard
 */
export async function getParcelMetrics(): Promise<ParcelMetrics> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIso = today.toISOString();

  const [
    totalRes,
    dispatchedRes,
    inTransitRes,
    deliveredRes,
    returnedRes,
    inspectionRes,
    restockedRes,
    damagedRes,
    todayDispatchedRes,
    todayReturnedRes,
    invRes,
  ] = await Promise.all([
    supabase.from('parcel_records').select('*', { count: 'exact', head: true }),
    supabase.from('parcel_records').select('*', { count: 'exact', head: true }).eq('status', 'DISPATCHED'),
    supabase.from('parcel_records').select('*', { count: 'exact', head: true }).eq('status', 'IN TRANSIT'),
    supabase.from('parcel_records').select('*', { count: 'exact', head: true }).eq('status', 'DELIVERED'),
    supabase.from('parcel_records').select('*', { count: 'exact', head: true }).in('status', ['RETURN RECEIVED', 'RESTOCKED', 'DAMAGED']),
    supabase.from('parcel_records').select('*', { count: 'exact', head: true }).eq('status', 'UNDER INSPECTION'),
    supabase.from('parcel_records').select('*', { count: 'exact', head: true }).eq('status', 'RESTOCKED'),
    supabase.from('parcel_records').select('*', { count: 'exact', head: true }).in('status', ['DAMAGED', 'QUARANTINED']),
    supabase.from('parcel_records').select('*', { count: 'exact', head: true }).gte('dispatched_at', todayIso),
    supabase.from('parcel_records').select('*', { count: 'exact', head: true }).gte('returned_at', todayIso),
    supabase.from('parcel_inventory').select('current_stock'),
  ]);

  const inventoryTotalStock = (invRes.data || []).reduce((acc, row) => acc + (row.current_stock || 0), 0);

  return {
    totalParcels: totalRes.count || 0,
    dispatchedCount: dispatchedRes.count || 0,
    inTransitCount: inTransitRes.count || 0,
    deliveredCount: deliveredRes.count || 0,
    returnedCount: returnedRes.count || 0,
    underInspectionCount: inspectionRes.count || 0,
    restockedCount: restockedRes.count || 0,
    damagedCount: damagedRes.count || 0,
    todayDispatchedCount: todayDispatchedRes.count || 0,
    todayReturnedCount: todayReturnedRes.count || 0,
    inventoryTotalStock,
  };
}
