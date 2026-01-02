/**
 * Canvas state and touch handling hook.
 */

import { useCallback, useReducer } from 'react';

import type { AgentMessage, AgentStatus, Path, Point, SavedCanvas, ServerMessage } from '../types';
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
  viewingPiece: number | null;  // Which gallery piece is being viewed (null = current)
  drawingEnabled: boolean;
  gallery: SavedCanvas[];
  paused: boolean;
  currentIteration: number;
  maxIterations: number;
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
  | { type: 'APPEND_THINKING'; text: string }
  | { type: 'ADD_MESSAGE'; message: AgentMessage }
  | { type: 'CLEAR_MESSAGES' }
  | { type: 'TOGGLE_DRAWING' }
  | { type: 'SET_PIECE_COUNT'; count: number }
  | { type: 'SET_GALLERY'; canvases: SavedCanvas[] }
  | { type: 'LOAD_CANVAS'; strokes: Path[]; pieceNumber: number }
  | { type: 'INIT'; strokes: Path[]; gallery: SavedCanvas[]; status: AgentStatus; pieceCount: number; paused: boolean }
  | { type: 'SET_PAUSED'; paused: boolean }
  | { type: 'SET_ITERATION'; current: number; max: number }
  | { type: 'RESET_TURN' };

const initialState: CanvasHookState = {
  strokes: [],
  currentStroke: [],
  penPosition: null,
  penDown: false,
  agentStatus: 'paused',  // Start paused
  thinking: '',
  messages: [],
  pieceCount: 0,
  viewingPiece: null,
  drawingEnabled: false,
  gallery: [],
  paused: true,  // Start paused
  currentIteration: 0,
  maxIterations: 5,
};

function canvasReducer(state: CanvasHookState, action: CanvasAction): CanvasHookState {
  switch (action.type) {
    case 'ADD_STROKE':
      return { ...state, strokes: [...state.strokes, action.path] };

    case 'SET_STROKES':
      return { ...state, strokes: action.strokes };

    case 'CLEAR':
      return { ...state, strokes: [], currentStroke: [], viewingPiece: null };

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

    case 'APPEND_THINKING':
      return { ...state, thinking: state.thinking + action.text };

    case 'ADD_MESSAGE': {
      // Limit messages to prevent memory issues
      const MAX_MESSAGES = 50;
      const newMessages = [...state.messages, action.message];
      return {
        ...state,
        messages: newMessages.length > MAX_MESSAGES
          ? newMessages.slice(-MAX_MESSAGES)
          : newMessages,
      };
    }

    case 'CLEAR_MESSAGES':
      return { ...state, messages: [] };

    case 'TOGGLE_DRAWING':
      return { ...state, drawingEnabled: !state.drawingEnabled };

    case 'SET_PIECE_COUNT':
      return { ...state, pieceCount: action.count };

    case 'SET_GALLERY':
      return { ...state, gallery: action.canvases };

    case 'LOAD_CANVAS':
      return { ...state, strokes: action.strokes, currentStroke: [], viewingPiece: action.pieceNumber };

    case 'INIT':
      return {
        ...state,
        strokes: action.strokes,
        gallery: action.gallery,
        agentStatus: action.status,
        pieceCount: action.pieceCount,
        paused: action.paused,
        viewingPiece: null,  // Init shows current canvas
      };

    case 'SET_PAUSED':
      return { ...state, paused: action.paused };

    case 'SET_ITERATION':
      return { ...state, currentIteration: action.current, maxIterations: action.max };

    case 'RESET_TURN':
      return { ...state, thinking: '', currentIteration: 0 };

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
  setPaused: (paused: boolean) => void;
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
        // Legacy full-text thinking message (for backwards compatibility)
        dispatch({ type: 'SET_THINKING', text: message.text });
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

      case 'thinking_delta':
        // Incremental thinking update (new streaming format)
        dispatch({ type: 'APPEND_THINKING', text: message.text });
        // Don't add individual deltas as messages - they'd flood the stream
        // The accumulated thinking is shown in a separate UI element
        break;

      case 'status':
        dispatch({ type: 'SET_STATUS', status: message.status });
        // Reset thinking when starting a new turn
        if (message.status === 'thinking') {
          dispatch({ type: 'RESET_TURN' });
        }
        // Add status changes as messages (except idle which is too frequent)
        if (message.status !== 'idle') {
          const statusText: Record<string, string> = {
            thinking: 'Thinking...',
            executing: 'Running code...',
            drawing: 'Drawing...',
            paused: 'Paused',
            error: 'Error occurred',
          };
          dispatch({
            type: 'ADD_MESSAGE',
            message: {
              id: generateMessageId(),
              type: 'status',
              text: statusText[message.status] || message.status,
              timestamp: Date.now(),
            },
          });
        }
        break;

      case 'iteration':
        dispatch({ type: 'SET_ITERATION', current: message.current, max: message.max });
        dispatch({
          type: 'ADD_MESSAGE',
          message: {
            id: generateMessageId(),
            type: 'iteration',
            text: `Iteration ${message.current}/${message.max}`,
            timestamp: Date.now(),
            iteration: message.current,
            metadata: {
              current_iteration: message.current,
              max_iterations: message.max,
            },
          },
        });
        break;

      case 'code_execution':
        if (message.status === 'started') {
          dispatch({
            type: 'ADD_MESSAGE',
            message: {
              id: generateMessageId(),
              type: 'code_execution',
              text: 'Executing code...',
              timestamp: Date.now(),
              iteration: message.iteration,
            },
          });
        } else if (message.status === 'completed') {
          dispatch({
            type: 'ADD_MESSAGE',
            message: {
              id: generateMessageId(),
              type: 'code_execution',
              text: message.return_code === 0 ? 'Code completed' : `Code failed (exit ${message.return_code})`,
              timestamp: Date.now(),
              iteration: message.iteration,
              metadata: {
                stdout: message.stdout,
                stderr: message.stderr,
                return_code: message.return_code,
              },
            },
          });
        }
        break;

      case 'error':
        dispatch({
          type: 'ADD_MESSAGE',
          message: {
            id: generateMessageId(),
            type: 'error',
            text: message.message,
            timestamp: Date.now(),
            metadata: {
              stderr: message.details,
            },
          },
        });
        break;

      case 'piece_complete':
        dispatch({ type: 'SET_PIECE_COUNT', count: message.piece_number });
        dispatch({
          type: 'ADD_MESSAGE',
          message: {
            id: generateMessageId(),
            type: 'piece_complete',
            text: `Piece #${message.piece_number} complete!`,
            timestamp: Date.now(),
            metadata: {
              piece_number: message.piece_number,
            },
          },
        });
        break;

      case 'clear':
        dispatch({ type: 'CLEAR' });
        dispatch({ type: 'CLEAR_MESSAGES' });
        break;

      case 'new_canvas':
        dispatch({ type: 'CLEAR' });
        dispatch({ type: 'CLEAR_MESSAGES' });
        break;

      case 'gallery_update':
        dispatch({ type: 'SET_GALLERY', canvases: message.canvases });
        break;

      case 'load_canvas':
        dispatch({ type: 'LOAD_CANVAS', strokes: message.strokes, pieceNumber: message.piece_number });
        break;

      case 'init':
        dispatch({
          type: 'INIT',
          strokes: message.strokes,
          gallery: message.gallery,
          status: message.status,
          pieceCount: message.piece_count,
          paused: message.paused,
        });
        // Add previous monologue as a message if it exists
        if (message.monologue) {
          dispatch({
            type: 'ADD_MESSAGE',
            message: {
              id: generateMessageId(),
              type: 'thinking',
              text: message.monologue,
              timestamp: Date.now(),
            },
          });
        }
        break;

      case 'piece_count':
        dispatch({ type: 'SET_PIECE_COUNT', count: message.count });
        break;
    }
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
