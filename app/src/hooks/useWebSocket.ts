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
  onMessage: (message: ServerMessage) => void;
  reconnectInterval?: number;
}

export interface UseWebSocketReturn {
  state: WebSocketState;
  send: (message: ClientMessage) => void;
  disconnect: () => void;
}

export function useWebSocket({
  url,
  onMessage,
  reconnectInterval = 3000,
}: UseWebSocketOptions): UseWebSocketReturn {
  const [state, setState] = useState<WebSocketState>({
    connected: false,
    error: null,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    try {
      console.log('[WebSocket] Connecting to:', url);
      const ws = new WebSocket(url);

      ws.onopen = () => {
        console.log('[WebSocket] Connected!');
        setState({ connected: true, error: null });
      };

      ws.onclose = () => {
        console.log('[WebSocket] Closed, reconnecting in', reconnectInterval, 'ms');
        setState((prev) => ({ ...prev, connected: false }));
        // Schedule reconnect
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
          onMessage(message);
        } catch {
          console.error('Failed to parse message:', event.data);
        }
      };

      wsRef.current = ws;
    } catch {
      setState({ connected: false, error: 'Failed to connect' });
    }
  }, [url, onMessage, reconnectInterval]);

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
