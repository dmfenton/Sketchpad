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
export type AgentStatus = 'idle' | 'thinking' | 'drawing' | 'paused';

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

export type ServerMessage =
  | PenMessage
  | StrokeCompleteMessage
  | ThinkingMessage
  | StatusMessage
  | ClearMessage
  | NewCanvasMessage
  | GalleryUpdateMessage
  | LoadCanvasMessage
  | InitMessage
  | PieceCountMessage;

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

export interface ClientNewCanvasMessage {
  type: 'new_canvas';
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
export type AgentMessageType = 'thinking' | 'status' | 'error' | 'piece_complete';

export interface AgentMessage {
  id: string;
  type: AgentMessageType;
  text: string;
  timestamp: number;
}

// Canvas dimensions
export const CANVAS_WIDTH = 800;
export const CANVAS_HEIGHT = 600;
export const CANVAS_ASPECT_RATIO = CANVAS_WIDTH / CANVAS_HEIGHT;
