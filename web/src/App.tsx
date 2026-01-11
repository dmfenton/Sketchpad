/**
 * Drawing Agent Web Dev Server
 */

import React, { useCallback, useRef } from 'react';
import type { PendingStroke, ServerMessage } from '@drawing-agent/shared';
import { STATUS_LABELS, useStrokeAnimation } from '@drawing-agent/shared';
import { getApiUrl } from './config';

import { Canvas } from './components/Canvas';
import { MessageStream } from './components/MessageStream';
import { DebugPanel } from './components/DebugPanel';
import { ActionBar } from './components/ActionBar';
import { useCanvas } from './hooks/useCanvas';
import { useWebSocket } from './hooks/useWebSocket';
import { useDebug } from './hooks/useDebug';

function App(): React.ReactElement {
  const { state, dispatch, handleMessage, startStroke, addPoint, endStroke, toggleDrawing } =
    useCanvas();

  const { logMessage, ...debug } = useDebug();

  // Token cache for REST API calls
  const tokenRef = useRef<string | null>(null);

  // Get dev token for REST API calls
  const getToken = useCallback(async (): Promise<string> => {
    if (tokenRef.current) return tokenRef.current;
    const response = await fetch(`${getApiUrl()}/auth/dev-token`);
    if (!response.ok) throw new Error('Failed to get dev token');
    const data = await response.json();
    tokenRef.current = data.access_token as string;
    return tokenRef.current;
  }, []);

  // Fetch pending strokes from server
  const fetchStrokes = useCallback(async (): Promise<PendingStroke[]> => {
    const token = await getToken();
    const response = await fetch(`${getApiUrl()}/strokes/pending`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error('Failed to fetch strokes');
    const data = await response.json();
    return data.strokes as PendingStroke[];
  }, [getToken]);

  // Use shared animation hook
  useStrokeAnimation({
    pendingStrokes: state.pendingStrokes,
    dispatch,
    fetchStrokes,
  });

  const onMessage = useCallback(
    (message: ServerMessage) => {
      handleMessage(message);
      logMessage(message);
    },
    [handleMessage, logMessage]
  );

  const { status: wsStatus, send } = useWebSocket({ onMessage });

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
          <div className={`status-pill ${state.agentStatus}`}>
            {STATUS_LABELS[state.agentStatus]}
          </div>
        </div>
        <div className="header-right">
          <span className="piece-count">Piece #{state.pieceCount}</span>
        </div>
      </header>

      <ActionBar
        paused={state.paused}
        drawingEnabled={state.drawingEnabled}
        onSend={send}
        onToggleDrawing={toggleDrawing}
      />

      <div className="canvas-container">
        <Canvas
          strokes={state.strokes}
          currentStroke={state.currentStroke}
          agentStroke={state.agentStroke}
          penPosition={state.penPosition}
          penDown={state.penDown}
          drawingEnabled={state.drawingEnabled}
          onStrokeStart={startStroke}
          onStrokeMove={addPoint}
          onStrokeEnd={handleStrokeEnd}
        />
      </div>

      <div className="right-panel">
        <MessageStream messages={state.messages} status={state.agentStatus} />
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
