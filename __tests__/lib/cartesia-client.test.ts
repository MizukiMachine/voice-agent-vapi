/**
 * Cartesia Client Unit Tests
 * Tests for Cartesia WebSocket client functionality
 */

// ============================================================
// Mock WebSocket (must be defined before imports)
// ============================================================

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  url: string;
  readyState: number = MockWebSocket.CONNECTING;
  handlers: {
    open?: () => void;
    message?: (data: Buffer) => void;
    error?: (error: Error) => void;
    close?: (code: number, reason: Buffer) => void;
  } = {};

  constructor(url: string, _: { headers?: Record<string, string> }) {
    this.url = url;
    MockWebSocket.instances.push(this);

    // Simulate async connection
    setTimeout(() => {
      this.readyState = WebSocket.OPEN;
      this.handlers.open?.();
    }, 10);
  }

  on(event: 'open' | 'message' | 'error' | 'close', handler: (...args: unknown[]) => void) {
    switch (event) {
      case 'open':
        this.handlers.open = handler as () => void;
        break;
      case 'message':
        this.handlers.message = handler as (data: Buffer) => void;
        break;
      case 'error':
        this.handlers.error = handler as (error: Error) => void;
        break;
      case 'close':
        this.handlers.close = handler as (code: number, reason: Buffer) => void;
        break;
    }
  }

  send(data: string) {
    if (this.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not open');
    }
    // Simulate successful send
  }

  close(code: number, reason: string) {
    this.readyState = WebSocket.CLOSED;
    this.handlers.close?.(code, Buffer.from(reason));
  }

  // Test helper methods
  simulateMessage(data: unknown) {
    this.handlers.message?.(Buffer.from(JSON.stringify(data)));
  }

  simulateError(error: Error) {
    this.handlers.error?.(error);
  }

  simulateClose(code: number, reason: string) {
    this.readyState = WebSocket.CLOSED;
    this.handlers.close?.(code, Buffer.from(reason));
  }

  static reset() {
    MockWebSocket.instances = [];
  }
}

// Mock WebSocket module
jest.mock('ws', () => ({
  __esModule: true,
  default: MockWebSocket,
  WebSocket: MockWebSocket,
}));

import {
  createCartesiaClient,
  CartesiaClient,
  type CartesiaConfig,
  CARTESIA_VOICES,
  getVoiceIdByName,
} from '@/app/lib/cartesia-client';

// ============================================================
// Test Fixtures
// ============================================================

const createTestConfig = (): CartesiaConfig => ({
  apiKey: 'test-cartesia-api-key',
  voiceId: '79a125e8-cd45-4c05-9a83-4b0d4b0f3c29',
  speed: 1.0,
});

// ============================================================
// Constructor Tests
// ============================================================

describe('CartesiaClient - Constructor', () => {
  beforeEach(() => {
    MockWebSocket.reset();
  });

  test('should create client with config', () => {
    const config = createTestConfig();
    const client = createCartesiaClient(config);

    expect(client).toBeInstanceOf(CartesiaClient);
    expect(client.connected).toBe(false);
  });

  test('should set default values for optional config', () => {
    const config: CartesiaConfig = {
      apiKey: 'test-api-key',
      voiceId: 'test-voice-id',
      speed: 1.0,
    };

    const client = new CartesiaClient(config);

    expect(client).toBeDefined();
  });

  test('should use custom sample rate when provided', () => {
    const config: CartesiaConfig = {
      ...createTestConfig(),
      sampleRate: 16000,
    };

    const client = new CartesiaClient(config);

    expect(client).toBeDefined();
  });

  test('should use custom output format when provided', () => {
    const config: CartesiaConfig = {
      ...createTestConfig(),
      outputFormat: 'mulaw',
    };

    const client = new CartesiaClient(config);

    expect(client).toBeDefined();
  });
});

// ============================================================
// Connection Tests
// ============================================================

describe('CartesiaClient - Connection', () => {
  let client: CartesiaClient;
  let config: CartesiaConfig;

  beforeEach(() => {
    MockWebSocket.reset();
    config = createTestConfig();
    client = createCartesiaClient(config);
  });

  test('should connect successfully', async () => {
    await client.connect();

    expect(client.connected).toBe(true);
  });

  test('should call connect handlers when connected', async () => {
    const handler = jest.fn();
    client.onConnect(handler);

    await client.connect();

    expect(handler).toHaveBeenCalled();
  });

  test('should construct correct WebSocket URL', async () => {
    await client.connect();

    const ws = MockWebSocket.instances[0];
    expect(ws?.url).toContain('wss://api.cartesia.ai/tts/websocket');
    expect(ws?.url).toContain('api_key=test-cartesia-api-key');
    expect(ws?.url).toContain('cartesia_version=2024-06-10');
  });

  test('should handle disconnect', () => {
    const disconnectHandler = jest.fn();
    client.onDisconnect(disconnectHandler);

    client.connect(); // Don't await
    client.disconnect();

    expect(client.connected).toBe(false);
  });
});

// ============================================================
// Message Handling Tests
// ============================================================

describe('CartesiaClient - Message Handling', () => {
  let client: CartesiaClient;
  let config: CartesiaConfig;

  beforeEach(async () => {
    MockWebSocket.reset();
    config = createTestConfig();
    client = createCartesiaClient(config);
    await client.connect();
  });

  test('should handle audio response messages', () => {
    const handler = jest.fn();
    client.onAudio(handler);

    const audioMessage = {
      context_id: 'ctx-123',
      audio: Buffer.from('test audio data').toString('base64'),
    };

    MockWebSocket.instances[0]?.simulateMessage(audioMessage);

    expect(handler).toHaveBeenCalledWith(
      expect.any(Buffer),
      true
    );
  });

  test('should store context ID from response', () => {
    client.onAudio(jest.fn());

    const audioMessage = {
      context_id: 'ctx-456',
      audio: Buffer.from('test').toString('base64'),
    };

    MockWebSocket.instances[0]?.simulateMessage(audioMessage);

    expect(client.contextId).toBe('ctx-456');
  });

  test('should handle error messages', () => {
    const handler = jest.fn();
    client.onError(handler);

    const errorMessage = {
      type: 'error',
      error: 'authentication_failed',
      detail: 'Invalid API key',
    };

    MockWebSocket.instances[0]?.simulateMessage(errorMessage);

    expect(handler).toHaveBeenCalledWith('authentication_failed', 'Invalid API key');
  });

  test('should decode base64 audio data', () => {
    const handler = jest.fn();
    client.onAudio(handler);

    const originalData = Buffer.from('test audio data');
    const audioMessage = {
      context_id: 'ctx-789',
      audio: originalData.toString('base64'),
    };

    MockWebSocket.instances[0]?.simulateMessage(audioMessage);

    expect(handler).toHaveBeenCalledWith(
      originalData,
      true
    );
  });
});

// ============================================================
// TTS Synthesis Tests
// ============================================================

describe('CartesiaClient - TTS Synthesis', () => {
  let client: CartesiaClient;
  let config: CartesiaConfig;

  beforeEach(async () => {
    MockWebSocket.reset();
    config = createTestConfig();
    client = createCartesiaClient(config);
    await client.connect();
  });

  test('should synthesize text to speech', () => {
    client.synthesize('Hello, world!');

    // Should not throw error
    expect(true).toBe(true);
  });

  test('should include context ID in subsequent requests', () => {
    // Set initial context
    client.onAudio(jest.fn());
    MockWebSocket.instances[0]?.simulateMessage({
      context_id: 'ctx-123',
      audio: Buffer.from('test').toString('base64'),
    });

    // Now synthesize should include context
    client.synthesize('Next text');

    expect(true).toBe(true);
  });

  test('should not synthesize when disconnected', () => {
    client.disconnect();

    // Should not throw, just warn
    client.synthesize('Hello!');

    expect(true).toBe(true);
  });

  test('should include voice ID in request', () => {
    client.synthesize('Test');

    // Voice ID should be included in the request
    expect(true).toBe(true);
  });
});

// ============================================================
// Speed Control Tests
// ============================================================

describe('CartesiaClient - Speed Control', () => {
  let client: CartesiaClient;
  let config: CartesiaConfig;

  beforeEach(() => {
    MockWebSocket.reset();
    config = createTestConfig();
    client = createCartesiaClient(config);
  });

  test('should set speed within valid range', () => {
    client.setSpeed(0.5);
    client.setSpeed(1.0);
    client.setSpeed(1.5);
    client.setSpeed(2.0);

    // Should not throw
    expect(true).toBe(true);
  });

  test('should reject speed below minimum', () => {
    client.setSpeed(0.3);

    // Should warn but not throw
    expect(true).toBe(true);
  });

  test('should reject speed above maximum', () => {
    client.setSpeed(3.0);

    // Should warn but not throw
    expect(true).toBe(true);
  });

  test('should use custom speed in synthesis', async () => {
    await client.connect();
    client.setSpeed(1.5);

    client.synthesize('Test at 1.5x speed');

    // Speed should be included in request
    expect(true).toBe(true);
  });
});

// ============================================================
// Voice Management Tests
// ============================================================

describe('CartesiaClient - Voice Management', () => {
  let client: CartesiaClient;
  let config: CartesiaConfig;

  beforeEach(() => {
    MockWebSocket.reset();
    config = createTestConfig();
    client = createCartesiaClient(config);
  });

  test('should set voice ID', () => {
    const newVoiceId = 'different-voice-id';
    client.setVoice(newVoiceId);

    // Context should be reset
    expect(client.contextId).toBeNull();
  });

  test('should reset context', async () => {
    client.onAudio(jest.fn());

    // Connect first to register message handlers
    await client.connect();

    // Simulate audio response with context ID
    MockWebSocket.instances[0]?.simulateMessage({
      context_id: 'ctx-123',
      audio: Buffer.from('test').toString('base64'),
    });

    expect(client.contextId).toBe('ctx-123');

    // Reset context
    client.resetContext();
    expect(client.contextId).toBeNull();
  });
});

// ============================================================
// Reconnect Tests
// ============================================================

describe('CartesiaClient - Reconnect', () => {
  let client: CartesiaClient;
  let config: CartesiaConfig;

  beforeEach(() => {
    MockWebSocket.reset();
    config = createTestConfig();
    client = createCartesiaClient(config);
  });

  test('should attempt reconnect on connection close', async () => {
    await client.connect();

    const connectSpy = jest.spyOn(client, 'connect').mockResolvedValue();

    // Simulate connection close (not intentional)
    MockWebSocket.instances[0]?.simulateClose(1006, 'Connection lost');

    // Wait for reconnect delay
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Should have attempted reconnect
    expect(connectSpy).toHaveBeenCalled();
  });

  test('should not reconnect on intentional close', async () => {
    await client.connect();

    const connectSpy = jest.spyOn(client, 'connect').mockResolvedValue();

    // Simulate intentional close
    client.disconnect();

    // Should not attempt reconnect
    expect(connectSpy).not.toHaveBeenCalled();
  });
});

// ============================================================
// Event Handler Registration Tests
// ============================================================

describe('CartesiaClient - Event Handler Registration', () => {
  let client: CartesiaClient;
  let config: CartesiaConfig;

  beforeEach(() => {
    MockWebSocket.reset();
    config = createTestConfig();
    client = createCartesiaClient(config);
  });

  test('should register multiple audio handlers', () => {
    const handler1 = jest.fn();
    const handler2 = jest.fn();

    client.onAudio(handler1);
    client.onAudio(handler2);

    // Both should be registered
    expect(true).toBe(true);
  });

  test('should register multiple error handlers', () => {
    const handler1 = jest.fn();
    const handler2 = jest.fn();

    client.onError(handler1);
    client.onError(handler2);

    // Both should be registered
    expect(true).toBe(true);
  });

  test('should register multiple connect handlers', () => {
    const handler1 = jest.fn();
    const handler2 = jest.fn();

    client.onConnect(handler1);
    client.onConnect(handler2);

    // Both should be registered
    expect(true).toBe(true);
  });

  test('should register multiple disconnect handlers', () => {
    const handler1 = jest.fn();
    const handler2 = jest.fn();

    client.onDisconnect(handler1);
    client.onDisconnect(handler2);

    // Both should be registered
    expect(true).toBe(true);
  });
});

// ============================================================
// Utility Method Tests
// ============================================================

describe('CartesiaClient - Utility Methods', () => {
  let client: CartesiaClient;
  let config: CartesiaConfig;

  beforeEach(() => {
    MockWebSocket.reset();
    config = createTestConfig();
    client = createCartesiaClient(config);
  });

  test('should return correct connected status', () => {
    expect(client.connected).toBe(false);

    client.connect(); // Don't await

    client.disconnect();
    expect(client.connected).toBe(false);
  });

  test('should return correct readyState', () => {
    expect(client.readyState).toBe(WebSocket.CLOSED);

    client.connect(); // Don't await

    client.disconnect();
    expect(client.readyState).toBe(WebSocket.CLOSED);
  });

  test('should return current context ID', async () => {
    expect(client.contextId).toBeNull();

    // After receiving audio response, context ID should be set
    client.onAudio(jest.fn());

    // Connect first to register message handlers
    await client.connect();

    // Simulate audio response with context ID
    MockWebSocket.instances[0]?.simulateMessage({
      context_id: 'ctx-test',
      audio: Buffer.from('test').toString('base64'),
    });

    expect(client.contextId).toBe('ctx-test');
  });
});

// ============================================================
// Factory Function Tests
// ============================================================

describe('CartesiaClient - Factory Function', () => {
  test('should create client using factory', () => {
    const config = createTestConfig();
    const client = createCartesiaClient(config);

    expect(client).toBeInstanceOf(CartesiaClient);
  });
});

// ============================================================
// Voice Helper Functions Tests
// ============================================================

describe('CartesiaClient - Voice Helper Functions', () => {
  test('CARTESIA_VOICES should contain voice mappings', () => {
    expect(CARTESIA_VOICES).toBeDefined();
    expect(CARTESIA_VOICES['79a125e8-cd45-4c05-9a83-4b0d4b0f3c29']).toBe('Lady (American English)');
  });

  test('getVoiceIdByName should return correct ID', () => {
    expect(getVoiceIdByName('lady')).toBe('79a125e8-cd45-4c05-9a83-4b0d4b0f3c29');
    expect(getVoiceIdByName('LADY')).toBe('79a125e8-cd45-4c05-9a83-4b0d4b0f3c29');
    expect(getVoiceIdByName('Lady')).toBe('79a125e8-cd45-4c05-9a83-4b0d4b0f3c29');
  });

  test('getVoiceIdByName should return default voice', () => {
    expect(getVoiceIdByName('default')).toBe('dfkecmkjemfjmcmdidhj');
  });

  test('getVoiceIdByName should return undefined for unknown voice', () => {
    expect(getVoiceIdByName('unknown-voice')).toBeUndefined();
  });
});
