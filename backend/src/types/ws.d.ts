import WebSocket from 'ws';

declare module 'ws' {
  interface IWebSocket extends WebSocket {
    pingInterval?: NodeJS.Timeout;
  }
  class Server extends WebSocket.Server {}
}
