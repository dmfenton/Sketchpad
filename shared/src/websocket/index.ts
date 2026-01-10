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
  handlePen,
  handlePieceComplete,
  handlePieceCount,
  handleStatus,
  handleStrokeComplete,
  handleThinking,
  handleThinkingDelta,
  routeMessage,
} from './handlers';

export type { DispatchFn } from './handlers';
