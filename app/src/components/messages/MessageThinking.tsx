/**
 * Default thinking/other message.
 */

import React from 'react';
import { Animated, Text } from 'react-native';
import { formatTime } from '@code-monet/shared';

import type { MessageComponentProps } from './types';
import { messageStyles } from './styles';

export function MessageThinking({
  message,
  colors,
  animStyle,
}: MessageComponentProps): React.JSX.Element {
  return (
    <Animated.View
      style={[
        messageStyles.messageBubble,
        { backgroundColor: colors.surfaceElevated, borderLeftColor: colors.primary },
        animStyle,
      ]}
    >
      <Text style={[messageStyles.messageText, { color: colors.textPrimary }]}>
        {message.text}
      </Text>
      <Text style={[messageStyles.timestamp, { color: colors.textMuted }]}>
        {formatTime(message.timestamp)}
      </Text>
    </Animated.View>
  );
}
