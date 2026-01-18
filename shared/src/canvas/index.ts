/**
 * Canvas state management exports.
 */

export {
  canvasReducer,
  deriveAgentStatus,
  hasInProgressEvents,
  initialState,
  LIVE_MESSAGE_ID,
  MAX_MESSAGES,
  shouldShowIdleAnimation,
} from './reducer';

export type { CanvasAction, CanvasHookState, PendingStrokesInfo } from './reducer';
