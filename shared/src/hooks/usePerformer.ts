/**
 * React hook for the Performance Model animation pipeline.
 *
 * The agent's output is a "performance" - events buffer until the stage is free,
 * then perform one at a time with animations.
 *
 * Server -> Buffer (queue) -> Stage (one item) -> UI
 *                                 ^
 *                         [stage free? -> advance]
 */

import { useEffect, useRef } from 'react';

import type { CanvasAction, PerformanceState } from '../canvas/reducer';
import type { StrokeStyle } from '../types';
import { BIONIC_CHUNK_INTERVAL_MS, BIONIC_CHUNK_SIZE } from '../utils';

// Hold completed text for this duration before advancing to next chunk
const HOLD_AFTER_WORDS_MS = 800;

// Hold events on stage for this duration so "executing" status is visible
const HOLD_EVENT_MS = 500;

// Maximum time to hold an event without new content (prevents stale UI)
const MAX_EVENT_HOLD_MS = 5000;

export interface UsePerformerOptions {
  /** Current performance state */
  performance: PerformanceState;
  /** Dispatch function for canvas actions */
  dispatch: (action: CanvasAction) => void;
  /** Whether animation is paused */
  paused: boolean;
  /** Whether user is in the studio (animation only runs in studio) */
  inStudio: boolean;
  /** Callback when strokes animation completes (to signal server) */
  onStrokesComplete?: (batchId: number) => void;
  /** Delay between word reveals in ms (default: BIONIC_CHUNK_INTERVAL_MS / BIONIC_CHUNK_SIZE) */
  wordDelayMs?: number;
  /** Animation frame delay in ms (default: 16.67 = 60fps) */
  frameDelayMs?: number;
}

/**
 * Hook that drives the performance animation loop.
 *
 * Watches the performance state and:
 * 1. Advances items from buffer to stage when stage is empty
 * 2. Reveals words one at a time for 'words' items
 * 3. Animates strokes point by point for 'strokes' items
 * 4. Instantly processes 'event' items
 * 5. Moves completed items to history
 */
export function usePerformer({
  performance,
  dispatch,
  paused,
  inStudio,
  onStrokesComplete,
  wordDelayMs = BIONIC_CHUNK_INTERVAL_MS / BIONIC_CHUNK_SIZE,
  frameDelayMs = 1000 / 60,
}: UsePerformerOptions): void {
  // Refs to track animation state
  const frameRef = useRef<number | null>(null);
  const lastWordTimeRef = useRef<number>(0);
  const lastStrokeTimeRef = useRef<number>(0);
  const strokePointIndexRef = useRef<number>(0);
  const holdStartRef = useRef<number | null>(null);
  const onStrokesCompleteRef = useRef(onStrokesComplete);

  // Keep callback ref up to date
  useEffect(() => {
    onStrokesCompleteRef.current = onStrokesComplete;
  }, [onStrokesComplete]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, []);

  // Main animation loop
  useEffect(() => {
    // Don't animate when paused or not in studio
    if (paused || !inStudio) {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      return;
    }

    const animate = (time: number) => {
      const { onStage, buffer, wordIndex, strokeIndex } = performance;

      // If stage is empty, try to advance
      if (onStage === null) {
        if (buffer.length > 0) {
          dispatch({ type: 'ADVANCE_STAGE' });
          // Reset animation refs for new item
          strokePointIndexRef.current = 0;
          holdStartRef.current = null;
        }
        frameRef.current = requestAnimationFrame(animate);
        return;
      }

      // Process current stage item
      switch (onStage.type) {
        case 'words': {
          const words = onStage.text.split(/\s+/).filter((w) => w.length > 0);
          if (wordIndex < words.length) {
            // Still revealing words
            holdStartRef.current = null; // Reset hold timer while revealing
            // Check if enough time has passed since last word
            if (time - lastWordTimeRef.current >= wordDelayMs) {
              dispatch({ type: 'REVEAL_WORD' });
              lastWordTimeRef.current = time;
            }
          } else {
            // All words revealed - hold for a moment before advancing
            if (holdStartRef.current === null) {
              holdStartRef.current = time;
            }
            if (time - holdStartRef.current >= HOLD_AFTER_WORDS_MS) {
              holdStartRef.current = null;
              dispatch({ type: 'STAGE_COMPLETE' });
            }
          }
          break;
        }

        case 'event': {
          // Hold event on stage for minimum time so it's visible
          if (holdStartRef.current === null) {
            holdStartRef.current = time;
          }
          const holdTime = time - holdStartRef.current;
          const minHoldElapsed = holdTime >= HOLD_EVENT_MS;
          const maxHoldExceeded = holdTime >= MAX_EVENT_HOLD_MS;
          // After minimum hold, complete if there's something waiting
          // OR if max hold exceeded (prevents stale UI when agent stops)
          if (minHoldElapsed && (buffer.length > 0 || maxHoldExceeded)) {
            holdStartRef.current = null;
            dispatch({ type: 'STAGE_COMPLETE' });
          }
          break;
        }

        case 'strokes': {
          const strokes = onStage.strokes;
          const stroke = strokes[strokeIndex];
          if (stroke !== undefined) {
            const points = stroke.points;
            const pointIndex = strokePointIndexRef.current;
            const point = points[pointIndex];

            if (point !== undefined) {
              // Check if enough time has passed since last frame
              if (time - lastStrokeTimeRef.current >= frameDelayMs) {
                // Extract style from path for first point
                const style: Partial<StrokeStyle> | undefined =
                  pointIndex === 0
                    ? {
                        ...(stroke.path.color !== undefined && { color: stroke.path.color }),
                        ...(stroke.path.stroke_width !== undefined && {
                          stroke_width: stroke.path.stroke_width,
                        }),
                        ...(stroke.path.opacity !== undefined && { opacity: stroke.path.opacity }),
                      }
                    : undefined;

                dispatch({
                  type: 'STROKE_PROGRESS',
                  point,
                  style: Object.keys(style ?? {}).length > 0 ? style : undefined,
                });
                strokePointIndexRef.current = pointIndex + 1;
                lastStrokeTimeRef.current = time;
              }
            } else {
              // Stroke complete, move to next
              dispatch({ type: 'STROKE_COMPLETE' });
              strokePointIndexRef.current = 0;
            }
          } else {
            // All strokes done
            dispatch({ type: 'STAGE_COMPLETE' });
            // Signal server that animation is done
            const batchId = strokes[0]?.batch_id;
            if (batchId !== undefined) {
              onStrokesCompleteRef.current?.(batchId);
            }
          }
          break;
        }
      }

      frameRef.current = requestAnimationFrame(animate);
    };

    frameRef.current = requestAnimationFrame(animate);

    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [
    performance,
    dispatch,
    paused,
    inStudio,
    wordDelayMs,
    frameDelayMs,
  ]);
}
