import { supabase } from '../lib/supabase';

const AI_FUNCTION_NAME = 'nova-ai';
const AI_FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${AI_FUNCTION_NAME}`;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
let forceFreshNextRequest = false;

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

export async function sendChatMessage(userMessage, chatHistory = []) {
  const trimmed = String(userMessage || '').trim();
  if (!trimmed) {
    throw new Error('Message is empty.');
  }

  const data = await invokeAiProxy('chat', {
    chatHistory,
    forceFresh: forceFreshNextRequest,
    userMessage: trimmed,
  });

  forceFreshNextRequest = false;

  if (!data?.reply) {
    throw new Error('No AI response was returned.');
  }

  return String(data.reply).trim();
}

export function invalidateChatCache() {
  forceFreshNextRequest = true;
}

export async function extractInvoiceItems(invoiceText) {
  if (!invoiceText?.trim()) {
    return null;
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

  try {
    const data = await invokeAiProxy('extract-order', { rawText });
    if (data?.order) {
      return data.order;
    }
  } catch (error) {
    console.warn('Edge function order extraction failed, using local parser fallback:', error?.message);
  }

  // Seamless fallback to local client-side parser
  return localFallbackOrderParse(rawText);
}
