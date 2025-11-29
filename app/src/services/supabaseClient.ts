import { createClient } from '@supabase/supabase-js';

// Environment variables for Supabase configuration
// Local dev: set in .env file
// EAS builds: set via `eas secret:create` or in eas.json env block
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  throw new Error(
    '[Supabase] EXPO_PUBLIC_SUPABASE_URL is missing. Configure it in .env for local dev and as EAS secrets for builds.'
  );
}

if (!supabaseAnonKey) {
  throw new Error(
    '[Supabase] EXPO_PUBLIC_SUPABASE_ANON_KEY is missing. Configure it in .env for local dev and as EAS secrets for builds.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
