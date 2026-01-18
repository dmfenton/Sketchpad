/**
 * StatusOverlay - Shows agent status in a fixed position above the canvas.
 *
 * Modes:
 * - Thinking: Bionic reading display, 2-3 words at a time with fade animation
 * - Executing: "Running [tool_name]..." with spinner
 * - Drawing: "Drawing..." with animated indicator
 * - Idle/Paused: Subtle indicator
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { AgentMessage, AgentStatus } from '@code-monet/shared';
import {
  bionicWord,
  getLastToolCall,
  TOOL_DISPLAY_NAMES,
  BIONIC_CHUNK_INTERVAL_MS,
  BIONIC_CHUNK_SIZE,
} from '@code-monet/shared';

interface StatusOverlayProps {
  status: AgentStatus;
  thinking: string;
  messages: AgentMessage[];
}

/**
 * Render a word with bionic formatting (bold first part).
 */
function BionicWord({ word }: { word: string }): React.ReactElement {
  const { bold, regular } = bionicWord(word);
  return (
    <span className="bionic-word">
      <strong>{bold}</strong>
      {regular}
    </span>
  );
}

/**
 * Thinking display with progressive bionic reading.
 * Accumulates words at a readable pace, showing a few words at a time.
 * Uses bionic formatting (bold first 40% of each word) to guide eye movement.
 */
function ThinkingDisplay({
  text,
  isAnimating = true,
}: {
  text: string;
  isAnimating?: boolean;
}): React.ReactElement {
  // Track how many words to display (accumulating, not replacing)
  const [displayedWordCount, setDisplayedWordCount] = useState(0);
  const prevTextRef = useRef(text);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Split text into individual words
  const allWords = useMemo(() => text.split(/\s+/).filter((w) => w.length > 0), [text]);

  // Reset when text is cleared (new turn)
  useEffect(() => {
    if (text.length < prevTextRef.current.length / 2) {
      setDisplayedWordCount(0);
    }
    prevTextRef.current = text;
  }, [text]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  // Progressively reveal words at a readable pace
  useEffect(() => {
    if (!isAnimating || allWords.length === 0) return;

    // If we have more words than displayed, schedule next chunk
    if (displayedWordCount < allWords.length && !timerRef.current) {
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        setDisplayedWordCount((prev) => Math.min(prev + BIONIC_CHUNK_SIZE, allWords.length));
      }, BIONIC_CHUNK_INTERVAL_MS);
    }
  }, [allWords.length, displayedWordCount, isAnimating]);

  // When animation stops, show all text
  useEffect(() => {
    if (!isAnimating && allWords.length > 0) {
      setDisplayedWordCount(allWords.length);
    }
  }, [isAnimating, allWords.length]);

  // Get words to display (up to displayedWordCount)
  const wordsToShow = allWords.slice(0, displayedWordCount);
  const isBuffering = displayedWordCount < allWords.length;

  if (allWords.length === 0) {
    return <span className="status-text">Thinking...</span>;
  }

  return (
    <div className="thinking-display">
      {wordsToShow.map((word, i) => (
        <React.Fragment key={`word-${i}`}>
          <BionicWord word={word} />
          {i < wordsToShow.length - 1 && ' '}
        </React.Fragment>
      ))}
      {isBuffering && <span className="cursor"> ▍</span>}
    </div>
  );
}

export function StatusOverlay({
  status,
  thinking,
  messages,
}: StatusOverlayProps): React.ReactElement | null {
  const lastTool = getLastToolCall(messages);

  // Show status indicator for non-thinking active states
  const renderStatusBadge = (): React.ReactElement | null => {
    switch (status) {
      case 'executing': {
        const toolLabel = lastTool ? TOOL_DISPLAY_NAMES[lastTool] : 'executing';
        return (
          <div className="status-badge executing">
            <span className="spinner" />
            <span>{toolLabel}</span>
          </div>
        );
      }
      case 'drawing':
        return (
          <div className="status-badge drawing">
            <span className="drawing-icon">✏</span>
            <span>Drawing</span>
          </div>
        );
      default:
        return null;
    }
  };

  // Active states that should show thinking (if available) + status badge
  const isActiveState = status === 'thinking' || status === 'executing' || status === 'drawing';

  if (!isActiveState) {
    // Paused, idle, error - show simple status
    if (status === 'paused') {
      return (
        <div className="status-overlay">
          <div className="paused-display">
            <span className="status-text muted">Paused</span>
          </div>
        </div>
      );
    }
    if (status === 'error') {
      return (
        <div className="status-overlay">
          <div className="error-display">
            <span className="status-text error">Error</span>
          </div>
        </div>
      );
    }
    return null; // idle
  }

  // Active state: show thinking text (if any) with status badge
  const statusBadge = renderStatusBadge();
  const isThinking = status === 'thinking';

  return (
    <div className="status-overlay">
      {thinking ? (
        <ThinkingDisplay text={thinking} isAnimating={isThinking} />
      ) : (
        <span className="status-text">Thinking...</span>
      )}
      {statusBadge}
    </div>
  );
}
