/**
 * Drawing Agent Web App - Studio View
 */

import React, { useCallback, useEffect, useRef } from 'react';
import type { PendingStroke, ServerMessage } from '@code-monet/shared';
import {
  deriveAgentStatus,
  shouldShowIdleAnimation,
  STATUS_LABELS,
  useCanvas,
  usePerformer,
} from '@code-monet/shared';
import { getApiUrl } from './config';

import { Canvas } from './components/Canvas';
import { MessageStream } from './components/MessageStream';
import { DebugPanel } from './components/DebugPanel';
import { ActionBar } from './components/ActionBar';
import { StatusOverlay } from './components/StatusOverlay';
import { useWebSocket } from './hooks/useWebSocket';
import { useDebug } from './hooks/useDebug';
import { useAuth } from './context/AuthContext';

function App(): React.ReactElement {
  const { state, dispatch, handleMessage, startStroke, addPoint, endStroke, toggleDrawing } =
    useCanvas();

  const { accessToken } = useAuth();
  const { logMessage, ...debug } = useDebug({ token: accessToken });

  // Derive status from messages
  const agentStatus = deriveAgentStatus(state);

  // Fetch and enqueue strokes when pendingStrokes arrives
  const lastFetchedBatchRef = useRef<number>(0);
  useEffect(() => {
    const { pendingStrokes } = state;
    if (!pendingStrokes || !accessToken) return;
    if (pendingStrokes.batchId <= lastFetchedBatchRef.current) return;

    const fetchAndEnqueue = async () => {
      try {
        const response = await fetch(`${getApiUrl()}/strokes/pending`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!response.ok) throw new Error('Failed to fetch strokes');
        const data = (await response.json()) as { strokes: PendingStroke[] };
        lastFetchedBatchRef.current = pendingStrokes.batchId;
        dispatch({ type: 'ENQUEUE_STROKES', strokes: data.strokes });
        dispatch({ type: 'CLEAR_PENDING_STROKES' });
      } catch (error) {
        console.error('[App] Failed to fetch strokes:', error);
      }
    };

    void fetchAndEnqueue();
  }, [state.pendingStrokes, accessToken, dispatch]);

  // Callback when stroke animation completes
  const sendRef = useRef<((msg: { type: 'animation_done' }) => void) | null>(null);
  const handleStrokesComplete = useCallback(() => {
    sendRef.current?.({ type: 'animation_done' });
  }, []);

  // Performance animation loop
  usePerformer({
    performance: state.performance,
    dispatch,
    paused: state.paused,
    inStudio: true, // Web app is always in studio mode
    onStrokesComplete: handleStrokesComplete,
  });

  const onMessage = useCallback(
    (message: ServerMessage) => {
      handleMessage(message);
      logMessage(message);
    },
    [handleMessage, logMessage]
  );

  const { status: wsStatus, send } = useWebSocket({ onMessage, token: accessToken });

  // Keep sendRef in sync for stroke completion callback
  useEffect(() => {
    sendRef.current = send;
  }, [send]);

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
        <StatusOverlay status={agentStatus} performance={state.performance} messages={state.messages} />
      </div>

      <div className="canvas-container">
        <Canvas
          strokes={state.strokes}
          currentStroke={state.currentStroke}
          agentStroke={state.performance.agentStroke}
          agentStrokeStyle={state.performance.agentStrokeStyle}
          penPosition={state.performance.penPosition}
          penDown={state.performance.penDown}
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
