/**
 * Canvas state hook for web.
 */

import { useCallback, useReducer } from 'react';
import type { Path, ServerMessage } from '@drawing-agent/shared';
import {
  canvasReducer,
  initialState,
  routeMessage,
  type CanvasAction,
  type CanvasHookState,
} from '@drawing-agent/shared';

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
    // Debug logging for stroke-related messages
    if (message.type === 'stroke_complete' || message.type === 'init' || message.type === 'strokes_ready') {
      console.log('[useCanvas] Received:', message.type, message);
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
