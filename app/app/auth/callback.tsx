/**
 * Auth callback route for deep links.
 * Handles: codemonet://auth/callback?access_token=...&refresh_token=...
 *
 * This route receives tokens from the web fallback page and passes them
 * to the main app for authentication.
 */

import { Redirect, useLocalSearchParams } from 'expo-router';

export default function AuthCallback() {
  const { access_token, refresh_token } = useLocalSearchParams<{
    access_token: string;
    refresh_token: string;
  }>();

  // Redirect to main app with tokens - App.tsx will handle via getInitialURL
  if (access_token && refresh_token) {
    return <Redirect href={`/?access_token=${access_token}&refresh_token=${refresh_token}`} />;
  }

  return <Redirect href="/" />;
}
