/**
 * Authentication Context for Web - Manages JWT tokens with localStorage
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getApiUrl } from '../config';

// Token storage keys
const ACCESS_TOKEN_KEY = 'auth_access_token';
const REFRESH_TOKEN_KEY = 'auth_refresh_token';

export interface User {
  id: string;
  email: string;
}

export interface AuthState {
  isLoading: boolean;
  isAuthenticated: boolean;
  user: User | null;
  accessToken: string | null;
}

export interface AuthContextValue extends AuthState {
  signOut: () => void;
  requestMagicLink: (email: string) => Promise<{ success: boolean; error?: string }>;
  verifyMagicLinkCode: (
    email: string,
    code: string
  ) => Promise<{ success: boolean; error?: string }>;
  setTokensFromCallback: (
    accessToken: string,
    refreshToken: string
  ) => { success: boolean; error?: string };
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Decode JWT to get user info (without verifying - server does that)
function decodeToken(token: string): { sub: string; email: string; exp: number } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3 || !parts[1]) return null;
    // Handle URL-safe base64 (replace - with + and _ with /)
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const decoded = atob(base64);
    return JSON.parse(decoded) as { sub: string; email: string; exp: number };
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
  });

  const refreshTokenInternal = useCallback(async (refreshTokenValue: string): Promise<boolean> => {
    try {
      const response = await fetch(`${getApiUrl()}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshTokenValue }),
      });

      if (!response.ok) {
        localStorage.removeItem(ACCESS_TOKEN_KEY);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
        return false;
      }

      const data = (await response.json()) as { access_token: string; refresh_token: string };
      localStorage.setItem(ACCESS_TOKEN_KEY, data.access_token);
      localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh_token);

      const decoded = decodeToken(data.access_token);
      if (decoded) {
        setState({
          isLoading: false,
          isAuthenticated: true,
          user: { id: decoded.sub, email: decoded.email },
          accessToken: data.access_token,
        });
        return true;
      }
    } catch (error) {
      console.error('[Auth] Refresh failed:', error);
    }
    return false;
  }, []);

  // Load tokens from storage on mount
  useEffect(() => {
    async function loadTokens(): Promise<void> {
      try {
        const accessToken = localStorage.getItem(ACCESS_TOKEN_KEY);
        const refreshTokenValue = localStorage.getItem(REFRESH_TOKEN_KEY);

        if (accessToken && !isTokenExpired(accessToken)) {
          const decoded = decodeToken(accessToken);
          if (decoded) {
            setState({
              isLoading: false,
              isAuthenticated: true,
              user: { id: decoded.sub, email: decoded.email },
              accessToken,
            });
            return;
          }
        }

        // Try to refresh if we have a refresh token
        if (refreshTokenValue) {
          const refreshed = await refreshTokenInternal(refreshTokenValue);
          if (refreshed) return;
        }

        // No valid tokens
        setState({
          isLoading: false,
          isAuthenticated: false,
          user: null,
          accessToken: null,
        });
      } catch (error) {
        console.error('[Auth] Failed to load tokens:', error);
        setState({
          isLoading: false,
          isAuthenticated: false,
          user: null,
          accessToken: null,
        });
      }
    }

    void loadTokens();
  }, [refreshTokenInternal]);

  const signOut = useCallback(() => {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    setState({
      isLoading: false,
      isAuthenticated: false,
      user: null,
      accessToken: null,
    });
  }, []);

  const requestMagicLink = useCallback(async (email: string) => {
    try {
      const response = await fetch(`${getApiUrl()}/auth/magic-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, platform: 'web' }),
      });

      if (!response.ok) {
        const error = (await response.json()) as { detail: string };
        return { success: false, error: error.detail || 'Failed to send magic link' };
      }

      return { success: true };
    } catch (error) {
      console.error('[Auth] Magic link request error:', error);
      return { success: false, error: 'Network error' };
    }
  }, []);

  const verifyMagicLinkCode = useCallback(async (email: string, code: string) => {
    try {
      const response = await fetch(`${getApiUrl()}/auth/magic-link/verify-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      });

      if (!response.ok) {
        const error = (await response.json()) as { detail: string };
        return { success: false, error: error.detail || 'Invalid or expired code' };
      }

      const data = (await response.json()) as { access_token: string; refresh_token: string };
      localStorage.setItem(ACCESS_TOKEN_KEY, data.access_token);
      localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh_token);

      const decoded = decodeToken(data.access_token);
      if (decoded) {
        setState({
          isLoading: false,
          isAuthenticated: true,
          user: { id: decoded.sub, email: decoded.email },
          accessToken: data.access_token,
        });
        return { success: true };
      }

      return { success: false, error: 'Invalid token received' };
    } catch (error) {
      console.error('[Auth] Magic link code verify error:', error);
      return { success: false, error: 'Network error' };
    }
  }, []);

  // Set tokens directly from magic link callback URL
  const setTokensFromCallback = useCallback(
    (accessToken: string, refreshToken: string): { success: boolean; error?: string } => {
      try {
        const decoded = decodeToken(accessToken);
        if (!decoded) {
          return { success: false, error: 'Invalid token received' };
        }

        localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
        localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);

        setState({
          isLoading: false,
          isAuthenticated: true,
          user: { id: decoded.sub, email: decoded.email },
          accessToken,
        });

        return { success: true };
      } catch (error) {
        console.error('[Auth] Set tokens error:', error);
        return { success: false, error: 'Failed to store tokens' };
      }
    },
    []
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      signOut,
      requestMagicLink,
      verifyMagicLinkCode,
      setTokensFromCallback,
    }),
    [state, signOut, requestMagicLink, verifyMagicLinkCode, setTokensFromCallback]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
