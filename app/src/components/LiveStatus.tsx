/**
 * LiveStatus - Always-visible display of current agent activity.
 *
 * Shows:
 * - Streaming thoughts as they arrive (from performance.revealedText)
 * - Current action: Drawing, Executing, etc.
 */

import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { AgentStatus, PerformanceState, ToolName } from '@code-monet/shared';
import { TOOL_DISPLAY_NAMES } from '@code-monet/shared';
import { borderRadius, spacing, typography, useTheme } from '../theme';
import { debugRender } from '../utils/debugLog';

interface LiveStatusProps {
  /** Performance state (used for revealedText display) */
  performance: PerformanceState;
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

/** Renders a word (bionic reading disabled - renders as plain text) */
function BionicWord({ word }: { word: string }): React.JSX.Element {
  return <Text>{word}</Text>;
}

export function LiveStatus({
  performance,
  status,
  currentTool,
}: LiveStatusProps): React.JSX.Element | null {
  const { colors, shadows } = useTheme();
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const prevDisplayedCountRef = useRef(0);

  // Get revealed text from performance state
  const revealedText = performance.revealedText;

  // Get event text if an event is currently on stage
  const eventText = useMemo(() => {
    if (performance.onStage?.type === 'event') {
      return performance.onStage.message.text;
    }
    return null;
  }, [performance.onStage]);

  // Split revealed text into words for bionic rendering
  const displayedWords = useMemo(
    () => revealedText.split(/\s+/).filter((w) => w.length > 0),
    [revealedText]
  );

  // Check if there are more words to reveal (buffer has words OR stage has words with more to reveal)
  const isBuffering = useMemo(() => {
    // Check if there are words items in the buffer
    const hasWordsInBuffer = performance.buffer.some((item) => item.type === 'words');
    // Check if current stage item is words and has more words to reveal
    if (performance.onStage?.type === 'words') {
      const totalWords = performance.onStage.text.split(/\s+/).filter((w) => w.length > 0).length;
      if (performance.wordIndex < totalWords) {
        return true;
      }
    }
    return hasWordsInBuffer;
  }, [performance.buffer, performance.onStage, performance.wordIndex]);

  const wordCount = displayedWords.length;

  // Log progressive text state changes
  if (displayedWords.length !== prevDisplayedCountRef.current) {
    debugRender(
      `LiveStatus: displayed=${displayedWords.length}/${wordCount} words, buffering=${isBuffering}`
    );
    prevDisplayedCountRef.current = displayedWords.length;
  }

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

  // Don't show anything when idle and no content
  const hasContent = displayedWords.length > 0 || performance.buffer.length > 0 || !!eventText;
  if (status === 'idle' && !hasContent) {
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

      {/* Event text displaces thinking text while active */}
      {eventText ? (
        <Text style={[styles.eventText, { color: colors.textSecondary }]}>
          {eventText}
        </Text>
      ) : displayedWords.length > 0 ? (
        <Text style={[styles.thoughtText, { color: colors.textPrimary }]} numberOfLines={3}>
          {displayedWords.map((word, i) => (
            <React.Fragment key={`${i}-${word}`}>
              <BionicWord word={word} />
              {i < displayedWords.length - 1 && ' '}
            </React.Fragment>
          ))}
          {isBuffering && <Text style={{ color: colors.textMuted }}> ▍</Text>}
        </Text>
      ) : null}
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
  eventText: {
    ...typography.small,
    fontStyle: 'italic',
  },
});
