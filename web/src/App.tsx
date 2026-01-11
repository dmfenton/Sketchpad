/**
 * Drawing Agent Web Dev Server
 */

import React, { useCallback, useEffect, useRef } from 'react';
import type { PendingStroke, ServerMessage } from '@drawing-agent/shared';
import { STATUS_LABELS } from '@drawing-agent/shared';
import { getApiUrl } from './config';

import { Canvas } from './components/Canvas';
import { MessageStream } from './components/MessageStream';
import { DebugPanel } from './components/DebugPanel';
import { ActionBar } from './components/ActionBar';
import { useCanvas } from './hooks/useCanvas';
import { useWebSocket } from './hooks/useWebSocket';
import { useDebug } from './hooks/useDebug';

// Animation constants
const ANIMATION_FPS = 60;
const FRAME_DELAY_MS = 1000 / ANIMATION_FPS;

function App(): React.ReactElement {
  const { state, dispatch, handleMessage, startStroke, addPoint, endStroke, toggleDrawing } =
    useCanvas();

  const { logMessage, ...debug } = useDebug();

  // Token cache for REST API calls
  const tokenRef = useRef<string | null>(null);
  const animatingRef = useRef(false);
  const fetchedBatchIdRef = useRef<number>(0);

  // Get dev token for REST API calls
  const getToken = useCallback(async (): Promise<string> => {
    if (tokenRef.current) return tokenRef.current;
    const response = await fetch(`${getApiUrl()}/auth/dev-token`);
    if (!response.ok) throw new Error('Failed to get dev token');
    const data = await response.json();
    tokenRef.current = data.access_token as string;
    return tokenRef.current;
  }, []);

  // Animate strokes by iterating through pre-interpolated points
  const animateStrokes = useCallback(
    async (strokes: PendingStroke[]) => {
      if (animatingRef.current) return;
      animatingRef.current = true;

      for (const stroke of strokes) {
        const points = stroke.points;
        if (points.length === 0) continue;

        // Move to first point (pen up)
        dispatch({ type: 'SET_PEN', x: points[0].x, y: points[0].y, down: false });
        await new Promise((r) => setTimeout(r, FRAME_DELAY_MS));

        // Lower pen
        dispatch({ type: 'SET_PEN', x: points[0].x, y: points[0].y, down: true });
        await new Promise((r) => setTimeout(r, FRAME_DELAY_MS));

        // Draw through all points
        for (let i = 1; i < points.length; i++) {
          dispatch({ type: 'SET_PEN', x: points[i].x, y: points[i].y, down: true });
          await new Promise((r) => setTimeout(r, FRAME_DELAY_MS));
        }

        // Lift pen
        const lastPoint = points[points.length - 1];
        dispatch({ type: 'SET_PEN', x: lastPoint.x, y: lastPoint.y, down: false });

        // Add completed stroke
        dispatch({ type: 'ADD_STROKE', path: stroke.path });

        await new Promise((r) => setTimeout(r, FRAME_DELAY_MS * 2)); // Brief pause between strokes
      }

      animatingRef.current = false;
    },
    [dispatch]
  );

  // Fetch and animate pending strokes when notified
  useEffect(() => {
    const fetchAndAnimate = async (): Promise<void> => {
      if (!state.pendingStrokes) return;

      // Skip if we've already fetched this batch (prevents race condition)
      if (state.pendingStrokes.batchId <= fetchedBatchIdRef.current) return;
      fetchedBatchIdRef.current = state.pendingStrokes.batchId;

      // Clear pending strokes to prevent re-fetch
      dispatch({ type: 'CLEAR_PENDING_STROKES' });

      try {
        const token = await getToken();
        const response = await fetch(`${getApiUrl()}/strokes/pending`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
          console.error('[App] Failed to fetch pending strokes:', response.status);
          return;
        }

        const data = await response.json();
        const strokes = data.strokes as PendingStroke[];

        if (strokes.length > 0) {
          await animateStrokes(strokes);
        }
      } catch (error) {
        console.error('[App] Error fetching/animating strokes:', error);
      }
    };

    void fetchAndAnimate();
  }, [state.pendingStrokes, dispatch, getToken, animateStrokes]);

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
