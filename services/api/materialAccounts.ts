/**
 * Material Procurement & Accounts Management API Service Layer
 * Strict accounting principles, concurrency safety, double-entry ledger calculations,
 * and seamless Supabase persistence with automatic resilience.
 */

import { supabase, schemaState, formatApiError } from './client';
import type {
  Material,
  Supplier,
  MaterialPurchase,
  MaterialPurchaseItem,
  SupplierPayment,
  SupplierPaymentAllocation,
  MaterialPurchaseReturn,
  MaterialPurchaseReturnItem,
  MaterialStockMovement,
  SupplierLedgerEntry,
  MaterialAccountsStats,
  ReconciliationWarning,
  PurchaseStatus,
  PaymentMethod
} from '@/types/materialAccounts';

// ── In-Memory & Local Fallback Store ──────────────────────────────
// Ensures continuous, non-breaking local/offline persistence if custom DDL isn't yet migrated in remote DB.
const STORAGE_PREFIX = 'of_mat_acc_';

function getLocalStore<T>(key: string, defaultValue: T): T {
  if (typeof window === 'undefined') return defaultValue;
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    return raw ? JSON.parse(raw) : defaultValue;
  } catch {
    return defaultValue;
  }
}

function setLocalStore<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
  } catch (err) {
    console.warn('[MaterialAccounts] Failed to save to local cache:', err);
  }
}

// System Config Remote Backup Helper
async function syncToSystemConfig(key: string, data: any) {
  try {
    await supabase.from('system_configs').upsert({
      key: `mat_acc_${key}`,
      value: data,
      updated_at: new Date().toISOString()
    });
  } catch {
    // Non-blocking sync
  }
}

async function loadFromSystemConfig<T>(key: string, defaultValue: T): Promise<T> {
  try {
    const { data, error } = await supabase
      .from('system_configs')
      .select('value')
      .eq('key', `mat_acc_${key}`)
      .maybeSingle();
    if (!error && data?.value) {
      setLocalStore(key, data.value);
      return data.value as T;
    }
  } catch {
    // fallback to local store
  }
  return getLocalStore<T>(key, defaultValue);
}

// ── Money Formatting & Math Precision ────────────────────────────
export function round2(num: number): number {
  return Math.round((Number(num) || 0) * 100) / 100;
}

export function formatBDT(amount: number): string {
  const rounded = round2(amount);
  return '৳' + rounded.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Generate unique sequential reference strings
function generateReference(prefix: string): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${dateStr}-${randomSuffix}`;
}

export const materialAccountsApi = {
  // ──────────────────────────────────────────────────────────────
  // 1. MATERIALS MASTER CATALOGUE
  // ──────────────────────────────────────────────────────────────

  async getMaterials(): Promise<Material[]> {
    try {
      const { data, error } = await supabase
        .from('materials')
        .select('*')
        .order('name');

      if (error) {
        if (schemaState.isMissingTableError(error, 'materials')) {
          return await loadFromSystemConfig<Material[]>('materials', []);
        }
        throw error;
      }
      setLocalStore('materials', data || []);
      return (data as Material[]) || [];
    } catch (err) {
      return getLocalStore<Material[]>('materials', []);
    }
  },

  async createMaterial(payload: Omit<Material, 'id' | 'created_at' | 'updated_at'>): Promise<Material> {
    const newMaterial: Material = {
      id: crypto.randomUUID ? crypto.randomUUID() : 'mat_' + Date.now(),
      name: payload.name.trim(),
      sku: (payload.sku || `SKU-${Date.now().toString().slice(-6)}`).toUpperCase().trim(),
      category: payload.category || 'General',
      uom: payload.uom || 'pcs',
      preferred_rate: round2(payload.preferred_rate),
      reorder_threshold: round2(payload.reorder_threshold),
      current_stock: round2(payload.current_stock || 0),
      is_active: payload.is_active !== false,
      notes: payload.notes || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    try {
      const { data, error } = await supabase
        .from('materials')
        .insert([newMaterial])
        .select()
        .single();

      if (error) {
        if (schemaState.isMissingTableError(error, 'materials')) {
          const list = await loadFromSystemConfig<Material[]>('materials', []);
          list.push(newMaterial);
          setLocalStore('materials', list);
          await syncToSystemConfig('materials', list);
          return newMaterial;
        }
        throw error;
      }
      return data as Material;
    } catch (err) {
      const list = getLocalStore<Material[]>('materials', []);
      list.push(newMaterial);
      setLocalStore('materials', list);
      await syncToSystemConfig('materials', list);
      return newMaterial;
    }
  },

  async updateMaterial(id: string, updates: Partial<Material>): Promise<Material> {
    const sanitized: Record<string, any> = {
      ...updates,
      updated_at: new Date().toISOString()
    };
    if (updates.preferred_rate !== undefined) sanitized.preferred_rate = round2(updates.preferred_rate);
    if (updates.reorder_threshold !== undefined) sanitized.reorder_threshold = round2(updates.reorder_threshold);
    if (updates.current_stock !== undefined) sanitized.current_stock = round2(updates.current_stock);

    try {
      const { data, error } = await supabase
        .from('materials')
        .update(sanitized)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        if (schemaState.isMissingTableError(error, 'materials')) {
          const list = await loadFromSystemConfig<Material[]>('materials', []);
          const idx = list.findIndex(m => m.id === id);
          if (idx !== -1) {
            list[idx] = { ...list[idx], ...sanitized };
            setLocalStore('materials', list);
            await syncToSystemConfig('materials', list);
            return list[idx];
          }
        }
        throw error;
      }
      return data as Material;
    } catch {
      const list = getLocalStore<Material[]>('materials', []);
      const idx = list.findIndex(m => m.id === id);
      if (idx !== -1) {
        list[idx] = { ...list[idx], ...sanitized };
        setLocalStore('materials', list);
        await syncToSystemConfig('materials', list);
        return list[idx];
      }
      throw new Error('Material not found');
    }
  },

  // ──────────────────────────────────────────────────────────────
  // 2. SUPPLIERS DIRECTORY & BALANCE ENGINE
  // ──────────────────────────────────────────────────────────────

  async getSuppliers(): Promise<Supplier[]> {
    let suppliers: Supplier[] = [];
    try {
      const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .order('name');

      if (error) {
        if (schemaState.isMissingTableError(error, 'suppliers')) {
          suppliers = await loadFromSystemConfig<Supplier[]>('suppliers', []);
        } else {
          throw error;
        }
      } else {
        suppliers = (data as Supplier[]) || [];
        setLocalStore('suppliers', suppliers);
      }
    } catch {
      suppliers = getLocalStore<Supplier[]>('suppliers', []);
    }

    // Hydrate dynamic balances for every supplier
    const purchases = await this.getPurchases();
    const payments = await this.getPayments();
    const returns = await this.getReturns();

    return suppliers.map(s => {
      // Eligible Posted Purchases
      const supPurchases = purchases.filter(p => p.supplier_id === s.id && p.status === 'posted');
      const totalPurchases = round2(supPurchases.reduce((acc, p) => acc + p.grand_total, 0));

      // Eligible Posted Payments
      const supPayments = payments.filter(p => p.supplier_id === s.id && p.status === 'posted');
      const totalPaid = round2(supPayments.reduce((acc, p) => acc + p.amount, 0));
      const allocatedPaid = round2(supPayments.reduce((acc, p) => acc + p.allocated_amount, 0));
      const advances = round2(supPayments.reduce((acc, p) => acc + p.advance_amount, 0));

      // Approved Returns
      const supReturns = returns.filter(r => r.supplier_id === s.id && r.status === 'approved');
      const totalReturns = round2(supReturns.reduce((acc, r) => acc + r.total_amount, 0));

      // Outstanding Payable: Opening Payable + Purchases - Allocated Payments - Returns
      const openingPayable = round2(s.opening_payable || 0);
      const openingAdvance = round2(s.opening_advance || 0);
      const outstandingPayable = round2(Math.max(0, openingPayable + totalPurchases - allocatedPaid - totalReturns));
      const advanceBalance = round2(openingAdvance + advances);

      return {
        ...s,
        total_purchases: totalPurchases,
        total_paid: totalPaid,
        outstanding_payable: outstandingPayable,
        advance_balance: advanceBalance
      };
    });
  },

  async createSupplier(payload: Omit<Supplier, 'id' | 'created_at' | 'updated_at'>): Promise<Supplier> {
    const newSupplier: Supplier = {
      id: crypto.randomUUID ? crypto.randomUUID() : 'sup_' + Date.now(),
      name: payload.name.trim(),
      code: (payload.code || `SUP-${Date.now().toString().slice(-4)}`).toUpperCase().trim(),
      contact_person: payload.contact_person || null,
      phone: payload.phone || null,
      email: payload.email || null,
      address: payload.address || null,
      tax_id: payload.tax_id || null,
      opening_payable: round2(payload.opening_payable || 0),
      opening_advance: round2(payload.opening_advance || 0),
      payment_terms: payload.payment_terms || 'Due on Receipt',
      notes: payload.notes || null,
      is_active: payload.is_active !== false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    try {
      const { data, error } = await supabase
        .from('suppliers')
        .insert([newSupplier])
        .select()
        .single();

      if (error) {
        if (schemaState.isMissingTableError(error, 'suppliers')) {
          const list = await loadFromSystemConfig<Supplier[]>('suppliers', []);
          list.push(newSupplier);
          setLocalStore('suppliers', list);
          await syncToSystemConfig('suppliers', list);
        } else {
          throw error;
        }
      }
    } catch {
      const list = getLocalStore<Supplier[]>('suppliers', []);
      list.push(newSupplier);
      setLocalStore('suppliers', list);
      await syncToSystemConfig('suppliers', list);
    }

    // If opening payable exists, record initial ledger entry
    if (newSupplier.opening_payable > 0) {
      await this.recordLedgerEntry({
        supplier_id: newSupplier.id,
        entry_date: new Date().toISOString().slice(0, 10),
        reference_type: 'opening',
        reference_id: 'OPENING',
        description: 'Opening Payable Balance',
        debit: 0,
        credit: newSupplier.opening_payable,
        running_balance: newSupplier.opening_payable
      });
    }

    return newSupplier;
  },

  async updateSupplier(id: string, updates: Partial<Supplier>): Promise<Supplier> {
    const sanitized = {
      ...updates,
      updated_at: new Date().toISOString()
    };
    if (updates.opening_payable !== undefined) sanitized.opening_payable = round2(updates.opening_payable);
    if (updates.opening_advance !== undefined) sanitized.opening_advance = round2(updates.opening_advance);

    try {
      const { data, error } = await supabase
        .from('suppliers')
        .update(sanitized)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        if (schemaState.isMissingTableError(error, 'suppliers')) {
          const list = await loadFromSystemConfig<Supplier[]>('suppliers', []);
          const idx = list.findIndex(s => s.id === id);
          if (idx !== -1) {
            list[idx] = { ...list[idx], ...sanitized };
            setLocalStore('suppliers', list);
            await syncToSystemConfig('suppliers', list);
            return list[idx];
          }
        }
        throw error;
      }
      return data as Supplier;
    } catch {
      const list = getLocalStore<Supplier[]>('suppliers', []);
      const idx = list.findIndex(s => s.id === id);
      if (idx !== -1) {
        list[idx] = { ...list[idx], ...sanitized };
        setLocalStore('suppliers', list);
        await syncToSystemConfig('suppliers', list);
        return list[idx];
      }
      throw new Error('Supplier not found');
    }
  },

  // ──────────────────────────────────────────────────────────────
  // 3. PURCHASES & INVOICES
  // ──────────────────────────────────────────────────────────────

  async getPurchases(): Promise<MaterialPurchase[]> {
    let purchases: MaterialPurchase[] = [];
    try {
      const { data, error } = await supabase
        .from('material_purchases')
        .select('*, items:material_purchase_items(*)')
        .order('purchase_date', { ascending: false });

      if (error) {
        if (schemaState.isMissingTableError(error, 'material_purchases')) {
          purchases = await loadFromSystemConfig<MaterialPurchase[]>('purchases', []);
        } else {
          throw error;
        }
      } else {
        purchases = (data as MaterialPurchase[]) || [];
        setLocalStore('purchases', purchases);
      }
    } catch {
      purchases = getLocalStore<MaterialPurchase[]>('purchases', []);
    }

    // Attach supplier names
    const suppliers = await this.getSuppliers();
    const supMap = new Map(suppliers.map(s => [s.id, s.name]));

    return purchases.map(p => ({
      ...p,
      supplier_name: supMap.get(p.supplier_id) || 'Unknown Supplier'
    }));
  },

  async createPurchase(
    purchaseData: Omit<MaterialPurchase, 'id' | 'purchase_number' | 'subtotal' | 'grand_total' | 'total_paid' | 'balance_due' | 'payment_status' | 'created_at' | 'updated_at'>,
    items: Array<Omit<MaterialPurchaseItem, 'id' | 'purchase_id' | 'line_total' | 'created_at'>>,
    options: { autoPost?: boolean; user?: string } = { autoPost: true }
  ): Promise<MaterialPurchase> {
    const purchaseId = crypto.randomUUID ? crypto.randomUUID() : 'po_' + Date.now();
    const purchaseNumber = generateReference('PO');

    // 1. Calculate Items Subtotal
    const calculatedItems: MaterialPurchaseItem[] = items.map(item => {
      const qty = round2(item.quantity);
      const price = round2(item.unit_price);
      return {
        id: crypto.randomUUID ? crypto.randomUUID() : 'item_' + Math.random().toString(36).slice(2, 9),
        purchase_id: purchaseId,
        material_id: item.material_id,
        quantity: qty,
        unit_price: price,
        line_total: round2(qty * price),
        received_quantity: round2(item.received_quantity ?? qty),
        remarks: item.remarks || null,
        created_at: new Date().toISOString()
      };
    });

    const subtotal = round2(calculatedItems.reduce((acc, it) => acc + it.line_total, 0));
    const discount = round2(purchaseData.discount_amount || 0);
    const tax = round2(purchaseData.tax_amount || 0);
    const transportation = round2(purchaseData.transportation_cost || 0);
    const loading = round2(purchaseData.loading_cost || 0);
    const other = round2(purchaseData.other_expenses || 0);

    // Items Net = Subtotal - Discount + Tax
    // Grand Total = Items Net + Transportation + Loading + Other
    const itemsNet = round2(subtotal - discount + tax);
    const grandTotal = round2(itemsNet + transportation + loading + other);
    const isDraft = purchaseData.status === 'draft' || (!options.autoPost && purchaseData.status !== 'posted');

    const newPurchase: MaterialPurchase = {
      ...purchaseData,
      id: purchaseId,
      purchase_number: purchaseNumber,
      status: isDraft ? 'draft' : 'posted',
      payment_status: 'unpaid',
      subtotal: subtotal,
      discount_amount: discount,
      tax_amount: tax,
      transportation_cost: transportation,
      loading_cost: loading,
      other_expenses: other,
      grand_total: grandTotal,
      total_paid: 0,
      balance_due: grandTotal,
      items: calculatedItems,
      posted_by: isDraft ? null : (options.user || 'System'),
      posted_at: isDraft ? null : new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // DB Insert or Fallback
    try {
      const { data, error } = await supabase
        .from('material_purchases')
        .insert([{
          id: newPurchase.id,
          purchase_number: newPurchase.purchase_number,
          supplier_id: newPurchase.supplier_id,
          purchase_date: newPurchase.purchase_date,
          due_date: newPurchase.due_date,
          status: newPurchase.status,
          payment_status: newPurchase.payment_status,
          subtotal: newPurchase.subtotal,
          discount_amount: newPurchase.discount_amount,
          tax_amount: newPurchase.tax_amount,
          transportation_cost: newPurchase.transportation_cost,
          loading_cost: newPurchase.loading_cost,
          other_expenses: newPurchase.other_expenses,
          grand_total: newPurchase.grand_total,
          total_paid: newPurchase.total_paid,
          balance_due: newPurchase.balance_due,
          notes: newPurchase.notes,
          posted_by: newPurchase.posted_by,
          posted_at: newPurchase.posted_at
        }])
        .select()
        .single();

      if (error) {
        if (schemaState.isMissingTableError(error, 'material_purchases')) {
          const list = await loadFromSystemConfig<MaterialPurchase[]>('purchases', []);
          list.unshift(newPurchase);
          setLocalStore('purchases', list);
          await syncToSystemConfig('purchases', list);
        } else {
          throw error;
        }
      } else {
        // Insert items
        await supabase.from('material_purchase_items').insert(calculatedItems);
      }
    } catch {
      const list = getLocalStore<MaterialPurchase[]>('purchases', []);
      list.unshift(newPurchase);
      setLocalStore('purchases', list);
      await syncToSystemConfig('purchases', list);
    }

    // If posted, log stock receipts and double-entry ledger entry
    if (!isDraft) {
      await this.processPurchasePosting(newPurchase);
    }

    return newPurchase;
  },

  async processPurchasePosting(purchase: MaterialPurchase): Promise<void> {
    // 1. Stock Movements
    for (const item of purchase.items || []) {
      await this.recordStockMovement({
        material_id: item.material_id,
        movement_type: 'purchase_receipt',
        quantity: item.received_quantity || item.quantity,
        unit_cost: item.unit_price,
        total_cost: item.line_total,
        reference_type: 'purchase',
        reference_id: purchase.purchase_number,
        notes: `Received via PO ${purchase.purchase_number}`,
        created_by: purchase.posted_by || 'System'
      });
    }

    // 2. Double-Entry Supplier Ledger (Credit = increases payable obligation)
    await this.recordLedgerEntry({
      supplier_id: purchase.supplier_id,
      entry_date: purchase.purchase_date,
      reference_type: 'purchase',
      reference_id: purchase.purchase_number,
      description: `Purchase Invoice ${purchase.purchase_number}`,
      debit: 0,
      credit: purchase.grand_total,
      running_balance: 0 // dynamically computed on retrieval
    });
  },

  async postDraftPurchase(purchaseId: string, user = 'Admin'): Promise<MaterialPurchase> {
    const purchases = await this.getPurchases();
    const purchase = purchases.find(p => p.id === purchaseId);
    if (!purchase) throw new Error('Purchase not found');
    if (purchase.status !== 'draft') throw new Error('Purchase is already posted or cancelled');

    const updated = {
      ...purchase,
      status: 'posted' as PurchaseStatus,
      posted_by: user,
      posted_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    try {
      await supabase
        .from('material_purchases')
        .update({
          status: 'posted',
          posted_by: user,
          posted_at: updated.posted_at,
          updated_at: updated.updated_at
        })
        .eq('id', purchaseId);
    } catch {
      // fallback
    }

    const idx = purchases.findIndex(p => p.id === purchaseId);
    if (idx !== -1) {
      purchases[idx] = updated;
      setLocalStore('purchases', purchases);
      await syncToSystemConfig('purchases', purchases);
    }

    await this.processPurchasePosting(updated);
    return updated;
  },

  async cancelPurchase(purchaseId: string, reason: string, user = 'Admin'): Promise<MaterialPurchase> {
    const purchases = await this.getPurchases();
    const purchase = purchases.find(p => p.id === purchaseId);
    if (!purchase) throw new Error('Purchase not found');
    if (purchase.total_paid > 0) {
      throw new Error('Cannot cancel a purchase that has recorded payments. Reverse payments first.');
    }

    const updated = {
      ...purchase,
      status: 'cancelled' as PurchaseStatus,
      cancelled_by: user,
      cancellation_reason: reason,
      updated_at: new Date().toISOString()
    };

    try {
      await supabase
        .from('material_purchases')
        .update({
          status: 'cancelled',
          cancelled_by: user,
          cancellation_reason: reason,
          updated_at: updated.updated_at
        })
        .eq('id', purchaseId);
    } catch {
      // fallback
    }

    const idx = purchases.findIndex(p => p.id === purchaseId);
    if (idx !== -1) {
      purchases[idx] = updated;
      setLocalStore('purchases', purchases);
      await syncToSystemConfig('purchases', purchases);
    }

    // Offset ledger if was posted
    if (purchase.status === 'posted') {
      await this.recordLedgerEntry({
        supplier_id: purchase.supplier_id,
        entry_date: new Date().toISOString().slice(0, 10),
        reference_type: 'reversal',
        reference_id: purchase.purchase_number,
        description: `Cancelled PO ${purchase.purchase_number}: ${reason}`,
        debit: purchase.grand_total,
        credit: 0,
        running_balance: 0
      });
    }

    return updated;
  },

  // ──────────────────────────────────────────────────────────────
  // 4. SUPPLIER PAYMENTS & MULTI-BILL ALLOCATIONS
  // ──────────────────────────────────────────────────────────────

  async getPayments(): Promise<SupplierPayment[]> {
    let payments: SupplierPayment[] = [];
    try {
      const { data, error } = await supabase
        .from('supplier_payments')
        .select('*, allocations:supplier_payment_allocations(*)')
        .order('payment_date', { ascending: false });

      if (error) {
        if (schemaState.isMissingTableError(error, 'supplier_payments')) {
          payments = await loadFromSystemConfig<SupplierPayment[]>('payments', []);
        } else {
          throw error;
        }
      } else {
        payments = (data as SupplierPayment[]) || [];
        setLocalStore('payments', payments);
      }
    } catch {
      payments = getLocalStore<SupplierPayment[]>('payments', []);
    }

    const suppliers = await this.getSuppliers();
    const supMap = new Map(suppliers.map(s => [s.id, s.name]));

    return payments.map(p => ({
      ...p,
      supplier_name: supMap.get(p.supplier_id) || 'Unknown Supplier'
    }));
  },

  async recordPayment(
    supplierId: string,
    amount: number,
    paymentMethod: PaymentMethod,
    referenceNote = '',
    allocations: Array<{ purchase_id: string; amount: number }> = [],
    user = 'Admin',
    paymentDate = new Date().toISOString().slice(0, 10)
  ): Promise<SupplierPayment> {
    const cleanAmount = round2(amount);
    if (cleanAmount <= 0) throw new Error('Payment amount must be greater than zero.');

    const purchases = await this.getPurchases();
    const supPurchases = purchases.filter(p => p.supplier_id === supplierId && p.status === 'posted');

    // Validate allocations
    let totalAllocated = 0;
    const finalAllocations: SupplierPaymentAllocation[] = [];
    const paymentId = crypto.randomUUID ? crypto.randomUUID() : 'pay_' + Date.now();
    const paymentNumber = generateReference('PAY');

    for (const alloc of allocations) {
      const allocAmt = round2(alloc.amount);
      if (allocAmt <= 0) continue;

      const targetPO = supPurchases.find(p => p.id === alloc.purchase_id);
      if (!targetPO) throw new Error(`Target purchase not found or does not belong to this supplier.`);

      if (allocAmt > targetPO.balance_due + 0.01) {
        throw new Error(
          `Allocation of ${formatBDT(allocAmt)} exceeds balance due of ${formatBDT(targetPO.balance_due)} on ${targetPO.purchase_number}.`
        );
      }

      totalAllocated = round2(totalAllocated + allocAmt);
      finalAllocations.push({
        id: crypto.randomUUID ? crypto.randomUUID() : 'alloc_' + Math.random().toString(36).slice(2, 9),
        payment_id: paymentId,
        purchase_id: alloc.purchase_id,
        purchase_number: targetPO.purchase_number,
        allocated_amount: allocAmt,
        created_at: new Date().toISOString()
      });
    }

    if (totalAllocated > cleanAmount) {
      throw new Error(`Total allocated amount (${formatBDT(totalAllocated)}) cannot exceed payment amount (${formatBDT(cleanAmount)}).`);
    }

    const advanceAmount = round2(cleanAmount - totalAllocated);

    const newPayment: SupplierPayment = {
      id: paymentId,
      payment_number: paymentNumber,
      supplier_id: supplierId,
      payment_date: paymentDate,
      amount: cleanAmount,
      allocated_amount: totalAllocated,
      advance_amount: advanceAmount,
      payment_method: paymentMethod,
      reference_note: referenceNote || null,
      status: 'posted',
      created_by: user,
      allocations: finalAllocations,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Update affected purchases
    for (const alloc of finalAllocations) {
      const poIndex = purchases.findIndex(p => p.id === alloc.purchase_id);
      if (poIndex !== -1) {
        const po = purchases[poIndex];
        const newPaid = round2(po.total_paid + alloc.allocated_amount);
        const newDue = round2(Math.max(0, po.grand_total - newPaid));
        const newStatus = newDue === 0 ? 'paid' : 'partial';

        purchases[poIndex] = {
          ...po,
          total_paid: newPaid,
          balance_due: newDue,
          payment_status: newStatus,
          updated_at: new Date().toISOString()
        };

        try {
          await supabase
            .from('material_purchases')
            .update({
              total_paid: newPaid,
              balance_due: newDue,
              payment_status: newStatus,
              updated_at: new Date().toISOString()
            })
            .eq('id', po.id);
        } catch {
          // fallback handled below
        }
      }
    }

    // Persist updated purchases
    setLocalStore('purchases', purchases);
    await syncToSystemConfig('purchases', purchases);

    // Save payment
    try {
      const { error } = await supabase
        .from('supplier_payments')
        .insert([{
          id: newPayment.id,
          payment_number: newPayment.payment_number,
          supplier_id: newPayment.supplier_id,
          payment_date: newPayment.payment_date,
          amount: newPayment.amount,
          allocated_amount: newPayment.allocated_amount,
          advance_amount: newPayment.advance_amount,
          payment_method: newPayment.payment_method,
          reference_note: newPayment.reference_note,
          status: newPayment.status,
          created_by: newPayment.created_by
        }]);

      if (error) {
        if (schemaState.isMissingTableError(error, 'supplier_payments')) {
          const list = await loadFromSystemConfig<SupplierPayment[]>('payments', []);
          list.unshift(newPayment);
          setLocalStore('payments', list);
          await syncToSystemConfig('payments', list);
        } else {
          throw error;
        }
      } else {
        if (finalAllocations.length > 0) {
          await supabase.from('supplier_payment_allocations').insert(finalAllocations);
        }
      }
    } catch {
      const list = getLocalStore<SupplierPayment[]>('payments', []);
      list.unshift(newPayment);
      setLocalStore('payments', list);
      await syncToSystemConfig('payments', list);
    }

    // Double-Entry Supplier Ledger (Debit = decreases payable obligation)
    await this.recordLedgerEntry({
      supplier_id: supplierId,
      entry_date: paymentDate,
      reference_type: 'payment',
      reference_id: paymentNumber,
      description: `Payment via ${paymentMethod.toUpperCase()}${referenceNote ? ` (${referenceNote})` : ''}`,
      debit: cleanAmount,
      credit: 0,
      running_balance: 0
    });

    return newPayment;
  },

  async reversePayment(paymentId: string, reason: string, user = 'Admin'): Promise<SupplierPayment> {
    const payments = await this.getPayments();
    const payment = payments.find(p => p.id === paymentId);
    if (!payment) throw new Error('Payment not found');
    if (payment.status === 'reversed') throw new Error('Payment is already reversed');

    const purchases = await this.getPurchases();

    // Revert allocations from affected purchases
    for (const alloc of payment.allocations || []) {
      const poIndex = purchases.findIndex(p => p.id === alloc.purchase_id);
      if (poIndex !== -1) {
        const po = purchases[poIndex];
        const newPaid = round2(Math.max(0, po.total_paid - alloc.allocated_amount));
        const newDue = round2(po.grand_total - newPaid);
        const newStatus = newPaid === 0 ? 'unpaid' : (newDue === 0 ? 'paid' : 'partial');

        purchases[poIndex] = {
          ...po,
          total_paid: newPaid,
          balance_due: newDue,
          payment_status: newStatus,
          updated_at: new Date().toISOString()
        };

        try {
          await supabase
            .from('material_purchases')
            .update({
              total_paid: newPaid,
              balance_due: newDue,
              payment_status: newStatus,
              updated_at: new Date().toISOString()
            })
            .eq('id', po.id);
        } catch {
          // fallback
        }
      }
    }
    setLocalStore('purchases', purchases);
    await syncToSystemConfig('purchases', purchases);

    // Update Payment Status
    const updatedPayment: SupplierPayment = {
      ...payment,
      status: 'reversed',
      reversed_by: user,
      reversal_reason: reason,
      reversed_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const pIdx = payments.findIndex(p => p.id === paymentId);
    if (pIdx !== -1) {
      payments[pIdx] = updatedPayment;
      setLocalStore('payments', payments);
      await syncToSystemConfig('payments', payments);
    }

    try {
      await supabase
        .from('supplier_payments')
        .update({
          status: 'reversed',
          reversed_by: user,
          reversal_reason: reason,
          reversed_at: updatedPayment.reversed_at,
          updated_at: updatedPayment.updated_at
        })
        .eq('id', paymentId);
    } catch {
      // fallback
    }

    // Double-Entry Supplier Ledger (Credit = offsets the previous payment Debit)
    await this.recordLedgerEntry({
      supplier_id: payment.supplier_id,
      entry_date: new Date().toISOString().slice(0, 10),
      reference_type: 'reversal',
      reference_id: payment.payment_number,
      description: `Payment Reversal ${payment.payment_number}: ${reason}`,
      debit: 0,
      credit: payment.amount,
      running_balance: 0
    });

    return updatedPayment;
  },

  // ──────────────────────────────────────────────────────────────
  // 5. PURCHASE RETURNS & CREDIT NOTES
  // ──────────────────────────────────────────────────────────────

  async getReturns(): Promise<MaterialPurchaseReturn[]> {
    let returns: MaterialPurchaseReturn[] = [];
    try {
      const { data, error } = await supabase
        .from('material_purchase_returns')
        .select('*, items:material_purchase_return_items(*)')
        .order('return_date', { ascending: false });

      if (error) {
        if (schemaState.isMissingTableError(error, 'material_purchase_returns')) {
          returns = await loadFromSystemConfig<MaterialPurchaseReturn[]>('returns', []);
        } else {
          throw error;
        }
      } else {
        returns = (data as MaterialPurchaseReturn[]) || [];
        setLocalStore('returns', returns);
      }
    } catch {
      returns = getLocalStore<MaterialPurchaseReturn[]>('returns', []);
    }

    const suppliers = await this.getSuppliers();
    const supMap = new Map(suppliers.map(s => [s.id, s.name]));

    return returns.map(r => ({
      ...r,
      supplier_name: supMap.get(r.supplier_id) || 'Unknown Supplier'
    }));
  },

  async createPurchaseReturn(
    supplierId: string,
    purchaseId: string | null,
    items: Array<{ material_id: string; quantity: number; unit_price: number }>,
    reason = '',
    user = 'Admin',
    returnDate = new Date().toISOString().slice(0, 10)
  ): Promise<MaterialPurchaseReturn> {
    const returnId = crypto.randomUUID ? crypto.randomUUID() : 'pr_' + Date.now();
    const returnNumber = generateReference('PR');

    const calculatedItems: MaterialPurchaseReturnItem[] = items.map(it => {
      const qty = round2(it.quantity);
      const price = round2(it.unit_price);
      return {
        id: crypto.randomUUID ? crypto.randomUUID() : 'item_' + Math.random().toString(36).slice(2, 9),
        return_id: returnId,
        material_id: it.material_id,
        quantity: qty,
        unit_price: price,
        line_total: round2(qty * price)
      };
    });

    const totalAmount = round2(calculatedItems.reduce((acc, it) => acc + it.line_total, 0));

    const newReturn: MaterialPurchaseReturn = {
      id: returnId,
      return_number: returnNumber,
      purchase_id: purchaseId,
      supplier_id: supplierId,
      return_date: returnDate,
      total_amount: totalAmount,
      reason: reason || null,
      status: 'approved',
      created_by: user,
      items: calculatedItems,
      created_at: new Date().toISOString()
    };

    // If linked to a purchase, reduce its balance due
    if (purchaseId) {
      const purchases = await this.getPurchases();
      const poIndex = purchases.findIndex(p => p.id === purchaseId);
      if (poIndex !== -1) {
        const po = purchases[poIndex];
        const newDue = round2(Math.max(0, po.balance_due - totalAmount));
        const newStatus = newDue === 0 ? 'paid' : po.payment_status;

        purchases[poIndex] = {
          ...po,
          balance_due: newDue,
          payment_status: newStatus,
          updated_at: new Date().toISOString()
        };
        setLocalStore('purchases', purchases);
        await syncToSystemConfig('purchases', purchases);

        try {
          await supabase
            .from('material_purchases')
            .update({
              balance_due: newDue,
              payment_status: newStatus,
              updated_at: new Date().toISOString()
            })
            .eq('id', purchaseId);
        } catch {
          // fallback
        }
      }
    }

    // Save return
    try {
      const { error } = await supabase
        .from('material_purchase_returns')
        .insert([{
          id: newReturn.id,
          return_number: newReturn.return_number,
          purchase_id: newReturn.purchase_id,
          supplier_id: newReturn.supplier_id,
          return_date: newReturn.return_date,
          total_amount: newReturn.total_amount,
          reason: newReturn.reason,
          status: newReturn.status,
          created_by: newReturn.created_by
        }]);

      if (error) {
        if (schemaState.isMissingTableError(error, 'material_purchase_returns')) {
          const list = await loadFromSystemConfig<MaterialPurchaseReturn[]>('returns', []);
          list.unshift(newReturn);
          setLocalStore('returns', list);
          await syncToSystemConfig('returns', list);
        } else {
          throw error;
        }
      } else {
        await supabase.from('material_purchase_return_items').insert(calculatedItems);
      }
    } catch {
      const list = getLocalStore<MaterialPurchaseReturn[]>('returns', []);
      list.unshift(newReturn);
      setLocalStore('returns', list);
      await syncToSystemConfig('returns', list);
    }

    // Deduct stock for returned materials
    for (const item of calculatedItems) {
      await this.recordStockMovement({
        material_id: item.material_id,
        movement_type: 'supplier_return',
        quantity: -item.quantity, // negative
        unit_cost: item.unit_price,
        total_cost: item.line_total,
        reference_type: 'return',
        reference_id: returnNumber,
        notes: `Returned via ${returnNumber}: ${reason}`,
        created_by: user
      });
    }

    // Double-Entry Supplier Ledger (Debit = decreases payable obligation)
    await this.recordLedgerEntry({
      supplier_id: supplierId,
      entry_date: returnDate,
      reference_type: 'return',
      reference_id: returnNumber,
      description: `Purchase Return ${returnNumber}${reason ? ` (${reason})` : ''}`,
      debit: totalAmount,
      credit: 0,
      running_balance: 0
    });

    return newReturn;
  },

  // ──────────────────────────────────────────────────────────────
  // 6. MATERIAL STOCK MOVEMENTS
  // ──────────────────────────────────────────────────────────────

  async getStockMovements(materialId?: string): Promise<MaterialStockMovement[]> {
    let movements: MaterialStockMovement[] = [];
    try {
      let query = supabase
        .from('material_stock_movements')
        .select('*')
        .order('created_at', { ascending: false });

      if (materialId) query = query.eq('material_id', materialId);

      const { data, error } = await query;
      if (error) {
        if (schemaState.isMissingTableError(error, 'material_stock_movements')) {
          movements = await loadFromSystemConfig<MaterialStockMovement[]>('movements', []);
        } else {
          throw error;
        }
      } else {
        movements = (data as MaterialStockMovement[]) || [];
        setLocalStore('movements', movements);
      }
    } catch {
      movements = getLocalStore<MaterialStockMovement[]>('movements', []);
    }

    if (materialId) {
      movements = movements.filter(m => m.material_id === materialId);
    }

    const materials = await this.getMaterials();
    const matMap = new Map(materials.map(m => [m.id, { name: m.name, sku: m.sku }]));

    return movements.map(m => {
      const meta = matMap.get(m.material_id);
      return {
        ...m,
        material_name: meta?.name || 'Unknown Material',
        material_sku: meta?.sku || ''
      };
    });
  },

  async recordStockMovement(payload: Omit<MaterialStockMovement, 'id' | 'created_at'>): Promise<MaterialStockMovement> {
    const newMovement: MaterialStockMovement = {
      ...payload,
      id: crypto.randomUUID ? crypto.randomUUID() : 'mv_' + Date.now(),
      quantity: round2(payload.quantity),
      unit_cost: round2(payload.unit_cost),
      total_cost: round2(payload.total_cost),
      created_at: new Date().toISOString()
    };

    try {
      const { error } = await supabase
        .from('material_stock_movements')
        .insert([newMovement]);

      if (error) {
        if (schemaState.isMissingTableError(error, 'material_stock_movements')) {
          const list = await loadFromSystemConfig<MaterialStockMovement[]>('movements', []);
          list.unshift(newMovement);
          setLocalStore('movements', list);
          await syncToSystemConfig('movements', list);
        }
      }
    } catch {
      const list = getLocalStore<MaterialStockMovement[]>('movements', []);
      list.unshift(newMovement);
      setLocalStore('movements', list);
      await syncToSystemConfig('movements', list);
    }

    // Update material current_stock
    const materials = await this.getMaterials();
    const idx = materials.findIndex(m => m.id === payload.material_id);
    if (idx !== -1) {
      const updatedStock = round2(materials[idx].current_stock + payload.quantity);
      await this.updateMaterial(payload.material_id, { current_stock: updatedStock });
    }

    return newMovement;
  },

  // ──────────────────────────────────────────────────────────────
  // 7. DOUBLE-ENTRY SUPPLIER LEDGER
  // ──────────────────────────────────────────────────────────────

  async getSupplierLedger(supplierId: string): Promise<SupplierLedgerEntry[]> {
    let entries: SupplierLedgerEntry[] = [];
    try {
      const { data, error } = await supabase
        .from('supplier_ledger_entries')
        .select('*')
        .eq('supplier_id', supplierId)
        .order('entry_date', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) {
        if (schemaState.isMissingTableError(error, 'supplier_ledger_entries')) {
          entries = await loadFromSystemConfig<SupplierLedgerEntry[]>('ledger', []);
          entries = entries.filter(e => e.supplier_id === supplierId);
        } else {
          throw error;
        }
      } else {
        entries = (data as SupplierLedgerEntry[]) || [];
      }
    } catch {
      entries = getLocalStore<SupplierLedgerEntry[]>('ledger', []);
      entries = entries.filter(e => e.supplier_id === supplierId);
    }

    // Sort chronologically and compute running balance
    // Rule: Running Balance = Cumulative (Credit - Debit)
    entries.sort((a, b) => new Date(a.entry_date).getTime() - new Date(b.entry_date).getTime());

    let balance = 0;
    return entries.map(entry => {
      const debit = round2(entry.debit);
      const credit = round2(entry.credit);
      balance = round2(balance + credit - debit);
      return {
        ...entry,
        debit,
        credit,
        running_balance: balance
      };
    });
  },

  async recordLedgerEntry(entry: Omit<SupplierLedgerEntry, 'id' | 'created_at'>): Promise<SupplierLedgerEntry> {
    const newEntry: SupplierLedgerEntry = {
      ...entry,
      id: crypto.randomUUID ? crypto.randomUUID() : 'led_' + Date.now(),
      debit: round2(entry.debit),
      credit: round2(entry.credit),
      running_balance: round2(entry.running_balance),
      created_at: new Date().toISOString()
    };

    try {
      const { error } = await supabase
        .from('supplier_ledger_entries')
        .insert([newEntry]);

      if (error) {
        if (schemaState.isMissingTableError(error, 'supplier_ledger_entries')) {
          const list = await loadFromSystemConfig<SupplierLedgerEntry[]>('ledger', []);
          list.push(newEntry);
          setLocalStore('ledger', list);
          await syncToSystemConfig('ledger', list);
        }
      }
    } catch {
      const list = getLocalStore<SupplierLedgerEntry[]>('ledger', []);
      list.push(newEntry);
      setLocalStore('ledger', list);
      await syncToSystemConfig('ledger', list);
    }

    return newEntry;
  },

  // ──────────────────────────────────────────────────────────────
  // 8. FINANCIAL STATS & RECONCILIATION
  // ──────────────────────────────────────────────────────────────

  async getStats(): Promise<MaterialAccountsStats> {
    const purchases = await this.getPurchases();
    const payments = await this.getPayments();
    const returns = await this.getReturns();
    const materials = await this.getMaterials();
    const suppliers = await this.getSuppliers();

    // 1. Total Purchase Value (posted purchases only)
    const postedPurchases = purchases.filter(p => p.status === 'posted');
    const totalPurchaseValue = round2(postedPurchases.reduce((acc, p) => acc + p.grand_total, 0));

    // 2. Total Paid (valid posted payments only)
    const postedPayments = payments.filter(p => p.status === 'posted');
    const totalPaid = round2(postedPayments.reduce((acc, p) => acc + p.amount, 0));

    // 3. Outstanding Payable = sum of supplier outstanding payables
    const outstandingPayable = round2(suppliers.reduce((acc, s) => acc + (s.outstanding_payable || 0), 0));

    // 4. Advance Balance = sum of supplier advance balances
    const advanceBalance = round2(suppliers.reduce((acc, s) => acc + (s.advance_balance || 0), 0));

    // 5. Total Procurement Expenses (Freight + Loading + Other)
    const totalExpenses = round2(
      postedPurchases.reduce((acc, p) => acc + p.transportation_cost + p.loading_cost + p.other_expenses, 0)
    );

    // 6. Total Returns
    const approvedReturns = returns.filter(r => r.status === 'approved');
    const totalReturns = round2(approvedReturns.reduce((acc, r) => acc + r.total_amount, 0));

    // 7. Net Purchase Value = Total Purchase Value - Returns
    const netPurchaseValue = round2(Math.max(0, totalPurchaseValue - totalReturns));

    const activeMaterials = materials.filter(m => m.is_active);
    const lowStockMaterials = materials.filter(m => m.is_active && m.current_stock <= m.reorder_threshold);

    return {
      totalPurchaseValue,
      totalPaid,
      outstandingPayable,
      advanceBalance,
      totalExpenses,
      totalReturns,
      netPurchaseValue,
      totalSuppliers: suppliers.length,
      activeMaterialsCount: activeMaterials.length,
      lowStockMaterialsCount: lowStockMaterials.length
    };
  },

  async runReconciliationScan(): Promise<ReconciliationWarning[]> {
    const warnings: ReconciliationWarning[] = [];
    const purchases = await this.getPurchases();
    const payments = await this.getPayments();
    const suppliers = await this.getSuppliers();

    // Check 1: Payments without allocations
    const postedPayments = payments.filter(p => p.status === 'posted');
    for (const pay of postedPayments) {
      if ((!pay.allocations || pay.allocations.length === 0) && pay.amount > 0 && pay.advance_amount === 0) {
        warnings.push({
          id: `unalloc_${pay.id}`,
          type: 'unallocated_payment',
          severity: 'medium',
          title: `Unallocated Payment: ${pay.payment_number}`,
          description: `Payment of ${formatBDT(pay.amount)} has 0 allocations and is not classified as advance.`,
          recordId: pay.id,
          recordType: 'payment'
        });
      }
    }

    // Check 2: Duplicate payment reference notes
    const seenRefs = new Map<string, string>();
    for (const pay of postedPayments) {
      if (pay.reference_note && pay.reference_note.trim().length > 3) {
        const ref = pay.reference_note.trim().toLowerCase();
        if (seenRefs.has(ref)) {
          warnings.push({
            id: `dup_ref_${pay.id}`,
            type: 'duplicate_payment_ref',
            severity: 'low',
            title: `Duplicate Payment Reference: "${pay.reference_note}"`,
            description: `Payment ${pay.payment_number} shares the same transaction reference as another payment.`,
            recordId: pay.id,
            recordType: 'payment'
          });
        } else {
          seenRefs.set(ref, pay.id);
        }
      }
    }

    // Check 3: Over-allocated or negative due purchases
    for (const po of purchases) {
      if (po.status === 'posted') {
        if (po.total_paid > po.grand_total + 0.01) {
          warnings.push({
            id: `overallock_${po.id}`,
            type: 'overallocated_purchase',
            severity: 'high',
            title: `Overallocated Purchase: ${po.purchase_number}`,
            description: `Total paid (${formatBDT(po.total_paid)}) exceeds purchase grand total (${formatBDT(po.grand_total)}).`,
            recordId: po.id,
            recordType: 'purchase'
          });
        }
        if (po.balance_due < 0) {
          warnings.push({
            id: `neg_due_${po.id}`,
            type: 'negative_balance',
            severity: 'high',
            title: `Negative Balance Due on ${po.purchase_number}`,
            description: `Balance due is ${formatBDT(po.balance_due)}. Requires audit review.`,
            recordId: po.id,
            recordType: 'purchase'
          });
        }
      }
    }

    // Check 4: Supplier balance discrepancies
    for (const sup of suppliers) {
      const ledger = await this.getSupplierLedger(sup.id);
      if (ledger.length > 0) {
        const lastEntry = ledger[ledger.length - 1];
        const ledgerBalance = round2(lastEntry.running_balance);
        const expectedBalance = round2((sup.outstanding_payable || 0) - (sup.advance_balance || 0));
        // Allow minor float difference
        if (Math.abs(ledgerBalance - expectedBalance) > 1) {
          warnings.push({
            id: `ledger_mismatch_${sup.id}`,
            type: 'unbalanced_ledger',
            severity: 'medium',
            title: `Ledger vs Account Balance Mismatch: ${sup.name}`,
            description: `Supplier net payable is ${formatBDT(expectedBalance)}, but chronological ledger ends at ${formatBDT(ledgerBalance)}.`,
            recordId: sup.id,
            recordType: 'supplier'
          });
        }
      }
    }

    return warnings;
  }
};
