/**
 * Material Procurement & Accounts Management System Types
 * Strict domain entities, financial calculations, and report contracts.
 */

export type PurchaseStatus = 'draft' | 'posted' | 'cancelled';
export type PurchasePaymentStatus = 'unpaid' | 'partial' | 'paid';
export type PaymentStatus = 'posted' | 'reversed';
export type PaymentMethod = 'cash' | 'bank_transfer' | 'cheque' | 'bkash' | 'nagad' | 'other';
export type ReturnStatus = 'approved' | 'cancelled';

export type StockMovementType =
  | 'opening'
  | 'purchase_receipt'
  | 'production_issue'
  | 'supplier_return'
  | 'waste_adjustment'
  | 'reconciliation_adjustment';

export type StockMovementRefType = 'purchase' | 'return' | 'manual' | 'production';

export type LedgerRefType =
  | 'opening'
  | 'purchase'
  | 'payment'
  | 'return'
  | 'reversal'
  | 'advance_allocation';

// ── Master Entities ──────────────────────────────────────────────

export interface Material {
  id: string;
  name: string;
  sku: string;
  category: string;
  uom: string; // kg, meter, pcs, roll, yard, packet, etc.
  preferred_rate: number;
  reorder_threshold: number;
  current_stock: number;
  is_active: boolean;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface Supplier {
  id: string;
  name: string;
  code: string;
  contact_person?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  tax_id?: string | null;
  opening_payable: number;
  opening_advance: number;
  payment_terms?: string | null;
  notes?: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
  // Computed balance fields
  total_purchases?: number;
  total_paid?: number;
  outstanding_payable?: number;
  advance_balance?: number;
}

// ── Purchase Invoices & Items ────────────────────────────────────

export interface MaterialPurchaseItem {
  id: string;
  purchase_id: string;
  material_id: string;
  material_name?: string;
  material_sku?: string;
  uom?: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  received_quantity: number;
  remarks?: string | null;
  created_at?: string;
}

export interface MaterialPurchase {
  id: string;
  purchase_number: string;
  supplier_id: string;
  supplier_name?: string;
  purchase_date: string;
  due_date?: string | null;
  status: PurchaseStatus;
  payment_status: PurchasePaymentStatus;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  transportation_cost: number;
  loading_cost: number;
  other_expenses: number;
  grand_total: number;
  total_paid: number;
  balance_due: number;
  notes?: string | null;
  created_by?: string | null;
  posted_by?: string | null;
  posted_at?: string | null;
  cancelled_by?: string | null;
  cancellation_reason?: string | null;
  items?: MaterialPurchaseItem[];
  created_at?: string;
  updated_at?: string;
}

// ── Payments & Allocations ───────────────────────────────────────

export interface SupplierPaymentAllocation {
  id: string;
  payment_id: string;
  purchase_id: string;
  purchase_number?: string;
  allocated_amount: number;
  created_at?: string;
}

export interface SupplierPayment {
  id: string;
  payment_number: string;
  supplier_id: string;
  supplier_name?: string;
  payment_date: string;
  amount: number;
  allocated_amount: number;
  advance_amount: number;
  payment_method: PaymentMethod;
  reference_note?: string | null;
  status: PaymentStatus;
  reversed_by?: string | null;
  reversal_reason?: string | null;
  reversed_at?: string | null;
  created_by?: string | null;
  allocations?: SupplierPaymentAllocation[];
  created_at?: string;
  updated_at?: string;
}

// ── Returns & Adjustments ────────────────────────────────────────

export interface MaterialPurchaseReturnItem {
  id: string;
  return_id: string;
  material_id: string;
  material_name?: string;
  material_sku?: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

export interface MaterialPurchaseReturn {
  id: string;
  return_number: string;
  purchase_id?: string | null;
  purchase_number?: string | null;
  supplier_id: string;
  supplier_name?: string;
  return_date: string;
  total_amount: number;
  reason?: string | null;
  status: ReturnStatus;
  created_by?: string | null;
  items?: MaterialPurchaseReturnItem[];
  created_at?: string;
}

// ── Stock Movements & Ledger ─────────────────────────────────────

export interface MaterialStockMovement {
  id: string;
  material_id: string;
  material_name?: string;
  material_sku?: string;
  movement_type: StockMovementType;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  reference_type: StockMovementRefType;
  reference_id?: string | null;
  notes?: string | null;
  created_by?: string | null;
  created_at?: string;
}

export interface SupplierLedgerEntry {
  id: string;
  supplier_id: string;
  supplier_name?: string;
  entry_date: string;
  reference_type: LedgerRefType;
  reference_id?: string | null;
  description: string;
  debit: number;
  credit: number;
  running_balance: number;
  created_at?: string;
}

// ── Financial Overview & Aggregations ───────────────────────────

export interface MaterialAccountsStats {
  totalPurchaseValue: number;
  totalPaid: number;
  outstandingPayable: number;
  advanceBalance: number;
  totalExpenses: number;
  totalReturns: number;
  netPurchaseValue: number;
  totalSuppliers: number;
  activeMaterialsCount: number;
  lowStockMaterialsCount: number;
}

export interface ReconciliationWarning {
  id: string;
  type:
    | 'unallocated_payment'
    | 'duplicate_payment_ref'
    | 'overallocated_purchase'
    | 'incorrect_paid_status'
    | 'negative_balance'
    | 'duplicate_purchase_number'
    | 'unbalanced_ledger';
  severity: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  recordId?: string;
  recordType?: 'purchase' | 'payment' | 'supplier' | 'ledger';
}

export interface MaterialAccountsDateFilter {
  preset: 'today' | '7d' | '30d' | 'this_month' | 'last_month' | 'all' | 'custom';
  startDate?: string;
  endDate?: string;
}
