/**
 * API hook for REST calls with authentication.
 */

import { useCallback } from 'react';

import type { Path, SavedCanvas } from '@drawing-agent/shared';

import { getApiUrl } from '../config';
import { useAuth } from '../context';

// API response types
export interface GalleryPiece {
  id: string;
  created_at: string;
  piece_number: number;
  stroke_count: number;
}

export interface GalleryPieceDetail {
  piece_number: number;
  strokes: Path[];
}

export interface UseApiReturn {
  fetchGallery: () => Promise<SavedCanvas[]>;
  fetchGalleryPiece: (pieceNumber: number) => Promise<GalleryPieceDetail | null>;
  deleteGalleryPiece: (pieceNumber: number) => Promise<boolean>;
}

export function useApi(): UseApiReturn {
  const { accessToken } = useAuth();

  const authFetch = useCallback(
    async (path: string, options?: RequestInit) => {
      const response = await fetch(`${getApiUrl()}${path}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          ...options?.headers,
        },
      });
      return response;
    },
    [accessToken]
  );

  const fetchGallery = useCallback(async (): Promise<SavedCanvas[]> => {
    try {
      const response = await authFetch('/gallery');
      if (!response.ok) {
        console.error('[API] Failed to fetch gallery:', response.status);
        return [];
      }
      const data = (await response.json()) as GalleryPiece[];
      // Map to SavedCanvas format expected by the app
      return data.map((p) => ({
        id: p.id,
        created_at: p.created_at,
        piece_number: p.piece_number,
        stroke_count: p.stroke_count,
      }));
    } catch (error) {
      console.error('[API] Gallery fetch error:', error);
      return [];
    }
  }, [authFetch]);

  const fetchGalleryPiece = useCallback(
    async (pieceNumber: number): Promise<GalleryPieceDetail | null> => {
      try {
        const response = await authFetch(`/gallery/${pieceNumber}`);
        if (!response.ok) {
          console.error('[API] Failed to fetch gallery piece:', response.status);
          return null;
        }
        return (await response.json()) as GalleryPieceDetail;
      } catch (error) {
        console.error('[API] Gallery piece fetch error:', error);
        return null;
      }
    },
    [authFetch]
  );

  const deleteGalleryPiece = useCallback(
    async (pieceNumber: number): Promise<boolean> => {
      try {
        const response = await authFetch(`/gallery/${pieceNumber}`, {
          method: 'DELETE',
        });
        return response.ok;
      } catch (error) {
        console.error('[API] Gallery piece delete error:', error);
        return false;
      }
    },
    [authFetch]
  );

  return {
    fetchGallery,
    fetchGalleryPiece,
    deleteGalleryPiece,
  };
}
