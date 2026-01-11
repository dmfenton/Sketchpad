/**
 * Utility exports.
 */

// Re-export from shared library
export { boundedConcat, boundedPush, generateMessageId, routeMessage } from '@drawing-agent/shared';

// Keep RN-specific canvas utilities
export { canvasToScreen, pathToSvgD, pointsToPolylineD, screenToCanvas } from './canvas';

// Tracing utilities
export { tracer, traced } from './tracing';
export type { Span } from './tracing';
