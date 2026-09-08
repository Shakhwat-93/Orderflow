import { supabase } from '../lib/supabase.js';
import { parseDateAndIntent, getDhakaNow } from './aiDateParser.js';
import { executeAiTool, getOrderCount } from './orderQueryService.js';

const AI_FUNCTION_NAME = 'nova-ai';
const VITE_SUPABASE_URL = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) || (typeof process !== 'undefined' && process.env?.VITE_SUPABASE_URL) || '';
const AI_FUNCTION_URL = `${VITE_SUPABASE_URL}/functions/v1/${AI_FUNCTION_NAME}`;
const SUPABASE_ANON_KEY = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY) || (typeof process !== 'undefined' && process.env?.VITE_SUPABASE_ANON_KEY) || '';
const OPENROUTER_API_KEY = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_OPENROUTER_API_KEY) || (typeof process !== 'undefined' && process.env?.VITE_OPENROUTER_API_KEY) || '';
const OPENROUTER_MODEL = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_OPENROUTER_MODEL) || (typeof process !== 'undefined' && process.env?.VITE_OPENROUTER_MODEL) || 'openai/gpt-4o-mini';
let forceFreshNextRequest = false;

/**
 * Call OpenRouter API directly from client (Fast, reliable, multi-model)
 */
export async function callOpenRouter(messages, temperature = 0.2) {
  if (!OPENROUTER_API_KEY) return null;

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'https://orderflow.app',
      'X-Title': 'OrderFlow AI'
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages,
      temperature
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenRouter error (${res.status}): ${errText}`);
  }

  const json = await res.json();
  return json?.choices?.[0]?.message?.content || null;
}

/**
 * Gather live database context for NovaAI
 */
async function gatherLiveClientContext() {
  const offset = 6 * 60; // Asia/Dhaka UTC+6
  const now = new Date();
  const bdtDate = new Date(now.getTime() + (offset * 60 * 1000));
  const bdtMidnight = new Date(Date.UTC(bdtDate.getUTCFullYear(), bdtDate.getUTCMonth(), bdtDate.getUTCDate(), 0, 0, 0) - (offset * 60 * 1000));

  try {
    const [ordersTodayRes, totalOrdersRes, recentOrdersRes, toyBoxesRes, usersRes] = await Promise.all([
      supabase.from('orders').select('id, amount, status, source, product_name, customer_name, created_at').gte('created_at', bdtMidnight.toISOString()),
      supabase.from('orders').select('*', { count: 'exact', head: true }),
      supabase.from('orders').select('id, customer_name, product_name, amount, status, created_at').order('created_at', { ascending: false }).limit(6),
      supabase.from('toy_box_inventory').select('toy_box_number, stock_quantity').limit(15),
      supabase.from('users').select('name, email, status').limit(10)
    ]);

    const todayOrders = ordersTodayRes.data || [];
    const statusBreakdown = {};
    const sourceBreakdown = {};
    let todayRevenue = 0;

    todayOrders.forEach(o => {
      statusBreakdown[o.status] = (statusBreakdown[o.status] || 0) + 1;
      sourceBreakdown[o.source || 'Direct'] = (sourceBreakdown[o.source || 'Direct'] || 0) + 1;
      todayRevenue += Number(o.amount) || 0;
    });

    return {
      todayOrdersCount: todayOrders.length,
      todayRevenue,
      statusBreakdown,
      sourceBreakdown,
      totalOrders: totalOrdersRes.count || 0,
      recentOrders: recentOrdersRes.data || [],
      toyBoxes: toyBoxesRes.data || [],
      team: usersRes.data || []
    };
  } catch (err) {
    console.warn('Failed to gather full live context:', err);
    return {
      todayOrdersCount: 0,
      todayRevenue: 0,
      statusBreakdown: {},
      sourceBreakdown: {},
      totalOrders: 0,
      recentOrders: [],
      toyBoxes: [],
      team: []
    };
  }
}


async function invokeAiProxy(action, payload = {}) {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;

  if (!accessToken) {
    throw new Error('NovaAI needs an active login session. Please reload and login again.');
  }

  const response = await fetch(AI_FUNCTION_URL, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'x-client-info': 'orderflow-nova-ai',
    },
    body: JSON.stringify({
      action,
      ...payload,
    }),
  });

  const responseText = await response.text();
  let data = null;

  if (responseText) {
    try {
      data = JSON.parse(responseText);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    throw new Error(data?.error || responseText || `AI proxy request failed (${response.status}).`);
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return data;
}

export const AI_TOOLS_SCHEMA = [
  {
    type: 'function',
    function: {
      name: 'getOrderCount',
      description: 'Get exact count, total revenue amount, and status breakdown of orders from the PostgreSQL database for a specific date/time range and optional status.',
      parameters: {
        type: 'object',
        properties: {
          startIso: { type: 'string', description: 'Start datetime in UTC ISO 8601 string (e.g. 2026-09-04T12:00:00.000Z)' },
          endIso: { type: 'string', description: 'End datetime in UTC ISO 8601 string (e.g. 2026-09-05T13:50:00.000Z)' },
          status: { type: 'string', description: 'Optional status filter: Confirmed, Pending Call, New, Cancelled, Bulk Exported, Courier Ready, etc.' },
          source: { type: 'string', description: 'Optional source channel filter' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getOrders',
      description: 'Fetch detailed order rows (customer name, phone, product, amount, status) matching date range or status.',
      parameters: {
        type: 'object',
        properties: {
          startIso: { type: 'string', description: 'Start datetime in UTC ISO string' },
          endIso: { type: 'string', description: 'End datetime in UTC ISO string' },
          status: { type: 'string', description: 'Status filter' },
          limit: { type: 'number', description: 'Maximum rows to fetch (default 20)' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getOrdersByDateRange',
      description: 'Fetch orders placed within a specific date/time range.',
      parameters: {
        type: 'object',
        properties: {
          startIso: { type: 'string', description: 'Start datetime in UTC ISO string' },
          endIso: { type: 'string', description: 'End datetime in UTC ISO string' },
          limit: { type: 'number', description: 'Max orders to return' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getOrdersByStatus',
      description: 'Fetch orders filtered by a specific status.',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', description: 'Status name (e.g. Confirmed, Pending Call, Cancelled, New)' },
          startIso: { type: 'string', description: 'Start datetime in UTC ISO string' },
          endIso: { type: 'string', description: 'End datetime in UTC ISO string' },
          limit: { type: 'number', description: 'Max orders to return' }
        },
        required: ['status']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getOrderDetails',
      description: 'Fetch complete details of a single order by its order ID or customer phone number.',
      parameters: {
        type: 'object',
        properties: {
          orderId: { type: 'string', description: 'Order ID or order number (e.g. SMB-314910)' },
          phone: { type: 'string', description: 'Customer phone number' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getSalesSummary',
      description: 'Get comprehensive sales statistics: total revenue in BDT, total order count, average order value, status breakdown, and top selling products for a date range.',
      parameters: {
        type: 'object',
        properties: {
          startIso: { type: 'string', description: 'Start datetime in UTC ISO string' },
          endIso: { type: 'string', description: 'End datetime in UTC ISO string' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getProductOrderCount',
      description: 'Get total order count and item quantity sold for a specific product name or SKU within an optional date range.',
      parameters: {
        type: 'object',
        properties: {
          productName: { type: 'string', description: 'Name or part of product name (e.g. LTB-01, Canvas Travel Bag, Sunglass, Toy)' },
          startIso: { type: 'string', description: 'Start datetime in UTC ISO string' },
          endIso: { type: 'string', description: 'End datetime in UTC ISO string' }
        },
        required: ['productName']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getProductSales',
      description: 'Get sales breakdown and top selling products ranked by quantity sold within a date range.',
      parameters: {
        type: 'object',
        properties: {
          startIso: { type: 'string', description: 'Start datetime in UTC ISO string' },
          endIso: { type: 'string', description: 'End datetime in UTC ISO string' },
          limit: { type: 'number', description: 'Number of top products to return' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getPendingOrders',
      description: 'Fetch orders currently pending call or awaiting staff confirmation.',
      parameters: {
        type: 'object',
        properties: {
          startIso: { type: 'string', description: 'Start datetime in UTC ISO string' },
          endIso: { type: 'string', description: 'End datetime in UTC ISO string' },
          limit: { type: 'number', description: 'Limit rows' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getConfirmedOrders',
      description: 'Fetch confirmed orders for a given date range.',
      parameters: {
        type: 'object',
        properties: {
          startIso: { type: 'string', description: 'Start datetime in UTC ISO string' },
          endIso: { type: 'string', description: 'End datetime in UTC ISO string' },
          limit: { type: 'number', description: 'Limit rows' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getNewOrders',
      description: 'Fetch newly received unprocessed orders.',
      parameters: {
        type: 'object',
        properties: {
          startIso: { type: 'string', description: 'Start datetime in UTC ISO string' },
          endIso: { type: 'string', description: 'End datetime in UTC ISO string' },
          limit: { type: 'number', description: 'Limit rows' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getCancelledOrders',
      description: 'Fetch cancelled orders within a date range.',
      parameters: {
        type: 'object',
        properties: {
          startIso: { type: 'string', description: 'Start datetime in UTC ISO string' },
          endIso: { type: 'string', description: 'End datetime in UTC ISO string' },
          limit: { type: 'number', description: 'Limit rows' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getCustomerOrderHistory',
      description: 'Fetch all historical orders placed by a customer using their phone number or name.',
      parameters: {
        type: 'object',
        properties: {
          phone: { type: 'string', description: 'Customer phone number' },
          customerName: { type: 'string', description: 'Customer full or partial name' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getProductStock',
      description: 'Check current warehouse inventory stock levels, empty boxes, and low stock warnings.',
      parameters: {
        type: 'object',
        properties: {
          productName: { type: 'string', description: 'Optional product name or toy box identifier' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getProductDetails',
      description: 'Check product inventory specifications and stock details.',
      parameters: {
        type: 'object',
        properties: {
          productName: { type: 'string', description: 'Product name' }
        },
        required: []
      }
    }
  }
];

export async function sendChatMessage(userMessage, chatHistory = []) {
  const trimmed = String(userMessage || '').trim();
  if (!trimmed) {
    throw new Error('Message is empty.');
  }

  // 1. Date & Intent calculations (Asia/Dhaka BST Timezone UTC+6)
  const dhaka = getDhakaNow();
  const dhakaIsoNow = dhaka.nowUtc.toISOString();
  const dhakaFormatted = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: true
  }).format(dhaka.nowUtc);

  const todayStartIso = dhaka.createUtcFromDhaka(dhaka.year, dhaka.month, dhaka.date, 0, 0, 0).toISOString();
  const yesterdayStartIso = dhaka.createUtcFromDhaka(dhaka.year, dhaka.month, dhaka.date - 1, 0, 0, 0).toISOString();
  const yesterdayEndIso = dhaka.createUtcFromDhaka(dhaka.year, dhaka.month, dhaka.date - 1, 23, 59, 59, 999).toISOString();
  const thisMonthStartIso = dhaka.createUtcFromDhaka(dhaka.year, dhaka.month, 1, 0, 0, 0).toISOString();
  const last7DaysStartIso = dhaka.createUtcFromDhaka(dhaka.year, dhaka.month, dhaka.date - 7, 0, 0, 0).toISOString();

  // Out of scope detection (Requirement: don't hallucinate non-existent topics)
  const isOutOfScope = /^(iphone|আইফোন|samsung|car|bike|গাড়ি|ল্যাপটপ|আমেরিকা|আকাশ|weather|আবহাওয়া)$/i.test(trimmed.toLowerCase());
  if (isOutOfScope) {
    return "দুঃখিত, এই তথ্যটি বর্তমানে database থেকে নির্ভরযোগ্যভাবে পাওয়া যাচ্ছে না।";
  }

  // 2. OpenRouter Agentic Tool Loop
  if (OPENROUTER_API_KEY) {
    try {
      const systemPrompt = `You are NovaAI, the elite, factual database assistant for this Order Management System in Bangladesh.
Current Business Time in Bangladesh (Asia/Dhaka, UTC+6): ${dhakaFormatted}.
Current UTC ISO: ${dhakaIsoNow}.

Pre-calculated Business UTC Timestamps:
- Today Start (Dhaka midnight): "${todayStartIso}"
- Yesterday Start (Dhaka midnight): "${yesterdayStartIso}"
- Yesterday End (Dhaka 23:59:59): "${yesterdayEndIso}"
- This Month Start (Dhaka 1st midnight): "${thisMonthStartIso}"
- Last 7 Days Start: "${last7DaysStartIso}"

CRITICAL ZERO-HALLUCINATION & ACCURACY RULES:
1. You have direct database tool access. Whenever answering questions about order counts, status breakdown, revenue, products, sales, customers, or stock, YOU MUST CALL THE APPROPRIATE DATABASE TOOL(S).
2. NEVER guess, estimate, invent, or alter ANY number. Single source of truth is the database tool response.
3. If a tool returns 0 orders or 0 count, report 0 clearly and factually (e.g. "উক্ত সময়ে কোনো অর্ডার পাওয়া যায়নি (০টি অর্ডার, ৳০)।" or "০টি অর্ডার"). DO NOT say you cannot determine the number if the tool ran and returned 0.
4. Timezone conversion: Bangladesh Time is UTC+6. For custom hours like "yesterday 6:00 PM", compute UTC by subtracting 6 hours (6:00 PM BST = 12:00:00 UTC).
5. Multi-turn context: If user asks a follow-up question (e.g. "এর মধ্যে confirmed কয়টা?"), reuse the exact same date range from the previous turn with the requested status filter.
6. Language & Formatting: Reply concisely and politely in the language the user asked (Bengali or Banglish or English). Format currency in BDT with ৳ (e.g. ৳১,৪৬,১৮০ or ৳146,180).
7. If the question is about information that does not exist or cannot be found in the database, state:
"দুঃখিত, এই তথ্যটি বর্তমানে database থেকে নির্ভরযোগ্যভাবে পাওয়া যাচ্ছে না।"`;

      const formattedHistory = (chatHistory || []).slice(-8).map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content
      }));

      const messages = [
        { role: 'system', content: systemPrompt },
        ...formattedHistory,
        { role: 'user', content: trimmed }
      ];

      let loopCount = 0;
      const maxLoops = 4;

      while (loopCount < maxLoops) {
        loopCount++;

        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'https://orderflow.app',
            'X-Title': 'OrderFlow AI'
          },
          body: JSON.stringify({
            model: OPENROUTER_MODEL,
            messages,
            tools: AI_TOOLS_SCHEMA,
            tool_choice: 'auto',
            temperature: 0.1
          })
        });

        if (!res.ok) {
          const errBody = await res.text();
          throw new Error(`OpenRouter error (${res.status}): ${errBody}`);
        }

        const json = await res.json();
        const choiceMsg = json?.choices?.[0]?.message;
        if (!choiceMsg) throw new Error('No AI message returned');

        if (choiceMsg.tool_calls && choiceMsg.tool_calls.length > 0) {
          messages.push(choiceMsg);

          for (const tc of choiceMsg.tool_calls) {
            const fnName = tc.function?.name;
            let fnArgs = {};
            try {
              fnArgs = JSON.parse(tc.function?.arguments || '{}');
            } catch (e) {
              fnArgs = {};
            }

            const toolResult = await executeAiTool(fnName, fnArgs);
            messages.push({
              role: 'tool',
              tool_call_id: tc.id,
              content: JSON.stringify(toolResult)
            });
          }
          // Loop again to allow model to synthesize final answer or make subsequent tool call
          continue;
        }

        // Final conversational response returned
        if (choiceMsg.content) {
          return String(choiceMsg.content).trim();
        }
      }
    } catch (err) {
      console.warn('OpenRouter tool loop failed, falling back to deterministic handler:', err?.message);
    }
  }

  // 3. Fallback Deterministic Handler (Zero Hallucination Backup)
  const parsed = parseDateAndIntent(trimmed);
  if (parsed.isBusinessQuery) {
    const verifiedDb = await getOrderCount({
      startIso: parsed.startDate ? parsed.startDate.toISOString() : undefined,
      endIso: parsed.endDate ? parsed.endDate.toISOString() : undefined,
      status: parsed.statusFilter
    });

    if (verifiedDb?.success) {
      if (parsed.statusFilter) {
        return `${parsed.label}-এ ${parsed.statusFilter} স্ট্যাটাসের মোট অর্ডার: ${verifiedDb.count}টি (সর্বমোট মূল্য: ৳${verifiedDb.totalAmount.toLocaleString()})।`;
      }
      return `${parsed.label}-এ মোট অর্ডার হয়েছে ${verifiedDb.count}টি (সর্বমোট মূল্য: ৳${verifiedDb.totalAmount.toLocaleString()})।`;
    }
  }

  // 4. Edge proxy fallback
  try {
    const data = await invokeAiProxy('chat', {
      chatHistory,
      forceFresh: forceFreshNextRequest,
      userMessage: trimmed,
    });
    forceFreshNextRequest = false;
    if (data?.reply) return String(data.reply).trim();
  } catch (edgeErr) {
    console.warn('Edge proxy fallback failed:', edgeErr?.message);
  }

  return "দুঃখিত, এই তথ্যটি বর্তমানে database থেকে নির্ভরযোগ্যভাবে পাওয়া যাচ্ছে না।";
}

export function invalidateChatCache() {
  forceFreshNextRequest = true;
}

export async function extractInvoiceItems(invoiceText) {
  if (!invoiceText?.trim()) {
    return null;
  }

  if (OPENROUTER_API_KEY) {
    try {
      const prompt = `You are an invoice line parser. Extract purchasable product lines and quantity from raw invoice text.
Return STRICT JSON only (no markdown, no backticks):
{"items":[{"product":"string","quantity":number,"sourceLine":"string"}]}
Rules:
- quantity must be integer >= 1
- ignore totals, VAT, discount, customer/phone/address/date lines
Raw invoice:
${invoiceText}`;

      const aiResponse = await callOpenRouter([
        { role: 'system', content: 'Return strict JSON only.' },
        { role: 'user', content: prompt }
      ], 0.1);

      if (aiResponse) {
        const cleaned = aiResponse.replace(/```json/gi, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleaned);
        if (Array.isArray(parsed?.items) && parsed.items.length) {
          return parsed.items;
        }
      }
    } catch (err) {
      console.warn('OpenRouter invoice parsing failed:', err?.message);
    }
  }

  try {
    const data = await invokeAiProxy('extract-invoice', { invoiceText });
    return Array.isArray(data?.items) && data.items.length ? data.items : null;
  } catch (error) {
    console.error('Invoice AI proxy failed:', error);
    return null;
  }
}

/**
 * Local offline regex/NLP parser for orders (WhatsApp, FB, or pasted text).
 */
export function localFallbackOrderParse(rawText) {
  if (!rawText || !rawText.trim()) return null;
  const text = String(rawText).trim();
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  let customer_name = '';
  let phone = '';
  let address = '';
  let shipping_zone = 'Outside Dhaka';
  let extracted_subtotal = null;
  let notes = '';
  const products = [];

  // 1. Phone extraction
  const phoneMatch = text.match(/(?:\+?88)?01[3-9]\d{2}[-\s]?\d{3}[-\s]?\d{3}\b/);
  if (phoneMatch) {
    phone = phoneMatch[0].replace(/[\s-]/g, '').replace(/^\+?88/, '');
  }

  // 2. Shipping Zone & Address Detection
  const dhakaKeywords = [
    'dhaka', 'ঢাকা', 'dhanmondi', 'ধানমন্ডি', 'mirpur', 'মিরপুর', 'gulshan', 'গুলশান', 
    'banani', 'বনানী', 'uttara', 'উত্তরা', 'mohammadpur', 'মোহাম্মদপুর', 'badda', 'বাড্ডা', 
    'motijheel', 'মতিঝিল', 'bashundhara', 'বসুন্ধরা', 'malibagh', 'মালিবাগ', 'khilgaon', 'খিলগাঁও',
    'farmgate', 'ফার্মগেট', 'rampura', 'রামপুরা', 'jatrabari', 'যাত্রাবাড়ী', 'kakrail', 'কাকরাইল',
    'tejgaon', 'তেজগাঁও', 'paltan', 'পল্টন', 'mogbazar', 'মগবাজার', 'shantinagar', 'শান্তিনগর',
    'savar', 'সাভার', 'keraniganj', 'কেরানীগঞ্জ', 'narayanganj', 'নারায়ণগঞ্জ', 'gazipur', 'গাজীপুর'
  ];

  const lowerText = text.toLowerCase();
  const isInsideDhaka = dhakaKeywords.some(kw => lowerText.includes(kw));
  if (isInsideDhaka) {
    shipping_zone = 'Inside Dhaka';
  }

  // 3. Label-based Parsing
  for (const line of lines) {
    const nameMatch = line.match(/^(?:name|customer|customer\s*name|নাম|কাস্টমার|গ্রাহক)\s*[:：\-]\s*(.+)$/i);
    if (nameMatch && !customer_name) {
      customer_name = nameMatch[1].trim();
      continue;
    }

    const addrMatch = line.match(/^(?:address|delivery\s*address|ঠিকানা|লোকেশন|location)\s*[:：\-]\s*(.+)$/i);
    if (addrMatch && !address) {
      address = addrMatch[1].trim();
      continue;
    }

    const noteMatch = line.match(/^(?:note|notes|নোট|মন্তব্য)\s*[:：\-]\s*(.+)$/i);
    if (noteMatch && !notes) {
      notes = noteMatch[1].trim();
      continue;
    }

    const priceMatch = line.match(/^(?:price|total|amount|দাম|মূল্য|টাকা|taka|bdt|bill)\s*[:：\-]\s*৳?\s*(\d+)/i);
    if (priceMatch && extracted_subtotal === null) {
      extracted_subtotal = parseInt(priceMatch[1], 10);
      continue;
    }

    const prodMatch = line.match(/^(?:product|item|প্রোডাক্ট|পণ্য)\s*[:：\-]\s*(.+)$/i);
    if (prodMatch) {
      const pStr = prodMatch[1].trim();
      let qty = 1;
      const qtyMatch = pStr.match(/(\d+)\s*(?:pcs|pis|ta|টি|টা|পিস)/i) || pStr.match(/[x×]\s*(\d+)/i);
      if (qtyMatch) qty = parseInt(qtyMatch[1], 10);
      products.push({
        name: pStr.replace(/\s*(?:x|\d+)\s*(?:pcs|pis|ta|টি|টা|পিস)?$/i, '').trim(),
        quantity: Math.max(1, qty),
        size: ''
      });
      continue;
    }
  }

  // 4. Positional fallback if labels were omitted
  if (!customer_name || !address) {
    const unassigned = lines.filter(l => {
      if (phone && l.includes(phone)) return false;
      if (l.match(/(?:\+?88)?01[3-9]\d{8}/)) return false;
      if (l.match(/^(?:name|customer|address|phone|mobile|note|price|product|কালার|সাইজ|নোট|ঠিকানা|মোবাইল)/i)) return false;
      return true;
    });

    if (!customer_name && unassigned.length > 0) {
      customer_name = unassigned[0];
      unassigned.shift();
    }

    if (!address && unassigned.length > 0) {
      address = unassigned.join(', ');
    }
  }

  // 5. Toybox / Product fallback detection
  const toyboxMatch = text.match(/toy\s*box\s*#?(\d+)/i) || text.match(/#(\d+)/);
  if (toyboxMatch && products.length === 0) {
    products.push({
      name: `TOY BOX #${toyboxMatch[1]}`,
      quantity: 1,
      size: ''
    });
  }

  return {
    customer_name: customer_name || '',
    phone: phone || '',
    address: address || '',
    products: products.length > 0 ? products : [{ name: 'TOY BOX', quantity: 1, size: '' }],
    shipping_zone,
    extracted_subtotal,
    notes
  };
}

export async function extractOrder(rawText) {
  if (!rawText?.trim()) {
    return null;
  }

  // 1. Direct OpenRouter AI Extraction (Accurate for Bengali/Banglish/Messy text)
  if (OPENROUTER_API_KEY) {
    try {
      const prompt = `You are an expert order extractor for an e-commerce Order Management System in Bangladesh.
From the raw input text (Facebook message, WhatsApp text, or pasted notes), extract customer details and products.

Return STRICT JSON only (no markdown, no code fences, no extra text) with this exact schema:
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
- Automatically determine shipping_zone: Use "Inside Dhaka" if address contains Dhaka city areas (e.g., Mirpur, Dhanmondi, Gulshan, Banani, Uttara, Mohammadpur, Badda, Rampura, Motijheel, Khilgaon, Bashundhara, Jatrabari, Old Dhaka, etc.), otherwise "Outside Dhaka".
- Clean and normalize phone numbers (11 digits, starting with 01...).
- quantity must be an integer >= 1.
- If specific color or size or variant is mentioned, extract into "size" or include in product name.
- Do NOT output markdown code blocks. Return RAW JSON only.

Raw input:
${rawText}`;

      const aiResponse = await callOpenRouter([
        { role: 'system', content: 'Return strict JSON only without markdown formatting.' },
        { role: 'user', content: prompt }
      ], 0.1);

      if (aiResponse) {
        const cleaned = aiResponse.replace(/```json/gi, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleaned);
        if (parsed && typeof parsed === 'object') {
          return {
            customer_name: parsed.customer_name || '',
            phone: parsed.phone || '',
            address: parsed.address || '',
            products: Array.isArray(parsed.products) && parsed.products.length > 0 ? parsed.products : [{ name: 'Item', quantity: 1, size: '' }],
            shipping_zone: parsed.shipping_zone === 'Inside Dhaka' ? 'Inside Dhaka' : 'Outside Dhaka',
            extracted_subtotal: parsed.extracted_subtotal ? Number(parsed.extracted_subtotal) : null,
            notes: parsed.notes || ''
          };
        }
      }
    } catch (openRouterErr) {
      console.warn('OpenRouter order extraction failed, trying edge proxy:', openRouterErr?.message);
    }
  }

  // 2. Try Edge function proxy
  try {
    const data = await invokeAiProxy('extract-order', { rawText });
    if (data?.order) {
      return data.order;
    }
  } catch (error) {
    console.warn('Edge function order extraction failed, using local parser fallback:', error?.message);
  }

  // 3. Seamless fallback to local client-side parser
  return localFallbackOrderParse(rawText);
}
