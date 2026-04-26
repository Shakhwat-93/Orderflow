import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = Deno.env.get("GROQ_MODEL") ?? "llama-3.3-70b-versatile";
const CACHE_TTL_MS = 60_000;

let cachedContext: Record<string, unknown> | null = null;
let cachedAt = 0;

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

async function getAuthenticatedUser(req: Request, supabaseAdmin: ReturnType<typeof createClient>) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    throw new Error("Missing authorization header.");
  }

  const token = authHeader.replace("Bearer ", "").trim();
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) {
    throw new Error("Unauthorized request.");
  }

  return data.user;
}

async function callGroq(messages: Array<{ role: string; content: string }>) {
  const apiKey = Deno.env.get("GROQ_API_KEY");
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not configured.");
  }

  const response = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      max_tokens: 2048,
      messages,
      model: GROQ_MODEL,
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Groq API error (${response.status}): ${errorText}`);
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("No AI response generated.");
  }

  return String(content).trim();
}

function buildChatPrompt(dbContext: Record<string, unknown>) {
  return `You are NovaAI, the intelligent assistant for this Order Management System.
You have full read access to a live database snapshot for the authenticated business workspace.
Use the provided snapshot to answer accurately. If the snapshot does not contain the answer, say so honestly.

Rules:
- Reply in the same language the user uses.
- Keep answers concise, structured, and accurate.
- Use BDT/Taka formatting when monetary values are discussed.
- Never invent missing data.

=== LIVE DATABASE SNAPSHOT (${dbContext.timestamp}) ===

ORDERS:
${JSON.stringify(dbContext.orders)}

INVENTORY:
${JSON.stringify(dbContext.inventory)}

TOY BOX INVENTORY:
${JSON.stringify(dbContext.toyBoxes)}

RECENT ACTIVITY:
${JSON.stringify(dbContext.recentActivity)}

TEAM:
${JSON.stringify(dbContext.team)}

NOTIFICATIONS:
${JSON.stringify(dbContext.notifications)}

=== END SNAPSHOT ===`;
}

function parseStrictJson(content: string) {
  const cleaned = content
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  return JSON.parse(cleaned);
}

function normalizeInvoiceItems(items: unknown[]) {
  return items
    .map((item) => ({
      product: String((item as Record<string, unknown>)?.product || "").trim(),
      quantity: Math.max(1, parseInt(String((item as Record<string, unknown>)?.quantity || "1"), 10) || 1),
      sourceLine: String((item as Record<string, unknown>)?.sourceLine || (item as Record<string, unknown>)?.product || "").trim(),
    }))
    .filter((item) => item.product);
}

function normalizeOrderPayload(parsed: Record<string, unknown>) {
  return {
    address: String(parsed?.address || "").trim(),
    customer_name: String(parsed?.customer_name || "").trim(),
    extracted_subtotal: parsed?.extracted_subtotal ? parseFloat(String(parsed.extracted_subtotal)) : null,
    notes: String(parsed?.notes || "").trim(),
    phone: String(parsed?.phone || "").trim().replace(/[^0-9+]/g, ""),
    products: Array.isArray(parsed?.products)
      ? parsed.products.map((product) => ({
          name: String((product as Record<string, unknown>)?.name || "").trim(),
          quantity: Math.max(1, parseInt(String((product as Record<string, unknown>)?.quantity || "1"), 10) || 1),
          size: String((product as Record<string, unknown>)?.size || "").trim(),
        }))
      : [],
    shipping_zone: parsed?.shipping_zone === "Inside Dhaka" ? "Inside Dhaka" : "Outside Dhaka",
  };
}

async function gatherDatabaseContext(supabaseAdmin: ReturnType<typeof createClient>, { forceFresh = false } = {}) {
  const now = Date.now();
  if (!forceFresh && cachedContext && now - cachedAt < CACHE_TTL_MS) {
    return cachedContext;
  }

  const results = await Promise.allSettled([
    supabaseAdmin
      .from("orders")
      .select("id, customer_name, phone, product_name, quantity, amount, status, source, tracking_id, created_at, shipping_zone, payment_status, ordered_items")
      .order("created_at", { ascending: false })
      .limit(50),
    supabaseAdmin
      .from("inventory")
      .select("name, sku, category, current_stock, min_stock_level, unit_price")
      .order("name"),
    supabaseAdmin
      .from("toy_box_inventory")
      .select("toy_box_number, stock_quantity")
      .order("toy_box_number"),
    supabaseAdmin
      .from("order_activity_logs")
      .select("order_id, action_type, old_status, new_status, changed_by_user_name, action_description, timestamp")
      .order("timestamp", { ascending: false })
      .limit(30),
    supabaseAdmin
      .from("users")
      .select("id, name, email, status, created_at"),
    supabaseAdmin
      .from("user_roles")
      .select("user_id, role_id"),
    supabaseAdmin
      .from("notifications")
      .select("type, title, message, is_read, created_at")
      .order("created_at", { ascending: false })
      .limit(15),
  ]);

  const safe = (result: PromiseSettledResult<Record<string, unknown>>) =>
    result.status === "fulfilled" && !(result.value as Record<string, unknown>)?.error
      ? ((result.value as Record<string, unknown>).data as unknown[])
      : [];

  const orders = safe(results[0] as PromiseSettledResult<Record<string, unknown>>);
  const inventory = safe(results[1] as PromiseSettledResult<Record<string, unknown>>);
  const toyBoxes = safe(results[2] as PromiseSettledResult<Record<string, unknown>>);
  const activityLogs = safe(results[3] as PromiseSettledResult<Record<string, unknown>>);
  const users = safe(results[4] as PromiseSettledResult<Record<string, unknown>>);
  const userRoles = safe(results[5] as PromiseSettledResult<Record<string, unknown>>);
  const notifications = safe(results[6] as PromiseSettledResult<Record<string, unknown>>);

  const statusBreakdown = orders.reduce((acc, order) => {
    const status = String((order as Record<string, unknown>)?.status || "Unknown");
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const totalRevenue = orders.reduce(
    (sum, order) => sum + Number((order as Record<string, unknown>)?.amount || 0),
    0,
  );

  const roleMap = userRoles.reduce((acc, roleRow) => {
    const userId = String((roleRow as Record<string, unknown>)?.user_id || "");
    if (!acc[userId]) {
      acc[userId] = [];
    }
    acc[userId].push((roleRow as Record<string, unknown>)?.role_id);
    return acc;
  }, {} as Record<string, unknown[]>);

  const context = {
    timestamp: new Date().toISOString(),
    orders: {
      recent: orders.slice(0, 15),
      statusBreakdown,
      total: orders.length,
      totalRevenue,
    },
    inventory: {
      items: inventory,
      lowStockAlerts: inventory
        .filter((item) => Number((item as Record<string, unknown>)?.current_stock || 0) <= Number((item as Record<string, unknown>)?.min_stock_level || 0))
        .map((item) => ({
          min: (item as Record<string, unknown>)?.min_stock_level,
          name: (item as Record<string, unknown>)?.name,
          stock: (item as Record<string, unknown>)?.current_stock,
        })),
      outOfStock: inventory
        .filter((item) => Number((item as Record<string, unknown>)?.current_stock || 0) === 0)
        .map((item) => (item as Record<string, unknown>)?.name),
      totalProducts: inventory.length,
    },
    notifications: notifications.slice(0, 10),
    recentActivity: activityLogs.slice(0, 15),
    team: users.map((user) => ({
      email: (user as Record<string, unknown>)?.email,
      joined: (user as Record<string, unknown>)?.created_at,
      name: (user as Record<string, unknown>)?.name,
      roles: roleMap[String((user as Record<string, unknown>)?.id || "")] || [],
      status: (user as Record<string, unknown>)?.status,
    })),
    toyBoxes: {
      all: toyBoxes,
      emptyBoxNumbers: toyBoxes
        .filter((box) => Number((box as Record<string, unknown>)?.stock_quantity || 0) === 0)
        .map((box) => (box as Record<string, unknown>)?.toy_box_number),
      total: toyBoxes.length,
      totalStock: toyBoxes.reduce((sum, box) => sum + Number((box as Record<string, unknown>)?.stock_quantity || 0), 0),
    },
  };

  cachedContext = context;
  cachedAt = now;
  return context;
}

function invoicePrompt(invoiceText: string) {
  return `You are an invoice line parser. Extract purchasable product lines and quantity from raw invoice text.
Return STRICT JSON only (no markdown), in this exact shape:
{"items":[{"product":"string","quantity":number,"sourceLine":"string"}]}
Rules:
- quantity must be integer >= 1
- ignore totals, VAT, discount, customer/phone/address/date/invoice number lines
- if quantity is missing, use 1
- keep product concise but faithful
Raw invoice:
${invoiceText}`;
}

function orderPrompt(rawText: string) {
  return `You are an expert order extractor for a premium Order Management System.
From the raw input below (WhatsApp text or spreadsheet rows), extract customer details and products.

Return STRICT JSON only with this exact shape:
{
  "customer_name": "string",
  "phone": "string",
  "address": "string",
  "products": [{ "name": "string", "quantity": number, "size": "string" }],
  "shipping_zone": "Inside Dhaka" | "Outside Dhaka",
  "extracted_subtotal": number | null,
  "notes": "string"
}

Rules:
- Use "Outside Dhaka" by default unless the address clearly indicates a Dhaka city area.
- Keep quantity integer >= 1.
- Split multiple toy box serials into separate product objects when obvious.
- No prose. No markdown. JSON only.

Raw input:
${rawText}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    await getAuthenticatedUser(req, supabaseAdmin);

    const body = await req.json();
    const action = String(body?.action || "");

    if (action === "chat") {
      const userMessage = String(body?.userMessage || "").trim();
      if (!userMessage) {
        throw new Error("User message is required.");
      }

      const dbContext = await gatherDatabaseContext(supabaseAdmin, {
        forceFresh: Boolean(body?.forceFresh),
      });
      const chatHistory = Array.isArray(body?.chatHistory) ? body.chatHistory.slice(-10) : [];

      const reply = await callGroq([
        { role: "system", content: buildChatPrompt(dbContext) },
        ...chatHistory,
        { role: "user", content: userMessage },
      ]);

      return jsonResponse({ reply });
    }

    if (action === "extract-invoice") {
      const invoiceText = String(body?.invoiceText || "").trim();
      if (!invoiceText) {
        throw new Error("Invoice text is required.");
      }

      const response = await callGroq([
        { role: "system", content: "Return strict JSON only. No prose. No markdown." },
        { role: "user", content: invoicePrompt(invoiceText) },
      ]);

      const parsed = parseStrictJson(response);
      const items = normalizeInvoiceItems(Array.isArray(parsed?.items) ? parsed.items : []);
      return jsonResponse({ items });
    }

    if (action === "extract-order") {
      const rawText = String(body?.rawText || "").trim();
      if (!rawText) {
        throw new Error("Raw order text is required.");
      }

      const response = await callGroq([
        { role: "system", content: "Return strict JSON only. No prose. No markdown." },
        { role: "user", content: orderPrompt(rawText) },
      ]);

      const parsed = parseStrictJson(response);
      return jsonResponse({ order: normalizeOrderPayload(parsed) });
    }

    throw new Error(`Unsupported action: ${action}`);
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, 400);
  }
});
