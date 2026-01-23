/**
 * Code Monet - Main Application
 * An AI-powered drawing experience inspired by impressionist art.
 */

import * as Linking from 'expo-linking';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { PendingStroke, ToolName } from '@code-monet/shared';
import {
  deriveAgentStatus,
  forwardLogs,
  initLogForwarder,
  startLogSession,
  usePendingStrokes,
  usePerformer,
} from '@code-monet/shared';

import {
  GalleryModal,
  NewCanvasModal,
  NudgeModal,
  SplashScreen,
} from './components';
import { createApiClient } from './api';
import { getApiUrl, getWebSocketUrl } from './config';
import { useAuth } from './context';
import { useAppNavigation, useCanvas, useModals, useWebSocket } from './hooks';
import { useTokenRefresh } from './hooks/useTokenRefresh';
import { AuthScreen, HomeScreen, StudioScreen } from './screens';
import type { StudioAction } from './screens';
import { spacing, useTheme } from './theme';
import { tracer } from './utils/tracing';

// Debug overlay for diagnosing render loops (only in __DEV__)
const DebugOverlay = React.memo(function DebugOverlay({
  data,
}: {
  data: Record<string, string | number | boolean | null>;
}) {
  if (!__DEV__) return null;
  return (
    <View
      pointerEvents="none"
      style={{
        backgroundColor: 'rgba(0,0,0,0.85)',
        padding: 6,
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 999,
      }}
    >
      {Object.entries(data).map(([key, val]) => (
        <Text key={key} style={{ color: '#0f0', fontFamily: 'monospace', fontSize: 10 }}>
          {key}: {String(val)}
        </Text>
      ))}
    </View>
  );
});

function MainApp(): React.JSX.Element {
  const { colors, isDark } = useTheme();
  const { accessToken, signOut, refreshToken } = useAuth();
  const api = useMemo(() => createApiClient(accessToken), [accessToken]);
  const [showSplash, setShowSplash] = useState(true);

  // Core state
  const canvas = useCanvas();
  const { handleMessage, dispatch } = canvas;

  // Modal management
  const { activeModal, openModal, closeModal } = useModals();

  // Handle auth errors from WebSocket
  const { handleAuthError } = useTokenRefresh({
    refreshToken,
    signOut,
    cooldownMs: 5000,
  });

  // WebSocket connection
  const { state: wsState, send } = useWebSocket({
    url: getWebSocketUrl(),
    token: accessToken,
    onMessage: handleMessage,
    onAuthError: handleAuthError,
  });

  // Navigation (studio/home state)
  const { inStudio, enterStudio, exitStudio, setInStudio } = useAppNavigation({
    send,
    paused: canvas.state.paused,
    setPaused: canvas.setPaused,
  });

  const pendingStrokes = canvas.state.pendingStrokes;
  const fetchPendingStrokes = useCallback(async (): Promise<PendingStroke[]> => {
    const response = await api.fetch('/strokes/pending');
    if (!response.ok) throw new Error('Failed to fetch strokes');
    const data = (await response.json()) as { strokes: PendingStroke[] };
    return data.strokes;
  }, [api]);

  usePendingStrokes({
    pendingStrokes: accessToken ? pendingStrokes : null,
    fetchPendingStrokes,
    enqueueStrokes: (strokes) => dispatch({ type: 'ENQUEUE_STROKES', strokes }),
    clearPending: () => dispatch({ type: 'CLEAR_PENDING_STROKES' }),
    onError: (error) => {
      console.error('[App] Failed to fetch strokes:', error);
    },
  });

  // Callback when stroke animation completes
  const handleStrokesComplete = React.useCallback(
    (batchId: number) => {
      send({ type: 'animation_done', batch_id: batchId });
    },
    [send]
  );

  // Performance animation loop - drives text and stroke animation
  usePerformer({
    performance: canvas.state.performance,
    dispatch,
    paused: canvas.state.paused,
    inStudio,
    onStrokesComplete: handleStrokesComplete,
  });

  // Derive agent status from canvas state
  const agentStatus = deriveAgentStatus(canvas.state);

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

  // Fetch gallery via HTTP on mount
  useEffect(() => {
    if (!accessToken) return;
    if (canvas.state.gallery.length > 0) return;

    const fetchGallery = async () => {
      try {
        const response = await api.fetch('/gallery');
        if (response.ok) {
          const gallery = await response.json();
          dispatch({ type: 'SET_GALLERY', canvases: gallery });
        }
      } catch {
        // Silently fail - WebSocket init will provide gallery as backup
      }
    };

    void fetchGallery();
  }, [accessToken, api, dispatch, canvas.state.gallery.length]);

  // Studio action handler
  const handleStudioAction = useCallback(
    (action: StudioAction) => {
      switch (action.type) {
        case 'draw_toggle':
          canvas.toggleDrawing();
          break;
        case 'nudge':
          openModal('nudge');
          break;
        case 'pause_toggle':
          if (canvas.state.paused) {
            tracer.recordEvent('action.resume');
            send({ type: 'resume' });
            canvas.setPaused(false);
          } else {
            tracer.recordEvent('action.pause');
            send({ type: 'pause' });
            canvas.setPaused(true);
          }
          break;
        case 'home':
          tracer.recordEvent('session.back_to_home');
          exitStudio();
          break;
        case 'gallery':
          openModal('gallery');
          break;
      }
    },
    [canvas, send, openModal, exitStudio]
  );

  // Stroke handlers
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

  // Home screen handlers
  const handleStyleChange = useCallback(
    (style: 'plotter' | 'paint') => {
      send({ type: 'set_style', drawing_style: style });
    },
    [send]
  );

  const handleContinue = useCallback(() => {
    tracer.recordEvent('session.continue');
    if (canvas.state.paused) {
      send({ type: 'resume' });
      canvas.setPaused(false);
    }
    enterStudio();
  }, [send, canvas, enterStudio]);

  const handleStartWithPrompt = useCallback(
    (prompt: string) => {
      tracer.recordEvent('session.start', { hasDirection: true });
      tracer.newSession();
      send({ type: 'new_canvas', direction: prompt });
      send({ type: 'resume' });
      canvas.setPaused(false);
      enterStudio();
    },
    [send, canvas, enterStudio]
  );

  const handleSurpriseMe = useCallback(() => {
    tracer.recordEvent('session.start', { hasDirection: false });
    tracer.newSession();
    send({ type: 'new_canvas' });
    send({ type: 'resume' });
    canvas.setPaused(false);
    enterStudio();
  }, [send, canvas, enterStudio]);

  // Modal handlers
  const handleNudgeSend = useCallback(
    (text: string) => {
      tracer.recordEvent('action.nudge', { hasText: text.length > 0 });
      send({ type: 'nudge', text });
    },
    [send]
  );

  const handleNewCanvasStart = useCallback(
    (direction?: string, style?: 'plotter' | 'paint') => {
      tracer.recordEvent('action.new_canvas', { hasDirection: !!direction, style });
      tracer.newSession();
      send({ type: 'new_canvas', direction, drawing_style: style });
      send({ type: 'resume' });
      canvas.setPaused(false);
      enterStudio();
    },
    [send, canvas, enterStudio]
  );

  const handleGallerySelect = useCallback(
    (pieceNumber: number) => {
      send({ type: 'load_canvas', piece_number: pieceNumber });
      closeModal();
      setInStudio(true);
    },
    [send, closeModal, setInStudio]
  );

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
        <DebugOverlay
          data={{
            inStudio,
            paused: canvas.state.paused,
            status: agentStatus,
            strokes: canvas.state.strokes.length,
            pending: canvas.state.pendingStrokes?.batchId ?? null,
            thinking: canvas.state.thinking.length,
            ws: wsState.connected,
            gallery: canvas.state.gallery.length,
          }}
        />
        <View style={styles.content}>
          {inStudio ? (
            <StudioScreen
              canvas={canvas}
              agentStatus={agentStatus}
              currentTool={currentTool}
              wsConnected={wsState.connected}
              galleryCount={canvas.state.gallery.length}
              onAction={handleStudioAction}
              onStrokeStart={handleStrokeStart}
              onStrokeMove={handleStrokeMove}
              onStrokeEnd={handleStrokeEnd}
            />
          ) : (
            <HomeScreen
              api={api}
              wsConnected={wsState.connected}
              hasCurrentWork={canvas.state.strokes.length > 0}
              pieceNumber={canvas.state.pieceNumber}
              gallery={canvas.state.gallery}
              drawingStyle={canvas.state.drawingStyle}
              onStyleChange={handleStyleChange}
              onContinue={handleContinue}
              onStartWithPrompt={handleStartWithPrompt}
              onSurpriseMe={handleSurpriseMe}
              onOpenGallery={() => openModal('gallery')}
            />
          )}
        </View>

        {/* Modals */}
        <NudgeModal
          visible={activeModal === 'nudge'}
          onClose={closeModal}
          onSend={handleNudgeSend}
        />

        <NewCanvasModal
          visible={activeModal === 'newCanvas'}
          currentStyle={canvas.state.drawingStyle}
          onClose={closeModal}
          onStart={handleNewCanvasStart}
        />

        <GalleryModal
          api={api}
          visible={activeModal === 'gallery'}
          canvases={canvas.state.gallery}
          onClose={closeModal}
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

        // Handle magic_token from expo-router redirect
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

        // Handle tokens from expo-router redirect
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

  // Show auth screen if not authenticated
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
});
