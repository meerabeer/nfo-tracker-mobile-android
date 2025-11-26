import { createClient } from '@supabase/supabase-js';

// TODO: Set these environment variables in app.json or .env file:
// EXPO_PUBLIC_SUPABASE_URL - Your Supabase project URL
// EXPO_PUBLIC_SUPABASE_ANON_KEY - Your Supabase anonymous key

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Missing Supabase configuration. Please set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY env variables.'
  );
}

export const supabase = createClient(
  supabaseUrl || '',
  supabaseAnonKey || ''
);
