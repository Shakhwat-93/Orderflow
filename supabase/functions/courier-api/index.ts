import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

interface CourierConfig {
  api_key: string;
  secret_key: string;
  is_enabled: boolean;
  auto_dispatch?: boolean;
}

function formatBdPhone(phone: string | null | undefined): string {
  if (!phone) return '01700000000';
  let clean = String(phone).replace(/\D/g, '');
  if (clean.length > 11 && clean.startsWith('880')) {
    clean = clean.slice(2);
  } else if (clean.length > 11 && clean.startsWith('88')) {
    clean = clean.slice(2);
  }
  if (clean.length === 10 && !clean.startsWith('0')) {
    clean = '0' + clean;
  }
  if (clean.length !== 11 || !clean.startsWith('01')) {
    const match = clean.match(/01\d{9}/);
    if (match) return match[0];
  }
  return clean;
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
      throw new Error(`Order not found: ${orderError?.message || 'Unknown error'}`);
    }

    // 2. Fetch Courier Config
    const { data: configData, error: configError } = await supabaseClient
      .from('system_configs')
      .select('value')
      .eq('key', 'courier_steadfast')
      .single();

    if (configError || !configData || !configData.value) {
      throw new Error('Steadfast courier configuration not found in Settings.');
    }

    const config = configData.value as CourierConfig;
    if (!config.api_key || !config.secret_key) {
      throw new Error('Steadfast API Key or Secret Key is missing in Settings.');
    }

    if (config.is_enabled === false) {
      throw new Error('Steadfast integration is currently disabled in Settings.');
    }

    // 3. Prepare Sanitized Payload for Steadfast API
    const formattedPhone = formatBdPhone(order.phone);
    const codAmount = Math.max(0, Math.round(Number(order.total_amount ?? order.total_price ?? order.amount ?? 0)));
    const cleanAddress = (order.address || order.shipping_address || 'Dhaka, Bangladesh').trim();
    const cleanName = (order.customer_name || 'Customer').trim().slice(0, 100);
    const noteContent = `${order.product_name || ''} ${order.size ? `(Size: ${order.size})` : ''}`.trim().slice(0, 250);

    const payload = {
      invoice: String(order.id).trim(),
      recipient_name: cleanName,
      recipient_phone: formattedPhone,
      recipient_address: cleanAddress.length >= 5 ? cleanAddress : `${cleanAddress}, Dhaka`,
      cod_amount: codAmount,
      note: noteContent || 'Standard Delivery'
    };

    console.log(`Submitting order ${orderId} to Steadfast API:`, payload);

    // 4. Call Steadfast API
    const response = await fetch('https://portal.packzy.com/api/v1/create_order', {
      method: 'POST',
      headers: {
        'Api-Key': config.api_key.trim(),
        'Secret-Key': config.secret_key.trim(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    console.log(`Steadfast API Response for order ${orderId}:`, result);

    const isSuccess = (response.ok && (result.status === 200 || result.status === '200')) || Boolean(result.consignment?.tracking_code);

    if (isSuccess) {
      const consignment = result.consignment || result;
      const trackingCode = consignment.tracking_code || result.tracking_code;
      const consignmentId = consignment.consignment_id || consignment.id || result.consignment_id;
      const courierStatus = consignment.status || result.status || 'in_review';
      
      // 5. Update Order with Tracking ID and Consignment ID
      await supabaseClient
        .from('orders')
        .update({ 
          tracking_id: trackingCode,
          courier_assigned_id: consignmentId ? String(consignmentId) : null,
          courier_name: 'Steadfast',
          courier_status: courierStatus,
          status: 'Courier Submitted',
          dispatched_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId);

      // 6. Log Activity
      await supabaseClient.from('order_activity_logs').insert({
        order_id: orderId,
        action_type: 'COURIER_DISPATCH',
        action_description: `Order submitted to Steadfast. Consignment ID: ${consignmentId}, Tracking: ${trackingCode}`,
        changed_by_user_name: 'Steadfast Integration'
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
      let errorMsg = result.message || 'Courier API Rejected Request';
      if (result.errors && typeof result.errors === 'object') {
        const errorDetails = Object.entries(result.errors)
          .map(([key, val]) => `${key}: ${Array.isArray(val) ? val.join(', ') : val}`)
          .join('; ');
        errorMsg += ` (${errorDetails})`;
      }
      console.error('Steadfast API Error:', errorMsg);
      
      // Log failure
      await supabaseClient.from('order_activity_logs').insert({
        order_id: orderId,
        action_type: 'COURIER_ERROR',
        action_description: `Failed to submit to Steadfast: ${errorMsg}`,
        changed_by_user_name: 'Steadfast Integration'
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

  } catch (error: any) {
    console.error('Courier Junction Error:', error.message);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    });
  }
});
