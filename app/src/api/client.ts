/**
 * Centralized API client with authentication.
 * Provides authenticated fetch wrapper and image source helpers.
 */

import { getApiUrl } from '../config';

export interface ApiClient {
  /** Authenticated fetch wrapper - adds auth headers automatically */
  fetch: (path: string, options?: RequestInit) => Promise<Response>;
  /** Get image source with auth headers for React Native Image components */
  getImageSource: (path: string) => { uri: string; headers?: Record<string, string> };
  /** Get base URL for building custom URLs */
  baseUrl: string;
}

/**
 * Create an API client with optional authentication.
 * @param accessToken - JWT access token (null for unauthenticated requests)
 */
export function createApiClient(accessToken: string | null): ApiClient {
  const baseUrl = getApiUrl();
  const authHeaders: Record<string, string> = accessToken
    ? { Authorization: `Bearer ${accessToken}` }
    : {};

  return {
    baseUrl,

    fetch: (path: string, options: RequestInit = {}) => {
      return fetch(`${baseUrl}${path}`, {
        ...options,
        headers: { ...authHeaders, ...options.headers },
      });
    },

    getImageSource: (path: string) => ({
      uri: `${baseUrl}${path}`,
      headers: accessToken ? authHeaders : undefined,
    }),
  };
}
