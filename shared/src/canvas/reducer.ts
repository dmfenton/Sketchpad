/**
 * Canvas state reducer - platform-agnostic state machine.
 */

import type { AgentMessage, AgentStatus, Path, Point, SavedCanvas } from '../types';
import { boundedPush } from '../utils';

// Max messages to keep in state to prevent memory issues
export const MAX_MESSAGES = 50;

// Special ID for the live streaming message
export const LIVE_MESSAGE_ID = 'live_thinking';

export interface CanvasHookState {
  strokes: Path[];
  currentStroke: Point[];
  agentStroke: Point[]; // Agent's in-progress stroke
  penPosition: Point | null;
  penDown: boolean;
  agentStatus: AgentStatus;
  thinking: string;
  messages: AgentMessage[];
  pieceCount: number;
  viewingPiece: number | null; // Which gallery piece is being viewed (null = current)
  drawingEnabled: boolean;
  gallery: SavedCanvas[];
  paused: boolean;
  currentIteration: number;
  maxIterations: number;
}

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
  | { type: 'CLEAR_MESSAGES' }
  | { type: 'TOGGLE_DRAWING' }
  | { type: 'SET_PIECE_COUNT'; count: number }
  | { type: 'SET_GALLERY'; canvases: SavedCanvas[] }
  | { type: 'LOAD_CANVAS'; strokes: Path[]; pieceNumber: number }
  | {
      type: 'INIT';
      strokes: Path[];
      gallery: SavedCanvas[];
      status: AgentStatus;
      pieceCount: number;
      paused: boolean;
    }
  | { type: 'SET_PAUSED'; paused: boolean }
  | { type: 'SET_ITERATION'; current: number; max: number }
  | { type: 'RESET_TURN' };

export const initialState: CanvasHookState = {
  strokes: [],
  currentStroke: [],
  agentStroke: [],
  penPosition: null,
  penDown: false,
  agentStatus: 'paused', // Start paused
  thinking: '',
  messages: [],
  pieceCount: 0,
  viewingPiece: null,
  drawingEnabled: false,
  gallery: [],
  paused: true, // Start paused
  currentIteration: 0,
  maxIterations: 5,
};

export function canvasReducer(state: CanvasHookState, action: CanvasAction): CanvasHookState {
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
      const newAgentStroke = action.down ? [...state.agentStroke, newPoint] : state.agentStroke;
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
      const existingIndex = state.messages.findIndex((m) => m.id === LIVE_MESSAGE_ID);
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
      const liveIndex = state.messages.findIndex((m) => m.id === LIVE_MESSAGE_ID);
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
            messages: state.messages.filter((m) => m.id !== LIVE_MESSAGE_ID),
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

    case 'CLEAR_MESSAGES':
      return { ...state, messages: [] };

    case 'TOGGLE_DRAWING':
      return { ...state, drawingEnabled: !state.drawingEnabled };

    case 'SET_PIECE_COUNT':
      return { ...state, pieceCount: action.count };

    case 'SET_GALLERY':
      return { ...state, gallery: action.canvases };

    case 'LOAD_CANVAS':
      return {
        ...state,
        strokes: action.strokes,
        currentStroke: [],
        viewingPiece: action.pieceNumber,
      };

    case 'INIT':
      return {
        ...state,
        strokes: action.strokes,
        gallery: action.gallery,
        agentStatus: action.status,
        pieceCount: action.pieceCount,
        paused: action.paused,
        viewingPiece: null, // Init shows current canvas
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
