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
  drawing: 'Drawing',
  paused: 'Paused',
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

  const isStatus = message.type === 'status';

  if (isStatus) {
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
  const [collapsed, setCollapsed] = useState(false);
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

  const isActive = status === 'thinking' || status === 'drawing';

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
              <Ionicons name="arrow-down" size={16} color={colors.textPrimary} />
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
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
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
    ...typography.caption,
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
    maxHeight: 200,
  },
  scrollContent: {
    padding: spacing.lg,
    gap: spacing.md,
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
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  messageText: {
    ...typography.caption,
    color: colors.textPrimary,
    lineHeight: 20,
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
});
