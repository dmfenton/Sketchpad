/**
 * Shared hook for fetching and animating pending strokes.
 *
 * Works on both web and React Native by using requestAnimationFrame
 * for smooth animations and try/finally for error resilience.
 */

import { useCallback, useEffect, useRef } from 'react';

import type { CanvasAction, PendingStrokesInfo } from '../canvas/reducer';
import type { PendingStroke } from '../types';

export interface UseStrokeAnimationOptions {
  /** Current pending strokes state from reducer */
  pendingStrokes: PendingStrokesInfo | null;
  /** Dispatch function for canvas actions */
  dispatch: (action: CanvasAction) => void;
  /** Function to fetch pending strokes from server */
  fetchStrokes: () => Promise<PendingStroke[]>;
  /** Delay between animation frames in ms (default: 16.67ms / 60fps) */
  frameDelayMs?: number;
}

/**
 * Hook that watches for pending strokes notifications and animates them.
 *
 * When `pendingStrokes` changes (via STROKES_READY action), this hook:
 * 1. Fetches the pre-interpolated strokes from the server
 * 2. Animates each stroke by dispatching SET_PEN actions
 * 3. Finalizes each stroke with ADD_STROKE action
 *
 * Features:
 * - Uses requestAnimationFrame for smooth 60fps animation
 * - Tracks batch IDs to prevent duplicate fetches
 * - Wraps animation in try/finally to prevent stuck state
 * - Skips if already animating
 */
export function useStrokeAnimation({
  pendingStrokes,
  dispatch,
  fetchStrokes,
  frameDelayMs = 1000 / 60,
}: UseStrokeAnimationOptions): void {
  const animatingRef = useRef(false);
  const fetchedBatchIdRef = useRef(0);

  const animateStrokes = useCallback(
    async (strokes: PendingStroke[]): Promise<void> => {
      if (animatingRef.current) return;
      animatingRef.current = true;

      try {
        for (const stroke of strokes) {
          const points = stroke.points;
          if (points.length === 0) continue;

          // Move to start (pen up)
          dispatch({ type: 'SET_PEN', x: points[0].x, y: points[0].y, down: false });

          // Animate through points using requestAnimationFrame for smoothness
          for (let i = 0; i < points.length; i++) {
            const point = points[i];
            const isFirst = i === 0;

            await new Promise<void>((resolve) => {
              requestAnimationFrame(() => {
                dispatch({ type: 'SET_PEN', x: point.x, y: point.y, down: !isFirst });
                setTimeout(resolve, frameDelayMs);
              });
            });
          }

          // Lift pen and finalize stroke
          const lastPoint = points[points.length - 1];
          dispatch({ type: 'SET_PEN', x: lastPoint.x, y: lastPoint.y, down: false });
          dispatch({ type: 'ADD_STROKE', path: stroke.path });
        }
      } finally {
        animatingRef.current = false;
      }
    },
    [dispatch, frameDelayMs]
  );

  useEffect(() => {
    const fetchAndAnimate = async (): Promise<void> => {
      if (!pendingStrokes) return;

      // Skip if we've already fetched this batch (prevents race condition)
      if (pendingStrokes.batchId <= fetchedBatchIdRef.current) return;
      fetchedBatchIdRef.current = pendingStrokes.batchId;

      // Clear pending state to prevent re-fetch
      dispatch({ type: 'CLEAR_PENDING_STROKES' });

      try {
        const strokes = await fetchStrokes();
        if (strokes.length > 0) {
          await animateStrokes(strokes);
        }
      } catch (error) {
        console.error('[useStrokeAnimation] Error fetching/animating strokes:', error);
      }
    };

    void fetchAndAnimate();
  }, [pendingStrokes, dispatch, fetchStrokes, animateStrokes]);
}
