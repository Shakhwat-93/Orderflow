import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

interface CourierConfig {
  api_key: string;
  secret_key: string;
  is_enabled: boolean;
}

interface FraudCheckerConfig {
  api_key: string;
  api_url: string;
  is_enabled: boolean;
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    return response;
  } finally {
    clearTimeout(id);
  }
}

Deno.serve(async (req: Request) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { phone } = await req.json();

    if (!phone) {
      throw new Error('Missing phone number');
    }

    // 1. Fetch Configs
    const { data: fraudConfigData } = await supabaseClient
      .from('system_configs')
      .select('value')
      .eq('key', 'fraud_checker_bd')
      .maybeSingle();

    const fraudConfig = fraudConfigData?.value as FraudCheckerConfig | null;

    let response: Response | null = null;
    let isFraudCheckerUsed = false;
    let lastError = '';

    if (fraudConfig && fraudConfig.is_enabled && fraudConfig.api_key) {
      isFraudCheckerUsed = true;
      const token = fraudConfig.api_key;
      const baseUrl = fraudConfig.api_url || 'https://api.bdcourier.com/courier-check';
      
      const isBdCourier = baseUrl.includes('api.bdcourier.com') || baseUrl.includes('courier-check');

      try {
        if (isBdCourier) {
          console.log(`[Courier Check] Querying BD Courier POST API at: ${baseUrl}`);
          response = await fetchWithTimeout(baseUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
              'Connection': 'keep-alive'
            },
            body: JSON.stringify({ phone })
          }, 8000);
        } else {
          let url = baseUrl;
          if (url.includes('{phone}')) {
            url = url.replace('{phone}', phone);
          } else {
            url = url.endsWith('/') ? `${url}${phone}` : `${url}/${phone}`;
          }
          console.log(`[Courier Check] Querying Custom GET API at: ${url}`);
          response = await fetchWithTimeout(url, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${token}`,
              'api-key': token,
              'Api-Key': token,
              'Accept': 'application/json',
              'Content-Type': 'application/json',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
            }
          }, 8000);
        }
        
        if (response) {
          console.log(`[Courier Check] Fraud Checker BD API status: ${response.status}`);
          if (response.ok) {
            const tempRes = response.clone();
            const bodyJson = await tempRes.json().catch(() => null);
            if (bodyJson) {
              if (bodyJson.status === 'error' || bodyJson.success === false) {
                console.warn('[Courier Check] Fraud Checker BD API returned application error:', bodyJson.message || bodyJson.error);
                lastError = `BD Courier App Error: ${bodyJson.message || bodyJson.error}`;
                response = null; // Triggers fallback to Steadfast
              }
            }
          } else {
            let errorMsg = `BD Courier HTTP Error ${response.status}`;
            try {
              const errorBody = await response.clone().json();
              if (errorBody && (errorBody.message || errorBody.error)) {
                errorMsg = errorBody.message || errorBody.error;
              }
            } catch (_) {
              try {
                const errorText = await response.clone().text();
                if (errorText && errorText.length < 200) {
                  errorMsg = `BD Courier Error: ${errorText}`;
                }
              } catch (_) {}
            }
            lastError = errorMsg;
            response = null;
          }
        }
      } catch (err: any) {
        console.error('[Courier Check] Fraud Checker BD API request failed:', err.message);
        lastError = `BD Courier Request Failed: ${err.message}`;
      }
    }

    // Fallback to Steadfast if Fraud Checker BD is disabled or failed
    if (!isFraudCheckerUsed || !response || !response.ok) {
      if (isFraudCheckerUsed) {
        console.warn('[Courier Check] Fraud Checker BD API failed or returned error, trying fallback to Steadfast.');
      }
      
      try {
        const { data: configData, error: configError } = await supabaseClient
          .from('system_configs')
          .select('value')
          .eq('key', 'courier_steadfast')
          .single();

        if (configError || !configData) {
          throw new Error('Courier configuration not found');
        }

        const config = configData.value as CourierConfig;

        if (config && config.is_enabled && config.api_key && config.secret_key) {
          console.log(`[Courier Check] Querying Steadfast API for phone: ${phone}`);
          response = await fetchWithTimeout(`https://portal.steadfast.com.bd/api/v1/fraud_check/${phone}`, {
            method: 'GET',
            headers: {
              'Api-Key': config.api_key,
              'Secret-Key': config.secret_key,
              'Content-Type': 'application/json'
            }
          }, 6000);
        } else {
          console.warn('[Courier Check] Steadfast fallback skipped: config is disabled or has empty credentials.');
          lastError = lastError 
            ? `${lastError}. Steadfast fallback skipped (disabled/unconfigured).` 
            : 'Steadfast fallback skipped (disabled/unconfigured).';
        }
      } catch (err: any) {
        console.error('[Courier Check] Steadfast API request failed:', err.message);
        lastError = lastError 
          ? `${lastError}. Steadfast error: ${err.message}` 
          : `Steadfast error: ${err.message}`;
      }
    }

    if (!response) {
      throw new Error(lastError || 'No courier response received from any provider');
    }

    // 2. Safe JSON Parsing
    let result: any = null;
    try {
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        result = await response.json();
      } else {
        const text = await response.text();
        result = { success: false, message: text || 'Invalid JSON response from courier API' };
      }
    } catch (err: any) {
      console.error('[Courier Check] Failed to parse response body:', err.message);
      result = { success: false, message: `Failed to parse response body: ${err.message}` };
    }

    // 3. Return the result mapped to our expected structure
    if (response.ok && result) {
      return new Response(JSON.stringify({
        success: true,
        stats: result,
        isLimitReached: result.message?.toLowerCase().includes('limit') || false
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } else {
      const errMsg = result?.message || result?.error || 'Fraud Check Error';
      return new Response(JSON.stringify({ 
        success: false, 
        error: errMsg
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      });
    }

  } catch (error: any) {
    console.error('Ratio Check Error:', error.message);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400 // Return 400 instead of 500 so the client can display the failure cleanly
    });
  }
});

