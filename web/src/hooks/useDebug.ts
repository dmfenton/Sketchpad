/**
 * Debug data hook - fetches workspace and agent state.
 *
 * Uses AuthContext for token management.
 */

import { useCallback, useEffect, useState } from 'react';
import type { ServerMessage } from '@drawing-agent/shared';
import { getApiUrl } from '../config';
import { useAuth } from '../context/AuthContext';

export interface WorkspaceFile {
  name: string;
  path: string;
  size: number;
  modified: string;
}

export interface AgentDebugInfo {
  notes: string;
  monologue: string;
  status: string;
  piece_count: number;
  paused: boolean;
}

export interface DebugState {
  agent: AgentDebugInfo | null;
  files: WorkspaceFile[];
  messageLog: Array<{ timestamp: number; message: ServerMessage }>;
  loading: boolean;
  error: string | null;
}

interface UseDebugReturn extends DebugState {
  refresh: () => Promise<void>;
  logMessage: (message: ServerMessage) => void;
  clearLog: () => void;
}

const MAX_LOG_MESSAGES = 100;

export function useDebug(): UseDebugReturn {
  const { accessToken, refreshAccessToken } = useAuth();

  const [state, setState] = useState<DebugState>({
    agent: null,
    files: [],
    messageLog: [],
    loading: false,
    error: null,
  });

  const refresh = useCallback(async () => {
    if (!accessToken) return;

    setState((s) => ({ ...s, loading: true, error: null }));

    try {
      const headers = { Authorization: `Bearer ${accessToken}` };

      const [agentRes, workspaceRes] = await Promise.all([
        fetch(`${getApiUrl()}/debug/agent`, { headers }),
        fetch(`${getApiUrl()}/debug/workspace`, { headers }),
      ]);

      // Handle 401 - try to refresh token
      if (agentRes.status === 401 || workspaceRes.status === 401) {
        const refreshed = await refreshAccessToken();
        if (refreshed) {
          // Retry with new token
          setTimeout(() => refresh(), 100);
          return;
        }
        throw new Error('Authentication failed');
      }

      if (!agentRes.ok || !workspaceRes.ok) {
        throw new Error('Failed to fetch debug info');
      }

      const agent = await agentRes.json();
      const workspace = await workspaceRes.json();

      setState((s) => ({
        ...s,
        agent,
        files: workspace.files || [],
        loading: false,
      }));
    } catch (error) {
      setState((s) => ({
        ...s,
        loading: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }));
    }
  }, [accessToken, refreshAccessToken]);

  const logMessage = useCallback((message: ServerMessage) => {
    setState((s) => ({
      ...s,
      messageLog: [
        ...s.messageLog.slice(-MAX_LOG_MESSAGES + 1),
        { timestamp: Date.now(), message },
      ],
    }));
  }, []);

  const clearLog = useCallback(() => {
    setState((s) => ({ ...s, messageLog: [] }));
  }, []);

  // Initial fetch and polling when we have a token
  useEffect(() => {
    if (!accessToken) return;

    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [accessToken, refresh]);

  return {
    ...state,
    refresh,
    logMessage,
    clearLog,
  };
}
