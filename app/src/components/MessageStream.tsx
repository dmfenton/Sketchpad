/**
 * Chat-like message stream showing agent thoughts as individual bubbles.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { STATUS_LABELS, PULSE_DURATION_MS, type AgentMessage, type AgentStatus, type ToolName } from '../types';
import { spacing, borderRadius, typography, useTheme, type ColorScheme } from '../theme';

interface MessageStreamProps {
  messages: AgentMessage[];
  status: AgentStatus;
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ID for the live streaming message (from useCanvas)
const LIVE_MESSAGE_ID = 'live_thinking';

// Tool-specific icons
const TOOL_ICONS: Record<ToolName | 'unknown', { name: keyof typeof Ionicons.glyphMap; activeIcon?: keyof typeof Ionicons.glyphMap }> = {
  draw_paths: { name: 'brush', activeIcon: 'brush-outline' },
  generate_svg: { name: 'code-slash', activeIcon: 'code-working' },
  view_canvas: { name: 'eye', activeIcon: 'eye-outline' },
  mark_piece_done: { name: 'checkmark-done', activeIcon: 'checkmark-done-outline' },
  unknown: { name: 'help-circle', activeIcon: 'help-circle-outline' },
};

// Get code from tool input for generate_svg
const getCodeFromInput = (toolInput: Record<string, unknown> | null | undefined): string | null => {
  if (!toolInput) return null;
  const code = toolInput.code;
  if (typeof code === 'string') {
    return code;
  }
  return null;
};

interface MessageBubbleProps {
  message: AgentMessage;
  isNew: boolean;
  colors: ColorScheme;
}

function MessageBubble({ message, isNew, colors }: MessageBubbleProps): React.JSX.Element {
  const fadeAnim = useRef(new Animated.Value(isNew ? 0 : 1)).current;
  const slideAnim = useRef(new Animated.Value(isNew ? 20 : 0)).current;
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (isNew) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isNew, fadeAnim, slideAnim]);

  // Iteration indicator (centered, subtle)
  if (message.type === 'iteration') {
    return (
      <Animated.View
        style={[
          styles.iterationPill,
          { backgroundColor: colors.surfaceElevated },
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        <Ionicons name="repeat" size={12} color={colors.textMuted} />
        <Text style={[styles.iterationText, { color: colors.textMuted }]}>{message.text}</Text>
      </Animated.View>
    );
  }

  // Error message (red accent)
  if (message.type === 'error') {
    return (
      <Animated.View
        style={[
          styles.messageBubble,
          { backgroundColor: colors.surfaceElevated, borderLeftColor: colors.error },
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        <View style={styles.messageHeader}>
          <Ionicons name="alert-circle" size={16} color={colors.error} />
          <Text style={[styles.messageText, { color: colors.error }]}>{message.text}</Text>
        </View>
        {message.metadata?.stderr && (
          <Text style={[styles.errorDetails, { color: colors.textMuted }]}>{message.metadata.stderr}</Text>
        )}
        <Text style={[styles.timestamp, { color: colors.textMuted }]}>{formatTime(message.timestamp)}</Text>
      </Animated.View>
    );
  }

  // Piece complete (celebration style)
  if (message.type === 'piece_complete') {
    return (
      <Animated.View
        style={[
          styles.messageBubble,
          { backgroundColor: colors.surfaceElevated, borderLeftColor: colors.success },
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        <View style={styles.messageHeader}>
          <Ionicons name="checkmark-circle" size={16} color={colors.success} />
          <Text style={[styles.messageText, { color: colors.success }]}>{message.text}</Text>
        </View>
        <Text style={[styles.timestamp, { color: colors.textMuted }]}>{formatTime(message.timestamp)}</Text>
      </Animated.View>
    );
  }

  // Code execution (expandable with output and code preview)
  if (message.type === 'code_execution') {
    const hasOutput = message.metadata?.stdout || message.metadata?.stderr;
    const isSuccess = message.metadata?.return_code === 0;
    const toolName = (message.metadata?.tool_name ?? 'unknown') as ToolName | 'unknown';
    const isInProgress = message.text.includes('...') && !message.text.includes('Drew') && !message.text.includes('generated');
    const toolIcon = TOOL_ICONS[toolName] ?? TOOL_ICONS.unknown;
    const iconName = isInProgress ? (toolIcon.activeIcon ?? toolIcon.name) : toolIcon.name;

    // Get code preview for generate_svg
    const codePreview = toolName === 'generate_svg'
      ? getCodeFromInput(message.metadata?.tool_input)
      : null;
    const hasExpandableContent = hasOutput || codePreview;

    // Determine border color based on tool type
    const borderColor = toolName === 'draw_paths' ? colors.primary
      : toolName === 'generate_svg' ? '#8B5CF6' // purple for code
      : toolName === 'view_canvas' ? colors.textMuted
      : toolName === 'mark_piece_done' ? colors.success
      : colors.primary;

    return (
      <Animated.View
        style={[
          styles.messageBubble,
          { backgroundColor: colors.surfaceElevated, borderLeftColor: isSuccess === false ? colors.error : borderColor },
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        <Pressable
          style={styles.messageHeader}
          onPress={() => hasExpandableContent && setExpanded(!expanded)}
        >
          <Ionicons
            name={iconName}
            size={16}
            color={isSuccess === false ? colors.error : borderColor}
          />
          <Text style={[styles.messageText, { color: colors.textPrimary, flex: 1 }]}>{message.text}</Text>
          {hasExpandableContent && (
            <Ionicons
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={14}
              color={colors.textMuted}
            />
          )}
        </Pressable>
        {expanded && codePreview && (
          <View style={[styles.codeOutput, { backgroundColor: colors.background }]}>
            <View style={styles.codePreviewHeader}>
              <Ionicons name="code-slash" size={12} color={colors.textMuted} />
              <Text style={[styles.codePreviewLabel, { color: colors.textMuted }]}>Python Code</Text>
            </View>
            <Text style={[styles.codeOutputText, { color: colors.textSecondary }]}>{codePreview}</Text>
          </View>
        )}
        {expanded && message.metadata?.stdout && (
          <View style={[styles.codeOutput, { backgroundColor: colors.background }]}>
            <View style={styles.codePreviewHeader}>
              <Ionicons name="terminal" size={12} color={colors.textMuted} />
              <Text style={[styles.codePreviewLabel, { color: colors.textMuted }]}>Output</Text>
            </View>
            <Text style={[styles.codeOutputText, { color: colors.textSecondary }]}>{message.metadata.stdout}</Text>
          </View>
        )}
        {expanded && message.metadata?.stderr && (
          <View style={[styles.codeOutput, styles.codeOutputError]}>
            <View style={styles.codePreviewHeader}>
              <Ionicons name="warning" size={12} color={colors.error} />
              <Text style={[styles.codePreviewLabel, { color: colors.error }]}>Error</Text>
            </View>
            <Text style={[styles.codeOutputText, { color: colors.textSecondary }]}>{message.metadata.stderr}</Text>
          </View>
        )}
        <Text style={[styles.timestamp, { color: colors.textMuted }]}>{formatTime(message.timestamp)}</Text>
      </Animated.View>
    );
  }

  // Default thinking/other message
  const isLive = message.id === LIVE_MESSAGE_ID;
  return (
    <Animated.View
      style={[
        styles.messageBubble,
        { backgroundColor: colors.surfaceElevated, borderLeftColor: colors.primary },
        {
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <Text style={[styles.messageText, { color: colors.textPrimary }]}>{message.text}</Text>
      {isLive ? (
        <Text style={[styles.timestamp, { color: colors.primary, fontStyle: 'italic' }]}>streaming...</Text>
      ) : (
        <Text style={[styles.timestamp, { color: colors.textMuted }]}>{formatTime(message.timestamp)}</Text>
      )}
    </Animated.View>
  );
}

export function MessageStream({ messages, status }: MessageStreamProps): React.JSX.Element {
  const { colors, shadows } = useTheme();
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollViewRef = useRef<ScrollView>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const lastMessageCount = useRef(messages.length);

  const isActive = status === 'thinking' || status === 'executing' || status === 'drawing';

  // Track new messages for animation
  const newMessageIds = useRef(new Set<string>());
  useEffect(() => {
    if (messages.length > lastMessageCount.current) {
      const newMessages = messages.slice(lastMessageCount.current);
      newMessages.forEach((m) => newMessageIds.current.add(m.id));
      // Clear after animation
      setTimeout(() => {
        newMessages.forEach((m) => newMessageIds.current.delete(m.id));
      }, 500);
    }
    lastMessageCount.current = messages.length;
  }, [messages]);

  // Pulse animation when active (thinking, executing, drawing)
  useEffect(() => {
    if (isActive) {
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
  }, [isActive, pulseAnim]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages, autoScroll]);

  const handleScroll = useCallback((event: { nativeEvent: { contentOffset: { y: number }; contentSize: { height: number }; layoutMeasurement: { height: number } } }) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const isAtBottom = contentOffset.y >= contentSize.height - layoutMeasurement.height - 50;
    setAutoScroll(isAtBottom);
  }, []);

  const scrollToBottom = useCallback(() => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
    setAutoScroll(true);
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }, shadows.md]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <View style={styles.headerLeft}>
          <Animated.View
            style={[
              styles.statusIndicator,
              { backgroundColor: isActive ? colors.primary : colors.textMuted },
              { opacity: isActive ? pulseAnim : 1 },
            ]}
          />
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Artist&apos;s Mind</Text>
          {isActive && (
            <Text style={[styles.headerStatus, { color: colors.primary }]}>{STATUS_LABELS[status]}</Text>
          )}
        </View>
      </View>

      <View style={styles.content}>
        <ScrollView
          ref={scrollViewRef}
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
        >
          {messages.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="color-palette-outline" size={32} color={colors.textMuted} />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>Awaiting artistic inspiration...</Text>
            </View>
          ) : (
            messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                isNew={newMessageIds.current.has(message.id) || message.id === LIVE_MESSAGE_ID}
                colors={colors}
              />
            ))
          )}
        </ScrollView>

        {!autoScroll && messages.length > 0 && (
          <Pressable style={[styles.scrollButton, { backgroundColor: colors.primary }, shadows.sm]} onPress={scrollToBottom}>
            <Ionicons name="arrow-down" size={16} color={colors.textOnPrimary} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statusIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  headerTitle: {
    ...typography.body,
    fontWeight: '600',
  },
  headerStatus: {
    ...typography.small,
    marginLeft: spacing.xs,
  },
  content: {
    position: 'relative',
  },
  scrollView: {
    maxHeight: 280,
  },
  scrollContent: {
    padding: spacing.sm,
    gap: spacing.xs,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing['2xl'],
    gap: spacing.md,
  },
  emptyText: {
    ...typography.caption,
  },
  messageBubble: {
    borderRadius: borderRadius.md,
    padding: spacing.md,
    paddingVertical: spacing.lg,
    borderLeftWidth: 3,
  },
  messageText: {
    ...typography.body,
    lineHeight: 24,
  },
  timestamp: {
    ...typography.small,
    marginTop: spacing.sm,
    textAlign: 'right',
  },
  scrollButton: {
    position: 'absolute',
    bottom: spacing.md,
    right: spacing.md,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iterationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    gap: spacing.xs,
    opacity: 0.7,
  },
  iterationText: {
    ...typography.small,
  },
  messageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  errorDetails: {
    ...typography.small,
    marginTop: spacing.sm,
    fontFamily: 'monospace',
  },
  codeOutput: {
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderRadius: borderRadius.sm,
    maxHeight: 150,
    overflow: 'hidden',
  },
  codeOutputError: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  codeOutputText: {
    ...typography.small,
    fontFamily: 'monospace',
  },
  codePreviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  codePreviewLabel: {
    ...typography.small,
    fontWeight: '500',
  },
});
