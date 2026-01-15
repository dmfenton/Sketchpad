/**
 * Compact floating status indicator showing connection and agent state.
 */

import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { PULSE_DURATION_MS, STATUS_LABELS, type AgentStatus } from '@drawing-agent/shared';
import { spacing, borderRadius, typography, useTheme } from '../theme';

interface StatusPillProps {
  pieceCount: number;
  viewingPiece: number | null;
  status: AgentStatus;
  connected: boolean;
  paused: boolean;
}

export function StatusPill({
  pieceCount,
  viewingPiece,
  status,
  connected,
  paused,
}: StatusPillProps): React.JSX.Element {
  const { colors, shadows } = useTheme();
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Effective status - paused overrides other statuses
  const effectiveStatus: AgentStatus = paused ? 'paused' : status;

  useEffect(() => {
    // Only pulse when actively thinking, executing, or drawing
    const isActiveStatus =
      effectiveStatus === 'thinking' ||
      effectiveStatus === 'executing' ||
      effectiveStatus === 'drawing';
    if (isActiveStatus && connected) {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.4,
            duration: PULSE_DURATION_MS,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: PULSE_DURATION_MS,
            useNativeDriver: true,
          }),
        ])
      );
      animation.start();
      return () => animation.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [effectiveStatus, connected, pulseAnim]);

  const isActive =
    effectiveStatus === 'thinking' ||
    effectiveStatus === 'executing' ||
    effectiveStatus === 'drawing';

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }, shadows.sm]} testID="status-pill">
      <Animated.View
        style={[
          styles.dot,
          { backgroundColor: connected ? colors.success : colors.error },
          isActive && { opacity: pulseAnim },
        ]}
      />
      <Text style={[styles.statusText, { color: colors.textSecondary }]}>
        {connected ? STATUS_LABELS[effectiveStatus] : 'Disconnected'}
      </Text>
      <View style={[styles.divider, { backgroundColor: colors.border }]} />
      <Text style={[styles.pieceText, { color: colors.textMuted }]}>
        {viewingPiece !== null ? `Viewing #${viewingPiece}` : `Piece #${pieceCount}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    gap: spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    ...typography.small,
    fontWeight: '500',
  },
  divider: {
    width: 1,
    height: 12,
  },
  pieceText: {
    ...typography.small,
  },
});
