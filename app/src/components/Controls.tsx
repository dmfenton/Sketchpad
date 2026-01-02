/**
 * Control buttons for the drawing agent.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORS } from '../types';

interface ControlsProps {
  drawingEnabled: boolean;
  paused: boolean;
  onDrawToggle: () => void;
  onNudge: () => void;
  onClear: () => void;
  onPauseToggle: () => void;
}

interface ButtonProps {
  label: string;
  active?: boolean;
  onPress: () => void;
}

function Button({ label, active = false, onPress }: ButtonProps): React.JSX.Element {
  return (
    <Pressable
      style={[styles.button, active && styles.buttonActive]}
      onPress={onPress}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

export function Controls({
  drawingEnabled,
  paused,
  onDrawToggle,
  onNudge,
  onClear,
  onPauseToggle,
}: ControlsProps): React.JSX.Element {
  return (
    <View style={styles.container}>
      <Button label="Draw" active={drawingEnabled} onPress={onDrawToggle} />
      <Button label="Nudge" onPress={onNudge} />
      <Button label="Clear" onPress={onClear} />
      <Button label={paused ? '▶' : '⏸'} active={paused} onPress={onPauseToggle} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    gap: 8,
    paddingVertical: 8,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: COLORS.buttonBackground,
    borderWidth: 1,
    borderColor: COLORS.buttonBorder,
    borderRadius: 4,
    alignItems: 'center',
  },
  buttonActive: {
    backgroundColor: COLORS.buttonActive,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333333',
  },
});
