import { useEffect, useRef, useState, useCallback } from 'react';

interface WebSocketHookOptions<T> {
  url: string;
  headers?: Record<string, string>;
  onMessage?: (data: T) => void;
  reconnectInterval?: number;
  pingTimeout?: number;
}

export const useWebSocket = <T>({ 
  url, 
  headers, 
  onMessage, 
  reconnectInterval = 5000,
  pingTimeout = 45000 
}: WebSocketHookOptions<T>) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisabled, setIsDisabled] = useState(false);
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const pingTimeoutRef = useRef<NodeJS.Timeout>();
  const reconnectAttempts = useRef(0);
  const connectionOptionsRef = useRef({
    url,
    headers,
    optionsHash: JSON.stringify({ url, headers })
  });

  const hasOptionsChanged = useCallback(() => {
    const newHash = JSON.stringify({ url, headers });
    return connectionOptionsRef.current.optionsHash !== newHash;
  }, [url, headers]);

  const updateConnectionOptions = useCallback(() => {
    connectionOptionsRef.current = {
      url,
      headers,
      optionsHash: JSON.stringify({ url, headers })
    };
  }, [url, headers]);

  const disableReconnection = useCallback(() => {
    setIsDisabled(true);
    cleanup();
  }, []);

  const cleanup = useCallback(() => {
    if (ws.current) {
      ws.current.close();
      ws.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = undefined;
    }
    if (pingTimeoutRef.current) {
      clearTimeout(pingTimeoutRef.current);
      pingTimeoutRef.current = undefined;
    }
    setIsConnecting(false);
    setIsConnected(false);
    reconnectAttempts.current = 0;
  }, []);

  const connect = useCallback(() => {
    // Don't attempt to connect if disabled, no URL provided, or already connecting
    if (isDisabled || !url || isConnecting || ws.current?.readyState === WebSocket.CONNECTING) {
      return;
    }

    // If max reconnection attempts reached, stop trying
    if (reconnectAttempts.current >= 10) {
      console.log('Max reconnection attempts reached, stopping reconnection');
      return;
    }

    // Close existing connection if any
    if (ws.current) {
      ws.current.close();
      ws.current = null;
    }

    try {
      setIsConnecting(true);
      const wsUrl = new URL(url);
      
      // Add authorization as a query parameter
      if (headers?.Authorization) {
        wsUrl.searchParams.append('authorization', headers.Authorization);
      }
      
      console.log('Connecting to WebSocket:', wsUrl.toString());
      ws.current = new WebSocket(wsUrl.toString());

      ws.current.onopen = () => {
        const socket = ws.current;
        if (!socket) return;

        console.log('WebSocket connection opened');
        setIsConnected(true);
        setIsConnecting(false);
        reconnectAttempts.current = 0;
        updateConnectionOptions();

        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = undefined;
        }

        const startHeartbeat = () => {
          if (pingTimeoutRef.current) {
            clearTimeout(pingTimeoutRef.current);
          }
          pingTimeoutRef.current = setTimeout(() => {
            console.log('Ping timeout, closing connection');
            if (socket.readyState === WebSocket.OPEN) {
              socket.close();
            }
          }, pingTimeout);
        };

        // Start heartbeat
        startHeartbeat();

        // Handle pings from server by resetting the heartbeat
        socket.addEventListener('ping', startHeartbeat);

        // Clean up heartbeat on close
        socket.addEventListener('close', () => {
          if (pingTimeoutRef.current) {
            clearTimeout(pingTimeoutRef.current);
            pingTimeoutRef.current = undefined;
          }
        });
      };

      ws.current.onclose = (event) => {
        console.log('WebSocket connection closed:', event.code);
        setIsConnected(false);
        setIsConnecting(false);
        ws.current = null;

        // Handle specific close codes
        switch (event.code) {
          case 1000: // Normal closure
            console.log('WebSocket closed normally');
            return;
          case 1006: // Abnormal closure
            // Only reconnect if we haven't been told to stop
            if (!isDisabled) {
              scheduleReconnect();
            }
            return;
          case 1013: // Too many connections
            console.log('Server rejected connection: Too many connections');
            disableReconnection();
            return;
          default:
            // For other codes, attempt reconnect unless options changed
            if (!hasOptionsChanged()) {
              scheduleReconnect();
            }
        }
      };

      const scheduleReconnect = () => {
        if (reconnectAttempts.current >= 10) {
          console.log('Max reconnection attempts reached');
          return;
        }

        const delay = Math.min(1000 * Math.pow(1.5, reconnectAttempts.current), 10000);
        const jitter = Math.random() * 1000;
        reconnectAttempts.current++;

        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }

        reconnectTimeoutRef.current = setTimeout(connect, delay + jitter);
        console.log(`Attempting reconnect in ${Math.floor((delay + jitter) / 1000)}s`);
      };

      ws.current.onerror = (error) => {
        // Log error but don't take action - let onclose handle it
        console.error('WebSocket error:', error);
      };

      ws.current.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          
          // Check for terminal messages that should disable reconnection
          if (message.event === 'system-status' && message.data?.status === 'error') {
            console.log('Received terminal error message:', message.data.message);
            disableReconnection();
          } else if (message.event === 'connection' && message.data?.status === 'connected') {
            console.log('WebSocket connection confirmed by server');
          } else if (message && typeof message === 'object') {
            onMessage?.(message);
          } else {
            console.error('Invalid message format received:', message);
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };
    } catch (error) {
      console.error('WebSocket connection error:', error);
      setIsConnected(false);
      setIsConnecting(false);
    }
  }, [url, headers, onMessage, hasOptionsChanged, updateConnectionOptions, disableReconnection]);

  useEffect(() => {
    // Handle connection options changes
    if (hasOptionsChanged()) {
      console.log('Connection options changed, cleaning up and reconnecting');
      cleanup();
    }

    // Connect if not connected and not connecting
    if (!isConnected && !isConnecting) {
      connect();
    }

    return cleanup;
  }, [url, headers, connect, isConnected, isConnecting, hasOptionsChanged, cleanup]);

  const sendMessage = useCallback((data: any) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(data));
    }
  }, []);

  return { isConnected, isConnecting, isDisabled, sendMessage };
};
