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

import type { AgentMessage, AgentStatus, ToolName } from '@code-monet/shared';
import {
  BIONIC_CHUNK_INTERVAL_MS,
  BIONIC_CHUNK_SIZE,
  TOOL_DISPLAY_NAMES,
} from '@code-monet/shared';
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

export function LiveStatus({
  liveMessage,
  status,
  currentTool,
}: LiveStatusProps): React.JSX.Element | null {
  const { colors, shadows } = useTheme();
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Progressive text display - show a few words at a time at readable pace
  // Tracks word index so we show text progressively, not all at once
  const [displayedWordCount, setDisplayedWordCount] = useState(0);
  const allWordsRef = useRef<string[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Progressive word-by-word display at readable pace
  // When new text arrives, split into words and progressively reveal them
  useEffect(() => {
    // Clear timer on cleanup
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!liveMessage) {
      // Reset when no live message
      allWordsRef.current = [];
      setDisplayedWordCount(0);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    // Split incoming text into words
    const newWords = liveMessage.text.split(/\s+/).filter((w) => w.length > 0);
    allWordsRef.current = newWords;

    // If we have more words than displayed, schedule next chunk
    if (displayedWordCount < newWords.length && !timerRef.current) {
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        // Show next chunk of words
        setDisplayedWordCount((prev) =>
          Math.min(prev + BIONIC_CHUNK_SIZE, allWordsRef.current.length)
        );
      }, BIONIC_CHUNK_INTERVAL_MS);
    }
  }, [liveMessage, displayedWordCount]);

  // Don't show anything when idle
  if (status === 'idle' && !liveMessage) {
    return null;
  }

  const statusLabel = getStatusLabel(status, currentTool);
  const statusIcon = getStatusIcon(status);
  const isActive = status === 'thinking' || status === 'drawing' || status === 'executing';

  // Build displayed text from the words we've revealed so far
  const displayedText = allWordsRef.current.slice(0, displayedWordCount).join(' ');
  const isBuffering = liveMessage && displayedWordCount < allWordsRef.current.length;

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
