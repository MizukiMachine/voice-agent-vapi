/**
 * WebSocket Server Manager
 *
 * Singleton pattern for managing WebSocket server instance.
 * Handles connection tracking and graceful shutdown.
 */

import { Server as HTTPServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { logDebug, logInfo, logWarn, logError } from './logger';

let wssInstance: WebSocketServer | null = null;
const connections = new Set<WebSocket>();

/**
 * Get or create WebSocket Server instance
 */
export function getOrCreateWSS(httpServer: HTTPServer): WebSocketServer {
  if (!wssInstance) {
    logInfo('Creating new WebSocket Server');

    wssInstance = new WebSocketServer({
      noServer: true,
      perMessageDeflate: false, // Disable compression for audio streaming
    });

    // Set up connection handler
    wssInstance.on('connection', (ws: WebSocket, request) => {
      connections.add(ws);

      const clientIp = request.socket.remoteAddress;
      logInfo('WebSocket client connected', {
        clientIp,
        connectionCount: connections.size,
      });

      // Set up message handler (will be overridden by specific handler)
      ws.on('message', (data: Buffer) => {
        logDebug('WebSocket message received', {
          size: data.length,
          clientIp,
        });
      });

      // Handle close
      ws.on('close', () => {
        connections.delete(ws);
        logInfo('WebSocket client disconnected', {
          clientIp,
          connectionCount: connections.size,
        });
      });

      // Handle errors
      ws.on('error', (error) => {
        logError('WebSocket error', error, {
          clientIp,
        });
        connections.delete(ws);
      });

      // Send welcome message
      sendToClient(ws, {
        type: 'connected',
        message: 'WebSocket connection established',
      });
    });

    // Handle server errors
    wssInstance.on('error', (error) => {
      logError('WebSocket Server error', error);
    });

    // Set up HTTP server close handler
    httpServer.on('close', () => {
      closeWSS();
    });
  }

  return wssInstance;
}

/**
 * Close WebSocket Server gracefully
 */
export async function closeWSS(): Promise<void> {
  if (!wssInstance) {
    return;
  }

  logInfo('Closing WebSocket Server...', {
    connectionCount: connections.size,
  });

  // Close all connections
  for (const ws of connections) {
    ws.close(1001, 'Server shutting down');
  }
  connections.clear();

  // Close server
  return new Promise((resolve) => {
    wssInstance!.close(() => {
      logInfo('WebSocket Server closed');
      wssInstance = null;
      resolve();
    });
  });
}

/**
 * Get active connection count
 */
export function getConnectionCount(): number {
  return connections.size;
}

/**
 * Get all active connections
 */
export function getConnections(): Set<WebSocket> {
  return connections;
}

/**
 * Send message to specific client
 */
export function sendToClient(ws: WebSocket, data: Record<string, unknown>): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

/**
 * Broadcast message to all connected clients
 */
export function broadcast(data: Record<string, unknown>): void {
  const message = JSON.stringify(data);
  for (const ws of connections) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  }
}

/**
 * Set up message handler for the server
 * This allows external handlers to process messages
 */
export function setMessageHandler(
  handler: (ws: WebSocket, data: Buffer, isBinary: boolean) => void
): void {
  if (wssInstance) {
    // Remove existing listeners
    wssInstance.listeners('connection').forEach((listener) => {
      wssInstance!.off('connection', listener as (...args: unknown[]) => void);
    });

    // Add new listener with custom message handler
    wssInstance.on('connection', (ws: WebSocket, request) => {
      connections.add(ws);

      const clientIp = request.socket.remoteAddress;
      logInfo('WebSocket client connected', {
        clientIp,
        connectionCount: connections.size,
      });

      // Use custom message handler
      ws.on('message', (data: Buffer, isBinary: boolean) => {
        handler(ws, data, isBinary);
      });

      // Handle close
      ws.on('close', () => {
        connections.delete(ws);
        logInfo('WebSocket client disconnected', {
          clientIp,
          connectionCount: connections.size,
        });
      });

      // Handle errors
      ws.on('error', (error) => {
        logError('WebSocket error', error, {
          clientIp,
        });
        connections.delete(ws);
      });

      // Send welcome message
      sendToClient(ws, {
        type: 'connected',
        message: 'WebSocket connection established',
      });
    });
  }
}
