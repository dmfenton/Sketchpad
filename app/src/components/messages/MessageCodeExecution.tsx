/**
 * Code execution message with expandable output.
 */

import React, { useState } from 'react';
import { Animated, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatTime, getCodeFromInput } from '@code-monet/shared';

import type { MessageComponentProps } from './types';
import { TOOL_ICONS, getToolBorderColor } from './types';
import { messageStyles } from './styles';

export function MessageCodeExecution({
  message,
  colors,
  animStyle,
}: MessageComponentProps): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);

  const hasOutput = message.metadata?.stdout || message.metadata?.stderr;
  const isSuccess = message.metadata?.return_code === 0;
  const toolName = message.metadata?.tool_name ?? 'unknown';
  const isInProgress =
    message.text.includes('...') &&
    !message.text.includes('Drew') &&
    !message.text.includes('generated');
  const toolIcon = TOOL_ICONS[toolName] ?? TOOL_ICONS.unknown;
  const iconName = isInProgress ? (toolIcon.activeIcon ?? toolIcon.name) : toolIcon.name;

  // Get code preview for generate_svg
  const codePreview =
    toolName === 'generate_svg' ? getCodeFromInput(message.metadata?.tool_input) : null;
  const hasExpandableContent = hasOutput || codePreview;

  // Get border color based on tool type
  const borderColor = getToolBorderColor(toolName, colors);

  return (
    <Animated.View
      style={[
        messageStyles.messageBubble,
        {
          backgroundColor: colors.surfaceElevated,
          borderLeftColor: isSuccess === false ? colors.error : borderColor,
        },
        animStyle,
      ]}
    >
      <Pressable
        style={messageStyles.messageHeader}
        onPress={() => hasExpandableContent && setExpanded(!expanded)}
      >
        <Ionicons
          name={iconName}
          size={16}
          color={isSuccess === false ? colors.error : borderColor}
        />
        <Text style={[messageStyles.messageText, { color: colors.textPrimary, flex: 1 }]}>
          {message.text}
        </Text>
        {hasExpandableContent && (
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={colors.textMuted}
          />
        )}
      </Pressable>

      {expanded && codePreview && (
        <View style={[messageStyles.codeOutput, { backgroundColor: colors.background }]}>
          <View style={messageStyles.codePreviewHeader}>
            <Ionicons name="code-slash" size={12} color={colors.textMuted} />
            <Text style={[messageStyles.codePreviewLabel, { color: colors.textMuted }]}>
              Python Code
            </Text>
          </View>
          <ScrollView style={messageStyles.codeScrollView} nestedScrollEnabled>
            <Text style={[messageStyles.codeOutputText, { color: colors.textSecondary }]}>
              {codePreview}
            </Text>
          </ScrollView>
        </View>
      )}

      {expanded && message.metadata?.stdout && (
        <View style={[messageStyles.codeOutput, { backgroundColor: colors.background }]}>
          <View style={messageStyles.codePreviewHeader}>
            <Ionicons name="terminal" size={12} color={colors.textMuted} />
            <Text style={[messageStyles.codePreviewLabel, { color: colors.textMuted }]}>
              Output
            </Text>
          </View>
          <ScrollView style={messageStyles.codeScrollView} nestedScrollEnabled>
            <Text style={[messageStyles.codeOutputText, { color: colors.textSecondary }]}>
              {message.metadata.stdout}
            </Text>
          </ScrollView>
        </View>
      )}

      {expanded && message.metadata?.stderr && (
        <View style={[messageStyles.codeOutput, messageStyles.codeOutputError]}>
          <View style={messageStyles.codePreviewHeader}>
            <Ionicons name="warning" size={12} color={colors.error} />
            <Text style={[messageStyles.codePreviewLabel, { color: colors.error }]}>Error</Text>
          </View>
          <ScrollView style={messageStyles.codeScrollView} nestedScrollEnabled>
            <Text style={[messageStyles.codeOutputText, { color: colors.textSecondary }]}>
              {message.metadata.stderr}
            </Text>
          </ScrollView>
        </View>
      )}

      <Text style={[messageStyles.timestamp, { color: colors.textMuted }]}>
        {formatTime(message.timestamp)}
      </Text>
    </Animated.View>
  );
}
