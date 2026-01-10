/**
 * Canvas state and touch handling hook.
 */

import { useCallback, useReducer } from 'react';

import type { AgentMessage, AgentStatus, Path, Point, SavedCanvas, ServerMessage } from '../types';
import { boundedPush, routeMessage } from '../utils';

// Max messages to keep in state to prevent memory issues
const MAX_MESSAGES = 50;

// Raw message wrapper to include timestamp
export interface RawMessage {
  timestamp: number;
  data: ServerMessage;
}

export interface CanvasHookState {
  strokes: Path[];
  currentStroke: Point[];
  agentStroke: Point[];  // Agent's in-progress stroke
  penPosition: Point | null;
  penDown: boolean;
  agentStatus: AgentStatus;
  thinking: string;
  messages: AgentMessage[];
  rawMessages: RawMessage[];  // Raw messages from Claude Agent SDK
  pieceCount: number;
  viewingPiece: number | null;  // Which gallery piece is being viewed (null = current)
  drawingEnabled: boolean;
  gallery: SavedCanvas[];
  paused: boolean;
  currentIteration: number;
  maxIterations: number;
}

// Special ID for the live streaming message
export const LIVE_MESSAGE_ID = 'live_thinking';

export type CanvasAction =
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
  | { type: 'APPEND_LIVE_MESSAGE'; text: string }
  | { type: 'FINALIZE_LIVE_MESSAGE' }
  | { type: 'ADD_MESSAGE'; message: AgentMessage }
  | { type: 'ADD_RAW_MESSAGE'; message: ServerMessage }
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
  agentStroke: [],
  penPosition: null,
  penDown: false,
  agentStatus: 'paused',  // Start paused
  thinking: '',
  messages: [],
  rawMessages: [],
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
      // Clear agentStroke when stroke is finalized
      return { ...state, strokes: [...state.strokes, action.path], agentStroke: [] };

    case 'SET_STROKES':
      return { ...state, strokes: action.strokes };

    case 'CLEAR':
      return { ...state, strokes: [], currentStroke: [], agentStroke: [], viewingPiece: null };

    case 'START_STROKE':
      return { ...state, currentStroke: [action.point] };

    case 'ADD_POINT':
      return { ...state, currentStroke: [...state.currentStroke, action.point] };

    case 'END_STROKE':
      return { ...state, currentStroke: [] };

    case 'SET_PEN': {
      const newPoint = { x: action.x, y: action.y };
      // Accumulate points when pen is down for live stroke preview
      // Don't clear on pen up - wait for ADD_STROKE to clear
      const newAgentStroke = action.down
        ? [...state.agentStroke, newPoint]
        : state.agentStroke;
      return {
        ...state,
        penPosition: newPoint,
        penDown: action.down,
        agentStroke: newAgentStroke,
      };
    }

    case 'SET_STATUS':
      return { ...state, agentStatus: action.status };

    case 'SET_THINKING':
      return { ...state, thinking: action.text };

    case 'APPEND_THINKING':
      return { ...state, thinking: state.thinking + action.text };

    case 'APPEND_LIVE_MESSAGE': {
      const existingIndex = state.messages.findIndex(m => m.id === LIVE_MESSAGE_ID);
      const existing = state.messages[existingIndex];
      if (existingIndex >= 0 && existing) {
        // Update existing live message
        const updated = [...state.messages];
        updated[existingIndex] = {
          id: existing.id,
          type: existing.type,
          text: existing.text + action.text,
          timestamp: Date.now(),
        };
        return { ...state, messages: updated };
      } else {
        // Create new live message
        const liveMessage: AgentMessage = {
          id: LIVE_MESSAGE_ID,
          type: 'thinking',
          text: action.text,
          timestamp: Date.now(),
        };
        return { ...state, messages: [...state.messages, liveMessage] };
      }
    }

    case 'FINALIZE_LIVE_MESSAGE': {
      // Convert live message to a permanent message (with unique ID)
      const liveIndex = state.messages.findIndex(m => m.id === LIVE_MESSAGE_ID);
      if (liveIndex >= 0) {
        const liveMsg = state.messages[liveIndex];
        if (liveMsg && liveMsg.text.trim()) {
          // Replace with permanent message
          const updated = [...state.messages];
          updated[liveIndex] = {
            ...liveMsg,
            id: `thinking_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          };
          return { ...state, messages: updated };
        } else {
          // Empty message, just remove it
          return {
            ...state,
            messages: state.messages.filter(m => m.id !== LIVE_MESSAGE_ID),
          };
        }
      }
      return state;
    }

    case 'ADD_MESSAGE':
      return {
        ...state,
        messages: boundedPush(state.messages, action.message, MAX_MESSAGES),
      };

    case 'ADD_RAW_MESSAGE':
      return {
        ...state,
        rawMessages: boundedPush(
          state.rawMessages,
          { timestamp: Date.now(), data: action.message },
          MAX_MESSAGES
        ),
      };

    case 'CLEAR_MESSAGES':
      return { ...state, messages: [], rawMessages: [] };

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
    // Store raw message for debug view
    dispatch({ type: 'ADD_RAW_MESSAGE', message });
    // Process message through handlers
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
