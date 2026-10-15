import { NextResponse } from 'next/server';
import { getSteadfastCredentials } from '@/lib/steadfast';
import { createClient } from '@/lib/supabase/server';

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
    const body = await request.json();
    const rawPhone = body?.phone;
    const phone = normalizePhone(rawPhone);

    if (!phone || phone.length < 10) {
      return NextResponse.json({ success: false, error: 'Invalid or missing phone number' }, { status: 400 });
    }

    const supabase = await createClient();

    // 1. Check database cache first
    try {
      const { data: cached } = await supabase
        .from('courier_ratio_cache')
        .select('*')
        .eq('phone', phone)
        .maybeSingle();

      if (cached && cached.fetch_status === 'completed' && cached.updated_at) {
        const ageHours = (Date.now() - new Date(cached.updated_at).getTime()) / (1000 * 60 * 60);
        if (ageHours < 24) {
          return NextResponse.json({
            success: true,
            cached: true,
            data: {
              phone,
              total: cached.total,
              success_count: cached.success_count,
              cancelled: cached.cancelled,
              ratio: Number(cached.ratio),
              risk_level: cached.risk_level,
              couriers: cached.couriers || {},
              fetched: true
            }
          });
        }
      }
    } catch (cacheErr) {
      console.warn('[Courier Ratio Route] Cache lookup warning:', cacheErr);
    }

    // 2. Fetch fresh score from Steadfast API
    const { apiKey, secretKey } = getSteadfastCredentials();
    if (!apiKey || !secretKey) {
      return NextResponse.json({ success: false, error: 'Steadfast API credentials not configured' }, { status: 500 });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

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
      }
    } catch (fetchErr: any) {
      console.warn('[Courier Ratio Route] Steadfast fetch warning:', fetchErr?.message);
    } finally {
      clearTimeout(timeout);
    }

    // 3. Normalize score payload
    const delivered = Math.max(0, Number(scoreData?.delivered_count ?? 0));
    const cancelled = Math.max(0, Number(scoreData?.cancelled_count ?? 0));
    const total = delivered + cancelled;
    const ratio = scoreData?.delivery_ratio !== undefined && scoreData?.delivery_ratio !== null
      ? Number(scoreData.delivery_ratio)
      : total > 0 ? Math.round((delivered / total) * 100) : 0;

    const riskLevel = inferRiskLevel(total, ratio);

    const payload = {
      phone,
      total,
      success_count: delivered,
      cancelled,
      ratio,
      risk_level: riskLevel,
      couriers: {
        steadfast: {
          delivered,
          cancelled,
          total,
          ratio
        }
      },
      raw: scoreData || {},
      fetch_status: 'completed',
      source: 'steadfast',
      fetched_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // 4. Save to cache asynchronously
    try {
      await supabase
        .from('courier_ratio_cache')
        .upsert(payload, { onConflict: 'phone' });
    } catch (saveErr) {
      console.warn('[Courier Ratio Route] Failed to cache ratio:', saveErr);
    }

    return NextResponse.json({
      success: true,
      cached: false,
      data: {
        ...payload,
        fetched: true
      }
    });
  } catch (err: any) {
    console.error('[Courier Ratio Route] Error:', err);
    return NextResponse.json({ success: false, error: err?.message || 'Courier ratio check failed' }, { status: 500 });
  }
}
