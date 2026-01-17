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

// Drawing style types
export type DrawingStyleType = 'plotter' | 'paint';

export interface StrokeStyle {
  color: string; // Hex color
  stroke_width: number; // Stroke width in canvas units
  opacity: number; // 0-1 alpha value
  stroke_linecap: 'round' | 'butt' | 'square';
  stroke_linejoin: 'round' | 'miter' | 'bevel';
}

export interface DrawingStyleConfig {
  type: DrawingStyleType;
  name: string;
  description: string;
  agent_stroke: StrokeStyle;
  human_stroke: StrokeStyle;
  supports_color: boolean;
  supports_variable_width: boolean;
  supports_opacity: boolean;
  color_palette: string[] | null;
}

// Pre-defined style configurations (mirrors backend)
export const PLOTTER_STYLE: DrawingStyleConfig = {
  type: 'plotter',
  name: 'Plotter',
  description: 'Monochrome pen plotter style with crisp black lines',
  agent_stroke: {
    color: '#1a1a2e',
    stroke_width: 2.5,
    opacity: 1.0,
    stroke_linecap: 'round',
    stroke_linejoin: 'round',
  },
  human_stroke: {
    color: '#0066CC',
    stroke_width: 2.5,
    opacity: 1.0,
    stroke_linecap: 'round',
    stroke_linejoin: 'round',
  },
  supports_color: false,
  supports_variable_width: false,
  supports_opacity: false,
  color_palette: null,
};

export const PAINT_STYLE: DrawingStyleConfig = {
  type: 'paint',
  name: 'Paint',
  description: 'Full color painting style with expressive brush strokes',
  agent_stroke: {
    color: '#1a1a2e',
    stroke_width: 8.0, // Thicker for brush effect
    opacity: 0.85,
    stroke_linecap: 'round',
    stroke_linejoin: 'round',
  },
  human_stroke: {
    color: '#e94560',
    stroke_width: 8.0, // Thicker for brush effect
    opacity: 0.85,
    stroke_linecap: 'round',
    stroke_linejoin: 'round',
  },
  supports_color: true,
  supports_variable_width: true,
  supports_opacity: true,
  color_palette: [
    '#1a1a2e', // Dark (near black)
    '#e94560', // Rose/crimson
    '#7b68ee', // Violet
    '#4ecdc4', // Teal
    '#ffd93d', // Gold
    '#ff6b6b', // Coral
    '#4ade80', // Green
    '#3b82f6', // Blue
    '#f97316', // Orange
    '#a855f7', // Purple
    '#ffffff', // White
  ],
};

export const DRAWING_STYLES: Record<DrawingStyleType, DrawingStyleConfig> = {
  plotter: PLOTTER_STYLE,
  paint: PAINT_STYLE,
};

export function getStyleConfig(styleType: DrawingStyleType): DrawingStyleConfig {
  return DRAWING_STYLES[styleType];
}

export interface Path {
  type: PathType;
  points: Point[];
  d?: string; // SVG path d-string (for type='svg')
  author?: 'agent' | 'human';
  // Style properties (optional - use style defaults if not set)
  color?: string; // Hex color
  stroke_width?: number; // Stroke width
  opacity?: number; // 0-1 alpha
}

/**
 * Get the effective style for a path, merging with style defaults.
 */
export function getEffectiveStyle(path: Path, styleConfig: DrawingStyleConfig): StrokeStyle {
  const author = path.author || 'agent';
  const defaultStyle = author === 'agent' ? styleConfig.agent_stroke : styleConfig.human_stroke;

  // In plotter mode, always use defaults
  if (styleConfig.type === 'plotter') {
    return defaultStyle;
  }

  // In paint mode, allow overrides
  return {
    color: path.color && styleConfig.supports_color ? path.color : defaultStyle.color,
    stroke_width:
      path.stroke_width && styleConfig.supports_variable_width
        ? path.stroke_width
        : defaultStyle.stroke_width,
    opacity:
      path.opacity !== undefined && styleConfig.supports_opacity
        ? path.opacity
        : defaultStyle.opacity,
    stroke_linecap: defaultStyle.stroke_linecap,
    stroke_linejoin: defaultStyle.stroke_linejoin,
  };
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
  drawingStyle: DrawingStyleType;
}

export interface AgentState {
  status: AgentStatus;
  monologue: string;
  pieceCount: number;
}

export interface AppState {
  canvas: CanvasState;
  agent: AgentState;
}

// WebSocket messages - Server to Client
export interface StrokeCompleteMessage {
  type: 'stroke_complete';
  path: Path;
}

export interface PausedMessage {
  type: 'paused';
  paused: boolean;
}

export interface ClearMessage {
  type: 'clear';
}

export interface GalleryEntry {
  id: string;
  stroke_count: number;
  created_at: string;
  piece_number: number;
  drawing_style?: DrawingStyleType; // Style used for this piece (defaults to plotter)
}

// Backwards compatibility alias
export type SavedCanvas = GalleryEntry;

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
  drawing_style?: DrawingStyleType;
  style_config?: DrawingStyleConfig;
}

export interface InitMessage {
  type: 'init';
  strokes: Path[];
  gallery: SavedCanvas[];
  status: AgentStatus;
  paused: boolean;
  piece_count: number;
  monologue: string;
  drawing_style?: DrawingStyleType;
  style_config?: DrawingStyleConfig;
}

export interface PieceStateMessage {
  type: 'piece_state';
  number: number;
  completed: boolean;
}

// New message types for real-time status streaming
export interface ThinkingDeltaMessage {
  type: 'thinking_delta';
  text: string; // Only the new text since last message
  iteration: number;
}

export type ToolName =
  | 'draw_paths'
  | 'generate_svg'
  | 'view_canvas'
  | 'mark_piece_done'
  | 'imagine';

/**
 * Human-readable display names for tools.
 */
export const TOOL_DISPLAY_NAMES: Record<ToolName, string> = {
  draw_paths: 'drawing paths',
  generate_svg: 'generating SVG',
  view_canvas: 'viewing canvas',
  mark_piece_done: 'marking done',
  imagine: 'imagining',
};

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

export interface IterationMessage {
  type: 'iteration';
  current: number;
  max: number;
}

export interface StrokesReadyMessage {
  type: 'strokes_ready';
  count: number;
  batch_id: number;
}

export interface StyleChangeMessage {
  type: 'style_change';
  drawing_style: DrawingStyleType;
  style_config: DrawingStyleConfig;
}

/**
 * A pending stroke ready for client-side rendering.
 * Contains the original path and pre-interpolated points.
 */
export interface PendingStroke {
  batch_id: number;
  path: Path;
  points: Point[]; // Pre-interpolated points for animation
}

export type ServerMessage =
  | StrokeCompleteMessage
  | ThinkingDeltaMessage
  | PausedMessage
  | ClearMessage
  | NewCanvasMessage
  | GalleryUpdateMessage
  | LoadCanvasMessage
  | InitMessage
  | PieceStateMessage
  | CodeExecutionMessage
  | ErrorMessage
  | IterationMessage
  | StrokesReadyMessage
  | StyleChangeMessage;

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
  drawing_style?: DrawingStyleType; // Optional style for the new canvas
}

export interface ClientLoadCanvasMessage {
  type: 'load_canvas';
  canvas_id: string;
}

export interface ClientSetStyleMessage {
  type: 'set_style';
  drawing_style: DrawingStyleType;
}

export type ClientMessage =
  | ClientStrokeMessage
  | ClientNudgeMessage
  | ClientClearMessage
  | ClientPauseMessage
  | ClientResumeMessage
  | ClientNewCanvasMessage
  | ClientLoadCanvasMessage
  | ClientSetStyleMessage;

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
