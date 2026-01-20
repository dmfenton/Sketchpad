/**
 * React hook for progressive word-by-word text display.
 *
 * Used for "bionic reading" style text reveal where words appear
 * in chunks at a readable pace, creating a typewriter-like effect.
 *
 * This hook handles buffering internally - it keeps displaying text
 * until the animation catches up, even if the input becomes null.
 * This ensures smooth transitions when live messages are finalized.
 */

import { useEffect, useMemo, useState, useRef } from 'react';

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
 * - Internal buffering: keeps displaying until caught up, even if input becomes null
 * - Only clears when display has caught up AND input is null
 * - Accepts new/longer text immediately
 * - Cleans up timers on unmount
 *
 * @param text - The text to reveal, or null to signal end of stream
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

  // Internal buffer: keeps the last non-null text until display catches up
  const [bufferedText, setBufferedText] = useState<string | null>(null);

  // Track how many words to display (accumulating, not replacing)
  const [displayedWordCount, setDisplayedWordCount] = useState(0);

  // Track previous text length to detect new messages (significant shortening)
  const prevTextLengthRef = useRef(0);

  // Update buffer when text changes
  useEffect(() => {
    const currentLength = text?.length ?? 0;

    if (text !== null) {
      // New or longer text - accept immediately
      if (currentLength >= prevTextLengthRef.current) {
        setBufferedText(text);
      }
      // Significantly shorter - likely a new message, reset
      else if (currentLength < prevTextLengthRef.current / 2) {
        setBufferedText(text);
        setDisplayedWordCount(0);
      }
      prevTextLengthRef.current = currentLength;
    }
    // When text becomes null, we DON'T clear the buffer yet
    // We let the display finish catching up first (handled below)
  }, [text]);

  // Split buffered text into individual words (memoized)
  const allWords = useMemo(() => {
    if (!bufferedText) return [];
    return splitWords(bufferedText);
  }, [bufferedText]);

  // Check if display has caught up
  const displayComplete = displayedWordCount >= allWords.length;

  // Clear buffer when: input is null AND display is complete
  useEffect(() => {
    if (text === null && displayComplete && bufferedText !== null) {
      setBufferedText(null);
      setDisplayedWordCount(0);
      prevTextLengthRef.current = 0;
    }
  }, [text, displayComplete, bufferedText]);

  // Progressively reveal words at a readable pace
  // Effect cleanup cancels timer when deps change, so each run is independent
  useEffect(() => {
    if (allWords.length === 0 || displayedWordCount >= allWords.length) return;

    const timer = setTimeout(() => {
      setDisplayedWordCount((prev) => prev + chunkSize);
    }, intervalMs);

    return () => clearTimeout(timer);
  }, [allWords.length, displayedWordCount, chunkSize, intervalMs]);

  // Derive return values - slice handles out-of-bounds naturally
  const displayedWords = allWords.slice(0, displayedWordCount);
  const displayedText = displayedWords.join(' ');
  const isBuffering = displayedWordCount < allWords.length;

  return {
    displayedWords,
    displayedText,
    isBuffering,
    wordCount: allWords.length,
  };
}
