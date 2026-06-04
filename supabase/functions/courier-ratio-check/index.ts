import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

interface CourierConfig {
  api_key: string;
  secret_key: string;
  is_enabled: boolean;
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
    interface FraudCheckerConfig {
      api_key: string;
      api_url: string;
      is_enabled: boolean;
    }

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

    if (fraudConfig && fraudConfig.is_enabled && fraudConfig.api_key) {
      isFraudCheckerUsed = true;
      const token = fraudConfig.api_key;
      const baseUrl = fraudConfig.api_url || 'https://api.bdcourier.com/courier-check';
      
      const isBdCourier = baseUrl.includes('api.bdcourier.com') || baseUrl.includes('courier-check');

      try {
        if (isBdCourier) {
          console.log(`[Courier Check] Querying BD Courier POST API at: ${baseUrl}`);
          response = await fetch(baseUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            body: JSON.stringify({ phone })
          });
        } else {
          let url = baseUrl;
          if (url.includes('{phone}')) {
            url = url.replace('{phone}', phone);
          } else {
            url = url.endsWith('/') ? `${url}${phone}` : `${url}/${phone}`;
          }
          console.log(`[Courier Check] Querying Custom GET API at: ${url}`);
          response = await fetch(url, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${token}`,
              'api-key': token,
              'Api-Key': token,
              'Accept': 'application/json',
              'Content-Type': 'application/json'
            }
          });
        }
        if (response) {
          console.log(`[Courier Check] Fraud Checker BD API status: ${response.status}`);
          if (response.ok) {
            const tempRes = response.clone();
            const bodyJson = await tempRes.json().catch(() => null);
            if (bodyJson) {
              if (bodyJson.status === 'error' || bodyJson.success === false) {
                console.warn('[Courier Check] Fraud Checker BD API returned application error:', bodyJson.message || bodyJson.error);
                response = null; // Triggers fallback to Steadfast
              }
            }
          }
        }
      } catch (err: any) {
        console.error('[Courier Check] Fraud Checker BD API request failed:', err.message);
      }
    }

    // Fallback to Steadfast if Fraud Checker BD is disabled or failed
    if (!isFraudCheckerUsed || !response || !response.ok) {
      if (isFraudCheckerUsed) {
        console.warn('[Courier Check] Fraud Checker BD API failed or returned error, falling back to Steadfast.');
      }
      
      const { data: configData, error: configError } = await supabaseClient
        .from('system_configs')
        .select('value')
        .eq('key', 'courier_steadfast')
        .single();

      if (configError || !configData) {
        throw new Error('Courier configuration not found');
      }

      const config = configData.value as CourierConfig;

      response = await fetch(`https://portal.steadfast.com.bd/api/v1/fraud_check/${phone}`, {
        method: 'GET',
        headers: {
          'Api-Key': config.api_key,
          'Secret-Key': config.secret_key,
          'Content-Type': 'application/json'
        }
      });
    }

    if (!response) {
      throw new Error('No courier response received from any provider');
    }

    const result = await response.json();

    // 3. Return the result mapped to our expected structure
    // Steadfast returns { success: boolean, message: string, stats: { ... } }
    if (response.ok) {
      return new Response(JSON.stringify({
        success: true,
        stats: result,
        isLimitReached: result.message?.toLowerCase().includes('limit') || false
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } else {
      return new Response(JSON.stringify({ 
        success: false, 
        error: result.message || 'Fraud Check Error'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      });
    }

  } catch (error: any) {
    console.error('Ratio Check Error:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    });
  }
});
