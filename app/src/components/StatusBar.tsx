/**
 * Status bar showing piece number, agent status, and connection indicator.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { AgentStatus } from '../types';

interface StatusBarProps {
  pieceCount: number;
  status: AgentStatus;
  connected: boolean;
}

const STATUS_LABELS: Record<AgentStatus, string> = {
  idle: 'Idle',
  thinking: 'Thinking',
  drawing: 'Drawing',
};

export function StatusBar({ pieceCount, status, connected }: StatusBarProps): React.JSX.Element {
  const statusLabel = STATUS_LABELS[status];

  return (
    <View style={styles.container}>
      <Text style={styles.text}>
        Piece #{pieceCount} · {statusLabel}
      </Text>
      <View style={[styles.indicator, connected ? styles.connected : styles.disconnected]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 8,
  },
  text: {
    fontSize: 12,
    color: '#666666',
  },
  indicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  connected: {
    backgroundColor: '#22C55E',
  },
  disconnected: {
    backgroundColor: '#EF4444',
  },
});
