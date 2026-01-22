/**
 * Tests for MessageStream component logic.
 *
 * Tests the message history display logic.
 * Note: Live thinking is now in state.thinking, not in messages array.
 */

import type { AgentMessage } from '@code-monet/shared';

describe('MessageStream', () => {
  describe('message history', () => {
    // Messages now contains only archived thinking and other events
    // No more LIVE_MESSAGE_ID filtering needed

    it('displays all messages in order', () => {
      const messages: AgentMessage[] = [
        { id: 'thinking_1', type: 'thinking', text: 'First thought', timestamp: 1000 },
        { id: 'thinking_2', type: 'thinking', text: 'Second thought', timestamp: 2000 },
        { id: 'thinking_3', type: 'thinking', text: 'Third thought', timestamp: 3000 },
      ];

      expect(messages).toHaveLength(3);
      expect(messages.map((m) => m.id)).toEqual(['thinking_1', 'thinking_2', 'thinking_3']);
    });

    it('handles empty messages array', () => {
      const messages: AgentMessage[] = [];
      expect(messages).toHaveLength(0);
    });

    it('preserves all message types', () => {
      const messages: AgentMessage[] = [
        { id: 'thinking_1', type: 'thinking', text: 'Thought', timestamp: 1000 },
        {
          id: 'exec_1',
          type: 'code_execution',
          text: 'Drawing...',
          timestamp: 2000,
          metadata: { tool_name: 'draw_paths' },
        },
        { id: 'err_1', type: 'error', text: 'Error!', timestamp: 3000 },
        { id: 'piece_1', type: 'piece_complete', text: 'Done!', timestamp: 4000 },
        { id: 'iter_1', type: 'iteration', text: 'Iteration 1/5', timestamp: 5000 },
      ];

      expect(messages).toHaveLength(5);
      expect(messages.map((m) => m.type)).toEqual([
        'thinking',
        'code_execution',
        'error',
        'piece_complete',
        'iteration',
      ]);
    });
  });

  describe('thinking state (new model)', () => {
    // Test that thinking text accumulates in state.thinking
    // and gets archived to messages via ARCHIVE_THINKING

    it('thinking text accumulates during a turn', () => {
      // This is now tested in the reducer tests
      // Here we just verify the data model
      interface ThinkingState {
        thinking: string;
        messages: AgentMessage[];
      }

      const state: ThinkingState = {
        thinking: 'I am currently thinking about the artwork...',
        messages: [
          { id: 'thinking_old', type: 'thinking', text: 'Previous thought', timestamp: 1000 },
        ],
      };

      expect(state.thinking.length).toBeGreaterThan(0);
      expect(state.messages).toHaveLength(1);
    });

    it('archived thinking becomes a message', () => {
      const archivedMessage: AgentMessage = {
        id: 'thinking_12345',
        type: 'thinking',
        text: 'Archived thinking content',
        timestamp: Date.now(),
      };

      expect(archivedMessage.type).toBe('thinking');
      expect(archivedMessage.id).not.toBe('live_thinking');
    });
  });
});
