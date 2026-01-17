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

// Services (testable business logic)
export * from './services';

// Utilities
export {
  boundedConcat,
  boundedPush,
  generateMessageId,
  bionicWord,
  chunkWords,
  getLastToolCall,
  BIONIC_CHUNK_INTERVAL_MS,
  BIONIC_CHUNK_SIZE,
} from './utils';
export type { BionicWord } from './utils';

// Stroke smoothing utilities
export {
  smoothPolylineToPath,
  polylineToPath,
  calculateVelocityWidths,
  createTaperedStrokePath,
  simplifyPoints,
} from './utils/strokeSmoothing';
