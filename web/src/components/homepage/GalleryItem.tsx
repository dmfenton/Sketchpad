/**
 * GalleryItem - Individual gallery piece with real or fallback strokes
 */

import React, { useEffect, useState, useRef } from 'react';
import { getApiUrl } from '../../config';
import { GalleryPiece, PathData, PieceStrokes, ALL_COLORS } from './types';
import { pathDataToSvg } from './utils';

export interface GalleryItemProps {
  piece?: GalleryPiece;
  index: number;
  delay: number;
}

interface FallbackStroke {
  d: string;
  color: string;
  width: number;
}

export function GalleryItem({ piece, index, delay }: GalleryItemProps): React.ReactElement {
  const [strokes, setStrokes] = useState<PathData[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Fallback generated strokes
  const fallbackStrokes = useRef<FallbackStroke[]>(
    Array.from({ length: 8 }, () => ({
      d: `M ${20 + Math.random() * 60} ${20 + Math.random() * 60} Q ${Math.random() * 100} ${Math.random() * 100}, ${40 + Math.random() * 60} ${40 + Math.random() * 60}`,
      color: ALL_COLORS[Math.floor(Math.random() * ALL_COLORS.length)],
      width: Math.random() * 4 + 2,
    }))
  ).current;

  useEffect(() => {
    if (!piece) return;

    const fetchStrokes = async (): Promise<void> => {
      try {
        const url = `${getApiUrl()}/public/gallery/${piece.user_id}/${piece.id}/strokes`;
        const response = await fetch(url);
        if (response.ok) {
          const data: PieceStrokes = await response.json();
          if (data.strokes && data.strokes.length > 0) {
            setStrokes(data.strokes);
            setLoaded(true);
          }
        }
      } catch {
        // Fall back to generated strokes
      }
    };

    fetchStrokes();
  }, [piece]);

  const displayNumber = piece?.piece_number ?? index + 1;

  return (
    <div className="gallery-item" style={{ animationDelay: `${delay}s` }}>
      <div className="gallery-frame">
        <svg viewBox="0 0 100 100" className="gallery-artwork">
          <rect width="100" height="100" fill="#fafafa" />
          {loaded && strokes.length > 0
            ? strokes.slice(0, 30).map((stroke, i) => (
                <path
                  key={i}
                  d={pathDataToSvg(stroke, 100 / 800)}
                  fill="none"
                  stroke={stroke.author === 'human' ? '#3b82f6' : '#2d3436'}
                  strokeWidth={1}
                  strokeLinecap="round"
                  opacity={0.8}
                />
              ))
            : fallbackStrokes.map((stroke, i) => (
                <path
                  key={i}
                  d={stroke.d}
                  fill="none"
                  stroke={stroke.color}
                  strokeWidth={stroke.width}
                  strokeLinecap="round"
                  opacity={0.8}
                />
              ))}
        </svg>
      </div>
      <span className="gallery-label">Piece #{String(displayNumber).padStart(4, '0')}</span>
    </div>
  );
}
