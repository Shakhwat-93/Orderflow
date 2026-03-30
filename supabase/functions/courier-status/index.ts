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

    const { orderId, trackingCode } = await req.json();

    if (!trackingCode) {
      throw new Error('Missing trackingCode');
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

    // 2. Call Steadfast Status API
    // Endpoint for single order tracking: https://portal.steadfast.com.bd/api/v1/status_by_tracking/{tracking_code}
    const response = await fetch(`https://portal.steadfast.com.bd/api/v1/status_by_tracking/${trackingCode}`, {
      method: 'GET',
      headers: {
        'Api-Key': config.api_key,
        'Secret-Key': config.secret_key,
        'Content-Type': 'application/json'
      }
    });

    const result = await response.json();

    if (response.ok && result.status === 200) {
      const courierStatus = result.delivery_status || 'pending';
      const consignmentId = result.consignment_id || result.id;

      // 3. Update Order in DB
      const updatePayload: any = {
        courier_status: courierStatus,
        updated_at: new Date().toISOString()
      };

      // Only backfill consignment ID if we have it and it's missing
      if (consignmentId) {
        updatePayload.courier_assigned_id = String(consignmentId);
      }

      await supabaseClient
        .from('orders')
        .update(updatePayload)
        .eq('tracking_id', trackingCode);

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } else {
      return new Response(JSON.stringify({ 
        success: false, 
        error: result.message || 'Courier Status Error',
        details: result 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      });
    }

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An unknown error occurred';
    console.error('Ratio Check Error:', message);
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    });
  }
});
