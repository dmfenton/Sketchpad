/**
 * Lightweight distributed tracing for React Native.
 * Sends spans to server which forwards to AWS X-Ray via OTEL.
 */

import { Platform } from 'react-native';
import { getApiUrl } from '../config';

export interface Span {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  startTime: number;
  endTime?: number;
  attributes: Record<string, string | number | boolean>;
  status: 'ok' | 'error';
  error?: string;
}

interface SpanHandle {
  span: Span;
  end: (error?: Error) => void;
}

/**
 * Generate a random hex string of specified length.
 */
function randomHex(length: number): string {
  const chars = '0123456789abcdef';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * 16)];
  }
  return result;
}

/**
 * Tracer class for collecting and sending spans.
 */
class Tracer {
  private traceId: string;
  private spans: Span[] = [];
  private flushInterval: ReturnType<typeof setInterval> | null = null;
  private enabled: boolean = true;

  constructor() {
    this.traceId = this.generateTraceId();
  }

  /**
   * Generate a new trace ID (32 hex chars for X-Ray compatibility).
   */
  private generateTraceId(): string {
    // X-Ray trace ID format: 1-{8 hex timestamp}-{24 hex random}
    const timestamp = Math.floor(Date.now() / 1000)
      .toString(16)
      .padStart(8, '0');
    const random = randomHex(24);
    return `1-${timestamp}-${random}`;
  }

  /**
   * Generate a span ID (16 hex chars).
   */
  private generateSpanId(): string {
    return randomHex(16);
  }

  /**
   * Get the current trace ID for propagation.
   */
  getTraceId(): string {
    return this.traceId;
  }

  /**
   * Enable or disable tracing.
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Start a new span that can be ended later.
   */
  startSpan(name: string, attributes: Record<string, unknown> = {}): SpanHandle {
    const span: Span = {
      traceId: this.traceId,
      spanId: this.generateSpanId(),
      name,
      startTime: Date.now(),
      attributes: {
        'device.platform': Platform.OS,
        'device.version': String(Platform.Version),
        ...this.sanitizeAttributes(attributes),
      },
      status: 'ok',
    };

    return {
      span,
      end: (error?: Error) => {
        span.endTime = Date.now();
        if (error) {
          span.status = 'error';
          span.error = error.message;
        }
        if (this.enabled) {
          this.spans.push(span);
        }
      },
    };
  }

  /**
   * Record an instant event (span with same start/end time).
   */
  recordEvent(name: string, attributes: Record<string, unknown> = {}): void {
    if (!this.enabled) return;

    const now = Date.now();
    const span: Span = {
      traceId: this.traceId,
      spanId: this.generateSpanId(),
      name,
      startTime: now,
      endTime: now,
      attributes: {
        'device.platform': Platform.OS,
        'device.version': String(Platform.Version),
        ...this.sanitizeAttributes(attributes),
      },
      status: 'ok',
    };
    this.spans.push(span);
  }

  /**
   * Record an error event.
   */
  recordError(name: string, error: Error, attributes: Record<string, unknown> = {}): void {
    if (!this.enabled) return;

    const now = Date.now();
    const span: Span = {
      traceId: this.traceId,
      spanId: this.generateSpanId(),
      name,
      startTime: now,
      endTime: now,
      attributes: {
        'device.platform': Platform.OS,
        'device.version': String(Platform.Version),
        'error.type': error.name,
        ...this.sanitizeAttributes(attributes),
      },
      status: 'error',
      error: error.message,
    };
    this.spans.push(span);
  }

  /**
   * Sanitize attributes to only allowed types.
   */
  private sanitizeAttributes(
    attrs: Record<string, unknown>
  ): Record<string, string | number | boolean> {
    const result: Record<string, string | number | boolean> = {};
    for (const [key, value] of Object.entries(attrs)) {
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        result[key] = value;
      } else if (value !== null && value !== undefined) {
        // Use JSON.stringify for objects/arrays, otherwise convert to string
        result[key] =
          typeof value === 'object' ? JSON.stringify(value) : `${value as string | number}`;
      }
    }
    return result;
  }

  /**
   * Start periodic flushing of spans to server.
   */
  startAutoFlush(intervalMs: number = 10000): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    this.flushInterval = setInterval(() => {
      this.flush().catch(() => {
        // Ignore flush errors silently
      });
    }, intervalMs);
  }

  /**
   * Stop automatic flushing.
   */
  stopAutoFlush(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
  }

  /**
   * Flush pending spans to the server.
   */
  async flush(): Promise<void> {
    if (this.spans.length === 0) return;

    const spansToSend = [...this.spans];
    this.spans = [];

    try {
      const response = await fetch(`${getApiUrl()}/traces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spans: spansToSend }),
      });

      if (!response.ok) {
        // Re-add spans on failure (up to a limit)
        if (this.spans.length < 100) {
          this.spans = [...spansToSend, ...this.spans];
        }
      }
    } catch {
      // Re-add spans on network failure (up to a limit)
      if (this.spans.length < 100) {
        this.spans = [...spansToSend, ...this.spans];
      }
    }
  }

  /**
   * Start a new trace session (generates new trace ID).
   * Call this when starting a new drawing session.
   */
  newSession(): void {
    // Flush any pending spans from old session
    this.flush().catch(() => {});
    this.traceId = this.generateTraceId();
    this.recordEvent('session.start');
  }

  /**
   * Get pending span count (for debugging).
   */
  getPendingCount(): number {
    return this.spans.length;
  }
}

/**
 * Global tracer instance.
 */
export const tracer = new Tracer();

/**
 * Wrap an async function with tracing.
 */
export function traced<T>(
  name: string,
  fn: () => Promise<T>,
  attributes: Record<string, unknown> = {}
): Promise<T> {
  const handle = tracer.startSpan(name, attributes);
  return fn()
    .then((result) => {
      handle.end();
      return result;
    })
    .catch((error: unknown) => {
      handle.end(error instanceof Error ? error : new Error(String(error)));
      throw error;
    });
}
