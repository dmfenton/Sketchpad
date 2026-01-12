/**
 * Configuration for the web app.
 *
 * In development: Uses Vite proxy for API, direct WebSocket connection
 * In production: Uses same origin (served by FastAPI)
 */

export const getApiUrl = (): string => {
  if (import.meta.env.DEV) {
    // In dev, use Vite proxy
    return '/api';
  }
  // In production, API is on same origin
  return '';
};

export const getWebSocketUrl = (): string => {
  if (import.meta.env.DEV) {
    return 'ws://localhost:8000/ws';
  }
  // In production, use same host with appropriate protocol
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
};
