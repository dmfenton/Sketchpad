/**
 * @drawing-agent/shared
 *
 * Platform-agnostic code shared between React Native and web.
 */

// Types
export * from './types';

// Canvas state management
export * from './canvas';

// WebSocket message handling
export * from './websocket';

// React hooks
export * from './hooks';

// Utilities
export {
  boundedConcat,
  boundedPush,
  generateMessageId,
  bionicWord,
  chunkWords,
  getLastToolCall,
} from './utils';
export type { BionicWord } from './utils';
