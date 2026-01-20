/**
 * HomePanel - Simplified home screen shown on app load.
 * Shows last canvas prominently, quick prompt input, and expandable options.
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
import { getApiUrl } from '../config';
import { spacing, borderRadius, typography, useTheme } from '../theme';
import { StylePicker } from './StylePicker';

interface HomePanelProps {
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
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);

  const hasRecentWork = hasCurrentWork || recentCanvas !== null;

  // Reset image state when canvas changes to avoid stale loading/error state
  useEffect(() => {
    setImageLoading(true);
    setImageError(false);
  }, [recentCanvas?.thumbnail_token]);

  const handleSubmitPrompt = () => {
    if (prompt.trim()) {
      onStartWithPrompt(prompt.trim());
      setPrompt('');
      Keyboard.dismiss();
    }
  };

  const getThumbnailUrl = (token: string | undefined) => {
    if (!token) return '';
    return `${getApiUrl()}/gallery/thumbnail/${token}.png`;
  };

  const dismissKeyboard = () => {
    Keyboard.dismiss();
  };

  return (
    <TouchableWithoutFeedback onPress={dismissKeyboard}>
      <View style={[styles.container, { backgroundColor: colors.surface }, shadows.md]}>
        {/* Last Canvas Section */}
        {hasRecentWork ? (
          <Pressable
            style={({ pressed }) => [
              styles.canvasSection,
              { backgroundColor: colors.canvasBackground },
              pressed && { opacity: 0.9, transform: [{ scale: 0.99 }] },
            ]}
            onPress={onContinue}
            disabled={!connected}
          >
            <View style={styles.canvasPreview}>
              {recentCanvas?.thumbnail_token && !imageError ? (
                <>
                  {imageLoading && (
                    <View style={styles.loadingOverlay}>
                      <ActivityIndicator size="small" color={colors.textMuted} />
                    </View>
                  )}
                  <Image
                    source={{ uri: getThumbnailUrl(recentCanvas.thumbnail_token) }}
                    style={styles.thumbnailImage}
                    resizeMode="contain"
                    onLoadStart={() => setImageLoading(true)}
                    onLoadEnd={() => setImageLoading(false)}
                    onError={() => {
                      setImageLoading(false);
                      setImageError(true);
                    }}
                  />
                </>
              ) : (
                <View style={styles.canvasPlaceholder}>
                  <Ionicons name="brush-outline" size={48} color={colors.textMuted} />
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
        ) : (
          <View style={[styles.emptyCanvasSection, { backgroundColor: colors.surfaceElevated }]}>
            <Ionicons name="sparkles" size={48} color={colors.primary} />
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
              Ready to create
            </Text>
            <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
              Enter a prompt below or tap Surprise Me
            </Text>
          </View>
        )}

        {/* Prompt Input */}
        <View style={styles.promptSection}>
          <View
            style={[
              styles.promptInputContainer,
              { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
            ]}
          >
            <TextInput
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
          <Text style={[styles.promptHint, { color: colors.textMuted }]}>
            Uses {drawingStyle} style
          </Text>
        </View>

        {/* More Options Toggle */}
        <Pressable
          style={({ pressed }) => [
            styles.moreOptionsToggle,
            pressed && { opacity: 0.7 },
          ]}
          onPress={() => setShowMoreOptions(!showMoreOptions)}
        >
          <Text style={[styles.moreOptionsText, { color: colors.textSecondary }]}>
            {showMoreOptions ? 'Less options' : 'More options'}
          </Text>
          <Ionicons
            name={showMoreOptions ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={colors.textSecondary}
          />
        </Pressable>

        {/* Expanded Options */}
        {showMoreOptions && (
          <View style={styles.expandedOptions}>
            {/* Style Picker */}
            <StylePicker
              value={drawingStyle}
              onChange={onStyleChange}
              variant="segmented"
              label="Drawing style"
            />

            {/* Action Buttons */}
            <View style={styles.actionButtons}>
              <Pressable
                style={({ pressed }) => [
                  styles.actionButton,
                  { backgroundColor: colors.surfaceElevated },
                  pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] },
                  !connected && styles.disabled,
                ]}
                onPress={onSurpriseMe}
                disabled={!connected}
              >
                <Ionicons name="sparkles" size={20} color={colors.primary} />
                <Text style={[styles.actionButtonText, { color: colors.textPrimary }]}>
                  Surprise Me
                </Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.actionButton,
                  { backgroundColor: colors.surfaceElevated },
                  pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] },
                ]}
                onPress={onOpenGallery}
              >
                <Ionicons name="images-outline" size={20} color={colors.textSecondary} />
                <Text style={[styles.actionButtonText, { color: colors.textPrimary }]}>
                  Gallery {galleryCount > 0 ? `(${galleryCount})` : ''}
                </Text>
              </Pressable>
            </View>
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
  // Canvas preview section
  canvasSection: {
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  canvasPreview: {
    aspectRatio: 1,
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
  // Empty state
  emptyCanvasSection: {
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  emptyTitle: {
    ...typography.heading,
    marginTop: spacing.sm,
  },
  emptySubtitle: {
    ...typography.body,
    textAlign: 'center',
  },
  // Prompt input
  promptSection: {
    gap: spacing.xs,
  },
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
  promptHint: {
    ...typography.small,
    paddingLeft: spacing.xs,
  },
  // More options toggle
  moreOptionsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  moreOptionsText: {
    ...typography.small,
    fontWeight: '500',
  },
  // Expanded options
  expandedOptions: {
    gap: spacing.md,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
  },
  actionButtonText: {
    ...typography.body,
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
