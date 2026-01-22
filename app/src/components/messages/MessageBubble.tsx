/**
 * MessageBubble - Dispatcher to appropriate message type component.
 */

import React from 'react';

import type { MessageBubbleProps } from './types';
import { useMessageAnimation } from './useMessageAnimation';
import { MessageIteration } from './MessageIteration';
import { MessageError } from './MessageError';
import { MessagePieceComplete } from './MessagePieceComplete';
import { MessageCodeExecution } from './MessageCodeExecution';
import { MessageThinking } from './MessageThinking';

export const MessageBubble = React.memo(function MessageBubble({
  message,
  isNew,
  colors,
}: MessageBubbleProps): React.JSX.Element {
  const animStyle = useMessageAnimation(isNew);

  switch (message.type) {
    case 'iteration':
      return <MessageIteration message={message} colors={colors} animStyle={animStyle} />;
    case 'error':
      return <MessageError message={message} colors={colors} animStyle={animStyle} />;
    case 'piece_complete':
      return <MessagePieceComplete message={message} colors={colors} animStyle={animStyle} />;
    case 'code_execution':
      return <MessageCodeExecution message={message} colors={colors} animStyle={animStyle} />;
    default:
      return <MessageThinking message={message} colors={colors} animStyle={animStyle} />;
  }
});
