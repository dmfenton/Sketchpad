/**
 * Message handlers for WebSocket messages.
 *
 * Each handler is a pure function that takes a message and dispatch,
 * and dispatches the appropriate action(s).
 */

import type {
  AgentMessage,
  AgentStateMessage,
  ClearMessage,
  CodeExecutionMessage,
  ErrorMessage,
  GalleryUpdateMessage,
  InitMessage,
  IterationMessage,
  LoadCanvasMessage,
  NewCanvasMessage,
  PieceStateMessage,
  ServerMessage,
  StrokeCompleteMessage,
  StrokesReadyMessage,
  StyleChangeMessage,
  ThinkingDeltaMessage,
} from '../types';

import type { CanvasAction } from '../canvas/reducer';
import { generateMessageId } from '../utils';

// Dispatch function type (compatible with React's Dispatch)
export type DispatchFn = (action: CanvasAction) => void;

// Handler type
type MessageHandler<T extends ServerMessage> = (message: T, dispatch: DispatchFn) => void;

// Individual handlers
export const handleStrokeComplete: MessageHandler<StrokeCompleteMessage> = (message, dispatch) => {
  dispatch({ type: 'ADD_STROKE', path: message.path });
};

export const handleThinkingDelta: MessageHandler<ThinkingDeltaMessage> = (message, dispatch) => {
  // Update both the legacy thinking state and the live message
  dispatch({ type: 'APPEND_THINKING', text: message.text });
  dispatch({ type: 'APPEND_LIVE_MESSAGE', text: message.text });
};

export const handleAgentState: MessageHandler<AgentStateMessage> = (message, dispatch) => {
  // Update paused state
  dispatch({ type: 'SET_PAUSED', paused: message.paused });

  // Store server status for fallback derivation (e.g., 'thinking' before thinking_delta arrives)
  dispatch({ type: 'SET_SERVER_STATUS', status: message.status });

  // Finalize any live message and reset turn state on turn boundaries
  if (message.status === 'idle' || message.status === 'thinking') {
    dispatch({ type: 'FINALIZE_LIVE_MESSAGE' });
    dispatch({ type: 'RESET_TURN' });
  }
};

export const handleIteration: MessageHandler<IterationMessage> = (message, dispatch) => {
  // Finalize any streaming thinking before showing iteration
  dispatch({ type: 'FINALIZE_LIVE_MESSAGE' });
  dispatch({
    type: 'SET_ITERATION',
    current: message.current,
    max: message.max,
  });
  // Don't add iteration messages to the stream - they're noise
};

// Human-readable labels for tool names
const TOOL_LABELS: Record<string, { started: string; completed: string }> = {
  draw_paths: { started: 'Drawing paths...', completed: 'Paths drawn' },
  generate_svg: { started: 'Generating SVG...', completed: 'SVG generated' },
  view_canvas: { started: 'Viewing canvas...', completed: 'Canvas viewed' },
  mark_piece_done: { started: 'Marking piece done...', completed: 'Piece marked done' },
};

// Get path count from tool input for draw_paths
const getPathCount = (toolInput: Record<string, unknown> | null | undefined): number | null => {
  if (!toolInput) return null;
  const paths = toolInput.paths;
  if (Array.isArray(paths)) {
    return paths.length;
  }
  return null;
};

export const handleCodeExecution: MessageHandler<CodeExecutionMessage> = (message, dispatch) => {
  // Finalize any streaming thinking before showing code execution
  dispatch({ type: 'FINALIZE_LIVE_MESSAGE' });

  const toolName = message.tool_name ?? 'unknown';
  const labels = TOOL_LABELS[toolName] ?? { started: 'Executing...', completed: 'Completed' };

  const baseMessage: Omit<AgentMessage, 'text'> = {
    id: generateMessageId(),
    type: 'code_execution',
    timestamp: Date.now(),
    iteration: message.iteration,
    metadata: {
      tool_name: message.tool_name,
      tool_input: message.tool_input,
    },
  };

  if (message.status === 'started') {
    // Build a more informative message based on tool type
    let text = labels.started;
    if (toolName === 'draw_paths') {
      const pathCount = getPathCount(message.tool_input);
      if (pathCount !== null) {
        text = `Drawing ${pathCount} path${pathCount !== 1 ? 's' : ''}...`;
      }
    }

    dispatch({
      type: 'ADD_MESSAGE',
      message: { ...baseMessage, text },
    });
  } else if (message.status === 'completed') {
    let text = labels.completed;
    if (message.return_code !== 0) {
      text = `${toolName} failed (exit ${message.return_code})`;
    } else if (toolName === 'draw_paths') {
      const pathCount = getPathCount(message.tool_input);
      if (pathCount !== null) {
        text = `Drew ${pathCount} path${pathCount !== 1 ? 's' : ''}`;
      }
    }

    dispatch({
      type: 'ADD_MESSAGE',
      message: {
        ...baseMessage,
        text,
        metadata: {
          ...baseMessage.metadata,
          stdout: message.stdout,
          stderr: message.stderr,
          return_code: message.return_code,
        },
      },
    });
  }
};

export const handleError: MessageHandler<ErrorMessage> = (message, dispatch) => {
  // Finalize any streaming thinking before showing error
  dispatch({ type: 'FINALIZE_LIVE_MESSAGE' });
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
};

export const handlePieceState: MessageHandler<PieceStateMessage> = (message, dispatch) => {
  // Update the piece count
  dispatch({ type: 'SET_PIECE_COUNT', count: message.number });

  // If piece just completed, show completion message
  if (message.completed) {
    // Finalize any streaming thinking before showing piece complete
    dispatch({ type: 'FINALIZE_LIVE_MESSAGE' });
    // Clear server status since turn is complete
    dispatch({ type: 'SET_SERVER_STATUS', status: null });
    dispatch({
      type: 'ADD_MESSAGE',
      message: {
        id: generateMessageId(),
        type: 'piece_complete',
        text: `Piece #${message.number} complete!`,
        timestamp: Date.now(),
        metadata: {
          piece_number: message.number,
        },
      },
    });
  }
};

export const handleClear: MessageHandler<ClearMessage> = (_message, dispatch) => {
  dispatch({ type: 'CLEAR' });
  dispatch({ type: 'CLEAR_MESSAGES' });
  dispatch({ type: 'SET_SERVER_STATUS', status: null });
};

export const handleNewCanvas: MessageHandler<NewCanvasMessage> = (_message, dispatch) => {
  dispatch({ type: 'CLEAR' });
  dispatch({ type: 'CLEAR_MESSAGES' });
  dispatch({ type: 'SET_SERVER_STATUS', status: null });
};

export const handleGalleryUpdate: MessageHandler<GalleryUpdateMessage> = (message, dispatch) => {
  dispatch({ type: 'SET_GALLERY', canvases: message.canvases });
};

export const handleLoadCanvas: MessageHandler<LoadCanvasMessage> = (message, dispatch) => {
  dispatch({
    type: 'LOAD_CANVAS',
    strokes: message.strokes,
    pieceNumber: message.piece_number,
    drawingStyle: message.drawing_style,
    styleConfig: message.style_config,
  });
};

export const handleInit: MessageHandler<InitMessage> = (message, dispatch) => {
  dispatch({
    type: 'INIT',
    strokes: message.strokes,
    gallery: message.gallery,
    pieceCount: message.piece_count,
    paused: message.paused,
    drawingStyle: message.drawing_style,
    styleConfig: message.style_config,
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
};

export const handleStyleChange: MessageHandler<StyleChangeMessage> = (message, dispatch) => {
  dispatch({
    type: 'SET_STYLE',
    drawingStyle: message.drawing_style,
    styleConfig: message.style_config,
  });
};

export const handleStrokesReady: MessageHandler<StrokesReadyMessage> = (message, dispatch) => {
  // Signal that strokes are ready to be fetched from the REST API
  // The hook will watch for this state change and trigger the fetch
  dispatch({ type: 'STROKES_READY', count: message.count, batchId: message.batch_id });
};

// Handler registry
const handlers: Partial<Record<ServerMessage['type'], MessageHandler<ServerMessage>>> = {
  stroke_complete: handleStrokeComplete as MessageHandler<ServerMessage>,
  thinking_delta: handleThinkingDelta as MessageHandler<ServerMessage>,
  agent_state: handleAgentState as MessageHandler<ServerMessage>,
  iteration: handleIteration as MessageHandler<ServerMessage>,
  code_execution: handleCodeExecution as MessageHandler<ServerMessage>,
  error: handleError as MessageHandler<ServerMessage>,
  piece_state: handlePieceState as MessageHandler<ServerMessage>,
  clear: handleClear as MessageHandler<ServerMessage>,
  new_canvas: handleNewCanvas as MessageHandler<ServerMessage>,
  gallery_update: handleGalleryUpdate as MessageHandler<ServerMessage>,
  load_canvas: handleLoadCanvas as MessageHandler<ServerMessage>,
  init: handleInit as MessageHandler<ServerMessage>,
  strokes_ready: handleStrokesReady as MessageHandler<ServerMessage>,
  style_change: handleStyleChange as MessageHandler<ServerMessage>,
};

/**
 * Route a message to its handler.
 */
export const routeMessage = (message: ServerMessage, dispatch: DispatchFn): void => {
  const handler = handlers[message.type];
  if (handler) {
    handler(message, dispatch);
  }
};
