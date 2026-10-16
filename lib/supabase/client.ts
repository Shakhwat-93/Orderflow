import { createBrowserClient } from '@supabase/ssr';
import { env } from '@/config/env';

/**
 * Resolves the Supabase URL for client-side browser usage.
 * When executed in the browser (e.g. on https://canvasorder.shop), this routes
 * requests through the same-origin reverse proxy (/_supabase) to:
 * 1. Guarantee HTTPS compliance and eliminate browser Mixed Content errors.
 * 2. Eliminate cross-origin CORS preflight latency.
 * 3. Keep authentication cookies on the exact same domain.
 */
export function getSupabaseBrowserUrl(): string {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/_supabase`;
  }
  return env.supabase.url;
}

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function createClient() {
  if (typeof window !== 'undefined') {
    if (!browserClient) {
      browserClient = createBrowserClient(
        getSupabaseBrowserUrl(),
        env.supabase.anonKey
      );
    }
    return browserClient;
  }

  return createBrowserClient(
    env.supabase.url,
    env.supabase.anonKey
  );
}

export const supabase = createClient();
export default supabase;
