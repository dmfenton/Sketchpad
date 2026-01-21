/**
 * Hook for loading images that require authentication.
 * On web, fetches as blob and returns blob URL (workaround for headers not working).
 * On native, returns source with headers directly.
 */

import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import type { ApiClient } from '../api';

interface ImageSource {
  uri: string;
  headers?: Record<string, string>;
}

interface UseAuthenticatedImageResult {
  source: ImageSource | null;
  loading: boolean;
}

/**
 * Hook for loading images that require auth.
 * On web, fetches as blob and returns blob URL (workaround for headers not working on <img>).
 * On native, returns source with headers directly.
 */
export function useAuthenticatedImage(
  api: ApiClient,
  path: string | undefined
): UseAuthenticatedImageResult {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!path) {
      setBlobUrl(null);
      return;
    }

    // Native platforms support headers - use directly
    if (Platform.OS !== 'web') {
      return;
    }

    // Web: fetch as blob and create object URL
    let cancelled = false;
    setLoading(true);

    api
      .fetch(path)
      .then((response) => {
        if (!response.ok) throw new Error('Failed to load image');
        return response.blob();
      })
      .then((blob) => {
        if (!cancelled) {
          setBlobUrl(URL.createObjectURL(blob));
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [api, path]);

  // Cleanup blob URL when component unmounts or path changes
  useEffect(() => {
    return () => {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [blobUrl]);

  if (!path) return { source: null, loading: false };

  // Web: use blob URL
  if (Platform.OS === 'web') {
    return {
      source: blobUrl ? { uri: blobUrl } : null,
      loading,
    };
  }

  // Native: use headers directly
  return {
    source: api.getImageSource(path),
    loading: false,
  };
}
