/**
 * Drawing Agent Web App
 *
 * Mobile-responsive layout with auth protection.
 */

import React, { useCallback, useState } from 'react';
import type { PendingStroke, ServerMessage } from '@drawing-agent/shared';
import { STATUS_LABELS, useStrokeAnimation } from '@drawing-agent/shared';
import { getApiUrl } from './config';

import { Canvas } from './components/Canvas';
import { MessageStream } from './components/MessageStream';
import { DebugPanel } from './components/DebugPanel';
import { ActionBar } from './components/ActionBar';
import { AuthScreen } from './components/AuthScreen';
import { MobileNav, type MobileTab } from './components/MobileNav';
import { useCanvas } from './hooks/useCanvas';
import { useWebSocket } from './hooks/useWebSocket';
import { useDebug } from './hooks/useDebug';
import { useViewport } from './hooks/useViewport';
import { useAuth } from './context/AuthContext';

function LoadingScreen(): React.ReactElement {
  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-text-secondary">Loading...</p>
      </div>
    </div>
  );
}

function MainApp(): React.ReactElement {
  const { accessToken } = useAuth();
  const { isMobile } = useViewport();
  const [mobileTab, setMobileTab] = useState<MobileTab>('canvas');

  const { state, dispatch, handleMessage, startStroke, addPoint, endStroke, toggleDrawing } =
    useCanvas();

  const { logMessage, ...debug } = useDebug();

  // Fetch pending strokes from server
  const fetchStrokes = useCallback(async (): Promise<PendingStroke[]> => {
    if (!accessToken) return [];
    const response = await fetch(`${getApiUrl()}/strokes/pending`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) throw new Error('Failed to fetch strokes');
    const data = await response.json();
    return data.strokes as PendingStroke[];
  }, [accessToken]);

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

  // Determine which class to add for mobile tab visibility
  const mobileClass = isMobile
    ? mobileTab === 'messages'
      ? 'show-messages'
      : mobileTab === 'debug'
        ? 'show-debug'
        : ''
    : '';

  return (
    <div className={`app ${mobileClass}`}>
      <header className="header">
        <div className="header-left">
          <h1 className={isMobile ? 'text-sm' : ''}>Code Monet</h1>
          <div className="connection-status">
            <div className={`connection-dot ${wsStatus}`} />
          </div>
        </div>
        {!isMobile && (
          <div className="header-center">
            <div className={`status-pill ${state.agentStatus}`}>
              {STATUS_LABELS[state.agentStatus]}
            </div>
          </div>
        )}
        <div className="header-right">
          {isMobile && (
            <div className={`status-pill ${state.agentStatus}`}>
              {STATUS_LABELS[state.agentStatus]}
            </div>
          )}
          <span className="piece-count">#{state.pieceCount}</span>
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
        {(!isMobile || mobileTab === 'messages') && (
          <MessageStream messages={state.messages} status={state.agentStatus} />
        )}
        {(!isMobile || mobileTab === 'debug') && (
          <DebugPanel
            agent={debug.agent}
            files={debug.files}
            messageLog={debug.messageLog}
            onRefresh={debug.refresh}
            onClearLog={debug.clearLog}
          />
        )}
      </div>

      {isMobile && (
        <MobileNav
          activeTab={mobileTab}
          onTabChange={setMobileTab}
          messageCount={state.messages.length}
        />
      )}
    </div>
  );
}

function App(): React.ReactElement {
  const { isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated) {
    return <AuthScreen />;
  }

  return <MainApp />;
}

export default App;
