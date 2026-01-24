/**
 * ContinueCard - Card showing recent canvas with thumbnail and continue button.
 */

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ImageSourcePropType } from 'react-native';

import { CANVAS_ASPECT_RATIO, type SavedCanvas } from '@code-monet/shared';
import { spacing, borderRadius, typography, useTheme } from '../../theme';

interface ContinueCardProps {
  recentCanvas: SavedCanvas | null;
  hasCurrentWork: boolean;
  thumbnailSource: ImageSourcePropType | null;
  onContinue: () => void;
  disabled?: boolean;
}

export function ContinueCard({
  recentCanvas,
  hasCurrentWork,
  thumbnailSource,
  onContinue,
  disabled = false,
}: ContinueCardProps): React.JSX.Element {
  const { colors } = useTheme();
  const [imageLoading, setImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);

  // Reset image state when canvas changes
  useEffect(() => {
    setImageLoading(true);
    setImageError(false);
  }, [recentCanvas?.thumbnail_token]);

  const title =
    recentCanvas?.title ||
    (hasCurrentWork ? 'Current Drawing' : `#${recentCanvas?.piece_number ?? ''}`);

  return (
    <Pressable
      testID="home-continue-button"
      style={({ pressed }) => [
        styles.container,
        { backgroundColor: colors.canvasBackground },
        pressed && { opacity: 0.9, transform: [{ scale: 0.99 }] },
      ]}
      onPress={onContinue}
      disabled={disabled}
    >
      <View style={styles.preview}>
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
              onLoadStart={() => setImageLoading(true)}
              onLoadEnd={() => setImageLoading(false)}
              onError={() => {
                setImageLoading(false);
                setImageError(true);
              }}
            />
          </>
        ) : (
          <View style={styles.placeholder}>
            <Ionicons name="brush-outline" size={32} color={colors.textMuted} />
            <Text style={[styles.placeholderText, { color: colors.textMuted }]}>
              {hasCurrentWork ? 'Work in progress' : 'Recent drawing'}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.info}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
        <View style={[styles.continueButton, { backgroundColor: colors.primary }]}>
          <Text style={[styles.continueText, { color: colors.textOnPrimary }]}>Continue</Text>
          <Ionicons name="arrow-forward" size={16} color={colors.textOnPrimary} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  preview: {
    aspectRatio: CANVAS_ASPECT_RATIO,
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
  placeholder: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  placeholderText: {
    ...typography.small,
  },
  info: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
  },
  title: {
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
});
