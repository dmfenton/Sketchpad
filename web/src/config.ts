/**
 * Configuration for the web app.
 */

export const getApiUrl = (): string => {
  // Environment variable override
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }

  // In dev, use Vite proxy (proxies to localhost:8000)
  if (import.meta.env.DEV) {
    return '/api';
  }

  // In production, nginx proxies /api/* to the backend
  return '/api';
};

export const getWebSocketUrl = (): string => {
  // Environment variable override
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL;
  }

  // In dev, connect directly to backend
  if (import.meta.env.DEV) {
    return 'ws://localhost:8000/ws';
  }

  // In production, construct WebSocket URL from current location
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
};
