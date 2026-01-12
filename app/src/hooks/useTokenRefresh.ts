/**
 * Token refresh hook with proper async mutex pattern.
 *
 * Prevents multiple concurrent refresh attempts and provides
 * a clean API for handling auth errors.
 */

import { useCallback, useRef } from 'react';

interface UseTokenRefreshOptions {
  /** Function to refresh the access token */
  refreshToken: () => Promise<boolean>;
  /** Function to sign out the user */
  signOut: () => Promise<void>;
  /** Cooldown period in ms before allowing another refresh (default: 5000) */
  cooldownMs?: number;
}

interface UseTokenRefreshResult {
  /** Handle an auth error by attempting to refresh, then sign out if failed */
  handleAuthError: () => void;
  /** Whether a refresh is currently in progress */
  isRefreshing: boolean;
}

/**
 * Hook that provides a debounced/mutex-protected token refresh handler.
 *
 * Features:
 * - Prevents concurrent refresh attempts (mutex)
 * - Provides cooldown period before retry
 * - Auto signs out if refresh fails
 *
 * Usage:
 * ```tsx
 * const { handleAuthError } = useTokenRefresh({
 *   refreshToken,
 *   signOut,
 * });
 *
 * useWebSocket({
 *   onAuthError: handleAuthError,
 * });
 * ```
 */
export function useTokenRefresh({
  refreshToken,
  signOut,
  cooldownMs = 5000,
}: UseTokenRefreshOptions): UseTokenRefreshResult {
  // Mutex: only one refresh at a time
  const refreshPromiseRef = useRef<Promise<boolean> | null>(null);
  // Cooldown: prevent rapid retries
  const lastRefreshTimeRef = useRef<number>(0);
  // Track state for consumers
  const isRefreshingRef = useRef<boolean>(false);

  const handleAuthError = useCallback(() => {
    const now = Date.now();

    // Check cooldown
    if (now - lastRefreshTimeRef.current < cooldownMs) {
      console.log('[useTokenRefresh] Within cooldown period, skipping');
      return;
    }

    // Check if already refreshing (mutex)
    if (refreshPromiseRef.current !== null) {
      console.log('[useTokenRefresh] Refresh already in progress, waiting');
      // Wait for existing refresh instead of starting new one
      void refreshPromiseRef.current.then((success) => {
        if (!success) {
          console.log('[useTokenRefresh] Existing refresh failed');
        }
      });
      return;
    }

    // Start refresh
    console.log('[useTokenRefresh] Starting token refresh');
    isRefreshingRef.current = true;
    lastRefreshTimeRef.current = now;

    const refreshPromise = (async () => {
      try {
        const success = await refreshToken();
        if (!success) {
          console.log('[useTokenRefresh] Refresh failed, signing out');
          await signOut();
        }
        return success;
      } catch (error) {
        console.error('[useTokenRefresh] Refresh error:', error);
        await signOut();
        return false;
      } finally {
        isRefreshingRef.current = false;
        refreshPromiseRef.current = null;
      }
    })();

    refreshPromiseRef.current = refreshPromise;
  }, [refreshToken, signOut, cooldownMs]);

  return {
    handleAuthError,
    get isRefreshing() {
      return isRefreshingRef.current;
    },
  };
}
