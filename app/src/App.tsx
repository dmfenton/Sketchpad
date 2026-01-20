/**
 * Code Monet - Main Application
 * An AI-powered drawing experience inspired by impressionist art.
 */

import * as Linking from 'expo-linking';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  StyleSheet,
  View,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { ClientMessage, PendingStroke, ToolName } from '@code-monet/shared';
import {
  deriveAgentStatus,
  forwardLogs,
  hasInProgressEvents,
  initLogForwarder,
  LIVE_MESSAGE_ID,
  shouldShowIdleAnimation,
  startLogSession,
  useStrokeAnimation,
} from '@code-monet/shared';

import { useTokenRefresh } from './hooks/useTokenRefresh';
import { tracer } from './utils/tracing';

import {
  ActionBar,
  Canvas,
  GalleryModal,
  LiveStatus,
  MessageStream,
  NewCanvasModal,
  NudgeModal,
  SplashScreen,
  StartPanel,
} from './components';
import { getApiUrl, getWebSocketUrl } from './config';
import { useAuth } from './context';
import { useCanvas } from './hooks/useCanvas';
import { useWebSocket } from './hooks/useWebSocket';
import { AuthScreen } from './screens';
import { spacing, useTheme } from './theme';

function MainApp(): React.JSX.Element {
  const { colors, isDark } = useTheme();
  const { accessToken, signOut, refreshToken } = useAuth();
  const [showSplash, setShowSplash] = useState(true);
  const [nudgeModalVisible, setNudgeModalVisible] = useState(false);
  const [galleryModalVisible, setGalleryModalVisible] = useState(false);
  const [newCanvasModalVisible, setNewCanvasModalVisible] = useState(false);

  const canvas = useCanvas();
  const paused = canvas.state.paused;

  // Ref to store send function for animation done callback (avoids hook ordering issues)
  const sendRef = useRef<((message: ClientMessage) => void) | null>(null);

  // canvas.handleMessage is already stable (useCallback with [])
  const { handleMessage, dispatch } = canvas;

  // Fetch pending strokes from server
  const fetchStrokes = useCallback(async (): Promise<PendingStroke[]> => {
    if (!accessToken) throw new Error('No auth token');
    const response = await fetch(`${getApiUrl()}/strokes/pending`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) throw new Error('Failed to fetch strokes');
    const data = (await response.json()) as { strokes: PendingStroke[] };
    return data.strokes;
  }, [accessToken]);

  // Derive status from messages (source of truth)
  const agentStatus = deriveAgentStatus(canvas.state);

  // Extract live message for LiveStatus component
  const liveMessage = useMemo(
    () => canvas.state.messages.find((m) => m.id === LIVE_MESSAGE_ID) ?? null,
    [canvas.state.messages]
  );

  // Get current tool from the last code_execution message
  const currentTool = useMemo((): ToolName | null => {
    for (let i = canvas.state.messages.length - 1; i >= 0; i--) {
      const m = canvas.state.messages[i];
      if (m && m.type === 'code_execution') {
        return (m.metadata?.tool_name as ToolName) ?? null;
      }
    }
    return null;
  }, [canvas.state.messages]);

  // Callback to signal animation complete to server
  const handleAnimationDone = useCallback(() => {
    sendRef.current?.({ type: 'animation_done' });
  }, []);

  // Use shared animation hook for agent-drawn strokes
  // Gate on: not paused AND no in-progress tool calls
  // This ensures tool completion events are shown before animation starts,
  // but allows animation while agent is thinking (so it's not blocked forever)
  const canRenderStrokes = !canvas.state.paused && !hasInProgressEvents(canvas.state.messages);
  useStrokeAnimation({
    pendingStrokes: canvas.state.pendingStrokes,
    dispatch,
    fetchStrokes,
    onAnimationDone: handleAnimationDone,
    canRender: canRenderStrokes,
  });

  // Handle auth errors from WebSocket with proper mutex pattern
  const { handleAuthError } = useTokenRefresh({
    refreshToken,
    signOut,
    cooldownMs: 5000,
  });

  const { state: wsState, send } = useWebSocket({
    url: getWebSocketUrl(),
    token: accessToken,
    onMessage: handleMessage,
    onAuthError: handleAuthError,
  });

  // Keep sendRef in sync with send for animation done callback
  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  const handleDrawToggle = useCallback(() => {
    canvas.toggleDrawing();
  }, [canvas]);

  const handleNudgePress = useCallback(() => {
    setNudgeModalVisible(true);
  }, []);

  const handleNudgeSend = useCallback(
    (text: string) => {
      tracer.recordEvent('action.nudge', { hasText: text.length > 0 });
      send({ type: 'nudge', text });
    },
    [send]
  );

  const handleClear = useCallback(() => {
    Alert.alert('Clear Canvas', 'Clear the canvas and start fresh?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: () => {
          tracer.recordEvent('action.clear');
          send({ type: 'clear' });
          canvas.clear();
        },
      },
    ]);
  }, [send, canvas]);

  const handleNewCanvas = useCallback(() => {
    setNewCanvasModalVisible(true);
  }, []);

  const handleNewCanvasStart = useCallback(
    (direction?: string, style?: 'plotter' | 'paint') => {
      tracer.recordEvent('action.new_canvas', { hasDirection: !!direction, style });
      tracer.newSession(); // Start fresh trace for new piece
      // Send style atomically with new_canvas to avoid race condition
      send({ type: 'new_canvas', direction, drawing_style: style });
    },
    [send]
  );

  // Handle start from the StartPanel (sends new_canvas and resumes)
  const handleStartFromPanel = useCallback(
    (direction?: string) => {
      tracer.recordEvent('session.start', { hasDirection: !!direction });
      tracer.newSession(); // Start fresh trace for new piece
      send({ type: 'new_canvas', direction });
      send({ type: 'resume' });
      canvas.setPaused(false);
    },
    [send, canvas]
  );

  // Determine if we should show the start panel
  // Show when: canvas is empty, paused, and no messages (fresh start)
  const showStartPanel =
    canvas.state.strokes.length === 0 && canvas.state.paused && canvas.state.messages.length === 0;

  const handleGalleryPress = useCallback(() => {
    setGalleryModalVisible(true);
  }, []);

  const handleGallerySelect = useCallback(
    (pieceNumber: number) => {
      send({ type: 'load_canvas', piece_number: pieceNumber });
      setGalleryModalVisible(false);
    },
    [send]
  );

  const handlePauseToggle = useCallback(() => {
    if (paused) {
      tracer.recordEvent('action.resume');
      send({ type: 'resume' });
      canvas.setPaused(false);
    } else {
      tracer.recordEvent('action.pause');
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

      <SafeAreaView
        style={[styles.container, { backgroundColor: colors.background }]}
        edges={['top', 'left', 'right']}
      >
        <View style={styles.content}>
          {/* Live Status - Above canvas for visibility */}
          {!showStartPanel && (
            <LiveStatus liveMessage={liveMessage} status={agentStatus} currentTool={currentTool} />
          )}

          {/* Canvas - Main area */}
          <View style={styles.canvasContainer}>
            <Canvas
              strokes={canvas.state.strokes}
              currentStroke={canvas.state.currentStroke}
              agentStroke={canvas.state.agentStroke}
              agentStrokeStyle={canvas.state.agentStrokeStyle}
              penPosition={canvas.state.penPosition}
              penDown={canvas.state.penDown}
              drawingEnabled={canvas.state.drawingEnabled}
              styleConfig={canvas.state.styleConfig}
              showIdleAnimation={shouldShowIdleAnimation(canvas.state)}
              onStrokeStart={handleStrokeStart}
              onStrokeMove={handleStrokeMove}
              onStrokeEnd={handleStrokeEnd}
            />
          </View>

          {/* Start Panel or Message Stream + Action Bar */}
          {showStartPanel ? (
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}
            >
              <StartPanel
                connected={wsState.connected}
                drawingStyle={canvas.state.drawingStyle}
                onStyleChange={(style) => send({ type: 'set_style', drawing_style: style })}
                onStart={handleStartFromPanel}
              />
            </KeyboardAvoidingView>
          ) : (
            <>
              {/* Message History - Collapsible */}
              <MessageStream messages={canvas.state.messages} />

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
            </>
          )}
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
          currentStyle={canvas.state.drawingStyle}
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
        if (
          parsed.path === 'auth/callback' &&
          parsed.queryParams?.access_token &&
          parsed.queryParams?.refresh_token
        ) {
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
          return;
        }

        // Handle magic_token from expo-router redirect (when Universal Link goes through /auth/verify route)
        if (parsed.queryParams?.magic_token) {
          const token = parsed.queryParams.magic_token as string;
          console.log('[App] Verifying magic link token from redirect');
          setVerifyingMagicLink(true);
          setMagicLinkError(null);

          const result = await verifyMagicLink(token);
          if (!result.success) {
            setMagicLinkError(result.error ?? 'Magic link verification failed');
          }
          setVerifyingMagicLink(false);
          return;
        }

        // Handle tokens from expo-router redirect (when deep link goes through /auth/callback route)
        if (parsed.queryParams?.access_token && parsed.queryParams?.refresh_token) {
          const accessToken = parsed.queryParams.access_token as string;
          const refreshToken = parsed.queryParams.refresh_token as string;
          console.log('[App] Setting tokens from expo-router redirect');
          setVerifyingMagicLink(true);
          setMagicLinkError(null);

          const result = await setTokensFromCallback(accessToken, refreshToken);
          if (!result.success) {
            setMagicLinkError(result.error ?? 'Failed to authenticate');
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
    return (
      <AuthScreen magicLinkError={magicLinkError} onClearError={() => setMagicLinkError(null)} />
    );
  }

  // Show main app
  return <MainApp />;
}

export default function App(): React.JSX.Element {
  // Initialize tracing and log forwarding on app mount
  useEffect(() => {
    // Initialize log forwarder (only in dev mode)
    if (__DEV__) {
      initLogForwarder(getApiUrl());
      forwardLogs();
      void startLogSession('app-start');
    }

    // Record app launch
    tracer.recordEvent('app.launch');

    // Start auto-flushing traces every 10 seconds
    tracer.startAutoFlush(10000);

    // Track app state changes (foreground/background)
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        tracer.recordEvent('app.foreground');
      } else if (nextAppState === 'background') {
        tracer.recordEvent('app.background');
        // Flush traces when going to background
        tracer.flush().catch(() => {});
      }
    });

    return () => {
      subscription.remove();
      tracer.stopAutoFlush();
      // Final flush on unmount
      tracer.flush().catch(() => {});
    };
  }, []);

  // Providers are in _layout.tsx for expo-router compatibility
  return <AppContent />;
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
  canvasContainer: {
    flex: 1,
    justifyContent: 'center',
  },
});
