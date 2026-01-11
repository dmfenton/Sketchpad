/**
 * Magic link verification route.
 * Handles Universal Links: https://monet.dmfenton.net/auth/verify?token=...
 *
 * This route verifies the magic link token directly and sets auth state,
 * then redirects to the main app.
 */

import { Redirect, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/theme';

export default function VerifyMagicLink() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { verifyMagicLink } = useAuth();
  const { colors } = useTheme();
  const [verifying, setVerifying] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function verify() {
      if (!token) {
        setVerifying(false);
        return;
      }

      console.log('[VerifyMagicLink] Verifying token');
      const result = await verifyMagicLink(token);
      if (!result.success) {
        console.log('[VerifyMagicLink] Verification failed:', result.error);
        setError(result.error ?? 'Verification failed');
      } else {
        console.log('[VerifyMagicLink] Verification successful');
      }
      setVerifying(false);
    }

    void verify();
  }, [token, verifyMagicLink]);

  // Still verifying - show loading
  if (verifying) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.text, { color: colors.textPrimary }]}>Signing you in...</Text>
      </View>
    );
  }

  // Verification failed - redirect with error param so AuthScreen can display it
  if (error) {
    return <Redirect href={`/?auth_error=${encodeURIComponent(error)}`} />;
  }

  // Success or no token - redirect to main app
  return <Redirect href="/" />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  text: {
    fontSize: 16,
    marginTop: 12,
  },
});
