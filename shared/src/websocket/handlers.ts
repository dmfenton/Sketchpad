/**
 * Message handlers for WebSocket messages.
 *
 * Each handler is a pure function that takes a message and dispatch,
 * and dispatches the appropriate action(s).
 */

import type {
  AgentMessage,
  ClearMessage,
  CodeExecutionMessage,
  ErrorMessage,
  GalleryUpdateMessage,
  InitMessage,
  IterationMessage,
  LoadCanvasMessage,
  NewCanvasMessage,
  PausedMessage,
  PenMessage,
  PieceCompleteMessage,
  PieceCountMessage,
  ServerMessage,
  StatusMessage,
  StrokeCompleteMessage,
  ThinkingDeltaMessage,
  ThinkingMessage,
} from '../types';

import type { CanvasAction } from '../canvas/reducer';
import { generateMessageId } from '../utils';

// Dispatch function type (compatible with React's Dispatch)
export type DispatchFn = (action: CanvasAction) => void;

// Handler type
type MessageHandler<T extends ServerMessage> = (message: T, dispatch: DispatchFn) => void;

// Individual handlers
export const handlePen: MessageHandler<PenMessage> = (message, dispatch) => {
  dispatch({ type: 'SET_PEN', x: message.x, y: message.y, down: message.down });
};

export const handleStrokeComplete: MessageHandler<StrokeCompleteMessage> = (message, dispatch) => {
  dispatch({ type: 'ADD_STROKE', path: message.path });
};

export const handleThinking: MessageHandler<ThinkingMessage> = (message, dispatch) => {
  // Finalize any live message (converts it to permanent, keeping streamed content)
  // Don't add a new message since content was already streamed via thinking_delta
  dispatch({ type: 'FINALIZE_LIVE_MESSAGE' });
  dispatch({ type: 'SET_THINKING', text: message.text });
};

export const handleThinkingDelta: MessageHandler<ThinkingDeltaMessage> = (message, dispatch) => {
  // Update both the legacy thinking state and the live message
  dispatch({ type: 'APPEND_THINKING', text: message.text });
  dispatch({ type: 'APPEND_LIVE_MESSAGE', text: message.text });
};

export const handleStatus: MessageHandler<StatusMessage> = (message, dispatch) => {
  dispatch({ type: 'SET_STATUS', status: message.status });

  // Update paused state based on status
  // Status 'paused' means agent is paused, any other status means it's running
  dispatch({ type: 'SET_PAUSED', paused: message.status === 'paused' });

  // Reset thinking when starting a new turn
  if (message.status === 'thinking') {
    dispatch({ type: 'FINALIZE_LIVE_MESSAGE' });
    dispatch({ type: 'RESET_TURN' });
  }
  // Status is shown by StatusPill - no need to add to message stream
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

export const handleCodeExecution: MessageHandler<CodeExecutionMessage> = (message, dispatch) => {
  // Finalize any streaming thinking before showing code execution
  dispatch({ type: 'FINALIZE_LIVE_MESSAGE' });

  const baseMessage: Omit<AgentMessage, 'text'> = {
    id: generateMessageId(),
    type: 'code_execution',
    timestamp: Date.now(),
    iteration: message.iteration,
  };

  if (message.status === 'started') {
    dispatch({
      type: 'ADD_MESSAGE',
      message: { ...baseMessage, text: 'Executing code...' },
    });
  } else if (message.status === 'completed') {
    dispatch({
      type: 'ADD_MESSAGE',
      message: {
        ...baseMessage,
        text:
          message.return_code === 0
            ? 'Code completed'
            : `Code failed (exit ${message.return_code})`,
        metadata: {
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

export const handlePieceComplete: MessageHandler<PieceCompleteMessage> = (message, dispatch) => {
  // Finalize any streaming thinking before showing piece complete
  dispatch({ type: 'FINALIZE_LIVE_MESSAGE' });
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
};

export const handleClear: MessageHandler<ClearMessage> = (_message, dispatch) => {
  dispatch({ type: 'CLEAR' });
  dispatch({ type: 'CLEAR_MESSAGES' });
};

export const handleNewCanvas: MessageHandler<NewCanvasMessage> = (_message, dispatch) => {
  dispatch({ type: 'CLEAR' });
  dispatch({ type: 'CLEAR_MESSAGES' });
};

export const handleGalleryUpdate: MessageHandler<GalleryUpdateMessage> = (message, dispatch) => {
  dispatch({ type: 'SET_GALLERY', canvases: message.canvases });
};

export const handleLoadCanvas: MessageHandler<LoadCanvasMessage> = (message, dispatch) => {
  dispatch({
    type: 'LOAD_CANVAS',
    strokes: message.strokes,
    pieceNumber: message.piece_number,
  });
};

export const handleInit: MessageHandler<InitMessage> = (message, dispatch) => {
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
};

export const handlePieceCount: MessageHandler<PieceCountMessage> = (message, dispatch) => {
  dispatch({ type: 'SET_PIECE_COUNT', count: message.count });
};

export const handlePaused: MessageHandler<PausedMessage> = (message, dispatch) => {
  dispatch({ type: 'SET_PAUSED', paused: message.paused });
};

// Handler registry
const handlers: Partial<Record<ServerMessage['type'], MessageHandler<ServerMessage>>> = {
  pen: handlePen as MessageHandler<ServerMessage>,
  stroke_complete: handleStrokeComplete as MessageHandler<ServerMessage>,
  thinking: handleThinking as MessageHandler<ServerMessage>,
  thinking_delta: handleThinkingDelta as MessageHandler<ServerMessage>,
  status: handleStatus as MessageHandler<ServerMessage>,
  iteration: handleIteration as MessageHandler<ServerMessage>,
  code_execution: handleCodeExecution as MessageHandler<ServerMessage>,
  error: handleError as MessageHandler<ServerMessage>,
  piece_complete: handlePieceComplete as MessageHandler<ServerMessage>,
  clear: handleClear as MessageHandler<ServerMessage>,
  new_canvas: handleNewCanvas as MessageHandler<ServerMessage>,
  gallery_update: handleGalleryUpdate as MessageHandler<ServerMessage>,
  load_canvas: handleLoadCanvas as MessageHandler<ServerMessage>,
  init: handleInit as MessageHandler<ServerMessage>,
  piece_count: handlePieceCount as MessageHandler<ServerMessage>,
  paused: handlePaused as MessageHandler<ServerMessage>,
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
