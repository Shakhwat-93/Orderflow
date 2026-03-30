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

    const { orderId } = await req.json();

    if (!orderId) {
      throw new Error('Missing orderId');
    }

    // 1. Fetch Order Details
    const { data: order, error: orderError } = await supabaseClient
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      throw new Error(`Order not found: ${orderError?.message}`);
    }

    // 2. Fetch Courier Config
    const { data: configData, error: configError } = await supabaseClient
      .from('system_configs')
      .select('value')
      .eq('key', 'courier_steadfast')
      .single();

    if (configError || !configData) {
      throw new Error('Courier configuration not found');
    }

    const config = configData.value as CourierConfig;
    if (!config.is_enabled) {
      throw new Error('Steadfast integration is disabled');
    }

    // 3. Prepare Payload for Steadfast
    const payload = {
      invoice: order.id,
      recipient_name: order.customer_name,
      recipient_phone: order.phone,
      recipient_address: order.address || 'Dhaka, Bangladesh',
      cod_amount: parseFloat(String(order.amount || 0)),
      note: `${order.product_name || ''} ${order.size ? `(Size: ${order.size})` : ''}`.slice(0, 250)
    };

    console.log(`Submitting order ${orderId} to Steadfast...`);

    // 4. Call Steadfast API
    const response = await fetch('https://portal.steadfast.com.bd/api/v1/create_order', {
      method: 'POST',
      headers: {
        'Api-Key': config.api_key,
        'Secret-Key': config.secret_key,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (response.ok && result.status === 200) {
      const consignment = result.consignment || result;
      const trackingCode = consignment.tracking_code;
      const consignmentId = consignment.consignment_id || consignment.id;
      
      // 5. Update Order with Tracking ID and Consignment ID
      await supabaseClient
        .from('orders')
        .update({ 
          tracking_id: trackingCode,
          courier_assigned_id: consignmentId ? String(consignmentId) : null,
          courier_name: 'Steadfast',
          status: 'Courier Submitted',
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId);

      // 6. Log Activity
      await supabaseClient.from('order_activity_logs').insert({
        order_id: orderId,
        action_type: 'COURIER_DISPATCH',
        action_description: `Order successfully submitted to Steadfast. Consignment ID: ${consignmentId}, Tracking: ${trackingCode}`,
        changed_by_user_name: 'Steadfast Automation'
      });

      return new Response(JSON.stringify({ 
        success: true, 
        trackingCode, 
        consignmentId,
        details: result 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } else {
      const errorMsg = result.errors ? JSON.stringify(result.errors) : (result.message || 'Unknown Courier Error');
      console.error('Steadfast API Error:', errorMsg);
      
      // Log failure
      await supabaseClient.from('order_activity_logs').insert({
        order_id: orderId,
        action_type: 'COURIER_ERROR',
        action_description: `Failed to submit to Steadfast: ${errorMsg}`,
        changed_by_user_name: 'Steadfast Automation'
      });

      return new Response(JSON.stringify({ 
        success: false, 
        error: errorMsg,
        details: result 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      });
    }

  } catch (error) {
    console.error('Courier Junction Error:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    });
  }
});
