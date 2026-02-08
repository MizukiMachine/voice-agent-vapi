/**
 * Custom Next.js Server with WebSocket Support
 *
 * This custom server enables WebSocket upgrade handling for WebRTC signaling.
 * Next.js App Router doesn't support WebSocket upgrade directly, so we need
 * a custom server implementation.
 *
 * Architecture:
 * - HTTP requests → Next.js App Router (default handler)
 * - WebSocket upgrades → WebSocket Server (ws)
 */

import { createServer } from 'http';
import { parse } from 'url';
import { WebSocketServer } from 'ws';

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || 'localhost';
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : (dev ? 3000 : 8080);

// WebSocket server instance
let wss: WebSocketServer | null = null;
const connections = new Set<any>();

// Prepare Next.js app and start server
async function startServer() {
  // Dynamically import Next.js to avoid AsyncLocalStorage issues
  const next = (await import('next')).default;
  const { logInfo, logWarn, logError } = await import('./app/lib/logger');

  // Create Next.js app
  const app = next({ dev, hostname, port });
  const handle = app.getRequestHandler();

  await app.prepare();

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

      // Create WebSocket server if not exists
      if (!wss) {
        wss = new WebSocketServer({ noServer: true, perMessageDeflate: false });

        // Connection handler
        wss.on('connection', (ws: any, req: any) => {
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
                const session = createWebRTCSession({ userId: 'anonymous' } as any);
                sessionId = session.sessionId;
              }

              // Create handler instance
              const handler = new WebRTCWebSocketConnection(ws, sessionId, {} as any, {} as any);
              await handler.start();
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
      }

      wss.handleUpgrade(request, socket, head, (ws) => {
        wss!.emit('connection', ws, request);
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

    // Close WebSocket connections
    for (const ws of connections) {
      ws.close(1001, 'Server shutting down');
    }
    connections.clear();

    if (wss) {
      await new Promise<void>((resolve) => {
        wss!.close(() => {
          logInfo('WebSocket Server closed');
          wss = null;
          resolve();
        });
      });
    }

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

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
