import { supabase } from '../lib/supabase';

const AI_FUNCTION_NAME = 'nova-ai';
let forceFreshNextRequest = false;

async function invokeAiProxy(action, payload = {}) {
  const { data, error } = await supabase.functions.invoke(AI_FUNCTION_NAME, {
    body: {
      action,
      ...payload,
    },
  });

  if (error) {
    throw new Error(error.message || 'AI proxy request failed.');
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
