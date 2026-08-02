import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = Deno.env.get("GROQ_MODEL") ?? "llama-3.3-70b-versatile";
const CACHE_TTL_MS = 5_000;
const ORDER_STATUS_NAMES = [
  "New",
  "Pending Call",
  "Final Call Pending",
  "Confirmed",
  "Bulk Exported",
  "Courier Ready",
  "Courier Submitted",
  "Factory Processing",
  "Completed",
  "Fake Order",
  "Cancelled",
];

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

function buildChatPrompt(dbContext: Record<string, any>) {
  return `You are NovaAI, the Master AI Assistant for this Order Management System.
You have full read access to a live database snapshot for the authenticated business workspace.
Use the provided snapshots and 100% accurate pre-computed sales analytics to answer customer and admin queries.

CRITICAL RULES:
- When the user asks for sales reports, metrics, agent rankings, traffic conversions, or product sales for a specific period (e.g. today, yesterday, this month), you MUST use the corresponding pre-computed flat keys in the "LIVE DATABASE ANALYTICS" section (e.g. analytics.today_metrics, analytics.today_products, analytics.yesterday_metrics, analytics.yesterday_products).
- Output the actual numbers, product names, quantities, and BDT/Taka values directly from these objects.
- Do NOT output template paths, JavaScript expressions, or placeholder strings like "{analytics.today_products...}" or "{analytics.today_metrics.revenue}". You must read the actual values from the JSON and format them nicely for the user.
- If a list (like today_products) is empty, say "No products were sold today."
- Reply in the same language the user uses (Default to Bengali if they use Bengali).
- Keep answers concise, structured, and accurate. Use tables or bullet points for reports.
- Use BDT/Taka formatting (e.g., ৳10,500) when monetary values are discussed.
- Never invent missing data.

=== LIVE DATABASE ANALYTICS (Last 30 Days) ===
${JSON.stringify(dbContext.analytics, null, 2)}

=== LIVE DATABASE SNAPSHOT (${dbContext.timestamp}) ===

ORDERS (Recent Sample):
${JSON.stringify(dbContext.orders)}

INVENTORY (All items):
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

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const last24Hours = new Date(now - 24 * 60 * 60 * 1000);

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  thirtyDaysAgo.setHours(0, 0, 0, 0);

  const [results, recentOrdersRes, factoryLogsRes] = await Promise.allSettled([
    Promise.all([
      supabaseAdmin
        .from("orders")
        .select("id, customer_name, phone, product_name, quantity, amount, delivery_charge, status, source, tracking_id, created_at, updated_at, shipping_zone, payment_status, ordered_items, notes")
        .order("created_at", { ascending: false })
        .limit(120),
      supabaseAdmin
        .from("inventory")
        .select("name, sku, category, current_stock, min_stock_level, unit_price, making_cost, selling_price")
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
    ]),
    supabaseAdmin
      .from("orders")
      .select("status, amount, created_by, created_at, source, notes, product_name, quantity, ordered_items")
      .gte("created_at", thirtyDaysAgo.toISOString())
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("factory_production_logs")
      .select("product_name, quantity_ready, total_cost, payment_status, production_date")
      .gte("production_date", thirtyDaysAgo.toISOString().slice(0, 10))
  ]);

  // Core base lists
  const baseDataList = results.status === "fulfilled" ? results.value : [];
  const orders = baseDataList[0]?.data || [];
  const inventory = baseDataList[1]?.data || [];
  const toyBoxes = baseDataList[2]?.data || [];
  const activityLogs = baseDataList[3]?.data || [];
  const users = baseDataList[4]?.data || [];
  const userRoles = baseDataList[5]?.data || [];
  const notifications = baseDataList[6]?.data || [];

  const allRecentOrders = recentOrdersRes.status === "fulfilled" && !recentOrdersRes.value.error ? recentOrdersRes.value.data : [];
  const factoryLogs = factoryLogsRes.status === "fulfilled" && !factoryLogsRes.value.error ? factoryLogsRes.value.data : [];

  const roleMap = userRoles.reduce((acc: any, roleRow: any) => {
    const userId = String(roleRow?.user_id || "");
    if (!acc[userId]) acc[userId] = [];
    acc[userId].push(roleRow?.role_id);
    return acc;
  }, {});

  // Pre-calculate 100% accurate sales reports
  const CONFIRMED_STATUSES = [
    'Confirmed', 'Confirmed & Printed', 'Bulk Exported', 'Courier Ready', 'Courier Submitted',
    'Factory Processing', 'Processing', 'Shipped', 'Completed'
  ];
  const isConf = (status: string, notes: string) => CONFIRMED_STATUSES.includes(status) && !(notes && notes.includes('[Was Incomplete]'));

  const emptyPeriod = () => ({
    metrics: { total: 0, confirmed: 0, revenue: 0, cancelled: 0, fake: 0, bonusConversions: 0, bonusRevenue: 0 },
    products: {} as Record<string, { name: string; qty: number; revenue: number }>,
    agents: {} as Record<string, { name: string; total: number; confirmed: number; revenue: number; bonus: number }>,
    sources: {} as Record<string, { source: string; total: number; confirmed: number; revenue: number }>
  });

  const periodStats = {
    today: emptyPeriod(),
    yesterday: emptyPeriod(),
    thisMonth: emptyPeriod(),
    last30Days: emptyPeriod()
  };

  const userMap = users.reduce((acc: any, u: any) => {
    acc[u.id] = u.name;
    return acc;
  }, {});

  allRecentOrders.forEach((o: any) => {
    const oDate = new Date(o.created_at);
    const amt = Number(o.amount || 0);
    const qty = Number(o.quantity || 1);
    const confirmed = isConf(o.status, o.notes);
    const isBonus = CONFIRMED_STATUSES.includes(o.status) && o.notes && o.notes.includes('[Was Incomplete]');

    const applyStats = (period: any) => {
      period.metrics.total++;
      if (confirmed) {
        period.metrics.confirmed++;
        period.metrics.revenue += amt;

        // Product calculations inside period
        const items = Array.isArray(o.ordered_items) && o.ordered_items.length > 0 
          ? o.ordered_items 
          : [{ name: o.product_name, quantity: qty, price: amt }];
        
        items.forEach((item: any) => {
          const pName = item.name || o.product_name || "Unknown Product";
          if (!period.products[pName]) {
            period.products[pName] = { name: pName, qty: 0, revenue: 0 };
          }
          period.products[pName].qty += Number(item.quantity || 1);
          period.products[pName].revenue += Number(item.price || 0) * Number(item.quantity || 1);
        });
      } else if (o.status === "Cancelled") {
        period.metrics.cancelled++;
      } else if (o.status === "Fake Order") {
        period.metrics.fake++;
      } else if (isBonus) {
        period.metrics.bonusConversions++;
        period.metrics.bonusRevenue += amt;
      }

      // Agent calculations inside period
      const agentId = o.created_by || "system";
      const agentName = userMap[agentId] || "System/Unassigned";
      if (!period.agents[agentId]) {
        period.agents[agentId] = { name: agentName, total: 0, confirmed: 0, revenue: 0, bonus: 0 };
      }
      period.agents[agentId].total++;
      if (confirmed) {
        period.agents[agentId].confirmed++;
        period.agents[agentId].revenue += amt;
      }
      if (isBonus) {
        period.agents[agentId].bonus++;
      }

      // Source calculations inside period
      const src = o.source || "Unknown";
      if (!period.sources[src]) {
        period.sources[src] = { source: src, total: 0, confirmed: 0, revenue: 0 };
      }
      period.sources[src].total++;
      if (confirmed) {
        period.sources[src].confirmed++;
        period.sources[src].revenue += amt;
      }
    };

    // Period calculations
    if (oDate >= todayStart) applyStats(periodStats.today);
    if (oDate >= yesterdayStart && oDate < todayStart) applyStats(periodStats.yesterday);
    if (oDate >= startOfMonth) applyStats(periodStats.thisMonth);
    applyStats(periodStats.last30Days);
  });

  const sortValues = (p: any, key: string, limit = 10) => {
    return Object.values(p[key]).sort((a: any, b: any) => {
      if (key === 'products') return b.qty - a.qty;
      return b.confirmed - a.confirmed;
    }).slice(0, limit);
  };

  // Factory Production Calculations
  let factQty = 0, factCost = 0, factPaid = 0, factDue = 0;
  const factBreakdown: Record<string, { qty: number; cost: number; paid: number; due: number }> = {};
  
  factoryLogs.forEach((log: any) => {
    const qty = Number(log.quantity_ready || 0);
    const cost = Number(log.total_cost || 0);
    const isPaid = log.payment_status === 'Paid';

    factQty += qty;
    factCost += cost;
    if (isPaid) factPaid += cost;
    else factDue += cost;

    const pName = log.product_name;
    if (!factBreakdown[pName]) {
      factBreakdown[pName] = { qty: 0, cost: 0, paid: 0, due: 0 };
    }
    factBreakdown[pName].qty += qty;
    factBreakdown[pName].cost += cost;
    if (isPaid) factBreakdown[pName].paid += cost;
    else factBreakdown[pName].due += cost;
  });

  const context = {
    timestamp: new Date().toISOString(),
    analytics: {
      note: "Pre-computed 100% accurate sales and factory stats. Use these keys directly.",
      
      today_metrics: periodStats.today.metrics,
      today_products: sortValues(periodStats.today, 'products', 15),
      today_agents: sortValues(periodStats.today, 'agents', 10),
      today_sources: sortValues(periodStats.today, 'sources', 10),

      yesterday_metrics: periodStats.yesterday.metrics,
      yesterday_products: sortValues(periodStats.yesterday, 'products', 15),
      yesterday_agents: sortValues(periodStats.yesterday, 'agents', 10),
      yesterday_sources: sortValues(periodStats.yesterday, 'sources', 10),

      this_month_metrics: periodStats.thisMonth.metrics,
      this_month_products: sortValues(periodStats.thisMonth, 'products', 15),
      this_month_agents: sortValues(periodStats.thisMonth, 'agents', 10),

      last_30_days_metrics: periodStats.last30Days.metrics,
      last_30_days_products: sortValues(periodStats.last30Days, 'products', 15),
      last_30_days_agents: sortValues(periodStats.last30Days, 'agents', 10),

      factory_summary: {
        total_quantity_produced: factQty,
        total_manufacturing_cost: factCost,
        total_paid: factPaid,
        total_due: factDue,
        breakdown: factBreakdown
      }
    },
    orders: {
      recent: orders.slice(0, 40),
    },
    inventory: {
      items: inventory,
      lowStockAlerts: inventory
        .filter((item: any) => Number(item?.current_stock || 0) <= Number(item?.min_stock_level || 0))
        .map((item: any) => ({
          min: item?.min_stock_level,
          name: item?.name,
          stock: item?.current_stock,
        })),
      outOfStock: inventory
        .filter((item: any) => Number(item?.current_stock || 0) === 0)
        .map((item: any) => item?.name),
      totalProducts: inventory.length,
    },
    notifications: notifications.slice(0, 10),
    recentActivity: activityLogs.slice(0, 15),
    team: users.map((user: any) => ({
      email: user?.email,
      joined: user?.created_at,
      name: user?.name,
      roles: roleMap[String(user?.id || "")] || [],
      status: user?.status,
    })),
    toyBoxes: {
      all: toyBoxes,
      emptyBoxNumbers: toyBoxes
        .filter((box: any) => Number(box?.stock_quantity || 0) === 0)
        .map((box: any) => box?.toy_box_number),
      total: toyBoxes.length,
      totalStock: toyBoxes.reduce((sum: number, box: any) => sum + Number(box?.stock_quantity || 0), 0),
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
    return new Response(null, { status: 204, headers: corsHeaders });
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
        forceFresh: body?.forceFresh !== false,
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

    throw new Error("Unsupported action");
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, 400);
  }
});
