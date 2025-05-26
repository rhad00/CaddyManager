import { useEffect, useRef, useState, useCallback } from 'react';

interface WebSocketHookOptions<T> {
  url: string;
  onMessage?: (data: T) => void;
  reconnectInterval?: number;
}

export const useWebSocket = <T>({ url, onMessage, reconnectInterval = 3000 }: WebSocketHookOptions<T>) => {
  const [isConnected, setIsConnected] = useState(false);
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();

  const connect = useCallback(() => {
    try {
      ws.current = new WebSocket(url);

      ws.current.onopen = () => {
        setIsConnected(true);
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
      };

      ws.current.onclose = () => {
        setIsConnected(false);
        // Attempt to reconnect
        reconnectTimeoutRef.current = setTimeout(connect, reconnectInterval);
      };

      ws.current.onerror = (error) => {
        console.error('WebSocket error:', error);
        ws.current?.close();
      };

      ws.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as T;
          if (data && typeof data === 'object') {
            onMessage?.(data);
          } else {
            console.error('Invalid message format received:', data);
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };
    } catch (error) {
      console.error('WebSocket connection error:', error);
      setIsConnected(false);
    }
  }, [url, onMessage, reconnectInterval]);

  useEffect(() => {
    connect();

    return () => {
      if (ws.current) {
        ws.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connect]);

  const sendMessage = useCallback((data: any) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(data));
    }
  }, []);

  return { isConnected, sendMessage };
};
