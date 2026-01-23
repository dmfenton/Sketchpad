/**
 * usePerformer Hook Tests
 *
 * Tests the requestAnimationFrame animation loop that drives:
 * - Stroke animation (STROKE_PROGRESS -> STROKE_COMPLETE -> STAGE_COMPLETE)
 * - Word reveal timing
 * - Pause/resume behavior
 *
 * Run: npm run -w app test -- --testPathPattern=usePerformer
 *
 * @jest-environment jsdom
 */

import { renderHook, act } from '@testing-library/react';
import {
  usePerformer,
  type UsePerformerOptions,
  type CanvasAction,
  initialState,
  canvasReducer,
  type CanvasHookState,
  type PerformanceState,
  initialPerformanceState,
} from '@code-monet/shared';
import type { PendingStroke, Point } from '@code-monet/shared';

// ============================================================================
// RAF Mocking
// ============================================================================

type FrameCallback = (time: number) => void;

// Store callbacks with their IDs
let rafCallbackMap: Map<number, FrameCallback> = new Map();
let rafId = 0;
let currentTime = 0;

function mockRequestAnimationFrame(callback: FrameCallback): number {
  const id = ++rafId;
  rafCallbackMap.set(id, callback);
  return id;
}

function mockCancelAnimationFrame(id: number): void {
  rafCallbackMap.delete(id);
}

/**
 * Advance animation by one frame - executes ONE pending RAF callback.
 * This simulates how real RAF works: one callback per frame.
 */
function advanceFrame(deltaMs: number = 16.67): void {
  currentTime += deltaMs;
  // Get the first (oldest) callback
  const firstEntry = rafCallbackMap.entries().next().value;
  if (firstEntry) {
    const [id, callback] = firstEntry;
    rafCallbackMap.delete(id);
    callback(currentTime);
  }
}

/**
 * Advance multiple frames.
 */
function advanceFrames(count: number, deltaMs: number = 16.67): void {
  for (let i = 0; i < count; i++) {
    advanceFrame(deltaMs);
  }
}

beforeEach(() => {
  rafCallbackMap = new Map();
  rafId = 0;
  currentTime = 0;

  global.requestAnimationFrame = jest.fn(mockRequestAnimationFrame) as unknown as typeof requestAnimationFrame;
  global.cancelAnimationFrame = jest.fn(mockCancelAnimationFrame);
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ============================================================================
// Test Helpers
// ============================================================================

function makeStroke(
  points: Point[],
  author: 'agent' | 'human' = 'agent',
  batchId: number = 0
): PendingStroke {
  return {
    batch_id: batchId,
    path: {
      type: 'polyline',
      points,
      author,
    },
    points,
  };
}

function makeStrokeWithStyle(
  points: Point[],
  color: string,
  strokeWidth: number = 2
): PendingStroke {
  return {
    batch_id: 0,
    path: {
      type: 'polyline',
      points,
      author: 'agent',
      color,
      stroke_width: strokeWidth,
    },
    points,
  };
}

/**
 * Create a performance state with strokes on stage.
 */
function makeStrokesOnStage(strokes: PendingStroke[]): PerformanceState {
  return {
    ...initialPerformanceState,
    onStage: {
      type: 'strokes',
      strokes,
      id: 'test-strokes-1',
    },
  };
}

/**
 * Create a full canvas state with strokes staged.
 */
function makeStateWithStrokesOnStage(strokes: PendingStroke[]): CanvasHookState {
  return {
    ...initialState,
    paused: false,
    performance: makeStrokesOnStage(strokes),
  };
}

// ============================================================================
// Stroke Animation Flow Tests
// ============================================================================

describe('usePerformer - Stroke Animation Flow', () => {
  it('dispatches STROKE_PROGRESS for each point at frameDelayMs intervals', () => {
    const dispatch = jest.fn();
    const strokes = [
      makeStroke([
        { x: 0, y: 0 },
        { x: 50, y: 50 },
        { x: 100, y: 100 },
      ]),
    ];

    const performance = makeStrokesOnStage(strokes);

    renderHook(() =>
      usePerformer({
        performance,
        dispatch,
        paused: false,
        inStudio: true,
        frameDelayMs: 16.67,
      })
    );

    // First frame schedules animation
    act(() => advanceFrame(16.67));

    // Should dispatch first point
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'STROKE_PROGRESS',
        point: { x: 0, y: 0 },
      })
    );
  });

  it('advances through all points then dispatches STROKE_COMPLETE', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 50, y: 50 },
      { x: 100, y: 100 },
    ];
    const strokes = [makeStroke(points)];

    // Track state changes through dispatch
    const dispatchedActions: CanvasAction[] = [];
    let state = makeStateWithStrokesOnStage(strokes);

    const dispatch = jest.fn((action: CanvasAction) => {
      dispatchedActions.push(action);
      state = canvasReducer(state, action);
    });

    const { rerender } = renderHook(
      (props: UsePerformerOptions) => usePerformer(props),
      {
        initialProps: {
          performance: state.performance,
          dispatch,
          paused: false,
          inStudio: true,
          frameDelayMs: 16.67,
        },
      }
    );

    // Advance frames - each frame should progress one point
    // Need enough frames to complete all 3 points
    for (let i = 0; i < 5; i++) {
      act(() => advanceFrame(20)); // Slightly longer than frameDelayMs
      rerender({
        performance: state.performance,
        dispatch,
        paused: false,
        inStudio: true,
        frameDelayMs: 16.67,
      });
    }

    // Should have 3 STROKE_PROGRESS then 1 STROKE_COMPLETE
    const progressActions = dispatchedActions.filter((a) => a.type === 'STROKE_PROGRESS');
    const completeActions = dispatchedActions.filter((a) => a.type === 'STROKE_COMPLETE');

    expect(progressActions.length).toBe(3);
    expect(completeActions.length).toBe(1);
  });

  it('advances to next stroke after STROKE_COMPLETE', () => {
    const strokes = [
      makeStroke([{ x: 0, y: 0 }, { x: 10, y: 10 }]),
      makeStroke([{ x: 20, y: 20 }, { x: 30, y: 30 }]),
    ];

    const dispatchedActions: CanvasAction[] = [];
    let state = makeStateWithStrokesOnStage(strokes);

    const dispatch = jest.fn((action: CanvasAction) => {
      dispatchedActions.push(action);
      state = canvasReducer(state, action);
    });

    const { rerender } = renderHook(
      (props: UsePerformerOptions) => usePerformer(props),
      {
        initialProps: {
          performance: state.performance,
          dispatch,
          paused: false,
          inStudio: true,
          frameDelayMs: 16.67,
        },
      }
    );

    // Animate through both strokes (2 points each + complete)
    for (let i = 0; i < 10; i++) {
      act(() => advanceFrame(20));
      rerender({
        performance: state.performance,
        dispatch,
        paused: false,
        inStudio: true,
        frameDelayMs: 16.67,
      });
    }

    const completeActions = dispatchedActions.filter((a) => a.type === 'STROKE_COMPLETE');
    expect(completeActions.length).toBe(2);

    // Verify strokeIndex advanced (check via state)
    expect(state.performance.strokeIndex).toBe(2);
  });

  it('dispatches STAGE_COMPLETE after all strokes in batch complete', () => {
    const strokes = [
      makeStroke([{ x: 0, y: 0 }]),
      makeStroke([{ x: 10, y: 10 }]),
    ];

    const dispatchedActions: CanvasAction[] = [];
    let state = makeStateWithStrokesOnStage(strokes);

    const dispatch = jest.fn((action: CanvasAction) => {
      dispatchedActions.push(action);
      state = canvasReducer(state, action);
    });

    const { rerender } = renderHook(
      (props: UsePerformerOptions) => usePerformer(props),
      {
        initialProps: {
          performance: state.performance,
          dispatch,
          paused: false,
          inStudio: true,
          frameDelayMs: 16.67,
        },
      }
    );

    // Animate through everything
    for (let i = 0; i < 15; i++) {
      act(() => advanceFrame(20));
      rerender({
        performance: state.performance,
        dispatch,
        paused: false,
        inStudio: true,
        frameDelayMs: 16.67,
      });
    }

    const stageCompleteActions = dispatchedActions.filter((a) => a.type === 'STAGE_COMPLETE');
    expect(stageCompleteActions.length).toBe(1);
    expect(state.performance.onStage).toBeNull();
  });

  it('calls onStrokesComplete callback when batch finishes', () => {
    const onStrokesComplete = jest.fn();
    const strokes = [makeStroke([{ x: 0, y: 0 }], 'agent', 42)];

    const dispatchedActions: CanvasAction[] = [];
    let state = makeStateWithStrokesOnStage(strokes);

    const dispatch = jest.fn((action: CanvasAction) => {
      dispatchedActions.push(action);
      state = canvasReducer(state, action);
    });

    const { rerender } = renderHook(
      (props: UsePerformerOptions) => usePerformer(props),
      {
        initialProps: {
          performance: state.performance,
          dispatch,
          paused: false,
          inStudio: true,
          onStrokesComplete,
          frameDelayMs: 16.67,
        },
      }
    );

    // Animate through single point stroke
    for (let i = 0; i < 10; i++) {
      act(() => advanceFrame(20));
      rerender({
        performance: state.performance,
        dispatch,
        paused: false,
        inStudio: true,
        onStrokesComplete,
        frameDelayMs: 16.67,
      });
    }

    expect(onStrokesComplete).toHaveBeenCalledTimes(1);
    expect(onStrokesComplete).toHaveBeenCalledWith(42);
  });

  it('passes stroke style on first point only', () => {
    const strokes = [
      makeStrokeWithStyle([{ x: 0, y: 0 }, { x: 10, y: 10 }], '#FF0000', 5),
    ];

    const dispatchedActions: CanvasAction[] = [];
    let state = makeStateWithStrokesOnStage(strokes);

    const dispatch = jest.fn((action: CanvasAction) => {
      dispatchedActions.push(action);
      state = canvasReducer(state, action);
    });

    const { rerender } = renderHook(
      (props: UsePerformerOptions) => usePerformer(props),
      {
        initialProps: {
          performance: state.performance,
          dispatch,
          paused: false,
          inStudio: true,
          frameDelayMs: 16.67,
        },
      }
    );

    // Process both points
    for (let i = 0; i < 5; i++) {
      act(() => advanceFrame(20));
      rerender({
        performance: state.performance,
        dispatch,
        paused: false,
        inStudio: true,
        frameDelayMs: 16.67,
      });
    }

    const progressActions = dispatchedActions.filter(
      (a): a is CanvasAction & { type: 'STROKE_PROGRESS' } => a.type === 'STROKE_PROGRESS'
    );

    // First point should have style
    expect(progressActions[0]?.style).toBeDefined();
    expect(progressActions[0]?.style?.color).toBe('#FF0000');
    expect(progressActions[0]?.style?.stroke_width).toBe(5);

    // Second point should not have style
    expect(progressActions[1]?.style).toBeUndefined();
  });
});

// ============================================================================
// Pause/Resume Tests
// ============================================================================

describe('usePerformer - Pause/Resume Behavior', () => {
  it('stops animation when paused=true', () => {
    const dispatch = jest.fn();
    const strokes = [makeStroke([{ x: 0, y: 0 }, { x: 10, y: 10 }])];
    const performance = makeStrokesOnStage(strokes);

    renderHook(() =>
      usePerformer({
        performance,
        dispatch,
        paused: true, // Start paused
        inStudio: true,
        frameDelayMs: 16.67,
      })
    );

    // Try to advance frames
    act(() => advanceFrames(5, 20));

    // Should not dispatch any stroke actions when paused
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('stops animation when inStudio=false', () => {
    const dispatch = jest.fn();
    const strokes = [makeStroke([{ x: 0, y: 0 }, { x: 10, y: 10 }])];
    const performance = makeStrokesOnStage(strokes);

    renderHook(() =>
      usePerformer({
        performance,
        dispatch,
        paused: false,
        inStudio: false, // Not in studio
        frameDelayMs: 16.67,
      })
    );

    act(() => advanceFrames(5, 20));

    expect(dispatch).not.toHaveBeenCalled();
  });

  it('resumes animation when unpaused', () => {
    const strokes = [makeStroke([{ x: 0, y: 0 }, { x: 10, y: 10 }])];

    const dispatchedActions: CanvasAction[] = [];
    let state = makeStateWithStrokesOnStage(strokes);

    const dispatch = jest.fn((action: CanvasAction) => {
      dispatchedActions.push(action);
      state = canvasReducer(state, action);
    });

    // Start paused
    const { rerender } = renderHook(
      (props: UsePerformerOptions) => usePerformer(props),
      {
        initialProps: {
          performance: state.performance,
          dispatch,
          paused: true,
          inStudio: true,
          frameDelayMs: 16.67,
        },
      }
    );

    // Try advancing while paused
    act(() => advanceFrames(3, 20));
    expect(dispatchedActions.length).toBe(0);

    // Resume
    rerender({
      performance: state.performance,
      dispatch,
      paused: false,
      inStudio: true,
      frameDelayMs: 16.67,
    });

    // Advance frames while running
    for (let i = 0; i < 5; i++) {
      act(() => advanceFrame(20));
      rerender({
        performance: state.performance,
        dispatch,
        paused: false,
        inStudio: true,
        frameDelayMs: 16.67,
      });
    }

    // Should now have some progress actions
    const progressActions = dispatchedActions.filter((a) => a.type === 'STROKE_PROGRESS');
    expect(progressActions.length).toBeGreaterThan(0);
  });

  it('cancels animation frame on pause', () => {
    const strokes = [makeStroke([{ x: 0, y: 0 }, { x: 10, y: 10 }])];
    const performance = makeStrokesOnStage(strokes);

    const { rerender } = renderHook(
      (props: UsePerformerOptions) => usePerformer(props),
      {
        initialProps: {
          performance,
          dispatch: jest.fn(),
          paused: false,
          inStudio: true,
          frameDelayMs: 16.67,
        },
      }
    );

    // Start animation
    act(() => advanceFrame(20));

    // Pause
    rerender({
      performance,
      dispatch: jest.fn(),
      paused: true,
      inStudio: true,
      frameDelayMs: 16.67,
    });

    expect(global.cancelAnimationFrame).toHaveBeenCalled();
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('usePerformer - Edge Cases', () => {
  it('handles empty onStage gracefully (no dispatch)', () => {
    const dispatch = jest.fn();
    const performance: PerformanceState = {
      ...initialPerformanceState,
      onStage: null,
      buffer: [], // Empty buffer too
    };

    renderHook(() =>
      usePerformer({
        performance,
        dispatch,
        paused: false,
        inStudio: true,
        frameDelayMs: 16.67,
      })
    );

    act(() => advanceFrames(5, 20));

    // Should not dispatch STROKE_PROGRESS or STROKE_COMPLETE
    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'STROKE_PROGRESS' })
    );
    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'STROKE_COMPLETE' })
    );
  });

  it('dispatches ADVANCE_STAGE when stage is empty but buffer has items', () => {
    const dispatch = jest.fn();
    const strokes = [makeStroke([{ x: 0, y: 0 }])];

    // Strokes in buffer, not on stage
    const performance: PerformanceState = {
      ...initialPerformanceState,
      onStage: null,
      buffer: [{ type: 'strokes', strokes, id: 'test-1' }],
    };

    renderHook(() =>
      usePerformer({
        performance,
        dispatch,
        paused: false,
        inStudio: true,
        frameDelayMs: 16.67,
      })
    );

    act(() => advanceFrame(20));

    expect(dispatch).toHaveBeenCalledWith({ type: 'ADVANCE_STAGE' });
  });

  it('handles strokes with single point', () => {
    const strokes = [makeStroke([{ x: 0, y: 0 }])]; // Single point

    const dispatchedActions: CanvasAction[] = [];
    let state = makeStateWithStrokesOnStage(strokes);

    const dispatch = jest.fn((action: CanvasAction) => {
      dispatchedActions.push(action);
      state = canvasReducer(state, action);
    });

    const { rerender } = renderHook(
      (props: UsePerformerOptions) => usePerformer(props),
      {
        initialProps: {
          performance: state.performance,
          dispatch,
          paused: false,
          inStudio: true,
          frameDelayMs: 16.67,
        },
      }
    );

    // Should be able to complete single-point stroke
    for (let i = 0; i < 5; i++) {
      act(() => advanceFrame(20));
      rerender({
        performance: state.performance,
        dispatch,
        paused: false,
        inStudio: true,
        frameDelayMs: 16.67,
      });
    }

    const progressActions = dispatchedActions.filter((a) => a.type === 'STROKE_PROGRESS');
    const completeActions = dispatchedActions.filter((a) => a.type === 'STROKE_COMPLETE');

    expect(progressActions.length).toBe(1);
    expect(completeActions.length).toBe(1);
  });

  it('cleans up animation frame on unmount', () => {
    const strokes = [makeStroke([{ x: 0, y: 0 }, { x: 10, y: 10 }])];
    const performance = makeStrokesOnStage(strokes);

    const { unmount } = renderHook(() =>
      usePerformer({
        performance,
        dispatch: jest.fn(),
        paused: false,
        inStudio: true,
        frameDelayMs: 16.67,
      })
    );

    // Start animation
    act(() => advanceFrame(20));

    // Unmount
    unmount();

    expect(global.cancelAnimationFrame).toHaveBeenCalled();
  });

  it('respects frameDelayMs timing', () => {
    const strokes = [
      makeStroke([
        { x: 0, y: 0 },
        { x: 10, y: 10 },
        { x: 20, y: 20 },
      ]),
    ];

    const dispatchedActions: CanvasAction[] = [];
    let state = makeStateWithStrokesOnStage(strokes);

    const dispatch = jest.fn((action: CanvasAction) => {
      dispatchedActions.push(action);
      state = canvasReducer(state, action);
    });

    // Use longer frame delay (100ms)
    const { rerender } = renderHook(
      (props: UsePerformerOptions) => usePerformer(props),
      {
        initialProps: {
          performance: state.performance,
          dispatch,
          paused: false,
          inStudio: true,
          frameDelayMs: 100,
        },
      }
    );

    // First frame at 50ms - less than frameDelayMs, so no dispatch yet
    // (lastStrokeTimeRef starts at 0, so check is: 50 - 0 >= 100 = false)
    act(() => advanceFrame(50));
    rerender({
      performance: state.performance,
      dispatch,
      paused: false,
      inStudio: true,
      frameDelayMs: 100,
    });

    const beforeThreshold = dispatchedActions.filter((a) => a.type === 'STROKE_PROGRESS');
    expect(beforeThreshold.length).toBe(0); // Not yet - under threshold

    // Advance to 100ms total - now threshold is met
    act(() => advanceFrame(50)); // total = 100ms
    rerender({
      performance: state.performance,
      dispatch,
      paused: false,
      inStudio: true,
      frameDelayMs: 100,
    });

    const atThreshold = dispatchedActions.filter((a) => a.type === 'STROKE_PROGRESS');
    expect(atThreshold.length).toBe(1); // First point dispatched

    // Advance by less than frameDelayMs from last dispatch
    act(() => advanceFrame(50)); // total = 150ms, but last dispatch was at 100ms
    rerender({
      performance: state.performance,
      dispatch,
      paused: false,
      inStudio: true,
      frameDelayMs: 100,
    });

    const afterShort = dispatchedActions.filter((a) => a.type === 'STROKE_PROGRESS');
    expect(afterShort.length).toBe(1); // Still 1 - only 50ms since last

    // Advance past the delay from last dispatch
    act(() => advanceFrame(60)); // total = 210ms, 110ms since last dispatch
    rerender({
      performance: state.performance,
      dispatch,
      paused: false,
      inStudio: true,
      frameDelayMs: 100,
    });

    const afterLong = dispatchedActions.filter((a) => a.type === 'STROKE_PROGRESS');
    expect(afterLong.length).toBe(2); // Now 2
  });
});

// ============================================================================
// Buffer to Stage Flow
// ============================================================================

describe('usePerformer - Buffer to Stage Flow', () => {
  it('processes multiple batches from buffer sequentially', () => {
    const batch1 = [makeStroke([{ x: 0, y: 0 }])];
    const batch2 = [makeStroke([{ x: 10, y: 10 }])];

    // Both batches in buffer
    let state: CanvasHookState = {
      ...initialState,
      paused: false,
      performance: {
        ...initialPerformanceState,
        buffer: [
          { type: 'strokes', strokes: batch1, id: 'batch-1' },
          { type: 'strokes', strokes: batch2, id: 'batch-2' },
        ],
      },
    };

    const dispatchedActions: CanvasAction[] = [];
    const dispatch = jest.fn((action: CanvasAction) => {
      dispatchedActions.push(action);
      state = canvasReducer(state, action);
    });

    const { rerender } = renderHook(
      (props: UsePerformerOptions) => usePerformer(props),
      {
        initialProps: {
          performance: state.performance,
          dispatch,
          paused: false,
          inStudio: true,
          frameDelayMs: 16.67,
        },
      }
    );

    // Process all batches
    for (let i = 0; i < 20; i++) {
      act(() => advanceFrame(20));
      rerender({
        performance: state.performance,
        dispatch,
        paused: false,
        inStudio: true,
        frameDelayMs: 16.67,
      });
    }

    // Should have 2 ADVANCE_STAGE (one per batch)
    const advanceActions = dispatchedActions.filter((a) => a.type === 'ADVANCE_STAGE');
    expect(advanceActions.length).toBe(2);

    // Should have 2 STAGE_COMPLETE (one per batch)
    const stageCompleteActions = dispatchedActions.filter((a) => a.type === 'STAGE_COMPLETE');
    expect(stageCompleteActions.length).toBe(2);

    // Buffer should be empty, stage should be clear
    expect(state.performance.buffer).toHaveLength(0);
    expect(state.performance.onStage).toBeNull();
  });
});
