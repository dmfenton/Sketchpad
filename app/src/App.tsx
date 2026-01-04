/**
 * Code Monet - Main Application
 * An AI-powered drawing experience inspired by impressionist art.
 */

import * as Linking from 'expo-linking';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, StatusBar, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  ActionBar,
  Canvas,
  GalleryModal,
  MessageStream,
  NewCanvasModal,
  NudgeModal,
  SplashScreen,
  StatusPill,
} from './components';
import { getWebSocketUrl } from './config';
import { AuthProvider, useAuth } from './context';
import { useCanvas } from './hooks/useCanvas';
import { useWebSocket } from './hooks/useWebSocket';
import { AuthScreen } from './screens';
import { spacing, ThemeProvider, useTheme } from './theme';

function MainApp(): React.JSX.Element {
  const { colors, isDark } = useTheme();
  const { accessToken, signOut, refreshToken } = useAuth();
  const [showSplash, setShowSplash] = useState(true);
  const [nudgeModalVisible, setNudgeModalVisible] = useState(false);
  const [galleryModalVisible, setGalleryModalVisible] = useState(false);
  const [newCanvasModalVisible, setNewCanvasModalVisible] = useState(false);

  const canvas = useCanvas();
  const paused = canvas.state.paused;

  // Use ref to avoid recreating callback and causing WebSocket reconnects
  const canvasRef = useRef(canvas);
  canvasRef.current = canvas;

  // Stable callback that doesn't change between renders
  const handleMessage = useCallback((message: Parameters<typeof canvas.handleMessage>[0]) => {
    canvasRef.current.handleMessage(message);
  }, []); // Empty deps - stable callback

  // Handle auth errors from WebSocket by trying to refresh, then sign out
  const handleAuthError = useCallback(() => {
    console.log('[App] WebSocket auth error, attempting token refresh');
    void (async () => {
      const refreshed = await refreshToken();
      if (!refreshed) {
        console.log('[App] Token refresh failed, signing out');
        await signOut();
      }
    })();
  }, [refreshToken, signOut]);

  const { state: wsState, send } = useWebSocket({
    url: getWebSocketUrl(),
    token: accessToken,
    onMessage: handleMessage,
    onAuthError: handleAuthError,
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
    setNewCanvasModalVisible(true);
  }, []);

  const handleNewCanvasStart = useCallback(
    (direction?: string) => {
      send({ type: 'new_canvas', direction });
    },
    [send]
  );

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

  const handleSplashFinish = useCallback(() => {
    setShowSplash(false);
  }, []);

  return (
    <GestureHandlerRootView style={[styles.root, { backgroundColor: colors.background }]}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={colors.background}
      />

      {/* Splash Screen */}
      {showSplash && <SplashScreen onFinish={handleSplashFinish} />}

      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
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

        {/* New Canvas Modal */}
        <NewCanvasModal
          visible={newCanvasModalVisible}
          onClose={() => setNewCanvasModalVisible(false)}
          onStart={handleNewCanvasStart}
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

function AppContent(): React.JSX.Element {
  const { colors } = useTheme();
  const { isLoading, isAuthenticated, verifyMagicLink, setTokensFromCallback } = useAuth();
  const [magicLinkError, setMagicLinkError] = useState<string | null>(null);
  const [verifyingMagicLink, setVerifyingMagicLink] = useState(false);

  // Handle deep links for magic link authentication
  const handleDeepLink = useCallback(
    async (url: string | null) => {
      if (!url) return;

      try {
        const parsed = Linking.parse(url);

        // Handle callback from web page: codemonet://auth/callback?access_token=...&refresh_token=...
        if (parsed.path === 'auth/callback' && parsed.queryParams?.access_token && parsed.queryParams?.refresh_token) {
          const accessToken = parsed.queryParams.access_token as string;
          const refreshToken = parsed.queryParams.refresh_token as string;
          console.log('[App] Setting tokens from web callback');
          setVerifyingMagicLink(true);
          setMagicLinkError(null);

          const result = await setTokensFromCallback(accessToken, refreshToken);
          if (!result.success) {
            setMagicLinkError(result.error ?? 'Failed to authenticate');
          }
          setVerifyingMagicLink(false);
          return;
        }

        // Handle magic link verification via Universal Links: /auth/verify?token=...
        if (parsed.path === 'auth/verify' && parsed.queryParams?.token) {
          const token = parsed.queryParams.token as string;
          console.log('[App] Verifying magic link token');
          setVerifyingMagicLink(true);
          setMagicLinkError(null);

          const result = await verifyMagicLink(token);
          if (!result.success) {
            setMagicLinkError(result.error ?? 'Magic link verification failed');
          }
          setVerifyingMagicLink(false);
        }
      } catch (error) {
        console.error('[App] Deep link error:', error);
        setVerifyingMagicLink(false);
      }
    },
    [verifyMagicLink, setTokensFromCallback]
  );

  // Listen for deep links when app is already running
  useEffect(() => {
    const subscription = Linking.addEventListener('url', (event) => {
      void handleDeepLink(event.url);
    });

    // Check for initial URL (app opened via deep link)
    void Linking.getInitialURL().then(handleDeepLink);

    return () => subscription.remove();
  }, [handleDeepLink]);

  // Show loading screen while checking auth or verifying magic link
  if (isLoading || verifyingMagicLink) {
    return (
      <GestureHandlerRootView style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </GestureHandlerRootView>
    );
  }

  // Show auth screen if not authenticated (pass magic link error if any)
  if (!isAuthenticated) {
    return <AuthScreen magicLinkError={magicLinkError} onClearError={() => setMagicLinkError(null)} />;
  }

  // Show main app
  return <MainApp />;
}

export default function App(): React.JSX.Element {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: {
    flex: 1,
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
