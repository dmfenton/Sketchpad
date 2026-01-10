/**
 * Configuration for the web dev server.
 */

export const getApiUrl = (): string => {
  // In dev, use Vite proxy
  if (import.meta.env.DEV) {
    return '/api';
  }
  return import.meta.env.VITE_API_URL || 'http://localhost:8000';
};

export const getWebSocketUrl = (): string => {
  if (import.meta.env.DEV) {
    return 'ws://localhost:8000/ws';
  }
  return import.meta.env.VITE_WS_URL || 'ws://localhost:8000/ws';
};
