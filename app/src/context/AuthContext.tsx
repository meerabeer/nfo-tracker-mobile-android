import React, { createContext, useState, useCallback, useContext } from 'react';
import { loginWithSupabase } from '../services/authApi';
import { AuthState, NFOUser } from '../types';

interface AuthContextType extends AuthState {
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    isLoading: false,
    error: null,
  });

  const login = useCallback(
    async (username: string, password: string) => {
      setAuthState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        // Use loginWithSupabase from authApi for validation (always NFO)
        const result = await loginWithSupabase(username, password);
        
        // Map the result to the expected NFOUser format
        const userData: NFOUser = {
          username: result.username,
          full_name: result.name || '',
          home_location: result.home_location || '',
          is_active: true,
        };

        setAuthState({
          user: userData,
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
