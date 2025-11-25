import React, { createContext, useState, useCallback, useContext } from 'react';
import { supabase } from '../services/supabaseClient';
import { AuthState, NFOUser, Manager, UserRole } from '../types';

interface AuthContextType extends AuthState {
  login: (username: string, password: string, role: UserRole) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    role: null,
    isLoading: false,
    error: null,
  });

  const login = useCallback(
    async (username: string, password: string, role: UserRole) => {
      setAuthState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const tableName = role === 'NFO' ? 'nfo_users' : 'managers';

        const { data, error } = await supabase
          .from(tableName)
          .select('*')
          .eq('username', username)
          .eq('password', password)
          .single();

        if (error || !data) {
          throw new Error('Invalid credentials');
        }

        setAuthState({
          user: data as NFOUser | Manager,
          role: role,
          isLoading: false,
          error: null,
        });
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Login failed';
        setAuthState((prev) => ({
          ...prev,
          isLoading: false,
          error: errorMessage,
        }));
        throw err;
      }
    },
    []
  );

  const logout = useCallback(async () => {
    setAuthState({
      user: null,
      role: null,
      isLoading: false,
      error: null,
    });
  }, []);

  const value: AuthContextType = {
    ...authState,
    login,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
