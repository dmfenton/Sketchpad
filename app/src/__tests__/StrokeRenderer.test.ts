/**
 * Tests for StrokeRenderer - the core stroke rendering logic.
 *
 * These tests verify the critical stroke rendering flow without React:
 * - Batch tracking and deduplication
 * - Retry behavior after failures
 * - Animation dispatch sequence
 * - Stop/reset functionality
 */

import { StrokeRenderer } from '@code-monet/shared';
import type { CanvasAction, Path, PendingStroke } from '@code-monet/shared';

// Mock stroke data
const createMockStroke = (
  batchId: number,
  points: Array<{ x: number; y: number }>
): PendingStroke => ({
  batch_id: batchId,
  path: {
    type: 'polyline' as const,
    points,
  },
  points, // Pre-interpolated points (same as path points for simplicity)
});

describe('StrokeRenderer', () => {
  describe('batch tracking', () => {
    it('fetches strokes on first batch', async () => {
      const fetchStrokes = jest.fn().mockResolvedValue([]);
      const dispatch = jest.fn();
      const renderer = new StrokeRenderer({
        fetchStrokes,
        dispatch,
        requestFrame: (cb: () => void) => cb(),
      });

      await renderer.handleStrokesReady(1);

      expect(fetchStrokes).toHaveBeenCalledTimes(1);
      expect(dispatch).toHaveBeenCalledWith({ type: 'CLEAR_PENDING_STROKES' });
    });

    it('skips already-fetched batch', async () => {
      const fetchStrokes = jest.fn().mockResolvedValue([]);
      const dispatch = jest.fn();
      const renderer = new StrokeRenderer({
        fetchStrokes,
        dispatch,
        requestFrame: (cb: () => void) => cb(),
      });

      // First fetch
      await renderer.handleStrokesReady(1);
      expect(fetchStrokes).toHaveBeenCalledTimes(1);

      // Same batch - should skip
      const result = await renderer.handleStrokesReady(1);
      expect(result.fetched).toBe(false);
      expect(fetchStrokes).toHaveBeenCalledTimes(1); // Still 1
    });

    it('skips lower batch IDs', async () => {
      const fetchStrokes = jest.fn().mockResolvedValue([]);
      const renderer = new StrokeRenderer({
        fetchStrokes,
        dispatch: jest.fn(),
        requestFrame: (cb: () => void) => cb(),
      });

      // Fetch batch 5
      await renderer.handleStrokesReady(5);
      expect(fetchStrokes).toHaveBeenCalledTimes(1);

      // Try batch 3 - should skip
      const result = await renderer.handleStrokesReady(3);
      expect(result.fetched).toBe(false);
      expect(fetchStrokes).toHaveBeenCalledTimes(1);
    });

    it('processes higher batch IDs', async () => {
      const fetchStrokes = jest.fn().mockResolvedValue([]);
      const renderer = new StrokeRenderer({
        fetchStrokes,
        dispatch: jest.fn(),
        requestFrame: (cb: () => void) => cb(),
      });

      await renderer.handleStrokesReady(1);
      await renderer.handleStrokesReady(2);
      await renderer.handleStrokesReady(3);

      expect(fetchStrokes).toHaveBeenCalledTimes(3);
    });

    it('tracks last fetched batch ID', async () => {
      const renderer = new StrokeRenderer({
        fetchStrokes: jest.fn().mockResolvedValue([]),
        dispatch: jest.fn(),
        requestFrame: (cb: () => void) => cb(),
      });

      expect(renderer.getLastFetchedBatchId()).toBe(0);

      await renderer.handleStrokesReady(5);
      expect(renderer.getLastFetchedBatchId()).toBe(5);

      await renderer.handleStrokesReady(10);
      expect(renderer.getLastFetchedBatchId()).toBe(10);
    });
  });

  describe('retry after failure', () => {
    it('allows retry when fetch fails', async () => {
      const fetchStrokes = jest
        .fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce([]);
      const renderer = new StrokeRenderer({
        fetchStrokes,
        dispatch: jest.fn(),
        requestFrame: (cb: () => void) => cb(),
      });

      // First attempt fails
      await expect(renderer.handleStrokesReady(1)).rejects.toThrow('Network error');
      expect(fetchStrokes).toHaveBeenCalledTimes(1);

      // Retry same batch - should work because failure didn't mark as fetched
      await renderer.handleStrokesReady(1);
      expect(fetchStrokes).toHaveBeenCalledTimes(2);
    });

    it('does not update batch ID on failure', async () => {
      const fetchStrokes = jest.fn().mockRejectedValue(new Error('Network error'));
      const renderer = new StrokeRenderer({
        fetchStrokes,
        dispatch: jest.fn(),
        requestFrame: (cb: () => void) => cb(),
      });

      expect(renderer.getLastFetchedBatchId()).toBe(0);

      await expect(renderer.handleStrokesReady(5)).rejects.toThrow();

      // Batch ID should still be 0 (not updated on failure)
      expect(renderer.getLastFetchedBatchId()).toBe(0);
    });

    it('updates batch ID only after successful fetch', async () => {
      const fetchStrokes = jest
        .fn()
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockRejectedValueOnce(new Error('Fail 2'))
        .mockResolvedValueOnce([]);
      const renderer = new StrokeRenderer({
        fetchStrokes,
        dispatch: jest.fn(),
        requestFrame: (cb: () => void) => cb(),
      });

      // Two failures
      await expect(renderer.handleStrokesReady(1)).rejects.toThrow();
      await expect(renderer.handleStrokesReady(1)).rejects.toThrow();
      expect(renderer.getLastFetchedBatchId()).toBe(0);

      // Third attempt succeeds
      await renderer.handleStrokesReady(1);
      expect(renderer.getLastFetchedBatchId()).toBe(1);
      expect(fetchStrokes).toHaveBeenCalledTimes(3);
    });
  });

  describe('animation dispatch sequence', () => {
    it('dispatches CLEAR_PENDING_STROKES before fetch', async () => {
      const dispatch = jest.fn();
      const fetchStrokes = jest.fn().mockResolvedValue([]);
      const renderer = new StrokeRenderer({
        fetchStrokes,
        dispatch,
        requestFrame: (cb: () => void) => cb(),
      });

      await renderer.handleStrokesReady(1);

      expect(dispatch).toHaveBeenCalledWith({ type: 'CLEAR_PENDING_STROKES' });
    });

    it('dispatches SET_PEN for each point', async () => {
      const dispatch = jest.fn();
      const mockStroke = createMockStroke(1, [
        { x: 0, y: 0 },
        { x: 50, y: 50 },
        { x: 100, y: 100 },
      ]);
      const renderer = new StrokeRenderer({
        fetchStrokes: jest.fn().mockResolvedValue([mockStroke]),
        dispatch,
        requestFrame: (cb: () => void) => cb(),
        frameDelayMs: 0,
      });

      await renderer.handleStrokesReady(1);

      // Should have SET_PEN calls for each point
      const setPenCalls = dispatch.mock.calls.filter(
        (call) => (call[0] as CanvasAction).type === 'SET_PEN'
      );
      expect(setPenCalls.length).toBeGreaterThanOrEqual(3);
    });

    it('dispatches ADD_STROKE to finalize', async () => {
      const dispatch = jest.fn();
      const path: Path = {
        type: 'polyline',
        points: [
          { x: 0, y: 0 },
          { x: 100, y: 100 },
        ],
      };
      const mockStroke: PendingStroke = {
        batch_id: 1,
        path,
        points: [
          { x: 0, y: 0 },
          { x: 100, y: 100 },
        ],
      };
      const renderer = new StrokeRenderer({
        fetchStrokes: jest.fn().mockResolvedValue([mockStroke]),
        dispatch,
        requestFrame: (cb: () => void) => cb(),
        frameDelayMs: 0,
      });

      await renderer.handleStrokesReady(1);

      expect(dispatch).toHaveBeenCalledWith({ type: 'ADD_STROKE', path });
    });

    it('handles multiple strokes in sequence', async () => {
      const dispatch = jest.fn();
      const stroke1 = createMockStroke(1, [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
      ]);
      const stroke2 = createMockStroke(1, [
        { x: 50, y: 50 },
        { x: 60, y: 60 },
      ]);
      const renderer = new StrokeRenderer({
        fetchStrokes: jest.fn().mockResolvedValue([stroke1, stroke2]),
        dispatch,
        requestFrame: (cb: () => void) => cb(),
        frameDelayMs: 0,
      });

      await renderer.handleStrokesReady(1);

      // Should have two ADD_STROKE calls
      const addStrokeCalls = dispatch.mock.calls.filter(
        (call) => (call[0] as CanvasAction).type === 'ADD_STROKE'
      );
      expect(addStrokeCalls).toHaveLength(2);
    });

    it('skips strokes with no points', async () => {
      const dispatch = jest.fn();
      const emptyStroke = createMockStroke(1, []);
      const validStroke = createMockStroke(1, [{ x: 0, y: 0 }]);
      const renderer = new StrokeRenderer({
        fetchStrokes: jest.fn().mockResolvedValue([emptyStroke, validStroke]),
        dispatch,
        requestFrame: (cb: () => void) => cb(),
        frameDelayMs: 0,
      });

      await renderer.handleStrokesReady(1);

      // Only one ADD_STROKE (the valid one)
      const addStrokeCalls = dispatch.mock.calls.filter(
        (call) => (call[0] as CanvasAction).type === 'ADD_STROKE'
      );
      expect(addStrokeCalls).toHaveLength(1);
    });
  });

  describe('stop and reset', () => {
    it('stop() prevents further animation', async () => {
      const dispatch = jest.fn();
      const renderer = new StrokeRenderer({
        fetchStrokes: jest.fn().mockResolvedValue([
          createMockStroke(1, [
            { x: 0, y: 0 },
            { x: 100, y: 100 },
          ]),
        ]),
        dispatch,
        requestFrame: (cb: () => void) => cb(),
        frameDelayMs: 0,
      });

      renderer.stop();
      await renderer.handleStrokesReady(1);

      // Should not have ADD_STROKE because stopped
      const addStrokeCalls = dispatch.mock.calls.filter(
        (call) => (call[0] as CanvasAction).type === 'ADD_STROKE'
      );
      expect(addStrokeCalls).toHaveLength(0);
    });

    it('reset() clears batch tracking', async () => {
      const fetchStrokes = jest.fn().mockResolvedValue([]);
      const renderer = new StrokeRenderer({
        fetchStrokes,
        dispatch: jest.fn(),
        requestFrame: (cb: () => void) => cb(),
      });

      await renderer.handleStrokesReady(5);
      expect(renderer.getLastFetchedBatchId()).toBe(5);

      renderer.reset();
      expect(renderer.getLastFetchedBatchId()).toBe(0);

      // Should be able to fetch batch 1 again
      await renderer.handleStrokesReady(1);
      expect(fetchStrokes).toHaveBeenCalledTimes(2);
    });

    it('reset() allows animation after stop', async () => {
      const dispatch = jest.fn();
      const renderer = new StrokeRenderer({
        fetchStrokes: jest.fn().mockResolvedValue([createMockStroke(1, [{ x: 0, y: 0 }])]),
        dispatch,
        requestFrame: (cb: () => void) => cb(),
        frameDelayMs: 0,
      });

      renderer.stop();
      renderer.reset();

      await renderer.handleStrokesReady(1);

      // Should have ADD_STROKE after reset
      const addStrokeCalls = dispatch.mock.calls.filter(
        (call) => (call[0] as CanvasAction).type === 'ADD_STROKE'
      );
      expect(addStrokeCalls).toHaveLength(1);
    });
  });

  describe('result object', () => {
    it('returns fetched=true and strokeCount on success', async () => {
      const renderer = new StrokeRenderer({
        fetchStrokes: jest
          .fn()
          .mockResolvedValue([
            createMockStroke(1, [{ x: 0, y: 0 }]),
            createMockStroke(1, [{ x: 10, y: 10 }]),
          ]),
        dispatch: jest.fn(),
        requestFrame: (cb: () => void) => cb(),
        frameDelayMs: 0,
      });

      const result = await renderer.handleStrokesReady(1);

      expect(result.fetched).toBe(true);
      expect(result.strokeCount).toBe(2);
    });

    it('returns fetched=false when skipping duplicate', async () => {
      const renderer = new StrokeRenderer({
        fetchStrokes: jest.fn().mockResolvedValue([]),
        dispatch: jest.fn(),
        requestFrame: (cb: () => void) => cb(),
      });

      await renderer.handleStrokesReady(1);
      const result = await renderer.handleStrokesReady(1);

      expect(result.fetched).toBe(false);
      expect(result.strokeCount).toBe(0);
    });

    it('returns strokeCount=0 when no strokes returned', async () => {
      const renderer = new StrokeRenderer({
        fetchStrokes: jest.fn().mockResolvedValue([]),
        dispatch: jest.fn(),
        requestFrame: (cb: () => void) => cb(),
      });

      const result = await renderer.handleStrokesReady(1);

      expect(result.fetched).toBe(true);
      expect(result.strokeCount).toBe(0);
    });
  });
});
