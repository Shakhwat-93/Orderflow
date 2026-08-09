/**
 * PRODUCTION AI SERVICE
 * ─────────────────────────────────────────────────────────────────────────────
 * Parses free-text production descriptions (Bengali/English) into structured
 * form data for the Factory Production Log form.
 *
 * Usage example:
 *   "smart travel bag 5 black banano hoyece" →
 *   { product_name: "Smart Travel Bag", quantity_ready: 5, color: "Black" }
 *
 * Flow:
 *   1. Try Nova AI edge function (primary)
 *   2. Fall back to local regex/NLP parser (offline-safe)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { supabase } from '../lib/supabase';

const AI_FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/nova-ai`;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// ── Known colors for detection ──────────────────────────────────────────────
const KNOWN_COLORS = [
  'black', 'white', 'beige', 'silver', 'golden', 'gold', 'blue', 'navy',
  'red', 'green', 'olive', 'brown', 'grey', 'gray', 'pink', 'purple',
  'cream', 'orange', 'maroon', 'teal', 'khaki', 'camel', 'yellow',
];

// ── Bengali/English quantity words ───────────────────────────────────────────
const QTY_WORD_MAP = {
  'ek': 1, 'এক': 1,
  'dui': 2, 'দুই': 2, 'dou': 2,
  'tin': 3, 'তিন': 3,
  'char': 4, 'চার': 4,
  'pach': 5, 'পাঁচ': 5, 'panch': 5,
  'choy': 6, 'ছয়': 6,
  'sat': 7, 'সাত': 7,
  'aat': 8, 'আট': 8,
  'noy': 9, 'নয়': 9,
  'dosh': 10, 'দশ': 10, 'das': 10,
};

// ── Normalize text for matching ───────────────────────────────────────────────
const normalize = (s = '') =>
  String(s)
    .toLowerCase()
    .replace(/[_\-–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Fuzzy match a typed product name against the known product catalog.
 * Returns the best-matched product name, or null if confidence is too low.
 *
 * @param {string} text - raw text from user
 * @param {string[]} productNames - array of known product names
 * @returns {string|null}
 */
export function fuzzyMatchProduct(text, productNames = []) {
  if (!text || !productNames.length) return null;

  const normalizedText = normalize(text);
  const textTokens = new Set(normalizedText.split(' ').filter(t => t.length > 1));

  let best = null;
  let bestScore = 0;

  for (const name of productNames) {
    const normalizedName = normalize(name);

    // Exact match → immediate winner
    if (normalizedName === normalizedText) return name;

    // Substring match → very high score
    if (normalizedText.includes(normalizedName) || normalizedName.includes(normalizedText)) {
      const score = 0.85;
      if (score > bestScore) { bestScore = score; best = name; }
      continue;
    }

    // Token overlap scoring
    const nameTokens = new Set(normalizedName.split(' ').filter(t => t.length > 1));
    const overlap = [...textTokens].filter(t => nameTokens.has(t)).length;
    const score = overlap / Math.max(textTokens.size, nameTokens.size, 1);

    if (score > bestScore) {
      bestScore = score;
      best = name;
    }
  }

  // Require at least 30% token overlap
  return bestScore >= 0.3 ? best : null;
}

/**
 * Local regex/NLP parser — works offline, handles Bengali short-form text.
 *
 * @param {string} text - raw user input
 * @param {string[]} productNames - known product catalog names
 * @returns {{ product_name, quantity_ready, color, variant, unit_cost, notes, confidence }}
 */
export function localFallbackParse(text, productNames = []) {
  const raw = String(text || '').trim();
  const lower = raw.toLowerCase();

  // ── Extract quantity ────────────────────────────────────────────────────────
  let quantity_ready = null;

  // Match patterns like "5 pis", "5 pcs", "5 ta", "x5", "×5"
  const qtyPatterns = [
    /(\d+)\s*(?:pis|pcs|piece|pieces|pc|ta|টি|টা|nos?|units?)/i,
    /(\d+)\s+(?:banano|তৈরি|made|produced)/i,
    /(?:banano|made|produced|তৈরি)\s+(\d+)/i,
    /[x×]\s*(\d+)/i,
    /(\d+)\s*[x×]/i,
  ];

  for (const p of qtyPatterns) {
    const m = lower.match(p);
    if (m) {
      quantity_ready = parseInt(m[1], 10);
      break;
    }
  }

  // If still no qty, try Bengali number words
  if (!quantity_ready) {
    for (const [word, val] of Object.entries(QTY_WORD_MAP)) {
      if (lower.includes(word)) {
        quantity_ready = val;
        break;
      }
    }
  }

  // Last resort: first standalone number in text
  if (!quantity_ready) {
    const numMatch = lower.match(/\b(\d+)\b/);
    if (numMatch) quantity_ready = parseInt(numMatch[1], 10);
  }

  // ── Extract color ────────────────────────────────────────────────────────────
  let color = null;
  for (const c of KNOWN_COLORS) {
    if (lower.includes(c)) {
      color = c.charAt(0).toUpperCase() + c.slice(1);
      break;
    }
  }

  // ── Extract unit cost ────────────────────────────────────────────────────────
  let unit_cost = null;
  const costMatch = lower.match(/(?:cost|price|rate|taka|tk|৳|bdt)[\s:]*(\d+(?:\.\d+)?)/i)
    || lower.match(/(\d+(?:\.\d+)?)\s*(?:taka|tk|৳|bdt)\s*(?:each|per|pcs?|piece)/i);
  if (costMatch) unit_cost = parseFloat(costMatch[1]);

  // ── Match product name ────────────────────────────────────────────────────────
  // Remove digits, qty words, colors, and common Bangla filler words from text
  // before matching product name
  const stripped = raw
    .replace(/\b\d+\s*(?:pis|pcs|piece|pieces|pc|ta|টি|টা|nos?|units?)\b/gi, '')
    .replace(new RegExp(`\\b(${KNOWN_COLORS.join('|')})\\b`, 'gi'), '')
    .replace(/\b(banano|hoyece|hoise|made|produced|তৈরি|korা|holo)\b/gi, '')
    .replace(/\b\d+\b/g, '')
    .replace(/[x×]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const product_name = fuzzyMatchProduct(stripped || raw, productNames);

  return {
    product_name,
    quantity_ready,
    color,
    variant: null,
    unit_cost,
    notes: null,
    confidence: product_name && quantity_ready ? 'medium' : 'low',
    source: 'local',
  };
}

/**
 * Build the AI prompt for the Nova AI edge function.
 */
function buildPrompt(userText, productNames) {
  const productList = productNames.length > 0
    ? productNames.map(p => `  - "${p}"`).join('\n')
    : '  (no predefined products — use best guess)';

  return `You are a production log assistant for a Bangladeshi product factory.

Your job is to extract structured data from the user's description of what was produced today. The user may write in English, Bangla, or a mix (Banglish).

KNOWN PRODUCTS in the catalog:
${productList}

USER INPUT: "${userText}"

Instructions:
1. Match product_name to one from the catalog (case-insensitive). If no good match, use the most meaningful product name from the text.
2. quantity_ready must be a positive integer (look for numbers, "ta", "pcs", "pis", "টি", etc.).
3. color: extract any color mentioned (Black, White, Beige, etc.). Return null if none.
4. variant: any variant/size/style mentioned that is NOT a color (e.g., "Standard", "Large", "Mini"). Return null if none.
5. unit_cost: the making/production cost per piece. Return null if not mentioned.
6. notes: any remaining relevant context. Return null if none.
7. confidence: "high" if product + qty found confidently, "medium" if partial, "low" if guessing.

Return ONLY valid JSON, no markdown fences, no extra text:
{
  "product_name": "string or null",
  "quantity_ready": number or null,
  "color": "string or null",
  "variant": "string or null",
  "unit_cost": number or null,
  "notes": "string or null",
  "confidence": "high|medium|low"
}`;
}

/**
 * Parse a production description using the Nova AI edge function.
 * Falls back to local NLP parser if the AI call fails.
 *
 * @param {string} userText - free-text input from user
 * @param {string[]} productNames - known product catalog names for matching
 * @returns {Promise<{
 *   product_name: string|null,
 *   quantity_ready: number|null,
 *   color: string|null,
 *   variant: string|null,
 *   unit_cost: number|null,
 *   notes: string|null,
 *   confidence: 'high'|'medium'|'low',
 *   source: 'ai'|'local'
 * }>}
 */
export async function parseProductionText(userText, productNames = []) {
  const text = String(userText || '').trim();
  if (!text) throw new Error('Input text is empty');

  // ── Try AI first ─────────────────────────────────────────────────────────────
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;

    if (!accessToken) throw new Error('No auth session');

    const response = await fetch(AI_FUNCTION_URL, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'x-client-info': 'orderflow-production-ai',
      },
      body: JSON.stringify({
        action: 'chat',
        userMessage: buildPrompt(text, productNames),
        chatHistory: [],
        forceFresh: true,
      }),
      signal: AbortSignal.timeout(12000), // 12 second timeout
    });

    const responseText = await response.text();

    if (!response.ok) throw new Error(`AI HTTP ${response.status}`);

    let aiData = null;
    try {
      aiData = JSON.parse(responseText);
    } catch {
      throw new Error('AI response not valid JSON');
    }

    // The AI returns { reply: "..." } — parse the JSON inside reply
    const replyText = String(aiData?.reply || '').trim();

    // Strip possible markdown fences
    const cleanReply = replyText
      .replace(/^```(?:json)?\n?/im, '')
      .replace(/\n?```$/im, '')
      .trim();

    const parsed = JSON.parse(cleanReply);

    // Validate required fields exist
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('Parsed AI response is not an object');
    }

    // Normalize quantity to integer
    const qty = parsed.quantity_ready != null ? Math.round(Number(parsed.quantity_ready)) : null;

    // Re-fuzzy-match the product name against catalog in case AI made a typo
    let productName = parsed.product_name || null;
    if (productName && productNames.length > 0) {
      const catalogMatch = fuzzyMatchProduct(productName, productNames);
      if (catalogMatch) productName = catalogMatch;
    }

    return {
      product_name: productName,
      quantity_ready: qty > 0 ? qty : null,
      color: parsed.color ? String(parsed.color).trim() : null,
      variant: parsed.variant ? String(parsed.variant).trim() : null,
      unit_cost: parsed.unit_cost != null ? Math.abs(Number(parsed.unit_cost)) || null : null,
      notes: parsed.notes ? String(parsed.notes).trim() : null,
      confidence: ['high', 'medium', 'low'].includes(parsed.confidence) ? parsed.confidence : 'medium',
      source: 'ai',
    };
  } catch (aiError) {
    console.warn('[ProductionAI] AI parse failed, using local fallback:', aiError.message);

    // ── Fallback to local parser ────────────────────────────────────────────────
    return localFallbackParse(text, productNames);
  }
}
