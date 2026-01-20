/**
 * Canvas state hook for web.
 */

import { useCallback, useReducer } from 'react';
import type { Path, ServerMessage } from '@code-monet/shared';
import {
  canvasReducer,
  initialState,
  routeMessage,
  type CanvasAction,
  type CanvasHookState,
} from '@code-monet/shared';

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

export function useCanvas(): UseCanvasReturn {
  const [state, dispatch] = useReducer(canvasReducer, initialState);

  const handleMessage = useCallback((message: ServerMessage) => {
    // Debug logging for all messages
    if (message.type === 'thinking_delta') {
      const delta = message as { text: string };
      console.log(`[WS] thinking_delta: "${delta.text.slice(0, 50)}..." (len=${delta.text.length})`);
    } else if (message.type === 'agent_strokes_ready') {
      console.log('[WS] agent_strokes_ready:', message);
    } else if (message.type === 'code_execution') {
      const exec = message as { status: string; tool_name?: string };
      console.log(`[WS] code_execution: ${exec.tool_name} status=${exec.status}`);
    } else {
      console.log('[WS] message:', message.type);
    }
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
