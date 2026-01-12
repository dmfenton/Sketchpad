/**
 * Authentication context for web app.
 *
 * In development mode, automatically uses dev tokens.
 * In production, requires magic link authentication.
 */

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { getApiUrl } from '../config';

interface User {
  id: number;
  email: string;
}

interface AuthState {
  isLoading: boolean;
  isAuthenticated: boolean;
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
}

interface AuthContextType extends AuthState {
  requestMagicLink: (email: string) => Promise<{ success: boolean; error?: string }>;
  verifyMagicLinkCode: (email: string, code: string) => Promise<{ success: boolean; error?: string }>;
  refreshAccessToken: () => Promise<boolean>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

const TOKEN_STORAGE_KEY = 'auth_access_token';
const REFRESH_TOKEN_STORAGE_KEY = 'auth_refresh_token';

function decodeToken(token: string): { sub: string; email?: string; exp: number } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]!));
    return payload;
  } catch {
    return null;
  }
}

function isTokenExpired(token: string): boolean {
  const decoded = decodeToken(token);
  if (!decoded) return true;
  // Add 30 second buffer
  return decoded.exp * 1000 < Date.now() + 30000;
}

export function AuthProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [state, setState] = useState<AuthState>({
    isLoading: true,
    isAuthenticated: false,
    user: null,
    accessToken: null,
    refreshToken: null,
  });

  const isDev = import.meta.env.DEV;

  // Set tokens and derive user from access token
  const setTokens = useCallback((accessToken: string, refreshToken: string | null) => {
    const decoded = decodeToken(accessToken);
    const user = decoded ? { id: parseInt(decoded.sub, 10), email: decoded.email || '' } : null;

    localStorage.setItem(TOKEN_STORAGE_KEY, accessToken);
    if (refreshToken) {
      localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, refreshToken);
    }

    setState({
      isLoading: false,
      isAuthenticated: true,
      user,
      accessToken,
      refreshToken,
    });
  }, []);

  // Clear all auth state
  const clearAuth = useCallback(() => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
    setState({
      isLoading: false,
      isAuthenticated: false,
      user: null,
      accessToken: null,
      refreshToken: null,
    });
  }, []);

  // Request magic link email
  const requestMagicLink = useCallback(async (email: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await fetch(`${getApiUrl()}/auth/magic-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        return { success: false, error: data.detail || 'Failed to send magic link' };
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }, []);

  // Verify magic link code
  const verifyMagicLinkCode = useCallback(async (
    email: string,
    code: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await fetch(`${getApiUrl()}/auth/magic-link/verify-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        return { success: false, error: data.detail || 'Invalid code' };
      }

      const data = await response.json();
      setTokens(data.access_token, data.refresh_token);
      return { success: true };
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }, [setTokens]);

  // Refresh access token
  const refreshAccessToken = useCallback(async (): Promise<boolean> => {
    const refreshToken = state.refreshToken || localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
    if (!refreshToken) return false;

    try {
      const response = await fetch(`${getApiUrl()}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      if (!response.ok) {
        clearAuth();
        return false;
      }

      const data = await response.json();
      setTokens(data.access_token, data.refresh_token);
      return true;
    } catch {
      clearAuth();
      return false;
    }
  }, [state.refreshToken, setTokens, clearAuth]);

  // Sign out
  const signOut = useCallback(() => {
    clearAuth();
  }, [clearAuth]);

  // Initialize auth on mount
  useEffect(() => {
    const initAuth = async () => {
      // In dev mode, auto-fetch dev token
      if (isDev) {
        try {
          const response = await fetch(`${getApiUrl()}/auth/dev-token`);
          if (response.ok) {
            const data = await response.json();
            setTokens(data.access_token, null);
            return;
          }
        } catch (error) {
          console.error('Failed to get dev token:', error);
        }
      }

      // In production, check for stored tokens
      const storedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
      const storedRefresh = localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);

      if (storedToken && !isTokenExpired(storedToken)) {
        setTokens(storedToken, storedRefresh);
        return;
      }

      // Try to refresh if we have a refresh token
      if (storedRefresh) {
        const refreshed = await refreshAccessToken();
        if (refreshed) return;
      }

      // No valid auth
      setState(s => ({ ...s, isLoading: false }));
    };

    initAuth();
  }, [isDev, setTokens, refreshAccessToken]);

  // Auto-refresh token before expiry
  useEffect(() => {
    if (!state.accessToken || !state.refreshToken) return;

    const decoded = decodeToken(state.accessToken);
    if (!decoded) return;

    // Refresh 60 seconds before expiry
    const expiresIn = decoded.exp * 1000 - Date.now() - 60000;
    if (expiresIn <= 0) {
      refreshAccessToken();
      return;
    }

    const timeout = setTimeout(() => {
      refreshAccessToken();
    }, expiresIn);

    return () => clearTimeout(timeout);
  }, [state.accessToken, state.refreshToken, refreshAccessToken]);

  return (
    <AuthContext.Provider
      value={{
        ...state,
        requestMagicLink,
        verifyMagicLinkCode,
        refreshAccessToken,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
