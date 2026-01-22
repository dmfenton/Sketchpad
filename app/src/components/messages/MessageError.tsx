/**
 * Error message with red accent.
 */

import React from 'react';
import { Animated, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatTime } from '@code-monet/shared';

import type { MessageComponentProps } from './types';
import { messageStyles } from './styles';

export function MessageError({
  message,
  colors,
  animStyle,
}: MessageComponentProps): React.JSX.Element {
  return (
    <Animated.View
      style={[
        messageStyles.messageBubble,
        { backgroundColor: colors.surfaceElevated, borderLeftColor: colors.error },
        animStyle,
      ]}
    >
      <View style={messageStyles.messageHeader}>
        <Ionicons name="alert-circle" size={16} color={colors.error} />
        <Text style={[messageStyles.messageText, { color: colors.error }]}>
          {message.text}
        </Text>
      </View>
      {message.metadata?.stderr && (
        <Text style={[messageStyles.errorDetails, { color: colors.textMuted }]}>
          {message.metadata.stderr}
        </Text>
      )}
      <Text style={[messageStyles.timestamp, { color: colors.textMuted }]}>
        {formatTime(message.timestamp)}
      </Text>
    </Animated.View>
  );
}
