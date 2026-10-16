/**
 * Centralized, Type-safe Environment Variables Configuration
 * Strictly enforces connection to Self-Hosted VPS Supabase and completely blocks any old cloud URLs.
 */

const DEFAULT_VPS_SUPABASE_URL = 'http://supabasekong-a5tg2fvpwj6emkewfdknamid.187.77.159.209.sslip.io';
const DEFAULT_VPS_SUPABASE_ANON_KEY = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc4ODc3MzEwMCwiZXhwIjo0OTQ0NDQ2NzAwLCJyb2xlIjoiYW5vbiJ9.xKr5ARhjhbCSpBSFNjU9LuAl7Do_CMfN0So9h43swaQ';

// Read raw environment variables
const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ? process.env.NEXT_PUBLIC_SUPABASE_URL.trim() : '';
const rawAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.trim() : '';

// Disconnect old database permanently:
// If URL is missing, or if it points to the deprecated old cloud project (drbpysumezfjbudxzxzj or supabase.co),
// automatically enforce the Self-Hosted VPS Supabase endpoint.
const resolvedUrl = (!rawUrl || rawUrl.includes('drbpysumezfjbudxzxzj') || rawUrl.includes('supabase.co'))
  ? DEFAULT_VPS_SUPABASE_URL
  : rawUrl;

// If key is missing or uses the old legacy cloud anon key (prefix Ki7U_), force the Self-Hosted VPS anon key
const resolvedAnonKey = (!rawAnonKey || rawAnonKey.includes('Ki7U_'))
  ? DEFAULT_VPS_SUPABASE_ANON_KEY
  : rawAnonKey;

export const env = {
  get supabase() {
    return {
      get url() {
        if (typeof window !== 'undefined') {
          return `${window.location.origin}/_supabase`;
        }
        return resolvedUrl;
      },
      anonKey: resolvedAnonKey,
    };
  },
  ai: {
    openRouterApiKey: process.env.OPENROUTER_API_KEY || '',
    openRouterModel: process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini',
  },
  app: {
    url: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
    version: process.env.APP_VERSION || '2.0.0-next-foundation',
  },
};

export function validateClientEnv() {
  if (!env.supabase.url || !env.supabase.anonKey) {
    throw new Error(
      '[OrderFlow Next] Missing Supabase environment variables. Please check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local'
    );
  }
}
