import { supabase } from './supabase';

const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY;
const GROQ_MODEL = 'llama-3.3-70b-versatile';
const CACHE_TTL_MS = 60_000; // 60 seconds

let cachedContext = null;
let cachedAt = 0;

/**
 * Gather a comprehensive snapshot of the database to feed into the AI system prompt.
 * Results are cached for CACHE_TTL_MS to avoid hammering Supabase on rapid messages.
 */
async function gatherDatabaseContext() {
  const now = Date.now();
  if (cachedContext && now - cachedAt < CACHE_TTL_MS) {
    return cachedContext;
  }

  const results = await Promise.allSettled([
    // 1. Orders summary
    supabase.from('orders').select('id, customer_name, phone, product_name, quantity, amount, status, source, tracking_id, created_at, shipping_zone, payment_status, ordered_items').order('created_at', { ascending: false }).limit(50),
    // 2. Inventory
    supabase.from('inventory').select('name, sku, category, current_stock, min_stock_level, unit_price').order('name'),
    // 3. Toy Box inventory
    supabase.from('toy_box_inventory').select('toy_box_number, stock_quantity').order('toy_box_number'),
    // 4. Recent activity logs
    supabase.from('order_activity_logs').select('order_id, action_type, old_status, new_status, changed_by_user_name, action_description, timestamp').order('timestamp', { ascending: false }).limit(30),
    // 5. Users
    supabase.from('users').select('id, name, email, status, created_at'),
    // 6. User roles
    supabase.from('user_roles').select('user_id, role_id'),
    // 7. Notifications
    supabase.from('notifications').select('type, title, message, is_read, created_at').order('created_at', { ascending: false }).limit(15),
  ]);

  const safe = (r) => (r.status === 'fulfilled' && !r.value.error ? r.value.data : []);

  const orders = safe(results[0]);
  const inventory = safe(results[1]);
  const toyBoxes = safe(results[2]);
  const activityLogs = safe(results[3]);
  const users = safe(results[4]);
  const userRoles = safe(results[5]);
  const notifications = safe(results[6]);

  // Build compact order stats
  const statusCounts = {};
  let totalRevenue = 0;
  orders.forEach((o) => {
    statusCounts[o.status] = (statusCounts[o.status] || 0) + 1;
    totalRevenue += Number(o.amount || 0);
  });

  // Build user → roles map
  const roleMap = {};
  userRoles.forEach((ur) => {
    if (!roleMap[ur.user_id]) roleMap[ur.user_id] = [];
    roleMap[ur.user_id].push(ur.role_id);
  });

  const usersWithRoles = users.map((u) => ({
    name: u.name,
    email: u.email,
    status: u.status,
    roles: roleMap[u.id] || [],
    joined: u.created_at,
  }));

  // Low stock & out of stock
  const lowStock = inventory.filter((i) => i.current_stock <= i.min_stock_level && i.current_stock > 0);
  const outOfStock = inventory.filter((i) => i.current_stock === 0);

  // Toy box summary
  const totalToyBoxStock = toyBoxes.reduce((sum, b) => sum + (b.stock_quantity || 0), 0);
  const emptyToyBoxes = toyBoxes.filter((b) => b.stock_quantity === 0);

  const context = {
    timestamp: new Date().toISOString(),
    orders: {
      total: orders.length,
      statusBreakdown: statusCounts,
      totalRevenue,
      recent: orders.slice(0, 15).map((o) => ({
        id: o.id,
        customer: o.customer_name,
        phone: o.phone,
        product: o.product_name,
        qty: o.quantity,
        amount: o.amount,
        status: o.status,
        source: o.source,
        tracking: o.tracking_id || null,
        zone: o.shipping_zone,
        payment: o.payment_status,
        items: o.ordered_items,
        date: o.created_at,
      })),
    },
    inventory: {
      totalProducts: inventory.length,
      items: inventory,
      lowStockAlerts: lowStock.map((i) => ({ name: i.name, stock: i.current_stock, min: i.min_stock_level })),
      outOfStock: outOfStock.map((i) => i.name),
    },
    toyBoxes: {
      total: toyBoxes.length,
      totalStock: totalToyBoxStock,
      emptyCount: emptyToyBoxes.length,
      emptyBoxNumbers: emptyToyBoxes.map((b) => b.toy_box_number),
      all: toyBoxes.map((b) => ({ number: b.toy_box_number, stock: b.stock_quantity })),
    },
    recentActivity: activityLogs.slice(0, 15).map((l) => ({
      order: l.order_id,
      action: l.action_type,
      by: l.changed_by_user_name,
      desc: l.action_description,
      time: l.timestamp,
    })),
    team: usersWithRoles,
    notifications: notifications.slice(0, 10).map((n) => ({
      type: n.type,
      title: n.title,
      message: n.message,
      read: n.is_read,
      time: n.created_at,
    })),
  };

  cachedContext = context;
  cachedAt = now;
  return context;
}

/**
 * Build the system prompt with live database context.
 */
function buildSystemPrompt(dbContext) {
  return `You are NovaAI — the intelligent assistant for this Order Management System.
You have FULL READ ACCESS to the live database. Below is a real-time snapshot of all data.
Use this data to answer any questions accurately. If the data doesn't contain the answer, say so honestly.

IMPORTANT RULES:
- Answer in the same language the user writes in (Bangla, English, or mixed).
- Be concise but thorough. Use bullet points and numbers for clarity.
- When listing orders/items, format them neatly.
- For numbers, use proper formatting (e.g., ৳1,200 for amounts).
- You can do calculations (totals, averages, percentages) from the data.
- Never invent data that isn't in the snapshot.
- Be helpful, professional, and friendly.
- For "how many" questions, count from the data accurately.
- currency is Bangladeshi Taka (৳ / BDT).

=== LIVE DATABASE SNAPSHOT (as of ${dbContext.timestamp}) ===

📦 ORDERS (${dbContext.orders.total} total, Revenue: ৳${dbContext.orders.totalRevenue.toLocaleString()}):
Status breakdown: ${JSON.stringify(dbContext.orders.statusBreakdown)}
Recent orders: ${JSON.stringify(dbContext.orders.recent)}

📊 INVENTORY (${dbContext.inventory.totalProducts} products):
All items: ${JSON.stringify(dbContext.inventory.items)}
Low stock alerts: ${JSON.stringify(dbContext.inventory.lowStockAlerts)}
Out of stock: ${JSON.stringify(dbContext.inventory.outOfStock)}

🧸 TOY BOX INVENTORY (${dbContext.toyBoxes.total} boxes, ${dbContext.toyBoxes.totalStock} total units):
Empty boxes (${dbContext.toyBoxes.emptyCount}): #${dbContext.toyBoxes.emptyBoxNumbers.join(', #')}
All boxes: ${JSON.stringify(dbContext.toyBoxes.all)}

📋 RECENT ACTIVITY:
${JSON.stringify(dbContext.recentActivity)}

👥 TEAM MEMBERS:
${JSON.stringify(dbContext.team)}

🔔 RECENT NOTIFICATIONS:
${JSON.stringify(dbContext.notifications)}

=== END OF DATABASE SNAPSHOT ===`;
}

/**
 * Send a message to Groq AI with database context.
 * @param {string} userMessage - The user's question
 * @param {Array} chatHistory - Previous messages [{role: 'user'|'assistant', content: string}]
 * @returns {string} AI response
 */
export async function sendChatMessage(userMessage, chatHistory = []) {
  if (!GROQ_API_KEY) {
    throw new Error('Groq API key is not configured. Add VITE_GROQ_API_KEY to your .env.local file.');
  }

  const dbContext = await gatherDatabaseContext();
  const systemPrompt = buildSystemPrompt(dbContext);

  // Build message array: system → history → new user message
  const messages = [
    { role: 'system', content: systemPrompt },
    ...chatHistory.slice(-10), // Keep last 10 messages for context window
    { role: 'user', content: userMessage },
  ];

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.3,
      max_tokens: 2048,
      messages,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Groq API error (${response.status}): ${errorText}`);
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('No response generated from AI.');
  }

  return content.trim();
}

/**
 * Force-refresh the database context cache.
 */
export function invalidateChatCache() {
  cachedContext = null;
  cachedAt = 0;
}
