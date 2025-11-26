import { supabase } from './supabaseClient';

export type UserRole = 'nfo' | 'manager';

export interface AuthResult {
  username: string;
  name?: string;
  home_location?: string;
  area?: string;
  role: UserRole;
}

export async function loginWithSupabase(
  role: UserRole,
  username: string,
  password: string
): Promise<AuthResult> {
  const tableName = role === 'nfo' ? 'NFOusers' : 'MgmtUsers';

  const { data, error } = await supabase
    .from(tableName)
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
    area: data.area,
    role: role,
  };
}
