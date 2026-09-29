import { supabase, schemaState, normalizeText, dedupPromise, formatApiError } from './client';
import type {
  InventoryItem,
  ToyBoxInventory,
  InventoryTransaction,
  InvoiceParsedItem,
  InvoicePreviewResult,
  InvoiceApplyResult
} from '@/types/api';

export const inventoryApi = {
  /**
   * Fetch all inventory items (in-flight deduplicated)
   */
  async getInventory(filters: { category?: string; searchTerm?: string } = {}): Promise<InventoryItem[]> {
    const dedupKey = `getInventory:${filters.category || 'all'}:${filters.searchTerm || ''}`;
    return dedupPromise(dedupKey, async () => {
      try {
        let query = supabase.from('inventory').select('*').order('name');

        if (filters.category && filters.category !== 'All') {
          query = query.eq('category', filters.category);
        }
        if (filters.searchTerm) {
          query = query.or(`name.ilike.%${filters.searchTerm}%,sku.ilike.%${filters.searchTerm}%`);
        }

        const { data, error } = await query;
        if (error) throw error;
        return (data as InventoryItem[]) || [];
      } catch (err) {
        throw formatApiError(err, 'Failed to fetch inventory catalog');
      }
    });
  },

  /**
   * Create new product in inventory
   */
  async createInventoryItem(itemData: Partial<InventoryItem> & Record<string, any>): Promise<InventoryItem> {
    try {
      const payload: Record<string, any> = {
        ...itemData,
        unit_price: Number(itemData.unit_price) || 0,
        selling_price: Number(itemData.selling_price) || Number(itemData.unit_price) || 0,
        making_cost: Number(itemData.making_cost) || 0,
        current_stock: Number(itemData.current_stock) || 0,
        min_stock_level: Number(itemData.min_stock_level) || 0,
        supports_serial_tracking: Boolean(itemData.supports_serial_tracking)
      };

      let { data, error } = await supabase
        .from('inventory')
        .insert([payload])
        .select()
        .single();

      if (error && schemaState.isMissingColumnError(error, 'supports_serial_tracking')) {
        const fallbackPayload = { ...payload };
        delete fallbackPayload.supports_serial_tracking;
        ({ data, error } = await supabase
          .from('inventory')
          .insert([fallbackPayload])
          .select()
          .single());
      }

      if (error) throw error;
      return data as InventoryItem;
    } catch (err) {
      throw formatApiError(err, 'Failed to create inventory item');
    }
  },

  /**
   * Update product details
   */
  async updateInventoryItem(id: string, updates: Partial<InventoryItem> & Record<string, any>): Promise<InventoryItem> {
    try {
      const payload: Record<string, any> = { ...updates };

      if (Object.prototype.hasOwnProperty.call(updates, 'unit_price')) {
        payload.unit_price = Number(updates.unit_price) || 0;
      }
      if (Object.prototype.hasOwnProperty.call(updates, 'selling_price')) {
        payload.selling_price = Number(updates.selling_price) || 0;
      }
      if (Object.prototype.hasOwnProperty.call(updates, 'making_cost')) {
        payload.making_cost = Number(updates.making_cost) || 0;
      }
      if (Object.prototype.hasOwnProperty.call(updates, 'current_stock')) {
        payload.current_stock = Number(updates.current_stock) || 0;
      }
      if (Object.prototype.hasOwnProperty.call(updates, 'min_stock_level')) {
        payload.min_stock_level = Number(updates.min_stock_level) || 0;
      }
      if (Object.prototype.hasOwnProperty.call(updates, 'supports_serial_tracking')) {
        payload.supports_serial_tracking = Boolean(updates.supports_serial_tracking);
      }

      let { data, error } = await supabase
        .from('inventory')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (error && schemaState.isMissingColumnError(error, 'supports_serial_tracking')) {
        const fallbackPayload = { ...payload };
        delete fallbackPayload.supports_serial_tracking;
        ({ data, error } = await supabase
          .from('inventory')
          .update(fallbackPayload)
          .eq('id', id)
          .select()
          .single());
      }

      if (error) throw error;
      return data as InventoryItem;
    } catch (err) {
      throw formatApiError(err, `Failed to update inventory item #${id}`);
    }
  },

  /**
   * Adjust stock levels directly
   */
  async adjustStock(
    id: string,
    quantityChange: number,
    options: { orderId?: string | number; txType?: string; note?: string; userId?: string } = {}
  ): Promise<InventoryItem> {
    try {
      const { data: item, error: fetchError } = await supabase
        .from('inventory')
        .select('current_stock')
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;

      const newStock = Math.max(0, (item.current_stock || 0) + quantityChange);

      const { data, error } = await supabase
        .from('inventory')
        .update({ current_stock: newStock, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      const txType = quantityChange >= 0 ? 'manual_add' : 'manual_deduct';
      await this.logInventoryTransaction({
        inventory_id: id,
        order_id: options.orderId || null,
        type: options.txType || txType,
        quantity: quantityChange,
        note: options.note || (quantityChange >= 0 ? `Manual stock add: +${quantityChange}` : `Manual stock deduct: ${quantityChange}`),
        created_by: options.userId || null
      });

      return data as InventoryItem;
    } catch (err) {
      throw formatApiError(err, `Failed to adjust stock for item #${id}`);
    }
  },

  /**
   * Delete product from inventory
   */
  async deleteInventoryItem(id: string): Promise<void> {
    try {
      const { error } = await supabase.from('inventory').delete().eq('id', id);
      if (error) throw error;
    } catch (err) {
      throw formatApiError(err, `Failed to delete inventory item #${id}`);
    }
  },

  /**
   * Log inventory transaction
   */
  async logInventoryTransaction(tx: {
    inventory_id: string;
    order_id?: string | number | null;
    type: string;
    quantity: number;
    note?: string | null;
    created_by?: string | null;
  }): Promise<void> {
    try {
      const { error } = await supabase
        .from('inventory_transactions')
        .insert([{ ...tx, created_at: new Date().toISOString() }]);
      if (error) console.warn('inventory_transactions log non-fatal warning:', error.message);
    } catch (e) {
      console.warn('inventory_transactions insert failed:', e);
    }
  },

  /**
   * Deduct stock by inventory ID
   */
  async deductStockByInventoryId(
    inventoryId: string,
    quantity = 1,
    options: { orderId?: string | number; note?: string; userId?: string } = {}
  ): Promise<InventoryItem | null> {
    try {
      const { data: item, error: fetchError } = await supabase
        .from('inventory')
        .select('id, current_stock')
        .eq('id', inventoryId)
        .single();

      if (fetchError) throw fetchError;
      if (!item) return null;

      const newStock = Math.max(0, (item.current_stock || 0) - quantity);

      const { data, error } = await supabase
        .from('inventory')
        .update({ current_stock: newStock, updated_at: new Date().toISOString() })
        .eq('id', item.id)
        .select()
        .single();

      if (error) throw error;

      await this.logInventoryTransaction({
        inventory_id: item.id,
        order_id: options.orderId || null,
        type: 'order_confirmed',
        quantity: -quantity,
        note: options.note || `Order confirmed — deducted ${quantity} unit(s)`,
        created_by: options.userId || null
      });

      return data as InventoryItem;
    } catch (err) {
      throw formatApiError(err, `Stock deduction failed for #${inventoryId}`);
    }
  },

  /**
   * Restore stock by inventory ID
   */
  async restoreStockByInventoryId(
    inventoryId: string,
    quantity = 1,
    options: { orderId?: string | number; txType?: string; note?: string; userId?: string } = {}
  ): Promise<InventoryItem | null> {
    try {
      const { data: item, error: fetchError } = await supabase
        .from('inventory')
        .select('id, current_stock')
        .eq('id', inventoryId)
        .single();

      if (fetchError) throw fetchError;
      if (!item) return null;

      const newStock = (item.current_stock || 0) + quantity;

      const { data, error } = await supabase
        .from('inventory')
        .update({ current_stock: newStock, updated_at: new Date().toISOString() })
        .eq('id', item.id)
        .select()
        .single();

      if (error) throw error;

      const txType = options.txType || 'order_cancelled';
      await this.logInventoryTransaction({
        inventory_id: item.id,
        order_id: options.orderId || null,
        type: txType,
        quantity: +quantity,
        note: options.note || `Order ${txType.replace('order_', '')} — restored ${quantity} unit(s)`,
        created_by: options.userId || null
      });

      return data as InventoryItem;
    } catch (err) {
      throw formatApiError(err, `Stock restoration failed for #${inventoryId}`);
    }
  },

  /**
   * Deduct stock by product name (fallback matching)
   */
  async deductStockByProductName(
    productName: string,
    quantity = 1,
    options: { orderId?: string | number; note?: string; userId?: string } = {}
  ): Promise<InventoryItem | null> {
    try {
      const { data: items, error: fetchError } = await supabase
        .from('inventory')
        .select('id, current_stock')
        .ilike('name', productName)
        .limit(1);

      if (fetchError) throw fetchError;
      if (!items || items.length === 0) return null;

      return this.deductStockByInventoryId(items[0].id, quantity, options);
    } catch (err) {
      throw formatApiError(err, `Deduct stock by product name failed for "${productName}"`);
    }
  },

  /**
   * Per-product order statistics
   */
  async getProductOrderStats(inventoryId: string, dateRange: { from?: string; to?: string } = {}) {
    try {
      let query = supabase
        .from('orders')
        .select('quantity, amount, status, inventory_id')
        .eq('inventory_id', inventoryId)
        .neq('status', 'Test');

      if (dateRange.from) query = query.gte('created_at', dateRange.from);
      if (dateRange.to) query = query.lte('created_at', dateRange.to);

      const { data: orders, error } = await query;
      if (error) throw error;

      const allOrders = orders || [];
      const confirmed = allOrders.filter((o) =>
        ['Confirmed', 'Completed', 'Factory Processing', 'Courier Submitted', 'Courier Ready', 'Bulk Exported'].includes(
          o.status
        )
      );
      const cancelled = allOrders.filter((o) => o.status === 'Cancelled');
      const unitsSold = confirmed.reduce((s, o) => s + (Number(o.quantity) || 1), 0);
      const revenue = confirmed.reduce((s, o) => s + (Number(o.amount) || 0), 0);

      return {
        total_orders: allOrders.length,
        confirmed_orders: confirmed.length,
        cancelled_orders: cancelled.length,
        units_sold: unitsSold,
        total_revenue: revenue
      };
    } catch (err) {
      throw formatApiError(err, `Failed to retrieve stats for product #${inventoryId}`);
    }
  },

  /**
   * P&L Report across inventory items
   */
  async getInventoryPnL(dateRange: { from?: string; to?: string } = {}) {
    try {
      const { data: products, error: invError } = await supabase
        .from('inventory')
        .select('id, name, sku, category, selling_price, making_cost, unit_price, current_stock')
        .order('name');

      if (invError) throw invError;

      let ordersQuery = supabase
        .from('orders')
        .select('inventory_id, quantity, amount, status')
        .in('status', ['Confirmed', 'Completed', 'Factory Processing', 'Courier Submitted', 'Courier Ready', 'Bulk Exported'])
        .not('inventory_id', 'is', null);

      if (dateRange.from) ordersQuery = ordersQuery.gte('created_at', dateRange.from);
      if (dateRange.to) ordersQuery = ordersQuery.lte('created_at', dateRange.to);

      const { data: orders, error: ordersError } = await ordersQuery;
      if (ordersError) throw ordersError;

      const ordersByProduct = (orders || []).reduce<Record<string, any[]>>((acc, o) => {
        const key = o.inventory_id;
        if (!acc[key]) acc[key] = [];
        acc[key].push(o);
        return acc;
      }, {});

      return (products || []).map((product) => {
        const productOrders = ordersByProduct[product.id] || [];
        const unitsSold = productOrders.reduce((s, o) => s + (Number(o.quantity) || 1), 0);
        const revenue = productOrders.reduce((s, o) => s + (Number(o.amount) || 0), 0);
        const makingCost = Number(product.making_cost) || 0;
        const cogs = makingCost * unitsSold;
        const grossProfit = revenue - cogs;
        const marginPct = revenue > 0 ? Math.round((grossProfit / revenue) * 100) : 0;

        return {
          id: product.id,
          name: product.name,
          sku: product.sku,
          category: product.category,
          current_stock: product.current_stock,
          unitsSold,
          revenue,
          cogs,
          grossProfit,
          marginPct
        };
      });
    } catch (err) {
      throw formatApiError(err, 'Failed to generate inventory P&L');
    }
  },

  /**
   * ToyBox Inventory (in-flight deduplicated)
   */
  async getToyBoxInventory(): Promise<ToyBoxInventory[]> {
    return dedupPromise('getToyBoxInventory', async () => {
      try {
        const { data, error } = await supabase
          .from('toy_box_inventory')
          .select('id,toy_box_number,stock_quantity,updated_at')
          .order('toy_box_number', { ascending: true });

        if (error) throw error;
        return (data || []).map((b: any) => ({
          ...b,
          product_name: String(b?.product_name || 'TOY BOX').trim()
        })) as ToyBoxInventory[];
      } catch (err) {
        throw formatApiError(err, 'Failed to fetch ToyBox inventory');
      }
    });
  },

  async updateToyBoxStock(id: string, newStock: number): Promise<ToyBoxInventory> {
    try {
      const { data, error } = await supabase
        .from('toy_box_inventory')
        .update({ stock_quantity: newStock, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return {
        ...data,
        product_name: String(data.product_name || 'TOY BOX').trim()
      } as ToyBoxInventory;
    } catch (err) {
      throw formatApiError(err, `Failed to update ToyBox stock for #${id}`);
    }
  },

  async createToyBoxStocks(entries: Array<{ product_name?: string; toy_box_number: number; stock_quantity: number }>) {
    try {
      const state = schemaState.getToyBoxProductNameColumnState();
      const payload = (entries || []).map((entry) => {
        const item: Record<string, any> = {
          toy_box_number: Number(entry.toy_box_number),
          stock_quantity: Number(entry.stock_quantity) || 0,
          updated_at: new Date().toISOString()
        };
        if (state === true && entry.product_name) {
          item.product_name = String(entry.product_name).trim();
        }
        return item;
      });

      let { data, error } = await supabase
        .from('toy_box_inventory')
        .insert(payload)
        .select();

      if (error && schemaState.isMissingColumnError(error, 'product_name')) {
        const fallback = payload.map(({ toy_box_number, stock_quantity, updated_at }) => ({
          toy_box_number,
          stock_quantity,
          updated_at
        }));
        ({ data, error } = await supabase.from('toy_box_inventory').insert(fallback).select());
      }

      if (error) throw error;
      return data;
    } catch (err) {
      throw formatApiError(err, 'Failed to create ToyBox stock rows');
    }
  },

  /**
   * Product matching and text extraction
   */
  extractToyBoxNumber(productName = ''): number | null {
    const compact = normalizeText(productName).replace(/\s+/g, '');
    const match = compact.match(/^toybox(\d{1,3})$/i);
    if (!match) return null;
    const num = parseInt(match[1], 10);
    return Number.isFinite(num) ? num : null;
  },

  matchInventoryProduct(productName: string, inventory: any[] = []): any | null {
    const normalizedTarget = normalizeText(productName);
    if (!normalizedTarget) return null;

    const compactTarget = normalizedTarget.replace(/\s+/g, '');

    const entries = inventory.map((item) => ({
      ...item,
      _nameNormalized: normalizeText(item.name),
      _nameCompact: normalizeText(item.name).replace(/\s+/g, '')
    }));

    const exact = entries.find((e) => e._nameNormalized === normalizedTarget);
    if (exact) return exact;

    const exactCompact = entries.find((e) => e._nameCompact === compactTarget);
    if (exactCompact) return exactCompact;

    const include = entries.find(
      (e) => e._nameNormalized.includes(normalizedTarget) || normalizedTarget.includes(e._nameNormalized)
    );
    if (include) return include;

    const includeCompact = entries.find(
      (e) => e._nameCompact.includes(compactTarget) || compactTarget.includes(e._nameCompact)
    );
    if (includeCompact) return includeCompact;

    const targetTokens = new Set(normalizedTarget.split(' ').filter(Boolean));
    let best: any = null;
    let bestScore = 0;

    entries.forEach((entry) => {
      const itemTokens = new Set(entry._nameNormalized.split(' ').filter(Boolean));
      if (!itemTokens.size) return;
      const overlap = [...targetTokens].filter((t) => itemTokens.has(t)).length;
      const score = overlap / Math.max(targetTokens.size, itemTokens.size);
      if (score > bestScore) {
        bestScore = score;
        best = entry;
      }
    });

    if (best && bestScore >= 0.35) return best;
    return null;
  },

  matchToyBoxInventory(productText = '', toyBoxes: ToyBoxInventory[] = []) {
    const toyBoxNum = this.extractToyBoxNumber(productText);
    if (toyBoxNum == null) return null;

    const candidates = (toyBoxes || []).filter((b) => Number(b.toy_box_number) === toyBoxNum);
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return { match: candidates[0], ambiguous: false };

    const normalizedText = normalizeText(productText).replace(/\s+/g, '');
    const explicitMatch = candidates.find((candidate) =>
      normalizedText.includes(normalizeText(candidate.product_name || 'TOY BOX').replace(/\s+/g, ''))
    );

    if (explicitMatch) {
      return { match: explicitMatch, ambiguous: false };
    }

    return { match: null, ambiguous: true, candidates };
  },

  parseInvoiceLine(line: string): { product: string; quantity: number; sourceLine: string } | null {
    const raw = String(line || '').trim();
    if (!raw) return null;

    const lowered = raw.toLowerCase();
    if (/invoice|date|subtotal|total|discount|vat|phone|customer|address|paid|due/.test(lowered)) {
      return null;
    }

    const patterns = [
      /^(\d+)\s*[x×]\s*(.+)$/i,
      /^(.+?)\s*[x×]\s*(\d+)$/i,
      /^(.+?)\s*[-:]\s*(\d+)\s*(pcs|pc|qty)?$/i,
      /^(.+?)\s+(\d+)\s*(pcs|pc|qty)$/i
    ];

    for (const p of patterns) {
      const m = raw.match(p);
      if (m) {
        if (p === patterns[0]) {
          return { product: m[2]?.trim(), quantity: Math.max(1, parseInt(m[1], 10)), sourceLine: raw };
        }
        return { product: m[1]?.trim(), quantity: Math.max(1, parseInt(m[2], 10)), sourceLine: raw };
      }
    }

    const normalized = normalizeText(raw);
    if (!normalized || /^\d+$/.test(normalized)) return null;
    return { product: raw, quantity: 1, sourceLine: raw };
  },

  parseManualBulkInvoiceInput(text: string) {
    if (!text || !text.trim()) return [];

    const cleaned = String(text)
      .replace(/[\r\n]+/g, ',')
      .replace(/,+/g, ',')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const unitWords = /(pis|pcs|piece|pieces|pc|qty)$/i;

    return cleaned
      .map((chunk) => {
        const raw = chunk;
        const normalizedChunk = raw.replace(/\s+/g, ' ').trim();

        const patterns = [
          /^(.+?)\s+(\d+)\s*(pis|pcs|piece|pieces|pc|qty)?$/i,
          /^(\d+)\s*[x×]\s*(.+)$/i,
          /^(.+?)\s*[x×]\s*(\d+)$/i,
          /^(.+?)\s*[-:]\s*(\d+)\s*(pis|pcs|piece|pieces|pc|qty)?$/i
        ];

        for (const p of patterns) {
          const m = normalizedChunk.match(p);
          if (m) {
            if (p === patterns[1]) {
              return {
                product: String(m[2] || '').replace(unitWords, '').trim(),
                quantity: Math.max(1, parseInt(m[1], 10) || 1),
                sourceLine: raw
              };
            }

            const product = String(m[1] || '').replace(unitWords, '').trim();
            const quantity = Math.max(1, parseInt(m[2], 10) || 1);
            return { product, quantity, sourceLine: raw };
          }
        }

        const fallback = normalizedChunk.replace(unitWords, '').trim();
        if (!fallback) return null;
        return { product: fallback, quantity: 1, sourceLine: raw };
      })
      .filter((x): x is { product: string; quantity: number; sourceLine: string } => Boolean(x && x.product));
  },

  async previewInvoiceStockUpdate(invoiceText: string, options: { preferManualBulk?: boolean; stockMode?: 'add' | 'deduct' } = {}) {
    if (!invoiceText || !invoiceText.trim()) {
      return {
        matched: [],
        unmatched: [],
        summary: { lines: 0, matchedLines: 0, unmatchedLines: 0, totalQty: 0 }
      };
    }

    const { data: inventory, error } = await supabase.from('inventory').select('id,name,current_stock');
    if (error) throw formatApiError(error);

    const toyBoxes = await this.getToyBoxInventory();
    const lines = invoiceText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    const manualParsed = options?.preferManualBulk ? this.parseManualBulkInvoiceInput(invoiceText) : [];
    const parsed = manualParsed.length > 0 ? manualParsed : lines.map((l) => this.parseInvoiceLine(l)).filter(Boolean);

    const matched: any[] = [];
    const unmatched: any[] = [];

    (parsed as any[]).forEach((row) => {
      const matchedItem = this.matchInventoryProduct(row.product, inventory || []);
      if (matchedItem) {
        matched.push({
          ...row,
          target_type: 'inventory',
          target_id: matchedItem.id,
          inventory_id: `inventory-${matchedItem.id}`,
          inventory_name: matchedItem.name,
          current_stock: Number(matchedItem.current_stock || 0)
        });
        return;
      }

      const toyBoxResult = this.matchToyBoxInventory(row.product, toyBoxes || []);
      if (toyBoxResult?.match) {
        const toyBox = toyBoxResult.match;
        matched.push({
          ...row,
          target_type: 'toy_box_inventory',
          target_id: toyBox.id,
          inventory_id: `toybox-${toyBox.id}`,
          inventory_name: `${toyBox.product_name || 'TOY BOX'} #${toyBox.toy_box_number}`,
          current_stock: Number(toyBox.stock_quantity || 0)
        });
        return;
      }

      unmatched.push({
        ...row,
        reason: 'No confident match found. Check spelling or serial number.'
      });
    });

    const aggregatedMap = new Map();
    matched.forEach((m) => {
      const key = `${m.target_type}:${m.target_id}`;
      const prev = aggregatedMap.get(key);
      if (!prev) {
        aggregatedMap.set(key, { ...m, lines: [m.sourceLine] });
      } else {
        prev.quantity += m.quantity;
        prev.lines.push(m.sourceLine);
      }
    });

    const aggregatedMatched = Array.from(aggregatedMap.values()).map((m) => {
      const isAdd = options?.stockMode === 'add';
      const nextStock = isAdd
        ? Number(m.current_stock || 0) + Number(m.quantity || 0)
        : Math.max(0, Number(m.current_stock || 0) - Number(m.quantity || 0));
      return {
        ...m,
        next_stock: nextStock,
        deducted: isAdd ? Number(m.quantity || 0) : Number(m.current_stock || 0) - nextStock,
        shortfall: isAdd ? 0 : Math.max(0, Number(m.quantity || 0) - Number(m.current_stock || 0))
      };
    });

    return {
      matched: aggregatedMatched,
      unmatched,
      summary: {
        lines: parsed.length,
        matchedLines: matched.length,
        unmatchedLines: unmatched.length,
        totalQty: aggregatedMatched.reduce((sum, m) => sum + Number(m.quantity || 0), 0)
      }
    };
  },

  async applyInvoiceStockUpdate(invoiceText: string, actorName = 'System', options: any = {}) {
    if (String(options?.confirmCommand || '').trim().toLowerCase() !== 'confirm') {
      throw new Error('Apply blocked: explicit confirm command required. Type "confirm" to proceed.');
    }

    const preview = await this.previewInvoiceStockUpdate(invoiceText, options);
    if (options.dryRun) return preview;

    const applied: any[] = [];
    for (const m of preview.matched) {
      const table = m.target_type === 'toy_box_inventory' ? 'toy_box_inventory' : 'inventory';
      const stockCol = table === 'toy_box_inventory' ? 'stock_quantity' : 'current_stock';

      const { data: latest, error: fetchErr } = await supabase
        .from(table)
        .select(`id,${stockCol},${table === 'inventory' ? 'name' : 'product_name,toy_box_number'}`)
        .eq('id', m.target_id)
        .single();

      if (fetchErr) throw formatApiError(fetchErr);

      const before = Number((latest as any)?.[stockCol] || 0);
      const isAdd = options?.stockMode === 'add';
      const after = isAdd ? before + Number(m.quantity || 0) : Math.max(0, before - Number(m.quantity || 0));

      const { error: updateErr } = await supabase
        .from(table)
        .update({ [stockCol]: after, updated_at: new Date().toISOString() })
        .eq('id', m.target_id);

      if (updateErr) throw formatApiError(updateErr);

      applied.push({
        id: m.target_id,
        name: table === 'toy_box_inventory'
          ? `${(latest as any)?.product_name || 'TOY BOX'} #${(latest as any)?.toy_box_number}`
          : (latest as any)?.name,
        sourceTable: table,
        requestedChange: Number(m.quantity || 0),
        deducted: isAdd ? Number(m.quantity || 0) : before - after,
        before,
        after
      });
    }

    return {
      ...preview,
      applied,
      summary: {
        ...preview.summary,
        appliedItems: applied.length,
        totalDeducted: applied.reduce((sum, a) => sum + Number(a.deducted || 0), 0)
      }
    };
  }
};
