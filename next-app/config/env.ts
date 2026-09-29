/**
 * Centralized, Type-safe Environment Variables Configuration
 * Guarantees no hardcoded URLs throughout components.
 */

export const env = {
  supabase: {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  },
  ai: {
    openRouterApiKey: process.env.OPENROUTER_API_KEY || '',
    openRouterModel: process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini',
  },
  app: {
    url: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
    version: process.env.APP_VERSION || '2.0.0-next-foundation',
  },
} as const;

export function validateClientEnv() {
  if (!env.supabase.url || !env.supabase.anonKey) {
    throw new Error(
      '[OrderFlow Next] Missing Supabase environment variables. Please check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local'
    );
  }
}
