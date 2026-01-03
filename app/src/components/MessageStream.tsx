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

import type { AgentMessage, AgentStatus } from '../types';
import { colors, spacing, borderRadius, typography, shadows } from '../theme';

interface MessageStreamProps {
  messages: AgentMessage[];
  status: AgentStatus;
}

const STATUS_LABELS: Record<AgentStatus, string> = {
  idle: 'Idle',
  thinking: 'Thinking',
  executing: 'Running Code',
  drawing: 'Drawing',
  paused: 'Paused',
  error: 'Error',
};

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

interface MessageBubbleProps {
  message: AgentMessage;
  isNew: boolean;
}

function MessageBubble({ message, isNew }: MessageBubbleProps): React.JSX.Element {
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

  // Status pill (centered, minimal)
  if (message.type === 'status') {
    return (
      <Animated.View
        style={[
          styles.statusPill,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        <View style={styles.statusDot} />
        <Text style={styles.statusText}>{message.text}</Text>
      </Animated.View>
    );
  }

  // Iteration indicator (centered, subtle)
  if (message.type === 'iteration') {
    return (
      <Animated.View
        style={[
          styles.iterationPill,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        <Ionicons name="repeat" size={12} color={colors.textMuted} />
        <Text style={styles.iterationText}>{message.text}</Text>
      </Animated.View>
    );
  }

  // Error message (red accent)
  if (message.type === 'error') {
    return (
      <Animated.View
        style={[
          styles.messageBubble,
          styles.errorBubble,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        <View style={styles.messageHeader}>
          <Ionicons name="alert-circle" size={16} color={colors.error} />
          <Text style={[styles.messageText, styles.errorText]}>{message.text}</Text>
        </View>
        {message.metadata?.stderr && (
          <Text style={styles.errorDetails}>{message.metadata.stderr}</Text>
        )}
        <Text style={styles.timestamp}>{formatTime(message.timestamp)}</Text>
      </Animated.View>
    );
  }

  // Piece complete (celebration style)
  if (message.type === 'piece_complete') {
    return (
      <Animated.View
        style={[
          styles.messageBubble,
          styles.successBubble,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        <View style={styles.messageHeader}>
          <Ionicons name="checkmark-circle" size={16} color={colors.success} />
          <Text style={[styles.messageText, styles.successText]}>{message.text}</Text>
        </View>
        <Text style={styles.timestamp}>{formatTime(message.timestamp)}</Text>
      </Animated.View>
    );
  }

  // Code execution (expandable with output)
  if (message.type === 'code_execution') {
    const hasOutput = message.metadata?.stdout || message.metadata?.stderr;
    const isSuccess = message.metadata?.return_code === 0;

    return (
      <Animated.View
        style={[
          styles.messageBubble,
          styles.codeBubble,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        <Pressable
          style={styles.messageHeader}
          onPress={() => hasOutput && setExpanded(!expanded)}
        >
          <Ionicons
            name={message.text.includes('Executing') ? 'code-working' : (isSuccess ? 'code' : 'code-slash')}
            size={16}
            color={isSuccess !== false ? colors.primary : colors.error}
          />
          <Text style={styles.messageText}>{message.text}</Text>
          {hasOutput && (
            <Ionicons
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={14}
              color={colors.textMuted}
            />
          )}
        </Pressable>
        {expanded && message.metadata?.stdout && (
          <View style={styles.codeOutput}>
            <Text style={styles.codeOutputText}>{message.metadata.stdout}</Text>
          </View>
        )}
        {expanded && message.metadata?.stderr && (
          <View style={[styles.codeOutput, styles.codeOutputError]}>
            <Text style={styles.codeOutputText}>{message.metadata.stderr}</Text>
          </View>
        )}
        <Text style={styles.timestamp}>{formatTime(message.timestamp)}</Text>
      </Animated.View>
    );
  }

  // Default thinking/other message
  return (
    <Animated.View
      style={[
        styles.messageBubble,
        {
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <Text style={styles.messageText}>{message.text}</Text>
      <Text style={styles.timestamp}>{formatTime(message.timestamp)}</Text>
    </Animated.View>
  );
}

export function MessageStream({ messages, status }: MessageStreamProps): React.JSX.Element {
  const [collapsed, setCollapsed] = useState(false);  // Start expanded
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollViewRef = useRef<ScrollView>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const lastMessageCount = useRef(messages.length);

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

  // Pulse animation when thinking
  useEffect(() => {
    if (status === 'thinking') {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.6,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      );
      animation.start();
      return () => animation.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [status, pulseAnim]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (!collapsed && autoScroll) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages, collapsed, autoScroll]);

  const handleScroll = useCallback((event: { nativeEvent: { contentOffset: { y: number }; contentSize: { height: number }; layoutMeasurement: { height: number } } }) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const isAtBottom = contentOffset.y >= contentSize.height - layoutMeasurement.height - 50;
    setAutoScroll(isAtBottom);
  }, []);

  const scrollToBottom = useCallback(() => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
    setAutoScroll(true);
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => !prev);
  }, []);

  const isActive = status === 'thinking' || status === 'executing' || status === 'drawing';

  return (
    <View style={styles.container}>
      <Pressable style={styles.header} onPress={toggleCollapsed}>
        <View style={styles.headerLeft}>
          <Animated.View
            style={[
              styles.statusIndicator,
              isActive && styles.statusIndicatorActive,
              { opacity: isActive ? pulseAnim : 1 },
            ]}
          />
          <Text style={styles.headerTitle}>Agent Thoughts</Text>
          {isActive && (
            <Text style={styles.headerStatus}>{STATUS_LABELS[status]}</Text>
          )}
        </View>
        <Ionicons
          name={collapsed ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={colors.textMuted}
        />
      </Pressable>

      {!collapsed && (
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
                <Ionicons name="chatbubble-ellipses-outline" size={32} color={colors.textMuted} />
                <Text style={styles.emptyText}>Waiting for agent thoughts...</Text>
              </View>
            ) : (
              messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  isNew={newMessageIds.current.has(message.id)}
                />
              ))
            )}
          </ScrollView>

          {!autoScroll && messages.length > 0 && (
            <Pressable style={styles.scrollButton} onPress={scrollToBottom}>
              <Ionicons name="arrow-down" size={16} color={colors.textOnPrimary} />
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    ...shadows.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
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
    backgroundColor: colors.textMuted,
  },
  statusIndicatorActive: {
    backgroundColor: colors.primary,
  },
  headerTitle: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  headerStatus: {
    ...typography.small,
    color: colors.primary,
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
    color: colors.textMuted,
  },
  messageBubble: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    paddingVertical: spacing.lg,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  messageText: {
    ...typography.body,
    color: colors.textPrimary,
    lineHeight: 24,
  },
  timestamp: {
    ...typography.small,
    color: colors.textMuted,
    marginTop: spacing.sm,
    textAlign: 'right',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: colors.surfaceElevated,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    gap: spacing.xs,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  statusText: {
    ...typography.small,
    color: colors.textSecondary,
  },
  scrollButton: {
    position: 'absolute',
    bottom: spacing.md,
    right: spacing.md,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
  // Iteration pill style
  iterationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: colors.surfaceElevated,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    gap: spacing.xs,
    opacity: 0.7,
  },
  iterationText: {
    ...typography.small,
    color: colors.textMuted,
  },
  // Message header with icon
  messageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  // Error styles
  errorBubble: {
    borderLeftColor: colors.error,
  },
  errorText: {
    color: colors.error,
  },
  errorDetails: {
    ...typography.small,
    color: colors.textMuted,
    marginTop: spacing.sm,
    fontFamily: 'monospace',
  },
  // Success styles
  successBubble: {
    borderLeftColor: colors.success,
  },
  successText: {
    color: colors.success,
  },
  // Code execution styles
  codeBubble: {
    borderLeftColor: colors.primary,
  },
  codeOutput: {
    marginTop: spacing.sm,
    padding: spacing.sm,
    backgroundColor: colors.background,
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
    color: colors.textSecondary,
  },
});
