/**
 * Type definitions for the Drawing Agent app.
 */

// Path types
export interface Point {
  x: number;
  y: number;
}

export type PathType = 'line' | 'quadratic' | 'cubic' | 'polyline';

export interface Path {
  type: PathType;
  points: Point[];
}

// Agent status
export type AgentStatus = 'idle' | 'thinking' | 'executing' | 'drawing' | 'paused' | 'error';

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

// New message types for real-time status streaming
export interface ThinkingDeltaMessage {
  type: 'thinking_delta';
  text: string; // Only the new text since last message
  iteration: number;
}

export interface CodeExecutionMessage {
  type: 'code_execution';
  status: 'started' | 'completed';
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
  piece_number: number;
}

export interface IterationMessage {
  type: 'iteration';
  current: number;
  max: number;
}

export type ServerMessage =
  | PenMessage
  | StrokeCompleteMessage
  | ThinkingMessage
  | ThinkingDeltaMessage
  | StatusMessage
  | ClearMessage
  | CodeExecutionMessage
  | ErrorMessage
  | PieceCompleteMessage
  | IterationMessage;

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
}

export type ClientMessage =
  | ClientStrokeMessage
  | ClientNudgeMessage
  | ClientClearMessage
  | ClientPauseMessage
  | ClientResumeMessage;

// Agent message types for MessageStream component
export type AgentMessageType =
  | 'thinking'
  | 'thinking_delta'
  | 'status'
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
