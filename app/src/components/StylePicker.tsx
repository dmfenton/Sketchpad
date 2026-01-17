/**
 * Reusable style picker component for selecting drawing styles.
 * Supports two visual variants: segmented (for StartPanel) and pills (for modals).
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { DrawingStyleType } from '@code-monet/shared';

import { spacing, borderRadius, typography, useTheme } from '../theme';

export type StylePickerVariant = 'segmented' | 'pills';

interface StylePickerProps {
  value: DrawingStyleType;
  onChange: (style: DrawingStyleType) => void;
  /** Visual variant: 'segmented' for StartPanel style, 'pills' for modal style */
  variant?: StylePickerVariant;
  /** Optional label above the picker */
  label?: string;
  /** Test ID prefix for buttons (e.g., 'style' -> 'style-plotter-button') */
  testIDPrefix?: string;
}

export function StylePicker({
  value,
  onChange,
  variant = 'segmented',
  label,
  testIDPrefix = 'style',
}: StylePickerProps): React.JSX.Element {
  const { colors } = useTheme();

  const isSegmented = variant === 'segmented';

  // Different style logic for each variant
  const getOptionStyle = (style: DrawingStyleType) => {
    const isActive = value === style;

    if (isSegmented) {
      // Segmented: active has white background with shadow
      return [
        styles.optionBase,
        styles.optionSegmented,
        isActive && [styles.optionSegmentedActive, { backgroundColor: colors.surface }],
      ];
    } else {
      // Pills: active has primary color background
      return [
        styles.optionBase,
        styles.optionPill,
        { backgroundColor: colors.surfaceElevated },
        isActive && { backgroundColor: colors.primary },
      ];
    }
  };

  const getTextColor = (style: DrawingStyleType) => {
    const isActive = value === style;

    if (isSegmented) {
      return isActive ? colors.primary : colors.textSecondary;
    } else {
      return isActive ? colors.textOnPrimary : colors.textSecondary;
    }
  };

  return (
    <View style={styles.container}>
      {label && <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>}
      <View
        style={[
          styles.picker,
          isSegmented && [styles.pickerSegmented, { backgroundColor: colors.surfaceElevated }],
          !isSegmented && styles.pickerPills,
        ]}
      >
        <Pressable
          testID={`${testIDPrefix}-plotter-button`}
          style={getOptionStyle('plotter')}
          onPress={() => onChange('plotter')}
        >
          <Ionicons name="create-outline" size={18} color={getTextColor('plotter')} />
          <Text style={[styles.optionText, { color: getTextColor('plotter') }]}>Plotter</Text>
        </Pressable>
        <Pressable
          testID={`${testIDPrefix}-paint-button`}
          style={getOptionStyle('paint')}
          onPress={() => onChange('paint')}
        >
          <Ionicons name="color-palette-outline" size={18} color={getTextColor('paint')} />
          <Text style={[styles.optionText, { color: getTextColor('paint') }]}>Paint</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  label: {
    ...typography.small,
    fontWeight: '500',
    paddingLeft: spacing.xs,
  },
  picker: {
    flexDirection: 'row',
  },
  pickerSegmented: {
    borderRadius: borderRadius.lg,
    padding: spacing.xs,
  },
  pickerPills: {
    gap: spacing.sm,
  },
  optionBase: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
  },
  optionSegmented: {
    borderRadius: borderRadius.md,
    gap: spacing.sm,
  },
  optionSegmentedActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  optionPill: {
    borderRadius: borderRadius.md,
    gap: spacing.xs,
  },
  optionText: {
    ...typography.body,
    fontWeight: '500',
  },
});
