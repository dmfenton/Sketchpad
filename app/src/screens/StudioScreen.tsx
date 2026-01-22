/**
 * StudioScreen - Canvas view with controls.
 * Encapsulates Canvas, LiveStatus, MessageStream, and ActionBar.
 */

import React, { useCallback, useMemo } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import type { AgentMessage, AgentStatus, DrawingStyleConfig, Path, Point, StrokeStyle, ToolName } from '@code-monet/shared';
import { shouldShowIdleAnimation } from '@code-monet/shared';

import { ActionBar, Canvas, LiveStatus, MessageStream } from '../components';
import type { UseCanvasReturn } from '../hooks';
import { tracer } from '../utils/tracing';

/** Action types for the action bar */
export type StudioAction =
  | { type: 'draw_toggle' }
  | { type: 'nudge' }
  | { type: 'pause_toggle' }
  | { type: 'clear' }
  | { type: 'home' }
  | { type: 'gallery' };

/** Canvas render state - subset of full canvas state needed for rendering */
export interface CanvasRenderState {
  strokes: Path[];
  currentStroke: Point[];
  agentStroke: Point[];
  agentStrokeStyle: Partial<StrokeStyle> | null;
  penPosition: Point | null;
  penDown: boolean;
  drawingEnabled: boolean;
  styleConfig: DrawingStyleConfig;
  paused: boolean;
}

/** Props for StudioScreen */
export interface StudioScreenProps {
  /** Canvas hook return - provides state and handlers */
  canvas: UseCanvasReturn;
  /** Current agent status */
  agentStatus: AgentStatus;
  /** Current tool being used */
  currentTool: ToolName | null;
  /** WebSocket connected state */
  wsConnected: boolean;
  /** Gallery count for action bar */
  galleryCount: number;
  /** Callback when action is triggered */
  onAction: (action: StudioAction) => void;
  /** Callback for stroke start */
  onStrokeStart: (x: number, y: number) => void;
  /** Callback for stroke move */
  onStrokeMove: (x: number, y: number) => void;
  /** Callback for stroke end */
  onStrokeEnd: () => void;
}

export function StudioScreen({
  canvas,
  agentStatus,
  currentTool,
  wsConnected,
  galleryCount,
  onAction,
  onStrokeStart,
  onStrokeMove,
  onStrokeEnd,
}: StudioScreenProps): React.JSX.Element {
  const { state } = canvas;

  // Action bar callbacks
  const handleDrawToggle = useCallback(() => {
    onAction({ type: 'draw_toggle' });
  }, [onAction]);

  const handleNudge = useCallback(() => {
    onAction({ type: 'nudge' });
  }, [onAction]);

  const handlePauseToggle = useCallback(() => {
    onAction({ type: 'pause_toggle' });
  }, [onAction]);

  const handleHome = useCallback(() => {
    onAction({ type: 'home' });
  }, [onAction]);

  const handleGallery = useCallback(() => {
    onAction({ type: 'gallery' });
  }, [onAction]);

  return (
    <>
      {/* Live Status - Above canvas for visibility */}
      <LiveStatus performance={state.performance} status={agentStatus} currentTool={currentTool} />

      {/* Canvas - Main area */}
      <View style={styles.canvasContainer}>
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
          onStrokeStart={onStrokeStart}
          onStrokeMove={onStrokeMove}
          onStrokeEnd={onStrokeEnd}
        />
      </View>

      {/* Message History - Collapsible */}
      <MessageStream messages={state.messages} />

      {/* Action Bar - Bottom */}
      <ActionBar
        drawingEnabled={state.drawingEnabled}
        paused={state.paused}
        connected={wsConnected}
        galleryCount={galleryCount}
        onDrawToggle={handleDrawToggle}
        onNudge={handleNudge}
        onPauseToggle={handlePauseToggle}
        onNewCanvas={handleHome}
        onGallery={handleGallery}
      />
    </>
  );
}

const styles = StyleSheet.create({
  canvasContainer: {
    flex: 1,
    justifyContent: 'center',
  },
});
