/**
 * Navigation context - manages app screen state and transitions.
 *
 * ## Design Decision: Explicit State Machine
 *
 * This app uses a simple state machine for navigation instead of a library
 * like react-navigation because:
 *
 * 1. Three-screen model - Home, Studio, and Gallery screens
 * 2. Controlled transitions - Navigation triggers side effects (pause/resume agent)
 * 3. Backgrounding behavior - Custom logic for app suspend/resume
 * 4. No deep linking needs - App always starts at Home
 *
 * ## Limitations (Accepted Trade-offs)
 *
 * - No swipe back gesture (intentional - prevents accidental exits during drawing)
 * - Minimal navigation history (gallery tracks its previous screen)
 * - No URL-based routing (not a web app)
 *
 * ## Future Considerations
 *
 * If the app grows to need more than 3 screens, deep linking, or nested
 * navigation, consider migrating to react-navigation with custom state
 * persistence to maintain the pause-on-exit behavior.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Platform } from 'react-native';

/** Navigation screen type */
export type Screen = 'home' | 'studio' | 'gallery';

export interface NavigationContextValue {
  /** Current screen */
  screen: Screen;
  /** Whether user is in the studio (convenience accessor) */
  inStudio: boolean;
  /** Navigate to studio screen */
  enterStudio: () => void;
  /** Navigate to home screen */
  exitStudio: () => void;
  /** Set screen directly (for gallery selection, etc.) */
  setInStudio: (inStudio: boolean) => void;
  /** Navigate to gallery screen */
  openGallery: () => void;
  /** Navigate back from gallery to the previous screen */
  closeGallery: () => void;
  /** Navigate from gallery directly to home */
  galleryToHome: () => void;
  /** Whether gallery was opened from the studio screen */
  galleryFromStudio: boolean;
}

const NavigationContext = createContext<NavigationContextValue | null>(null);

export interface NavigationProviderProps {
  children: React.ReactNode;
  /** Optional callback when exiting studio (e.g., to pause agent) */
  onExitStudio?: () => void;
}

/**
 * Provider that manages navigation state and screen transitions.
 *
 * Handles:
 * - Screen transitions (home <-> studio <-> gallery)
 * - Android back button (exits studio -> home, then exits app)
 *
 * Note: App backgrounding (pause/resume) is handled by StudioProvider,
 * which has access to the WebSocket connection.
 */
export function NavigationProvider({
  children,
  onExitStudio,
}: NavigationProviderProps): React.JSX.Element {
  const [screen, setScreen] = useState<Screen>('home');
  // Track which screen the gallery was opened from
  const [previousScreen, setPreviousScreen] = useState<Screen>('home');

  // Track screen in ref for back button handler (avoids stale closure)
  const screenRef = useRef(screen);
  screenRef.current = screen;

  // Derived state
  const inStudio = screen === 'studio';
  const galleryFromStudio = screen === 'gallery' && previousScreen === 'studio';

  // Navigate to studio
  const enterStudio = useCallback(() => {
    setScreen('studio');
  }, []);

  // Navigate to home
  const exitStudio = useCallback(() => {
    onExitStudio?.();
    setScreen('home');
  }, [onExitStudio]);

  // Set screen directly (for gallery selection)
  const setInStudio = useCallback((value: boolean) => {
    setScreen(value ? 'studio' : 'home');
  }, []);

  // Navigate to gallery, remembering where we came from
  const openGallery = useCallback(() => {
    if (screenRef.current === 'gallery') return;
    setPreviousScreen(screenRef.current);
    setScreen('gallery');
  }, []);

  // Navigate back from gallery to previous screen
  const closeGallery = useCallback(() => {
    setScreen((prev) => prev === 'gallery' ? previousScreen : prev);
  }, [previousScreen]);

  // Navigate from gallery directly to home
  const galleryToHome = useCallback(() => {
    setScreen('home');
  }, []);

  // Android back button handler
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (screenRef.current === 'gallery') {
        closeGallery();
        return true;
      }
      if (screenRef.current === 'studio') {
        exitStudio();
        return true; // Prevent default (don't close app)
      }
      return false; // Let system handle (close app)
    });

    return () => backHandler.remove();
  }, [exitStudio, closeGallery]);

  // Memoize context value
  const value = useMemo<NavigationContextValue>(
    () => ({
      screen,
      inStudio,
      enterStudio,
      exitStudio,
      setInStudio,
      openGallery,
      closeGallery,
      galleryToHome,
      galleryFromStudio,
    }),
    [screen, inStudio, enterStudio, exitStudio, setInStudio, openGallery, closeGallery, galleryToHome, galleryFromStudio]
  );

  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

/**
 * Hook to access navigation context.
 * Must be used within a NavigationProvider.
 */
export function useNavigation(): NavigationContextValue {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error('useNavigation must be used within a NavigationProvider');
  }
  return context;
}
