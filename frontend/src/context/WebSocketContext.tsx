import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';
import { authService } from '@/services/authService';
import { MonitoringUpdate } from '@/types/monitoring';

interface WebSocketContextType {
  isConnected: boolean;
  isConnecting: boolean;
  isDisabled: boolean;
  lastUpdate: MonitoringUpdate | null;
  error?: string | null;
}

const WebSocketContext = createContext<WebSocketContextType>({
  isConnected: false,
  isConnecting: false,
  isDisabled: false,
  lastUpdate: null,
  error: null,
});

export const WebSocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lastUpdate, setLastUpdate] = useState<MonitoringUpdate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(authService.getToken());

  // WebSocket message handler
  const handleMessage = useCallback((message: any) => {
    try {
      if (!message?.event || !message?.data) {
        throw new Error('Invalid monitoring update received');
      }

      // Handle system status events directly
      if (message.event === 'system-status') {
        setLastUpdate({ type: 'system', data: message.data });
        return;
      }

      // Transform other backend event names to frontend types
      const eventTypeMap: Record<string, "metric" | "health" | "ssl"> = {
        'metrics-update': 'metric',
        'health-check': 'health',
        'ssl-alert': 'ssl'
      };

      const type = eventTypeMap[message.event];
      if (!type) {
        throw new Error(`Unknown event type: ${message.event}`);
      }

      setLastUpdate({ type, data: message.data });
      setError(null); // Clear any previous errors
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unknown error processing message');
      console.error('Error processing monitoring update:', error);
    }
  }, []);

  // Update token when auth changes
  useEffect(() => {
    const handleAuthChange = (event: CustomEvent<{ newValue: string | null }>) => {
      console.log('Auth token changed, updating connection');
      setToken(event.detail.newValue);
      setError(null); // Clear any previous errors
    };

    window.addEventListener('auth-token-changed', handleAuthChange as EventListener);
    return () => {
      window.removeEventListener('auth-token-changed', handleAuthChange as EventListener);
    };
  }, []);

  // Configure WebSocket connection
  const wsConfig = useMemo(() => ({
    url: token ? `${import.meta.env.VITE_WS_URL}/api/v1/monitoring/ws` : '',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  }), [token]);

  // Connect to WebSocket
  const { isConnected, isConnecting, isDisabled } = useWebSocket({
    ...wsConfig,
    onMessage: handleMessage,
    reconnectInterval: 5000,
    pingTimeout: 45000,
  });

  // Context value
  const value = useMemo(() => ({
    isConnected,
    isConnecting,
    isDisabled,
    lastUpdate,
    error,
  }), [isConnected, isConnecting, isDisabled, lastUpdate, error]);

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
};

export const useWebSocketContext = () => useContext(WebSocketContext);
