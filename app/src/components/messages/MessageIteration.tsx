/**
 * Iteration indicator message (centered pill).
 */

import React from 'react';
import { Animated, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { MessageComponentProps } from './types';
import { messageStyles } from './styles';

export function MessageIteration({
  message,
  colors,
  animStyle,
}: MessageComponentProps): React.JSX.Element {
  return (
    <Animated.View
      style={[
        messageStyles.iterationPill,
        { backgroundColor: colors.surfaceElevated },
        animStyle,
      ]}
    >
      <Ionicons name="repeat" size={12} color={colors.textMuted} />
      <Text style={[messageStyles.iterationText, { color: colors.textMuted }]}>
        {message.text}
      </Text>
    </Animated.View>
  );
}
