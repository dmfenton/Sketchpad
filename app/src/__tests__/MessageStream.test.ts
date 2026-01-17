/**
 * Tests for MessageStream component logic.
 *
 * Tests the message filtering and history display logic.
 */

import { LIVE_MESSAGE_ID } from '@code-monet/shared';
import type { AgentMessage } from '@code-monet/shared';

describe('MessageStream', () => {
  describe('message filtering', () => {
    // The filtering logic from MessageStream
    const filterHistoryMessages = (messages: AgentMessage[]): AgentMessage[] => {
      return messages.filter((m) => m.id !== LIVE_MESSAGE_ID);
    };

    it('filters out live message', () => {
      const messages: AgentMessage[] = [
        { id: '1', type: 'thinking', text: 'First thought', timestamp: 1000 },
        { id: LIVE_MESSAGE_ID, type: 'thinking', text: 'Live streaming...', timestamp: 2000 },
        { id: '2', type: 'thinking', text: 'Second thought', timestamp: 3000 },
      ];

      const filtered = filterHistoryMessages(messages);

      expect(filtered).toHaveLength(2);
      expect(filtered.map((m) => m.id)).toEqual(['1', '2']);
    });

    it('returns all messages when no live message present', () => {
      const messages: AgentMessage[] = [
        { id: '1', type: 'thinking', text: 'First', timestamp: 1000 },
        { id: '2', type: 'thinking', text: 'Second', timestamp: 2000 },
      ];

      const filtered = filterHistoryMessages(messages);

      expect(filtered).toHaveLength(2);
      expect(filtered).toEqual(messages);
    });

    it('returns empty array when only live message exists', () => {
      const messages: AgentMessage[] = [
        { id: LIVE_MESSAGE_ID, type: 'thinking', text: 'Live...', timestamp: 1000 },
      ];

      const filtered = filterHistoryMessages(messages);

      expect(filtered).toHaveLength(0);
    });

    it('returns empty array for empty input', () => {
      expect(filterHistoryMessages([])).toEqual([]);
    });

    it('preserves message order', () => {
      const messages: AgentMessage[] = [
        { id: '3', type: 'thinking', text: 'Third', timestamp: 3000 },
        { id: '1', type: 'thinking', text: 'First', timestamp: 1000 },
        { id: LIVE_MESSAGE_ID, type: 'thinking', text: 'Live', timestamp: 2500 },
        { id: '2', type: 'thinking', text: 'Second', timestamp: 2000 },
      ];

      const filtered = filterHistoryMessages(messages);

      expect(filtered.map((m) => m.id)).toEqual(['3', '1', '2']);
    });

    it('preserves all message types in history', () => {
      const messages: AgentMessage[] = [
        { id: '1', type: 'thinking', text: 'Thought', timestamp: 1000 },
        {
          id: '2',
          type: 'code_execution',
          text: 'Drawing...',
          timestamp: 2000,
          metadata: { tool_name: 'draw_paths' },
        },
        { id: '3', type: 'error', text: 'Error!', timestamp: 3000 },
        { id: '4', type: 'piece_complete', text: 'Done!', timestamp: 4000 },
        { id: '5', type: 'iteration', text: 'Iteration 1/5', timestamp: 5000 },
      ];

      const filtered = filterHistoryMessages(messages);

      expect(filtered).toHaveLength(5);
      expect(filtered.map((m) => m.type)).toEqual([
        'thinking',
        'code_execution',
        'error',
        'piece_complete',
        'iteration',
      ]);
    });
  });

  describe('live message extraction', () => {
    // The extraction logic from App.tsx
    const extractLiveMessage = (messages: AgentMessage[]): AgentMessage | null => {
      return messages.find((m) => m.id === LIVE_MESSAGE_ID) ?? null;
    };

    it('extracts live message when present', () => {
      const liveMsg: AgentMessage = {
        id: LIVE_MESSAGE_ID,
        type: 'thinking',
        text: 'Live content',
        timestamp: 2000,
      };
      const messages: AgentMessage[] = [
        { id: '1', type: 'thinking', text: 'First', timestamp: 1000 },
        liveMsg,
        { id: '2', type: 'thinking', text: 'Second', timestamp: 3000 },
      ];

      expect(extractLiveMessage(messages)).toEqual(liveMsg);
    });

    it('returns null when no live message', () => {
      const messages: AgentMessage[] = [
        { id: '1', type: 'thinking', text: 'First', timestamp: 1000 },
        { id: '2', type: 'thinking', text: 'Second', timestamp: 2000 },
      ];

      expect(extractLiveMessage(messages)).toBeNull();
    });

    it('returns null for empty messages', () => {
      expect(extractLiveMessage([])).toBeNull();
    });
  });
});
