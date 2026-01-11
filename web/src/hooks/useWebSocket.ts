/**
 * WebSocket hook with auto dev token.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientMessage, ServerMessage } from '@drawing-agent/shared';
import { getApiUrl, getWebSocketUrl } from '../config';

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
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const wsRef = useRef<WebSocket | null>(null);
  const tokenRef = useRef<string | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);

  const getDevToken = useCallback(async (): Promise<string> => {
    // Try to get cached token
    if (tokenRef.current) {
      return tokenRef.current;
    }

    // Fetch dev token from backend
    const response = await fetch(`${getApiUrl()}/auth/dev-token`);
    if (!response.ok) {
      throw new Error('Failed to get dev token');
    }
    const data = await response.json();
    tokenRef.current = data.access_token;
    return data.access_token;
  }, []);

  const connect = useCallback(async () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    setStatus('connecting');

    try {
      const token = await getDevToken();
      const wsUrl = `${getWebSocketUrl()}?token=${token}`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = (): void => {
        console.log('[WebSocket] Connected');
        setStatus('connected');
      };

      ws.onmessage = (event: MessageEvent): void => {
        try {
          const message = JSON.parse(event.data as string) as ServerMessage;
          onMessage(message);
        } catch (e) {
          console.error('[WebSocket] Failed to parse message:', e);
        }
      };

      ws.onclose = (event: CloseEvent): void => {
        console.log('[WebSocket] Disconnected:', event.code, event.reason);
        setStatus('disconnected');
        wsRef.current = null;

        // Auth error - clear token and don't reconnect immediately
        if (event.code === 4001) {
          tokenRef.current = null;
          console.log('[WebSocket] Auth error, will retry with new token');
        }

        // Auto-reconnect after delay
        if (reconnectTimeoutRef.current) {
          window.clearTimeout(reconnectTimeoutRef.current);
        }
        reconnectTimeoutRef.current = window.setTimeout(() => {
          console.log('[WebSocket] Reconnecting...');
          void connect();
        }, 3000);
      };

      ws.onerror = (error: Event): void => {
        console.error('[WebSocket] Error:', error);
      };
    } catch (error) {
      console.error('[WebSocket] Connection failed:', error);
      setStatus('disconnected');

      // Retry after delay
      reconnectTimeoutRef.current = window.setTimeout(() => {
        connect();
      }, 3000);
    }
  }, [getDevToken, onMessage]);

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

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    return () => {
      if (reconnectTimeoutRef.current) {
        window.clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [autoConnect, connect]);

  return { status, send, connect, disconnect };
}
