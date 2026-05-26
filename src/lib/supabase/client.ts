import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

let supabaseInstance: SupabaseClient | null = null;

function createSupabaseClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key || url === 'your_supabase_url_here') {
    console.warn('[Supabase] Missing env vars, using placeholder (auth will fail)');
    return createClient('http://localhost:54321', 'placeholder-key');
  }

  console.log('[Supabase] Creating client for:', url);
  return createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}

export function getSupabase(): SupabaseClient {
  if (typeof window === 'undefined') {
    // SSR: always create a new instance
    return createSupabaseClient();
  }
  if (!supabaseInstance) {
    supabaseInstance = createSupabaseClient();
  }
  return supabaseInstance;
}

// Eager singleton — created once at module load time (browser only via getSupabase)
export const supabase: SupabaseClient = getSupabase();