/**
 * End-to-End Integration Tests
 *
 * Comprehensive test suite for Issue #35
 * Tests server startup, API routes, WebSocket connections, and voice session flow
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import http from 'http';
import WebSocket from 'ws';

// ============================================================
// Test Configuration
// ============================================================

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';
const WS_URL = process.env.TEST_WS_URL || 'ws://localhost:3001/api/webrtc';
const TEST_TIMEOUT = 30000; // 30 seconds

// ============================================================
// Test Suite
// ============================================================

describe('E2E Integration Tests', () => {
  // ============================================================
  // Phase 1: Server Startup Tests
  // ============================================================

  describe('Phase 1: Server Startup', () => {
    test('1.1 Server is running', async () => {
      const response = await fetch(`${BASE_URL}/api/health`);
      expect(response.ok).toBe(true);
    }, TEST_TIMEOUT);

    test('1.2 Server returns correct status', async () => {
      const response = await fetch(`${BASE_URL}/api/health`);
      const data = await response.json();
      expect(data).toHaveProperty('status', 'ok');
    }, TEST_TIMEOUT);

    test('1.3 CORS headers are set', async () => {
      const response = await fetch(`${BASE_URL}/api/health`);
      expect(response.headers.get('access-control-allow-origin')).toBeTruthy();
    }, TEST_TIMEOUT);
  });

  // ============================================================
  // Phase 2: Page Load Tests
  // ============================================================

  describe('Phase 2: Page Load', () => {
    test('2.1 Home page loads', async () => {
      const response = await fetch(BASE_URL);
      expect(response.ok).toBe(true);
      expect(response.headers.get('content-type')).toContain('text/html');
    }, TEST_TIMEOUT);

    test('2.2 Static assets are accessible', async () => {
      const response = await fetch(`${BASE_URL}/_next/static`);
      expect(response.ok).toBe(true);
    }, TEST_TIMEOUT);
  });

  // ============================================================
  // Phase 3: API Route Tests
  // ============================================================

  describe('Phase 3: API Routes', () => {
    test('3.1 Health check endpoint', async () => {
      const response = await fetch(`${BASE_URL}/api/health`);
      const data = await response.json();
      expect(data).toHaveProperty('status', 'ok');
    }, TEST_TIMEOUT);

    test('3.2 Cockpit users endpoint', async () => {
      const response = await fetch(`${BASE_URL}/api/cockpit/users`);
      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(Array.isArray(data.users)).toBe(true);
    }, TEST_TIMEOUT);

    test('3.3 User enrollment endpoint', async () => {
      const response = await fetch(`${BASE_URL}/api/cockpit/enroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Test User',
          id: `test-${Date.now()}`,
        }),
      });
      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data).toHaveProperty('success', true);
    }, TEST_TIMEOUT);

    test('3.4 Session creation endpoint', async () => {
      const response = await fetch(`${BASE_URL}/api/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'test-user',
        }),
      });
      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data).toHaveProperty('sessionId');
    }, TEST_TIMEOUT);
  });

  // ============================================================
  // Phase 4: WebSocket Connection Tests
  // ============================================================

  describe('Phase 4: WebSocket Connection', () => {
    let ws: WebSocket | null = null;

    afterAll((done) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
      done();
    });

    test('4.1 WebSocket connection is accepted', (done) => {
      ws = new WebSocket(WS_URL);

      ws.on('open', () => {
        expect(ws?.readyState).toBe(WebSocket.OPEN);
        done();
      });

      ws.on('error', (error) => {
        done(error);
      });
    }, TEST_TIMEOUT);

    test('4.2 Welcome message is received', (done) => {
      let messageReceived = false;

      ws = new WebSocket(WS_URL);

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'connected') {
          messageReceived = true;
          expect(message.message).toBe('WebSocket connection established');
          done();
        }
      });

      ws.on('error', (error) => {
        done(error);
      });

      setTimeout(() => {
        if (!messageReceived) {
          done(new Error('No welcome message received'));
        }
      }, 5000);
    }, TEST_TIMEOUT);

    test('4.3 WebSocket handles SDP offer', (done) => {
      ws = new WebSocket(WS_URL);

      ws.on('open', () => {
        ws?.send(JSON.stringify({
          type: 'sdp-answer',
          sdp: 'test-sdp',
        }));
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'sdp-offer') {
          expect(message.sdp).toBeTruthy();
          done();
        }
      });

      ws.on('error', (error) => {
        done(error);
      });
    }, TEST_TIMEOUT);
  });

  // ============================================================
  // Phase 5: Voice Session Flow Tests
  // ============================================================

  describe('Phase 5: Voice Session Flow', () => {
    test('5.1 User enrollment flow', async () => {
      const userId = `test-${Date.now()}`;

      const enrollResponse = await fetch(`${BASE_URL}/api/cockpit/enroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Test User',
          id: userId,
        }),
      });

      expect(enrollResponse.ok).toBe(true);

      const usersResponse = await fetch(`${BASE_URL}/api/cockpit/users`);
      const usersData = await usersResponse.json();
      expect(usersData.users.some((u: any) => u.id === userId)).toBe(true);
    }, TEST_TIMEOUT);

    test('5.2 Session initiation', async () => {
      const response = await fetch(`${BASE_URL}/api/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'test-user',
        }),
      });

      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data.sessionId).toBeTruthy();
    }, TEST_TIMEOUT);
  });

  // ============================================================
  // Phase 6: Error Handling Tests
  // ============================================================

  describe('Phase 6: Error Handling', () => {
    test('6.1 Invalid session ID returns error', async () => {
      const response = await fetch(`${BASE_URL}/api/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: '',
        }),
      });

      expect(response.status).toBeGreaterThanOrEqual(400);
    }, TEST_TIMEOUT);

    test('6.2 Invalid JSON returns error', async () => {
      const response = await fetch(`${BASE_URL}/api/cockpit/enroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid-json',
      });

      expect(response.status).toBeGreaterThanOrEqual(400);
    }, TEST_TIMEOUT);

    test('6.3 WebSocket disconnection handling', (done) => {
      const ws = new WebSocket(WS_URL);

      ws.on('open', () => {
        ws.close();
      });

      ws.on('close', () => {
        expect(ws.readyState).toBe(WebSocket.CLOSED);
        done();
      });

      ws.on('error', (error) => {
        done(error);
      });
    }, TEST_TIMEOUT);
  });

  // ============================================================
  // Phase 7: Integration Tests
  // ============================================================

  describe('Phase 7: Service Integration', () => {
    test('7.1 Supabase integration', async () => {
      const userId = `test-${Date.now()}`;

      const response = await fetch(`${BASE_URL}/api/cockpit/enroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Test User',
          id: userId,
        }),
      });

      expect(response.ok).toBe(true);
    }, TEST_TIMEOUT);
  });

  // ============================================================
  // Phase 8: Performance Tests
  // ============================================================

  describe('Phase 8: Performance', () => {
    test('8.1 API response time < 500ms', async () => {
      const start = Date.now();
      const response = await fetch(`${BASE_URL}/api/health`);
      const duration = Date.now() - start;

      expect(response.ok).toBe(true);
      expect(duration).toBeLessThan(500);
    }, TEST_TIMEOUT);

    test('8.2 Concurrent request handling', async () => {
      const requests = Array.from({ length: 10 }, () =>
        fetch(`${BASE_URL}/api/health`)
      );

      const responses = await Promise.all(requests);
      responses.forEach(response => {
        expect(response.ok).toBe(true);
      });
    }, TEST_TIMEOUT);
  });
});
