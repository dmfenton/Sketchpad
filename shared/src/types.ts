/**
 * Shared type definitions for the Drawing Agent.
 * Platform-agnostic - used by both React Native and web.
 */

// Path types
export interface Point {
  x: number;
  y: number;
}

export type PathType = 'line' | 'quadratic' | 'cubic' | 'polyline' | 'svg';

export interface Path {
  type: PathType;
  points: Point[];
  d?: string; // SVG path d-string (for type='svg')
}

// Agent status
export type AgentStatus = 'idle' | 'thinking' | 'executing' | 'drawing' | 'paused' | 'error';

// Shared status labels for consistent UI across components
export const STATUS_LABELS: Record<AgentStatus, string> = {
  idle: 'Ready',
  thinking: 'Thinking',
  executing: 'Running Code',
  drawing: 'Drawing',
  paused: 'Paused',
  error: 'Error',
};

// Animation constants
export const PULSE_DURATION_MS = 800;

// Application state
export interface CanvasState {
  width: number;
  height: number;
  strokes: Path[];
}

export interface ExecutionState {
  active: boolean;
  penX: number;
  penY: number;
  penDown: boolean;
}

export interface AgentState {
  status: AgentStatus;
  monologue: string;
  pieceCount: number;
}

export interface AppState {
  canvas: CanvasState;
  execution: ExecutionState;
  agent: AgentState;
}

// WebSocket messages - Server to Client
export interface PenMessage {
  type: 'pen';
  x: number;
  y: number;
  down: boolean;
}

export interface StrokeCompleteMessage {
  type: 'stroke_complete';
  path: Path;
}

export interface ThinkingMessage {
  type: 'thinking';
  text: string;
}

export interface StatusMessage {
  type: 'status';
  status: AgentStatus;
}

export interface ClearMessage {
  type: 'clear';
}

export interface SavedCanvas {
  id: string;
  stroke_count: number;
  created_at: string;
  piece_number: number;
}

export interface NewCanvasMessage {
  type: 'new_canvas';
  saved_id: string | null;
}

export interface GalleryUpdateMessage {
  type: 'gallery_update';
  canvases: SavedCanvas[];
}

export interface LoadCanvasMessage {
  type: 'load_canvas';
  strokes: Path[];
  piece_number: number;
}

export interface InitMessage {
  type: 'init';
  strokes: Path[];
  gallery: SavedCanvas[];
  status: AgentStatus;
  paused: boolean;
  piece_count: number;
  monologue: string;
}

export interface PieceCountMessage {
  type: 'piece_count';
  count: number;
}

// New message types for real-time status streaming
export interface ThinkingDeltaMessage {
  type: 'thinking_delta';
  text: string; // Only the new text since last message
  iteration: number;
}

export type ToolName = 'draw_paths' | 'generate_svg' | 'view_canvas' | 'mark_piece_done';

export interface CodeExecutionMessage {
  type: 'code_execution';
  status: 'started' | 'completed';
  tool_name?: ToolName | null;
  tool_input?: Record<string, unknown> | null;
  stdout?: string | null;
  stderr?: string | null;
  return_code?: number | null;
  iteration: number;
}

export interface ErrorMessage {
  type: 'error';
  message: string;
  details?: string | null;
}

export interface PieceCompleteMessage {
  type: 'piece_complete';
  piece_number: number; // The piece that was just completed (0-indexed)
  new_piece_count?: number; // The new piece count (for status bar update)
}

export interface IterationMessage {
  type: 'iteration';
  current: number;
  max: number;
}

export interface PausedMessage {
  type: 'paused';
  paused: boolean;
}

export type ServerMessage =
  | PenMessage
  | StrokeCompleteMessage
  | ThinkingMessage
  | ThinkingDeltaMessage
  | StatusMessage
  | ClearMessage
  | NewCanvasMessage
  | GalleryUpdateMessage
  | LoadCanvasMessage
  | InitMessage
  | PieceCountMessage
  | CodeExecutionMessage
  | ErrorMessage
  | PieceCompleteMessage
  | IterationMessage
  | PausedMessage;

// WebSocket messages - Client to Server
export interface ClientStrokeMessage {
  type: 'stroke';
  points: Point[];
}

export interface ClientNudgeMessage {
  type: 'nudge';
  text: string;
}

export interface ClientClearMessage {
  type: 'clear';
}

export interface ClientPauseMessage {
  type: 'pause';
}

export interface ClientResumeMessage {
  type: 'resume';
  direction?: string; // Optional direction/prompt for the agent
}

export interface ClientNewCanvasMessage {
  type: 'new_canvas';
  direction?: string; // Optional direction for the agent
}

export interface ClientLoadCanvasMessage {
  type: 'load_canvas';
  canvas_id: string;
}

export type ClientMessage =
  | ClientStrokeMessage
  | ClientNudgeMessage
  | ClientClearMessage
  | ClientPauseMessage
  | ClientResumeMessage
  | ClientNewCanvasMessage
  | ClientLoadCanvasMessage;

// Agent message types for MessageStream component
export type AgentMessageType =
  | 'thinking'
  | 'thinking_delta'
  | 'error'
  | 'piece_complete'
  | 'code_execution'
  | 'iteration';

export interface AgentMessage {
  id: string;
  type: AgentMessageType;
  text: string;
  timestamp: number;
  iteration?: number; // For iteration-aware messages
  metadata?: {
    tool_name?: ToolName | null;
    tool_input?: Record<string, unknown> | null;
    stdout?: string | null;
    stderr?: string | null;
    return_code?: number | null;
    piece_number?: number;
    current_iteration?: number;
    max_iterations?: number;
  };
}

// Canvas dimensions
export const CANVAS_WIDTH = 800;
export const CANVAS_HEIGHT = 600;
export const CANVAS_ASPECT_RATIO = CANVAS_WIDTH / CANVAS_HEIGHT;
