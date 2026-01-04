/**
 * Magic link verification route.
 * Handles Universal Links: https://monet.dmfenton.net/auth/verify?token=...
 *
 * This route exists because expo-router intercepts Universal Links.
 * We extract the token and redirect to main app with it in the URL,
 * where the Linking handler in App.tsx will process it.
 */

import { Redirect, useLocalSearchParams } from 'expo-router';

export default function VerifyMagicLink() {
  const { token } = useLocalSearchParams<{ token: string }>();

  // Redirect to main app with token - App.tsx will handle via getInitialURL
  // The token gets passed through the redirect
  if (token) {
    return <Redirect href={`/?magic_token=${token}`} />;
  }

  return <Redirect href="/" />;
}
