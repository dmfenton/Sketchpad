/**
 * Floating action bar with labeled icon buttons.
 */

import React, { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { spacing, borderRadius, typography, useTheme, type ColorScheme } from '../theme';

interface ActionBarProps {
  drawingEnabled: boolean;
  paused: boolean;
  connected: boolean;
  galleryCount: number;
  viewOnly?: boolean;
  onDrawToggle: () => void;
  onNudge: () => void;
  onPauseToggle: () => void;
  onNewCanvas: () => void;
  onGallery: () => void;
}

interface ActionButtonProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  active?: boolean;
  disabled?: boolean;
  variant?: 'default' | 'danger';
  onPress: () => void;
  colors: ColorScheme;
  testID?: string;
}

function ActionButton({
  icon,
  label,
  active = false,
  disabled = false,
  variant = 'default',
  onPress,
  colors,
  testID,
}: ActionButtonProps): React.JSX.Element {
  const handlePress = useCallback(() => {
    if (!disabled) {
      onPress();
    }
  }, [disabled, onPress]);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        active && { backgroundColor: colors.surfaceElevated },
        disabled && styles.buttonDisabled,
        pressed &&
          !disabled && { backgroundColor: colors.surfaceElevated, transform: [{ scale: 0.96 }] },
      ]}
      onPress={handlePress}
      disabled={disabled}
      testID={testID}
    >
      <Ionicons
        name={icon}
        size={22}
        color={
          disabled
            ? colors.textMuted
            : active
              ? colors.primary
              : variant === 'danger'
                ? colors.error
                : colors.textPrimary
        }
      />
      <Text
        style={[
          styles.buttonLabel,
          { color: colors.textSecondary },
          active && { color: colors.primary, fontWeight: '600' },
          disabled && { color: colors.textMuted },
          variant === 'danger' && !disabled && { color: colors.error },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function ActionBar({
  drawingEnabled,
  paused,
  connected,
  galleryCount,
  viewOnly = false,
  onDrawToggle,
  onNudge,
  onPauseToggle,
  onNewCanvas,
  onGallery,
}: ActionBarProps): React.JSX.Element {
  const { colors, shadows } = useTheme();
  return (
    <View style={styles.container} testID="action-bar">
      <View style={[styles.bar, { backgroundColor: colors.surface }, shadows.lg]}>
        {/* Contextual actions - only show when agent is active and not view-only */}
        {!paused && !viewOnly && (
          <>
            <ActionButton
              icon={drawingEnabled ? 'pencil' : 'pencil-outline'}
              label="Draw"
              active={drawingEnabled}
              disabled={!connected}
              onPress={onDrawToggle}
              colors={colors}
              testID="action-draw"
            />
            <ActionButton
              icon="chatbubble-outline"
              label="Nudge"
              disabled={!connected}
              onPress={onNudge}
              colors={colors}
              testID="action-nudge"
            />
          </>
        )}
        <ActionButton
          icon="home-outline"
          label="Home"
          onPress={onNewCanvas}
          colors={colors}
          testID="action-home"
        />
        <ActionButton
          icon="images-outline"
          label="Gallery"
          disabled={galleryCount === 0}
          onPress={onGallery}
          colors={colors}
          testID="action-gallery"
        />
        {/* Hide pause/start when viewing completed piece */}
        {!viewOnly && (
          <ActionButton
            icon={paused ? 'play' : 'pause'}
            label={paused ? 'Start' : 'Pause'}
            active={paused}
            disabled={!connected}
            onPress={onPauseToggle}
            colors={colors}
            testID="action-pause"
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.xs,
  },
  bar: {
    flexDirection: 'row',
    borderRadius: borderRadius.lg,
    padding: spacing.xs,
    gap: 2,
  },
  button: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: borderRadius.md,
    gap: 2,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonLabel: {
    ...typography.small,
  },
});
