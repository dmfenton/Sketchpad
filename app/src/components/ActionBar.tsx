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
  onDrawToggle: () => void;
  onNudge: () => void;
  onClear: () => void;
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
}

function ActionButton({
  icon,
  label,
  active = false,
  disabled = false,
  variant = 'default',
  onPress,
  colors,
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
  onDrawToggle,
  onNudge,
  onClear: _onClear,
  onPauseToggle,
  onNewCanvas,
  onGallery,
}: ActionBarProps): React.JSX.Element {
  const { colors, shadows } = useTheme();
  // Note: onClear is still in props for API compatibility but removed from UI
  void _onClear;
  return (
    <View style={styles.container}>
      <View style={[styles.bar, { backgroundColor: colors.surface }, shadows.lg]}>
        <ActionButton
          icon={drawingEnabled ? 'pencil' : 'pencil-outline'}
          label="Draw"
          active={drawingEnabled}
          disabled={!connected}
          onPress={onDrawToggle}
          colors={colors}
        />
        <ActionButton
          icon="chatbubble-outline"
          label="Nudge"
          disabled={!connected}
          onPress={onNudge}
          colors={colors}
        />
        <ActionButton
          icon="add-circle-outline"
          label="New"
          disabled={!connected}
          onPress={onNewCanvas}
          colors={colors}
        />
        <ActionButton
          icon="images-outline"
          label={galleryCount > 0 ? `Gallery (${galleryCount})` : 'Gallery'}
          disabled={!connected || galleryCount === 0}
          onPress={onGallery}
          colors={colors}
        />
        <ActionButton
          icon={paused ? 'play' : 'pause'}
          label={paused ? 'Start' : 'Pause'}
          active={paused}
          disabled={!connected}
          onPress={onPauseToggle}
          colors={colors}
        />
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
