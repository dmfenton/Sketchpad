/**
 * Debug logging utility for mobile app.
 * Enable by setting DEBUG=true in environment or calling enableDebug().
 */

// Global debug flag - can be toggled at runtime
let DEBUG_ENABLED = true; // Enable by default for debugging

// Log buffer for remote retrieval
const LOG_BUFFER: string[] = [];
const MAX_LOG_BUFFER = 500;

export function getLogBuffer(): string[] {
  return [...LOG_BUFFER];
}

export function clearLogBuffer(): void {
  LOG_BUFFER.length = 0;
}

export function enableDebug(): void {
  DEBUG_ENABLED = true;
  console.log('[DEBUG] Logging enabled');
}

export function disableDebug(): void {
  DEBUG_ENABLED = false;
}

export function isDebugEnabled(): boolean {
  return DEBUG_ENABLED;
}

/**
 * Log a debug message with category prefix.
 * Only logs when DEBUG_ENABLED is true.
 */
export function debug(category: string, message: string, data?: unknown): void {
  if (!DEBUG_ENABLED) return;

  const timestamp = new Date().toISOString().split('T')[1]?.slice(0, 12) ?? '';
  const prefix = `[${timestamp}][${category}]`;

  let logLine: string;
  if (data !== undefined) {
    // Truncate long strings for readability
    const truncated =
      typeof data === 'string' && data.length > 200 ? data.slice(0, 200) + '...' : data;
    logLine = `${prefix} ${message} ${JSON.stringify(truncated)}`;
    console.log(prefix, message, truncated);
  } else {
    logLine = `${prefix} ${message}`;
    console.log(prefix, message);
  }

  // Add to buffer for remote retrieval
  LOG_BUFFER.push(logLine);
  if (LOG_BUFFER.length > MAX_LOG_BUFFER) {
    LOG_BUFFER.shift();
  }
}

// Category-specific loggers
export const debugWS = (msg: string, data?: unknown): void => debug('WS', msg, data);
export const debugReducer = (msg: string, data?: unknown): void => debug('REDUCER', msg, data);
export const debugStroke = (msg: string, data?: unknown): void => debug('STROKE', msg, data);
export const debugThinking = (msg: string, data?: unknown): void => debug('THINK', msg, data);
export const debugRender = (msg: string, data?: unknown): void => debug('RENDER', msg, data);
