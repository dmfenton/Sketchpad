/**
 * GalleryItem - Individual gallery piece with real or fallback strokes
 * Uses Monet-inspired color palette for warm, artistic aesthetic
 */

import React, { useEffect, useState, useRef } from 'react';
import { getApiUrl } from '../../config';
import { GalleryPiece, PathData, PieceStrokes, STROKE_COLORS } from './types';
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

  // Fallback generated strokes with Monet palette
  const fallbackStrokes = useRef<FallbackStroke[]>(
    Array.from({ length: 8 }, () => ({
      d: `M ${20 + Math.random() * 60} ${20 + Math.random() * 60} Q ${Math.random() * 100} ${Math.random() * 100}, ${40 + Math.random() * 60} ${40 + Math.random() * 60}`,
      color: STROKE_COLORS[Math.floor(Math.random() * STROKE_COLORS.length)],
      width: Math.random() * 3 + 1.5,
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
          {/* Warm canvas background */}
          <rect width="100" height="100" fill="#fdfcf8" />
          {loaded && strokes.length > 0
            ? strokes
                .slice(0, 30)
                .map((stroke, i) => (
                  <path
                    key={i}
                    d={pathDataToSvg(stroke, 100 / 800)}
                    fill="none"
                    stroke={stroke.author === 'human' ? '#6a9fb5' : '#2c3e50'}
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
                  opacity={0.75}
                />
              ))}
        </svg>
      </div>
      <span className="gallery-label" title={piece?.title || `No. ${String(displayNumber).padStart(3, '0')}`}>
        {piece?.title || `No. ${String(displayNumber).padStart(3, '0')}`}
      </span>
    </div>
  );
}
