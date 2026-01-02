/**
 * Collapsible panel showing agent's internal monologue.
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

import type { AgentStatus } from '../types';
import { COLORS } from '../types';

interface ThinkingPanelProps {
  status: AgentStatus;
  thinking: string;
}

const STATUS_LABELS: Record<AgentStatus, string> = {
  idle: 'Idle',
  thinking: 'Thinking...',
  drawing: 'Drawing...',
};

export function ThinkingPanel({ status, thinking }: ThinkingPanelProps): React.JSX.Element {
  const [collapsed, setCollapsed] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Pulse animation when thinking
  useEffect(() => {
    if (status === 'thinking') {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.5,
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
      animation.start();
      return () => animation.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [status, pulseAnim]);

  // Auto-scroll to bottom when new text arrives
  useEffect(() => {
    if (!collapsed) {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }
  }, [thinking, collapsed]);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => !prev);
  }, []);

  const statusLabel = STATUS_LABELS[status];
  const isIdle = status === 'idle';

  // Get last line for collapsed preview
  const lastLine = thinking.split('\n').filter(Boolean).pop() || '';
  const previewText = lastLine.length > 50 ? `${lastLine.slice(0, 50)}...` : lastLine;

  return (
    <View style={styles.container}>
      <Pressable style={styles.header} onPress={toggleCollapsed}>
        <Animated.Text
          style={[
            styles.statusText,
            isIdle && styles.statusTextIdle,
            status === 'thinking' && { opacity: pulseAnim },
          ]}
        >
          {statusLabel}
        </Animated.Text>
        <Text style={styles.collapseButton}>{collapsed ? '▲' : '▼'}</Text>
      </Pressable>

      {collapsed ? (
        <View style={styles.previewContainer}>
          <Text style={styles.previewText} numberOfLines={1}>
            {previewText}
          </Text>
        </View>
      ) : (
        <ScrollView
          ref={scrollViewRef}
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
        >
          <Text style={styles.thinkingText}>{thinking || 'No thoughts yet...'}</Text>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.thinkingPanelBackground,
    borderRadius: 4,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.thinkingText,
  },
  statusTextIdle: {
    color: '#999999',
  },
  collapseButton: {
    fontSize: 12,
    color: '#666666',
  },
  previewContainer: {
    padding: 12,
  },
  previewText: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: '#666666',
  },
  content: {
    maxHeight: 150,
  },
  contentContainer: {
    padding: 12,
  },
  thinkingText: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: COLORS.thinkingText,
    lineHeight: 18,
  },
});
