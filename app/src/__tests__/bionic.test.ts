/**
 * Tests for bionic reading utilities.
 */

import { bionicWord, chunkWords, getLastToolCall } from '@code-monet/shared';
import type { AgentMessage } from '@code-monet/shared';

describe('bionicWord', () => {
  it('returns empty bold for single char', () => {
    expect(bionicWord('a')).toEqual({ bold: '', regular: 'a' });
  });

  it('returns empty bold for empty string', () => {
    expect(bionicWord('')).toEqual({ bold: '', regular: '' });
  });

  it('bolds first char for 2-3 char words', () => {
    expect(bionicWord('hi')).toEqual({ bold: 'h', regular: 'i' });
    expect(bionicWord('the')).toEqual({ bold: 't', regular: 'he' });
  });

  it('bolds first 2 chars for 4 char words', () => {
    expect(bionicWord('word')).toEqual({ bold: 'wo', regular: 'rd' });
    expect(bionicWord('test')).toEqual({ bold: 'te', regular: 'st' });
  });

  it('bolds ~40% for longer words', () => {
    expect(bionicWord('reading')).toEqual({ bold: 'rea', regular: 'ding' }); // 7 chars, ceil(7*0.4)=3
    expect(bionicWord('hello')).toEqual({ bold: 'he', regular: 'llo' }); // 5 chars, ceil(5*0.4)=2
    expect(bionicWord('beautiful')).toEqual({ bold: 'beau', regular: 'tiful' }); // 9 chars, ceil(9*0.4)=4
  });
});

describe('chunkWords', () => {
  it('splits text into chunks of specified size', () => {
    expect(chunkWords('one two three four', 2)).toEqual([
      ['one', 'two'],
      ['three', 'four'],
    ]);
  });

  it('handles trailing incomplete chunk', () => {
    expect(chunkWords('one two three', 2)).toEqual([['one', 'two'], ['three']]);
  });

  it('handles empty string', () => {
    expect(chunkWords('', 2)).toEqual([]);
  });

  it('handles whitespace-only string', () => {
    expect(chunkWords('   ', 2)).toEqual([]);
  });

  it('handles single word', () => {
    expect(chunkWords('hello', 2)).toEqual([['hello']]);
  });

  it('respects custom chunk size', () => {
    expect(chunkWords('a b c d e f', 3)).toEqual([
      ['a', 'b', 'c'],
      ['d', 'e', 'f'],
    ]);
  });

  it('handles multiple spaces between words', () => {
    expect(chunkWords('one   two    three', 2)).toEqual([['one', 'two'], ['three']]);
  });
});

describe('getLastToolCall', () => {
  it('returns null for empty messages', () => {
    expect(getLastToolCall([])).toBeNull();
  });

  it('returns null when no code_execution messages', () => {
    const messages: AgentMessage[] = [
      { id: '1', type: 'thinking', text: 'hello', timestamp: Date.now() },
    ];
    expect(getLastToolCall(messages)).toBeNull();
  });

  it('returns tool name from code_execution message', () => {
    const messages: AgentMessage[] = [
      {
        id: '1',
        type: 'code_execution',
        text: 'Drawing...',
        timestamp: Date.now(),
        metadata: { tool_name: 'draw_paths' },
      },
    ];
    expect(getLastToolCall(messages)).toBe('draw_paths');
  });

  it('returns most recent tool call', () => {
    const messages: AgentMessage[] = [
      {
        id: '1',
        type: 'code_execution',
        text: 'First',
        timestamp: Date.now(),
        metadata: { tool_name: 'view_canvas' },
      },
      { id: '2', type: 'thinking', text: 'thinking...', timestamp: Date.now() },
      {
        id: '3',
        type: 'code_execution',
        text: 'Second',
        timestamp: Date.now(),
        metadata: { tool_name: 'draw_paths' },
      },
    ];
    expect(getLastToolCall(messages)).toBe('draw_paths');
  });

  it('skips code_execution without tool_name', () => {
    const messages: AgentMessage[] = [
      {
        id: '1',
        type: 'code_execution',
        text: 'Has tool',
        timestamp: Date.now(),
        metadata: { tool_name: 'view_canvas' },
      },
      {
        id: '2',
        type: 'code_execution',
        text: 'No tool',
        timestamp: Date.now(),
        metadata: {},
      },
    ];
    expect(getLastToolCall(messages)).toBe('view_canvas');
  });
});
