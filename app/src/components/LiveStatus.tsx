/**
 * LiveStatus - Always-visible display of current agent activity.
 *
 * Shows:
 * - Streaming thoughts as they arrive
 * - Current action: Drawing, Executing, etc.
 */

import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { AgentMessage, AgentStatus, ToolName } from '@code-monet/shared';
import { bionicWord, TOOL_DISPLAY_NAMES, useProgressiveText } from '@code-monet/shared';
import { borderRadius, spacing, typography, useTheme } from '../theme';

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

/** Renders a word with bionic reading formatting (bold first ~40%) */
function BionicWord({ word }: { word: string }): React.JSX.Element {
  const { bold, regular } = bionicWord(word);
  return (
    <Text>
      <Text style={{ fontWeight: '700' }}>{bold}</Text>
      <Text>{regular}</Text>
    </Text>
  );
}

export function LiveStatus({
  liveMessage,
  status,
  currentTool,
}: LiveStatusProps): React.JSX.Element | null {
  const { colors, shadows } = useTheme();
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Progressive text display via shared hook
  const { displayedWords, isBuffering } = useProgressiveText(liveMessage?.text ?? null);

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

  // Don't show anything when idle
  if (status === 'idle' && !liveMessage) {
    return null;
  }

  const statusLabel = getStatusLabel(status, currentTool);
  const statusIcon = getStatusIcon(status);
  const isActive = status === 'thinking' || status === 'drawing' || status === 'executing';

  return (
    <View
      testID="live-status"
      style={[styles.container, { backgroundColor: colors.surface }, shadows.sm]}
    >
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

      {/* Live thought text with bionic formatting */}
      {displayedWords.length > 0 && (
        <Text style={[styles.thoughtText, { color: colors.textPrimary }]} numberOfLines={3}>
          {displayedWords.map((word, i) => (
            <React.Fragment key={`${i}-${word}`}>
              <BionicWord word={word} />
              {i < displayedWords.length - 1 && ' '}
            </React.Fragment>
          ))}
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
