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

export async function extractOrder(rawText) {
  if (!rawText?.trim()) {
    return null;
  }

  try {
    const data = await invokeAiProxy('extract-order', { rawText });
    return data?.order ?? null;
  } catch (error) {
    console.error('Order AI proxy failed:', error);
    return null;
  }
}
