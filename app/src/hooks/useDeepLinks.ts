/**
 * Deep link handling for magic link authentication.
 * Handles Universal Links and custom scheme callbacks.
 */

import * as Linking from 'expo-linking';
import { useCallback, useEffect, useState } from 'react';

export interface UseDeepLinksOptions {
  /** Verify a magic link token */
  verifyMagicLink: (token: string) => Promise<{ success: boolean; error?: string }>;
  /** Set tokens from web callback */
  setTokensFromCallback: (
    accessToken: string,
    refreshToken: string
  ) => Promise<{ success: boolean; error?: string }>;
}

export interface UseDeepLinksReturn {
  /** Whether we're currently verifying a magic link */
  verifyingMagicLink: boolean;
  /** Error message from magic link verification */
  magicLinkError: string | null;
  /** Clear the magic link error */
  clearError: () => void;
}

/**
 * Hook to handle deep links for magic link authentication.
 *
 * Handles several URL patterns:
 * - `codemonet://auth/callback?access_token=...&refresh_token=...` - Web callback with tokens
 * - `/auth/verify?token=...` - Universal Link with magic token
 * - `?magic_token=...` - Expo-router redirect with magic token
 * - `?access_token=...&refresh_token=...` - Expo-router redirect with tokens
 */
export function useDeepLinks({
  verifyMagicLink,
  setTokensFromCallback,
}: UseDeepLinksOptions): UseDeepLinksReturn {
  const [verifyingMagicLink, setVerifyingMagicLink] = useState(false);
  const [magicLinkError, setMagicLinkError] = useState<string | null>(null);

  const clearError = useCallback(() => {
    setMagicLinkError(null);
  }, []);

  // Handle incoming deep link URL
  const handleDeepLink = useCallback(
    async (url: string | null) => {
      if (!url) return;

      try {
        const parsed = Linking.parse(url);

        // Handle callback from web page: codemonet://auth/callback?access_token=...&refresh_token=...
        if (
          parsed.path === 'auth/callback' &&
          parsed.queryParams?.access_token &&
          parsed.queryParams?.refresh_token
        ) {
          const accessToken = parsed.queryParams.access_token as string;
          const refreshToken = parsed.queryParams.refresh_token as string;
          console.log('[useDeepLinks] Setting tokens from web callback');
          setVerifyingMagicLink(true);
          setMagicLinkError(null);

          const result = await setTokensFromCallback(accessToken, refreshToken);
          if (!result.success) {
            setMagicLinkError(result.error ?? 'Failed to authenticate');
          }
          setVerifyingMagicLink(false);
          return;
        }

        // Handle magic link verification via Universal Links: /auth/verify?token=...
        if (parsed.path === 'auth/verify' && parsed.queryParams?.token) {
          const token = parsed.queryParams.token as string;
          console.log('[useDeepLinks] Verifying magic link token');
          setVerifyingMagicLink(true);
          setMagicLinkError(null);

          const result = await verifyMagicLink(token);
          if (!result.success) {
            setMagicLinkError(result.error ?? 'Magic link verification failed');
          }
          setVerifyingMagicLink(false);
          return;
        }

        // Handle magic_token from expo-router redirect
        if (parsed.queryParams?.magic_token) {
          const token = parsed.queryParams.magic_token as string;
          console.log('[useDeepLinks] Verifying magic link token from redirect');
          setVerifyingMagicLink(true);
          setMagicLinkError(null);

          const result = await verifyMagicLink(token);
          if (!result.success) {
            setMagicLinkError(result.error ?? 'Magic link verification failed');
          }
          setVerifyingMagicLink(false);
          return;
        }

        // Handle tokens from expo-router redirect
        if (parsed.queryParams?.access_token && parsed.queryParams?.refresh_token) {
          const accessToken = parsed.queryParams.access_token as string;
          const refreshToken = parsed.queryParams.refresh_token as string;
          console.log('[useDeepLinks] Setting tokens from expo-router redirect');
          setVerifyingMagicLink(true);
          setMagicLinkError(null);

          const result = await setTokensFromCallback(accessToken, refreshToken);
          if (!result.success) {
            setMagicLinkError(result.error ?? 'Failed to authenticate');
          }
          setVerifyingMagicLink(false);
        }
      } catch (error) {
        console.error('[useDeepLinks] Error handling deep link:', error);
        setVerifyingMagicLink(false);
      }
    },
    [verifyMagicLink, setTokensFromCallback]
  );

  // Listen for deep links when app is already running
  useEffect(() => {
    const subscription = Linking.addEventListener('url', (event) => {
      void handleDeepLink(event.url);
    });

    // Check for initial URL (app opened via deep link)
    void Linking.getInitialURL().then(handleDeepLink);

    return () => subscription.remove();
  }, [handleDeepLink]);

  return {
    verifyingMagicLink,
    magicLinkError,
    clearError,
  };
}
