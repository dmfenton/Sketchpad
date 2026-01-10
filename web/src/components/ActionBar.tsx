/**
 * Action bar with controls for the drawing agent.
 */

import { useState, useCallback } from 'react';
import type { ClientMessage } from '@drawing-agent/shared';

interface ActionBarProps {
  paused: boolean;
  drawingEnabled: boolean;
  onSend: (message: ClientMessage) => void;
  onToggleDrawing: () => void;
}

export function ActionBar({ paused, drawingEnabled, onSend, onToggleDrawing }: ActionBarProps) {
  const [nudgeText, setNudgeText] = useState('');

  const handlePauseResume = useCallback(() => {
    onSend({ type: paused ? 'resume' : 'pause' });
  }, [paused, onSend]);

  const handleClear = useCallback(() => {
    onSend({ type: 'clear' });
  }, [onSend]);

  const handleNewCanvas = useCallback(() => {
    onSend({ type: 'new_canvas' });
  }, [onSend]);

  const handleNudge = useCallback(() => {
    if (nudgeText.trim()) {
      onSend({ type: 'nudge', text: nudgeText.trim() });
      setNudgeText('');
    }
  }, [nudgeText, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleNudge();
      }
    },
    [handleNudge]
  );

  return (
    <div className="action-bar">
      <button className={paused ? 'primary' : 'secondary'} onClick={handlePauseResume}>
        {paused ? '▶ Start' : '⏸ Pause'}
      </button>

      <button className="secondary" onClick={handleClear}>
        Clear
      </button>

      <button className="secondary" onClick={handleNewCanvas}>
        New Piece
      </button>

      <button className={drawingEnabled ? 'primary' : 'secondary'} onClick={onToggleDrawing}>
        {drawingEnabled ? '✏️ Drawing' : '✏️ Draw'}
      </button>

      <input
        type="text"
        placeholder="Nudge the artist..."
        value={nudgeText}
        onChange={(e) => setNudgeText(e.target.value)}
        onKeyDown={handleKeyDown}
      />

      <button className="primary" onClick={handleNudge} disabled={!nudgeText.trim()}>
        Send
      </button>
    </div>
  );
}
