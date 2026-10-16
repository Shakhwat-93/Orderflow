import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/config/env';
import { getSteadfastCredentials } from '@/lib/steadfast';

function normalizePhone(raw: string): string {
  if (!raw) return '';
  const digits = String(raw).replace(/\D/g, '');
  if (digits.startsWith('880')) return digits.slice(2);
  if (digits.startsWith('88')) return digits.slice(2);
  return digits;
}

function inferRiskLevel(total: number, ratio: number): 'safe' | 'medium' | 'high' | 'new' {
  if (total === 0) return 'new';
  if (ratio >= 80) return 'safe';
  if (ratio >= 60) return 'medium';
  return 'high';
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const rawPhone = body?.phone;
    const force = Boolean(body?.force);
    const phone = normalizePhone(rawPhone);

    if (!phone || phone.length < 10) {
      return NextResponse.json({ success: false, error: 'Invalid or missing phone number' }, { status: 400 });
    }

    // 1. Initialize server-side Supabase client with admin access
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabase = createClient(env.supabase.url, serviceRoleKey || env.supabase.anonKey);

    // 2. Fetch Fraud Checker BD Configuration from database
    let isBdCourierEnabled = false;
    let bdToken = '';
    let bdUrl = 'https://api.bdcourier.com/courier-check';

    try {
      const { data: fraudConfigRow } = await supabase
        .from('system_configs')
        .select('value')
        .eq('key', 'fraud_checker_bd')
        .maybeSingle();

      const fraudConfig = (fraudConfigRow?.value || {}) as {
        api_key?: string;
        api_url?: string;
        is_enabled?: boolean;
      };

      if (fraudConfig.is_enabled && fraudConfig.api_key && String(fraudConfig.api_key).trim().length > 0) {
        isBdCourierEnabled = true;
        bdToken = String(fraudConfig.api_key).trim();
        if (fraudConfig.api_url && String(fraudConfig.api_url).trim().length > 0) {
          bdUrl = String(fraudConfig.api_url).trim();
        }
      }
    } catch (configErr) {
      console.warn('[Courier Ratio Route] Config fetch warning:', configErr);
    }

    const activeProvider: 'bdcourier' | 'steadfast' = isBdCourierEnabled ? 'bdcourier' : 'steadfast';

    // 3. Cache lookup with strict provider isolation and 24-hour TTL
    let existingCachedRecord: any = null;
    try {
      const { data: cached } = await supabase
        .from('courier_ratio_cache')
        .select('*')
        .eq('phone', phone)
        .maybeSingle();

      existingCachedRecord = cached;

      if (!force && cached && cached.fetch_status === 'completed') {
        // Case A: Top-level row matches the active provider
        if (cached.source === activeProvider) {
          const cachedDate = cached.updated_at || cached.fetched_at;
          const ageHours = cachedDate ? (Date.now() - new Date(cachedDate).getTime()) / (1000 * 60 * 60) : Infinity;
          if (ageHours < 24) {
            return NextResponse.json({
              success: true,
              cached: true,
              provider: activeProvider,
              data: {
                phone,
                total: cached.total,
                success_count: cached.success_count,
                cancelled: cached.cancelled,
                ratio: Number(cached.ratio),
                risk_level: cached.risk_level,
                riskLevel: cached.risk_level,
                couriers: cached.couriers || {},
                source: activeProvider,
                raw: cached.raw || {},
                fetchedAt: cached.fetched_at || cached.updated_at,
                updatedAt: cached.updated_at,
                fetched: true
              }
            });
          }
        }

        // Case B: Top-level row has another provider, but preserved multi-provider history has active provider
        const providerSnapshot = cached.raw?._providers?.[activeProvider];
        if (providerSnapshot && providerSnapshot.fetch_status === 'completed') {
          const cachedDate = providerSnapshot.updated_at || providerSnapshot.fetched_at;
          const ageHours = cachedDate ? (Date.now() - new Date(cachedDate).getTime()) / (1000 * 60 * 60) : Infinity;
          if (ageHours < 24) {
            return NextResponse.json({
              success: true,
              cached: true,
              provider: activeProvider,
              data: {
                ...providerSnapshot,
                phone,
                source: activeProvider,
                fetched: true
              }
            });
          }
        }
      }
    } catch (cacheErr) {
      console.warn('[Courier Ratio Route] Cache lookup warning:', cacheErr);
    }

    // 4. Fresh API Execution based on active provider
    let total = 0;
    let successCount = 0;
    let cancelled = 0;
    let ratio = 0;
    let riskLevel: 'safe' | 'medium' | 'high' | 'new' = 'new';
    let couriers: Record<string, any> = {};
    let rawResult: any = null;

    if (activeProvider === 'bdcourier') {
      // ── BD Courier API Integration ──
      const isBdCourierEndpoint = bdUrl.includes('api.bdcourier.com') || bdUrl.includes('courier-check');
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      let bdResponse: Response | null = null;
      try {
        if (isBdCourierEndpoint) {
          bdResponse = await fetch(bdUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${bdToken}`,
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'User-Agent': 'OrderFlow-OMS/2.0'
            },
            body: JSON.stringify({ phone }),
            signal: controller.signal
          });
        } else {
          let url = bdUrl;
          if (url.includes('{phone}')) {
            url = url.replace('{phone}', phone);
          } else {
            url = url.endsWith('/') ? `${url}${phone}` : `${url}/${phone}`;
          }
          bdResponse = await fetch(url, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${bdToken}`,
              'api-key': bdToken,
              'Api-Key': bdToken,
              'Accept': 'application/json',
              'Content-Type': 'application/json',
              'User-Agent': 'OrderFlow-OMS/2.0'
            },
            signal: controller.signal
          });
        }
      } catch (fetchErr: any) {
        clearTimeout(timeout);
        return NextResponse.json({
          success: false,
          error: `BD Courier request failed: ${fetchErr?.message || 'Network timeout'}`,
          provider: 'bdcourier'
        }, { status: 502 });
      } finally {
        clearTimeout(timeout);
      }

      if (!bdResponse) {
        return NextResponse.json({
          success: false,
          error: 'No response received from BD Courier API',
          provider: 'bdcourier'
        }, { status: 502 });
      }

      let bdJson: any = null;
      try {
        bdJson = await bdResponse.json();
      } catch (parseErr: any) {
        return NextResponse.json({
          success: false,
          error: `Invalid JSON returned by BD Courier (HTTP ${bdResponse.status})`,
          provider: 'bdcourier'
        }, { status: 502 });
      }

      // Handle BD Courier Application or HTTP Errors strictly without falling back to Steadfast
      if (!bdResponse.ok || bdJson?.status === 'error' || bdJson?.success === false) {
        const errMsg = bdJson?.message || bdJson?.error || `BD Courier returned HTTP ${bdResponse.status}`;
        return NextResponse.json({
          success: false,
          error: errMsg,
          provider: 'bdcourier'
        }, { status: 400 });
      }

      // Map Real BD Courier Response
      rawResult = bdJson;
      const bdData = bdJson?.data || bdJson?.stats?.data || bdJson;
      const summary = bdData?.summary || {};

      total = Math.max(0, Number(summary.total_parcel ?? summary.total ?? 0));
      successCount = Math.max(0, Number(summary.success_parcel ?? summary.success_count ?? 0));
      cancelled = Math.max(0, Number(summary.cancelled_parcel ?? summary.cancelled_count ?? 0));

      const rawRatio = summary.success_ratio ?? summary.ratio;
      ratio = rawRatio !== undefined && rawRatio !== null
        ? Number(Number(rawRatio).toFixed(2))
        : total > 0 ? Number(((successCount / total) * 100).toFixed(2)) : 0;

      const explicitRisk = bdJson?.risk_verdict?.level || bdData?.risk_level;
      riskLevel = explicitRisk ? inferRiskLevel(total, ratio) : inferRiskLevel(total, ratio);
      if (explicitRisk && ['safe', 'medium', 'high', 'new'].includes(String(explicitRisk).toLowerCase())) {
        riskLevel = String(explicitRisk).toLowerCase() as any;
      }

      // Extract individual couriers breakdown
      Object.keys(bdData).forEach((key) => {
        if (key !== 'summary' && bdData[key] && typeof bdData[key] === 'object' && !Array.isArray(bdData[key])) {
          const item = bdData[key];
          couriers[key] = {
            name: item.name || key,
            logo: item.logo || '',
            total: Number(item.total_parcel ?? item.total ?? 0) || 0,
            success: Number(item.success_parcel ?? item.success_count ?? item.success ?? 0) || 0,
            cancelled: Number(item.cancelled_parcel ?? item.cancelled_count ?? item.cancelled ?? 0) || 0,
            ratio: Number(item.success_ratio ?? item.ratio ?? 0) || 0
          };
        }
      });
    } else {
      // ── Steadfast API Integration (when BD Courier is disabled) ──
      const { apiKey, secretKey } = getSteadfastCredentials();
      if (!apiKey || !secretKey) {
        return NextResponse.json({ success: false, error: 'Steadfast API credentials not configured', provider: 'steadfast' }, { status: 500 });
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);

      let scoreData: any = null;
      try {
        const sfRes = await fetch(`https://portal.packzy.com/api/v1/fraud_check/score/${phone}`, {
          method: 'GET',
          headers: {
            'Api-Key': apiKey,
            'Secret-Key': secretKey,
            'Content-Type': 'application/json'
          },
          signal: controller.signal
        });

        if (sfRes.ok) {
          scoreData = await sfRes.json();
        } else {
          return NextResponse.json({
            success: false,
            error: `Steadfast returned HTTP ${sfRes.status}`,
            provider: 'steadfast'
          }, { status: 400 });
        }
      } catch (fetchErr: any) {
        return NextResponse.json({
          success: false,
          error: `Steadfast request failed: ${fetchErr?.message || 'Network timeout'}`,
          provider: 'steadfast'
        }, { status: 502 });
      } finally {
        clearTimeout(timeout);
      }

      rawResult = scoreData;
      const delivered = Math.max(0, Number(scoreData?.delivered_count ?? 0));
      cancelled = Math.max(0, Number(scoreData?.cancelled_count ?? 0));
      total = delivered + cancelled;
      successCount = delivered;
      ratio = scoreData?.delivery_ratio !== undefined && scoreData?.delivery_ratio !== null
        ? Number(Number(scoreData.delivery_ratio).toFixed(2))
        : total > 0 ? Number(((delivered / total) * 100).toFixed(2)) : 0;

      riskLevel = inferRiskLevel(total, ratio);
      couriers = {
        steadfast: {
          name: 'Steadfast',
          delivered,
          success: delivered,
          cancelled,
          total,
          ratio
        }
      };
    }

    // 5. Build isolated multi-provider payload and save to cache
    const nowIso = new Date().toISOString();
    const existingProviders = (existingCachedRecord?.raw && typeof existingCachedRecord.raw === 'object' && existingCachedRecord.raw._providers)
      ? { ...existingCachedRecord.raw._providers }
      : {};

    // Archive existing top-level record if from a different provider
    if (existingCachedRecord && existingCachedRecord.source && existingCachedRecord.source !== activeProvider && existingCachedRecord.fetch_status === 'completed') {
      existingProviders[existingCachedRecord.source] = {
        phone,
        total: existingCachedRecord.total,
        success_count: existingCachedRecord.success_count,
        cancelled: existingCachedRecord.cancelled,
        ratio: Number(existingCachedRecord.ratio),
        risk_level: existingCachedRecord.risk_level,
        riskLevel: existingCachedRecord.risk_level,
        couriers: existingCachedRecord.couriers || {},
        source: existingCachedRecord.source,
        fetch_status: 'completed',
        fetched_at: existingCachedRecord.fetched_at,
        updated_at: existingCachedRecord.updated_at
      };
    }

    const currentProviderRecord = {
      phone,
      total,
      success_count: successCount,
      cancelled,
      ratio,
      risk_level: riskLevel,
      riskLevel,
      couriers,
      source: activeProvider,
      fetch_status: 'completed',
      fetched_at: nowIso,
      updated_at: nowIso
    };

    existingProviders[activeProvider] = currentProviderRecord;

    const dbPayload = {
      ...currentProviderRecord,
      raw: {
        ...(rawResult && typeof rawResult === 'object' ? rawResult : {}),
        _providers: existingProviders
      }
    };

    try {
      await supabase
        .from('courier_ratio_cache')
        .upsert(dbPayload, { onConflict: 'phone' });
    } catch (saveErr) {
      console.warn('[Courier Ratio Route] Failed to cache ratio:', saveErr);
    }

    return NextResponse.json({
      success: true,
      cached: false,
      provider: activeProvider,
      data: {
        ...currentProviderRecord,
        raw: rawResult,
        fetched: true
      }
    });
  } catch (err: any) {
    console.error('[Courier Ratio Route] Error:', err);
    return NextResponse.json({ success: false, error: err?.message || 'Courier ratio check failed' }, { status: 500 });
  }
}
