import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const normalizeIpAddress = (value: unknown) =>
  String(value || "").trim().toLowerCase();

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { action, ipAddress, reason, orderId } = await req.json();

    if (action !== "block-ip") {
      throw new Error(`Unknown action: ${action}`);
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "").trim();
    const { data: { user: caller }, error: callerError } = await supabaseAdmin.auth.getUser(token);
    if (callerError || !caller) throw new Error("Invalid caller");

    const { data: rolesData, error: rolesError } = await supabaseAdmin
      .from("user_roles")
      .select("role_id")
      .eq("user_id", caller.id);

    if (rolesError) throw rolesError;

    const roles = (rolesData || []).map((role) => role.role_id);
    const canBlock = roles.includes("Admin") || roles.includes("Call Team");
    if (!canBlock) {
      throw new Error("Unauthorized: Only Admin or Call Team can block fake order IPs");
    }

    let normalizedIp = normalizeIpAddress(ipAddress);
    let order: Record<string, unknown> | null = null;

    if (orderId) {
      const { data: orderData, error: orderError } = await supabaseAdmin
        .from("orders")
        .select("id, ip_address, customer_name, phone")
        .eq("id", orderId)
        .single();

      if (orderError || !orderData) {
        throw new Error(`Order not found: ${orderError?.message || orderId}`);
      }

      order = orderData;
      const orderIp = normalizeIpAddress(orderData.ip_address);
      if (orderIp) {
        normalizedIp = orderIp;
      }
    }

    if (!normalizedIp) {
      throw new Error("IP address is required.");
    }

    const callerName =
      caller.user_metadata?.name ||
      caller.user_metadata?.full_name ||
      caller.email ||
      "Call Team";

    const blockReason = String(reason || "").trim() ||
      `Blocked from fake order${orderId ? ` #${orderId}` : ""}`;

    const { data: block, error: blockError } = await supabaseAdmin
      .from("blocked_ip_addresses")
      .upsert({
        ip_address: normalizedIp,
        reason: blockReason,
        is_active: true,
        blocked_by: caller.id,
        blocked_by_name: callerName,
        updated_at: new Date().toISOString(),
      }, { onConflict: "ip_address" })
      .select("*")
      .single();

    if (blockError) throw blockError;

    if (orderId) {
      await supabaseAdmin.from("order_activity_logs").insert({
        order_id: orderId,
        action_type: "UPDATE",
        changed_by_user_id: caller.id,
        changed_by_user_name: callerName,
        action_description: `${callerName} blocked IP ${normalizedIp} from Fake Order #${orderId}${order?.customer_name ? ` (${order.customer_name})` : ""}.`,
      });
    }

    return new Response(JSON.stringify({ success: true, block }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
