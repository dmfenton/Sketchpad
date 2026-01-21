/**
 * HomePanel - Home screen shown on app load.
 * Prioritizes new drawing creation with prompt input and style picker.
 * Shows continue option with thumbnail when recent work exists.
 */

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { DrawingStyleType, SavedCanvas } from '@code-monet/shared';
import type { ApiClient } from '../api';
import { useAuthenticatedImage } from '../hooks';
import { spacing, borderRadius, typography, useTheme } from '../theme';
import { StylePicker } from './StylePicker';

interface HomePanelProps {
  api: ApiClient;
  connected: boolean;
  /** Current strokes on canvas (to show "in progress" work) */
  hasCurrentWork: boolean;
  /** Most recent saved canvas from gallery */
  recentCanvas: SavedCanvas | null;
  /** Current drawing style */
  drawingStyle: DrawingStyleType;
  /** Gallery count for "View Gallery" link */
  galleryCount: number;
  onStyleChange: (style: DrawingStyleType) => void;
  /** Continue current/recent work */
  onContinue: () => void;
  /** Start new with prompt (uses current style) */
  onStartWithPrompt: (prompt: string) => void;
  /** Start new without prompt (surprise me) */
  onSurpriseMe: () => void;
  /** Open gallery */
  onOpenGallery: () => void;
}

const MAX_PROMPT_LENGTH = 200;

export function HomePanel({
  api,
  connected,
  hasCurrentWork,
  recentCanvas,
  drawingStyle,
  galleryCount,
  onStyleChange,
  onContinue,
  onStartWithPrompt,
  onSurpriseMe,
  onOpenGallery,
}: HomePanelProps): React.JSX.Element {
  const { colors, shadows } = useTheme();
  const [prompt, setPrompt] = useState('');
  const [nativeImageLoading, setNativeImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);

  const hasRecentWork = hasCurrentWork || recentCanvas !== null;

  // Build thumbnail path for hook
  const thumbnailPath = recentCanvas?.thumbnail_token
    ? `/gallery/thumbnail/${recentCanvas.thumbnail_token}.png`
    : undefined;

  // Use authenticated image hook for web blob URL workaround
  const { source: thumbnailSource, loading: hookLoading } =
    useAuthenticatedImage(api, thumbnailPath);

  // Combine loading states: hook loading (web) + native image loading
  const imageLoading = hookLoading || nativeImageLoading;

  // Reset image state when canvas changes to avoid stale loading/error state
  useEffect(() => {
    setNativeImageLoading(true);
    setImageError(false);
  }, [recentCanvas?.thumbnail_token]);

  const handleSubmitPrompt = () => {
    if (prompt.trim()) {
      onStartWithPrompt(prompt.trim());
      setPrompt('');
      Keyboard.dismiss();
    }
  };

  const dismissKeyboard = () => {
    Keyboard.dismiss();
  };

  return (
    <TouchableWithoutFeedback onPress={dismissKeyboard}>
      <View testID="home-panel" style={[styles.container, { backgroundColor: colors.surface }, shadows.md]}>
        {/* Start Drawing Section */}
        <View style={styles.startSection}>
          <Text style={[styles.sectionHeader, { color: colors.textPrimary }]}>
            Start Drawing
          </Text>

          {/* Prompt Input */}
          <View
            style={[
              styles.promptInputContainer,
              { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
            ]}
          >
            <TextInput
              testID="home-prompt-input"
              style={[styles.promptInput, { color: colors.textPrimary }]}
              value={prompt}
              onChangeText={(t) => setPrompt(t.slice(0, MAX_PROMPT_LENGTH))}
              placeholder="Describe your next piece…"
              placeholderTextColor={colors.textMuted}
              returnKeyType="go"
              onSubmitEditing={handleSubmitPrompt}
              editable={connected}
            />
            <Pressable
              testID="home-prompt-submit"
              style={[
                styles.promptSubmit,
                { backgroundColor: prompt.trim() && connected ? colors.primary : colors.surfaceElevated },
              ]}
              onPress={handleSubmitPrompt}
              disabled={!prompt.trim() || !connected}
            >
              <Ionicons
                name="arrow-forward"
                size={20}
                color={prompt.trim() && connected ? colors.textOnPrimary : colors.textMuted}
              />
            </Pressable>
          </View>

          {/* Style Picker */}
          <StylePicker
            value={drawingStyle}
            onChange={onStyleChange}
            variant="segmented"
            label="Style"
          />

          {/* Surprise Me Button */}
          <Pressable
            testID="home-surprise-me"
            style={({ pressed }) => [
              styles.surpriseMeButton,
              { backgroundColor: colors.surfaceElevated },
              pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] },
              !connected && styles.disabled,
            ]}
            onPress={onSurpriseMe}
            disabled={!connected}
          >
            <Ionicons name="sparkles" size={20} color={colors.primary} />
            <Text style={[styles.surpriseMeText, { color: colors.textPrimary }]}>
              Surprise Me
            </Text>
          </Pressable>
        </View>

        {/* OR Divider - only show when there's recent work */}
        {hasRecentWork && (
          <View style={styles.divider}>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            <Text style={[styles.dividerText, { color: colors.textMuted }]}>OR</Text>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
          </View>
        )}

        {/* Continue Section */}
        {hasRecentWork && (
          <View style={styles.continueSection}>
            <Text style={[styles.sectionHeader, { color: colors.textPrimary }]}>
              Continue where you left off
            </Text>

            <Pressable
              testID="home-continue-button"
              style={({ pressed }) => [
                styles.canvasSection,
                { backgroundColor: colors.canvasBackground },
                pressed && { opacity: 0.9, transform: [{ scale: 0.99 }] },
              ]}
              onPress={onContinue}
              disabled={!connected}
            >
              <View style={styles.canvasPreview}>
                {thumbnailSource && !imageError ? (
                  <>
                    {imageLoading && (
                      <View style={styles.loadingOverlay}>
                        <ActivityIndicator size="small" color={colors.textMuted} />
                      </View>
                    )}
                    <Image
                      source={thumbnailSource}
                      style={styles.thumbnailImage}
                      resizeMode="contain"
                      onLoadStart={() => setNativeImageLoading(true)}
                      onLoadEnd={() => setNativeImageLoading(false)}
                      onError={() => {
                        setNativeImageLoading(false);
                        setImageError(true);
                      }}
                    />
                  </>
                ) : (
                  <View style={styles.canvasPlaceholder}>
                    <Ionicons name="brush-outline" size={32} color={colors.textMuted} />
                    <Text style={[styles.placeholderText, { color: colors.textMuted }]}>
                      {hasCurrentWork ? 'Work in progress' : 'Recent drawing'}
                    </Text>
                  </View>
                )}
              </View>

              <View style={styles.canvasInfo}>
                <Text style={[styles.canvasTitle, { color: colors.textPrimary }]}>
                  {recentCanvas?.title || (hasCurrentWork ? 'Current Drawing' : `#${recentCanvas?.piece_number ?? ''}`)}
                </Text>
                <View style={[styles.continueButton, { backgroundColor: colors.primary }]}>
                  <Text style={[styles.continueText, { color: colors.textOnPrimary }]}>
                    Continue
                  </Text>
                  <Ionicons name="arrow-forward" size={16} color={colors.textOnPrimary} />
                </View>
              </View>
            </Pressable>

            {/* Gallery Link */}
            <Pressable
              testID="home-gallery"
              style={({ pressed }) => [
                styles.galleryLink,
                pressed && { opacity: 0.7 },
              ]}
              onPress={onOpenGallery}
            >
              <Ionicons name="images-outline" size={16} color={colors.textSecondary} />
              <Text style={[styles.galleryLinkText, { color: colors.textSecondary }]}>
                View Gallery{galleryCount > 0 ? ` (${galleryCount})` : ''}
              </Text>
            </Pressable>
          </View>
        )}

        {/* Connection Status */}
        {!connected && (
          <View style={styles.connectionHint}>
            <Ionicons name="cloud-offline-outline" size={14} color={colors.textMuted} />
            <Text style={[styles.connectionHintText, { color: colors.textMuted }]}>
              Connecting...
            </Text>
          </View>
        )}
      </View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  // Section headers
  sectionHeader: {
    ...typography.body,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  // Start Drawing section
  startSection: {
    gap: spacing.md,
  },
  // Prompt input
  promptInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
  },
  promptInput: {
    flex: 1,
    ...typography.body,
    paddingVertical: spacing.md,
  },
  promptSubmit: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Surprise Me button (full-width)
  surpriseMeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
  },
  surpriseMeText: {
    ...typography.body,
    fontWeight: '500',
  },
  // OR Divider
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    ...typography.small,
    fontWeight: '500',
  },
  // Continue section
  continueSection: {
    gap: spacing.sm,
  },
  // Canvas preview section
  canvasSection: {
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  canvasPreview: {
    aspectRatio: 16 / 9,
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  canvasPlaceholder: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  placeholderText: {
    ...typography.small,
  },
  canvasInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
  },
  canvasTitle: {
    ...typography.body,
    fontWeight: '600',
    flex: 1,
  },
  continueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
  },
  continueText: {
    ...typography.small,
    fontWeight: '600',
  },
  // Gallery link
  galleryLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  galleryLinkText: {
    ...typography.small,
    fontWeight: '500',
  },
  disabled: {
    opacity: 0.5,
  },
  // Connection hint
  connectionHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  connectionHintText: {
    ...typography.small,
  },
});
