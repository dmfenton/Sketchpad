/**
 * Canvas state management exports.
 */

export {
  canvasReducer,
  deriveAgentStatus,
  initialState,
  LIVE_MESSAGE_ID,
  MAX_MESSAGES,
} from './reducer';

export type { CanvasAction, CanvasHookState, PendingStrokesInfo } from './reducer';
