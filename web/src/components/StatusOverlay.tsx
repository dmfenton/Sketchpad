/**
 * StatusOverlay - Shows agent status in a fixed position above the canvas.
 *
 * Modes:
 * - Thinking: Bionic reading display, 2-3 words at a time with fade animation
 * - Executing: "Running [tool_name]..." with spinner
 * - Drawing: "Drawing..." with animated indicator
 * - Idle/Paused: Subtle indicator
 */

import React, { useMemo } from 'react';
import type { AgentMessage, AgentStatus } from '@code-monet/shared';
import {
  bionicWord,
  getLastToolCall,
  TOOL_DISPLAY_NAMES,
  useProgressiveText,
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
  // Progressive text display via shared hook (only when animating)
  const { displayedWords, isBuffering } = useProgressiveText(isAnimating ? text : null);

  // All words for when not animating (show everything immediately)
  const allWords = useMemo(() => text.split(/\s+/).filter((w) => w.length > 0), [text]);

  // When not animating, show all words immediately
  const wordsToShow = isAnimating ? displayedWords : allWords;
  const showCursor = isAnimating && isBuffering;

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
      {showCursor && <span className="cursor"> ▍</span>}
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
