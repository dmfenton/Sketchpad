/**
 * Studio context - consolidates canvas state, WebSocket, and action handlers.
 * Eliminates prop drilling by providing all studio-related state and actions via context.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import { AppState } from 'react-native';

import type {
  AgentStatus,
  CanvasAction,
  CanvasHookState,
  ClientMessage,
  DrawingStyleType,
  PendingStroke,
  SavedCanvas,
  ToolName,
} from '@code-monet/shared';
import {
  deriveAgentStatus,
  usePerformer,
  usePendingStrokes,
} from '@code-monet/shared';

import { createApiClient, type ApiClient } from '../api';
import { getWebSocketUrl } from '../config';
import { useCanvas, useModals, useWebSocket } from '../hooks';
import type { ModalType } from '../hooks';
import { useTokenRefresh } from '../hooks/useTokenRefresh';
import { tracer } from '../utils/tracing';

import { useAuth } from './AuthContext';
import { useNavigation } from './NavigationContext';

// Re-export ModalType for consumers
export type { ModalType } from '../hooks';

// Types for studio actions (from screens)
export type StudioAction =
  | { type: 'draw_toggle' }
  | { type: 'nudge' }
  | { type: 'pause_toggle' }
  | { type: 'home' }
  | { type: 'gallery' };

export interface StudioContextValue {
  // Canvas state (read-only for consumers)
  canvasState: CanvasHookState;
  dispatch: React.Dispatch<CanvasAction>;

  // Derived state
  agentStatus: AgentStatus;
  currentTool: ToolName | null;

  // WebSocket state
  wsConnected: boolean;
  send: (message: ClientMessage) => void;

  // Modal state
  activeModal: ModalType;
  openModal: (modal: Exclude<ModalType, null>) => void;
  closeModal: () => void;

  // Gallery data
  gallery: SavedCanvas[];

  // API client
  api: ApiClient;

  // Actions - grouped by domain
  actions: {
    // Studio actions (from action bar)
    handleStudioAction: (action: StudioAction) => void;

    // Stroke handlers (from canvas)
    handleStrokeStart: (x: number, y: number) => void;
    handleStrokeMove: (x: number, y: number) => void;
    handleStrokeEnd: () => void;

    // Home screen handlers
    handleStyleChange: (style: DrawingStyleType) => void;
    handleContinue: () => void;
    handleStartWithPrompt: (prompt: string) => void;
    handleSurpriseMe: () => void;

    // Modal handlers
    handleNudgeSend: (text: string) => void;
    handleNewCanvasStart: (direction?: string, style?: DrawingStyleType) => void;
    handleGallerySelect: (pieceNumber: number) => void;
  };
}

const StudioContext = createContext<StudioContextValue | null>(null);

export interface StudioProviderProps {
  children: React.ReactNode;
}

/**
 * Provider that consolidates canvas state, WebSocket, and all action handlers.
 * Should be nested inside AuthProvider and NavigationProvider.
 *
 * Also handles app lifecycle (pause on background, resume on foreground).
 */
export function StudioProvider({ children }: StudioProviderProps): React.JSX.Element {
  const { accessToken, signOut, refreshToken } = useAuth();
  const { inStudio, enterStudio, exitStudio, setInStudio } = useNavigation();

  const api = useMemo(() => createApiClient(accessToken), [accessToken]);

  // Core canvas state
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

  // Track state in refs for app lifecycle callback (avoids stale closures)
  const pausedRef = useRef(canvas.state.paused);
  pausedRef.current = canvas.state.paused;

  const inStudioRef = useRef(inStudio);
  inStudioRef.current = inStudio;

  // Stable ref for setPaused to avoid re-subscribing to AppState on every render
  const setPausedRef = useRef(canvas.setPaused);
  setPausedRef.current = canvas.setPaused;

  // Track if agent was running before backgrounding (for auto-resume)
  const wasRunningBeforeBackgroundRef = useRef(false);

  // App lifecycle: pause on background, resume on foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'background') {
        // Remember if agent was running (for auto-resume on foreground)
        wasRunningBeforeBackgroundRef.current = !pausedRef.current;
        if (!pausedRef.current) {
          // Optimistic update order for consistency (though UI isn't visible when backgrounded)
          setPausedRef.current(true);
          send({ type: 'pause' });
        }
        // Stay in current screen - don't exit to home
      } else if (nextAppState === 'active') {
        // Auto-resume if we're in studio and agent was running before background
        if (inStudioRef.current && wasRunningBeforeBackgroundRef.current) {
          // Optimistic update order for consistency
          setPausedRef.current(false);
          send({ type: 'resume' });
          wasRunningBeforeBackgroundRef.current = false;
        }
      }
    });

    return () => subscription.remove();
  }, [send]);

  // Pending strokes fetching
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
    enqueueStrokes: (strokes) => {
      dispatch({ type: 'ENQUEUE_STROKES', strokes });
    },
    clearPending: () => dispatch({ type: 'CLEAR_PENDING_STROKES' }),
    onError: (error) => {
      console.error('[StudioContext] Failed to fetch strokes:', error);
    },
  });

  // Callback when stroke animation completes
  const handleStrokesComplete = useCallback(
    (batchId: number) => {
      send({ type: 'animation_done', batch_id: batchId });
    },
    [send]
  );

  // Performance animation loop
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

  // === Action handlers ===

  // Studio action handler (from ActionBar)
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
            // Optimistic update: update UI immediately, then notify server
            canvas.setPaused(false);
            tracer.recordEvent('action.resume');
            send({ type: 'resume' });
          } else {
            // Optimistic update: update UI immediately, then notify server
            canvas.setPaused(true);
            tracer.recordEvent('action.pause');
            send({ type: 'pause' });
          }
          break;
        case 'home':
          tracer.recordEvent('session.back_to_home');
          // Pause agent when going home (optimistic update first)
          if (!canvas.state.paused) {
            canvas.setPaused(true);
            send({ type: 'pause' });
          }
          exitStudio();
          break;
        case 'gallery':
          openModal('gallery');
          break;
      }
    },
    [canvas, send, openModal, exitStudio]
  );

  // Stroke handlers (from Canvas)
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
    (style: DrawingStyleType) => {
      send({ type: 'set_style', drawing_style: style });
    },
    [send]
  );

  const handleContinue = useCallback(() => {
    tracer.recordEvent('session.continue');
    if (canvas.state.paused) {
      // Optimistic update: update UI immediately, then notify server
      canvas.setPaused(false);
      send({ type: 'resume' });
    }
    enterStudio();
  }, [send, canvas, enterStudio]);

  const handleStartWithPrompt = useCallback(
    (prompt: string) => {
      tracer.recordEvent('session.start', { hasDirection: true });
      tracer.newSession();
      // Optimistic update: update UI immediately, then notify server
      canvas.setPaused(false);
      send({ type: 'new_canvas', direction: prompt });
      send({ type: 'resume' });
      enterStudio();
    },
    [send, canvas, enterStudio]
  );

  const handleSurpriseMe = useCallback(() => {
    tracer.recordEvent('session.start', { hasDirection: false });
    tracer.newSession();
    // Optimistic update: update UI immediately, then notify server
    canvas.setPaused(false);
    send({ type: 'new_canvas' });
    send({ type: 'resume' });
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
    (direction?: string, style?: DrawingStyleType) => {
      tracer.recordEvent('action.new_canvas', { hasDirection: !!direction, style });
      tracer.newSession();
      // Optimistic update: update UI immediately, then notify server
      canvas.setPaused(false);
      send({ type: 'new_canvas', direction, drawing_style: style });
      send({ type: 'resume' });
      enterStudio();
    },
    [send, canvas, enterStudio]
  );

  const handleGallerySelect = useCallback(
    async (pieceNumber: number) => {
      closeModal();
      setInStudio(true);
      try {
        const response = await api.fetch(`/gallery/${pieceNumber}/strokes`);
        if (response.ok) {
          const data = await response.json();
          dispatch({
            type: 'LOAD_CANVAS',
            strokes: data.strokes,
            pieceNumber: data.piece_number,
            drawingStyle: data.drawing_style,
            styleConfig: data.style_config,
          });
        }
      } catch {
        // Silently fail — user sees current canvas, can go back
      }
    },
    [closeModal, setInStudio, api, dispatch]
  );

  // Bundle actions for stable reference
  const actions = useMemo(
    () => ({
      handleStudioAction,
      handleStrokeStart,
      handleStrokeMove,
      handleStrokeEnd,
      handleStyleChange,
      handleContinue,
      handleStartWithPrompt,
      handleSurpriseMe,
      handleNudgeSend,
      handleNewCanvasStart,
      handleGallerySelect,
    }),
    [
      handleStudioAction,
      handleStrokeStart,
      handleStrokeMove,
      handleStrokeEnd,
      handleStyleChange,
      handleContinue,
      handleStartWithPrompt,
      handleSurpriseMe,
      handleNudgeSend,
      handleNewCanvasStart,
      handleGallerySelect,
    ]
  );

  // Memoize context value to prevent unnecessary re-renders
  const value = useMemo<StudioContextValue>(
    () => ({
      canvasState: canvas.state,
      dispatch,
      agentStatus,
      currentTool,
      wsConnected: wsState.connected,
      send,
      activeModal,
      openModal,
      closeModal,
      gallery: canvas.state.gallery,
      api,
      actions,
    }),
    [
      canvas.state,
      dispatch,
      agentStatus,
      currentTool,
      wsState.connected,
      send,
      activeModal,
      openModal,
      closeModal,
      api,
      actions,
    ]
  );

  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}

/**
 * Hook to access studio context.
 * Must be used within a StudioProvider.
 */
export function useStudio(): StudioContextValue {
  const context = useContext(StudioContext);
  if (!context) {
    throw new Error('useStudio must be used within a StudioProvider');
  }
  return context;
}
