/**
 * Custom Next.js Server with WebSocket Support
 *
 * This custom server enables WebSocket upgrade handling for WebRTC signaling.
 * Next.js App Router doesn't support WebSocket upgrade directly, so we need
 * a custom server implementation.
 *
 * Architecture:
 * - HTTP requests → Next.js App Router (default handler)
 * - WebSocket upgrades → Custom WebSocket handler
 */

import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { logDebug, logInfo, logWarn, logError } from './app/lib/logger';
import { getOrCreateWSS, setMessageHandler } from './app/lib/wss-manager';
import { createWebSocketSession, generateSessionId } from './app/lib/webrtc-websocket-handler';
import type { WebSocket } from 'ws';

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || 'localhost';
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : (dev ? 3000 : 8080);

// Create Next.js app
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Prepare Next.js app and start server
app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      // Parse URL
      const parsedUrl = parse(req.url!, true);

      // Let Next.js handle the request
      await handle(req, res, parsedUrl);
    } catch (err) {
      logError('Error handling request', err instanceof Error ? err : { message: String(err) });
      res.statusCode = 500;
      res.end('Internal server error');
    }
  });

  // Handle WebSocket upgrade
  server.on('upgrade', (request, socket, head) => {
    const { pathname } = parse(request.url!);

    // WebSocket endpoint for WebRTC signaling
    if (pathname === '/api/webrtc') {
      logInfo('WebSocket upgrade request', { path: pathname });

      const wss = getOrCreateWSS(server);

      // Set custom message handler for WebRTC
      setMessageHandler((ws: WebSocket, data: Buffer, isBinary: boolean) => {
        try {
          // Parse incoming message
          const message = JSON.parse(data.toString('utf8'));
          const { type, sessionId } = message;

          // Create or retrieve session
          let handler;
          if (sessionId && typeof sessionId === 'string') {
            // Look for existing session
            const existingSession = (global as any).__wsSessions?.get(sessionId);
            if (existingSession) {
              handler = existingSession;
            } else {
              // Create new session
              handler = createWebSocketSession(ws, sessionId);
              if (!(global as any).__wsSessions) {
                (global as any).__wsSessions = new Map();
              }
              (global as any).__wsSessions.set(sessionId, handler);
            }
          } else {
            // Generate new session ID
            const newSessionId = generateSessionId();
            handler = createWebSocketSession(ws, newSessionId);
            if (!(global as any).__wsSessions) {
              (global as any).__wsSessions = new Map();
            }
            (global as any).__wsSessions.set(newSessionId, handler);
          }

          logDebug('WebSocket message handled', { type });
        } catch (err) {
          logError('Error handling WebSocket message', err instanceof Error ? err : { message: String(err) });
        }
      });

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

  // Handle server errors
  server.on('error', (err) => {
    logError('Server error', err instanceof Error ? err : { message: String(err) });
  });

  // Start listening
  server.listen(port, () => {
    logInfo(`> Ready on http://${hostname}:${port}`);
    logInfo('> WebSocket endpoint: ws://' + hostname + ':' + port + '/api/webrtc');
  });

  // Graceful shutdown
  const shutdown = async () => {
    logInfo('Shutting down server...');

    // Close WebSocket server
    const { closeWSS } = require('./app/lib/wss-manager');
    await closeWSS();

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
});
