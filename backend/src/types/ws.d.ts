import { WebSocket as WSWebSocket } from 'ws';

declare global {
  // Extend the WebSocket type to include OPEN state
  interface WebSocket extends WSWebSocket {
    OPEN: number;
    readyState: number;
    send(data: string): void;
    on(event: string, listener: () => void): this;
  }
}
