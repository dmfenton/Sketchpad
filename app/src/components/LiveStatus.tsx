/**
 * LiveStatus - Always-visible display of current agent activity.
 *
 * Shows:
 * - Streaming thoughts as they arrive
 * - Current action: Drawing, Executing, etc.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { AgentMessage, AgentStatus, ToolName } from '@drawing-agent/shared';
import { TOOL_DISPLAY_NAMES } from '@drawing-agent/shared';
import { borderRadius, spacing, typography, useTheme } from '../theme';

// Display pacing for thought chunks (ms)
const CHUNK_DISPLAY_MS = 800;

interface LiveStatusProps {
  /** The live streaming message (or null if not thinking) */
  liveMessage: AgentMessage | null;
  /** Current agent status */
  status: AgentStatus;
  /** Current tool being used (for more specific status) */
  currentTool?: ToolName | null;
}

function getStatusIcon(status: AgentStatus): keyof typeof Ionicons.glyphMap {
  switch (status) {
    case 'thinking':
      return 'bulb-outline';
    case 'drawing':
      return 'brush';
    case 'executing':
      return 'code-working';
    case 'paused':
      return 'pause';
    case 'error':
      return 'alert-circle';
    default:
      return 'ellipse-outline';
  }
}

function getStatusLabel(status: AgentStatus, currentTool?: ToolName | null): string {
  if (status === 'executing' && currentTool) {
    return TOOL_DISPLAY_NAMES[currentTool] ?? 'Running code';
  }

  switch (status) {
    case 'thinking':
      return 'Thinking';
    case 'drawing':
      return 'Drawing';
    case 'executing':
      return 'Running code';
    case 'paused':
      return 'Paused';
    case 'error':
      return 'Error';
    default:
      return '';
  }
}

export function LiveStatus({
  liveMessage,
  status,
  currentTool,
}: LiveStatusProps): React.JSX.Element | null {
  const { colors, shadows } = useTheme();
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Buffer text for smooth display
  const [displayedText, setDisplayedText] = useState(liveMessage?.text ?? '');
  const bufferRef = useRef(liveMessage?.text ?? '');
  const lastUpdateRef = useRef(Date.now());

  // Pulse animation for active states
  useEffect(() => {
    if (status === 'thinking' || status === 'drawing' || status === 'executing') {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.6,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [status, pulseAnim]);

  // Buffer incoming text and release at readable pace
  useEffect(() => {
    if (!liveMessage) {
      setDisplayedText('');
      bufferRef.current = '';
      return;
    }

    bufferRef.current = liveMessage.text;

    if (displayedText.length < bufferRef.current.length) {
      const timeSinceLastUpdate = Date.now() - lastUpdateRef.current;
      const delay = Math.max(0, CHUNK_DISPLAY_MS - timeSinceLastUpdate);

      const timer = setTimeout(() => {
        setDisplayedText(bufferRef.current);
        lastUpdateRef.current = Date.now();
      }, delay);

      return () => clearTimeout(timer);
    }
  }, [liveMessage?.text, displayedText.length]);

  // Don't show anything when idle
  if (status === 'idle' && !liveMessage) {
    return null;
  }

  const statusLabel = getStatusLabel(status, currentTool);
  const statusIcon = getStatusIcon(status);
  const isActive = status === 'thinking' || status === 'drawing' || status === 'executing';
  const isBuffering = liveMessage && displayedText.length < liveMessage.text.length;

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }, shadows.sm]}>
      {/* Status indicator */}
      <View style={styles.statusRow}>
        <Animated.View style={{ opacity: pulseAnim }}>
          <Ionicons
            name={statusIcon}
            size={16}
            color={isActive ? colors.primary : colors.textMuted}
          />
        </Animated.View>
        <Text style={[styles.statusText, { color: isActive ? colors.primary : colors.textMuted }]}>
          {statusLabel}
          {isActive && '...'}
        </Text>
      </View>

      {/* Live thought text */}
      {displayedText.length > 0 && (
        <Text style={[styles.thoughtText, { color: colors.textPrimary }]} numberOfLines={3}>
          {displayedText}
          {isBuffering && <Text style={{ color: colors.textMuted }}> ▍</Text>}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: borderRadius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statusText: {
    ...typography.small,
    fontWeight: '600',
  },
  thoughtText: {
    ...typography.body,
    lineHeight: 22,
  },
});
