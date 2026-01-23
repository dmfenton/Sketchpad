/**
 * Tests for HomePanel component logic.
 *
 * Tests the data derivation and display logic.
 * Note: We can't import directly from the component due to React Native
 * dependencies, so we test the same logic inline.
 */

import type { SavedCanvas } from '@code-monet/shared';

describe('HomePanel', () => {
  describe('thumbnail URL generation', () => {
    // Mirror of getThumbnailUrl from HomePanel
    const getThumbnailUrl = (
      token: string | undefined,
      apiUrl: string = 'https://api.example.com'
    ): string => {
      if (!token) return '';
      return `${apiUrl}/gallery/thumbnail/${token}.png`;
    };

    it('returns empty string when no token', () => {
      expect(getThumbnailUrl(undefined)).toBe('');
    });

    it('builds correct URL with token', () => {
      const url = getThumbnailUrl('abc123', 'https://api.example.com');
      expect(url).toBe('https://api.example.com/gallery/thumbnail/abc123.png');
    });

    it('works with different API URLs', () => {
      const url = getThumbnailUrl('xyz789', 'http://localhost:8000');
      expect(url).toBe('http://localhost:8000/gallery/thumbnail/xyz789.png');
    });
  });

  describe('recent canvas selection', () => {
    // Mirror of recentCanvas logic from App.tsx
    const getRecentCanvas = (gallery: SavedCanvas[]): SavedCanvas | null => {
      if (gallery.length === 0) return null;
      // Gallery is ordered oldest first, so get the last one
      return gallery[gallery.length - 1] ?? null;
    };

    it('returns null for empty gallery', () => {
      expect(getRecentCanvas([])).toBeNull();
    });

    it('returns the last canvas (most recent)', () => {
      const gallery: SavedCanvas[] = [
        {
          id: '1',
          piece_number: 1,
          stroke_count: 10,
          created_at: '2024-01-01T00:00:00Z',
        },
        {
          id: '2',
          piece_number: 2,
          stroke_count: 20,
          created_at: '2024-01-02T00:00:00Z',
        },
        {
          id: '3',
          piece_number: 3,
          stroke_count: 30,
          created_at: '2024-01-03T00:00:00Z',
        },
      ];

      const recent = getRecentCanvas(gallery);
      expect(recent?.id).toBe('3');
      expect(recent?.piece_number).toBe(3);
    });

    it('returns the only canvas in single-item gallery', () => {
      const gallery: SavedCanvas[] = [
        {
          id: 'only',
          piece_number: 1,
          stroke_count: 5,
          created_at: '2024-01-01T00:00:00Z',
        },
      ];

      const recent = getRecentCanvas(gallery);
      expect(recent?.id).toBe('only');
    });
  });

  describe('hasRecentWork derivation', () => {
    // Mirror of hasRecentWork logic from HomePanel
    // Show continue section if:
    // - There are strokes on the current canvas (hasCurrentWork)
    // - There's a saved canvas in gallery (recentCanvas)
    // - There's an active session in progress (pieceNumber > 0)
    const hasRecentWork = (
      hasCurrentWork: boolean,
      recentCanvas: SavedCanvas | null,
      pieceNumber: number
    ): boolean => {
      return hasCurrentWork || recentCanvas !== null || pieceNumber > 0;
    };

    it('returns false when no current work, no recent canvas, and pieceNumber is 0', () => {
      expect(hasRecentWork(false, null, 0)).toBe(false);
    });

    it('returns true when has current work', () => {
      expect(hasRecentWork(true, null, 0)).toBe(true);
    });

    it('returns true when has recent canvas', () => {
      const canvas: SavedCanvas = {
        id: '1',
        piece_number: 1,
        stroke_count: 10,
        created_at: '2024-01-01T00:00:00Z',
      };
      expect(hasRecentWork(false, canvas, 0)).toBe(true);
    });

    it('returns true when has both current work and recent canvas', () => {
      const canvas: SavedCanvas = {
        id: '1',
        piece_number: 1,
        stroke_count: 10,
        created_at: '2024-01-01T00:00:00Z',
      };
      expect(hasRecentWork(true, canvas, 0)).toBe(true);
    });

    it('returns true when pieceNumber > 0 (active session)', () => {
      expect(hasRecentWork(false, null, 1)).toBe(true);
      expect(hasRecentWork(false, null, 42)).toBe(true);
    });

    it('returns false when pieceNumber is negative', () => {
      expect(hasRecentWork(false, null, -1)).toBe(false);
    });
  });

  describe('canvas display title', () => {
    // Mirror of title derivation from HomePanel
    const getDisplayTitle = (
      canvas: SavedCanvas | null,
      hasCurrentWork: boolean
    ): string => {
      if (canvas?.title) return canvas.title;
      if (hasCurrentWork) return 'Current Drawing';
      if (canvas) return `#${canvas.piece_number}`;
      return '';
    };

    it('returns canvas title when set', () => {
      const canvas: SavedCanvas = {
        id: '1',
        piece_number: 5,
        stroke_count: 10,
        created_at: '2024-01-01T00:00:00Z',
        title: 'Sunset Landscape',
      };
      expect(getDisplayTitle(canvas, false)).toBe('Sunset Landscape');
    });

    it('returns "Current Drawing" for current work without title', () => {
      expect(getDisplayTitle(null, true)).toBe('Current Drawing');
    });

    it('returns piece number when no title and no current work', () => {
      const canvas: SavedCanvas = {
        id: '1',
        piece_number: 42,
        stroke_count: 10,
        created_at: '2024-01-01T00:00:00Z',
      };
      expect(getDisplayTitle(canvas, false)).toBe('#42');
    });

    it('prioritizes canvas title over current work indicator', () => {
      const canvas: SavedCanvas = {
        id: '1',
        piece_number: 5,
        stroke_count: 10,
        created_at: '2024-01-01T00:00:00Z',
        title: 'Named Piece',
      };
      expect(getDisplayTitle(canvas, true)).toBe('Named Piece');
    });

    it('returns empty string when no canvas and no current work', () => {
      expect(getDisplayTitle(null, false)).toBe('');
    });
  });

  describe('prompt validation', () => {
    const MAX_PROMPT_LENGTH = 200;

    // Mirror of prompt truncation logic
    const truncatePrompt = (text: string): string => {
      return text.slice(0, MAX_PROMPT_LENGTH);
    };

    // Mirror of submit validation
    const canSubmitPrompt = (prompt: string, connected: boolean): boolean => {
      return !!prompt.trim() && connected;
    };

    it('truncates prompt to max length', () => {
      const longText = 'a'.repeat(300);
      expect(truncatePrompt(longText).length).toBe(MAX_PROMPT_LENGTH);
    });

    it('preserves prompt shorter than max', () => {
      const shortText = 'Hello world';
      expect(truncatePrompt(shortText)).toBe(shortText);
    });

    it('allows submit when prompt has content and connected', () => {
      expect(canSubmitPrompt('Draw a cat', true)).toBe(true);
    });

    it('prevents submit when prompt is empty', () => {
      expect(canSubmitPrompt('', true)).toBe(false);
    });

    it('prevents submit when prompt is only whitespace', () => {
      expect(canSubmitPrompt('   ', true)).toBe(false);
    });

    it('prevents submit when disconnected', () => {
      expect(canSubmitPrompt('Draw a cat', false)).toBe(false);
    });
  });
});
