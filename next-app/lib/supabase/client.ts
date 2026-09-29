import { createBrowserClient } from '@supabase/ssr';
import { env } from '@/config/env';

export function createClient() {
  return createBrowserClient(
    env.supabase.url,
    env.supabase.anonKey
  );
}

export const supabase = createClient();
export default supabase;

