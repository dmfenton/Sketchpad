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
  onDrawToggle: () => void;
  onNudge: () => void;
  onClear: () => void;
  onPauseToggle: () => void;
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
  onDrawToggle,
  onNudge,
  onClear,
  onPauseToggle,
}: ActionBarProps): React.JSX.Element {
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
          icon="trash-outline"
          label="Clear"
          variant="danger"
          disabled={!connected}
          onPress={onClear}
        />
        <ActionButton
          icon={paused ? 'play' : 'pause'}
          label={paused ? 'Resume' : 'Pause'}
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
    paddingHorizontal: spacing.lg,
  },
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.sm,
    gap: spacing.xs,
    ...shadows.lg,
  },
  button: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.lg,
    gap: spacing.xs,
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
