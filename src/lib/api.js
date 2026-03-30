import { supabase } from './supabase';

/**
 * SECURE API SERVICE LAYER
 * Centralized functions for database interactions with permission checks.
 */

// --- Order Management ---

export const api = {
  async getOrderById(orderId) {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();
    if (error) throw error;
    return data;
  },

  normalizeText(value = '') {
    return String(value)
      .toLowerCase()
      .replace(/([a-z])([0-9])/g, '$1 $2')
      .replace(/([0-9])([a-z])/g, '$1 $2')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  },

  parseInvoiceLine(line) {
    const raw = String(line || '').trim();
    if (!raw) return null;

    // Ignore probable header/footer lines
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

    // Fallback: treat full line as product with quantity 1
    const normalized = this.normalizeText(raw);
    if (!normalized || /^\d+$/.test(normalized)) return null;
    return { product: raw, quantity: 1, sourceLine: raw };
  },

  parseManualBulkInvoiceInput(text) {
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
      .filter((x) => x && x.product);
  },

  async extractInvoiceItemsWithGroq(invoiceText) {
    const apiKey = import.meta.env.VITE_GROQ_API_KEY;
    if (!apiKey || !invoiceText?.trim()) return null;

    const prompt = `You are an invoice line parser. Extract purchasable product lines and quantity from raw invoice text.\nReturn STRICT JSON only (no markdown), in this exact shape:\n{"items":[{"product":"string","quantity":number,"sourceLine":"string"}]}\nRules:\n- quantity must be integer >= 1\n- ignore totals, VAT, discount, customer/phone/address/date/invoice number lines\n- if quantity is missing, use 1\n- keep product concise but faithful\nRaw invoice:\n${invoiceText}`;

    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          temperature: 0.1,
          messages: [
            {
              role: 'system',
              content: 'Return strict JSON only. No prose. No markdown.'
            },
            {
              role: 'user',
              content: prompt
            }
          ]
        })
      });

      if (!response.ok) {
        throw new Error(`Groq API error: ${response.status}`);
      }

      const payload = await response.json();
      const content = payload?.choices?.[0]?.message?.content;
      if (!content) return null;

      const cleaned = content
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();

      const parsed = JSON.parse(cleaned);
      const items = Array.isArray(parsed?.items) ? parsed.items : [];

      const normalized = items
        .map((i) => ({
          product: String(i?.product || '').trim(),
          quantity: Math.max(1, parseInt(i?.quantity, 10) || 1),
          sourceLine: String(i?.sourceLine || i?.product || '').trim()
        }))
        .filter((i) => i.product);

      return normalized.length ? normalized : null;
    } catch (error) {
      console.error('Groq extraction failed. Falling back to local parser:', error);
      return null;
    }
  },

  async extractOrderWithAI(rawText) {
    const apiKey = import.meta.env.VITE_GROQ_API_KEY;
    if (!apiKey || !rawText?.trim()) return null;

    const prompt = `You are an expert order extractor for a premium Order Management System.
From the raw input below (which could be WhatsApp text or Spreadsheet rows), extract customer details and products.

### SYSTEM CONFIGURATION (Reference only):
- PRODUCTS: [TOY BOX, ORGANIZER, Travel bag, TOY BOX + ORG, Gym bag, VLOGGER FOR FREE, MMB, Quran, WAIST BAG, BAGPACK, Moshari]
- STATUSES: [New, Pending Call, Confirmed, Factory Queue, Courier Ready, Shipped, Delivered, Cancelled, Returned]

### EXTRACTION RULES:
1. CUSTOMER INFO:
   - Identify Name, Phone, and Address. 
   - For Spreadsheet rows (tab-separated):
     - Name is often a short name after a date.
     - Address is the longest string (e.g., "Flat C6 Mohanogor...").
     - Phone is the 10-11 digit number.
2. PRODUCT LOGIC:
   - Map products to the SYSTEM CONFIGURATION names.
   - TOY BOX SERIALS: If text mentions "tb: 09. 17" or "#15, #22", these are specific box numbers.
   - MULTI-SERIAL SPLIT: If a single line mentions multiple serials (e.g., "tb: 09. 17") with a quantity (e.g., 2), return them as SEPARATE product objects in the array, each with quantity 1 and its specific serial number in the name: "TOY BOX #09", "TOY BOX #17".
3. SHIPPING ZONE:
   - Default to "Outside Dhaka".
   - Set "Inside Dhaka" ONLY if address clearly mentions: Uttara, Dhanmondi, Gulshan, Banani, Mirpur, Badda, Mohammadpur, Khilgaon, Bashundhara, Rampura, or "Dhaka City". 
4. FINANCIALS:
   - "extracted_subtotal": Extract the price if clearly mentioned (e.g. 1200, 2400). Exclude delivery charge.
5. FORMAT:
   - Return STRICT JSON only. No markdown. No prose.

### DESIRED SHAPE:
{
  "customer_name": "string",
  "phone": "string",
  "address": "string",
  "products": [
    { "name": "string", "quantity": number, "size": "string" }
  ],
  "shipping_zone": "Inside Dhaka" | "Outside Dhaka",
  "extracted_subtotal": number | null,
  "notes": "string"
}

### RAW INPUT:
${rawText}`;

    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          temperature: 0.1,
          messages: [
            {
              role: 'system',
              content: 'Return strict JSON only. No prose. No markdown.'
            },
            {
              role: 'user',
              content: prompt
            }
          ]
        })
      });

      if (!response.ok) throw new Error(`Groq API error: ${response.status}`);

      const payload = await response.json();
      const content = payload?.choices?.[0]?.message?.content;
      if (!content) return null;

      const cleaned = content
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();

      const parsed = JSON.parse(cleaned);
      return {
        customer_name: String(parsed?.customer_name || '').trim(),
        phone: String(parsed?.phone || '').trim().replace(/[^0-9+]/g, ''),
        address: String(parsed?.address || '').trim(),
        shipping_zone: parsed?.shipping_zone === 'Inside Dhaka' ? 'Inside Dhaka' : 'Outside Dhaka',
        extracted_subtotal: parsed?.extracted_subtotal ? parseFloat(parsed.extracted_subtotal) : null,
        products: Array.isArray(parsed?.products) ? parsed.products.map(p => ({
          name: String(p?.name || '').trim(),
          quantity: Math.max(1, parseInt(p?.quantity, 10) || 1),
          size: String(p?.size || '').trim()
        })) : [],
        notes: String(parsed?.notes || '').trim()
      };
    } catch (error) {
      console.error('Groq order extraction failed:', error);
      return null;
    }
  },

  matchInventoryProduct(productName, inventory = []) {
    const normalizedTarget = this.normalizeText(productName);
    if (!normalizedTarget) return null;

    const compactTarget = normalizedTarget.replace(/\s+/g, '');

    const entries = inventory.map((item) => ({
      ...item,
      _nameNormalized: this.normalizeText(item.name),
      _nameCompact: this.normalizeText(item.name).replace(/\s+/g, '')
    }));

    // Exact match first
    const exact = entries.find((e) => e._nameNormalized === normalizedTarget);
    if (exact) return exact;

    // Strict compact match (handles toybox1 vs toy box 1)
    const exactCompact = entries.find((e) => e._nameCompact === compactTarget);
    if (exactCompact) return exactCompact;

    // Inclusion match
    const include = entries.find(
      (e) => e._nameNormalized.includes(normalizedTarget) || normalizedTarget.includes(e._nameNormalized)
    );
    if (include) return include;

    // Inclusion on compact strings
    const includeCompact = entries.find(
      (e) => e._nameCompact.includes(compactTarget) || compactTarget.includes(e._nameCompact)
    );
    if (includeCompact) return includeCompact;

    // Token overlap scoring
    const targetTokens = new Set(normalizedTarget.split(' ').filter(Boolean));
    let best = null;
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

  extractToyBoxNumber(productName = '') {
    const compact = this.normalizeText(productName).replace(/\s+/g, '');
    const match = compact.match(/^toybox(\d{1,3})$/i);
    if (!match) return null;
    const num = parseInt(match[1], 10);
    return Number.isFinite(num) ? num : null;
  },

  getUnmatchedReason(row, inventory = [], toyBoxes = []) {
    const normalized = this.normalizeText(row?.product || '');
    if (!normalized) return 'Could not detect a valid product name in this line.';

    const toyBoxNum = this.extractToyBoxNumber(row?.product || '');
    if (toyBoxNum != null) {
      const foundToyBox = (toyBoxes || []).some((b) => Number(b.toy_box_number) === toyBoxNum);
      if (!foundToyBox) {
        return `Toy Box #${toyBoxNum} was not found in toy box inventory.`;
      }
    }

    const targetTokens = new Set(normalized.split(' ').filter(Boolean));
    const best = (inventory || []).reduce((acc, item) => {
      const itemNorm = this.normalizeText(item.name);
      const itemTokens = new Set(itemNorm.split(' ').filter(Boolean));
      const overlap = [...targetTokens].filter((t) => itemTokens.has(t)).length;
      const score = overlap / Math.max(1, Math.max(targetTokens.size, itemTokens.size));
      if (!acc || score > acc.score) return { item: item.name, score };
      return acc;
    }, null);

    if (best && best.score > 0) {
      return `No confident match found. Closest candidate: "${best.item}" (low similarity).`;
    }

    return 'No matching inventory product found. Check spelling or product naming.';
  },

  async previewInvoiceStockUpdate(invoiceText, options = {}) {
    if (!invoiceText || !invoiceText.trim()) {
      return {
        matched: [],
        unmatched: [],
        summary: { lines: 0, matchedLines: 0, unmatchedLines: 0, totalQty: 0 }
      };
    }

    const { data: inventory, error } = await supabase
      .from('inventory')
      .select('id,name,current_stock');
    if (error) throw error;

    const { data: toyBoxes, error: toyErr } = await supabase
      .from('toy_box_inventory')
      .select('id,toy_box_number,stock_quantity');
    if (toyErr) throw toyErr;

    const lines = invoiceText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    const manualParsed = options?.preferManualBulk
      ? this.parseManualBulkInvoiceInput(invoiceText)
      : [];

    const groqParsed = manualParsed.length === 0
      ? await this.extractInvoiceItemsWithGroq(invoiceText)
      : null;

    const parsed = (manualParsed && manualParsed.length > 0)
      ? manualParsed
      : (groqParsed && groqParsed.length > 0)
        ? groqParsed
        : lines
          .map((line) => this.parseInvoiceLine(line))
          .filter(Boolean);

    const matched = [];
    const unmatched = [];

    parsed.forEach((row) => {
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

      const toyBoxNum = this.extractToyBoxNumber(row.product);
      if (toyBoxNum != null) {
        const toyBox = (toyBoxes || []).find((b) => Number(b.toy_box_number) === toyBoxNum);
        if (toyBox) {
          matched.push({
            ...row,
            target_type: 'toy_box_inventory',
            target_id: toyBox.id,
            inventory_id: `toybox-${toyBox.id}`,
            inventory_name: `Toy Box #${toyBox.toy_box_number}`,
            current_stock: Number(toyBox.stock_quantity || 0)
          });
          return;
        }
      }

      if (!matchedItem) {
        unmatched.push({
          ...row,
          reason: this.getUnmatchedReason(row, inventory || [], toyBoxes || [])
        });
        return;
      }
    });

    // Aggregate same inventory product from multiple lines
    const aggregatedMap = new Map();
    matched.forEach((m) => {
      const key = `${m.target_type}:${m.target_id}`;
      const prev = aggregatedMap.get(key);
      if (!prev) {
        aggregatedMap.set(key, {
          target_type: m.target_type,
          target_id: m.target_id,
          inventory_id: m.inventory_id,
          inventory_name: m.inventory_name,
          current_stock: m.current_stock,
          quantity: m.quantity,
          lines: [m.sourceLine]
        });
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

  async applyInvoiceStockUpdate(invoiceText, actorName = 'System', options = {}) {
    if (String(options?.confirmCommand || '').trim().toLowerCase() !== 'confirm') {
      throw new Error('Apply blocked: explicit confirm command required. Type "confirm" to proceed.');
    }

    const preview = await this.previewInvoiceStockUpdate(invoiceText, options);
    if (options.dryRun) return preview;

    const applied = [];
    for (const m of preview.matched) {
      const table = m.target_type === 'toy_box_inventory' ? 'toy_box_inventory' : 'inventory';
      const stockCol = table === 'toy_box_inventory' ? 'stock_quantity' : 'current_stock';
      const nameCol = table === 'toy_box_inventory' ? 'toy_box_number' : 'name';

      const { data: latest, error: fetchErr } = await supabase
        .from(table)
        .select(`id,${stockCol},${nameCol}`)
        .eq('id', m.target_id)
        .single();
      if (fetchErr) throw fetchErr;

      const before = Number(latest?.[stockCol] || 0);
      const isAdd = options?.stockMode === 'add';
      const after = isAdd
        ? before + Number(m.quantity || 0)
        : Math.max(0, before - Number(m.quantity || 0));
      const { error: updateErr } = await supabase
        .from(table)
        .update(table === 'toy_box_inventory' ? { stock_quantity: after } : { current_stock: after })
        .eq('id', m.target_id);
      if (updateErr) throw updateErr;

      applied.push({
        id: m.target_id,
        name: table === 'toy_box_inventory' ? `Toy Box #${latest?.[nameCol]}` : (latest?.[nameCol] || m.inventory_name),
        sourceTable: table,
        requestedChange: Number(m.quantity || 0),
        deducted: isAdd ? Number(m.quantity || 0) : before - after,
        before,
        after
      });
    }

    // Note:
    // We intentionally skip writing to `order_activity_logs` here because that table
    // has strict constraints tied to order workflow action types/order ids.
    // Inventory sync is cross-table and may not satisfy those constraints.

    return {
      ...preview,
      applied,
      summary: {
        ...preview.summary,
        appliedItems: applied.length,
        totalDeducted: applied.reduce((sum, a) => sum + Number(a.deducted || 0), 0)
      }
    };
  },

  /**
   * Fetch orders with server-side pagination and filtering
   */
  async getOrders(page = 1, pageSize = 10, filters = {}) {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false })
      .range(from, to);

    if (filters.status && filters.status !== 'All') {
      query = query.eq('status', filters.status);
    }
    if (filters.source && filters.source !== 'All') {
      query = query.eq('source', filters.source);
    }
    if (filters.searchTerm) {
      // Simple text search on ID, customer_name or phone
      query = query.or(`id.ilike.%${filters.searchTerm}%,customer_name.ilike.%${filters.searchTerm}%,phone.ilike.%${filters.searchTerm}%`);
    }
    if (filters.productName) {
      query = query.ilike('product_name', `%${filters.productName}%`);
    }
    if (filters.dateRange?.start && filters.dateRange?.end) {
      query = query.gte('created_at', filters.dateRange.start.toISOString())
        .lte('created_at', filters.dateRange.end.toISOString());
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  /**
   * Get total order count for pagination (optionally filtered)
   */
  async getOrdersCount(filters = {}) {
    let query = supabase
      .from('orders')
      .select('*', { count: 'exact', head: true });

    if (filters.status && filters.status !== 'All') {
      query = query.eq('status', filters.status);
    }
    if (filters.source && filters.source !== 'All') {
      query = query.eq('source', filters.source);
    }
    if (filters.searchTerm) {
      query = query.or(`id.ilike.%${filters.searchTerm}%,customer_name.ilike.%${filters.searchTerm}%,phone.ilike.%${filters.searchTerm}%`);
    }
    if (filters.productName) {
      query = query.ilike('product_name', `%${filters.productName}%`);
    }
    if (filters.dateRange?.start && filters.dateRange?.end) {
      query = query.gte('created_at', filters.dateRange.start.toISOString())
        .lte('created_at', filters.dateRange.end.toISOString());
    }

    const { count, error } = await query;
    if (error) throw error;
    return count || 0;
  },



  /**
   * Create a new order
   * Roles: Admin, Moderator
   */
  async createOrder(orderData, userId, userName, userRoles = []) {
    const hasPermission = userRoles.some(r => ['Admin', 'Moderator'].includes(r));
    if (!hasPermission) throw new Error('Unauthorized: Only Admin or Moderator can create orders.');


    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const orderId = `ORD-${randomSuffix}`;

    const payload = {
      id: orderId,
      customer_name: orderData.customer_name,
      phone: orderData.phone,
      address: orderData.address,
      shipping_zone: orderData.shipping_zone || 'Outside Dhaka',
      product_name: orderData.product_name || orderData.product,
      size: orderData.size,
      quantity: parseInt(orderData.quantity || 1),
      source: orderData.source,
      amount: parseFloat(orderData.amount) || 0,
      status: 'New',
      notes: orderData.notes,
      created_by: userId,
      ordered_items: orderData.ordered_items || []
    };

    const { data, error } = await supabase
      .from('orders')
      .insert([payload])
      .select()
      .single();

    if (error) throw error;

    // Side effects should never fail order creation UX
    try {
      await this.logActivity({
        order_id: data.id,
        action_type: 'CREATE',
        new_status: 'New',
        changed_by_user_id: userId,
        changed_by_user_name: userName,
        action_description: `${userName} created a new order #${data.id}`
      });
    } catch (sideEffectError) {
      console.error('Order creation log failed:', sideEffectError);
    }

    // Notify
    /* 
    try {
      await this.createNotification({
        type: 'ORDER_CREATED',
        title: 'New Order Received',
        message: `Order #${data.id} for ${data.customer_name} has been placed via ${data.source} (${payload.shipping_zone}).`,
        data: {
          orderId: data.id,
          customer: data.customer_name,
          shippingZone: payload.shipping_zone,
          deliveryCharge: Number(orderData.delivery_charge || 0)
        },
        actor_name: userName
      });
    } catch (sideEffectError) {
      console.error('Order creation notification failed:', sideEffectError);
    }
    */

    return data;
  },


  /**
   * Update order details
   * Roles: Admin, Moderator
   */
  async updateOrder(orderId, updatedData, userId, userName, userRoles = []) {
    const hasPermission = userRoles.some(r => ['Admin', 'Moderator'].includes(r));
    if (!hasPermission) throw new Error('Unauthorized: Only Admin or Moderator can update orders.');


    // Get old data for better notification diff
    const { data: oldOrder } = await supabase.from('orders').select('*').eq('id', orderId).single();

    const { data, error } = await supabase
      .from('orders')
      .update(updatedData)
      .eq('id', orderId)
      .select()
      .single();

    if (error) throw error;

    // Determine what changed for notification
    let changeMsg = `Order #${orderId} was updated by ${userName}.`;
    const changes = [];
    if (oldOrder && updatedData) {
      if (updatedData.amount !== undefined && Number(updatedData.amount) !== Number(oldOrder.amount)) {
        changes.push(`Amount: ৳${oldOrder.amount} → ৳${updatedData.amount}`);
      }
      if (updatedData.customer_name && updatedData.customer_name !== oldOrder.customer_name) {
        changes.push(`Name: ${oldOrder.customer_name} → ${updatedData.customer_name}`);
      }
      if (updatedData.address && updatedData.address !== oldOrder.address) {
        changes.push(`Address updated`);
      }
      if (updatedData.phone && updatedData.phone !== oldOrder.phone) {
        changes.push(`Phone updated`);
      }
    }

    if (changes.length > 0) {
      changeMsg = `Order #${orderId} updated by ${userName}: ${changes.join(', ')}`;
    }

    // Log the update
    await this.logActivity({
      order_id: orderId,
      action_type: 'UPDATE',
      changed_by_user_id: userId,
      changed_by_user_name: userName,
      action_description: `${userName} updated the details for order #${orderId}`
    });

    // Notify
    /* 
    await this.createNotification({
      type: 'ORDER_UPDATED',
      title: 'Order Details Modified',
      message: changeMsg,
      data: { orderId, changes },
      actor_name: userName
    });
    */

    return data;
  },


  /**
   * Change order status
   * Roles: Specific per status
   */
  async changeOrderStatus(orderId, newStatus, userId, userName, userRoles = []) {
    const isAdmin = userRoles.includes('Admin');


    // Permission Mapping
    const permissions = {
      'Confirmed': ['Admin', 'Call Team'],
      'Cancelled': ['Admin', 'Call Team'],
      'Processing': ['Admin', 'Factory Team'],
      'Completed': ['Admin', 'Factory Team'],
      'Shipped': ['Admin', 'Courier Team']
    };

    const allowedRoles = permissions[newStatus] || ['Admin'];
    const hasPermission = userRoles.some(r => allowedRoles.includes(r));

    if (!hasPermission) {
      throw new Error(`Unauthorized: Your roles do not allow setting status to "${newStatus}"`);
    }

    // Get old status first for logging
    const { data: oldData } = await supabase.from('orders').select('status, first_call_time').eq('id', orderId).single();

    const updatePayload = { status: newStatus };
    
    // Auto-set first_call_time if a call team or admin confirms/cancels an untouched order
    if (!oldData?.first_call_time && ['Confirmed', 'Cancelled'].includes(newStatus)) {
       updatePayload.first_call_time = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('orders')
      .update(updatePayload)
      .eq('id', orderId)
      .select()
      .single();

    if (error) throw error;

    // Log status change
    await this.logActivity({
      order_id: orderId,
      action_type: 'STATUS_CHANGE',
      old_status: oldData?.status,
      new_status: newStatus,
      changed_by_user_id: userId,
      changed_by_user_name: userName,
      action_description: `${userName} changed the status of order #${orderId} to ${newStatus}`
    });

    // Notify
    /* 
    await this.createNotification({
      type: 'STATUS_CHANGE',
      title: 'Order Status Updated',
      message: `Order #${orderId} changed from "${oldData?.status || 'N/A'}" to "${newStatus}".`,
      data: { orderId, oldStatus: oldData?.status, newStatus },
      actor_name: userName
    });
    */

    return data;
  },

  /**
   * Log a call attempt (No Answer, Busy, etc.)
   * Roles: Admin, Call Team
   */
  async logCallAttempt(orderId, status, userId, userName, userRoles = []) {
    const hasPermission = userRoles.some(r => ['Admin', 'Call Team'].includes(r));
    if (!hasPermission) throw new Error('Unauthorized: Only Admin or Call Team can log call attempts.');

    const { data: oldData } = await supabase
      .from('orders')
      .select('call_attempts, first_call_time')
      .eq('id', orderId)
      .single();

    const newAttempts = (oldData?.call_attempts || 0) + 1;
    const newFirstCallTime = oldData?.first_call_time || new Date().toISOString();

    const { data, error } = await supabase
      .from('orders')
      .update({
        call_attempts: newAttempts,
        last_call_status: status,
        first_call_time: newFirstCallTime
      })
      .eq('id', orderId)
      .select()
      .single();

    if (error) throw error;

    await this.logActivity({
      order_id: orderId,
      action_type: 'UPDATE', // Use UPDATE as it's allowed by DB constraints while providing a specific description
      changed_by_user_id: userId,
      changed_by_user_name: userName,
      action_description: `${userName} logged a call attempt: ${status} (Attempt #${newAttempts})`,
      new_status: 'Pending Call' // Keep the current logical status
    });

    return data;
  },


  /**
   * Add Tracking ID
   * Roles: Admin, Courier Team
   */
  async addTrackingID(orderId, trackingId, userId, userName, userRoles = []) {
    const hasPermission = userRoles.some(r => ['Admin', 'Courier Team'].includes(r));
    if (!hasPermission) throw new Error('Unauthorized: Only Admin or Courier Team can add tracking IDs.');


    const { data, error } = await supabase
      .from('orders')
      .update({ tracking_id: trackingId })
      .eq('id', orderId)
      .select()
      .single();

    if (error) throw error;

    // Log tracking update
    await this.logActivity({
      order_id: orderId,
      action_type: 'UPDATE', 
      changed_by_user_id: userId,
      changed_by_user_name: userName,
      action_description: `${userName} added tracking ID: ${trackingId} to order #${orderId}`
    });

    // Notify
    /* 
    await this.createNotification({
      type: 'TRACKING_ADDED',
      title: 'Tracking ID Added',
      message: `Tracking #${trackingId} added to Order #${orderId}.`,
      data: { orderId, trackingId },
      actor_name: userName
    });
    */

    return data;
  },

  /**
   * Helper to log activity
   */
  async logActivity(logData) {
    const { error } = await supabase
      .from('order_activity_logs')
      .insert([logData]);
    if (error) console.error('Logging error:', error);
  },

  /**
   * Fetch recent activity logs
   */
  async getRecentActivity(limit = 50) {
    const { data, error } = await supabase
      .from('order_activity_logs')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data;
  },

  /**
   * Fetch activity logs for a specific order
   */
  async getOrderActivity(orderId) {
    const { data, error } = await supabase
      .from('order_activity_logs')
      .select('*')
      .eq('order_id', orderId)
      .order('timestamp', { ascending: false });
    if (error) throw error;
    return data;
  },

  /**
   * Fetch a single user's profile + performance summary + recent activity.
   * range: 'today' | '7d' | '30d' | 'all'
   */
  async getUserPerformanceDetails(userId, options = {}) {
    if (!userId) throw new Error('User ID is required.');

    const range = options.range || '7d';
    const limit = options.limit || 20;

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    let startIso = null;
    let endIso = now.toISOString();

    if (range === 'today') {
      startIso = startOfToday.toISOString();
    } else if (range === '7d') {
      const d = new Date(now);
      d.setDate(d.getDate() - 6);
      d.setHours(0, 0, 0, 0);
      startIso = d.toISOString();
    } else if (range === '30d') {
      const d = new Date(now);
      d.setDate(d.getDate() - 29);
      d.setHours(0, 0, 0, 0);
      startIso = d.toISOString();
    } else {
      // all time
      endIso = null;
    }

    // Profile query (schema-agnostic): fetch all and normalize
    const { data: rawProfile, error: profileError } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    if (profileError) throw profileError;

    const profile = rawProfile
      ? {
        id: rawProfile.id,
        name: rawProfile.name || rawProfile.full_name || null,
        full_name: rawProfile.full_name || null,
        email: rawProfile.email || null,
        phone: rawProfile.phone || null,
        status: rawProfile.status,
        is_active: rawProfile.is_active,
        avatar_url: rawProfile.avatar_url || null,
        created_at: rawProfile.created_at || null,
        updated_at: rawProfile.updated_at || null,
        last_active_at: rawProfile.last_active_at || null
      }
      : null;

    // Roles
    let roles = [];
    try {
      const { data: rolesData, error: rolesErr } = await supabase
        .from('user_roles')
        .select('role_id, roles(name)')
        .eq('user_id', userId);

      if (!rolesErr && Array.isArray(rolesData)) {
        roles = rolesData
          .map((r) => r?.roles?.name || r?.role_id)
          .filter(Boolean);
      }
    } catch {
      roles = [];
    }

    // Activity logs (filtered by range)
    let logsQuery = supabase
      .from('order_activity_logs')
      .select('*')
      .eq('changed_by_user_id', userId)
      .order('timestamp', { ascending: false });

    if (startIso) logsQuery = logsQuery.gte('timestamp', startIso);
    if (endIso) logsQuery = logsQuery.lte('timestamp', endIso);

    const { data: logs, error: logsError } = await logsQuery;
    if (logsError) throw logsError;

    const activityLogs = logs || [];
    const recentActivity = activityLogs.slice(0, limit);

    const actionBreakdown = activityLogs.reduce((acc, log) => {
      const key = log.action_type || 'OTHER';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const touchedOrderIds = new Set(activityLogs.map((l) => l.order_id).filter(Boolean));
    const totalAssignedWork = touchedOrderIds.size;

    const doneStatuses = new Set(['Confirmed', 'Factory Processing', 'Completed', 'Shipped']);
    const completionLogs = activityLogs.filter(
      (l) => l.action_type === 'STATUS_CHANGE' && doneStatuses.has(l.new_status)
    );

    const completedOrderIds = new Set(completionLogs.map((l) => l.order_id).filter(Boolean));
    const completedWork = completedOrderIds.size;
    const pendingWork = Math.max(0, totalAssignedWork - completedWork);
    const completionRate = totalAssignedWork > 0
      ? Number(((completedWork / totalAssignedWork) * 100).toFixed(1))
      : 0;

    // Avg completion time: order created_at -> first completion status timestamp by this user
    let avgCompletionTimeHours = null;
    if (completedOrderIds.size > 0) {
      const completionAtByOrder = completionLogs.reduce((acc, l) => {
        const id = l.order_id;
        if (!id) return acc;
        const ts = new Date(l.timestamp).getTime();
        if (!acc[id] || ts < acc[id]) acc[id] = ts;
        return acc;
      }, {});

      const ids = Object.keys(completionAtByOrder);
      if (ids.length > 0) {
        const { data: ordersData } = await supabase
          .from('orders')
          .select('id,created_at')
          .in('id', ids);

        const ordersMap = (ordersData || []).reduce((acc, o) => {
          acc[o.id] = o;
          return acc;
        }, {});

        let totalHours = 0;
        let count = 0;
        ids.forEach((id) => {
          const order = ordersMap[id];
          const completionTs = completionAtByOrder[id];
          const createdTs = order?.created_at ? new Date(order.created_at).getTime() : null;
          if (createdTs && completionTs && completionTs >= createdTs) {
            totalHours += (completionTs - createdTs) / (1000 * 60 * 60);
            count += 1;
          }
        });

        if (count > 0) {
          avgCompletionTimeHours = Number((totalHours / count).toFixed(2));
        }
      }
    }

    // Productivity score (real-data based weighted index)
    const totalActions = activityLogs.length;
    const completionScore = Math.min(55, completionRate * 0.55);
    const volumeScore = Math.min(30, totalActions * 0.6);
    const speedScore = avgCompletionTimeHours == null
      ? 5
      : Math.max(0, 15 - Math.min(15, avgCompletionTimeHours / 4));
    const productivityScore = Math.round(Math.min(100, completionScore + volumeScore + speedScore));

    return {
      user: profile || { id: userId },
      roles,
      range,
      performance: {
        totalAssignedWork,
        completedWork,
        pendingWork,
        completionRate,
        avgCompletionTimeHours,
        productivityScore,
        totalActions,
        actionBreakdown
      },
      recentActivity
    };
  },


  /**
   * Get dashboard statistics
   */
  async getDashboardStats() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const todayStr = now.toDateString();

    // Parallelize all primary queries for maximum performance
    const [
      { count: total }, 
      { data: recentOrders, error: ordersError },
      { data: todayConfirmLogs }
    ] = await Promise.all([
      supabase.from('orders').select('*', { count: 'exact', head: true }),
      supabase.from('orders')
        .select('status, amount, phone, product_name, created_at, updated_at, source')
        .gte('created_at', thirtyDaysAgo.toISOString()),
      supabase.from('order_activity_logs')
        .select('new_status,timestamp,action_type')
        .eq('action_type', 'STATUS_CHANGE')
        .eq('new_status', 'Confirmed')
        .gte('timestamp', todayStart.toISOString())
        .lte('timestamp', todayEnd.toISOString())
    ]);

    if (ordersError) throw ordersError;

    const orders = recentOrders || [];
    
    const successfulStatuses = ['Confirmed', 'Completed', 'Shipped', 'Factory Processing'];
    const completedOrders = orders.filter(o => successfulStatuses.includes(o.status));
    
    // These counts now reflect the last 30 days strictly
    const completed = orders.filter(o => o.status === 'Completed').length;
    const confirmedCount = orders.filter(o => o.status === 'Confirmed').length;
    const cancelledCount = orders.filter(o => o.status === 'Cancelled').length;
    const pending = orders.filter(o => o.status === 'New' || o.status === 'Pending Call').length;
    const processing = orders.filter(o => ['Processing', 'Factory Processing'].includes(o.status)).length;

    // Revenue & AOV
    const revenue = completedOrders.reduce((sum, o) => sum + Number(o.amount || 0), 0);
    const averageOrderValue = total > 0 ? revenue / total : 0;

    // Customers & Products
    const uniquePhones = new Set(orders.map(o => o.phone).filter(Boolean));
    const totalCustomers = uniquePhones.size;

    const uniqueProducts = new Set(orders.map(o => o.product_name).filter(Boolean));
    const totalProducts = uniqueProducts.size;

    const addedTodayCount = orders.filter(o => new Date(o.created_at).toDateString() === todayStr).length;

    const confirmedTodayCount =
      (todayConfirmLogs && Array.isArray(todayConfirmLogs) && todayConfirmLogs.length > 0)
        ? todayConfirmLogs.length
        : orders.filter(o =>
          o.status === 'Confirmed' &&
          new Date(o.updated_at || o.created_at).toDateString() === todayStr
        ).length;

    // Rich Data Calculations
    const sourceMap = orders.reduce((acc, order) => {
      const src = order.source || 'Other';
      acc[src] = (acc[src] || 0) + 1;
      return acc;
    }, {});

    const sourceDistribution = Object.keys(sourceMap).map(key => ({
      name: key,
      value: sourceMap[key],
      color: key === 'Website' ? '#7c4dff' : key === 'Facebook' ? '#2dd4bf' : key === 'Instagram' ? '#3f51b5' : '#94a3b8'
    }));

    const last7Days = [...Array(7)].map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      return d.toLocaleDateString(undefined, { weekday: 'short' });
    }).reverse();

    const trendMap = orders.reduce((acc, order) => {
      const day = new Date(order.created_at).toLocaleDateString(undefined, { weekday: 'short' });
      acc[day] = (acc[day] || 0) + 1;
      return acc;
    }, {});

    const trendData = last7Days.map(day => ({
      name: day,
      orders: trendMap[day] || 0
    }));

    const confirmationData = [
      { name: 'Confirmed', rate: total > 0 ? Math.round((confirmedCount / total) * 100) : 0 },
      { name: 'Cancelled', rate: total > 0 ? Math.round((cancelledCount / total) * 100) : 0 }
    ];

    const result = {
      total, completed, pending, processing, revenue, addedTodayCount, confirmedTodayCount,
      averageOrderValue, totalCustomers, totalProducts, cancelledCount,
      sourceDistribution, trendData, confirmationData
    };

    return result;
  },




  // --- User Management (Admin Only) ---

  async adminCreateUser(userData) {
    const { data, error } = await supabase.functions.invoke('admin-auth-actions', {
      body: { action: 'create-user', userData }
    });

    console.log("DEBUG: adminCreateUser Response", { data, error });

    if (error) throw error;
    if (data?.error) throw new Error(data.error);

    return data;
  },

  async adminResetPassword(userId, newPassword) {
    const { data, error } = await supabase.functions.invoke('admin-auth-actions', {
      body: { 
        action: 'reset-password', 
        userId, 
        password: newPassword 
      }
    });

    if (error) throw error;
    if (data?.error) throw new Error(data.error);

    return data;
  },

  async getUsers() {
    const { data, error } = await supabase
      .from('users')
      .select(`
        id,
        email,
        full_name,
        is_active,
        created_at,
        user_roles (
          role_id,
          roles (
            name
          )
        )
      `);
    if (error) throw error;

    // Flatten roles for easier consumption
    return data.map(user => ({
      ...user,
      roles: user.user_roles.map(ur => ur.roles.name)
    }));
  },

  /**
   * Create a new user (Admin Only)
   */
  async createUser(userData, isAdmin) {
    if (!isAdmin) throw new Error('Unauthorized: Only Admins can create users.');

    // We use common logic for user creation via public table triggers or manual insert
    // Note: auth creation usually happens via supabase.auth.signUp or a custom edge function
    // For this app, we've been inserting into the 'users' table.
    const { data, error } = await supabase
      .from('users')
      .insert([userData])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Update user roles (Admin Only)
   */
  async updateUserRoles(userId, roleIds, isAdmin) {
    if (!isAdmin) throw new Error('Unauthorized: Only Admins can modify roles.');

    // Remove existing
    await supabase.from('user_roles').delete().eq('user_id', userId);

    // Add new
    const inserts = roleIds.map(role_id => ({ user_id: userId, role_id }));
    const { error } = await supabase.from('user_roles').insert(inserts);

    if (error) throw error;
  },

  /**
   * Update user status/profile (Admin Only if not self)
   */
  async updateUserProfile(userId, updates, isAdminOrSelf) {
    if (!isAdminOrSelf) throw new Error('Unauthorized.');

    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();

    if (error) throw error;
  },

  /**
   * Delete user (Admin Only)
   */
  async deleteUser(userId, isAdmin) {
    if (!isAdmin) throw new Error('Unauthorized: Only Admins can delete users.');

    // Delete roles first
    await supabase.from('user_roles').delete().eq('user_id', userId);

    // Delete profile
    const { error } = await supabase
      .from('users')
      .delete()
      .eq('id', userId);

    if (error) throw error;
  },

  // --- Inventory Management ---

  /**
   * Fetch all inventory items
   */
  async getInventory(filters = {}) {
    let query = supabase.from('inventory').select('*').order('name');

    if (filters.category && filters.category !== 'All') {
      query = query.eq('category', filters.category);
    }
    if (filters.searchTerm) {
      query = query.or(`name.ilike.%${filters.searchTerm}%,sku.ilike.%${filters.searchTerm}%`);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  /**
   * Create new product in inventory
   */
  async createInventoryItem(itemData) {
    const { data, error } = await supabase
      .from('inventory')
      .insert([itemData])
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  /**
   * Update product details
   */
  async updateInventoryItem(id, updates) {
    const { data, error } = await supabase
      .from('inventory')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  /**
   * Adjust stock levels directly
   */
  async adjustStock(id, quantityChange) {
    // We use a RPC or fetch-then-update since Supabase doesn't have an atomic increment in JS directly without RPC
    // But for simplicity in this MVP, we'll fetch and update
    const { data: item, error: fetchError } = await supabase
      .from('inventory')
      .select('current_stock')
      .eq('id', id)
      .single();

    if (fetchError) throw fetchError;

    const newStock = (item.current_stock || 0) + quantityChange;

    const { data, error } = await supabase
      .from('inventory')
      .update({ current_stock: newStock })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Delete product from inventory
   */
  async deleteInventoryItem(id) {
    const { error } = await supabase
      .from('inventory')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  /**
   * Sync stock for a specific product based on name
   * Call this when an order is confirmed to deduct stock
   */
  async deductStockByProductName(productName, quantity = 1) {
    const { data: items, error: fetchError } = await supabase
      .from('inventory')
      .select('id, current_stock')
      .eq('name', productName)
      .limit(1);

    if (fetchError) throw fetchError;
    if (!items || items.length === 0) return null;

    const item = items[0];
    const newStock = Math.max(0, (item.current_stock || 0) - quantity);

    const { data, error } = await supabase
      .from('inventory')
      .update({ current_stock: newStock })
      .eq('id', item.id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // --- Notification Management ---

  /**
   * Fetch latest notifications for the admin
   */
  async getNotifications(limit = 20) {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data;
  },

  /**
   * Mark a single notification as read
   */
  async markNotificationRead(id) {
    const { data, error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Mark all notifications as read
   */
  async markAllNotificationsRead() {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('is_read', false);

    if (error) throw error;
  },

  /**
   * Delete all notifications permanently
   */
  async deleteAllNotifications() {
    const { error } = await supabase
      .from('notifications')
      .delete()
      .not('id', 'is', null); // The most robust "delete all" filter for Supabase

    if (error) throw error;
  },

  /**
   * Internal helper to create a notification
   */
  async createNotification(notifData) {
    const { data, error } = await supabase
      .from('notifications')
      .insert([notifData])
      .select()
      .single();

    if (error) throw error;

    // Emit broadcast for real-time popups
    try {
      await supabase
        .channel('admin_notifications_realtime')
        .send({
          type: 'broadcast',
          event: 'new_notification',
          payload: data
        });
    } catch (broadcastError) {
      console.error('Real-time broadcast failed:', broadcastError);
    }

    return data;
  },

  // --- Toy Box Management ---

  /**
   * Fetch all toy box inventory
   */
  async getToyBoxInventory() {
    const { data, error } = await supabase
      .from('toy_box_inventory')
      .select('*')
      .order('toy_box_number', { ascending: true });

    if (error) throw error;
    return data;
  },

  /**
   * Update stock for a specific toy box
   */
  async updateToyBoxStock(id, newStock) {
    const { data, error } = await supabase
      .from('toy_box_inventory')
      .update({ stock_quantity: newStock, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Run the automatic distribution engine
   */
  async runAutoDistribution() {
    const { data, error } = await supabase
      .rpc('auto_distribute_orders');

    if (error) throw error;
    return data;
  },

  /**
   * FULL / SCOPED SYSTEM RESET (Admin Only)
   * scope: 'all' | 'date-range'
   * dateRange: { start: Date|string, end: Date|string }
   */
  async resetSystem(isAdmin, options = {}) {
    if (!isAdmin) throw new Error('Unauthorized: Only Admins can reset the system.');

    const scope = options.scope || 'all';
    const dateRange = options.dateRange || {};

    try {
      if (scope === 'all') {
        const { error: ordersErr } = await supabase.from('orders').delete().not('id', 'is', null);
        const { error: logsErr } = await supabase.from('order_activity_logs').delete().not('id', 'is', null);
        const { error: notifsErr } = await supabase.from('notifications').delete().not('id', 'is', null);
        if (ordersErr || logsErr || notifsErr) throw new Error('Full reset failed.');
      } else if (scope === 'date-range' && dateRange.start && dateRange.end) {
        const start = new Date(dateRange.start).toISOString();
        const end = new Date(dateRange.end).toISOString();
        await supabase.from('orders').delete().gte('created_at', start).lte('created_at', end);
        await supabase.from('order_activity_logs').delete().gte('timestamp', start).lte('timestamp', end);
        await supabase.from('notifications').delete().gte('created_at', start).lte('created_at', end);
      }
      return { success: true };
    } catch (err) {
      console.error('Reset error:', err);
      throw err;
    }
  },

  /**
   * Dispatch an order to the integrated courier (Steadfast)
   */
  async dispatchToCourier(orderId) {
    const { data: { session } } = await supabase.auth.getSession();
    const { data, error } = await supabase.functions.invoke('courier-api', {
      body: { orderId }
    });

    if (error) {
      console.error('Courier Dispatch Error:', error);
      throw error;
    }

    // Capture metadata on success
    // The Edge Function returns { success, trackingCode, consignmentId, details }
    const consignmentId = data?.consignmentId || data?.details?.consignment?.consignment_id || data?.details?.id;
    const trackingCode = data?.trackingCode || data?.details?.consignment?.tracking_code || data?.details?.tracking_code;
    const courierStatus = data?.details?.consignment?.status || data?.details?.status || 'pending';
    
    // The Edge Function already updates the database, but we perform a 
    // client-side sync update here to be absolutely sure and handle any race conditions.
    const { error: updateError } = await supabase
      .from('orders')
      .update({
        dispatched_at: new Date().toISOString(),
        courier_name: 'Steadfast',
        tracking_id: trackingCode || null,
        courier_assigned_id: consignmentId ? String(consignmentId) : null,
        courier_status: courierStatus,
        status: 'Courier Submitted'
      })
      .eq('id', orderId);

    if (updateError) {
      console.error('Failed to update dispatch metadata:', updateError);
    }

    return data;
  },

  /**
   * Get the real-time status of a Steadfast parcel
   */
  async getSteadfastStatus(orderId, trackingCode) {
    const { data, error } = await supabase.functions.invoke('courier-status', {
      body: { orderId, trackingCode }
    });

    if (error) {
      console.error('Steadfast Status Error:', error);
      throw error;
    }

    // Auto-backfill Consignment ID if it exists and is missing in our system
    const consignmentId = data?.consignment_id || data?.id;
    if (consignmentId) {
      await supabase
        .from('orders')
        .update({ courier_assigned_id: String(consignmentId) })
        .eq('id', orderId)
        .is('courier_assigned_id', null);
    }

    return data;
  },

  /**
   * Check customer delivery success ratio via Steadfast Fraud Check API
   */
  async checkCustomerRatio(phone) {
    if (!phone) return null;
    const { data, error } = await supabase.functions.invoke('courier-ratio-check', {
      body: { phone }
    });

    if (error) {
      console.error('Ratio Check Error:', error);
      return null;
    }
    return data;
  },

  /**
   * Get system configurations (e.g., courier settings)
   */
  async getSystemConfig(key) {
    const { data, error } = await supabase
      .from('system_configs')
      .select('value')
      .eq('key', key)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data?.value || null;
  },

  /**
   * Update system configurations
   */
  async updateSystemConfig(key, value) {
    const { data, error } = await supabase
      .from('system_configs')
      .upsert({ key, value, updated_at: new Date().toISOString() })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // ──────────────────────────────────────────────
  // TASK MANAGEMENT
  // ──────────────────────────────────────────────
  async logTaskActivity(taskId, taskType, actionType, actionDescription, oldStatus = null, newStatus = null) {
    try {
      const { data: userSession } = await supabase.auth.getSession();
      const userId = userSession?.session?.user?.id;
      
      let userName = 'System';
      if (userId) {
        const { data: profile } = await supabase.from('users').select('name').eq('id', userId).single();
        if (profile?.name) userName = profile.name;
      }

      await supabase.from('task_activity_logs').insert({
        task_id: taskId,
        task_type: taskType,
        user_id: userId,
        user_name: userName,
        action_type: actionType,
        action_description: actionDescription,
        old_status: oldStatus,
        new_status: newStatus
      });
    } catch (e) {
      console.error('Failed to log task activity:', e);
    }
  },

  async getTaskLogs(taskId) {
    const { data, error } = await supabase
      .from('task_activity_logs')
      .select('*')
      .eq('task_id', taskId)
      .order('timestamp', { ascending: false });
    
    if (error) throw error;
    return data || [];
  },

  /** Daily Tasks */
  async getDailyTasks() {
    const { data, error } = await supabase
      .from('daily_tasks')
      .select('*')
      .eq('is_active', true)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async createDailyTask(taskData) {
    const { data, error } = await supabase
      .from('daily_tasks')
      .insert(taskData)
      .select()
      .single();
    if (error) throw error;
    
    await this.logTaskActivity(
      data.id, 'daily', 'CREATE', 
      `Daily Task created: "${taskData.title}"`
    );
    
    return data;
  },

  async updateDailyTask(taskId, updates) {
    const { data, error } = await supabase
      .from('daily_tasks')
      .update(updates)
      .eq('id', taskId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async deleteDailyTask(taskId) {
    const { error } = await supabase
      .from('daily_tasks')
      .delete()
      .eq('id', taskId);
    if (error) throw error;
  },

  /** Task Completions */
  async getDailyCompletions(date) {
    const dateStr = date || new Date().toISOString().split('T')[0];
    const { data, error } = await supabase
      .from('task_completions')
      .select('*')
      .eq('completion_date', dateStr);
    if (error) throw error;
    return data || [];
  },

  async completeDailyTask(dailyTaskId, userId, userName, notes = '') {
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase
      .from('task_completions')
      .insert({
        daily_task_id: dailyTaskId,
        completed_by: userId,
        completed_by_name: userName,
        completion_date: today,
        notes
      })
      .select()
      .single();
    if (error) throw error;
    
    await this.logTaskActivity(
      dailyTaskId, 'daily', 'STATUS_CHANGE', 
      'Marked as Completed for today', 
      'Pending', 'Completed'
    );
    
    return data;
  },

  async uncompleteDailyTask(dailyTaskId) {
    const today = new Date().toISOString().split('T')[0];
    const { error } = await supabase
      .from('task_completions')
      .delete()
      .eq('daily_task_id', dailyTaskId)
      .eq('completion_date', today);
    if (error) throw error;
    
    await this.logTaskActivity(
      dailyTaskId, 'daily', 'STATUS_CHANGE', 
      'Marked as Pending for today', 
      'Completed', 'Pending'
    );
  },

  /** Assigned Tasks */
  async getAssignedTasks(userId, isAdmin) {
    let query = supabase
      .from('assigned_tasks')
      .select('*')
      .order('created_at', { ascending: false });

    if (!isAdmin && userId) {
      query = query.or(`assigned_to.eq.${userId},assigned_by.eq.${userId}`);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  async createAssignedTask(taskData, userId, userName) {
    const { data, error } = await supabase
      .from('assigned_tasks')
      .insert({
        ...taskData,
        assigned_by: userId,
        assigned_by_name: userName
      })
      .select()
      .single();
    if (error) throw error;

    await this.logTaskActivity(
      data.id, 'assigned', 'CREATE', 
      `Assigned task created for ${taskData.assigned_to_name || 'user'}`
    );

    // Notify the assigned user
    try {
      /* 
      await this.createNotification({
        type: 'TASK_ASSIGNED',
        title: 'New Task Assigned',
        message: `${userName} assigned a new task: "${data.title}"`,
        actor_name: userName,
        target_user_id: data.assigned_to,
        data: {
          taskId: data.id,
          priority: data.priority,
          dueDate: data.due_date
        }
      });
      */
    } catch (notifError) {
      console.error('Failed to send task notification:', notifError);
    }

    return data;
  },

  async updateAssignedTask(taskId, updates, userId, userName) {
    // Get old data for smart notifications
    const { data: oldTask } = await supabase
      .from('assigned_tasks')
      .select('*')
      .eq('id', taskId)
      .single();

    if (updates.status === 'completed') {
      updates.completed_at = new Date().toISOString();
    }
    const { data, error } = await supabase
      .from('assigned_tasks')
      .update(updates)
      .eq('id', taskId)
      .select()
      .single();
    if (error) throw error;

    // Log Activity
    if (updates.status) {
       await this.logTaskActivity(
        taskId, 'assigned', 'STATUS_CHANGE',
        `Status updated to ${updates.status.replace('_', ' ')}`,
        oldTask?.status, updates.status
      );
    } else {
       await this.logTaskActivity(taskId, 'assigned', 'UPDATE', 'Task details updated');
    }

    // Trigger Notification if status changed
    if (updates.status && oldTask && updates.status !== oldTask.status) {
      try {
        const isAssigneeUpdating = userId === oldTask.assigned_to;
        const targetUserId = isAssigneeUpdating ? oldTask.assigned_by : oldTask.assigned_to;
        const targetRole = isAssigneeUpdating ? 'Assigner' : 'Assignee';

        /* 
        await this.createNotification({
          type: 'TASK_UPDATED',
          title: `Task ${updates.status.replace('_', ' ')}`,
          message: `${userName} updated task "${data.title}" to ${updates.status.replace('_', ' ')}`,
          actor_name: userName,
          target_user_id: targetUserId,
          data: {
            taskId: data.id,
            newStatus: updates.status,
            oldStatus: oldTask.status,
            targetRole
          }
        });
        */
      } catch (notifErr) {
        console.error('Task update notification failed:', notifErr);
      }
    }

    return data;
  },

  async deleteAssignedTask(taskId) {
    const { error } = await supabase
      .from('assigned_tasks')
      .delete()
      .eq('id', taskId);
    if (error) throw error;
  },

  // --- Push Notifications ---
  async savePushSubscription(userId, subscription, platform = 'desktop') {
    // Check if subscription already exists for this endpoint to avoid duplicates
    const endpoint = subscription.endpoint;
    const { data: existing } = await supabase
      .from('user_push_subscriptions')
      .select('id')
      .eq('user_id', userId)
      .filter('subscription->>endpoint', 'eq', endpoint)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from('user_push_subscriptions')
        .update({ 
          subscription, 
          pwa_platform: platform,
          last_synced_at: new Date().toISOString() 
        })
        .eq('id', existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('user_push_subscriptions')
        .insert([{ 
          user_id: userId, 
          subscription, 
          pwa_platform: platform 
        }]);
      if (error) throw error;
    }
  },

  async deletePushSubscription(endpoint) {
    const { error } = await supabase
      .from('user_push_subscriptions')
      .delete()
      .filter('subscription->>endpoint', 'eq', endpoint);
    if (error) throw error;
  }
};

export default api;
