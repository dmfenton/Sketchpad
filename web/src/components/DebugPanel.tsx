/**
 * Debug panel with tabs for agent state, filesystem, and message log.
 */

import React, { useState } from 'react';
import type { ServerMessage } from '@drawing-agent/shared';

interface DebugPanelProps {
  agent: {
    notes: string;
    monologue: string;
    status: string;
    piece_count: number;
    paused: boolean;
  } | null;
  files: Array<{ name: string; path: string; size: number; modified: string }>;
  messageLog: Array<{ timestamp: number; message: ServerMessage }>;
  onRefresh: () => void;
  onClearLog: () => void;
}

type TabId = 'agent' | 'files' | 'messages';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
  } as Intl.DateTimeFormatOptions);
}

export function DebugPanel({ agent, files, messageLog, onRefresh, onClearLog }: DebugPanelProps): React.ReactElement {
  const [activeTab, setActiveTab] = useState<TabId>('agent');

  return (
    <div className="debug-panel">
      <div className="debug-tabs">
        <button
          className={`debug-tab ${activeTab === 'agent' ? 'active' : ''}`}
          onClick={() => setActiveTab('agent')}
        >
          Agent
        </button>
        <button
          className={`debug-tab ${activeTab === 'files' ? 'active' : ''}`}
          onClick={() => setActiveTab('files')}
        >
          Files
        </button>
        <button
          className={`debug-tab ${activeTab === 'messages' ? 'active' : ''}`}
          onClick={() => setActiveTab('messages')}
        >
          Messages ({messageLog.length})
        </button>
        <button className="debug-tab refresh" onClick={onRefresh} style={{ marginLeft: 'auto' }}>
          ↻
        </button>
      </div>

      <div className="debug-content">
        {activeTab === 'agent' && (
          <div className="agent-info">
            {agent ? (
              <>
                <div className="debug-row">
                  <span className="label">Status:</span>
                  <span className={`value status-${agent.status}`}>{agent.status}</span>
                  {agent.paused && <span className="badge">PAUSED</span>}
                </div>
                <div className="debug-row">
                  <span className="label">Piece Count:</span>
                  <span className="value">{agent.piece_count}</span>
                </div>
                <div className="debug-section">
                  <span className="label">Notes:</span>
                  <pre className="value notes">{agent.notes || '(empty)'}</pre>
                </div>
                <div className="debug-section">
                  <span className="label">Monologue:</span>
                  <pre className="value monologue">
                    {agent.monologue?.slice(0, 500) || '(empty)'}
                    {agent.monologue?.length > 500 && '...'}
                  </pre>
                </div>
              </>
            ) : (
              <div className="loading">Loading agent info...</div>
            )}
          </div>
        )}

        {activeTab === 'files' && (
          <div className="files-list">
            {files.length === 0 ? (
              <div className="empty">No workspace files</div>
            ) : (
              files.map((file) => (
                <div key={file.path} className="file-row">
                  <span className="file-name">{file.name}</span>
                  <span className="file-size">{formatBytes(file.size)}</span>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'messages' && (
          <div className="message-log">
            <div className="log-header">
              <span>WebSocket Message Log</span>
              <button onClick={onClearLog}>Clear</button>
            </div>
            <div className="log-entries">
              {messageLog.length === 0 ? (
                <div className="empty">No messages yet</div>
              ) : (
                messageLog.map((entry, i) => (
                  <div key={i} className="log-entry">
                    <span className="log-time">{formatTime(entry.timestamp)}</span>
                    <span className={`log-type type-${entry.message.type}`}>
                      {entry.message.type}
                    </span>
                    <pre className="log-data">
                      {JSON.stringify(entry.message, null, 2).slice(0, 200)}
                    </pre>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      <style>{`
        .debug-row {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 4px 0;
        }

        .debug-section {
          margin-top: 12px;
        }

        .debug-section .label {
          display: block;
          margin-bottom: 4px;
        }

        .label {
          color: var(--text-muted);
          min-width: 100px;
        }

        .value {
          color: var(--text-primary);
        }

        .value.notes,
        .value.monologue {
          background: var(--bg-secondary);
          padding: 8px;
          border-radius: 4px;
          max-height: 100px;
          overflow-y: auto;
          white-space: pre-wrap;
          word-break: break-word;
          font-size: 11px;
        }

        .badge {
          padding: 2px 6px;
          background: var(--warning);
          color: #000;
          border-radius: 4px;
          font-size: 10px;
          font-weight: bold;
        }

        .status-idle { color: var(--text-muted); }
        .status-thinking { color: var(--accent); }
        .status-executing { color: var(--warning); }
        .status-drawing { color: var(--success); }
        .status-paused { color: var(--text-secondary); }
        .status-error { color: var(--error); }

        .files-list {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .file-row {
          display: flex;
          justify-content: space-between;
          padding: 4px 8px;
          background: var(--bg-secondary);
          border-radius: 4px;
        }

        .file-name {
          color: var(--text-primary);
        }

        .file-size {
          color: var(--text-muted);
          font-size: 11px;
        }

        .message-log {
          display: flex;
          flex-direction: column;
          height: 100%;
        }

        .log-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-bottom: 8px;
          border-bottom: 1px solid var(--border);
          margin-bottom: 8px;
        }

        .log-header button {
          padding: 2px 8px;
          background: var(--bg-tertiary);
          border: none;
          border-radius: 4px;
          color: var(--text-secondary);
          cursor: pointer;
          font-size: 11px;
        }

        .log-entries {
          flex: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .log-entry {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          padding: 4px 8px;
          background: var(--bg-secondary);
          border-radius: 4px;
          font-size: 11px;
        }

        .log-time {
          color: var(--text-muted);
          font-family: monospace;
        }

        .log-type {
          padding: 1px 6px;
          border-radius: 3px;
          font-weight: 500;
        }

        .type-pen { background: rgba(74, 222, 128, 0.2); color: var(--success); }
        .type-thinking_delta { background: rgba(233, 69, 96, 0.2); color: var(--accent); }
        .type-status { background: rgba(251, 191, 36, 0.2); color: var(--warning); }
        .type-stroke_complete { background: rgba(74, 222, 128, 0.2); color: var(--success); }
        .type-init { background: rgba(99, 102, 241, 0.2); color: #6366f1; }

        .log-data {
          width: 100%;
          color: var(--text-secondary);
          font-size: 10px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .empty,
        .loading {
          color: var(--text-muted);
          text-align: center;
          padding: 20px;
        }

        .debug-tab.refresh {
          padding: 8px 12px;
        }
      `}</style>
    </div>
  );
}
