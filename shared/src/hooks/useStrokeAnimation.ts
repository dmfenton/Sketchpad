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
  const unmountedRef = useRef(false);

  // Reset refs on unmount to prevent blocking future animations
  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      animatingRef.current = false;
      fetchedBatchIdRef.current = 0;
    };
  }, []);

  const animateStrokes = useCallback(
    async (strokes: PendingStroke[]): Promise<void> => {
      if (animatingRef.current || unmountedRef.current) return;
      animatingRef.current = true;

      try {
        for (const stroke of strokes) {
          // Check for unmount between strokes
          if (unmountedRef.current) break;

          const points = stroke.points;
          if (points.length === 0) continue;

          // Move to start (pen up)
          dispatch({ type: 'SET_PEN', x: points[0].x, y: points[0].y, down: false });

          // Animate through points using requestAnimationFrame for smoothness
          for (let i = 0; i < points.length; i++) {
            // Check for unmount during animation
            if (unmountedRef.current) break;

            const point = points[i];
            const isFirst = i === 0;

            await new Promise<void>((resolve) => {
              requestAnimationFrame(() => {
                if (!unmountedRef.current) {
                  dispatch({ type: 'SET_PEN', x: point.x, y: point.y, down: !isFirst });
                }
                setTimeout(resolve, frameDelayMs);
              });
            });
          }

          // Lift pen and finalize stroke (only if not unmounted)
          if (!unmountedRef.current) {
            const lastPoint = points[points.length - 1];
            dispatch({ type: 'SET_PEN', x: lastPoint.x, y: lastPoint.y, down: false });
            dispatch({ type: 'ADD_STROKE', path: stroke.path });
          }
        }
      } finally {
        animatingRef.current = false;
      }
    },
    [dispatch, frameDelayMs]
  );

  useEffect(() => {
    const fetchAndAnimate = async (): Promise<void> => {
      console.log('[useStrokeAnimation] Effect triggered, pendingStrokes:', pendingStrokes);
      if (!pendingStrokes) return;

      // Skip if we've already successfully fetched this batch (prevents race condition)
      if (pendingStrokes.batchId <= fetchedBatchIdRef.current) {
        console.log(
          '[useStrokeAnimation] Skipping batch',
          pendingStrokes.batchId,
          '- already fetched (ref:',
          fetchedBatchIdRef.current,
          ')'
        );
        return;
      }

      const batchId = pendingStrokes.batchId;
      console.log('[useStrokeAnimation] Fetching batch', batchId);

      // Clear pending state to prevent duplicate fetch attempts
      dispatch({ type: 'CLEAR_PENDING_STROKES' });

      try {
        const strokes = await fetchStrokes();
        console.log('[useStrokeAnimation] Fetched', strokes.length, 'strokes');

        // Only mark as fetched AFTER successful fetch
        // This ensures failed fetches can be retried on reconnect
        fetchedBatchIdRef.current = batchId;

        if (strokes.length > 0) {
          await animateStrokes(strokes);
        }
      } catch (error) {
        console.error('[useStrokeAnimation] Error fetching/animating strokes:', error);
        // Don't update fetchedBatchIdRef - allow retry on reconnect
      }
    };

    void fetchAndAnimate();
  }, [pendingStrokes, dispatch, fetchStrokes, animateStrokes]);
}
