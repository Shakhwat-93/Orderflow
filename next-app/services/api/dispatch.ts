import { supabase, schemaState, normalizePhone, toFiniteNumber, dedupPromise, formatApiError } from './client';
import type {
  CourierRatioRecord,
  CourierRiskLevel,
  CourierDispatchResult,
  SteadfastStatusResult
} from '@/types/api';

export const dispatchApi = {
  /**
   * Helper to normalize courier delivery ratio percentage
   */
  normalizeCourierRatioValue(value: any, total = 0, successCount = 0): number {
    const direct = toFiniteNumber(value);
    if (direct != null && Number.isFinite(direct)) {
      return Math.max(0, Math.min(100, Number(direct.toFixed(2))));
    }
    if (Number(total) > 0) {
      return Math.max(
        0,
        Math.min(100, Number((((Number(successCount) || 0) / Number(total)) * 100).toFixed(2)))
      );
    }
    return 0;
  },

  inferCourierRiskLevel(total = 0, ratio = 0, explicitRisk = ''): CourierRiskLevel {
    if (Number(total) > 0) {
      if (Number(ratio) >= 70) return 'safe';
      if (Number(ratio) >= 40) return 'medium';
      return 'high';
    }
    const normalized = String(explicitRisk || '').trim().toLowerCase();
    if (normalized === 'low' || normalized === 'safe') return 'safe';
    if (normalized === 'medium') return 'medium';
    if (normalized === 'high') return 'high';
    return 'new';
  },

  normalizeCourierRatioPayload(result: any = {}, phone = '') {
    if (
      result?.success === false ||
      result?.status === 'error' ||
      result?.error ||
      result?.stats?.success === false ||
      result?.stats?.status === 'error' ||
      result?.stats?.error
    ) {
      const errMsg =
        result?.error ||
        result?.message ||
        result?.stats?.error ||
        result?.stats?.message ||
        'Courier check returned an error';
      throw new Error(errMsg);
    }

    const normalizedPhone = normalizePhone(phone || result?.phone);
    const primaryPayload =
      (result?.stats?.data && typeof result.stats.data === 'object' && !Array.isArray(result.stats.data) && result.stats.data) ||
      (result?.stats && typeof result.stats === 'object' && !Array.isArray(result.stats) && result.stats) ||
      (result?.data && typeof result.data === 'object' && !Array.isArray(result.data) && result.data) ||
      (typeof result === 'object' && !Array.isArray(result) ? result : {});

    const total = Math.max(
      0,
      Math.round(
        toFiniteNumber(
          primaryPayload.summary?.total_parcel ??
          primaryPayload.summary?.total ??
          primaryPayload.total ??
          primaryPayload.total_parcel ??
          primaryPayload.total_parcels ??
          result?.total,
          0
        )
      )
    );

    const successCount = Math.max(
      0,
      Math.round(
        toFiniteNumber(
          primaryPayload.summary?.success_parcel ??
          primaryPayload.summary?.success_count ??
          primaryPayload.success_count ??
          primaryPayload.delivered_count ??
          result?.success_count,
          0
        )
      )
    );

    const cancelled = Math.max(
      0,
      Math.round(
        toFiniteNumber(
          primaryPayload.summary?.cancelled_parcel ??
          primaryPayload.summary?.cancelled ??
          primaryPayload.cancelled ??
          primaryPayload.cancelled_count ??
          result?.cancelled,
          0
        )
      )
    );

    const ratio = this.normalizeCourierRatioValue(
      toFiniteNumber(
        primaryPayload.summary?.success_ratio ??
        primaryPayload.summary?.ratio ??
        primaryPayload.ratio ??
        result?.ratio,
        0
      ),
      total,
      successCount
    );

    const riskLevel = this.inferCourierRiskLevel(total, ratio, primaryPayload.risk_level || result?.risk_level);

    return {
      phone: normalizedPhone,
      total,
      success_count: successCount,
      cancelled,
      ratio,
      riskLevel,
      couriers: primaryPayload.couriers || {},
      raw: primaryPayload.raw || result || null
    };
  },

  hydrateCourierRatioCacheRecord(record: any): CourierRatioRecord {
    const total = Number(record.total || 0);
    const ratio = Number(record.ratio || 0);
    const riskLevel = this.inferCourierRiskLevel(total, ratio, record.risk_level);
    return {
      loading: record.fetch_status === 'pending',
      fetched: record.fetch_status === 'completed' || record.fetch_status === 'failed',
      error: record.fetch_status === 'failed',
      total,
      success_count: Number(record.success_count || 0),
      cancelled: Number(record.cancelled || 0),
      ratio,
      riskLevel,
      couriers: (record.couriers && typeof record.couriers === 'object' && !Array.isArray(record.couriers)) ? record.couriers : {},
      raw: record.raw || null,
      fetchedAt: record.fetched_at || null,
      updatedAt: record.updated_at || null,
      phone: record.phone || '',
      source: record.source || 'steadfast'
    };
  },

  /**
   * Fetch cached courier ratio record for a phone number (in-flight deduplicated)
   */
  async getCourierRatioCache(phone: string): Promise<CourierRatioRecord | null> {
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone || schemaState.courierRatioCacheTableState === false) return null;

    return dedupPromise(`courierRatio:${normalizedPhone}`, async () => {
      try {
        const { data, error } = await supabase
          .from('courier_ratio_cache')
          .select('*')
          .eq('phone', normalizedPhone)
          .limit(1);

        if (error) {
          if (schemaState.isMissingTableError(error, 'courier_ratio_cache')) {
            schemaState.courierRatioCacheTableState = false;
            return null;
          }
          throw error;
        }

        schemaState.courierRatioCacheTableState = true;
        const row = Array.isArray(data) ? data[0] : data;
        return row ? this.hydrateCourierRatioCacheRecord(row) : null;
      } catch (err) {
        throw formatApiError(err, 'Failed to fetch courier ratio');
      }
    });
  },

  /**
   * Fetch cached courier ratio records in batch
   */
  async getCourierRatioCacheBatch(phones: string[] = []): Promise<Record<string, CourierRatioRecord>> {
    const normalizedPhones = [...new Set((phones || []).map((p) => normalizePhone(p)).filter(Boolean))];
    if (normalizedPhones.length === 0 || schemaState.courierRatioCacheTableState === false) return {};

    try {
      const { data, error } = await supabase
        .from('courier_ratio_cache')
        .select('*')
        .in('phone', normalizedPhones);

      if (error) {
        if (schemaState.isMissingTableError(error, 'courier_ratio_cache')) {
          schemaState.courierRatioCacheTableState = false;
          return {};
        }
        throw error;
      }

      schemaState.courierRatioCacheTableState = true;
      return Object.fromEntries(
        (data || []).map((row: any) => [row.phone, this.hydrateCourierRatioCacheRecord(row)])
      );
    } catch (err) {
      throw formatApiError(err, 'Batch courier ratio lookup failed');
    }
  },

  async claimCourierRatioLookup(phone: string): Promise<boolean> {
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) return false;
    if (schemaState.courierRatioCacheTableState === false) return true;

    try {
      const { data, error } = await supabase.rpc('claim_courier_ratio_lookup', {
        phone_input: normalizedPhone
      });

      if (error) {
        if (
          schemaState.isMissingTableError(error, 'courier_ratio_cache') ||
          schemaState.isMissingFunctionError(error, 'claim_courier_ratio_lookup')
        ) {
          schemaState.courierRatioCacheTableState = false;
          return true;
        }
        throw error;
      }

      schemaState.courierRatioCacheTableState = true;
      return Boolean(data);
    } catch (err) {
      console.warn('claimCourierRatioLookup non-fatal:', err);
      return true;
    }
  },

  async waitForCourierRatioCache(phone: string, attempts = 4, delayMs = 900): Promise<CourierRatioRecord | null> {
    const normalizedPhone = normalizePhone(phone);
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

  async saveCourierRatioCache(phone: string, result: any, fetchStatus = 'completed'): Promise<CourierRatioRecord | null> {
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone || schemaState.courierRatioCacheTableState === false) return null;

    const isCompleted = fetchStatus === 'completed';
    const nowIso = new Date().toISOString();

    let payload: Record<string, any>;
    if (fetchStatus === 'failed') {
      payload = {
        phone: normalizedPhone,
        total: 0,
        success_count: 0,
        cancelled: 0,
        ratio: 0,
        risk_level: 'new',
        couriers: {},
        raw: result || null,
        fetch_status: 'failed',
        source: 'steadfast',
        fetched_at: null,
        updated_at: nowIso
      };
    } else {
      const normalizedPayload = this.normalizeCourierRatioPayload(result, phone);
      payload = {
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
    }

    try {
      const { data, error } = await supabase
        .from('courier_ratio_cache')
        .upsert(payload, { onConflict: 'phone' })
        .select('*')
        .maybeSingle();

      if (error) {
        if (schemaState.isMissingTableError(error, 'courier_ratio_cache')) {
          schemaState.courierRatioCacheTableState = false;
          return null;
        }
        throw error;
      }

      schemaState.courierRatioCacheTableState = true;
      return data ? this.hydrateCourierRatioCacheRecord(data) : this.hydrateCourierRatioCacheRecord(payload);
    } catch (err) {
      throw formatApiError(err, 'Failed to save courier ratio cache');
    }
  },

  async markCourierRatioCacheFailed(phone: string, errorMessage = 'Courier ratio check failed'): Promise<CourierRatioRecord | null> {
    return this.saveCourierRatioCache(
      phone,
      { success: false, error: String(errorMessage || 'Courier ratio check failed') },
      'failed'
    );
  },

  /**
   * Dispatch an order to Steadfast Courier
   */
  async dispatchToCourier(orderId: string | number): Promise<CourierDispatchResult> {
    let edgeError: any = null;
    let data: any = null;

    // 1. Try invoking Edge Function first
    try {
      const res = await supabase.functions.invoke('courier-api', {
        body: { orderId }
      });
      data = res.data;
      if (res.error) edgeError = res.error;
    } catch (err) {
      edgeError = err;
    }

    if (!edgeError && data?.success) {
      const consignmentId = data?.consignmentId || data?.details?.consignment?.consignment_id || data?.details?.id;
      const trackingCode = data?.trackingCode || data?.details?.consignment?.tracking_code || data?.details?.tracking_code;
      const courierStatus = data?.details?.consignment?.status || data?.details?.status || 'in_review';

      await supabase
        .from('orders')
        .update({
          dispatched_at: new Date().toISOString(),
          courier_name: 'Steadfast',
          tracking_id: trackingCode || null,
          courier_assigned_id: consignmentId ? String(consignmentId) : null,
          courier_status: courierStatus,
          status: 'Courier Submitted',
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId);

      return data as CourierDispatchResult;
    }

    // 2. Direct fallback via Steadfast API
    console.warn('Edge Function bypassed/failed. Executing direct Steadfast client dispatch fallback...', edgeError || data?.error);

    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (orderErr || !order) {
      throw formatApiError(orderErr, `Order #${orderId} not found`);
    }

    const { data: configData } = await supabase
      .from('system_configs')
      .select('value')
      .eq('key', 'courier_steadfast')
      .maybeSingle();

    const config = configData?.value || {};
    const apiKey = (config.api_key || '').trim();
    const secretKey = (config.secret_key || '').trim();

    if (!apiKey || !secretKey) {
      throw new Error(data?.error || (edgeError ? edgeError.message : 'Steadfast API Key or Secret Key is missing in Settings.'));
    }

    let rawPhone = String(order.phone || '').replace(/\D/g, '');
    if (rawPhone.length > 11 && rawPhone.startsWith('880')) rawPhone = rawPhone.slice(2);
    else if (rawPhone.length > 11 && rawPhone.startsWith('88')) rawPhone = rawPhone.slice(2);
    if (rawPhone.length === 10 && !rawPhone.startsWith('0')) rawPhone = '0' + rawPhone;
    if (rawPhone.length !== 11 || !rawPhone.startsWith('01')) {
      const match = rawPhone.match(/01\d{9}/);
      if (match) rawPhone = match[0];
    }

    const codAmount = Math.max(0, Math.round(Number(order.total_amount ?? order.total_price ?? order.amount ?? 0)));
    const cleanAddress = (order.address || order.shipping_address || 'Dhaka, Bangladesh').trim();
    const cleanName = (order.customer_name || 'Customer').trim().slice(0, 100);
    const noteContent = `${order.product_name || ''} ${order.size ? `(Size: ${order.size})` : ''}`.trim().slice(0, 250);

    const payload = {
      invoice: String(order.id).trim(),
      recipient_name: cleanName,
      recipient_phone: rawPhone,
      recipient_address: cleanAddress.length >= 5 ? cleanAddress : `${cleanAddress}, Dhaka`,
      cod_amount: codAmount,
      note: noteContent || 'Standard Delivery'
    };

    const sfRes = await fetch('https://portal.packzy.com/api/v1/create_order', {
      method: 'POST',
      headers: {
        'Api-Key': apiKey,
        'Secret-Key': secretKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const sfResult = await sfRes.json();
    if (sfResult.status !== 200 || !sfResult.consignment) {
      throw new Error(sfResult.message || sfResult.errors?.[0] || 'Direct Steadfast dispatch failed.');
    }

    const consignment = sfResult.consignment;
    const trackingCode = consignment.tracking_code;
    const consignmentId = consignment.consignment_id;

    await supabase
      .from('orders')
      .update({
        dispatched_at: new Date().toISOString(),
        courier_name: 'Steadfast',
        tracking_id: trackingCode || null,
        courier_assigned_id: consignmentId ? String(consignmentId) : null,
        courier_status: consignment.status || 'in_review',
        status: 'Courier Submitted',
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId);

    return {
      success: true,
      trackingCode,
      consignmentId: String(consignmentId),
      details: sfResult
    };
  },

  /**
   * Get Steadfast parcel status
   */
  async getSteadfastStatus(orderId: string | number, trackingCode?: string): Promise<SteadfastStatusResult> {
    try {
      const { data, error } = await supabase.functions.invoke('courier-status', {
        body: { orderId, trackingCode }
      });

      if (error) {
        console.error('Steadfast Status Error:', error);
        throw error;
      }

      const consignmentId = data?.consignment_id || data?.id;
      if (consignmentId) {
        await supabase
          .from('orders')
          .update({ courier_assigned_id: String(consignmentId) })
          .eq('id', orderId)
          .is('courier_assigned_id', null);
      }

      return data as SteadfastStatusResult;
    } catch (err) {
      throw formatApiError(err, 'Failed to fetch Steadfast status');
    }
  },

  /**
   * Automatic distribution engine
   */
  async runAutoDistribution() {
    try {
      const { data, error } = await supabase.rpc('auto_distribute_orders');
      if (error) throw error;
      return data;
    } catch (err) {
      throw formatApiError(err, 'Automatic distribution execution failed');
    }
  },

  /**
   * Full or scoped system reset (Admin only)
   */
  async resetSystem(isAdmin: boolean, options: { scope?: 'all' | 'date-range'; dateRange?: { start?: string; end?: string } } = {}) {
    if (!isAdmin) {
      throw new Error('Unauthorized: Only Admins can reset the system.');
    }

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
      throw formatApiError(err, 'System reset operation failed');
    }
  }
};
