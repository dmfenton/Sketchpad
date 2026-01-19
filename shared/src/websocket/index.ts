/**
 * WebSocket handling exports.
 */

export {
  handleAgentStrokesReady,
  handleClear,
  handleCodeExecution,
  handleError,
  handleGalleryUpdate,
  handleHumanStroke,
  handleInit,
  handleIteration,
  handleLoadCanvas,
  handleNewCanvas,
  handlePaused,
  handlePieceState,
  handleThinkingDelta,
  routeMessage,
} from './handlers';

export type { DispatchFn } from './handlers';
