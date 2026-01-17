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
  handlePieceState,
  handleStrokeComplete,
  handleStrokesReady,
  handleThinkingDelta,
  routeMessage,
} from './handlers';

export type { DispatchFn } from './handlers';
