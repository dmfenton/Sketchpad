/**
 * WebSocket handling exports.
 */

export {
  handleAgentState,
  handleClear,
  handleCodeExecution,
  handleError,
  handleGalleryUpdate,
  handleInit,
  handleIteration,
  handleLoadCanvas,
  handleNewCanvas,
  handlePieceState,
  handleStrokeComplete,
  handleStrokesReady,
  handleThinking,
  handleThinkingDelta,
  routeMessage,
} from './handlers';

export type { DispatchFn } from './handlers';
