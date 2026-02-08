/**
 * Simple WebSocket Server for WebRTC Signaling
 *
 * This is a standalone WebSocket server that runs alongside Next.js.
 * It handles WebRTC signaling and delegates actual message processing
 * to the Next.js API routes via HTTP requests.
 */

import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { parse } from 'url';

const PORT = process.env.WS_PORT || 3001;
const NEXTJS_URL = process.env.NEXTJS_URL || 'http://localhost:3000';

const wss = new WebSocketServer({ port: PORT });

console.log(`WebSocket Server running on ws://localhost:${PORT}`);
console.log(`Proxying to Next.js at ${NEXTJS_URL}`);

wss.on('connection', (ws: any, req: any) => {
  const clientIp = req.socket.remoteAddress;
  console.log(`WebSocket client connected: ${clientIp}`);

  // Send welcome message
  ws.send(JSON.stringify({
    type: 'connected',
    message: 'WebSocket connection established',
    websocketUrl: `ws://localhost:${PORT}`,
  }));

  // Handle incoming messages
  ws.on('message', async (data: Buffer) => {
    try {
      const message = JSON.parse(data.toString('utf8'));
      console.log('Received message:', message.type);

      // Forward to Next.js API route for processing
      const response = await fetch(`${NEXTJS_URL}/api/webrtc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
      });

      if (response.ok) {
        const result = await response.json();
        // Send response back to client
        ws.send(JSON.stringify(result));
      }
    } catch (err) {
      console.error('Error handling message:', err);
      ws.send(JSON.stringify({
        type: 'error',
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  });

  // Handle close
  ws.on('close', () => {
    console.log(`WebSocket client disconnected: ${clientIp}`);
  });

  // Handle errors
  ws.on('error', (error: Error) => {
    console.error('WebSocket error:', error);
  });
});

// Handle server errors
wss.on('error', (error: Error) => {
  console.error('WebSocket Server error:', error);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down WebSocket server...');
  wss.close(() => {
    console.log('WebSocket Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('Shutting down WebSocket server...');
  wss.close(() => {
    console.log('WebSocket Server closed');
    process.exit(0);
  });
});
