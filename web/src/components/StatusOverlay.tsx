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
  chunkWords,
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
 * Thinking display with bionic reading animation.
 * When isAnimating is false, shows the last chunk statically.
 */
function ThinkingDisplay({
  text,
  isAnimating = true,
}: {
  text: string;
  isAnimating?: boolean;
}): React.ReactElement {
  const [chunkIndex, setChunkIndex] = useState(0);
  const [opacity, setOpacity] = useState(1);
  const prevTextRef = useRef(text);

  // Split text into chunks
  const chunks = useMemo(() => chunkWords(text, BIONIC_CHUNK_SIZE), [text]);

  // Reset when text changes significantly (new turn)
  useEffect(() => {
    // If text was cleared or completely replaced, reset
    if (text.length < prevTextRef.current.length / 2) {
      setChunkIndex(0);
    }
    prevTextRef.current = text;
  }, [text]);

  // Cycle through chunks (only when animating)
  useEffect(() => {
    if (chunks.length === 0 || !isAnimating) return;

    let timeoutId: ReturnType<typeof setTimeout>;

    const interval = setInterval(() => {
      setOpacity(0); // Fade out

      timeoutId = setTimeout(() => {
        setChunkIndex((prev) => {
          // Move to next chunk, or stay at last if we're at the end
          const next = prev + 1;
          return next >= chunks.length ? Math.max(0, chunks.length - 1) : next;
        });
        setOpacity(1); // Fade in
      }, 50); // Short fade duration
    }, BIONIC_CHUNK_INTERVAL_MS);

    return () => {
      clearInterval(interval);
      clearTimeout(timeoutId);
    };
  }, [chunks.length, isAnimating]);

  // When animation stops, jump to last chunk
  useEffect(() => {
    if (!isAnimating && chunks.length > 0) {
      setChunkIndex(chunks.length - 1);
      setOpacity(1);
    }
  }, [isAnimating, chunks.length]);

  // Clamp index if chunks changed
  const safeIndex = Math.min(chunkIndex, Math.max(0, chunks.length - 1));
  const currentChunk = chunks[safeIndex] ?? [];

  if (chunks.length === 0) {
    return <span className="status-text">Thinking...</span>;
  }

  return (
    <div className="thinking-display" style={{ opacity }}>
      {currentChunk.map((word, i) => (
        <React.Fragment key={`${safeIndex}-${i}`}>
          <BionicWord word={word} />
          {i < currentChunk.length - 1 && ' '}
        </React.Fragment>
      ))}
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
