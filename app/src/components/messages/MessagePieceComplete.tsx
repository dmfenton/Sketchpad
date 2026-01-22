/**
 * Piece complete message with success styling.
 */

import React from 'react';
import { Animated, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatTime } from '@code-monet/shared';

import type { MessageComponentProps } from './types';
import { messageStyles } from './styles';

export function MessagePieceComplete({
  message,
  colors,
  animStyle,
}: MessageComponentProps): React.JSX.Element {
  return (
    <Animated.View
      style={[
        messageStyles.messageBubble,
        { backgroundColor: colors.surfaceElevated, borderLeftColor: colors.success },
        animStyle,
      ]}
    >
      <View style={messageStyles.messageHeader}>
        <Ionicons name="checkmark-circle" size={16} color={colors.success} />
        <Text style={[messageStyles.messageText, { color: colors.success }]}>
          {message.text}
        </Text>
      </View>
      <Text style={[messageStyles.timestamp, { color: colors.textMuted }]}>
        {formatTime(message.timestamp)}
      </Text>
    </Animated.View>
  );
}
