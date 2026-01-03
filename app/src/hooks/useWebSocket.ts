/**
 * WebSocket connection management hook.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import type { ClientMessage, ServerMessage } from '../types';

export interface WebSocketState {
  connected: boolean;
  error: string | null;
}

export interface UseWebSocketOptions {
  url: string;
  token?: string | null;
  onMessage: (message: ServerMessage) => void;
  onAuthError?: () => void;
  reconnectInterval?: number;
}

export interface UseWebSocketReturn {
  state: WebSocketState;
  send: (message: ClientMessage) => void;
  disconnect: () => void;
}

export function useWebSocket({
  url,
  token,
  onMessage,
  onAuthError,
  reconnectInterval = 3000,
}: UseWebSocketOptions): UseWebSocketReturn {
  const [state, setState] = useState<WebSocketState>({
    connected: false,
    error: null,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Use ref for handlers to avoid reconnecting when callbacks change
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;
  const onAuthErrorRef = useRef(onAuthError);
  onAuthErrorRef.current = onAuthError;

  const connect = useCallback(() => {
    // Don't connect without a token
    if (!token) {
      console.log('[WebSocket] No token, skipping connection');
      return;
    }

    // Don't create new connection if one already exists and is connecting/open
    if (wsRef.current && (wsRef.current.readyState === WebSocket.CONNECTING || wsRef.current.readyState === WebSocket.OPEN)) {
      console.log('[WebSocket] Already connected/connecting, skipping');
      return;
    }

    try {
      // Append token to URL
      const wsUrl = `${url}?token=${encodeURIComponent(token)}`;
      console.log('[WebSocket] Connecting to:', url);
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('[WebSocket] Connected!');
        setState({ connected: true, error: null });
      };

      ws.onclose = (event) => {
        console.log('[WebSocket] Closed with code:', event.code, 'reason:', event.reason);
        setState((prev) => ({ ...prev, connected: false }));
        wsRef.current = null;

        // Auth error codes (4001 = auth failed)
        if (event.code === 4001) {
          console.log('[WebSocket] Auth error, triggering callback');
          onAuthErrorRef.current?.();
          return; // Don't reconnect on auth errors
        }

        // Schedule reconnect for other close reasons
        reconnectTimeoutRef.current = setTimeout(connect, reconnectInterval);
      };

      ws.onerror = (e) => {
        console.error('[WebSocket] Error:', e);
        setState((prev) => ({ ...prev, error: 'Connection error' }));
      };

      ws.onmessage = (event: MessageEvent<string>) => {
        try {
          const message = JSON.parse(event.data) as ServerMessage;
          console.log('[WebSocket] Message:', message.type);
          onMessageRef.current(message);
        } catch (e) {
          console.error('Failed to handle message:', e, '\nData:', event.data.substring(0, 200));
        }
      };

      wsRef.current = ws;
    } catch {
      setState({ connected: false, error: 'Failed to connect' });
    }
  }, [url, token, reconnectInterval]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const send = useCallback((message: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  useEffect(() => {
    connect();
    return disconnect;
  }, [connect, disconnect]);

  return { state, send, disconnect };
}
