/**
 * Floating action bar with labeled icon buttons.
 */

import React, { useCallback } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, spacing, borderRadius, typography, shadows } from '../theme';

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
}

function ActionButton({
  icon,
  label,
  active = false,
  disabled = false,
  variant = 'default',
  onPress,
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
        active && styles.buttonActive,
        disabled && styles.buttonDisabled,
        pressed && !disabled && styles.buttonPressed,
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
          active && styles.buttonLabelActive,
          disabled && styles.buttonLabelDisabled,
          variant === 'danger' && !disabled && styles.buttonLabelDanger,
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
  // Note: onClear is still in props for API compatibility but removed from UI
  void _onClear;
  return (
    <View style={styles.container}>
      <View style={styles.bar}>
        <ActionButton
          icon={drawingEnabled ? 'pencil' : 'pencil-outline'}
          label="Draw"
          active={drawingEnabled}
          disabled={!connected}
          onPress={onDrawToggle}
        />
        <ActionButton
          icon="chatbubble-outline"
          label="Nudge"
          disabled={!connected}
          onPress={onNudge}
        />
        <ActionButton
          icon="add-circle-outline"
          label="New"
          disabled={!connected}
          onPress={onNewCanvas}
        />
        <ActionButton
          icon="images-outline"
          label={galleryCount > 0 ? `Gallery (${galleryCount})` : 'Gallery'}
          disabled={!connected || galleryCount === 0}
          onPress={onGallery}
        />
        <ActionButton
          icon={paused ? 'play' : 'pause'}
          label={paused ? 'Start' : 'Pause'}
          active={paused}
          disabled={!connected}
          onPress={onPauseToggle}
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
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.xs,
    gap: 2,
    ...shadows.lg,
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
  buttonActive: {
    backgroundColor: colors.surfaceElevated,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonPressed: {
    backgroundColor: colors.surfaceElevated,
    transform: [{ scale: 0.96 }],
  },
  buttonLabel: {
    ...typography.small,
    color: colors.textSecondary,
  },
  buttonLabelActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  buttonLabelDisabled: {
    color: colors.textMuted,
  },
  buttonLabelDanger: {
    color: colors.error,
  },
});
