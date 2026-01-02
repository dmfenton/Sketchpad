/**
 * Application configuration loaded from environment.
 */

import { Platform } from 'react-native';

/**
 * Get the WebSocket URL dynamically based on current host.
 * This allows the app to connect to the server from any device on the LAN.
 */
export function getWebSocketUrl(): string {
  // Check for explicit env var first
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
  const envUrl = (process.env as Record<string, string | undefined>).EXPO_PUBLIC_WS_URL;
  if (envUrl) return envUrl;

  // On web, use the current host
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const host = window.location.hostname;
    return `ws://${host}:8000/ws`;
  }

  // For native devices, use the LAN IP of the dev machine
  // This is the IP where the Python server is running
  return 'ws://192.168.4.65:8000/ws';
}

/**
 * Application configuration.
 */
export const config = {
  /**
   * WebSocket URL for connecting to the Drawing Agent server.
   */
  wsUrl: getWebSocketUrl(),
} as const;
