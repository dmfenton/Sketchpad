/**
 * ContinueCard - Card showing recent canvas with thumbnail and continue button.
 */

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Path as SvgPath } from 'react-native-svg';

import {
  CANVAS_ASPECT_RATIO,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  type DrawingStyleConfig,
  getEffectiveStyle,
  type Path,
  pathToSvgD,
  type SavedCanvas,
} from '@code-monet/shared';
import type { ApiClient } from '../../api';
import { useAuthenticatedImage } from '../../hooks';
import { spacing, borderRadius, typography, useTheme } from '../../theme';

interface ContinueCardProps {
  api: ApiClient;
  recentCanvas: SavedCanvas | null;
  hasCurrentWork: boolean;
  strokes: Path[];
  styleConfig: DrawingStyleConfig;
  onContinue: () => void;
  disabled?: boolean;
}

/**
 * Simple SVG preview of work-in-progress strokes.
 * Renders completed strokes without animation.
 * Memoized to avoid re-renders when parent state changes.
 */
const WipPreview = React.memo(function WipPreview({
  strokes,
  styleConfig,
}: {
  strokes: Path[];
  styleConfig: DrawingStyleConfig;
}): React.JSX.Element {
  return (
    <Svg
      width="100%"
      height="100%"
      viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
      preserveAspectRatio="xMidYMid meet"
    >
      {strokes.map((stroke, index) => {
        const effectiveStyle = getEffectiveStyle(stroke, styleConfig);
        const isPaintMode = styleConfig.type === 'paint';

        // Render single-point strokes as dots
        if (stroke.type !== 'svg' && stroke.points.length === 1) {
          const pt = stroke.points[0]!;
          const radius = Math.max(1, effectiveStyle.stroke_width / 2);
          return (
            <Circle
              key={`wip-dot-${index}`}
              cx={pt.x}
              cy={pt.y}
              r={radius}
              fill={effectiveStyle.color}
              opacity={effectiveStyle.opacity}
            />
          );
        }

        // Render strokes as paths
        return (
          <SvgPath
            key={`wip-stroke-${index}`}
            d={pathToSvgD(stroke, isPaintMode)}
            stroke={effectiveStyle.color}
            strokeWidth={effectiveStyle.stroke_width}
            fill="none"
            strokeLinecap={effectiveStyle.stroke_linecap}
            strokeLinejoin={effectiveStyle.stroke_linejoin}
            opacity={effectiveStyle.opacity}
          />
        );
      })}
    </Svg>
  );
});

export function ContinueCard({
  api,
  recentCanvas,
  hasCurrentWork,
  strokes,
  styleConfig,
  onContinue,
  disabled = false,
}: ContinueCardProps): React.JSX.Element {
  const { colors } = useTheme();
  const [nativeLoading, setNativeLoading] = useState(true);
  const [imageError, setImageError] = useState(false);

  // Build thumbnail path for hook
  // Only show gallery thumbnail when there's no current work - otherwise the
  // thumbnail would show an old image, which is misleading
  const thumbnailPath =
    !hasCurrentWork && recentCanvas?.thumbnail_token
      ? `/gallery/thumbnail/${recentCanvas.thumbnail_token}.png`
      : undefined;

  // Use authenticated image hook for web blob URL workaround
  const { source: thumbnailSource, loading: hookLoading } =
    useAuthenticatedImage(api, thumbnailPath);

  // Combine loading states: hook loading (web) + native image loading
  const imageLoading = hookLoading || nativeLoading;

  // Reset image state when canvas changes
  useEffect(() => {
    setNativeLoading(true);
    setImageError(false);
  }, [recentCanvas?.thumbnail_token]);

  const title =
    recentCanvas?.title ||
    (hasCurrentWork ? 'Current Drawing' : `#${recentCanvas?.piece_number ?? ''}`);

  // Completed canvas = no current work, just showing gallery thumbnail
  const isCompleted = !hasCurrentWork;

  const content = (
    <>
      <View style={[styles.preview, { backgroundColor: colors.canvasBackground }]}>
        {hasCurrentWork && strokes.length > 0 ? (
          // Show live WIP preview when there are strokes
          <WipPreview strokes={strokes} styleConfig={styleConfig} />
        ) : thumbnailSource && !imageError ? (
          // Show gallery thumbnail for completed work
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
              onLoadStart={() => setNativeLoading(true)}
              onLoadEnd={() => setNativeLoading(false)}
              onError={() => {
                setNativeLoading(false);
                setImageError(true);
              }}
            />
          </>
        ) : (
          // Fallback placeholder
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
        {!isCompleted && (
          <View style={[styles.continueButton, { backgroundColor: colors.primary }]}>
            <Text style={[styles.continueText, { color: colors.textOnPrimary }]}>Continue</Text>
            <Ionicons name="arrow-forward" size={16} color={colors.textOnPrimary} />
          </View>
        )}
      </View>
    </>
  );

  if (isCompleted) {
    return (
      <View
        testID="home-continue-button"
        style={[styles.container, { backgroundColor: colors.canvasBackground }]}
      >
        {content}
      </View>
    );
  }

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
      {content}
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
