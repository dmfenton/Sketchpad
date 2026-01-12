/**
 * WebSocket hook with auth integration.
 *
 * Uses AuthContext for token management.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientMessage, ServerMessage } from '@drawing-agent/shared';
import { getWebSocketUrl } from '../config';
import { useAuth } from '../context/AuthContext';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

interface UseWebSocketOptions {
  onMessage: (message: ServerMessage) => void;
  autoConnect?: boolean;
}

interface UseWebSocketReturn {
  status: ConnectionStatus;
  send: (message: ClientMessage) => void;
  connect: () => void;
  disconnect: () => void;
}

export function useWebSocket({
  onMessage,
  autoConnect = true,
}: UseWebSocketOptions): UseWebSocketReturn {
  const { accessToken, refreshAccessToken } = useAuth();
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectAttempts = useRef(0);

  const connect = useCallback(async () => {
    if (!accessToken) {
      console.log('[WebSocket] No access token, skipping connection');
      return;
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    setStatus('connecting');

    try {
      const wsUrl = `${getWebSocketUrl()}?token=${encodeURIComponent(accessToken)}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = (): void => {
        console.log('[WebSocket] Connected');
        setStatus('connected');
        reconnectAttempts.current = 0;
      };

      ws.onmessage = (event: MessageEvent): void => {
        try {
          const message = JSON.parse(event.data as string) as ServerMessage;
          onMessage(message);
        } catch (e) {
          console.error('[WebSocket] Failed to parse message:', e);
        }
      };

      ws.onclose = async (event: CloseEvent): Promise<void> => {
        console.log('[WebSocket] Disconnected:', event.code, event.reason);
        setStatus('disconnected');
        wsRef.current = null;

        // Auth error - try to refresh token
        if (event.code === 4001) {
          console.log('[WebSocket] Auth error, attempting token refresh');
          const refreshed = await refreshAccessToken();
          if (refreshed) {
            // Token refreshed, reconnect immediately
            reconnectAttempts.current = 0;
            setTimeout(() => connect(), 100);
            return;
          }
          // Refresh failed, auth context will handle logout
          return;
        }

        // Auto-reconnect with exponential backoff
        const maxAttempts = 10;
        if (reconnectAttempts.current < maxAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
          reconnectAttempts.current++;

          if (reconnectTimeoutRef.current) {
            window.clearTimeout(reconnectTimeoutRef.current);
          }

          console.log(`[WebSocket] Reconnecting in ${delay}ms (attempt ${reconnectAttempts.current})`);
          reconnectTimeoutRef.current = window.setTimeout(() => {
            void connect();
          }, delay);
        }
      };

      ws.onerror = (error: Event): void => {
        console.error('[WebSocket] Error:', error);
      };
    } catch (error) {
      console.error('[WebSocket] Connection failed:', error);
      setStatus('disconnected');

      // Retry after delay
      reconnectTimeoutRef.current = window.setTimeout(() => {
        void connect();
      }, 3000);
    }
  }, [accessToken, onMessage, refreshAccessToken]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      window.clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setStatus('disconnected');
  }, []);

  const send = useCallback((message: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      console.warn('[WebSocket] Cannot send, not connected');
    }
  }, []);

  // Connect when we have a token
  useEffect(() => {
    if (autoConnect && accessToken) {
      void connect();
    }

    return () => {
      if (reconnectTimeoutRef.current) {
        window.clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [autoConnect, accessToken, connect]);

  return { status, send, connect, disconnect };
}
