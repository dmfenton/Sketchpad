/**
 * Comprehensive tests for the canvas rendering flow.
 *
 * These tests validate the complete chain from WebSocket messages to canvas rendering:
 * 1. Message arrives → reducer processes → state updates
 * 2. State changes → status derived correctly
 * 3. Rendering gates open at the right time
 * 4. Animation would trigger (mocking StrokeRenderer)
 *
 * Key scenarios tested:
 * - Full turn sequence from iteration to agent_strokes_ready
 * - Thinking text accumulation and reset
 * - Status transitions that gate rendering
 * - canRender becoming true at correct time
 */

import {
  canvasReducer,
  deriveAgentStatus,
  hasInProgressEvents,
  initialState,
  routeMessage,
  type CanvasHookState,
} from '@code-monet/shared';
import type { ServerMessage, AgentStatus } from '@code-monet/shared';

/**
 * Process a message and return the new state.
 */
function processMessage(state: CanvasHookState, message: ServerMessage): CanvasHookState {
  const actions: Parameters<typeof canvasReducer>[1][] = [];
  routeMessage(message, (action) => actions.push(action));
  return actions.reduce((s, action) => canvasReducer(s, action), state);
}

/**
 * Process a sequence of messages and track status at each step.
 */
function processSequence(messages: ServerMessage[]): {
  states: CanvasHookState[];
  statuses: AgentStatus[];
} {
  const states: CanvasHookState[] = [];
  const statuses: AgentStatus[] = [];

  let state: CanvasHookState = { ...initialState, paused: false };

  for (const msg of messages) {
    state = processMessage(state, msg);
    states.push(state);
    statuses.push(deriveAgentStatus(state));
  }

  return { states, statuses };
}

describe('Render Flow - Complete Turn Sequence', () => {
  /**
   * This is the exact sequence from the recorded fixture.
   * The canvas should transition to 'drawing' status after code_execution completes.
   */
  const turnSequence: ServerMessage[] = [
    { type: 'iteration', current: 1, max: 5 },
    { type: 'thinking_delta', text: "I'll start by drawing ", iteration: 1 },
    { type: 'thinking_delta', text: 'a simple line.', iteration: 1 },
    {
      type: 'code_execution',
      status: 'started',
      tool_name: 'draw_paths',
      tool_input: {
        paths: [
          {
            type: 'line',
            points: [
              { x: 0, y: 0 },
              { x: 100, y: 100 },
            ],
          },
        ],
      },
      iteration: 1,
    },
    { type: 'agent_strokes_ready', count: 1, batch_id: 1, piece_number: 0 },
    {
      type: 'code_execution',
      status: 'completed',
      tool_name: 'draw_paths',
      tool_input: {
        paths: [
          {
            type: 'line',
            points: [
              { x: 0, y: 0 },
              { x: 100, y: 100 },
            ],
          },
        ],
      },
      stdout: null,
      stderr: null,
      return_code: 0,
      iteration: 1,
    },
  ];

  it('transitions through correct statuses during turn', () => {
    const { statuses } = processSequence(turnSequence);

    // After iteration: idle (thinking archived, no new thinking yet)
    expect(statuses[0]).toBe('idle');

    // After first thinking_delta: thinking (thinking text exists)
    expect(statuses[1]).toBe('thinking');

    // After second thinking_delta: still thinking
    expect(statuses[2]).toBe('thinking');

    // After code_execution started: thinking (thinking text still exists during code execution)
    // Note: In the new model, thinking persists during code execution so words can finish revealing
    expect(statuses[3]).toBe('thinking');

    // After agent_strokes_ready: still thinking
    expect(statuses[4]).toBe('thinking');

    // After code_execution completed: thinking (still has thinking text)
    // Status becomes drawing only after thinking is archived (on iteration or turn end)
    expect(statuses[5]).toBe('thinking');
  });

  it('sets pendingStrokes when agent_strokes_ready arrives', () => {
    const { states } = processSequence(turnSequence);

    // Before agent_strokes_ready (index 3)
    expect(states[3]?.pendingStrokes).toBeNull();

    // After agent_strokes_ready (index 4)
    expect(states[4]?.pendingStrokes).toEqual({ count: 1, batchId: 1, pieceNumber: 0 });

    // After code_execution completed (index 5) - still set
    expect(states[5]?.pendingStrokes).toEqual({ count: 1, batchId: 1, pieceNumber: 0 });
  });

  it('status is thinking while thinking text exists', () => {
    const { statuses } = processSequence(turnSequence);

    // In the new model, status is 'thinking' while thinking text exists
    // This allows progressive text animation to continue during code execution
    // Strokes are gated by waitForThinking (isBuffering) rather than status

    // All statuses after first thinking_delta should be 'thinking'
    // (until thinking is archived, which happens on iteration)
    expect(statuses.slice(1).every((s) => s === 'thinking')).toBe(true);
  });

  it('has no in-progress events after code_execution completed', () => {
    const { states } = processSequence(turnSequence);

    // After agent_strokes_ready but before completed
    expect(hasInProgressEvents(states[4]!.messages)).toBe(true);

    // After completed
    expect(hasInProgressEvents(states[5]!.messages)).toBe(false);
  });
});

describe('Render Flow - Thinking Text Accumulation Bug', () => {
  it('accumulates thinking text across deltas', () => {
    const messages: ServerMessage[] = [
      { type: 'thinking_delta', text: 'First ', iteration: 1 },
      { type: 'thinking_delta', text: 'second ', iteration: 1 },
      { type: 'thinking_delta', text: 'third.', iteration: 1 },
    ];

    const { states } = processSequence(messages);

    expect(states[2]?.thinking).toBe('First second third.');
  });

  it('clears thinking text when new iteration starts', () => {
    // Verify thinking text is cleared between turns (fix for accumulation bug)
    const messages: ServerMessage[] = [
      { type: 'iteration', current: 1, max: 5 },
      { type: 'thinking_delta', text: 'Turn 1 thinking.', iteration: 1 },
      {
        type: 'code_execution',
        status: 'started',
        tool_name: 'draw_paths',
        tool_input: {},
        iteration: 1,
      },
      {
        type: 'code_execution',
        status: 'completed',
        tool_name: 'draw_paths',
        tool_input: {},
        return_code: 0,
        iteration: 1,
      },
      // New iteration starts
      { type: 'iteration', current: 2, max: 5 },
      { type: 'thinking_delta', text: 'Turn 2 thinking.', iteration: 2 },
    ];

    const { states } = processSequence(messages);

    // After iteration 2 starts, thinking should be cleared
    const thinkingAfterIteration2 = states[4]?.thinking;
    expect(thinkingAfterIteration2).toBe('');

    // After turn 2's delta, only turn 2's text should be present
    const thinkingAfterDelta2 = states[5]?.thinking;
    expect(thinkingAfterDelta2).toBe('Turn 2 thinking.');
  });
});

describe('Render Flow - Thinking State Management', () => {
  it('sets thinking text on first thinking_delta', () => {
    let state: CanvasHookState = { ...initialState, paused: false };
    state = processMessage(state, { type: 'thinking_delta', text: 'Hello', iteration: 1 });

    expect(state.thinking).toBe('Hello');
    // No messages yet (thinking is not archived until iteration ends)
    expect(state.messages.length).toBe(0);
  });

  it('appends to existing thinking text', () => {
    let state: CanvasHookState = { ...initialState, paused: false };
    state = processMessage(state, { type: 'thinking_delta', text: 'Hello ', iteration: 1 });
    state = processMessage(state, { type: 'thinking_delta', text: 'world', iteration: 1 });

    expect(state.thinking).toBe('Hello world');
    expect(state.messages.length).toBe(0);
  });

  it('thinking persists during code_execution (for progressive reveal)', () => {
    let state: CanvasHookState = { ...initialState, paused: false };
    state = processMessage(state, { type: 'thinking_delta', text: 'Thinking...', iteration: 1 });
    state = processMessage(state, {
      type: 'code_execution',
      status: 'started',
      tool_name: 'draw_paths',
      tool_input: {},
      iteration: 1,
    });

    // Thinking text should persist during code execution
    // This allows the progressive text animation to finish
    expect(state.thinking).toBe('Thinking...');

    // Code execution message should be added
    const codeExecMessages = state.messages.filter((m) => m.type === 'code_execution');
    expect(codeExecMessages.length).toBe(1);
  });

  it('archives thinking on new iteration', () => {
    let state: CanvasHookState = { ...initialState, paused: false };

    // First turn's thinking
    state = processMessage(state, { type: 'thinking_delta', text: 'First thought', iteration: 1 });
    expect(state.thinking).toBe('First thought');

    // New iteration starts - archives old thinking
    state = processMessage(state, { type: 'iteration', current: 2, max: 5 });

    // Thinking should be cleared
    expect(state.thinking).toBe('');

    // And archived thinking should be in messages
    const thinkingMessages = state.messages.filter((m) => m.type === 'thinking');
    expect(thinkingMessages.length).toBe(1);
    expect(thinkingMessages[0]?.text).toBe('First thought');
  });

  it('accumulates new thinking after iteration', () => {
    let state: CanvasHookState = { ...initialState, paused: false };

    // First turn
    state = processMessage(state, { type: 'thinking_delta', text: 'First', iteration: 1 });
    state = processMessage(state, { type: 'iteration', current: 2, max: 5 });

    // Second turn
    state = processMessage(state, { type: 'thinking_delta', text: 'Second', iteration: 2 });

    // New thinking should be separate
    expect(state.thinking).toBe('Second');

    // Archived thinking should be preserved
    const thinkingMessages = state.messages.filter((m) => m.type === 'thinking');
    expect(thinkingMessages.length).toBe(1);
    expect(thinkingMessages[0]?.text).toBe('First');
  });
});

describe('Render Flow - Status Derivation Edge Cases', () => {
  it('thinking takes precedence over pendingStrokes', () => {
    let state: CanvasHookState = {
      ...initialState,
      paused: false,
      pendingStrokes: { count: 1, batchId: 1, pieceNumber: 0 },
    };
    state = processMessage(state, { type: 'thinking_delta', text: 'Thinking', iteration: 1 });

    // Even with pendingStrokes, status is 'thinking' because thinking text exists
    expect(deriveAgentStatus(state)).toBe('thinking');
  });

  it('thinking takes precedence over executing when thinking text exists', () => {
    let state: CanvasHookState = { ...initialState, paused: false };

    // Add thinking
    state = processMessage(state, { type: 'thinking_delta', text: 'Thinking...', iteration: 1 });

    // Start code execution
    state = processMessage(state, {
      type: 'code_execution',
      status: 'started',
      tool_name: 'draw_paths',
      tool_input: {},
      iteration: 1,
    });

    // Status should be 'thinking' because thinking text exists
    // This allows progressive text animation to continue
    expect(deriveAgentStatus(state)).toBe('thinking');
  });

  it('executing shows when no thinking text but code_execution in progress', () => {
    let state: CanvasHookState = { ...initialState, paused: false };

    // Start code execution without thinking
    state = processMessage(state, {
      type: 'code_execution',
      status: 'started',
      tool_name: 'draw_paths',
      tool_input: {},
      iteration: 1,
    });

    // Status should be 'executing'
    expect(deriveAgentStatus(state)).toBe('executing');
  });

  it('CLEAR_PENDING_STROKES resets pendingStrokes', () => {
    let state: CanvasHookState = { ...initialState, paused: false };
    state = processMessage(state, {
      type: 'agent_strokes_ready',
      count: 1,
      batch_id: 1,
      piece_number: 0,
    });
    expect(state.pendingStrokes).not.toBeNull();

    // Manually dispatch CLEAR_PENDING_STROKES (as StrokeRenderer would)
    state = canvasReducer(state, { type: 'CLEAR_PENDING_STROKES' });
    expect(state.pendingStrokes).toBeNull();
    expect(deriveAgentStatus(state)).toBe('idle');
  });
});

describe('Render Flow - Multi-Turn Scenario', () => {
  it('handles complete multi-turn scenario', () => {
    const multiTurnSequence: ServerMessage[] = [
      // Turn 1
      { type: 'iteration', current: 1, max: 3 },
      { type: 'thinking_delta', text: 'Drawing first stroke.', iteration: 1 },
      {
        type: 'code_execution',
        status: 'started',
        tool_name: 'draw_paths',
        tool_input: {},
        iteration: 1,
      },
      { type: 'agent_strokes_ready', count: 1, batch_id: 1, piece_number: 0 },
      {
        type: 'code_execution',
        status: 'completed',
        tool_name: 'draw_paths',
        tool_input: {},
        return_code: 0,
        iteration: 1,
      },
      // Simulate CLEAR_PENDING_STROKES (happens when StrokeRenderer starts animating)
      // (We can't simulate this via ServerMessage, but it happens in the hook)

      // Turn 2 - iteration archives turn 1's thinking
      { type: 'iteration', current: 2, max: 3 },
      { type: 'thinking_delta', text: 'Adding second stroke.', iteration: 2 },
      {
        type: 'code_execution',
        status: 'started',
        tool_name: 'draw_paths',
        tool_input: {},
        iteration: 2,
      },
      { type: 'agent_strokes_ready', count: 1, batch_id: 2, piece_number: 0 },
      {
        type: 'code_execution',
        status: 'completed',
        tool_name: 'draw_paths',
        tool_input: {},
        return_code: 0,
        iteration: 2,
      },
    ];

    const { states, statuses } = processSequence(multiTurnSequence);

    // Check final state
    const finalState = states[states.length - 1]!;
    const finalStatus = statuses[statuses.length - 1];

    // Final status is 'thinking' because thinking text still exists for turn 2
    // (it would be archived on the next iteration or turn end)
    expect(finalStatus).toBe('thinking');
    expect(finalState.thinking).toBe('Adding second stroke.');
    expect(finalState.pendingStrokes).toEqual({ count: 1, batchId: 2, pieceNumber: 0 });

    // Should have archived thinking from turn 1 plus the code execution messages
    const thinkingMessages = finalState.messages.filter((m) => m.type === 'thinking');
    expect(thinkingMessages.length).toBe(1);
    expect(thinkingMessages[0]?.text).toBe('Drawing first stroke.');

    // Code execution messages from both turns
    const codeExecMessages = finalState.messages.filter((m) => m.type === 'code_execution');
    expect(codeExecMessages.length).toBe(4);
  });
});

describe('Render Flow - Error Handling', () => {
  it('error status takes precedence when last message is error', () => {
    let state: CanvasHookState = { ...initialState, paused: false };
    state = processMessage(state, { type: 'thinking_delta', text: 'Trying...', iteration: 1 });
    state = processMessage(state, { type: 'error', message: 'Something failed', details: '' });

    expect(deriveAgentStatus(state)).toBe('error');
  });

  it('paused status takes precedence over everything', () => {
    let state: CanvasHookState = {
      ...initialState,
      paused: true,
      pendingStrokes: { count: 1, batchId: 1, pieceNumber: 0 },
    };
    state = processMessage(state, { type: 'thinking_delta', text: 'Thinking', iteration: 1 });

    expect(deriveAgentStatus(state)).toBe('paused');
  });
});
