/**
 * Canvas state reducer - platform-agnostic state machine.
 */

import type {
  AgentMessage,
  AgentStatus,
  DrawingStyleConfig,
  DrawingStyleType,
  Path,
  Point,
  SavedCanvas,
} from '../types';
import { PLOTTER_STYLE, getStyleConfig } from '../types';
import { boundedPush } from '../utils';

// Max messages to keep in state to prevent memory issues
export const MAX_MESSAGES = 50;

// Special ID for the live streaming message
export const LIVE_MESSAGE_ID = 'live_thinking';

export interface PendingStrokesInfo {
  count: number;
  batchId: number;
}

// Style for the agent's in-progress stroke
export interface PendingStrokeStyle {
  color?: string;
  stroke_width?: number;
  opacity?: number;
}

export interface CanvasHookState {
  strokes: Path[];
  currentStroke: Point[];
  agentStroke: Point[]; // Agent's in-progress stroke
  agentStrokeStyle: PendingStrokeStyle | null; // Style for the agent's in-progress stroke
  penPosition: Point | null;
  penDown: boolean;
  thinking: string;
  messages: AgentMessage[];
  pieceCount: number;
  viewingPiece: number | null; // Which gallery piece is being viewed (null = current)
  drawingEnabled: boolean;
  gallery: SavedCanvas[];
  paused: boolean;
  currentIteration: number;
  maxIterations: number;
  pendingStrokes: PendingStrokesInfo | null; // Strokes ready to be fetched
  serverStatus: string | null; // Status reported by server (fallback for derivation)
  drawingStyle: DrawingStyleType; // Current drawing style
  styleConfig: DrawingStyleConfig; // Full style configuration
}

/**
 * Check if any event is still in-progress (started but not completed).
 *
 * This is the general gate for drawing - we don't start rendering
 * until all preceding events have been shown to the user.
 * Add new event types here as needed.
 */
export function hasInProgressEvents(messages: AgentMessage[]): boolean {
  // Build a set of completed tool executions (by tool_name + iteration)
  const completedTools = new Set<string>();
  for (const m of messages) {
    if (m.type === 'code_execution' && m.metadata?.return_code !== undefined) {
      const key = `${m.metadata.tool_name ?? 'unknown'}_${m.iteration ?? 0}`;
      completedTools.add(key);
    }
  }

  return messages.some((m) => {
    // Live thinking = still streaming, not yet finalized
    if (m.id === LIVE_MESSAGE_ID) return true;

    // Code execution without return_code = check if completed message exists
    if (m.type === 'code_execution' && m.metadata?.return_code === undefined) {
      const key = `${m.metadata?.tool_name ?? 'unknown'}_${m.iteration ?? 0}`;
      // If we have a completed message for this tool+iteration, it's not in-progress
      if (completedTools.has(key)) return false;
      return true;
    }

    // Add new in-progress event types here as the protocol evolves

    return false;
  });
}

/**
 * Derive agent status from messages and state.
 * Status is computed from messages, with serverStatus as a fallback
 * for states where messages haven't arrived yet.
 */
export function deriveAgentStatus(state: CanvasHookState): AgentStatus {
  // Paused overrides everything
  if (state.paused) return 'paused';

  // Check for error in last message
  const lastMessage = state.messages[state.messages.length - 1];
  if (lastMessage?.type === 'error') return 'error';

  // Live message = actively thinking
  const hasLiveMessage = state.messages.some((m) => m.id === LIVE_MESSAGE_ID);
  if (hasLiveMessage) return 'thinking';

  // Any in-progress event blocks drawing and shows as executing
  if (hasInProgressEvents(state.messages)) return 'executing';

  // Pending strokes = drawing phase (only when no in-progress events)
  if (state.pendingStrokes !== null) return 'drawing';

  // Fallback to server-reported status (for 'thinking' before thinking_delta arrives)
  if (state.serverStatus === 'thinking') return 'thinking';

  return 'idle';
}

export type CanvasAction =
  | { type: 'ADD_STROKE'; path: Path }
  | { type: 'SET_STROKES'; strokes: Path[] }
  | { type: 'CLEAR' }
  | { type: 'START_STROKE'; point: Point }
  | { type: 'ADD_POINT'; point: Point }
  | { type: 'END_STROKE' }
  | {
      type: 'SET_PEN';
      x: number;
      y: number;
      down: boolean;
      color?: string;
      stroke_width?: number;
      opacity?: number;
    }
  | { type: 'SET_THINKING'; text: string }
  | { type: 'APPEND_THINKING'; text: string }
  | { type: 'APPEND_LIVE_MESSAGE'; text: string }
  | { type: 'FINALIZE_LIVE_MESSAGE' }
  | { type: 'ADD_MESSAGE'; message: AgentMessage }
  | { type: 'CLEAR_MESSAGES' }
  | { type: 'TOGGLE_DRAWING' }
  | { type: 'SET_PIECE_COUNT'; count: number }
  | { type: 'SET_GALLERY'; canvases: SavedCanvas[] }
  | {
      type: 'LOAD_CANVAS';
      strokes: Path[];
      pieceNumber: number;
      drawingStyle?: DrawingStyleType;
      styleConfig?: DrawingStyleConfig;
    }
  | {
      type: 'INIT';
      strokes: Path[];
      gallery: SavedCanvas[];
      pieceCount: number;
      paused: boolean;
      drawingStyle?: DrawingStyleType;
      styleConfig?: DrawingStyleConfig;
    }
  | { type: 'SET_PAUSED'; paused: boolean }
  | { type: 'SET_ITERATION'; current: number; max: number }
  | { type: 'RESET_TURN' }
  | { type: 'STROKES_READY'; count: number; batchId: number }
  | { type: 'CLEAR_PENDING_STROKES' }
  | { type: 'SET_SERVER_STATUS'; status: string | null }
  | { type: 'SET_STYLE'; drawingStyle: DrawingStyleType; styleConfig: DrawingStyleConfig };

export const initialState: CanvasHookState = {
  strokes: [],
  currentStroke: [],
  agentStroke: [],
  agentStrokeStyle: null,
  penPosition: null,
  penDown: false,
  thinking: '',
  messages: [],
  pieceCount: 0,
  viewingPiece: null,
  drawingEnabled: false,
  gallery: [],
  paused: true, // Start paused - status derived from this + messages
  currentIteration: 0,
  maxIterations: 5,
  pendingStrokes: null,
  serverStatus: null,
  drawingStyle: 'plotter',
  styleConfig: PLOTTER_STYLE,
};

export function canvasReducer(state: CanvasHookState, action: CanvasAction): CanvasHookState {
  switch (action.type) {
    case 'ADD_STROKE':
      // Clear agentStroke and agentStrokeStyle when stroke is finalized
      return { ...state, strokes: [...state.strokes, action.path], agentStroke: [], agentStrokeStyle: null };

    case 'SET_STROKES':
      return { ...state, strokes: action.strokes };

    case 'CLEAR':
      return { ...state, strokes: [], currentStroke: [], agentStroke: [], agentStrokeStyle: null, viewingPiece: null };

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
      // Capture style when pen first goes down (start of stroke)
      // If style properties are provided, this is the start of a new stroke
      const hasStyleInfo =
        action.color !== undefined ||
        action.stroke_width !== undefined ||
        action.opacity !== undefined;
      const newAgentStrokeStyle =
        action.down && hasStyleInfo
          ? {
              color: action.color,
              stroke_width: action.stroke_width,
              opacity: action.opacity,
            }
          : state.agentStrokeStyle;
      return {
        ...state,
        penPosition: newPoint,
        penDown: action.down,
        agentStroke: newAgentStroke,
        agentStrokeStyle: newAgentStrokeStyle,
      };
    }

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

    case 'LOAD_CANVAS': {
      // If loading a canvas with a different style, update the style config
      const loadedStyle = action.drawingStyle || state.drawingStyle;
      // Use provided styleConfig if available, otherwise compute from style type
      const loadedStyleConfig =
        action.styleConfig ||
        (action.drawingStyle ? getStyleConfig(action.drawingStyle) : state.styleConfig);
      return {
        ...state,
        strokes: action.strokes,
        currentStroke: [],
        agentStroke: [], // Clear agent stroke to prevent stale drawing
        agentStrokeStyle: null,
        viewingPiece: action.pieceNumber,
        drawingStyle: loadedStyle,
        styleConfig: loadedStyleConfig,
      };
    }

    case 'INIT': {
      // Use provided style or default to plotter
      const initStyle = action.drawingStyle || 'plotter';
      const initStyleConfig = action.styleConfig || getStyleConfig(initStyle);
      return {
        ...state,
        strokes: action.strokes,
        gallery: action.gallery,
        pieceCount: action.pieceCount,
        paused: action.paused,
        viewingPiece: null, // Init shows current canvas
        drawingStyle: initStyle,
        styleConfig: initStyleConfig,
      };
    }

    case 'SET_STYLE':
      return {
        ...state,
        drawingStyle: action.drawingStyle,
        styleConfig: action.styleConfig,
      };

    case 'SET_PAUSED':
      return { ...state, paused: action.paused };

    case 'SET_ITERATION':
      return { ...state, currentIteration: action.current, maxIterations: action.max };

    case 'RESET_TURN':
      return { ...state, thinking: '', currentIteration: 0 };

    case 'STROKES_READY':
      return {
        ...state,
        pendingStrokes: { count: action.count, batchId: action.batchId },
      };

    case 'CLEAR_PENDING_STROKES':
      return { ...state, pendingStrokes: null };

    case 'SET_SERVER_STATUS':
      return { ...state, serverStatus: action.status };

    default:
      return state;
  }
}
