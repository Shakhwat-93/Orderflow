import { env } from '@/config/env';
import { supabase, formatApiError } from './client';

export async function callOpenRouter(messages: Array<{ role: string; content: string }>, temperature = 0.2) {
  if (!env.ai.openRouterApiKey) return null;

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.ai.openRouterApiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'https://orderflow.app',
      'X-Title': 'OrderFlow AI'
    },
    body: JSON.stringify({
      model: env.ai.openRouterModel,
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

export function localFallbackOrderParse(rawText: string) {
  if (!rawText || !rawText.trim()) return null;
  const text = String(rawText).trim();
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  let customer_name = '';
  let phone = '';
  let address = '';
  let shipping_zone: 'Inside Dhaka' | 'Outside Dhaka' = 'Outside Dhaka';
  let extracted_subtotal: number | null = null;
  const notes = '';
  const products: Array<{ name: string; quantity: number; size: string }> = [];

  const phoneMatch = text.match(/(?:\+?88)?01[3-9]\d{2}[-\s]?\d{3}[-\s]?\d{3}\b/);
  if (phoneMatch) {
    phone = phoneMatch[0].replace(/[\s-]/g, '').replace(/^\+?88/, '');
  }

  const dhakaKeywords = [
    'dhaka', 'ঢাকা', 'dhanmondi', 'ধানমন্ডি', 'mirpur', 'মিরপুর', 'gulshan', 'গুলশান',
    'banani', 'বনানী', 'uttara', 'উত্তরা', 'mohammadpur', 'মোহাম্মদপুর', 'badda', 'বাড্ডা',
    'motijheel', 'মতিঝিল', 'bashundhara', 'বসুন্ধরা', 'malibagh', 'মালিবাগ', 'khilgaon', 'খিলগাঁও'
  ];
  if (dhakaKeywords.some((k) => text.toLowerCase().includes(k))) {
    shipping_zone = 'Inside Dhaka';
  }

  for (const line of lines) {
    const nameMatch = line.match(/^(?:name|customer|গ্রাহক|নাম)\s*[:：\-]\s*(.+)$/i);
    if (nameMatch && !customer_name) {
      customer_name = nameMatch[1].trim();
      continue;
    }

    const addrMatch = line.match(/^(?:address|ঠিকানা|লোকেশন|location)\s*[:：\-]\s*(.+)$/i);
    if (addrMatch && !address) {
      address = addrMatch[1].trim();
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
    }
  }

  if (!customer_name || !address) {
    const unassigned = lines.filter((l) => {
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

export const aiApi = {
  async extractInvoiceItemsWithGroq(invoiceText: string) {
    if (!invoiceText?.trim()) return null;

    if (env.ai.openRouterApiKey) {
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
        console.warn('OpenRouter invoice parsing failed:', err);
      }
    }

    try {
      const { data, error } = await supabase.functions.invoke('nova-ai', {
        body: { action: 'extract-invoice', invoiceText }
      });
      if (!error && Array.isArray(data?.items)) return data.items;
    } catch (e) {
      console.warn('Edge proxy extract-invoice failed:', e);
    }

    return null;
  },

  async extractOrderWithAI(rawText: string) {
    if (!rawText?.trim()) return null;

    if (env.ai.openRouterApiKey) {
      try {
        const prompt = `You are an expert order extractor for an e-commerce Order Management System in Bangladesh.
From the raw input text, extract customer details and products.
Return STRICT JSON only (no markdown, no code fences):
{
  "customer_name": "string",
  "phone": "string",
  "address": "string",
  "products": [{ "name": "string", "quantity": number, "size": "string" }],
  "shipping_zone": "Inside Dhaka" | "Outside Dhaka",
  "extracted_subtotal": number | null,
  "notes": "string"
}
Raw input:
${rawText}`;

        const aiResponse = await callOpenRouter([
          { role: 'system', content: 'Return strict JSON only.' },
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
      } catch (err) {
        console.warn('OpenRouter order extraction failed:', err);
      }
    }

    try {
      const { data, error } = await supabase.functions.invoke('nova-ai', {
        body: { action: 'extract-order', rawText }
      });
      if (!error && data?.order) return data.order;
    } catch (e) {
      console.warn('Edge proxy extract-order failed:', e);
    }

    return localFallbackOrderParse(rawText);
  }
};
