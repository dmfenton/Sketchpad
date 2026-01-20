/**
 * Log Forwarder - Sends browser/app console logs to the server for debugging.
 *
 * Logs are written to /tmp/code-monet-browser.log on the server.
 * Session markers help identify log batches from different app launches.
 *
 * Usage:
 *   import { initLogForwarder, startLogSession } from '@code-monet/shared';
 *
 *   // On app mount
 *   initLogForwarder('http://localhost:8000');
 *   startLogSession('app-start');
 *
 * View logs:
 *   tail -f /tmp/code-monet-browser.log
 */

let baseUrl: string | null = null;
let sessionId: string | null = null;
let forwardingEnabled = false;

/**
 * Initialize the log forwarder with the API base URL.
 * Must be called before startLogSession or forwardLogs.
 */
export function initLogForwarder(apiBaseUrl: string): void {
  baseUrl = apiBaseUrl;
}

/**
 * Start a new logging session with a clear marker in the log file.
 * Returns the session ID for reference.
 */
export async function startLogSession(name?: string): Promise<string> {
  if (!baseUrl) {
    console.warn('[LogForwarder] Not initialized. Call initLogForwarder first.');
    return 'uninitialized';
  }

  sessionId = name || `session-${Date.now()}`;
  try {
    await fetch(`${baseUrl}/debug/log/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId }),
    });
  } catch {
    // Silently fail - server may not be running
  }
  return sessionId;
}

/**
 * Forward a single log entry to the server.
 */
function forwardLog(level: string, ...args: unknown[]): void {
  if (!baseUrl || !forwardingEnabled) return;

  const message = args
    .map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a)))
    .join(' ');

  // Fire and forget - don't await to avoid blocking
  fetch(`${baseUrl}/debug/log`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ level, message, session_id: sessionId }),
  }).catch(() => {
    // Silently fail
  });
}

/**
 * Patch console methods to forward logs to the server.
 * Call this once on app initialization.
 */
export function forwardLogs(): void {
  if (forwardingEnabled) return; // Prevent double-patching
  forwardingEnabled = true;

  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;
  const originalDebug = console.debug;

  console.log = (...args: unknown[]): void => {
    originalLog(...args);
    forwardLog('log', ...args);
  };

  console.warn = (...args: unknown[]): void => {
    originalWarn(...args);
    forwardLog('warn', ...args);
  };

  console.error = (...args: unknown[]): void => {
    originalError(...args);
    forwardLog('error', ...args);
  };

  console.debug = (...args: unknown[]): void => {
    originalDebug(...args);
    forwardLog('debug', ...args);
  };
}

/**
 * Disable log forwarding and restore original console methods.
 * Note: This doesn't actually restore them (would need to store references),
 * it just stops forwarding.
 */
export function stopForwarding(): void {
  forwardingEnabled = false;
}
