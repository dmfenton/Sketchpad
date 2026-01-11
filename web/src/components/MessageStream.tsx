/**
 * Message stream showing agent thoughts as bubbles.
 */

import { useEffect, useRef, useState } from 'react';
import type { AgentMessage, AgentStatus } from '@drawing-agent/shared';
import { STATUS_LABELS, LIVE_MESSAGE_ID } from '@drawing-agent/shared';

interface MessageStreamProps {
  messages: AgentMessage[];
  status: AgentStatus;
}

/**
 * Extract code from tool_input metadata for preview
 */
function getCodeFromInput(
  toolInput: Record<string, unknown> | null | undefined
): string | null {
  if (!toolInput) return null;
  const code = toolInput.code;
  if (typeof code === 'string') {
    return code;
  }
  return null;
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

interface MessageBubbleProps {
  message: AgentMessage;
}

function MessageBubble({ message }: MessageBubbleProps) {
  const [expanded, setExpanded] = useState(false);

  // Iteration indicator
  if (message.type === 'iteration') {
    return <div className="message iteration">{message.text}</div>;
  }

  // Error message
  if (message.type === 'error') {
    return (
      <div className="message error">
        <div className="message-text">{message.text}</div>
        {message.metadata?.stderr && (
          <pre className="message-details">{message.metadata.stderr}</pre>
        )}
        <div className="message-time">{formatTime(message.timestamp)}</div>
      </div>
    );
  }

  // Piece complete
  if (message.type === 'piece_complete') {
    return (
      <div className="message piece_complete">
        <div className="message-text">{message.text}</div>
        <div className="message-time">{formatTime(message.timestamp)}</div>
      </div>
    );
  }

  // Code execution
  if (message.type === 'code_execution') {
    const hasOutput = message.metadata?.stdout || message.metadata?.stderr;
    const toolName = message.metadata?.tool_name;
    const codePreview =
      toolName === 'generate_svg'
        ? getCodeFromInput(message.metadata?.tool_input)
        : null;
    const hasExpandableContent = hasOutput || codePreview;

    return (
      <div className="message code_execution">
        <div
          className="message-header"
          onClick={() => hasExpandableContent && setExpanded(!expanded)}
          style={{ cursor: hasExpandableContent ? 'pointer' : 'default' }}
        >
          <span className="message-text">{message.text}</span>
          {hasExpandableContent && (
            <span className="expand-icon">{expanded ? '▲' : '▼'}</span>
          )}
        </div>
        {expanded && codePreview && (
          <div className="code-preview-section">
            <div className="code-preview-header">
              <span className="code-icon">🐍</span> Python Code
            </div>
            <pre className="code-preview">{codePreview}</pre>
          </div>
        )}
        {expanded && message.metadata?.stdout && (
          <pre className="code-output">{message.metadata.stdout}</pre>
        )}
        {expanded && message.metadata?.stderr && (
          <pre className="code-output error">{message.metadata.stderr}</pre>
        )}
        <div className="message-time">{formatTime(message.timestamp)}</div>
      </div>
    );
  }

  // Default thinking message
  const isLive = message.id === LIVE_MESSAGE_ID;
  return (
    <div className="message thinking">
      <div className="message-text">{message.text}</div>
      {isLive ? (
        <div className="message-time streaming">
          streaming
          <span className="streaming-indicator" />
        </div>
      ) : (
        <div className="message-time">{formatTime(message.timestamp)}</div>
      )}
    </div>
  );
}

export function MessageStream({ messages, status }: MessageStreamProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showRaw, setShowRaw] = useState(false);

  const isActive = status === 'thinking' || status === 'executing' || status === 'drawing';

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages, autoScroll]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const isAtBottom = scrollTop >= scrollHeight - clientHeight - 50;
    setAutoScroll(isAtBottom);
  };

  return (
    <div className="message-stream-container">
      <div className="message-stream-header">
        <div className="header-left">
          <div className={`status-dot ${isActive ? 'active' : ''}`} />
          <span className="header-title">Artist&apos;s Mind</span>
          {isActive && <span className="header-status">{STATUS_LABELS[status]}</span>}
        </div>
        <button
          className={`view-toggle ${showRaw ? 'raw' : ''}`}
          onClick={() => setShowRaw(!showRaw)}
        >
          {showRaw ? 'Styled' : 'Raw'}
        </button>
      </div>

      <div ref={containerRef} className="message-stream" onScroll={handleScroll}>
        {messages.length === 0 ? (
          <div className="empty-state">Awaiting artistic inspiration...</div>
        ) : showRaw ? (
          <pre className="raw-messages">{JSON.stringify(messages, null, 2)}</pre>
        ) : (
          messages.map((message) => <MessageBubble key={message.id} message={message} />)
        )}
      </div>

      {!autoScroll && messages.length > 0 && (
        <button
          className="scroll-button"
          onClick={() => {
            if (containerRef.current) {
              containerRef.current.scrollTop = containerRef.current.scrollHeight;
              setAutoScroll(true);
            }
          }}
        >
          ↓
        </button>
      )}

      <style>{`
        .message-stream-container {
          display: flex;
          flex-direction: column;
          height: 100%;
          position: relative;
        }

        .message-stream-header {
          padding: 12px 16px;
          border-bottom: 1px solid var(--border);
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .header-left {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--text-muted);
        }

        .status-dot.active {
          background: var(--accent);
          animation: pulse 1s infinite;
        }

        .header-title {
          font-weight: 600;
        }

        .header-status {
          color: var(--accent);
          font-size: 12px;
          margin-left: 4px;
        }

        .empty-state {
          text-align: center;
          padding: 40px 20px;
          color: var(--text-muted);
        }

        .message-text {
          line-height: 1.5;
        }

        .message-time {
          font-size: 11px;
          color: var(--text-muted);
          text-align: right;
          margin-top: 6px;
        }

        .message-time.streaming {
          color: var(--accent);
          font-style: italic;
        }

        .message-header {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .expand-icon {
          font-size: 10px;
          color: var(--text-muted);
        }

        .message-details,
        .code-output,
        .code-preview {
          margin-top: 8px;
          padding: 8px;
          background: var(--bg-primary);
          border-radius: 4px;
          font-size: 12px;
          overflow-x: auto;
          max-height: 200px;
          overflow-y: auto;
          white-space: pre-wrap;
          word-break: break-word;
        }

        .code-output.error {
          background: rgba(239, 68, 68, 0.1);
        }

        .code-preview-section {
          margin-top: 8px;
        }

        .code-preview-header {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          color: var(--text-secondary);
          margin-bottom: 4px;
          font-weight: 500;
        }

        .code-icon {
          font-size: 12px;
        }

        .code-preview {
          margin-top: 0;
          border: 1px solid var(--border);
        }

        .scroll-button {
          position: absolute;
          bottom: 12px;
          right: 12px;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: var(--accent);
          color: white;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .view-toggle {
          padding: 4px 10px;
          font-size: 11px;
          background: var(--bg-tertiary);
          border: none;
          border-radius: 4px;
          color: var(--text-secondary);
          cursor: pointer;
        }

        .view-toggle:hover {
          background: var(--bg-primary);
        }

        .view-toggle.raw {
          background: var(--accent);
          color: white;
        }

        .raw-messages {
          font-size: 11px;
          color: var(--text-secondary);
          white-space: pre-wrap;
          word-break: break-all;
        }
      `}</style>
    </div>
  );
}
