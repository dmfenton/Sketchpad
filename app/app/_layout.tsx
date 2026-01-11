/**
 * Root layout for expo-router.
 * Wraps all routes with theme and auth providers.
 */

import { Stack } from 'expo-router';

import { AuthProvider } from '../src/context/AuthContext';
import { ThemeProvider } from '../src/theme';

export default function RootLayout() {
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
