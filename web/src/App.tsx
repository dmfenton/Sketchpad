/**
 * Drawing Agent Web Dev Server
 */

import { useCallback } from 'react';
import type { ServerMessage } from '@drawing-agent/shared';
import { STATUS_LABELS } from '@drawing-agent/shared';

import { Canvas } from './components/Canvas';
import { MessageStream } from './components/MessageStream';
import { DebugPanel } from './components/DebugPanel';
import { ActionBar } from './components/ActionBar';
import { useCanvas } from './hooks/useCanvas';
import { useWebSocket } from './hooks/useWebSocket';
import { useDebug } from './hooks/useDebug';

function App() {
  const { state, handleMessage, startStroke, addPoint, endStroke, toggleDrawing } = useCanvas();

  const { logMessage, ...debug } = useDebug();

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
        <h1>Drawing Agent Dev</h1>
        <div className="status">
          <div className="connection-status">
            <div className={`connection-dot ${wsStatus}`} />
            <span>{wsStatus}</span>
          </div>
          <div className={`status-pill ${state.agentStatus}`}>
            {STATUS_LABELS[state.agentStatus]}
          </div>
          <span>Piece #{state.pieceCount}</span>
        </div>
      </header>

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

      <ActionBar
        paused={state.paused}
        drawingEnabled={state.drawingEnabled}
        onSend={send}
        onToggleDrawing={toggleDrawing}
      />
    </div>
  );
}

export default App;
