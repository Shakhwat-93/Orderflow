import { createClient } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { extractInvoiceItems, extractOrder } from '../services/aiProxy';

/**
 * SECURE API SERVICE LAYER
 * Centralized functions for database interactions with permission checks.
 */

// --- Order Management ---

export const api = {
  orderModernColumnsState: null,
  courierRatioCacheTableState: null,
  // Use a getter/setter or just handle it in the methods to persist the column state
  getToyBoxProductNameColumnState() {
    if (this._toyBoxProductNameColumnState !== undefined) return this._toyBoxProductNameColumnState;
    const cached = localStorage.getItem('of_toybox_pname_state');
    if (cached === 'true') return (this._toyBoxProductNameColumnState = true);
    if (cached === 'false') return (this._toyBoxProductNameColumnState = false);
    return (this._toyBoxProductNameColumnState = null);
  },
  setToyBoxProductNameColumnState(val) {
    this._toyBoxProductNameColumnState = val;
    localStorage.setItem('of_toybox_pname_state', String(val));
  },

  isMissingColumnError(error, columnName = '') {
    const message = [
      error?.message,
      error?.details,
      error?.hint
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (!message) return false;
    if (!columnName) {
      return (
        (message.includes('column') && message.includes('does not exist')) ||
        (message.includes('column') && message.includes('could not find')) ||
        (String(error?.code || '').toUpperCase() === 'PGRST204' && message.includes('schema cache'))
      );
    }
    const normalizedColumn = String(columnName).toLowerCase();
    return (
      message.includes(normalizedColumn) &&
      (
        (message.includes('column') && message.includes('does not exist')) ||
        (message.includes('column') && message.includes('could not find')) ||
        (String(error?.code || '').toUpperCase() === 'PGRST204' && message.includes('schema cache'))
      )
    );
  },

  isMissingTableError(error, tableName = '') {
    const message = [
      error?.message,
      error?.details,
      error?.hint
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (!message) return false;
    const normalizedTable = String(tableName || '').toLowerCase();
    return (
      String(error?.code || '').toUpperCase() === 'PGRST205' ||
      (message.includes('schema cache') && (!normalizedTable || message.includes(normalizedTable))) ||
      (message.includes('could not find the table') && (!normalizedTable || message.includes(normalizedTable))) ||
      (message.includes('relation') && message.includes('does not exist') && (!normalizedTable || message.includes(normalizedTable)))
    );
  },

  isMissingFunctionError(error, functionName = '') {
    const message = [
      error?.message,
      error?.details,
      error?.hint
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    if (!message) return false;

    const normalizedFunction = String(functionName || '').toLowerCase();
    return (
      String(error?.code || '').toUpperCase() === 'PGRST202' ||
      (message.includes('function') && message.includes('does not exist') && (!normalizedFunction || message.includes(normalizedFunction))) ||
      (message.includes('could not find the function') && (!normalizedFunction || message.includes(normalizedFunction)))
    );
  },

  normalizeIpAddress(value = '') {
    return String(value || '').trim().toLowerCase();
  },

  normalizePhone(value = '') {
    return String(value || '')
      .replace(/\D/g, '')
      .replace(/^88/, '')
      .trim();
  },

  toFiniteNumber(...values) {
    for (const value of values) {
      const numeric = Number(value);
      if (Number.isFinite(numeric)) return numeric;
    }
    return null;
  },

  normalizeCourierRatioValue(value, total = 0, successCount = 0) {
    const direct = this.toFiniteNumber(value);
    if (direct != null) {
      return Math.max(0, Math.min(100, Number(direct.toFixed(2))));
    }

    if (Number(total) > 0) {
      return Math.max(0, Math.min(100, Number((((Number(successCount) || 0) / Number(total)) * 100).toFixed(2))));
    }

    return 0;
  },

  inferCourierRiskLevel(total = 0, ratio = 0, explicitRisk = '') {
    const normalizedExplicit = String(explicitRisk || '').trim().toLowerCase();
    if (normalizedExplicit) return normalizedExplicit;
    if (Number(total) <= 0) return 'new';
    if (Number(ratio) >= 70) return 'high';
    if (Number(ratio) >= 40) return 'medium';
    return 'low';
  },

  normalizeCourierRatioPayload(result = {}, phone = '') {
    const normalizedPhone = this.normalizePhone(phone || result?.phone);
    const primaryPayload =
      (result?.stats?.data && typeof result.stats.data === 'object' && !Array.isArray(result.stats.data) && result.stats.data) ||
      (result?.stats && typeof result.stats === 'object' && !Array.isArray(result.stats) && result.stats) ||
      (result?.data && typeof result.data === 'object' && !Array.isArray(result.data) && result.data) ||
      (typeof result === 'object' && !Array.isArray(result) ? result : {});

    const total = Math.max(0, Math.round(this.toFiniteNumber(
      primaryPayload.total,
      primaryPayload.total_parcel,
      primaryPayload.total_parcels,
      primaryPayload.total_orders,
      primaryPayload.total_count,
      result?.total
    ) || 0));

    const successCount = Math.max(0, Math.round(this.toFiniteNumber(
      primaryPayload.success_count,
      primaryPayload.success_parcel,
      primaryPayload.success_parcels,
      primaryPayload.delivered_count,
      primaryPayload.completed_count,
      result?.success_count
    ) || 0));

    const cancelled = Math.max(0, Math.round(this.toFiniteNumber(
      primaryPayload.cancelled,
      primaryPayload.cancelled_count,
      primaryPayload.cancel_count,
      primaryPayload.cancel_parcel,
      primaryPayload.cancelled_parcel,
      result?.cancelled
    ) || 0));

    const ratio = this.normalizeCourierRatioValue(
      this.toFiniteNumber(
        primaryPayload.ratio,
        primaryPayload.success_ratio,
        primaryPayload.delivery_ratio,
        result?.ratio
      ),
      total,
      successCount
    );

    const couriersSource =
      primaryPayload.couriers ||
      primaryPayload.courier_stats ||
      primaryPayload.courier_breakdown ||
      primaryPayload.breakdown ||
      result?.couriers ||
      {};

    const couriers = (couriersSource && typeof couriersSource === 'object' && !Array.isArray(couriersSource))
      ? couriersSource
      : {};

    const riskLevel = this.inferCourierRiskLevel(
      total,
      ratio,
      primaryPayload.riskLevel || primaryPayload.risk_level || result?.riskLevel || result?.risk_level
    );

    return {
      phone: normalizedPhone,
      total,
      success_count: successCount,
      cancelled,
      ratio,
      riskLevel,
      couriers,
      raw: result
    };
  },

  hydrateCourierRatioCacheRecord(record = {}) {
    return {
      loading: record.fetch_status === 'pending',
      fetched: record.fetch_status === 'completed' || record.fetch_status === 'failed',
      error: record.fetch_status === 'failed',
      total: Number(record.total || 0),
      success_count: Number(record.success_count || 0),
      cancelled: Number(record.cancelled || 0),
      ratio: Number(record.ratio || 0),
      riskLevel: record.risk_level || 'new',
      couriers: (record.couriers && typeof record.couriers === 'object' && !Array.isArray(record.couriers)) ? record.couriers : {},
      raw: record.raw || null,
      fetchedAt: record.fetched_at || null,
      updatedAt: record.updated_at || null,
      phone: record.phone || '',
      source: record.source || 'steadfast'
    };
  },

  async getCourierRatioCache(phone) {
    const normalizedPhone = this.normalizePhone(phone);
    if (!normalizedPhone || this.courierRatioCacheTableState === false) return null;

    const { data, error } = await supabase
      .from('courier_ratio_cache')
      .select('*')
      .eq('phone', normalizedPhone)
      .limit(1);

    if (error) {
      if (this.isMissingTableError(error, 'courier_ratio_cache')) {
        this.courierRatioCacheTableState = false;
        return null;
      }
      throw error;
    }

    this.courierRatioCacheTableState = true;
    const row = Array.isArray(data) ? data[0] : data;
    return row ? this.hydrateCourierRatioCacheRecord(row) : null;
  },

  async getCourierRatioCacheBatch(phones = []) {
    const normalizedPhones = [...new Set((phones || []).map((phone) => this.normalizePhone(phone)).filter(Boolean))];
    if (normalizedPhones.length === 0 || this.courierRatioCacheTableState === false) return {};

    const { data, error } = await supabase
      .from('courier_ratio_cache')
      .select('*')
      .in('phone', normalizedPhones);

    if (error) {
      if (this.isMissingTableError(error, 'courier_ratio_cache')) {
        this.courierRatioCacheTableState = false;
        return {};
      }
      throw error;
    }

    this.courierRatioCacheTableState = true;
    return Object.fromEntries((data || []).map((row) => [row.phone, this.hydrateCourierRatioCacheRecord(row)]));
  },

  async claimCourierRatioLookup(phone) {
    const normalizedPhone = this.normalizePhone(phone);
    if (!normalizedPhone) return false;
    if (this.courierRatioCacheTableState === false) return true;

    const { data, error } = await supabase.rpc('claim_courier_ratio_lookup', {
      phone_input: normalizedPhone
    });

    if (error) {
      if (
        this.isMissingTableError(error, 'courier_ratio_cache') ||
        this.isMissingFunctionError(error, 'claim_courier_ratio_lookup')
      ) {
        this.courierRatioCacheTableState = false;
        return true;
      }
      throw error;
    }

    this.courierRatioCacheTableState = true;
    return Boolean(data);
  },

  async waitForCourierRatioCache(phone, attempts = 4, delayMs = 900) {
    const normalizedPhone = this.normalizePhone(phone);
    if (!normalizedPhone) return null;

    for (let index = 0; index < attempts; index += 1) {
      const cached = await this.getCourierRatioCache(normalizedPhone);
      if (!cached) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
      if (cached.fetched || !cached.loading) {
        return cached;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    return this.getCourierRatioCache(normalizedPhone);
  },

  async saveCourierRatioCache(phone, result, fetchStatus = 'completed') {
    const normalizedPayload = this.normalizeCourierRatioPayload(result, phone);
    if (!normalizedPayload.phone || this.courierRatioCacheTableState === false) return null;

    const isCompleted = fetchStatus === 'completed';
    const nowIso = new Date().toISOString();
    const payload = {
      phone: normalizedPayload.phone,
      total: normalizedPayload.total,
      success_count: normalizedPayload.success_count,
      cancelled: normalizedPayload.cancelled,
      ratio: normalizedPayload.ratio,
      risk_level: normalizedPayload.riskLevel,
      couriers: normalizedPayload.couriers || {},
      raw: normalizedPayload.raw || result || null,
      fetch_status: fetchStatus,
      source: 'steadfast',
      fetched_at: isCompleted ? nowIso : null,
      updated_at: nowIso
    };

    const { data, error } = await supabase
      .from('courier_ratio_cache')
      .upsert(payload, { onConflict: 'phone' })
      .select('*')
      .maybeSingle();

    if (error) {
      if (this.isMissingTableError(error, 'courier_ratio_cache')) {
        this.courierRatioCacheTableState = false;
        return null;
      }
      throw error;
    }

    this.courierRatioCacheTableState = true;
    return data ? this.hydrateCourierRatioCacheRecord(data) : this.hydrateCourierRatioCacheRecord(payload);
  },

  async markCourierRatioCacheFailed(phone, errorMessage = 'Courier ratio check failed') {
    return this.saveCourierRatioCache(phone, {
      success: false,
      error: String(errorMessage || 'Courier ratio check failed')
    }, 'failed');
  },

  shouldUseAuthSignupFallback(error) {
    const message = [
      error?.message,
      error?.details,
      error?.hint,
      error?.context?.msg
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return (
      message.includes('failed to send a request to the edge function') ||
      message.includes('failed to fetch') ||
      message.includes('cors') ||
      message.includes('not found') ||
      message.includes('requested function was not found')
    );
  },

  shouldBlockAdminSignupFallback(error) {
    const message = [
      error?.message,
      error?.name,
      error?.context?.message
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return (
      message.includes('failed to send a request to the edge function') ||
      message.includes('failed to fetch') ||
      message.includes('cors') ||
      message.includes('not found') ||
      message.includes('requested function was not found')
    );
  },

  createIsolatedSignupClient() {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Missing Supabase environment variables.');
    }

    return createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    });
  },

  async adminCreateUserViaSignup(userData) {
    const signupClient = this.createIsolatedSignupClient();
    const normalizedEmail = String(userData?.email || '').trim().toLowerCase();
    const displayName = String(userData?.name || normalizedEmail.split('@')[0] || 'Team Member').trim();
    const roleId = String(userData?.role || 'Call Team').trim() || 'Call Team';

    try {
      const { data: signupData, error: signupError } = await signupClient.auth.signUp({
        email: normalizedEmail,
        password: userData?.password,
        options: {
          data: {
            name: displayName
          }
        }
      });

      if (signupError) throw signupError;

      const createdUser = signupData?.user;
      if (!createdUser?.id) {
        throw new Error('User account was not created.');
      }

      const profilePayload = {
        id: createdUser.id,
        name: displayName,
        email: normalizedEmail,
        status: 'active'
      };

      let { error: profileError } = await signupClient
        .from('users')
        .upsert(profilePayload, { onConflict: 'id' });

      if (profileError) {
        const adminProfileWrite = await supabase
          .from('users')
          .upsert(profilePayload, { onConflict: 'id' });
        profileError = adminProfileWrite.error;
      }

      if (profileError) throw profileError;

      let { error: roleError } = await supabase
        .from('user_roles')
        .insert({
          user_id: createdUser.id,
          role_id: roleId
        });

      if (roleError) {
        const signupRoleWrite = await signupClient
          .from('user_roles')
          .insert({
            user_id: createdUser.id,
            role_id: roleId
          });
        roleError = signupRoleWrite.error;
      }

      if (roleError) throw roleError;

      return {
        success: true,
        user: createdUser,
        fallbackUsed: true
      };
    } finally {
      await signupClient.auth.signOut();
    }
  },

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
    return extractInvoiceItems(invoiceText);
  },

  async extractOrderWithAI(rawText) {
    return extractOrder(rawText);
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

  getToyBoxProductName(toyBox = {}) {
    return String(toyBox?.product_name || 'TOY BOX').trim();
  },

  hasUnsupportedOrderModernColumns(error) {
    return (
      this.isMissingColumnError(error, 'delivery_charge') ||
      this.isMissingColumnError(error, 'pricing_summary') ||
      this.isMissingColumnError(error, 'order_lines_payload')
    );
  },

  inferOrderModernColumnsState(orders = []) {
    if (this.orderModernColumnsState !== null) return;
    if (!Array.isArray(orders) || orders.length === 0) return;

    const sample = orders.find(Boolean);
    if (!sample) return;

    const hasModernColumns =
      Object.prototype.hasOwnProperty.call(sample, 'delivery_charge') &&
      Object.prototype.hasOwnProperty.call(sample, 'pricing_summary') &&
      Object.prototype.hasOwnProperty.call(sample, 'order_lines_payload');

    this.orderModernColumnsState = hasModernColumns;
  },

  stripUnsupportedOrderModernFields(payload = {}) {
    const fallbackPayload = { ...payload };
    delete fallbackPayload.delivery_charge;
    delete fallbackPayload.pricing_summary;
    delete fallbackPayload.order_lines_payload;
    return fallbackPayload;
  },

  attachOrderModernFields(payload = {}, orderData = {}) {
    if (this.orderModernColumnsState === false) {
      return this.stripUnsupportedOrderModernFields(payload);
    }

    return {
      ...payload,
      delivery_charge: Number(orderData.delivery_charge) || 0,
      pricing_summary: orderData.pricing_summary || null,
      order_lines_payload: orderData.order_lines_payload || orderData.ordered_items || []
    };
  },

  normalizeToyBoxInventoryRow(toyBox = {}) {
    return {
      ...toyBox,
      product_name: this.getToyBoxProductName(toyBox)
    };
  },

  normalizeToyBoxInventoryRows(toyBoxes = []) {
    return (toyBoxes || []).map((toyBox) => this.normalizeToyBoxInventoryRow(toyBox));
  },

  async getToyBoxInventoryRow(id) {
    const state = this.getToyBoxProductNameColumnState();
    const columns = state === false
      ? 'id,toy_box_number,stock_quantity,updated_at'
      : 'id,toy_box_number,stock_quantity,updated_at,product_name';

    let { data, error } = await supabase
      .from('toy_box_inventory')
      .select(columns)
      .eq('id', id)
      .single();

    if (error && state === null && this.isMissingColumnError(error, 'product_name')) {
      this.setToyBoxProductNameColumnState(false);
      ({ data, error } = await supabase
        .from('toy_box_inventory')
        .select('id,toy_box_number,stock_quantity,updated_at')
        .eq('id', id)
        .single());
    } else if (!error && state === null) {
      this.setToyBoxProductNameColumnState(true);
    }

    if (error) throw error;
    return this.normalizeToyBoxInventoryRow(data);
  },

  matchToyBoxInventory(productText = '', toyBoxes = []) {
    const toyBoxNum = this.extractToyBoxNumber(productText);
    if (toyBoxNum == null) return null;

    const candidates = (toyBoxes || []).filter((b) => Number(b.toy_box_number) === toyBoxNum);
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return { match: candidates[0], ambiguous: false };

    const normalizedText = this.normalizeText(productText).replace(/\s+/g, '');
    const explicitMatch = candidates.find((candidate) =>
      normalizedText.includes(this.normalizeText(this.getToyBoxProductName(candidate)).replace(/\s+/g, ''))
    );

    if (explicitMatch) {
      return { match: explicitMatch, ambiguous: false };
    }

    return { match: null, ambiguous: true, candidates };
  },

  getUnmatchedReason(row, inventory = [], toyBoxes = []) {
    const normalized = this.normalizeText(row?.product || '');
    if (!normalized) return 'Could not detect a valid product name in this line.';

    const toyBoxResult = this.matchToyBoxInventory(row?.product || '', toyBoxes || []);
    if (toyBoxResult?.ambiguous) {
      return `Serial #${this.extractToyBoxNumber(row?.product || '')} exists for multiple products. Mention the full product name.`;
    }

    const toyBoxNum = this.extractToyBoxNumber(row?.product || '');
    if (toyBoxNum != null && !toyBoxResult?.match) {
        return `Toy Box #${toyBoxNum} was not found in toy box inventory.`;
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

    const toyBoxes = await this.getToyBoxInventory();

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

      const toyBoxResult = this.matchToyBoxInventory(row.product, toyBoxes || []);
      if (toyBoxResult?.match) {
        const toyBox = toyBoxResult.match;
          matched.push({
            ...row,
            target_type: 'toy_box_inventory',
            target_id: toyBox.id,
            inventory_id: `toybox-${toyBox.id}`,
            inventory_name: `${this.getToyBoxProductName(toyBox)} #${toyBox.toy_box_number}`,
            current_stock: Number(toyBox.stock_quantity || 0)
          });
          return;
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
      const latest = table === 'toy_box_inventory'
        ? await this.getToyBoxInventoryRow(m.target_id)
        : await (async () => {
            const { data, error } = await supabase
              .from(table)
              .select(`id,${stockCol},name`)
              .eq('id', m.target_id)
              .single();
            if (error) throw error;
            return data;
          })();

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
        name: table === 'toy_box_inventory'
          ? `${this.getToyBoxProductName(latest)} #${latest?.toy_box_number}`
          : (latest?.name || m.inventory_name),
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
    const { data } = await this.getOrdersWithCount(page, pageSize, filters);
    return data;
  },

  /**
   * Fetch orders and exact count in one network round-trip.
   */
  async getOrdersWithCount(page = 1, pageSize = 10, filters = {}) {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from('orders')
      .select('*', { count: 'exact' })
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

    const { data, error, count } = await query;
    if (error) throw error;
    this.inferOrderModernColumnsState(data);
    return { data: data || [], count: count || 0 };
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

  async getOrderProductBreakdown(filters = {}, limit = 2000) {
    const batchSize = 1000;
    const rows = [];
    let from = 0;

    while (rows.length < limit) {
      let query = supabase
        .from('orders')
        .select('product_name')
        .order('created_at', { ascending: false })
        .range(from, from + batchSize - 1);

      if (filters.status && filters.status !== 'All') {
        query = query.eq('status', filters.status);
      }
      if (filters.source && filters.source !== 'All') {
        query = query.eq('source', filters.source);
      }
      if (filters.searchTerm) {
        query = query.or(`id.ilike.%${filters.searchTerm}%,customer_name.ilike.%${filters.searchTerm}%,phone.ilike.%${filters.searchTerm}%`);
      }
      if (filters.dateRange?.start && filters.dateRange?.end) {
        query = query
          .gte('created_at', filters.dateRange.start.toISOString())
          .lte('created_at', filters.dateRange.end.toISOString());
      }

      const { data, error } = await query;
      if (error) throw error;

      const batch = data || [];
      rows.push(...batch);

      if (batch.length < batchSize) break;
      from += batchSize;
    }

    const counts = new Map();

    rows.forEach((row) => {
      const productName = String(row?.product_name || 'Unknown Product').trim() || 'Unknown Product';
      counts.set(productName, (counts.get(productName) || 0) + 1);
    });

    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return a.name.localeCompare(b.name);
      });
  },

  async getOrderStatusBreakdown(filters = {}, limit = 2000) {
    const batchSize = 1000;
    const rows = [];
    let from = 0;

    while (rows.length < limit) {
      let query = supabase
        .from('orders')
        .select('status')
        .order('created_at', { ascending: false })
        .range(from, from + batchSize - 1);

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
        query = query
          .gte('created_at', filters.dateRange.start.toISOString())
          .lte('created_at', filters.dateRange.end.toISOString());
      }

      const { data, error } = await query;
      if (error) throw error;

      const batch = data || [];
      rows.push(...batch);

      if (batch.length < batchSize) break;
      from += batchSize;
    }

    const counts = new Map();

    rows.forEach((row) => {
      const status = String(row?.status || 'Unknown').trim() || 'Unknown';
      counts.set(status, (counts.get(status) || 0) + 1);
    });

    return Array.from(counts.entries())
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return a.status.localeCompare(b.status);
      });
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
      status: orderData.status || 'New',
      notes: orderData.notes,
      created_by: userId,
      ordered_items: orderData.ordered_items || []
    };

    let writePayload = this.attachOrderModernFields(payload, orderData);

    let { data, error } = await supabase
      .from('orders')
      .insert([writePayload])
      .select()
      .single();

    if (error && this.hasUnsupportedOrderModernColumns(error)) {
      this.orderModernColumnsState = false;
      writePayload = this.stripUnsupportedOrderModernFields(payload);
      ({ data, error } = await supabase
        .from('orders')
        .insert([writePayload])
        .select()
        .single());
    } else if (!error && this.orderModernColumnsState == null) {
      this.orderModernColumnsState = true;
    }

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
    this.inferOrderModernColumnsState(oldOrder ? [oldOrder] : []);

    const normalizedUpdates = {
      ...updatedData
    };

    if (Object.prototype.hasOwnProperty.call(updatedData, 'delivery_charge')) {
      normalizedUpdates.delivery_charge = Number(updatedData.delivery_charge) || 0;
    }

    let writeUpdates = this.orderModernColumnsState === false
      ? this.stripUnsupportedOrderModernFields(normalizedUpdates)
      : normalizedUpdates;

    let { data, error } = await supabase
      .from('orders')
      .update(writeUpdates)
      .eq('id', orderId)
      .select()
      .single();

    if (error && this.hasUnsupportedOrderModernColumns(error)) {
      this.orderModernColumnsState = false;
      writeUpdates = this.stripUnsupportedOrderModernFields(normalizedUpdates);
      ({ data, error } = await supabase
        .from('orders')
        .update(writeUpdates)
        .eq('id', orderId)
        .select()
        .single());
    } else if (!error && this.orderModernColumnsState == null) {
      this.orderModernColumnsState = true;
    }

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

    return data;
  },


  /**
   * Change order status
   * Roles: Specific per status
   */
  async changeOrderStatus(orderId, newStatus, userId, userName, userRoles = [], noteText = '') {
    const isAdmin = userRoles.includes('Admin');


    // Permission Mapping
    const permissions = {
      'Confirmed': ['Admin', 'Call Team'],
      'Cancelled': ['Admin', 'Call Team'],
      'Fake Order': ['Admin', 'Call Team'],
      'Final Call Pending': ['Admin', 'Call Team', 'Moderator'],
      'Bulk Exported': ['Admin', 'Factory Team', 'Courier Team'],
      'Courier Ready': ['Admin', 'Factory Team'],
      'Factory Queue': ['Admin', 'Factory Team'],
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
    const { data: oldData } = await supabase
      .from('orders')
      .select('status, first_call_time, ip_address, customer_name, phone')
      .eq('id', orderId)
      .single();

    const updatePayload = { status: newStatus, updated_at: new Date().toISOString() };
    
    // Auto-set first_call_time if a call team or admin confirms/cancels an untouched order
    if (!oldData?.first_call_time && ['Confirmed', 'Cancelled', 'Fake Order'].includes(newStatus)) {
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

    let resultData = data;

    if (String(noteText || '').trim()) {
      resultData = await this.appendOrderNote(orderId, noteText, userId, userName, userRoles, newStatus, data?.notes || '');
    }

    if (newStatus === 'Fake Order') {
      const ipAddress = this.normalizeIpAddress(data?.ip_address || oldData?.ip_address);
      if (ipAddress) {
        await this.blockIpAddressForFakeOrder({
          ipAddress,
          orderId,
          customerName: data?.customer_name || oldData?.customer_name || 'Unknown customer',
          phone: data?.phone || oldData?.phone || '',
          noteText,
          userId,
          userName
        });
      } else {
        await this.logActivity({
          order_id: orderId,
          action_type: 'UPDATE',
          changed_by_user_id: userId,
          changed_by_user_name: userName,
          action_description: `${userName} marked order #${orderId} as Fake Order, but no IP address was stored on the order to block.`
        });
      }
    }

    return resultData;
  },

  formatOrderNoteEntry(noteText, actionLabel, userName, timestamp = new Date().toISOString()) {
    const cleanNote = String(noteText || '').trim();
    if (!cleanNote) return '';

    const stamp = new Date(timestamp).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    return `[${stamp}] ${userName} - ${actionLabel}\n${cleanNote}`;
  },

  mergeOrderNotes(existingNotes, nextEntry) {
    const entry = String(nextEntry || '').trim();
    return entry;
  },

  async appendOrderNote(orderId, noteText, userId, userName, userRoles = [], actionLabel = 'Note', existingNotes = null) {
    const hasPermission = userRoles.some(r => ['Admin', 'Call Team', 'Moderator'].includes(r));
    if (!hasPermission) throw new Error('Unauthorized: You do not have permission to add order notes.');

    const cleanNote = String(noteText || '').trim();
    const entry = this.formatOrderNoteEntry(cleanNote, actionLabel, userName);
    if (!entry) return null;

    let currentNotes = existingNotes;
    if (currentNotes == null) {
      const { data: currentOrder, error: currentOrderError } = await supabase
        .from('orders')
        .select('notes')
        .eq('id', orderId)
        .single();
      if (currentOrderError) throw currentOrderError;
      currentNotes = currentOrder?.notes || '';
    }

    const mergedNotes = this.mergeOrderNotes(currentNotes, entry);

    const { data, error } = await supabase
      .from('orders')
      .update({ notes: mergedNotes })
      .eq('id', orderId)
      .select()
      .single();

    if (error) throw error;

    await this.logActivity({
      order_id: orderId,
      action_type: 'UPDATE',
      changed_by_user_id: userId,
      changed_by_user_name: userName,
      action_description: `${userName} added a note for ${String(actionLabel || 'update').toLowerCase()} on order #${orderId}: ${cleanNote}`
    });

    return data;
  },

  /**
   * Log a call attempt (No Answer, Busy, etc.)
   * Roles: Admin, Call Team
   */
  async logCallAttempt(orderId, status, userId, userName, userRoles = [], noteText = '') {
    const hasPermission = userRoles.some(r => ['Admin', 'Call Team'].includes(r));
    if (!hasPermission) throw new Error('Unauthorized: Only Admin or Call Team can log call attempts.');

    const { data: oldData } = await supabase
      .from('orders')
      .select('call_attempts, first_call_time, status')
      .eq('id', orderId)
      .single();

    const newAttempts = (oldData?.call_attempts || 0) + 1;
    const newFirstCallTime = oldData?.first_call_time || new Date().toISOString();
    const failedCallStatuses = ['busy', 'not pick', 'on hold', 'hold'];
    const isFailedCallStatus = failedCallStatuses.some((value) =>
      String(status || '').toLowerCase().includes(value)
    );
    const resolvedStatuses = [
      'Confirmed',
      'Cancelled',
      'Fake Order',
      'Bulk Exported',
      'Courier Ready',
      'Courier Submitted',
      'Factory Processing',
      'Completed'
    ];
    const nextStatus = resolvedStatuses.includes(oldData?.status)
      ? oldData.status
      : (isFailedCallStatus && newAttempts >= 4 ? 'Final Call Pending' : 'Pending Call');

    const { data, error } = await supabase
      .from('orders')
      .update({
        status: nextStatus,
        call_attempts: newAttempts,
        last_call_status: status,
        first_call_time: newFirstCallTime,
        last_call_at: new Date().toISOString()
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
      action_description: `${userName} logged a call attempt: ${status} (Attempt #${newAttempts})${nextStatus === 'Final Call Pending' ? ' and moved the order to Final Call Pending' : ''}${String(noteText || '').trim() ? ` - Note: ${String(noteText || '').trim()}` : ''}`,
      new_status: nextStatus
    });

    if (String(noteText || '').trim()) {
      return this.appendOrderNote(orderId, noteText, userId, userName, userRoles, status, data?.notes || '');
    }

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
    const pending = orders.filter(o => o.status === 'New' || o.status === 'Pending Call' || o.status === 'Final Call Pending').length;
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

    if (error) {
      if (this.shouldBlockAdminSignupFallback(error)) {
        throw new Error('Admin user creation service is unavailable. Deploy or fix the admin-auth-actions Edge Function before creating users, otherwise Supabase will create unconfirmed email accounts.');
      }
      throw error;
    }
    if (data?.error) throw new Error(data.error);

    return data;
  },

  async adminConfirmUser(userId) {
    const { data, error } = await supabase.functions.invoke('admin-auth-actions', {
      body: {
        action: 'confirm-user',
        userId
      }
    });

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
    const payload = {
      ...itemData,
      unit_price: Number(itemData.unit_price) || 0,
      current_stock: Number(itemData.current_stock) || 0,
      min_stock_level: Number(itemData.min_stock_level) || 0,
      supports_serial_tracking: Boolean(itemData.supports_serial_tracking)
    };

    let { data, error } = await supabase
      .from('inventory')
      .insert([payload])
      .select()
      .single();

    if (error && this.isMissingColumnError(error, 'supports_serial_tracking')) {
      const fallbackPayload = { ...payload };
      delete fallbackPayload.supports_serial_tracking;
      ({ data, error } = await supabase
        .from('inventory')
        .insert([fallbackPayload])
        .select()
        .single());
    }

    if (error) throw error;
    return data;
  },

  /**
   * Update product details
   */
  async updateInventoryItem(id, updates) {
    const payload = {
      ...updates
    };

    if (Object.prototype.hasOwnProperty.call(updates, 'unit_price')) {
      payload.unit_price = Number(updates.unit_price) || 0;
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

    if (error && this.isMissingColumnError(error, 'supports_serial_tracking')) {
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

  getNotificationUrl(notifData = {}) {
    const explicitUrl = String(notifData?.data?.url || notifData?.url || '').trim();
    if (explicitUrl) return explicitUrl;

    if (String(notifData?.type || '').startsWith('TASK_')) {
      return '/tasks';
    }

    return '/orders';
  },

  async resolveNotificationPushRecipients(notifData = {}) {
    const explicitTargets = [
      notifData?.target_user_id,
      notifData?.data?.targetUserId
    ]
      .filter(Boolean)
      .map((value) => String(value).trim())
      .filter(Boolean);

    if (explicitTargets.length > 0) {
      return Array.from(new Set(explicitTargets));
    }

    const { data, error } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role_id', 'Admin');

    if (error) throw error;

    return Array.from(new Set((data || []).map((row) => String(row.user_id || '').trim()).filter(Boolean)));
  },

  async triggerPushNotifications(notificationRecord, notifData = {}) {
    const recipients = await this.resolveNotificationPushRecipients(notifData);
    if (!recipients.length) return;

    const body = {
      notification_id: notificationRecord?.id || null,
      title: notifData?.title || notificationRecord?.title || 'New Notification',
      message: notifData?.message || notificationRecord?.message || '',
      url: this.getNotificationUrl(notifData)
    };

    const results = await Promise.allSettled(
      recipients.map((userId) =>
        supabase.functions.invoke('send-push', {
          body: {
            ...body,
            user_id: userId
          }
        })
      )
    );

    const failed = results.find((result) => result.status === 'fulfilled' && result.value?.error);
    if (failed?.value?.error) {
      throw failed.value.error;
    }

    const rejected = results.find((result) => result.status === 'rejected');
    if (rejected) {
      throw rejected.reason;
    }
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

    try {
      await this.triggerPushNotifications(data, notifData);
    } catch (pushError) {
      console.error('Push notification dispatch failed:', pushError);
    }

    return data;
  },

  // --- Toy Box Management ---

  /**
   * Fetch all toy box inventory
   */
  async getToyBoxInventory() {
    const state = this.getToyBoxProductNameColumnState();
    const columns = state === false
      ? 'id,toy_box_number,stock_quantity,updated_at'
      : 'id,toy_box_number,stock_quantity,updated_at,product_name';

    let { data, error } = await supabase
      .from('toy_box_inventory')
      .select(columns)
      .order('toy_box_number', { ascending: true });

    if (error && state === null && this.isMissingColumnError(error, 'product_name')) {
      this.setToyBoxProductNameColumnState(false);
      ({ data, error } = await supabase
        .from('toy_box_inventory')
        .select('id,toy_box_number,stock_quantity,updated_at')
        .order('toy_box_number', { ascending: true }));
    } else if (!error && state === null) {
      this.setToyBoxProductNameColumnState(true);
    }

    if (error) throw error;
    return this.normalizeToyBoxInventoryRows(data);
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
   * Create one or more toy box serial inventory rows
   */
  async createToyBoxStocks(entries) {
    const payload = (entries || []).map((entry) => ({
      product_name: String(entry.product_name || 'TOY BOX').trim(),
      toy_box_number: Number(entry.toy_box_number),
      stock_quantity: Number(entry.stock_quantity) || 0,
      updated_at: new Date().toISOString()
    }));

    let { data, error } = await supabase
      .from('toy_box_inventory')
      .insert(payload)
      .select('*');

    if (error && this.isMissingColumnError(error, 'product_name')) {
      this.toyBoxProductNameColumnState = false;
      const fallbackPayload = payload.map((entry) => ({
        toy_box_number: entry.toy_box_number,
        stock_quantity: entry.stock_quantity,
        updated_at: entry.updated_at
      }));
      ({ data, error } = await supabase
        .from('toy_box_inventory')
        .insert(fallbackPayload)
        .select('*'));
    } else if (!error) {
      this.toyBoxProductNameColumnState = true;
    }

    if (error) throw error;
    return this.normalizeToyBoxInventoryRows(data);
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
   * Get system configurations (e.g., courier settings)
   */
  async getSystemConfig(key) {
      const { data, error } = await supabase
        .from('system_configs')
        .select('value')
        .eq('key', key)
        .maybeSingle();

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

  // --- Fraud Controls / IP Blocking ---
  async getIpBlocklist() {
    const { data, error } = await supabase
      .from('blocked_ip_addresses')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      if (this.isMissingTableError(error, 'blocked_ip_addresses')) {
        return { configured: false, blocks: [], error };
      }
      throw error;
    }

    return { configured: true, blocks: data || [] };
  },

  async blockIpAddress(ipAddress, reason, userId, userName) {
    const normalizedIp = this.normalizeIpAddress(ipAddress);
    if (!normalizedIp) throw new Error('IP address is required.');

    const payload = {
      ip_address: normalizedIp,
      reason: String(reason || '').trim() || 'Blocked from fraud control',
      is_active: true,
      blocked_by: userId || null,
      blocked_by_name: userName || 'System',
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('blocked_ip_addresses')
      .upsert(payload, { onConflict: 'ip_address' })
      .select()
      .single();

    if (error) {
      if (this.isMissingTableError(error, 'blocked_ip_addresses')) {
        throw new Error('IP blocklist database table is not installed yet.');
      }
      throw error;
    }

    return data;
  },

  async blockIpAddressForFakeOrder({ ipAddress, orderId, customerName, phone, noteText, userId, userName }) {
    const normalizedIp = this.normalizeIpAddress(ipAddress);
    if (!normalizedIp) throw new Error('IP address is required.');

    const cleanNote = String(noteText || '').trim();
    const reason = [
      `Auto-blocked from Fake Order #${orderId}`,
      customerName ? `Customer: ${customerName}` : '',
      phone ? `Phone: ${phone}` : '',
      cleanNote ? `Note: ${cleanNote}` : ''
    ].filter(Boolean).join(' | ');

    const { data, error } = await supabase.functions.invoke('fraud-actions', {
      body: {
        action: 'block-ip',
        ipAddress: normalizedIp,
        reason,
        orderId
      }
    });

    if (error) {
      throw error;
    }

    if (!data?.success) {
      throw new Error(data?.error || 'Failed to block fake order IP address.');
    }

    await this.logActivity({
      order_id: orderId,
      action_type: 'UPDATE',
      changed_by_user_id: userId,
      changed_by_user_name: userName,
      action_description: `${userName} marked order #${orderId} as Fake Order and blocked IP ${normalizedIp}.`
    });

    return data.block;
  },

  async unblockIpAddress(ipAddress) {
    const normalizedIp = this.normalizeIpAddress(ipAddress);
    if (!normalizedIp) throw new Error('IP address is required.');

    const { data, error } = await supabase
      .from('blocked_ip_addresses')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('ip_address', normalizedIp)
      .select()
      .single();

    if (error) {
      if (this.isMissingTableError(error, 'blocked_ip_addresses')) {
        throw new Error('IP blocklist database table is not installed yet.');
      }
      throw error;
    }

    return data;
  },

  async getOrderIpIntelligence(limit = 1000) {
    const { data, error } = await supabase
      .from('orders')
      .select('id,ip_address,created_at,customer_name,phone,status')
      .not('ip_address', 'is', null)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      if (this.isMissingColumnError(error, 'ip_address')) return [];
      throw error;
    }

    const rowsByIp = new Map();

    (data || []).forEach((order) => {
      const ip = this.normalizeIpAddress(order.ip_address);
      if (!ip) return;

      const current = rowsByIp.get(ip) || {
        ip_address: ip,
        total_orders: 0,
        latest_order_at: null,
        latest_order: null,
        statuses: {}
      };

      current.total_orders += 1;
      current.statuses[order.status || 'Unknown'] = (current.statuses[order.status || 'Unknown'] || 0) + 1;

      if (!current.latest_order_at || new Date(order.created_at) > new Date(current.latest_order_at)) {
        current.latest_order_at = order.created_at;
        current.latest_order = {
          id: order.id,
          customer_name: order.customer_name,
          phone: order.phone,
          status: order.status
        };
      }

      rowsByIp.set(ip, current);
    });

    return Array.from(rowsByIp.values())
      .sort((a, b) => {
        if (b.total_orders !== a.total_orders) return b.total_orders - a.total_orders;
        return new Date(b.latest_order_at || 0) - new Date(a.latest_order_at || 0);
      });
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
  },

  // -----------------------------------------------------------
  // ENTERPRISE BACKUP SYSTEM
  // All backup reads are isolated � no writes to production tables.
  // -----------------------------------------------------------

  /** Fetch the singleton backup settings row (id = 1). */
  async getBackupSettings() {
    try {
      const { data, error } = await supabase
        .from('backup_settings')
        .select('*')
        .eq('id', 1)
        .maybeSingle();
      if (error) {
        if (this.isMissingTableError(error, 'backup_settings')) return null;
        throw error;
      }
      return data;
    } catch {
      return null;
    }
  },

  /** Update backup settings (interval, Drive config, auto backup toggle, etc.) */
  async updateBackupSettings(updates = {}) {
    const { data, error } = await supabase
      .from('backup_settings')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', 1)
      .select()
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  /** Get paginated backup history logs, newest first. */
  async getBackupLogs(page = 1, limit = 10) {
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    const { data, error, count } = await supabase
      .from('backup_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);
    if (error) {
      if (this.isMissingTableError(error, 'backup_logs')) return { data: [], count: 0 };
      throw error;
    }
    return { data: data || [], count: count || 0 };
  },

  /** Insert a new backup_log row with status 'pending'. */
  async createBackupLog(payload = {}) {
    const { data, error } = await supabase
      .from('backup_logs')
      .insert({ status: 'pending', type: 'manual', ...payload, created_at: new Date().toISOString() })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  /** Patch a backup_log row (mark completed/failed, set Drive link, etc.) */
  async updateBackupLog(id, updates = {}) {
    const { error } = await supabase
      .from('backup_logs')
      .update(updates)
      .eq('id', id);
    if (error) throw error;
  },

  /** Call the backup-data Edge Function. Returns full backup result + data. */
  async triggerBackup({ type = 'manual', logId = null, triggeredByName = 'Admin', tables = null } = {}) {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token;
    if (!accessToken) throw new Error('Not authenticated');
    const body = {
      type,
      triggered_by_name: triggeredByName,
      ...(logId ? { log_id: logId } : {}),
      ...(tables ? { tables } : {}),
    };
    const response = await fetch(`${supabaseUrl}/functions/v1/backup-data`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Backup failed (${response.status}): ${errText}`);
    }
    return response.json();
  },

  /** Delete old completed backup_log rows past retention period. */
  async pruneOldBackups(retentionDays = 30) {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supabase
      .from('backup_logs')
      .delete()
      .lt('created_at', cutoff)
      .eq('status', 'completed');
    if (error) throw error;
  },

  /** Get a 1-hour signed URL for downloading a backup from Supabase Storage. */
  async getBackupDownloadUrl(storagePath) {
    if (!storagePath) return null;
    const { data, error } = await supabase.storage
      .from('backups')
      .createSignedUrl(storagePath, 3600);
    if (error) return null;
    return data?.signedUrl || null;
  },
};

export default api;

