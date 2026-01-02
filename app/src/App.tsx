/**
 * Main application component.
 */

import React, { useCallback, useState } from 'react';
import { Alert, StatusBar, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionBar, Canvas, GalleryModal, MessageStream, NudgeModal, StatusPill } from './components';
import { config } from './config';
import { useCanvas } from './hooks/useCanvas';
import { useWebSocket } from './hooks/useWebSocket';
import { colors, spacing } from './theme';

export default function App(): React.JSX.Element {
  const [nudgeModalVisible, setNudgeModalVisible] = useState(false);
  const [galleryModalVisible, setGalleryModalVisible] = useState(false);

  const canvas = useCanvas();
  const paused = canvas.state.paused;
  const { state: wsState, send } = useWebSocket({
    url: config.wsUrl,
    onMessage: canvas.handleMessage,
  });

  const handleDrawToggle = useCallback(() => {
    canvas.toggleDrawing();
  }, [canvas]);

  const handleNudgePress = useCallback(() => {
    setNudgeModalVisible(true);
  }, []);

  const handleNudgeSend = useCallback(
    (text: string) => {
      send({ type: 'nudge', text });
    },
    [send]
  );

  const handleClear = useCallback(() => {
    Alert.alert(
      'Clear Canvas',
      'Clear the canvas and start fresh?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            send({ type: 'clear' });
            canvas.clear();
          },
        },
      ]
    );
  }, [send, canvas]);

  const handleNewCanvas = useCallback(() => {
    Alert.alert(
      'New Canvas',
      'Save current canvas to gallery and start fresh?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'New Canvas',
          onPress: () => {
            send({ type: 'new_canvas' });
          },
        },
      ]
    );
  }, [send]);

  const handleGalleryPress = useCallback(() => {
    setGalleryModalVisible(true);
  }, []);

  const handleGallerySelect = useCallback(
    (canvasId: string) => {
      send({ type: 'load_canvas', canvas_id: canvasId });
      setGalleryModalVisible(false);
    },
    [send]
  );

  const handlePauseToggle = useCallback(() => {
    if (paused) {
      send({ type: 'resume' });
      canvas.setPaused(false);
    } else {
      send({ type: 'pause' });
      canvas.setPaused(true);
    }
  }, [paused, send, canvas]);

  const handleStrokeStart = useCallback(
    (x: number, y: number) => {
      canvas.startStroke(x, y);
    },
    [canvas]
  );

  const handleStrokeMove = useCallback(
    (x: number, y: number) => {
      canvas.addPoint(x, y);
    },
    [canvas]
  );

  const handleStrokeEnd = useCallback(() => {
    const path = canvas.endStroke();
    if (path) {
      send({ type: 'stroke', points: path.points });
    }
  }, [canvas, send]);

  return (
    <GestureHandlerRootView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <View style={styles.content}>
          {/* Status Pill - Top */}
          <View style={styles.statusRow}>
            <StatusPill
              pieceCount={canvas.state.pieceCount}
              viewingPiece={canvas.state.viewingPiece}
              status={canvas.state.agentStatus}
              connected={wsState.connected}
              paused={paused}
            />
          </View>

          {/* Canvas - Main area */}
          <View style={styles.canvasContainer}>
            <Canvas
              strokes={canvas.state.strokes}
              currentStroke={canvas.state.currentStroke}
              penPosition={canvas.state.penPosition}
              penDown={canvas.state.penDown}
              drawingEnabled={canvas.state.drawingEnabled}
              onStrokeStart={handleStrokeStart}
              onStrokeMove={handleStrokeMove}
              onStrokeEnd={handleStrokeEnd}
            />
          </View>

          {/* Message Stream */}
          <MessageStream
            messages={canvas.state.messages}
            status={canvas.state.agentStatus}
          />

          {/* Action Bar - Bottom */}
          <ActionBar
            drawingEnabled={canvas.state.drawingEnabled}
            paused={paused}
            connected={wsState.connected}
            galleryCount={canvas.state.gallery.length}
            onDrawToggle={handleDrawToggle}
            onNudge={handleNudgePress}
            onClear={handleClear}
            onPauseToggle={handlePauseToggle}
            onNewCanvas={handleNewCanvas}
            onGallery={handleGalleryPress}
          />
        </View>

        {/* Nudge Modal */}
        <NudgeModal
          visible={nudgeModalVisible}
          onClose={() => setNudgeModalVisible(false)}
          onSend={handleNudgeSend}
        />

        {/* Gallery Modal */}
        <GalleryModal
          visible={galleryModalVisible}
          canvases={canvas.state.gallery}
          onClose={() => setGalleryModalVisible(false)}
          onSelect={handleGallerySelect}
        />
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingTop: spacing.xs,
  },
  canvasContainer: {
    flex: 1,
    justifyContent: 'center',
  },
});
