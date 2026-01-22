/**
 * HomeScreen - Landing screen with drawing options.
 * Encapsulates HomePanel with keyboard avoiding behavior.
 */

import React, { useMemo } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';

import type { DrawingStyleType, SavedCanvas } from '@code-monet/shared';
import type { ApiClient } from '../api';

import { HomePanel } from '../components';

/** Props for HomeScreen */
export interface HomeScreenProps {
  /** API client for authenticated requests */
  api: ApiClient;
  /** WebSocket connected state */
  wsConnected: boolean;
  /** Whether there are strokes on the current canvas */
  hasCurrentWork: boolean;
  /** Gallery entries for deriving recent canvas */
  gallery: SavedCanvas[];
  /** Current drawing style */
  drawingStyle: DrawingStyleType;
  /** Callback when style is changed */
  onStyleChange: (style: DrawingStyleType) => void;
  /** Callback to continue current/recent work */
  onContinue: () => void;
  /** Callback to start with a prompt */
  onStartWithPrompt: (prompt: string) => void;
  /** Callback for surprise me */
  onSurpriseMe: () => void;
  /** Callback to open gallery */
  onOpenGallery: () => void;
}

export function HomeScreen({
  api,
  wsConnected,
  hasCurrentWork,
  gallery,
  drawingStyle,
  onStyleChange,
  onContinue,
  onStartWithPrompt,
  onSurpriseMe,
  onOpenGallery,
}: HomeScreenProps): React.JSX.Element {
  // Derive recent canvas from gallery
  // Gallery is ordered oldest first, so get the last one
  const recentCanvas = useMemo(() => {
    if (gallery.length === 0) return null;
    return gallery[gallery.length - 1] ?? null;
  }, [gallery]);

  return (
    <KeyboardAvoidingView
      style={styles.keyboardView}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}
    >
      <HomePanel
        api={api}
        connected={wsConnected}
        hasCurrentWork={hasCurrentWork}
        recentCanvas={recentCanvas}
        drawingStyle={drawingStyle}
        galleryCount={gallery.length}
        onStyleChange={onStyleChange}
        onContinue={onContinue}
        onStartWithPrompt={onStartWithPrompt}
        onSurpriseMe={onSurpriseMe}
        onOpenGallery={onOpenGallery}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardView: {
    flex: 1,
  },
});
