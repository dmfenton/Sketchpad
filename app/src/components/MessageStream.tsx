/**
 * MessageStream - Collapsible history of agent messages.
 *
 * Shows past thoughts, tool executions, errors, etc.
 * Live streaming is handled separately by LiveStatus component.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { AgentMessage } from '@code-monet/shared';
import { spacing, borderRadius, typography, useTheme } from '../theme';
import { MessageBubble } from './messages';

interface MessageStreamProps {
  messages: AgentMessage[];
}

export function MessageStream({ messages }: MessageStreamProps): React.JSX.Element {
  const { colors, shadows } = useTheme();
  const [autoScroll, setAutoScroll] = useState(true);
  const [collapsed, setCollapsed] = useState(true);
  const scrollViewRef = useRef<ScrollView>(null);

  const historyMessages = messages;
  const lastMessageCount = useRef(historyMessages.length);

  // Track new messages for animation
  const newMessageIds = useRef(new Set<string>());
  const cleanupTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (historyMessages.length > lastMessageCount.current) {
      const newMessages = historyMessages.slice(lastMessageCount.current);
      newMessages.forEach((m) => newMessageIds.current.add(m.id));
      cleanupTimeoutRef.current = setTimeout(() => {
        newMessages.forEach((m) => newMessageIds.current.delete(m.id));
      }, 500);
    }
    lastMessageCount.current = historyMessages.length;

    return () => {
      if (cleanupTimeoutRef.current) {
        clearTimeout(cleanupTimeoutRef.current);
      }
    };
  }, [historyMessages]);

  useEffect(() => {
    const currentNewMessageIds = newMessageIds.current;
    return () => {
      currentNewMessageIds.clear();
    };
  }, []);

  useEffect(() => {
    if (autoScroll) {
      const timeoutId = setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [historyMessages, autoScroll]);

  const handleScroll = useCallback(
    (event: {
      nativeEvent: {
        contentOffset: { y: number };
        contentSize: { height: number };
        layoutMeasurement: { height: number };
      };
    }) => {
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      const isAtBottom = contentOffset.y >= contentSize.height - layoutMeasurement.height - 50;
      setAutoScroll(isAtBottom);
    },
    []
  );

  const scrollToBottom = useCallback(() => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
    setAutoScroll(true);
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }, shadows.md]}>
      <Pressable
        style={[styles.header, { borderBottomColor: collapsed ? 'transparent' : colors.border }]}
        onPress={() => setCollapsed(!collapsed)}
      >
        <View style={styles.headerLeft}>
          <Ionicons
            name={collapsed ? 'chevron-forward' : 'chevron-down'}
            size={14}
            color={colors.textMuted}
          />
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Thoughts</Text>
          <View style={[styles.messageCount, { backgroundColor: colors.surfaceElevated }]}>
            <Text style={[styles.messageCountText, { color: colors.textMuted }]}>
              {historyMessages.length}
            </Text>
          </View>
        </View>
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
            {historyMessages.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="color-palette-outline" size={32} color={colors.textMuted} />
                <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                  No thoughts yet...
                </Text>
              </View>
            ) : (
              historyMessages.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  isNew={newMessageIds.current.has(message.id)}
                  colors={colors}
                />
              ))
            )}
          </ScrollView>

          {!autoScroll && historyMessages.length > 0 && (
            <Pressable
              style={[styles.scrollButton, { backgroundColor: colors.primary }, shadows.sm]}
              onPress={scrollToBottom}
            >
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
  headerTitle: {
    ...typography.body,
    fontWeight: '600',
  },
  messageCount: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  messageCountText: {
    ...typography.small,
    fontWeight: '500',
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
});
