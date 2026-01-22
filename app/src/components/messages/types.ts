/**
 * Shared types for message components.
 */

import type { Animated } from 'react-native';
import type { AgentMessage, ToolName } from '@code-monet/shared';
import type { Ionicons } from '@expo/vector-icons';
import type { ColorScheme } from '../../theme';

export interface MessageComponentProps {
  message: AgentMessage;
  colors: ColorScheme;
  animStyle: {
    opacity: Animated.Value;
    transform: { translateY: Animated.Value }[];
  };
}

export interface MessageBubbleProps {
  message: AgentMessage;
  isNew: boolean;
  colors: ColorScheme;
}

// Tool-specific icons
export const TOOL_ICONS: Record<
  ToolName | 'unknown',
  { name: keyof typeof Ionicons.glyphMap; activeIcon?: keyof typeof Ionicons.glyphMap }
> = {
  draw_paths: { name: 'brush', activeIcon: 'brush-outline' },
  generate_svg: { name: 'code-slash', activeIcon: 'code-working' },
  view_canvas: { name: 'eye', activeIcon: 'eye-outline' },
  mark_piece_done: { name: 'checkmark-done', activeIcon: 'checkmark-done-outline' },
  imagine: { name: 'sparkles', activeIcon: 'sparkles-outline' },
  sign_canvas: { name: 'pencil', activeIcon: 'pencil-outline' },
  name_piece: { name: 'text', activeIcon: 'text-outline' },
  unknown: { name: 'help-circle', activeIcon: 'help-circle-outline' },
};
