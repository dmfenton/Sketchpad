/**
 * StrokeRenderer - Core stroke rendering logic extracted for testability.
 *
 * This class handles the complete stroke rendering flow:
 * 1. Receives batch notifications
 * 2. Fetches pre-interpolated strokes from server
 * 3. Animates strokes by dispatching pen movements
 * 4. Finalizes strokes with ADD_STROKE action
 *
 * Benefits of extraction:
 * - Pure TypeScript, testable without React
 * - Dependency injection for mocking
 * - Explicit state management
 */

import type { CanvasAction } from '../canvas/reducer';
import type { PendingStroke } from '../types';

export interface StrokeRendererDeps {
  /** Function to fetch pending strokes from server */
  fetchStrokes: () => Promise<PendingStroke[]>;
  /** Dispatch function for canvas actions */
  dispatch: (action: CanvasAction) => void;
  /** Function to signal animation complete to server */
  onAnimationDone?: () => void;
  /** Custom requestAnimationFrame for testing (defaults to global) */
  requestFrame?: (callback: () => void) => void;
  /** Delay between animation frames in ms (default: 16.67ms / 60fps) */
  frameDelayMs?: number;
  /** Optional logger for debugging */
  log?: (message: string, ...args: unknown[]) => void;
}

export interface HandleStrokesReadyResult {
  /** Whether strokes were fetched (false if skipped due to duplicate batch) */
  fetched: boolean;
  /** Number of strokes animated (0 if skipped or empty) */
  strokeCount: number;
}

export class StrokeRenderer {
  private fetchedBatchId = 0;
  private animating = false;
  private stopped = false;
  private activeTimeoutId: ReturnType<typeof setTimeout> | null = null;

  private readonly fetchStrokes: () => Promise<PendingStroke[]>;
  private readonly dispatch: (action: CanvasAction) => void;
  private readonly onAnimationDone: (() => void) | null;
  private readonly requestFrame: (callback: () => void) => void;
  private readonly frameDelayMs: number;
  private readonly log: (message: string, ...args: unknown[]) => void;

  constructor(deps: StrokeRendererDeps) {
    this.fetchStrokes = deps.fetchStrokes;
    this.dispatch = deps.dispatch;
    this.onAnimationDone = deps.onAnimationDone ?? null;
    this.requestFrame = deps.requestFrame ?? ((cb) => requestAnimationFrame(cb));
    this.frameDelayMs = deps.frameDelayMs ?? 1000 / 60;
    this.log = deps.log ?? (() => {});
  }

  /**
   * Handle a strokes_ready notification.
   *
   * @param batchId - The batch ID from the server
   * @returns Result indicating whether strokes were fetched and count
   */
  async handleStrokesReady(batchId: number): Promise<HandleStrokesReadyResult> {
    this.log(
      '[StrokeRenderer] handleStrokesReady called, batchId:',
      batchId,
      'stopped:',
      this.stopped,
      'animating:',
      this.animating
    );

    // Skip if we've already successfully fetched this batch
    if (batchId <= this.fetchedBatchId) {
      this.log(
        '[StrokeRenderer] Skipping batch',
        batchId,
        '- already fetched (ref:',
        this.fetchedBatchId,
        ')'
      );
      return { fetched: false, strokeCount: 0 };
    }

    this.log('[StrokeRenderer] Fetching batch', batchId);

    // Clear pending state to prevent duplicate fetch attempts
    this.dispatch({ type: 'CLEAR_PENDING_STROKES' });

    // Fetch strokes from server
    const strokes = await this.fetchStrokes();
    this.log('[StrokeRenderer] Fetched', strokes.length, 'strokes for batch', batchId);

    // Only mark as fetched AFTER successful fetch
    // This ensures failed fetches can be retried on reconnect
    this.fetchedBatchId = batchId;

    // Animate strokes if any
    if (strokes.length > 0) {
      await this.animateStrokes(strokes);
    } else {
      this.log('[StrokeRenderer] No strokes to animate for batch', batchId);
    }

    return { fetched: true, strokeCount: strokes.length };
  }

  /**
   * Animate a list of strokes by dispatching pen movements.
   */
  private async animateStrokes(strokes: PendingStroke[]): Promise<void> {
    if (this.animating) {
      this.log(
        '[StrokeRenderer] WARNING: animateStrokes called while already animating, strokes may be lost:',
        strokes.length
      );
      return;
    }
    if (this.stopped) {
      this.log('[StrokeRenderer] animateStrokes called while stopped, skipping');
      return;
    }
    this.animating = true;
    this.log('[StrokeRenderer] Starting animation of', strokes.length, 'strokes');

    try {
      for (const stroke of strokes) {
        if (this.stopped) break;

        const points = stroke.points;
        if (points.length === 0) continue;

        // Move to start (pen up)
        this.dispatch({ type: 'SET_PEN', x: points[0].x, y: points[0].y, down: false });

        // Animate through points
        for (let i = 0; i < points.length; i++) {
          if (this.stopped) break;

          const point = points[i];
          const isFirst = i === 0;

          await this.animateFrame(() => {
            if (!this.stopped) {
              // On first point going down, include style info from the path
              if (isFirst) {
                this.dispatch({
                  type: 'SET_PEN',
                  x: point.x,
                  y: point.y,
                  down: true,
                  // Pass style properties if they exist on the path
                  ...(stroke.path.color !== undefined && { color: stroke.path.color }),
                  ...(stroke.path.stroke_width !== undefined && {
                    stroke_width: stroke.path.stroke_width,
                  }),
                  ...(stroke.path.opacity !== undefined && { opacity: stroke.path.opacity }),
                });
              } else {
                this.dispatch({ type: 'SET_PEN', x: point.x, y: point.y, down: true });
              }
            }
          });
        }

        // Lift pen and finalize stroke
        if (!this.stopped) {
          const lastPoint = points[points.length - 1];
          this.dispatch({ type: 'SET_PEN', x: lastPoint.x, y: lastPoint.y, down: false });
          this.dispatch({ type: 'ADD_STROKE', path: stroke.path });
        }
      }
    } finally {
      this.animating = false;
      this.log('[StrokeRenderer] Animation complete');
      // Signal server that animation is done
      if (this.onAnimationDone) {
        this.log('[StrokeRenderer] Signaling animation_done to server');
        this.onAnimationDone();
      }
    }
  }

  /**
   * Execute a callback on the next animation frame with delay.
   */
  private animateFrame(callback: () => void): Promise<void> {
    return new Promise<void>((resolve) => {
      this.requestFrame(() => {
        callback();
        this.activeTimeoutId = setTimeout(() => {
          this.activeTimeoutId = null;
          resolve();
        }, this.frameDelayMs);
      });
    });
  }

  /**
   * Stop any ongoing animation and reset state.
   * Call this when the component unmounts.
   */
  stop(): void {
    this.stopped = true;
    this.animating = false;
    if (this.activeTimeoutId) {
      clearTimeout(this.activeTimeoutId);
      this.activeTimeoutId = null;
    }
  }

  /**
   * Reset all state. Useful for testing or reinitialization.
   */
  reset(): void {
    this.fetchedBatchId = 0;
    this.animating = false;
    this.stopped = false;
    if (this.activeTimeoutId) {
      clearTimeout(this.activeTimeoutId);
      this.activeTimeoutId = null;
    }
  }

  /**
   * Check if currently animating.
   */
  isAnimating(): boolean {
    return this.animating;
  }

  /**
   * Get the last successfully fetched batch ID.
   */
  getLastFetchedBatchId(): number {
    return this.fetchedBatchId;
  }
}
