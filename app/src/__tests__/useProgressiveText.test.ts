/**
 * Tests for useProgressiveText hook logic.
 *
 * Since the app workspace doesn't have @testing-library/react available,
 * we test the hook's logic by simulating the state machine behavior.
 *
 * The hook essentially implements:
 * 1. Split text into words
 * 2. On each timer tick, increment displayedWordCount by chunkSize
 * 3. Slice words to displayedWordCount (bounded)
 * 4. Reset when text is null or significantly shorter
 */

import { splitWords, BIONIC_CHUNK_SIZE, BIONIC_CHUNK_INTERVAL_MS } from '@code-monet/shared';

/**
 * Simulates the progressive text state machine.
 * This mirrors the hook's logic without needing React.
 */
interface ProgressiveTextState {
  text: string | null;
  allWords: string[];
  displayedWordCount: number;
  prevTextLength: number;
}

function createInitialState(text: string | null): ProgressiveTextState {
  const allWords = text ? splitWords(text) : [];
  return {
    text,
    allWords,
    displayedWordCount: 0,
    prevTextLength: text?.length ?? 0,
  };
}

function updateText(state: ProgressiveTextState, newText: string | null): ProgressiveTextState {
  const newLength = newText?.length ?? 0;
  const allWords = newText ? splitWords(newText) : [];

  // Reset logic: if text is null or much shorter, reset displayedWordCount
  const shouldReset = !newText || newLength < state.prevTextLength / 2;

  return {
    text: newText,
    allWords,
    displayedWordCount: shouldReset ? 0 : state.displayedWordCount,
    prevTextLength: newLength,
  };
}

function timerTick(state: ProgressiveTextState, chunkSize: number): ProgressiveTextState {
  // Timer increments displayed count (bounded at render time)
  return {
    ...state,
    displayedWordCount: state.displayedWordCount + chunkSize,
  };
}

function getDisplayedWords(state: ProgressiveTextState): string[] {
  // Bounds handled at render time via slice
  return state.allWords.slice(0, Math.min(state.displayedWordCount, state.allWords.length));
}

function isBuffering(state: ProgressiveTextState): boolean {
  return state.displayedWordCount < state.allWords.length;
}

function needsTimer(state: ProgressiveTextState): boolean {
  return state.allWords.length > 0 && state.displayedWordCount < state.allWords.length;
}

describe('useProgressiveText logic', () => {
  describe('initial state', () => {
    it('returns empty state for null text', () => {
      const state = createInitialState(null);

      expect(getDisplayedWords(state)).toEqual([]);
      expect(isBuffering(state)).toBe(false);
      expect(state.allWords.length).toBe(0);
    });

    it('returns empty state for empty string', () => {
      const state = createInitialState('');

      expect(getDisplayedWords(state)).toEqual([]);
      expect(isBuffering(state)).toBe(false);
      expect(state.allWords.length).toBe(0);
    });

    it('starts with no words displayed but buffering true', () => {
      const state = createInitialState('hello world');

      expect(getDisplayedWords(state)).toEqual([]);
      expect(isBuffering(state)).toBe(true);
      expect(state.allWords.length).toBe(2);
    });
  });

  describe('progressive reveal', () => {
    it('reveals words in chunks after timer ticks', () => {
      let state = createInitialState('one two three four five six');
      const chunkSize = 3;

      // Initially no words shown
      expect(getDisplayedWords(state)).toEqual([]);
      expect(isBuffering(state)).toBe(true);

      // After first timer tick
      state = timerTick(state, chunkSize);
      expect(getDisplayedWords(state)).toEqual(['one', 'two', 'three']);
      expect(isBuffering(state)).toBe(true);

      // After second timer tick
      state = timerTick(state, chunkSize);
      expect(getDisplayedWords(state)).toEqual(['one', 'two', 'three', 'four', 'five', 'six']);
      expect(isBuffering(state)).toBe(false);
    });

    it('stops buffering when all words revealed', () => {
      let state = createInitialState('one two');
      const chunkSize = 3;

      expect(isBuffering(state)).toBe(true);

      state = timerTick(state, chunkSize);

      expect(getDisplayedWords(state)).toEqual(['one', 'two']);
      expect(isBuffering(state)).toBe(false);
    });

    it('does not need more timers after all words revealed', () => {
      let state = createInitialState('one two');
      state = timerTick(state, 3);

      expect(getDisplayedWords(state)).toEqual(['one', 'two']);
      expect(needsTimer(state)).toBe(false);

      // Extra ticks don't break anything (bounds handled in slice)
      state = timerTick(state, 3);
      state = timerTick(state, 3);
      expect(getDisplayedWords(state)).toEqual(['one', 'two']);
    });
  });

  describe('text updates (streaming deltas)', () => {
    it('continues revealing when new words are added', () => {
      let state = createInitialState('one two three');
      const chunkSize = 3;

      // Reveal first chunk
      state = timerTick(state, chunkSize);
      expect(getDisplayedWords(state)).toEqual(['one', 'two', 'three']);
      expect(isBuffering(state)).toBe(false);

      // New words arrive (simulating streaming delta)
      state = updateText(state, 'one two three four five six');

      // Should now be buffering again
      expect(isBuffering(state)).toBe(true);
      // Should still show the 3 words we already revealed
      expect(getDisplayedWords(state)).toEqual(['one', 'two', 'three']);

      // After next timer tick, new words appear
      state = timerTick(state, chunkSize);
      expect(getDisplayedWords(state)).toEqual(['one', 'two', 'three', 'four', 'five', 'six']);
      expect(isBuffering(state)).toBe(false);
    });

    it('handles rapid successive updates correctly', () => {
      // This is the key test for the closure bug fix
      let state = createInitialState('a');

      // Rapid updates before any timer fires
      state = updateText(state, 'a b');
      state = updateText(state, 'a b c');
      state = updateText(state, 'a b c d');
      state = updateText(state, 'a b c d e');

      // No words shown yet
      expect(getDisplayedWords(state)).toEqual([]);
      expect(state.allWords.length).toBe(5);

      // After timer tick, should show chunk of CURRENT word count
      state = timerTick(state, 3);
      expect(getDisplayedWords(state)).toEqual(['a', 'b', 'c']);

      // Continue to reveal all
      state = timerTick(state, 3);
      expect(getDisplayedWords(state)).toEqual(['a', 'b', 'c', 'd', 'e']);
      expect(isBuffering(state)).toBe(false);
    });

    it('handles updates arriving between timer ticks', () => {
      let state = createInitialState('one two three');
      const chunkSize = 3;

      // Before timer fires, new text arrives
      state = updateText(state, 'one two three four five');

      // Timer fires - should reveal first chunk
      state = timerTick(state, chunkSize);
      expect(getDisplayedWords(state)).toEqual(['one', 'two', 'three']);
      expect(isBuffering(state)).toBe(true);

      // Next tick includes the remaining words
      state = timerTick(state, chunkSize);
      expect(getDisplayedWords(state)).toEqual(['one', 'two', 'three', 'four', 'five']);
    });
  });

  describe('text reset', () => {
    it('resets when text becomes null', () => {
      let state = createInitialState('one two three');

      // Reveal some words
      state = timerTick(state, 3);
      expect(getDisplayedWords(state)).toEqual(['one', 'two', 'three']);

      // Text becomes null (e.g., FINALIZE_LIVE_MESSAGE)
      state = updateText(state, null);

      expect(getDisplayedWords(state)).toEqual([]);
      expect(isBuffering(state)).toBe(false);
    });

    it('resets when text becomes much shorter (new turn)', () => {
      let state = createInitialState('one two three four five six seven eight');

      // Reveal some words
      state = timerTick(state, 3);
      expect(getDisplayedWords(state).length).toBe(3);

      // New turn starts with short text (less than half previous length)
      state = updateText(state, 'new');

      // Should reset - waiting to reveal the new word
      expect(getDisplayedWords(state)).toEqual([]);
      expect(isBuffering(state)).toBe(true);
      expect(state.allWords.length).toBe(1);

      // After timer tick, new word appears
      state = timerTick(state, 3);
      expect(getDisplayedWords(state)).toEqual(['new']);
    });

    it('does not reset when text grows', () => {
      let state = createInitialState('one two three');

      // Reveal first chunk
      state = timerTick(state, 3);
      expect(getDisplayedWords(state)).toEqual(['one', 'two', 'three']);

      // Text grows (delta appended)
      state = updateText(state, 'one two three four five six');

      // Should NOT reset - keep the 3 revealed words
      expect(getDisplayedWords(state)).toEqual(['one', 'two', 'three']);
      expect(isBuffering(state)).toBe(true);
    });
  });

  describe('custom options', () => {
    it('respects custom chunk size', () => {
      let state = createInitialState('a b c d e f');
      const chunkSize = 2;

      state = timerTick(state, chunkSize);
      expect(getDisplayedWords(state)).toEqual(['a', 'b']);

      state = timerTick(state, chunkSize);
      expect(getDisplayedWords(state)).toEqual(['a', 'b', 'c', 'd']);

      state = timerTick(state, chunkSize);
      expect(getDisplayedWords(state)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    });
  });

  describe('displayedText convenience', () => {
    it('words can be joined with spaces', () => {
      let state = createInitialState('hello world');
      state = timerTick(state, 3);

      const displayedText = getDisplayedWords(state).join(' ');
      expect(displayedText).toBe('hello world');
    });
  });

  describe('default constants', () => {
    it('uses expected default chunk size', () => {
      expect(BIONIC_CHUNK_SIZE).toBe(3);
    });

    it('uses expected default interval', () => {
      expect(BIONIC_CHUNK_INTERVAL_MS).toBe(150);
    });
  });
});
