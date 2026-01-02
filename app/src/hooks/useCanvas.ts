/**
 * Canvas state and touch handling hook.
 */

import { useCallback, useReducer } from 'react';

import type { AgentMessage, AgentStatus, Path, Point, ServerMessage } from '../types';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../types';

let messageIdCounter = 0;
const generateMessageId = () => `msg_${++messageIdCounter}_${Date.now()}`;

export interface CanvasHookState {
  strokes: Path[];
  currentStroke: Point[];
  penPosition: Point | null;
  penDown: boolean;
  agentStatus: AgentStatus;
  thinking: string;
  messages: AgentMessage[];
  pieceCount: number;
  drawingEnabled: boolean;
}

type CanvasAction =
  | { type: 'ADD_STROKE'; path: Path }
  | { type: 'SET_STROKES'; strokes: Path[] }
  | { type: 'CLEAR' }
  | { type: 'START_STROKE'; point: Point }
  | { type: 'ADD_POINT'; point: Point }
  | { type: 'END_STROKE' }
  | { type: 'SET_PEN'; x: number; y: number; down: boolean }
  | { type: 'SET_STATUS'; status: AgentStatus }
  | { type: 'SET_THINKING'; text: string }
  | { type: 'ADD_MESSAGE'; message: AgentMessage }
  | { type: 'CLEAR_MESSAGES' }
  | { type: 'TOGGLE_DRAWING' }
  | { type: 'SET_PIECE_COUNT'; count: number };

const initialState: CanvasHookState = {
  strokes: [],
  currentStroke: [],
  penPosition: null,
  penDown: false,
  agentStatus: 'idle',
  thinking: '',
  messages: [],
  pieceCount: 0,
  drawingEnabled: false,
};

function canvasReducer(state: CanvasHookState, action: CanvasAction): CanvasHookState {
  switch (action.type) {
    case 'ADD_STROKE':
      return { ...state, strokes: [...state.strokes, action.path] };

    case 'SET_STROKES':
      return { ...state, strokes: action.strokes };

    case 'CLEAR':
      return { ...state, strokes: [], currentStroke: [] };

    case 'START_STROKE':
      return { ...state, currentStroke: [action.point] };

    case 'ADD_POINT':
      return { ...state, currentStroke: [...state.currentStroke, action.point] };

    case 'END_STROKE':
      return { ...state, currentStroke: [] };

    case 'SET_PEN':
      return {
        ...state,
        penPosition: { x: action.x, y: action.y },
        penDown: action.down,
      };

    case 'SET_STATUS':
      return { ...state, agentStatus: action.status };

    case 'SET_THINKING':
      return { ...state, thinking: action.text };

    case 'ADD_MESSAGE':
      return { ...state, messages: [...state.messages, action.message] };

    case 'CLEAR_MESSAGES':
      return { ...state, messages: [] };

    case 'TOGGLE_DRAWING':
      return { ...state, drawingEnabled: !state.drawingEnabled };

    case 'SET_PIECE_COUNT':
      return { ...state, pieceCount: action.count };

    default:
      return state;
  }
}

export interface UseCanvasReturn {
  state: CanvasHookState;
  handleMessage: (message: ServerMessage) => void;
  startStroke: (x: number, y: number) => void;
  addPoint: (x: number, y: number) => void;
  endStroke: () => Path | null;
  toggleDrawing: () => void;
  clear: () => void;
  clearMessages: () => void;
}

export function useCanvas(): UseCanvasReturn {
  const [state, dispatch] = useReducer(canvasReducer, initialState);

  const handleMessage = useCallback((message: ServerMessage) => {
    switch (message.type) {
      case 'pen':
        dispatch({ type: 'SET_PEN', x: message.x, y: message.y, down: message.down });
        break;

      case 'stroke_complete':
        dispatch({ type: 'ADD_STROKE', path: message.path });
        break;

      case 'thinking':
        dispatch({ type: 'SET_THINKING', text: message.text });
        // Add as a message to the stream
        dispatch({
          type: 'ADD_MESSAGE',
          message: {
            id: generateMessageId(),
            type: 'thinking',
            text: message.text,
            timestamp: Date.now(),
          },
        });
        break;

      case 'status':
        dispatch({ type: 'SET_STATUS', status: message.status });
        // Add status changes as messages (except idle which is too frequent)
        if (message.status !== 'idle') {
          dispatch({
            type: 'ADD_MESSAGE',
            message: {
              id: generateMessageId(),
              type: 'status',
              text: message.status === 'thinking' ? 'Thinking...' : 'Drawing...',
              timestamp: Date.now(),
            },
          });
        }
        break;

      case 'clear':
        dispatch({ type: 'CLEAR' });
        dispatch({ type: 'CLEAR_MESSAGES' });
        break;
    }
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
    handleMessage,
    startStroke,
    addPoint,
    endStroke,
    toggleDrawing,
    clear,
    clearMessages,
  };
}

/**
 * Convert screen coordinates to canvas coordinates.
 */
export function screenToCanvas(
  screenX: number,
  screenY: number,
  containerWidth: number,
  containerHeight: number
): Point {
  const scaleX = CANVAS_WIDTH / containerWidth;
  const scaleY = CANVAS_HEIGHT / containerHeight;

  return {
    x: screenX * scaleX,
    y: screenY * scaleY,
  };
}
