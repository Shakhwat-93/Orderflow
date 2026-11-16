/**
 * Factory Parcel Tracking & Independent Inventory Types
 * ─────────────────────────────────────────────────────
 * Strict type definitions for parcels, barcodes, scan events,
 * return inspections, and independent factory parcel inventory.
 */

export type ParcelStatus =
  | 'CREATED'
  | 'PACKED'
  | 'READY FOR DISPATCH'
  | 'DISPATCHED'
  | 'IN TRANSIT'
  | 'DELIVERED'
  | 'RETURN REQUESTED'
  | 'RETURN IN TRANSIT'
  | 'RETURN RECEIVED'
  | 'UNDER INSPECTION'
  | 'RESTOCKED'
  | 'DAMAGED'
  | 'QUARANTINED'
  | 'LOST'
  | 'CANCELLED';

export type ParcelReturnCondition =
  | 'GOOD_RESELLABLE'
  | 'DAMAGED'
  | 'DEFECTIVE'
  | 'INCOMPLETE'
  | 'WRONG_PRODUCT'
  | 'NEEDS_INSPECTION'
  | 'QUARANTINE';

export type ParcelScanEventType =
  | 'DISPATCH_SCAN'
  | 'RETURN_SCAN'
  | 'INSPECTION_SCAN'
  | 'VERIFY_SCAN'
  | 'DUPLICATE_SCAN';

export type ParcelScanResult =
  | 'SUCCESS'
  | 'BLOCKED_DUPLICATE'
  | 'INVALID_STATUS'
  | 'ERROR';

export type ParcelInventoryMovementType =
  | 'OPENING_STOCK'
  | 'PARCEL_PACKED'
  | 'FACTORY_DISPATCH'
  | 'RETURN_RECEIVED'
  | 'RESTOCKED'
  | 'DAMAGED_STOCK'
  | 'QUARANTINE_TRANSFER'
  | 'STOCK_ADJUSTMENT'
  | 'REVERSAL';

export interface ParcelItem {
  id?: string;
  parcel_record_id?: string;
  parcel_id: string;
  order_id?: string | null;
  product_name: string;
  sku: string;
  variant?: string | null;
  size?: string | null;
  color?: string | null;
  quantity: number;
  unit_price?: number;
  created_at?: string;
}

export interface ParcelRecord {
  id: string;
  parcel_id: string;
  barcode: string;
  order_id?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_address?: string | null;
  shipping_zone?: string | null;
  courier_name?: string | null;
  courier_tracking_id?: string | null;
  status: ParcelStatus;
  current_location: string;
  total_quantity: number;
  weight_kg?: number;
  notes?: string | null;
  created_by?: string | null;
  created_by_user_id?: string | null;
  dispatched_at?: string | null;
  dispatched_by?: string | null;
  returned_at?: string | null;
  returned_by?: string | null;
  last_scanned_at?: string | null;
  last_scanner_station?: string | null;
  created_at: string;
  updated_at: string;
  items?: ParcelItem[];
}

export interface ParcelScanEvent {
  id: string;
  parcel_record_id?: string | null;
  parcel_id: string;
  barcode: string;
  event_type: ParcelScanEventType;
  status_before?: string | null;
  status_after?: string | null;
  scan_result: ParcelScanResult;
  operator_name?: string | null;
  operator_user_id?: string | null;
  station_id?: string | null;
  notes?: string | null;
  metadata?: Record<string, any>;
  scanned_at: string;
}

export interface ParcelInventory {
  id: string;
  sku: string;
  product_name: string;
  variant?: string | null;
  current_stock: number;
  dispatched_stock: number;
  returned_stock: number;
  damaged_stock: number;
  quarantined_stock: number;
  min_stock_alert: number;
  created_at?: string;
  updated_at?: string;
}

export interface ParcelInventoryTransaction {
  id: string;
  transaction_id: string;
  parcel_record_id?: string | null;
  parcel_id?: string | null;
  order_id?: string | null;
  sku: string;
  product_name: string;
  movement_type: ParcelInventoryMovementType;
  quantity: number;
  previous_stock: number;
  new_stock: number;
  operator_name?: string | null;
  operator_user_id?: string | null;
  station_id?: string | null;
  notes?: string | null;
  created_at: string;
}

export interface ParcelReturnRecord {
  id: string;
  parcel_record_id: string;
  parcel_id: string;
  order_id?: string | null;
  return_condition: ParcelReturnCondition;
  original_quantity: number;
  returned_quantity: number;
  restocked_quantity: number;
  damaged_quantity: number;
  inspected_by?: string | null;
  inspected_by_user_id?: string | null;
  inspection_notes?: string | null;
  action_taken: string;
  created_at: string;
}

export interface ParcelScannerStation {
  id: string;
  name: string;
  station_type: 'DISPATCH' | 'RETURN' | 'GENERAL';
  location?: string | null;
  is_active: boolean;
  last_active_at?: string | null;
  created_at?: string;
}

export interface CreateParcelInput {
  order_id?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_address?: string | null;
  shipping_zone?: string | null;
  courier_name?: string | null;
  notes?: string | null;
  created_by?: string | null;
  items: Array<{
    product_name: string;
    sku: string;
    variant?: string | null;
    size?: string | null;
    color?: string | null;
    quantity: number;
    unit_price?: number;
  }>;
}

export interface DispatchScanResult {
  success: boolean;
  code: 'DISPATCHED' | 'ALREADY_DISPATCHED' | 'NOT_FOUND' | 'INVALID_STATUS' | 'ERROR';
  parcel_id?: string;
  order_id?: string;
  customer_name?: string;
  total_quantity?: number;
  status?: string;
  dispatched_at?: string;
  dispatched_by?: string;
  items_deducted?: number;
  message: string;
}

export interface ReturnScanResult {
  success: boolean;
  code: 'RETURN_PROCESSED' | 'ALREADY_RETURNED' | 'NOT_FOUND' | 'INVALID_RETURN_STATE' | 'ERROR';
  parcel_id?: string;
  status?: string;
  condition?: ParcelReturnCondition;
  returned_quantity?: number;
  restocked_quantity?: number;
  damaged_quantity?: number;
  message: string;
}

export interface ParcelMetrics {
  totalParcels: number;
  dispatchedCount: number;
  inTransitCount: number;
  deliveredCount: number;
  returnedCount: number;
  underInspectionCount: number;
  restockedCount: number;
  damagedCount: number;
  todayDispatchedCount: number;
  todayReturnedCount: number;
  inventoryTotalStock: number;
}
