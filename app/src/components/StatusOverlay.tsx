/**
 * StatusOverlay - Shows agent status in a fixed position above the canvas.
 *
 * Modes:
 * - Thinking: Bionic reading display, 2-3 words at a time with fade animation
 * - Executing: "Running [tool_name]..." with spinner
 * - Drawing: "Drawing..." with animated indicator
 * - Idle/Paused: Subtle indicator
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, StyleSheet, Text, View } from 'react-native';

import type { AgentMessage, AgentStatus, ToolName } from '@drawing-agent/shared';
import { bionicWord, chunkWords } from '@drawing-agent/shared';

import { borderRadius, spacing, typography, useTheme } from '../theme';

// Time between word chunks in ms
const CHUNK_INTERVAL_MS = 150;
// Words per chunk
const CHUNK_SIZE = 3;

interface StatusOverlayProps {
  status: AgentStatus;
  thinking: string;
  messages: AgentMessage[];
}

/**
 * Get the most recent code_execution message to show tool name.
 */
function getLastToolCall(messages: AgentMessage[]): ToolName | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg?.type === 'code_execution' && msg.metadata?.tool_name) {
      return msg.metadata.tool_name;
    }
  }
  return null;
}

/**
 * Human-readable tool labels.
 */
const TOOL_DISPLAY_NAMES: Record<ToolName, string> = {
  draw_paths: 'drawing paths',
  generate_svg: 'generating SVG',
  view_canvas: 'viewing canvas',
  mark_piece_done: 'marking done',
};

/**
 * Render a word with bionic formatting (bold first part).
 */
function BionicWord({ word, color }: { word: string; color: string }): React.JSX.Element {
  const { bold, regular } = bionicWord(word);
  return (
    <Text style={styles.bionicWord}>
      <Text style={[styles.bionicBold, { color }]}>{bold}</Text>
      <Text style={{ color }}>{regular}</Text>
    </Text>
  );
}

/**
 * Thinking display with bionic reading animation.
 */
function ThinkingDisplay({ text, color }: { text: string; color: string }): React.JSX.Element {
  const [chunkIndex, setChunkIndex] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const prevTextRef = useRef(text);

  // Split text into chunks
  const chunks = useMemo(() => chunkWords(text, CHUNK_SIZE), [text]);

  // Reset when text changes significantly (new turn)
  useEffect(() => {
    // If text was cleared or completely replaced, reset
    if (text.length < prevTextRef.current.length / 2) {
      setChunkIndex(0);
    }
    prevTextRef.current = text;
  }, [text]);

  // Cycle through chunks with fade animation
  useEffect(() => {
    if (chunks.length === 0) return;

    const interval = setInterval(() => {
      // Fade out
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 50,
        useNativeDriver: true,
      }).start(() => {
        // Update chunk
        setChunkIndex((prev) => {
          const next = prev + 1;
          return next >= chunks.length ? Math.max(0, chunks.length - 1) : next;
        });

        // Fade in
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 50,
          useNativeDriver: true,
        }).start();
      });
    }, CHUNK_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [chunks.length, fadeAnim]);

  // Clamp index if chunks changed
  const safeIndex = Math.min(chunkIndex, Math.max(0, chunks.length - 1));
  const currentChunk = chunks[safeIndex] ?? [];

  if (chunks.length === 0) {
    return <Text style={[styles.statusText, { color }]}>Thinking...</Text>;
  }

  return (
    <Animated.View style={[styles.thinkingContainer, { opacity: fadeAnim }]}>
      {currentChunk.map((word, i) => (
        <React.Fragment key={`${safeIndex}-${i}`}>
          <BionicWord word={word} color={color} />
          {i < currentChunk.length - 1 && <Text style={{ color }}> </Text>}
        </React.Fragment>
      ))}
    </Animated.View>
  );
}

export function StatusOverlay({
  status,
  thinking,
  messages,
}: StatusOverlayProps): React.JSX.Element | null {
  const { colors, shadows } = useTheme();
  const lastTool = getLastToolCall(messages);
  const bounceAnim = useRef(new Animated.Value(0)).current;

  // Bounce animation for drawing icon
  useEffect(() => {
    if (status === 'drawing') {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(bounceAnim, {
            toValue: -3,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(bounceAnim, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
        ])
      );
      animation.start();
      return () => animation.stop();
    }
  }, [status, bounceAnim]);

  // Render content based on status
  const renderContent = (): React.JSX.Element | null => {
    switch (status) {
      case 'thinking':
        return <ThinkingDisplay text={thinking} color={colors.textPrimary} />;

      case 'executing': {
        const toolLabel = lastTool ? TOOL_DISPLAY_NAMES[lastTool] : 'executing';
        return (
          <View style={styles.row}>
            <ActivityIndicator size="small" color={colors.warning} />
            <Text style={[styles.statusText, { color: colors.textPrimary }]}>
              Running {toolLabel}...
            </Text>
          </View>
        );
      }

      case 'drawing':
        return (
          <View style={styles.row}>
            <Animated.Text
              style={[
                styles.drawingIcon,
                { color: colors.success, transform: [{ translateY: bounceAnim }] },
              ]}
            >
              ✏
            </Animated.Text>
            <Text style={[styles.statusText, { color: colors.success }]}>Drawing...</Text>
          </View>
        );

      case 'paused':
        return (
          <Text style={[styles.statusText, styles.muted, { color: colors.textMuted }]}>Paused</Text>
        );

      case 'idle':
        return null;

      case 'error':
        return <Text style={[styles.statusText, { color: colors.error }]}>Error</Text>;

      default:
        return null;
    }
  };

  const content = renderContent();
  if (!content) return null;

  return (
    <View style={styles.wrapper}>
      <View style={[styles.container, { backgroundColor: colors.surface }, shadows.md]}>
        {content}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    top: spacing.sm,
    left: 0,
    right: 0,
    zIndex: 100,
    alignItems: 'center',
  },
  container: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    minWidth: 150,
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statusText: {
    ...typography.caption,
  },
  muted: {
    fontStyle: 'italic',
  },
  thinkingContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  bionicWord: {
    ...typography.caption,
  },
  bionicBold: {
    fontWeight: '700',
  },
  drawingIcon: {
    fontSize: 18,
  },
});
