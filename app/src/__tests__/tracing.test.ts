/**
 * Tests for the mobile tracing utility.
 */

// Mock react-native before any imports
jest.mock('react-native', () => ({
  Platform: {
    OS: 'ios',
    Version: '17.0',
  },
}));

// Mock config
jest.mock('../config', () => ({
  getApiUrl: () => 'http://localhost:8000',
}));

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Import after mocking
import { tracer } from '../utils/tracing';

describe('Tracer', () => {
  beforeEach(() => {
    mockFetch.mockClear();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ received: 1 }),
    });
    tracer.configure({ enabled: true, serverUrl: 'http://test' });
    tracer.reset();
  });

  describe('configuration', () => {
    it('generates valid trace IDs in X-Ray format', () => {
      const traceId = tracer.getTraceId();
      // X-Ray format: 1-{8 hex timestamp}-{24 hex random}
      expect(traceId).toMatch(/^1-[0-9a-f]{8}-[0-9a-f]{24}$/);
    });

    it('generates new trace ID on reset', () => {
      const firstId = tracer.getTraceId();
      tracer.reset();
      const secondId = tracer.getTraceId();
      expect(firstId).not.toBe(secondId);
    });
  });

  describe('span recording', () => {
    it('records events when enabled', () => {
      tracer.recordEvent('test.event', { key: 'value' });

      const pendingSpans = tracer.getPendingSpanCount();
      expect(pendingSpans).toBeGreaterThan(0);
    });

    it('does not record events when disabled', () => {
      tracer.configure({ enabled: false });
      tracer.reset();
      tracer.recordEvent('test.event');

      const pendingSpans = tracer.getPendingSpanCount();
      expect(pendingSpans).toBe(0);
    });

    it('startSpan returns span with end function', () => {
      const span = tracer.startSpan('test.span');
      expect(span).toHaveProperty('end');
      expect(typeof span.end).toBe('function');

      span.end();
      // After ending, span should be in buffer
      expect(tracer.getPendingSpanCount()).toBeGreaterThan(0);
    });

    it('records error events with error details', () => {
      const error = new Error('Test error');
      tracer.recordError('test.error', error, { extra: 'data' });

      const pendingSpans = tracer.getPendingSpanCount();
      expect(pendingSpans).toBeGreaterThan(0);
    });
  });

  describe('flushing', () => {
    it('flushes spans to server', async () => {
      tracer.recordEvent('test.event');

      await tracer.flush();

      expect(mockFetch).toHaveBeenCalledWith(
        'http://test/traces',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );
    });

    it('does not flush when no spans pending', async () => {
      await tracer.flush();

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('handles flush errors gracefully', async () => {
      tracer.recordEvent('test.event');

      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      // Should not throw
      await expect(tracer.flush()).resolves.not.toThrow();
    });

    it('clears buffer after successful flush', async () => {
      tracer.recordEvent('test.event');
      expect(tracer.getPendingSpanCount()).toBe(1);

      await tracer.flush();

      expect(tracer.getPendingSpanCount()).toBe(0);
    });
  });

  describe('buffer limits', () => {
    it('respects max buffer size', () => {
      // Record more than the buffer limit (500)
      for (let i = 0; i < 600; i++) {
        tracer.recordEvent(`event.${i}`);
      }

      const pendingSpans = tracer.getPendingSpanCount();
      expect(pendingSpans).toBeLessThanOrEqual(500);
    });

    it('respects buffer limit for recordError', () => {
      // Fill buffer first
      for (let i = 0; i < 500; i++) {
        tracer.recordEvent(`event.${i}`);
      }

      // This should be dropped
      tracer.recordError('overflow.error', new Error('overflow'));

      expect(tracer.getPendingSpanCount()).toBe(500);
    });

    it('respects buffer limit for startSpan.end', () => {
      // Fill buffer first
      for (let i = 0; i < 500; i++) {
        tracer.recordEvent(`event.${i}`);
      }

      // This should be dropped when ended
      const span = tracer.startSpan('overflow.span');
      span.end();

      expect(tracer.getPendingSpanCount()).toBe(500);
    });
  });
});
