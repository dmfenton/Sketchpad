/**
 * Message stream showing agent thoughts as bubbles.
 */

import React, { useEffect, useRef, useState } from 'react';
import type { AgentMessage } from '@drawing-agent/shared';
import { LIVE_MESSAGE_ID } from '@drawing-agent/shared';

interface MessageStreamProps {
  messages: AgentMessage[];
}

/**
 * Extract code from tool_input metadata for preview
 */
function getCodeFromInput(toolInput: Record<string, unknown> | null | undefined): string | null {
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

function MessageBubble({ message }: MessageBubbleProps): React.ReactElement {
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
      toolName === 'generate_svg' ? getCodeFromInput(message.metadata?.tool_input) : null;
    const hasExpandableContent = hasOutput || codePreview;

    return (
      <div className="message code_execution">
        <div
          className="message-header"
          onClick={() => hasExpandableContent && setExpanded(!expanded)}
          style={{ cursor: hasExpandableContent ? 'pointer' : 'default' }}
        >
          <span className="message-text">{message.text}</span>
          {hasExpandableContent && <span className="expand-icon">{expanded ? '▲' : '▼'}</span>}
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

export function MessageStream({ messages }: MessageStreamProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showRaw, setShowRaw] = useState(false);
  const [collapsed, setCollapsed] = useState(true); // Start collapsed

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages, autoScroll]);

  const handleScroll = (): void => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const isAtBottom = scrollTop >= scrollHeight - clientHeight - 50;
    setAutoScroll(isAtBottom);
  };

  return (
    <div className={`message-stream-container ${collapsed ? 'collapsed' : ''}`}>
      <div className="message-stream-header" onClick={() => setCollapsed(!collapsed)}>
        <div className="header-left">
          <span className="collapse-icon">{collapsed ? '▶' : '▼'}</span>
          <span className="header-title">Thoughts</span>
          <span className="message-count">{messages.length}</span>
        </div>
        {!collapsed && (
          <button
            className={`view-toggle ${showRaw ? 'raw' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              setShowRaw(!showRaw);
            }}
          >
            {showRaw ? 'Styled' : 'Raw'}
          </button>
        )}
      </div>

      {!collapsed && (
        <>
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
        </>
      )}

      <style>{`
        .message-stream-container {
          display: flex;
          flex-direction: column;
          height: 100%;
          position: relative;
          transition: flex 0.2s ease;
        }

        .message-stream-container.collapsed {
          flex: 0 0 auto;
          height: auto;
        }

        .message-stream-header {
          padding: 14px 18px;
          border-bottom: 1px solid var(--border-light);
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: var(--bg-primary);
          cursor: pointer;
          user-select: none;
          transition: background 0.2s ease;
        }

        .message-stream-header:hover {
          background: var(--bg-secondary);
        }

        .header-left {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .collapse-icon {
          font-size: 10px;
          color: var(--text-muted);
          transition: color 0.2s ease;
        }

        .message-count {
          font-size: 11px;
          color: var(--text-muted);
          background: var(--bg-tertiary);
          padding: 2px 8px;
          border-radius: 10px;
        }

        .header-title {
          font-weight: 500;
          font-size: 14px;
          letter-spacing: 0.02em;
        }

        .empty-state {
          text-align: center;
          padding: 48px 24px;
          color: var(--text-muted);
          font-style: italic;
        }

        .message-text {
          line-height: 1.6;
        }

        .message-time {
          font-size: 11px;
          color: var(--text-muted);
          text-align: right;
          margin-top: 8px;
        }

        .message-time.streaming {
          color: var(--accent);
          font-style: italic;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 6px;
        }

        .message-header {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .expand-icon {
          font-size: 10px;
          color: var(--text-muted);
          transition: color 0.2s ease;
        }

        .message-header:hover .expand-icon {
          color: var(--text-secondary);
        }

        .message-details,
        .code-output,
        .code-preview {
          margin-top: 10px;
          padding: 10px 12px;
          background: var(--bg-dark);
          border-radius: 8px;
          font-size: 12px;
          overflow-x: auto;
          max-height: 200px;
          overflow-y: auto;
          white-space: pre-wrap;
          word-break: break-word;
          border: 1px solid var(--border-light);
        }

        .code-output.error {
          background: linear-gradient(135deg, rgba(239, 68, 68, 0.1), rgba(255, 107, 107, 0.05));
          border-color: rgba(239, 68, 68, 0.2);
        }

        .code-preview-section {
          margin-top: 10px;
        }

        .code-preview-header {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          color: var(--text-muted);
          margin-bottom: 6px;
          font-weight: 500;
        }

        .code-icon {
          font-size: 13px;
        }

        .code-preview {
          margin-top: 0;
        }

        .scroll-button {
          position: absolute;
          bottom: 14px;
          right: 14px;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: var(--gradient-primary);
          color: white;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 15px rgba(233, 69, 96, 0.3);
          transition: all 0.3s ease;
        }

        .scroll-button:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(233, 69, 96, 0.4);
        }

        .view-toggle {
          padding: 6px 12px;
          font-size: 11px;
          font-weight: 500;
          background: var(--bg-secondary);
          border: 1px solid var(--border);
          border-radius: 8px;
          color: var(--text-muted);
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .view-toggle:hover {
          background: var(--bg-tertiary);
          color: var(--text-secondary);
        }

        .view-toggle.raw {
          background: var(--gradient-primary);
          border-color: transparent;
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
