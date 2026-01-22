/**
 * App navigation state management.
 * Manages studio/home screen transitions and app backgrounding behavior.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import type { ClientMessage } from '@code-monet/shared';

export interface UseAppNavigationOptions {
  /** Function to send WebSocket messages */
  send: (message: ClientMessage) => void;
  /** Whether the agent is currently paused */
  paused: boolean;
  /** Callback to set paused state */
  setPaused: (paused: boolean) => void;
}

export interface UseAppNavigationReturn {
  /** Whether user is in the studio (canvas view) */
  inStudio: boolean;
  /** Enter studio mode */
  enterStudio: () => void;
  /** Exit studio mode (pause agent, return to home) */
  exitStudio: () => void;
  /** Set studio state directly (for gallery selection, etc.) */
  setInStudio: (inStudio: boolean) => void;
}

/**
 * Hook to manage app navigation between home and studio screens.
 * Handles app backgrounding - pauses agent and returns to home.
 */
export function useAppNavigation({
  send,
  paused,
  setPaused,
}: UseAppNavigationOptions): UseAppNavigationReturn {
  const [inStudio, setInStudio] = useState(false);

  // Track paused state in ref for AppState callback (avoids stale closure)
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  // Enter studio mode
  const enterStudio = useCallback(() => {
    setInStudio(true);
  }, []);

  // Exit studio mode - pause agent and return to home
  const exitStudio = useCallback(() => {
    if (!pausedRef.current) {
      send({ type: 'pause' });
      setPaused(true);
    }
    setInStudio(false);
  }, [send, setPaused]);

  // Pause agent and return to home when app goes to background
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'background') {
        if (!pausedRef.current) {
          send({ type: 'pause' });
          setPaused(true);
        }
        setInStudio(false);
      }
    });
    return () => subscription.remove();
  }, [send, setPaused]);

  return {
    inStudio,
    enterStudio,
    exitStudio,
    setInStudio,
  };
}
