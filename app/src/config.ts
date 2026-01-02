/**
 * Application configuration loaded from environment.
 */

// Default WebSocket URL for development
const DEFAULT_WS_URL = 'ws://localhost:8000/ws';

/**
 * Get the WebSocket URL from environment or use default.
 * In Expo, you can set EXPO_PUBLIC_WS_URL environment variable.
 */
export function getWebSocketUrl(): string {
  // Expo environment variables are injected at build time
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
  const envUrl = (process.env as Record<string, string | undefined>).EXPO_PUBLIC_WS_URL;
  return envUrl ?? DEFAULT_WS_URL;
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
