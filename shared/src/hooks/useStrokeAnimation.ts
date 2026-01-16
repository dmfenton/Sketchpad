/**
 * React hook for fetching and animating pending strokes.
 *
 * This is a thin wrapper around StrokeRenderer that connects it to React's
 * lifecycle. The core logic is in StrokeRenderer for testability.
 */

import { useEffect, useRef } from 'react';

import type { CanvasAction, PendingStrokesInfo } from '../canvas/reducer';
import { StrokeRenderer } from '../services/StrokeRenderer';
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
  /** Gate for rendering - strokes wait until this is true (default: true) */
  canRender?: boolean;
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
 * - Allows retry after failed fetches
 * - Cleans up properly on unmount
 */
export function useStrokeAnimation({
  pendingStrokes,
  dispatch,
  fetchStrokes,
  frameDelayMs = 1000 / 60,
  canRender = true,
}: UseStrokeAnimationOptions): void {
  // Keep a stable reference to the renderer
  const rendererRef = useRef<StrokeRenderer | null>(null);

  // Track the latest dependencies to avoid stale closures
  const depsRef = useRef({ dispatch, fetchStrokes, frameDelayMs });
  depsRef.current = { dispatch, fetchStrokes, frameDelayMs };

  // Track if we're waiting to render (pendingStrokes set but canRender is false)
  const waitingToRenderRef = useRef<number | null>(null);

  // Initialize renderer on mount
  useEffect(() => {
    rendererRef.current = new StrokeRenderer({
      fetchStrokes: () => depsRef.current.fetchStrokes(),
      dispatch: (action) => depsRef.current.dispatch(action),
      frameDelayMs: depsRef.current.frameDelayMs,
      log: console.log,
    });

    return () => {
      rendererRef.current?.stop();
      rendererRef.current = null;
    };
  }, []);

  // Handle pendingStrokes changes - but wait for canRender
  useEffect(() => {
    if (!pendingStrokes || !rendererRef.current) {
      waitingToRenderRef.current = null;
      return;
    }

    if (!canRender) {
      // Remember we need to render this batch when canRender becomes true
      waitingToRenderRef.current = pendingStrokes.batchId;
      return;
    }

    // We can render now - clear waiting state and render
    waitingToRenderRef.current = null;

    // Delegate to renderer (fire and forget, errors are logged internally)
    void rendererRef.current.handleStrokesReady(pendingStrokes.batchId).catch((error) => {
      console.error('[useStrokeAnimation] Error:', error);
    });
  }, [pendingStrokes?.batchId, canRender]);

  // When canRender becomes true, check if we have a waiting batch
  useEffect(() => {
    if (canRender && waitingToRenderRef.current !== null && rendererRef.current) {
      const batchId = waitingToRenderRef.current;
      waitingToRenderRef.current = null;

      void rendererRef.current.handleStrokesReady(batchId).catch((error) => {
        console.error('[useStrokeAnimation] Error:', error);
      });
    }
  }, [canRender]);
}
