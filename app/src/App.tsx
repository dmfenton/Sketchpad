/**
 * Main application component.
 */

import React, { useCallback, useState } from 'react';
import { Alert, SafeAreaView, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import {
  Canvas,
  Controls,
  NudgeModal,
  StatusBar,
  ThinkingPanel,
} from './components';
import { config } from './config';
import { useCanvas } from './hooks/useCanvas';
import { useWebSocket } from './hooks/useWebSocket';

export default function App(): React.JSX.Element {
  const [nudgeModalVisible, setNudgeModalVisible] = useState(false);
  const [paused, setPaused] = useState(false);

  const canvas = useCanvas();
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

  const handlePauseToggle = useCallback(() => {
    if (paused) {
      send({ type: 'resume' });
    } else {
      send({ type: 'pause' });
    }
    setPaused((prev) => !prev);
  }, [paused, send]);

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
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          {/* Canvas */}
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

          {/* Thinking Panel */}
          <ThinkingPanel
            status={canvas.state.agentStatus}
            thinking={canvas.state.thinking}
          />

          {/* Controls */}
          <Controls
            drawingEnabled={canvas.state.drawingEnabled}
            paused={paused}
            onDrawToggle={handleDrawToggle}
            onNudge={handleNudgePress}
            onClear={handleClear}
            onPauseToggle={handlePauseToggle}
          />

          {/* Status Bar */}
          <StatusBar
            pieceCount={canvas.state.pieceCount}
            status={canvas.state.agentStatus}
            connected={wsState.connected}
          />
        </View>

        {/* Nudge Modal */}
        <NudgeModal
          visible={nudgeModalVisible}
          onClose={() => setNudgeModalVisible(false)}
          onSend={handleNudgeSend}
        />
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  content: {
    flex: 1,
    padding: 16,
    gap: 12,
  },
});
