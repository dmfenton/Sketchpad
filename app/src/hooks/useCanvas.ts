/**
 * Canvas state and touch handling hook.
 * Uses shared reducer from @code-monet/shared.
 */

import { useCallback, useReducer, useRef } from 'react';

import type { CanvasAction, Path, ServerMessage } from '@code-monet/shared';
import {
  canvasReducer,
  initialState,
  LIVE_MESSAGE_ID as LIVE_ID,
  routeMessage,
  type CanvasHookState,
} from '@code-monet/shared';

import { debugReducer, debugThinking } from '../utils/debugLog';

// Re-export types and constants from shared for backwards compatibility
export { LIVE_MESSAGE_ID, type CanvasAction, type CanvasHookState } from '@code-monet/shared';

export interface UseCanvasReturn {
  state: CanvasHookState;
  dispatch: React.Dispatch<CanvasAction>;
  handleMessage: (message: ServerMessage) => void;
  startStroke: (x: number, y: number) => void;
  addPoint: (x: number, y: number) => void;
  endStroke: () => Path | null;
  toggleDrawing: () => void;
  clear: () => void;
  clearMessages: () => void;
  setPaused: (paused: boolean) => void;
}

// Logging wrapper for reducer
function loggingReducer(state: CanvasHookState, action: CanvasAction): CanvasHookState {
  const newState = canvasReducer(state, action);

  // Log relevant state changes
  if (action.type === 'APPEND_LIVE_MESSAGE') {
    const liveMsg = newState.messages.find((m) => m.id === LIVE_ID);
    debugThinking(
      `APPEND_LIVE_MESSAGE: live msg len=${liveMsg?.text.length ?? 0}, total msgs=${newState.messages.length}`
    );
  } else if (action.type === 'FINALIZE_LIVE_MESSAGE') {
    debugThinking(`FINALIZE_LIVE_MESSAGE: total msgs=${newState.messages.length}`);
  } else if (action.type === 'STROKES_READY') {
    debugReducer(
      `STROKES_READY: count=${action.count} batch=${action.batchId} piece=${action.pieceNumber}`
    );
  } else if (action.type === 'ADD_STROKE') {
    debugReducer(`ADD_STROKE: total strokes=${newState.strokes.length}`);
  } else if (action.type === 'SET_PEN') {
    // Only log pen down transitions to reduce noise
    if (action.down && !state.penDown) {
      debugReducer(`SET_PEN: pen DOWN at (${action.x.toFixed(0)}, ${action.y.toFixed(0)})`);
    } else if (!action.down && state.penDown) {
      debugReducer(`SET_PEN: pen UP, agentStroke points=${state.agentStroke.length}`);
    }
  } else if (action.type !== 'ADD_POINT' && action.type !== 'APPEND_THINKING') {
    // Log all other actions except noisy ones
    debugReducer(`${action.type}`);
  }

  return newState;
}

export function useCanvas(): UseCanvasReturn {
  const [state, dispatch] = useReducer(loggingReducer, initialState);
  const prevLiveMsgLenRef = useRef(0);

  // Track live message changes for debugging
  const liveMsg = state.messages.find((m) => m.id === LIVE_ID);
  if (liveMsg && liveMsg.text.length !== prevLiveMsgLenRef.current) {
    debugThinking(
      `Live msg updated: ${prevLiveMsgLenRef.current} -> ${liveMsg.text.length} chars`
    );
    prevLiveMsgLenRef.current = liveMsg.text.length;
  } else if (!liveMsg && prevLiveMsgLenRef.current > 0) {
    debugThinking(`Live msg cleared (was ${prevLiveMsgLenRef.current} chars)`);
    prevLiveMsgLenRef.current = 0;
  }

  const handleMessage = useCallback((message: ServerMessage) => {
    routeMessage(message, dispatch);
  }, []);

  const setPaused = useCallback((paused: boolean) => {
    dispatch({ type: 'SET_PAUSED', paused });
  }, []);

  const startStroke = useCallback((x: number, y: number) => {
    dispatch({ type: 'START_STROKE', point: { x, y } });
  }, []);

  const addPoint = useCallback((x: number, y: number) => {
    dispatch({ type: 'ADD_POINT', point: { x, y } });
  }, []);

  const endStroke = useCallback((): Path | null => {
    if (state.currentStroke.length < 2) {
      dispatch({ type: 'END_STROKE' });
      return null;
    }

    const path: Path = {
      type: 'polyline',
      points: state.currentStroke,
    };

    dispatch({ type: 'ADD_STROKE', path });
    dispatch({ type: 'END_STROKE' });

    return path;
  }, [state.currentStroke]);

  const toggleDrawing = useCallback(() => {
    dispatch({ type: 'TOGGLE_DRAWING' });
  }, []);

  const clear = useCallback(() => {
    dispatch({ type: 'CLEAR' });
  }, []);

  const clearMessages = useCallback(() => {
    dispatch({ type: 'CLEAR_MESSAGES' });
  }, []);

  return {
    state,
    dispatch,
    handleMessage,
    startStroke,
    addPoint,
    endStroke,
    toggleDrawing,
    clear,
    clearMessages,
    setPaused,
  };
}

// Re-export screenToCanvas from utils for backwards compatibility
export { screenToCanvas } from '../utils/canvas';
