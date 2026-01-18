/**
 * React hook for progressive word-by-word text display.
 *
 * Used for "bionic reading" style text reveal where words appear
 * in chunks at a readable pace, creating a typewriter-like effect.
 */

import { useEffect, useMemo, useRef, useState } from 'react';

import { BIONIC_CHUNK_INTERVAL_MS, BIONIC_CHUNK_SIZE, splitWords } from '../utils';

export interface UseProgressiveTextOptions {
  /** Number of words to reveal per chunk (default: BIONIC_CHUNK_SIZE = 3) */
  chunkSize?: number;
  /** Milliseconds between revealing chunks (default: BIONIC_CHUNK_INTERVAL_MS = 150) */
  intervalMs?: number;
}

export interface UseProgressiveTextResult {
  /** Words revealed so far (array for rendering with keys) */
  displayedWords: string[];
  /** Words joined with spaces (convenience for simple rendering) */
  displayedText: string;
  /** True if more words are pending reveal */
  isBuffering: boolean;
  /** Total word count in the input text */
  wordCount: number;
}

/**
 * Hook that progressively reveals text word-by-word.
 *
 * Features:
 * - Reveals words in chunks (default: 3 words every 150ms)
 * - Resets when text becomes null or significantly shorter
 * - Cleans up timers on unmount
 *
 * @param text - The text to reveal, or null to reset
 * @param options - Optional configuration for chunk size and interval
 * @returns Object with displayedWords, displayedText, isBuffering, wordCount
 *
 * @example
 * ```tsx
 * const { displayedText, isBuffering } = useProgressiveText(liveMessage?.text ?? null);
 *
 * return (
 *   <div>
 *     {displayedText}
 *     {isBuffering && <span className="cursor">|</span>}
 *   </div>
 * );
 * ```
 */
export function useProgressiveText(
  text: string | null,
  options?: UseProgressiveTextOptions
): UseProgressiveTextResult {
  const chunkSize = options?.chunkSize ?? BIONIC_CHUNK_SIZE;
  const intervalMs = options?.intervalMs ?? BIONIC_CHUNK_INTERVAL_MS;

  // Track how many words to display (accumulating, not replacing)
  const [displayedWordCount, setDisplayedWordCount] = useState(0);

  // Timer ref for cleanup
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track previous text length to detect resets
  const prevTextLengthRef = useRef(0);

  // Split text into individual words (memoized)
  const allWords = useMemo(() => {
    if (!text) return [];
    return splitWords(text);
  }, [text]);

  // Reset when text is cleared or significantly shorter (new turn)
  useEffect(() => {
    const currentLength = text?.length ?? 0;

    // Reset if text is null or much shorter than before (likely a new message)
    if (!text || currentLength < prevTextLengthRef.current / 2) {
      setDisplayedWordCount(0);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }

    prevTextLengthRef.current = currentLength;
  }, [text]);

  // Progressively reveal words at a readable pace
  // Timer callback just increments - bounds are handled at render time via slice()
  // This avoids closure capture issues: callback doesn't need current word count
  useEffect(() => {
    // Nothing to reveal
    if (allWords.length === 0) return;

    // Already caught up - no timer needed
    if (displayedWordCount >= allWords.length) return;

    // Schedule next chunk reveal
    timerRef.current = setTimeout(() => {
      // Clear ref BEFORE state update - this ordering ensures cleanup won't
      // try to clear an already-fired timer if effect re-runs synchronously
      timerRef.current = null;
      setDisplayedWordCount((prev) => prev + chunkSize);
    }, intervalMs);

    // Cleanup: cancel timer when dependencies change or unmount
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [allWords.length, displayedWordCount, chunkSize, intervalMs]);

  // Derive return values - slice handles bounds naturally
  const displayedWords = allWords.slice(0, Math.min(displayedWordCount, allWords.length));
  const displayedText = displayedWords.join(' ');
  const isBuffering = displayedWordCount < allWords.length;

  return {
    displayedWords,
    displayedText,
    isBuffering,
    wordCount: allWords.length,
  };
}
