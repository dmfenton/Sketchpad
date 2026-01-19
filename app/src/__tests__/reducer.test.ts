/**
 * Tests for canvas reducer functions.
 */

import {
  canvasReducer,
  deriveAgentStatus,
  hasInProgressEvents,
  initialState,
  LIVE_MESSAGE_ID,
  shouldShowIdleAnimation,
  type CanvasHookState,
} from '@code-monet/shared';
import type { AgentMessage } from '@code-monet/shared';

describe('hasInProgressEvents', () => {
  it('returns false for empty messages', () => {
    expect(hasInProgressEvents([])).toBe(false);
  });

  it('returns true when live thinking message exists', () => {
    const messages: AgentMessage[] = [
      { id: LIVE_MESSAGE_ID, type: 'thinking', text: 'Thinking...', timestamp: Date.now() },
    ];
    expect(hasInProgressEvents(messages)).toBe(true);
  });

  it('returns false for finalized thinking message', () => {
    const messages: AgentMessage[] = [
      { id: 'thinking_123', type: 'thinking', text: 'Done thinking', timestamp: Date.now() },
    ];
    expect(hasInProgressEvents(messages)).toBe(false);
  });

  it('returns true for code_execution without return_code', () => {
    const messages: AgentMessage[] = [
      {
        id: 'exec_1',
        type: 'code_execution',
        text: 'Running tool',
        timestamp: Date.now(),
        metadata: { tool_name: 'draw_paths' },
      },
    ];
    expect(hasInProgressEvents(messages)).toBe(true);
  });

  it('returns false for code_execution with return_code', () => {
    const messages: AgentMessage[] = [
      {
        id: 'exec_1',
        type: 'code_execution',
        text: 'Tool completed',
        timestamp: Date.now(),
        metadata: { tool_name: 'draw_paths', return_code: 0 },
      },
    ];
    expect(hasInProgressEvents(messages)).toBe(false);
  });

  it('returns true if any message is in-progress among multiple', () => {
    const messages: AgentMessage[] = [
      { id: 'thinking_1', type: 'thinking', text: 'First thought', timestamp: Date.now() },
      {
        id: 'exec_1',
        type: 'code_execution',
        text: 'Running',
        timestamp: Date.now(),
        metadata: { tool_name: 'draw_paths' },
      },
    ];
    expect(hasInProgressEvents(messages)).toBe(true);
  });

  it('returns false when all events are completed', () => {
    const messages: AgentMessage[] = [
      { id: 'thinking_1', type: 'thinking', text: 'First thought', timestamp: Date.now() },
      {
        id: 'exec_1',
        type: 'code_execution',
        text: 'Done',
        timestamp: Date.now(),
        metadata: { tool_name: 'draw_paths', return_code: 0 },
      },
    ];
    expect(hasInProgressEvents(messages)).toBe(false);
  });

  it('returns false when started and completed messages both exist for same tool', () => {
    // This is the real-world case: both "started" and "completed" messages exist
    const messages: AgentMessage[] = [
      {
        id: 'exec_started',
        type: 'code_execution',
        text: 'Drawing 3 paths...',
        timestamp: Date.now(),
        iteration: 1,
        metadata: { tool_name: 'draw_paths' }, // No return_code
      },
      {
        id: 'exec_completed',
        type: 'code_execution',
        text: 'Drew 3 paths',
        timestamp: Date.now(),
        iteration: 1,
        metadata: { tool_name: 'draw_paths', return_code: 0 },
      },
    ];
    expect(hasInProgressEvents(messages)).toBe(false);
  });

  it('returns true when started exists but completed is for different iteration', () => {
    const messages: AgentMessage[] = [
      {
        id: 'exec_started',
        type: 'code_execution',
        text: 'Drawing...',
        timestamp: Date.now(),
        iteration: 2, // Different iteration
        metadata: { tool_name: 'draw_paths' },
      },
      {
        id: 'exec_completed',
        type: 'code_execution',
        text: 'Drew paths',
        timestamp: Date.now(),
        iteration: 1, // Completed is for iteration 1
        metadata: { tool_name: 'draw_paths', return_code: 0 },
      },
    ];
    expect(hasInProgressEvents(messages)).toBe(true);
  });
});

describe('deriveAgentStatus', () => {
  const baseState: CanvasHookState = {
    ...initialState,
    paused: false,
  };

  it('returns paused when paused is true', () => {
    const state = { ...baseState, paused: true };
    expect(deriveAgentStatus(state)).toBe('paused');
  });

  it('returns error when last message is error', () => {
    const state: CanvasHookState = {
      ...baseState,
      messages: [{ id: 'err_1', type: 'error', text: 'Something failed', timestamp: Date.now() }],
    };
    expect(deriveAgentStatus(state)).toBe('error');
  });

  it('returns thinking when live message exists', () => {
    const state: CanvasHookState = {
      ...baseState,
      messages: [
        { id: LIVE_MESSAGE_ID, type: 'thinking', text: 'Thinking...', timestamp: Date.now() },
      ],
    };
    expect(deriveAgentStatus(state)).toBe('thinking');
  });

  it('returns executing when code_execution is in-progress', () => {
    const state: CanvasHookState = {
      ...baseState,
      messages: [
        {
          id: 'exec_1',
          type: 'code_execution',
          text: 'Running',
          timestamp: Date.now(),
          metadata: { tool_name: 'draw_paths' },
        },
      ],
    };
    expect(deriveAgentStatus(state)).toBe('executing');
  });

  it('returns drawing when pendingStrokes set and no in-progress events', () => {
    const state: CanvasHookState = {
      ...baseState,
      pendingStrokes: { count: 5, batchId: 1, pieceNumber: 0 },
      messages: [
        {
          id: 'exec_1',
          type: 'code_execution',
          text: 'Done',
          timestamp: Date.now(),
          metadata: { tool_name: 'draw_paths', return_code: 0 },
        },
      ],
    };
    expect(deriveAgentStatus(state)).toBe('drawing');
  });

  it('returns executing (not drawing) when pendingStrokes set but code_execution in-progress', () => {
    const state: CanvasHookState = {
      ...baseState,
      pendingStrokes: { count: 5, batchId: 1, pieceNumber: 0 },
      messages: [
        {
          id: 'exec_1',
          type: 'code_execution',
          text: 'Running',
          timestamp: Date.now(),
          metadata: { tool_name: 'draw_paths' },
        },
      ],
    };
    // This is the key test: drawing waits for in-progress events
    expect(deriveAgentStatus(state)).toBe('executing');
  });

  it('returns idle when no active state', () => {
    expect(deriveAgentStatus(baseState)).toBe('idle');
  });

  it('prioritizes paused over everything', () => {
    const state: CanvasHookState = {
      ...baseState,
      paused: true,
      pendingStrokes: { count: 5, batchId: 1, pieceNumber: 0 },
      messages: [{ id: LIVE_MESSAGE_ID, type: 'thinking', text: 'Active', timestamp: Date.now() }],
    };
    expect(deriveAgentStatus(state)).toBe('paused');
  });

  it('prioritizes error over thinking', () => {
    const state: CanvasHookState = {
      ...baseState,
      messages: [
        { id: LIVE_MESSAGE_ID, type: 'thinking', text: 'Thinking', timestamp: Date.now() },
        { id: 'err_1', type: 'error', text: 'Failed', timestamp: Date.now() },
      ],
    };
    expect(deriveAgentStatus(state)).toBe('error');
  });
});

describe('shouldShowIdleAnimation', () => {
  const baseState: CanvasHookState = {
    ...initialState,
    paused: false,
  };

  it('returns true when canvas empty and status is idle', () => {
    expect(shouldShowIdleAnimation(baseState)).toBe(true);
  });

  it('returns false when canvas has strokes', () => {
    const state: CanvasHookState = {
      ...baseState,
      strokes: [{ type: 'polyline', points: [{ x: 0, y: 0 }] }],
    };
    expect(shouldShowIdleAnimation(state)).toBe(false);
  });

  it('returns false when user is drawing (currentStroke has points)', () => {
    const state: CanvasHookState = {
      ...baseState,
      currentStroke: [{ x: 10, y: 10 }],
    };
    expect(shouldShowIdleAnimation(state)).toBe(false);
  });

  it('returns false when paused (even with empty canvas)', () => {
    const state: CanvasHookState = {
      ...baseState,
      paused: true,
    };
    expect(shouldShowIdleAnimation(state)).toBe(false);
  });

  it('returns false when thinking (even with empty canvas)', () => {
    const state: CanvasHookState = {
      ...baseState,
      messages: [
        { id: LIVE_MESSAGE_ID, type: 'thinking', text: 'Thinking...', timestamp: Date.now() },
      ],
    };
    expect(shouldShowIdleAnimation(state)).toBe(false);
  });

  it('returns false when drawing (even with empty canvas)', () => {
    const state: CanvasHookState = {
      ...baseState,
      pendingStrokes: { count: 5, batchId: 1, pieceNumber: 0 },
    };
    expect(shouldShowIdleAnimation(state)).toBe(false);
  });

  it('returns false when has strokes even if would otherwise be idle', () => {
    const state: CanvasHookState = {
      ...baseState,
      strokes: [
        {
          type: 'line',
          points: [
            { x: 0, y: 0 },
            { x: 10, y: 10 },
          ],
        },
      ],
    };
    // Status would be 'idle' but strokes exist
    expect(deriveAgentStatus(state)).toBe('idle');
    expect(shouldShowIdleAnimation(state)).toBe(false);
  });
});

describe('canvasReducer - STROKES_READY', () => {
  it('accepts strokes when pieceNumber matches', () => {
    const state: CanvasHookState = { ...initialState, pieceNumber: 5 };
    const result = canvasReducer(state, {
      type: 'STROKES_READY',
      count: 3,
      batchId: 1,
      pieceNumber: 5,
    });
    expect(result.pendingStrokes).toEqual({ count: 3, batchId: 1, pieceNumber: 5 });
    expect(result.pieceNumber).toBe(5);
  });

  it('rejects strokes for OLD pieces (stale message)', () => {
    const state: CanvasHookState = { ...initialState, pieceNumber: 5 };

    const result = canvasReducer(state, {
      type: 'STROKES_READY',
      count: 3,
      batchId: 1,
      pieceNumber: 3,
    });
    expect(result.pendingStrokes).toBeNull();
    expect(result.pieceNumber).toBe(5); // unchanged
  });

  it('accepts strokes for newer pieces and syncs pieceNumber (race condition handling)', () => {
    // This handles the race condition where strokes_ready arrives before piece_state
    const state: CanvasHookState = { ...initialState, pieceNumber: 5 };

    const result = canvasReducer(state, {
      type: 'STROKES_READY',
      count: 3,
      batchId: 1,
      pieceNumber: 7,
    });
    // Should accept strokes and sync pieceNumber forward
    expect(result.pendingStrokes).toEqual({ count: 3, batchId: 1, pieceNumber: 7 });
    expect(result.pieceNumber).toBe(7);
  });

  it('rejects strokes when viewing gallery', () => {
    const state: CanvasHookState = { ...initialState, pieceNumber: 5, viewingPiece: 3 };

    const result = canvasReducer(state, {
      type: 'STROKES_READY',
      count: 3,
      batchId: 1,
      pieceNumber: 5,
    });
    expect(result.pendingStrokes).toBeNull();
  });
});
