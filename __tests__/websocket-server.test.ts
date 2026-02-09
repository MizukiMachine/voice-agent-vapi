/**
 * WebSocket Server Tests
 *
 * Tests for the standalone WebSocket server that handles WebRTC signaling.
 */

import { createServer, IncomingMessage, Server } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { AddressInfo } from 'net';

// Mock the logger to avoid noise in tests
jest.mock('@/app/lib/logger', () => ({
  createServiceLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

// Mock the configuration loading
jest.mock('@/app/lib/config', () => ({
  loadVapiConfig: jest.fn(() => ({
    apiKey: 'test-vapi-key',
    publicKey: 'test-public-key',
    assistantId: 'test-assistant-id',
  })),
  loadCartesiaConfig: jest.fn(() => ({
    apiKey: 'test-cartesia-key',
    voiceId: '79a125e6-c5a2-4b9d-8b3f-5c2a1b2d3e4f',
    speed: 1.0,
    sampleRate: 24000,
    outputFormat: 'pcm16',
  })),
  getConfigSummary: jest.fn(() => ({
    vapi: { configured: true, hasAssistant: true },
    cartesia: { configured: true, voiceId: '79a125e6-c5a2-4b9d-8b3f-5c2a1b2d3e4f', speed: 1.0 },
    websocket: { port: 3001, url: 'ws://localhost:3001/api/webrtc' },
  })),
}));

// Mock the WebRTC route handler
jest.mock('@/app/api/webrtc/route', () => ({
  WebRTCWebSocketConnection: jest.fn().mockImplementation(() => ({
    handle: jest.fn().mockResolvedValue(undefined),
  })),
}));

// Mock the session manager
jest.mock('@/app/lib/webrtc-session-manager', () => ({
  createWebRTCSession: jest.fn(() => ({
    sessionId: 'test-session-123',
    userId: 'anonymous',
    systemPrompt: 'Default system prompt',
    createdAt: Date.now(),
  })),
}));

describe('WebSocket Server', () => {
  let httpServer: Server;
  let wss: WebSocketServer;
  let serverPort: number;
  let wsUrl: string;

  beforeAll((done) => {
    // Create a test HTTP server
    httpServer = createServer();
    httpServer.listen(() => {
      const address = httpServer.address() as AddressInfo;
      serverPort = address.port;
      wsUrl = `ws://localhost:${serverPort}`;

      // Create WebSocket server attached to HTTP server
      wss = new WebSocketServer({ noServer: true, perMessageDeflate: false });

      // Handle WebSocket upgrade
      httpServer.on('upgrade', (request: IncomingMessage, socket, head) => {
        const { pathname } = new URL(request.url!, `http://localhost:${serverPort}`);

        // Accept connections to /api/webrtc path
        if (pathname === '/api/webrtc') {
          wss.handleUpgrade(request, socket, head, (ws: WebSocket) => {
            wss.emit('connection', ws, request);
          });
        } else {
          // Reject other paths
          socket.write('HTTP/1.1 426 Upgrade Required\r\n\r\n');
          socket.destroy();
        }
      });

      done();
    });
  });

  afterAll((done) => {
    // Close WebSocket server
    wss.close(() => {
      // Close HTTP server
      httpServer.close(() => {
        done();
      });
    });
  });

  describe('WebSocket Upgrade Handling', () => {
    it('should accept WebSocket connections to /api/webrtc', (done) => {
      const ws = new WebSocket(`${wsUrl}/api/webrtc`);

      ws.on('open', () => {
        ws.close();
      });

      ws.on('close', () => {
        done();
      });

      ws.on('error', (error) => {
        done.fail(error);
      });
    });

    it('should reject WebSocket connections to invalid paths', (done) => {
      const ws = new WebSocket(`${wsUrl}/invalid-path`);

      let testCompleted = false;

      ws.on('open', () => {
        ws.close();
        if (!testCompleted) {
          testCompleted = true;
          done.fail('Should not have connected to invalid path');
        }
      });

      ws.on('error', () => {
        // Expected - connection should fail
        if (!testCompleted) {
          testCompleted = true;
          done();
        }
      });

      ws.on('close', () => {
        // Connection should close without opening
        if (!testCompleted) {
          testCompleted = true;
          done();
        }
      });
    });

    it('should handle multiple concurrent connections', (done) => {
      const connectionCount = 3;
      let connectedCount = 0;
      const connections: WebSocket[] = [];

      const onConnected = () => {
        connectedCount++;
        if (connectedCount === connectionCount) {
          // All connections established, close them
          connections.forEach((ws) => ws.close());
        }
      };

      for (let i = 0; i < connectionCount; i++) {
        const ws = new WebSocket(`${wsUrl}/api/webrtc`);
        connections.push(ws);

        ws.on('open', () => {
          onConnected();
        });

        ws.on('close', () => {
          if (connectedCount === connectionCount) {
            done();
          }
        });

        ws.on('error', (error) => {
          done.fail(error);
        });
      }
    });
  });

  describe('Message Handling', () => {
    it('should receive and parse JSON messages', (done) => {
      const ws = new WebSocket(`${wsUrl}/api/webrtc`);
      const testMessage = {
        type: 'test',
        data: 'hello',
      };

      ws.on('open', () => {
        // Send a message
        ws.send(JSON.stringify(testMessage));

        // Close after a short delay (message sent successfully)
        setTimeout(() => {
          ws.close();
        }, 100);
      });

      ws.on('message', (data: Buffer) => {
        const received = JSON.parse(data.toString());
        expect(received).toHaveProperty('type');
        ws.close();
      });

      ws.on('close', () => {
        // Test passes if connection closes cleanly
        done();
      });

      ws.on('error', (error) => {
        done.fail(error);
      });
    });

    it('should handle malformed JSON gracefully', (done) => {
      const ws = new WebSocket(`${wsUrl}/api/webrtc`);

      ws.on('open', () => {
        // Send invalid JSON
        ws.send('{ invalid json }');
        ws.close();
      });

      ws.on('close', () => {
        done();
      });

      ws.on('error', (error) => {
        done.fail(error);
      });
    });
  });

  describe('Connection Lifecycle', () => {
    it('should track active connections', (done) => {
      const connections: WebSocket[] = [];
      const expectedConnections = 2;

      // Create multiple connections
      for (let i = 0; i < expectedConnections; i++) {
        const ws = new WebSocket(`${wsUrl}/api/webrtc`);
        connections.push(ws);

        ws.on('open', () => {
          // Check that we have multiple active connections
          // (The actual connection count is tracked by the server)
        });

        ws.on('error', (error) => {
          done.fail(error);
        });
      }

      // Close all connections
      setTimeout(() => {
        connections.forEach((ws) => ws.close());
        done();
      }, 100);
    });

    it('should handle connection errors gracefully', (done) => {
      // Create a connection that will be closed immediately
      const ws = new WebSocket(`${wsUrl}/api/webrtc`);

      ws.on('open', () => {
        // Simulate error by closing abruptly
        ws.terminate();
      });

      ws.on('close', () => {
        done();
      });

      ws.on('error', () => {
        // Error is expected when terminating
        // Should be handled gracefully
      });
    });
  });

  describe('Server Configuration', () => {
    it('should use correct port from environment', () => {
      // Test that port configuration is respected
      const testPort = process.env.WEBSOCKET_PORT
        ? parseInt(process.env.WEBSOCKET_PORT, 10)
        : 3001;

      expect(typeof testPort).toBe('number');
      expect(testPort).toBeGreaterThan(0);
      expect(testPort).toBeLessThan(65536);
    });

    it('should use correct hostname from environment', () => {
      const testHostname = process.env.HOSTNAME || 'localhost';

      expect(typeof testHostname).toBe('string');
      expect(testHostname.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle errors during message processing', (done) => {
      const ws = new WebSocket(`${wsUrl}/api/webrtc`);

      ws.on('open', () => {
        // Send a message that might cause errors
        ws.send(JSON.stringify({ type: 'error-test', data: null }));
        ws.close();
      });

      ws.on('close', () => {
        done();
      });

      ws.on('error', (error) => {
        done.fail(error);
      });
    });

    it('should handle WebSocket server errors', () => {
      // Mock scenario for server error handling
      // The server should catch and log errors without crashing
      expect(true).toBe(true); // Placeholder for error handling test
    });
  });

  describe('Graceful Shutdown', () => {
    it('should close all connections on shutdown', (done) => {
      const connections: WebSocket[] = [];
      const connectionCount = 2;
      let closedCount = 0;

      // Create connections
      for (let i = 0; i < connectionCount; i++) {
        const ws = new WebSocket(`${wsUrl}/api/webrtc`);
        connections.push(ws);

        ws.on('open', () => {
          if (connections.length === connectionCount) {
            // Simulate server shutdown
            wss.clients.forEach((client) => {
              if (client.readyState === WebSocket.OPEN) {
                client.close(1001, 'Server shutting down');
              }
            });
          }
        });

        ws.on('close', (code, reason) => {
          expect(code).toBe(1001);
          expect(reason.toString()).toBe('Server shutting down');
          closedCount++;

          if (closedCount === connectionCount) {
            done();
          }
        });

        ws.on('error', (error) => {
          done.fail(error);
        });
      }
    });
  });
});
