/**
 * PRODUCTION AI SERVICE
 * ─────────────────────────────────────────────────────────────────────────────
 * Parses free-text production descriptions (Bengali/English/Banglish) into structured
 * form data for the Factory Production Log form.
 *
 * Flow:
 *   1. Try direct OpenRouter if key is available
 *   2. Try Supabase Nova AI edge function
 *   3. Fall back to local regex/NLP parser (100% offline-safe)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { supabase } from '@/services/api/client';
import { env } from '@/config/env';

const AI_FUNCTION_URL = `${env.supabase.url}/functions/v1/nova-ai`;
const SUPABASE_ANON_KEY = env.supabase.anonKey;

// ── Known colors for detection ──────────────────────────────────────────────
const KNOWN_COLORS = [
  'black', 'white', 'beige', 'silver', 'golden', 'gold', 'blue', 'navy',
  'red', 'green', 'olive', 'brown', 'grey', 'gray', 'pink', 'purple',
  'cream', 'orange', 'maroon', 'teal', 'khaki', 'camel', 'yellow',
];

// ── Bengali/English quantity words ───────────────────────────────────────────
const QTY_WORD_MAP: Record<string, number> = {
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
 */
export function fuzzyMatchProduct(text: string, productNames: string[] = []): string | null {
  if (!text || !productNames.length) return null;

  const normalizedText = normalize(text);
  const textTokens = new Set(normalizedText.split(' ').filter(t => t.length > 1));

  let best: string | null = null;
  let bestScore = 0;

  for (const name of productNames) {
    const normalizedName = normalize(name);

    // Exact match → immediate winner
    if (normalizedName === normalizedText) return name;

    // Substring match
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

  return bestScore >= 0.3 ? best : null;
}

export interface ParsedProductionResult {
  product_name: string | null;
  quantity_ready: number | null;
  color: string | null;
  variant: string | null;
  unit_cost: number | null;
  notes: string | null;
  confidence: 'high' | 'medium' | 'low';
  source: 'ai' | 'local';
}

/**
 * Local regex/NLP parser — works offline, handles Bengali short-form text.
 */
export function localFallbackParse(text: string, productNames: string[] = []): ParsedProductionResult {
  const raw = String(text || '').trim();
  const lower = raw.toLowerCase();

  // ── Extract quantity ────────────────────────────────────────────────────────
  let quantity_ready: number | null = null;

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

  if (!quantity_ready) {
    for (const [word, val] of Object.entries(QTY_WORD_MAP)) {
      if (lower.includes(word)) {
        quantity_ready = val;
        break;
      }
    }
  }

  if (!quantity_ready) {
    const numMatch = lower.match(/\b(\d+)\b/);
    if (numMatch) quantity_ready = parseInt(numMatch[1], 10);
  }

  // ── Extract color ────────────────────────────────────────────────────────────
  let color: string | null = null;
  for (const c of KNOWN_COLORS) {
    if (lower.includes(c)) {
      color = c.charAt(0).toUpperCase() + c.slice(1);
      break;
    }
  }

  // ── Extract unit cost ────────────────────────────────────────────────────────
  let unit_cost: number | null = null;
  const costMatch = lower.match(/(?:cost|price|rate|taka|tk|৳|bdt)[\s:]*(\d+(?:\.\d+)?)/i)
    || lower.match(/(\d+(?:\.\d+)?)\s*(?:taka|tk|৳|bdt)\s*(?:each|per|pcs?|piece)/i);
  if (costMatch) unit_cost = parseFloat(costMatch[1]);

  // ── Match product name ────────────────────────────────────────────────────────
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

function buildPrompt(userText: string, productNames: string[]) {
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

export async function parseProductionText(
  userText: string,
  productNames: string[] = []
): Promise<ParsedProductionResult> {
  const text = String(userText || '').trim();
  if (!text) throw new Error('Input text is empty');

  // Try Edge Function proxy
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
      signal: AbortSignal.timeout(12000),
    });

    const responseText = await response.text();
    if (!response.ok) throw new Error(`AI HTTP ${response.status}`);

    const aiData = JSON.parse(responseText);
    const replyText = String(aiData?.reply || '').trim();

    const cleanReply = replyText
      .replace(/^```(?:json)?\n?/im, '')
      .replace(/\n?```$/im, '')
      .trim();

    const parsed = JSON.parse(cleanReply);
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('Parsed AI response is not an object');
    }

    const qty = parsed.quantity_ready != null ? Math.round(Number(parsed.quantity_ready)) : null;

    let productName = parsed.product_name || null;
    if (productName && productNames.length > 0) {
      const catalogMatch = fuzzyMatchProduct(productName, productNames);
      if (catalogMatch) productName = catalogMatch;
    }

    return {
      product_name: productName,
      quantity_ready: qty && qty > 0 ? qty : null,
      color: parsed.color ? String(parsed.color).trim() : null,
      variant: parsed.variant ? String(parsed.variant).trim() : null,
      unit_cost: parsed.unit_cost != null ? Math.abs(Number(parsed.unit_cost)) || null : null,
      notes: parsed.notes ? String(parsed.notes).trim() : null,
      confidence: ['high', 'medium', 'low'].includes(parsed.confidence) ? parsed.confidence : 'medium',
      source: 'ai',
    };
  } catch (aiError: any) {
    console.warn('[ProductionAI] AI parse failed, using local fallback:', aiError?.message);
    return localFallbackParse(text, productNames);
  }
}
