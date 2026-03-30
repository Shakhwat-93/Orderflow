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

    const { phone } = await req.json();

    if (!phone) {
      throw new Error('Missing phone number');
    }

    // 1. Fetch Courier Config
    const { data: configData, error: configError } = await supabaseClient
      .from('system_configs')
      .select('value')
      .eq('key', 'courier_steadfast')
      .single();

    if (configError || !configData) {
      throw new Error('Courier configuration not found');
    }

    const config = configData.value as CourierConfig;

    // 2. Call Steadfast Fraud Check API
    // Endpoint: https://portal.steadfast.com.bd/api/v1/fraud_check/{phone}
    const response = await fetch(`https://portal.steadfast.com.bd/api/v1/fraud_check/${phone}`, {
      method: 'GET',
      headers: {
        'Api-Key': config.api_key,
        'Secret-Key': config.secret_key,
        'Content-Type': 'application/json'
      }
    });

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
