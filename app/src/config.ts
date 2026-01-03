/**
 * Application configuration loaded from environment.
 */

import { Platform } from 'react-native';

/**
 * Get the base host for API connections.
 */
function getHost(): string {
  // Check for explicit env var
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
  const envUrl = (process.env as Record<string, string | undefined>).EXPO_PUBLIC_API_URL;
  if (envUrl) {
    // Extract host from URL
    const match = envUrl.match(/https?:\/\/([^:/]+)/);
    if (match?.[1]) return match[1];
  }

  // On web, use the current host
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return window.location.hostname;
  }

  // For native devices, use the LAN IP of the dev machine
  return '192.168.4.65';
}

/**
 * Get the API URL for REST endpoints.
 */
export function getApiUrl(): string {
  // Check for explicit env var first
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
  const envUrl = (process.env as Record<string, string | undefined>).EXPO_PUBLIC_API_URL;
  if (envUrl) return envUrl;

  return `http://${getHost()}:8000`;
}

/**
 * Get the WebSocket URL dynamically based on current host.
 * This allows the app to connect to the server from any device on the LAN.
 */
export function getWebSocketUrl(token?: string): string {
  // Check for explicit env var first
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
  const envUrl = (process.env as Record<string, string | undefined>).EXPO_PUBLIC_WS_URL;
  const baseUrl = envUrl || `ws://${getHost()}:8000/ws`;

  // Append token if provided
  if (token) {
    return `${baseUrl}?token=${encodeURIComponent(token)}`;
  }
  return baseUrl;
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
