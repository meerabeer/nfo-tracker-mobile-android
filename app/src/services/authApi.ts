import { supabase } from './supabaseClient';

export interface AuthResult {
  username: string;
  name?: string;
  home_location?: string;
}

/**
 * Authenticate an NFO user against the NFOusers table in Supabase.
 */
export async function loginWithSupabase(
  username: string,
  password: string
): Promise<AuthResult> {
  const { data, error } = await supabase
    .from('NFOusers')
    .select('*')
    .eq('Username', username)
    .eq('Password', password)
    .maybeSingle();

  if (error) {
    console.error('Supabase login error:', error);
    throw new Error('Login failed. Please try again.');
  }

  if (!data) {
    throw new Error('Invalid username or password.');
  }

  return {
    username: data.Username ?? data.username,
    name: data.name,
    home_location: data.home_location,
  };
}
