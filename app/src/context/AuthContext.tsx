/**
 * Authentication Context - Manages JWT tokens with secure storage
 */

import { decode as base64Decode } from 'base-64';
import * as SecureStore from 'expo-secure-store';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';

import { getApiUrl } from '../config';

// Token storage keys
const ACCESS_TOKEN_KEY = 'auth_access_token';
const REFRESH_TOKEN_KEY = 'auth_refresh_token';

export interface User {
  id: number;
  email: string;
}

export interface AuthState {
  isLoading: boolean;
  isAuthenticated: boolean;
  user: User | null;
  accessToken: string | null;
}

export interface AuthContextValue extends AuthState {
  signIn: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signUp: (
    email: string,
    password: string,
    inviteCode: string
  ) => Promise<{ success: boolean; error?: string }>;
  signOut: () => Promise<void>;
  refreshToken: () => Promise<boolean>;
  requestMagicLink: (email: string) => Promise<{ success: boolean; error?: string }>;
  verifyMagicLink: (token: string) => Promise<{ success: boolean; error?: string }>;
  verifyMagicLinkCode: (
    email: string,
    code: string
  ) => Promise<{ success: boolean; error?: string }>;
  setTokensFromCallback: (
    accessToken: string,
    refreshToken: string
  ) => Promise<{ success: boolean; error?: string }>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Web fallback for SecureStore (uses localStorage)
// NOTE: localStorage is vulnerable to XSS attacks. For production web,
// consider httpOnly cookies or ensure strong XSS protections are in place.
const storage = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      return localStorage.getItem(key);
    }
    return SecureStore.getItemAsync(key);
  },
  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      localStorage.setItem(key, value);
      return;
    }
    return SecureStore.setItemAsync(key, value);
  },
  async deleteItem(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      localStorage.removeItem(key);
      return;
    }
    return SecureStore.deleteItemAsync(key);
  },
};

// Decode JWT to get user info (without verifying - server does that)
function decodeToken(token: string): { sub: string; email: string; exp: number } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3 || !parts[1]) return null;
    // Handle URL-safe base64 (replace - with + and _ with /)
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const decoded = base64Decode(base64);
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    isLoading: true,
    isAuthenticated: false,
    user: null,
    accessToken: null,
  });

  // Load tokens from storage on mount
  useEffect(() => {
    async function loadTokens() {
      try {
        const accessToken = await storage.getItem(ACCESS_TOKEN_KEY);
        const refreshTokenValue = await storage.getItem(REFRESH_TOKEN_KEY);

        if (accessToken && !isTokenExpired(accessToken)) {
          const decoded = decodeToken(accessToken);
          if (decoded) {
            setState({
              isLoading: false,
              isAuthenticated: true,
              user: { id: parseInt(decoded.sub, 10), email: decoded.email },
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
  }, []);

  const refreshTokenInternal = async (refreshTokenValue: string): Promise<boolean> => {
    try {
      const response = await fetch(`${getApiUrl()}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshTokenValue }),
      });

      if (!response.ok) {
        // Refresh failed, clear tokens
        await storage.deleteItem(ACCESS_TOKEN_KEY);
        await storage.deleteItem(REFRESH_TOKEN_KEY);
        return false;
      }

      const data = (await response.json()) as { access_token: string; refresh_token: string };
      await storage.setItem(ACCESS_TOKEN_KEY, data.access_token);
      await storage.setItem(REFRESH_TOKEN_KEY, data.refresh_token);

      const decoded = decodeToken(data.access_token);
      if (decoded) {
        setState({
          isLoading: false,
          isAuthenticated: true,
          user: { id: parseInt(decoded.sub, 10), email: decoded.email },
          accessToken: data.access_token,
        });
        return true;
      }
    } catch (error) {
      console.error('[Auth] Refresh failed:', error);
    }
    return false;
  };

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const response = await fetch(`${getApiUrl()}/auth/signin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const error = (await response.json()) as { detail: string };
        return { success: false, error: error.detail || 'Sign in failed' };
      }

      const data = (await response.json()) as { access_token: string; refresh_token: string };
      await storage.setItem(ACCESS_TOKEN_KEY, data.access_token);
      await storage.setItem(REFRESH_TOKEN_KEY, data.refresh_token);

      const decoded = decodeToken(data.access_token);
      if (decoded) {
        setState({
          isLoading: false,
          isAuthenticated: true,
          user: { id: parseInt(decoded.sub, 10), email: decoded.email },
          accessToken: data.access_token,
        });
        return { success: true };
      }

      return { success: false, error: 'Invalid token received' };
    } catch (error) {
      console.error('[Auth] Sign in error:', error);
      return { success: false, error: 'Network error' };
    }
  }, []);

  const signUp = useCallback(async (email: string, password: string, inviteCode: string) => {
    try {
      const response = await fetch(`${getApiUrl()}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, invite_code: inviteCode }),
      });

      if (!response.ok) {
        const error = (await response.json()) as { detail: string };
        return { success: false, error: error.detail || 'Sign up failed' };
      }

      const data = (await response.json()) as { access_token: string; refresh_token: string };
      await storage.setItem(ACCESS_TOKEN_KEY, data.access_token);
      await storage.setItem(REFRESH_TOKEN_KEY, data.refresh_token);

      const decoded = decodeToken(data.access_token);
      if (decoded) {
        setState({
          isLoading: false,
          isAuthenticated: true,
          user: { id: parseInt(decoded.sub, 10), email: decoded.email },
          accessToken: data.access_token,
        });
        return { success: true };
      }

      return { success: false, error: 'Invalid token received' };
    } catch (error) {
      console.error('[Auth] Sign up error:', error);
      return { success: false, error: 'Network error' };
    }
  }, []);

  const signOut = useCallback(async () => {
    await storage.deleteItem(ACCESS_TOKEN_KEY);
    await storage.deleteItem(REFRESH_TOKEN_KEY);
    setState({
      isLoading: false,
      isAuthenticated: false,
      user: null,
      accessToken: null,
    });
  }, []);

  const refreshToken = useCallback(async () => {
    const refreshTokenValue = await storage.getItem(REFRESH_TOKEN_KEY);
    if (!refreshTokenValue) return false;
    return refreshTokenInternal(refreshTokenValue);
  }, []);

  const requestMagicLink = useCallback(async (email: string) => {
    try {
      const response = await fetch(`${getApiUrl()}/auth/magic-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
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

  const verifyMagicLink = useCallback(async (token: string) => {
    try {
      const response = await fetch(`${getApiUrl()}/auth/magic-link/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });

      if (!response.ok) {
        const error = (await response.json()) as { detail: string };
        return { success: false, error: error.detail || 'Invalid or expired magic link' };
      }

      const data = (await response.json()) as { access_token: string; refresh_token: string };
      await storage.setItem(ACCESS_TOKEN_KEY, data.access_token);
      await storage.setItem(REFRESH_TOKEN_KEY, data.refresh_token);

      const decoded = decodeToken(data.access_token);
      if (decoded) {
        setState({
          isLoading: false,
          isAuthenticated: true,
          user: { id: parseInt(decoded.sub, 10), email: decoded.email },
          accessToken: data.access_token,
        });
        return { success: true };
      }

      return { success: false, error: 'Invalid token received' };
    } catch (error) {
      console.error('[Auth] Magic link verify error:', error);
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
      await storage.setItem(ACCESS_TOKEN_KEY, data.access_token);
      await storage.setItem(REFRESH_TOKEN_KEY, data.refresh_token);

      const decoded = decodeToken(data.access_token);
      if (decoded) {
        setState({
          isLoading: false,
          isAuthenticated: true,
          user: { id: parseInt(decoded.sub, 10), email: decoded.email },
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

  // Set tokens directly from deep link callback (used when web page redirects to app)
  const setTokensFromCallback = useCallback(
    async (accessToken: string, refreshTokenValue: string) => {
      try {
        await storage.setItem(ACCESS_TOKEN_KEY, accessToken);
        await storage.setItem(REFRESH_TOKEN_KEY, refreshTokenValue);

        const decoded = decodeToken(accessToken);
        if (decoded) {
          setState({
            isLoading: false,
            isAuthenticated: true,
            user: { id: parseInt(decoded.sub, 10), email: decoded.email },
            accessToken,
          });
          return { success: true };
        }

        return { success: false, error: 'Invalid token received' };
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
      signIn,
      signUp,
      signOut,
      refreshToken,
      requestMagicLink,
      verifyMagicLink,
      verifyMagicLinkCode,
      setTokensFromCallback,
    }),
    [
      state,
      signIn,
      signUp,
      signOut,
      refreshToken,
      requestMagicLink,
      verifyMagicLink,
      verifyMagicLinkCode,
      setTokensFromCallback,
    ]
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
