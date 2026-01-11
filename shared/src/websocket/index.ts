/**
 * WebSocket handling exports.
 */

export {
  handleClear,
  handleCodeExecution,
  handleError,
  handleGalleryUpdate,
  handleInit,
  handleIteration,
  handleLoadCanvas,
  handleNewCanvas,
  handlePaused,
  handlePen,
  handlePieceComplete,
  handlePieceCount,
  handleStatus,
  handleStrokeComplete,
  handleStrokesReady,
  handleThinking,
  handleThinkingDelta,
  routeMessage,
} from './handlers';

export type { DispatchFn } from './handlers';
