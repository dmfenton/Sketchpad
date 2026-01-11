/**
 * WebSocket handling exports.
 */

export {
  handleClear,
  handleCodeExecution,
  handleError,
  handleGalleryChanged,
  handleInit,
  handleIteration,
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
