/**
 * Drawing Agent Web App - Studio View
 */

import React, { useCallback } from 'react';
import type { PendingStroke, ServerMessage } from '@code-monet/shared';
import {
  deriveAgentStatus,
  hasInProgressEvents,
  shouldShowIdleAnimation,
  STATUS_LABELS,
  useStrokeAnimation,
} from '@code-monet/shared';
import { getApiUrl } from './config';

import { Canvas } from './components/Canvas';
import { MessageStream } from './components/MessageStream';
import { DebugPanel } from './components/DebugPanel';
import { ActionBar } from './components/ActionBar';
import { StatusOverlay } from './components/StatusOverlay';
import { useCanvas } from './hooks/useCanvas';
import { useWebSocket } from './hooks/useWebSocket';
import { useDebug } from './hooks/useDebug';
import { useAuth } from './context/AuthContext';

function App(): React.ReactElement {
  const { state, dispatch, handleMessage, startStroke, addPoint, endStroke, toggleDrawing } =
    useCanvas();

  const { accessToken } = useAuth();
  const { logMessage, ...debug } = useDebug({ token: accessToken });

  // Fetch pending strokes from server
  const fetchStrokes = useCallback(async (): Promise<PendingStroke[]> => {
    if (!accessToken) throw new Error('Not authenticated');
    const response = await fetch(`${getApiUrl()}/strokes/pending`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) throw new Error('Failed to fetch strokes');
    const data = await response.json();
    return data.strokes as PendingStroke[];
  }, [accessToken]);

  // Derive status from messages
  const agentStatus = deriveAgentStatus(state);

  // Use shared animation hook for agent-drawn strokes
  // Gate on: not paused AND no in-progress tool calls
  // This ensures tool completion events are shown before animation starts,
  // but allows animation while agent is thinking (so it's not blocked forever)
  const inProgressEvents = hasInProgressEvents(state.messages);
  const canRenderStrokes = !state.paused && !inProgressEvents;

  // Debug logging for stroke rendering
  console.log('[DEBUG] Stroke state:', {
    pendingStrokes: state.pendingStrokes,
    paused: state.paused,
    inProgressEvents,
    canRenderStrokes,
    strokeCount: state.strokes.length,
    messages: state.messages.map((m) => ({
      type: m.type,
      tool: m.metadata?.tool_name,
      returnCode: m.metadata?.return_code,
    })),
  });

  useStrokeAnimation({
    pendingStrokes: state.pendingStrokes,
    dispatch,
    fetchStrokes,
    canRender: canRenderStrokes,
  });

  const onMessage = useCallback(
    (message: ServerMessage) => {
      handleMessage(message);
      logMessage(message);
    },
    [handleMessage, logMessage]
  );

  const { status: wsStatus, send } = useWebSocket({ onMessage, token: accessToken });

  const handleStrokeEnd = useCallback(() => {
    const path = endStroke();
    if (path) {
      send({ type: 'stroke', points: path.points });
    }
  }, [endStroke, send]);

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <h1>Drawing Agent</h1>
          <div className="connection-status">
            <div className={`connection-dot ${wsStatus}`} />
          </div>
        </div>
        <div className="header-center">
          <div className={`status-pill ${agentStatus}`}>{STATUS_LABELS[agentStatus]}</div>
        </div>
        <div className="header-right">
          <span className="piece-count">Piece #{state.pieceNumber}</span>
        </div>
      </header>

      <ActionBar
        paused={state.paused}
        drawingEnabled={state.drawingEnabled}
        drawingStyle={state.drawingStyle}
        onSend={send}
        onToggleDrawing={toggleDrawing}
      />

      <div className="thinking-strip">
        <StatusOverlay status={agentStatus} thinking={state.thinking} messages={state.messages} />
      </div>

      <div className="canvas-container">
        <Canvas
          strokes={state.strokes}
          currentStroke={state.currentStroke}
          agentStroke={state.agentStroke}
          agentStrokeStyle={state.agentStrokeStyle}
          penPosition={state.penPosition}
          penDown={state.penDown}
          drawingEnabled={state.drawingEnabled}
          styleConfig={state.styleConfig}
          showIdleAnimation={shouldShowIdleAnimation(state)}
          onStrokeStart={startStroke}
          onStrokeMove={addPoint}
          onStrokeEnd={handleStrokeEnd}
        />
      </div>

      <div className="right-panel">
        <MessageStream messages={state.messages} />
        <DebugPanel
          agent={debug.agent}
          files={debug.files}
          messageLog={debug.messageLog}
          onRefresh={debug.refresh}
          onClearLog={debug.clearLog}
        />
      </div>
    </div>
  );
}

export default App;
