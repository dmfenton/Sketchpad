/**
 * Compact floating status indicator showing connection and agent state.
 */

import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import type { AgentStatus } from '../types';
import { colors, spacing, borderRadius, typography, shadows } from '../theme';

interface StatusPillProps {
  pieceCount: number;
  status: AgentStatus;
  connected: boolean;
}

const STATUS_LABELS: Record<AgentStatus, string> = {
  idle: 'Ready',
  thinking: 'Thinking',
  executing: 'Running Code',
  drawing: 'Drawing',
  paused: 'Paused',
  error: 'Error',
};

export function StatusPill({
  pieceCount,
  status,
  connected,
}: StatusPillProps): React.JSX.Element {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Only pulse when actively thinking, executing, or drawing, not when idle or paused
    const isActiveStatus = status === 'thinking' || status === 'executing' || status === 'drawing';
    if (isActiveStatus && connected) {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.4,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
        ])
      );
      animation.start();
      return () => animation.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [status, connected, pulseAnim]);

  const isActive = status === 'thinking' || status === 'executing' || status === 'drawing';

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.dot,
          connected ? styles.dotConnected : styles.dotDisconnected,
          isActive && { opacity: pulseAnim },
        ]}
      />
      <Text style={styles.statusText}>
        {connected ? STATUS_LABELS[status] : 'Disconnected'}
      </Text>
      <View style={styles.divider} />
      <Text style={styles.pieceText}>Piece #{pieceCount}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    gap: spacing.sm,
    ...shadows.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotConnected: {
    backgroundColor: colors.success,
  },
  dotDisconnected: {
    backgroundColor: colors.error,
  },
  statusText: {
    ...typography.small,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  divider: {
    width: 1,
    height: 12,
    backgroundColor: colors.border,
  },
  pieceText: {
    ...typography.small,
    color: colors.textMuted,
  },
});
