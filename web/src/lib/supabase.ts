import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

if (!url || !key) {
  throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY must be set (see web/.env.example).');
}

// The publishable key is public by design; every permission is enforced by RLS and RPCs.
export const supabase = createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // Email links are handled explicitly by /auth/confirm and /auth/reset-password (token_hash),
    // so the SDK must not try to parse the URL on every page load.
    detectSessionInUrl: false,
  },
});
