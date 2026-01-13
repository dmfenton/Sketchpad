/**
 * Root layout for expo-router.
 * Wraps all routes with theme and auth providers.
 */

import * as Sentry from '@sentry/react-native';
import { Stack } from 'expo-router';

import { AuthProvider } from '../src/context/AuthContext';
import { ThemeProvider } from '../src/theme';

// Initialize Sentry for crash reporting
Sentry.init({
  dsn: 'https://cbc0025fc6dcd2b55265bc8b4e429b20@o4510700455591936.ingest.us.sentry.io/4510700456443904',
  // Disable in development
  enabled: !__DEV__,
  // Set sample rate for performance monitoring
  tracesSampleRate: 0.2,
  // Capture unhandled promise rejections
  enableAutoSessionTracking: true,
});

function RootLayout() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="auth/verify" />
          <Stack.Screen name="auth/callback" />
        </Stack>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default Sentry.wrap(RootLayout);
