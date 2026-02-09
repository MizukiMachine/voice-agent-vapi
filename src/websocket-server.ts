/**
 * Standalone WebSocket Server for WebRTC Signaling
 *
 * This server handles WebSocket connections separately from Next.js:
 * - Port 3001 (default) for WebSocket connections
 * - Independent of Next.js server (port 3000)
 *
 * Architecture:
 * - Next.js (port 3000) → HTTP/API/Pages
 * - WebSocket Server (port 3001) → WebRTC signaling, audio streaming
 *
 * Environment Variables:
 * - WEBSOCKET_PORT: WebSocket server port (default: 3001)
 * - HOSTNAME: Server hostname (default: localhost)
 */

import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import type { IncomingMessage } from 'http';
import type { WebSocket } from 'ws';
import { loadVapiConfig, loadCartesiaConfig, getConfigSummary } from './app/lib/config';

const hostname = process.env.HOSTNAME || 'localhost';
const port = process.env.WEBSOCKET_PORT ? parseInt(process.env.WEBSOCKET_PORT, 10) : 3001;

// WebSocket server instance
const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false });
const connections = new Set<WebSocket>();

// ============================================================
// Server Startup
// ============================================================

async function startWebSocketServer() {
  const { logInfo, logWarn, logError } = await import('./app/lib/logger');

  const server = createServer();

  // Handle WebSocket upgrade
  server.on('upgrade', (request, socket, head) => {
    const { pathname } = new URL(request.url!, `http://${hostname}`);

    // WebSocket endpoint for WebRTC signaling
    if (pathname === '/api/webrtc') {
      logInfo('WebSocket upgrade request', { path: pathname });

      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      // Reject other WebSocket upgrade paths
      socket.write('HTTP/1.1 426 Upgrade Required\r\n\r\n');
      socket.destroy();
      logWarn('WebSocket upgrade rejected', { path: pathname });
    }
  });

  // Handle WebSocket connections
  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    connections.add(ws);

    const clientIp = req.socket.remoteAddress;
    logInfo('WebSocket client connected', {
      clientIp,
      connectionCount: connections.size,
    });

    // Send welcome message
    ws.send(JSON.stringify({
      type: 'connected',
      message: 'WebSocket connection established',
    }));

    // Handle messages (delegate to route handler)
    ws.on('message', async (data: Buffer) => {
      try {
        // Import the WebSocket handler dynamically
        const { WebRTCWebSocketConnection } = await import('./app/api/webrtc/route');
        const { createWebRTCSession } = await import('./app/lib/webrtc-session-manager');

        const message = JSON.parse(data.toString('utf8'));

        // Get or create session
        let sessionId = message.sessionId;
        if (!sessionId) {
          const session = createWebRTCSession('anonymous', 'Default system prompt');
          sessionId = session.sessionId;
        }

        // Load configuration (throws if missing required env vars)
        const vapiConfig = loadVapiConfig();
        const cartesiaConfig = loadCartesiaConfig();

        // Create handler instance with proper configuration
        const handler = new WebRTCWebSocketConnection(sessionId, ws, vapiConfig, cartesiaConfig);
        await handler.handle();
      } catch (err) {
        logError('Error handling WebSocket message', err instanceof Error ? err : { message: String(err) });
      }
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
    ws.on('error', (error: Error) => {
      logError('WebSocket error', error, { clientIp });
      connections.delete(ws);
    });
  });

  wss.on('error', (error: Error) => {
    logError('WebSocket Server error', error);
  });

  // Start listening
  server.listen(port, () => {
    logInfo(`WebSocket Server listening on ws://${hostname}:${port}`);
    logInfo(`> WebSocket endpoint: ws://${hostname}:${port}/api/webrtc`);

    // Log configuration status (without exposing secrets)
    const configSummary = getConfigSummary();
    if (configSummary.vapi.configured && configSummary.cartesia.configured) {
      logInfo('> Configuration loaded successfully', {
        vapi: { assistant: configSummary.vapi.hasAssistant },
        cartesia: {
          voiceId: configSummary.cartesia.voiceId,
          speed: configSummary.cartesia.speed,
        },
      });
    } else {
      logWarn('> Some configuration is missing', {
        vapiConfigured: configSummary.vapi.configured,
        cartesiaConfigured: configSummary.cartesia.configured,
      });
    }
  });

  // Handle server errors
  server.on('error', (err) => {
    logError('Server error', err instanceof Error ? err : { message: String(err) });
  });

  // Graceful shutdown
  const shutdown = async () => {
    logInfo('Shutting down WebSocket server...');

    // Close WebSocket connections
    for (const ws of connections) {
      ws.close(1001, 'Server shutting down');
    }
    connections.clear();

    wss.close(() => {
      logInfo('WebSocket Server closed');
    });

    // Close HTTP server
    server.close(() => {
      logInfo('Server closed');
      process.exit(0);
    });

    // Force close after 10 seconds
    setTimeout(() => {
      logError('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

startWebSocketServer().catch((err) => {
  console.error('Failed to start WebSocket server:', err);
  process.exit(1);
});
