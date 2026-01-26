/**
 * Optimized in-progress stroke renderer that avoids full recomputation.
 *
 * Uses a two-phase approach:
 * 1. For the "tail" (last N points), compute freehand outline fresh each frame
 * 2. For the "body" (earlier points), cache the computed SVG path
 *
 * This dramatically reduces computation when animating long strokes since we
 * only recalculate the perfect-freehand outline for recent points.
 */

import React, { useMemo, useRef, memo } from 'react';

import type { Point, StrokeStyle, BrushName } from '@code-monet/shared';
import {
  getFreehandOutline,
  outlineToSvgPath,
  PAINTERLY_FREEHAND_OPTIONS,
  getBrushPreset,
  brushPresetToFreehandOptions,
  getBristleOutlines,
} from '@code-monet/shared';

// How many points from the end to recompute each frame
const TAIL_LENGTH = 15;
// How many new points before we commit more to the cached body
const COMMIT_THRESHOLD = 20;

const DEFAULT_STROKE_COLOR = '#1a1a2e';

interface InProgressStrokeProps {
  points: Point[];
  style: StrokeStyle;
  brushName?: BrushName;
  blur?: boolean;
}

export const InProgressStroke = memo(function InProgressStroke({
  points,
  style,
  brushName,
  blur = false,
}: InProgressStrokeProps): React.ReactElement | null {
  // Track committed body path and how many points it covers
  const bodyPathRef = useRef<string>('');
  const bodyBristlesRef = useRef<string[]>([]);
  const committedLengthRef = useRef<number>(0);

  const strokeWidth = style.stroke_width || 2.5;
  const strokeColor = style.color || DEFAULT_STROKE_COLOR;
  const strokeOpacity = style.opacity ?? 1;

  const { bodyPath, bodyBristles, tailPath, tailBristles, brush } = useMemo(() => {
    if (points.length === 0) {
      return { bodyPath: '', bodyBristles: [], tailPath: '', tailBristles: [], brush: null };
    }

    const brushPreset = brushName ? getBrushPreset(brushName) : null;
    const options = brushPreset
      ? brushPresetToFreehandOptions(brushPreset, strokeWidth)
      : { ...PAINTERLY_FREEHAND_OPTIONS, size: strokeWidth };

    // Determine split point for body vs tail
    const bodyEndIndex = Math.max(0, points.length - TAIL_LENGTH);

    // If we have enough new points, commit more to the body
    if (bodyEndIndex > committedLengthRef.current + COMMIT_THRESHOLD) {
      const newBodyPoints = points.slice(0, bodyEndIndex);
      const bodyOutline = getFreehandOutline(newBodyPoints, options);
      bodyPathRef.current = outlineToSvgPath(bodyOutline);

      // Compute body bristles if in paint mode
      if (brushPreset && brushPreset.bristleCount > 0 && newBodyPoints.length > 1) {
        const bristleOutlines = getBristleOutlines(
          newBodyPoints,
          brushPreset.bristleCount,
          brushPreset.bristleSpread * strokeWidth,
          options
        );
        bodyBristlesRef.current = bristleOutlines
          .map((o) => outlineToSvgPath(o))
          .filter((d) => d.length > 0);
      } else {
        bodyBristlesRef.current = [];
      }

      committedLengthRef.current = bodyEndIndex;
    }

    // Compute tail (always fresh) - overlap a few points for smooth join
    const overlapPoints = 3;
    const tailStartIndex = Math.max(0, bodyEndIndex - overlapPoints);
    const tailPoints = points.slice(tailStartIndex);

    let tail = '';
    let tailBristlesList: string[] = [];

    if (tailPoints.length > 0) {
      const tailOutline = getFreehandOutline(tailPoints, options);
      tail = outlineToSvgPath(tailOutline);

      // Bristles only for tail in paint mode (keeps it performant)
      if (brushPreset && brushPreset.bristleCount > 0 && tailPoints.length > 1) {
        // Use fewer bristles for tail to maintain performance
        const tailBristleCount = Math.min(brushPreset.bristleCount, 5);
        const bristleOutlines = getBristleOutlines(
          tailPoints,
          tailBristleCount,
          brushPreset.bristleSpread * strokeWidth,
          options
        );
        tailBristlesList = bristleOutlines
          .map((o) => outlineToSvgPath(o))
          .filter((d) => d.length > 0);
      }
    }

    return {
      bodyPath: bodyPathRef.current,
      bodyBristles: bodyBristlesRef.current,
      tailPath: tail,
      tailBristles: tailBristlesList,
      brush: brushPreset,
    };
    // Depend on points.length to trigger updates, but avoid deep comparison
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points.length, strokeWidth, brushName]);

  if (!tailPath && !bodyPath) return null;

  const filterId = blur ? 'painterly-blur' : undefined;
  const mainOpacity = (brush?.mainOpacity ?? 1) * strokeOpacity;
  const bristleOpacity = (brush?.bristleOpacity ?? 0.3) * strokeOpacity;

  return (
    <g filter={filterId ? `url(#${filterId})` : undefined}>
      {/* Body bristle strokes (cached) */}
      {bodyBristles.map((d, i) => (
        <path key={`body-bristle-${i}`} d={d} fill={strokeColor} fillOpacity={bristleOpacity} />
      ))}

      {/* Committed body (cached) */}
      {bodyPath && <path d={bodyPath} fill={strokeColor} fillOpacity={mainOpacity} />}

      {/* Tail bristle strokes (fresh each frame) */}
      {tailBristles.map((d, i) => (
        <path key={`tail-bristle-${i}`} d={d} fill={strokeColor} fillOpacity={bristleOpacity} />
      ))}

      {/* Live tail (fresh each frame) */}
      {tailPath && <path d={tailPath} fill={strokeColor} fillOpacity={mainOpacity} />}
    </g>
  );
});
