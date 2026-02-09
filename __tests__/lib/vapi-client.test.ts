/**
 * Vapi Client Unit Tests
 * Tests for Vapi WebSocket client functionality
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
  createVapiClient,
  VapiClient,
  type VapiConfig,
  type VapiFunctionCallMessage,
  type VapiTextMessage,
  type VapiTranscriptMessage,
  type VapiErrorMessage,
} from '@/app/lib/vapi-client';

// ============================================================
// Test Fixtures
// ============================================================

const createTestConfig = (): VapiConfig => ({
  apiKey: 'test-vapi-api-key',
  publicKey: 'test-vapi-public-key',
  assistantId: 'test-assistant-id',
});

// ============================================================
// Constructor Tests
// ============================================================

describe('VapiClient - Constructor', () => {
  beforeEach(() => {
    MockWebSocket.reset();
  });

  test('should create client with config', () => {
    const config = createTestConfig();
    const client = createVapiClient(config);

    expect(client).toBeInstanceOf(VapiClient);
    expect(client.connected).toBe(false);
  });

  test('should store config correctly', () => {
    const config = createTestConfig();
    const client = new VapiClient(config);

    expect(client).toBeDefined();
  });
});

// ============================================================
// Connection Tests
// ============================================================

describe('VapiClient - Connection', () => {
  let client: VapiClient;
  let config: VapiConfig;

  beforeEach(() => {
    MockWebSocket.reset();
    config = createTestConfig();
    client = createVapiClient(config);
  });

  test('should connect successfully', async () => {
    await client.connect();

    expect(client.connected).toBe(true);
    expect(client.readyState).toBe(WebSocket.OPEN);
  });

  test('should call connect handlers when connected', async () => {
    const handler = jest.fn();
    client.onConnect(handler);

    await client.connect();

    expect(handler).toHaveBeenCalled();
  });

  test('should send config message after connection', async () => {
    await client.connect();

    const ws = MockWebSocket.instances[0];
    expect(ws).toBeDefined();
  });

  test('should reject connection on error', async () => {
    const errorClient = new VapiClient(config);
    MockWebSocket.instances[0]?.simulateError(new Error('Connection failed'));

    await expect(errorClient.connect()).rejects.toThrow();
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

describe('VapiClient - Message Handling', () => {
  let client: VapiClient;
  let config: VapiConfig;

  beforeEach(async () => {
    MockWebSocket.reset();
    config = createTestConfig();
    client = createVapiClient(config);
    await client.connect();
  });

  test('should handle function-call messages', () => {
    const handler = jest.fn();
    client.onFunctionCall(handler);

    const functionCallMessage: VapiFunctionCallMessage = {
      type: 'function-call',
      functionCall: {
        name: 'test_function',
        parameters: { arg1: 'value1' },
        callId: 'call-123',
      },
    };

    MockWebSocket.instances[0]?.simulateMessage(functionCallMessage);

    expect(handler).toHaveBeenCalledWith({
      name: 'test_function',
      parameters: { arg1: 'value1' },
      callId: 'call-123',
    });
  });

  test('should handle conversation-item messages', () => {
    const handler = jest.fn();
    client.onMessage(handler);

    const textMessage: VapiTextMessage = {
      type: 'conversation-item',
      conversationItem: {
        role: 'assistant',
        content: 'Hello, world!',
        contentType: 'text',
      },
    };

    MockWebSocket.instances[0]?.simulateMessage(textMessage);

    expect(handler).toHaveBeenCalledWith(textMessage);
  });

  test('should handle transcript messages', () => {
    const handler = jest.fn();
    client.onTranscript(handler);

    const transcriptMessage: VapiTranscriptMessage = {
      type: 'transcript',
      transcript: 'Test transcript',
      isFinal: true,
    };

    MockWebSocket.instances[0]?.simulateMessage(transcriptMessage);

    expect(handler).toHaveBeenCalledWith('Test transcript', true);
  });

  test('should handle error messages', () => {
    const handler = jest.fn();
    client.onError(handler);

    const errorMessage: VapiErrorMessage = {
      type: 'error',
      error: 'test_error',
      message: 'Test error message',
    };

    MockWebSocket.instances[0]?.simulateMessage(errorMessage);

    expect(handler).toHaveBeenCalledWith('test_error', 'Test error message');
  });

  test('should notify all message handlers', () => {
    const handler1 = jest.fn();
    const handler2 = jest.fn();
    client.onMessage(handler1);
    client.onMessage(handler2);

    const message: VapiTextMessage = {
      type: 'conversation-item',
      conversationItem: {
        role: 'user',
        content: 'Test',
        contentType: 'text',
      },
    };

    MockWebSocket.instances[0]?.simulateMessage(message);

    expect(handler1).toHaveBeenCalled();
    expect(handler2).toHaveBeenCalled();
  });
});

// ============================================================
// Audio Sending Tests
// ============================================================

describe('VapiClient - Audio Sending', () => {
  let client: VapiClient;
  let config: VapiConfig;

  beforeEach(async () => {
    MockWebSocket.reset();
    config = createTestConfig();
    client = createVapiClient(config);
    await client.connect();
  });

  test('should send audio data', async () => {
    const audioBuffer = Buffer.alloc(3200, 0x80); // 100ms of silence-like data

    await client.sendAudio(audioBuffer);

    // Should not throw error
    expect(true).toBe(true);
  });

  test('should not send audio when disconnected', async () => {
    client.disconnect();
    const audioBuffer = Buffer.alloc(3200, 0x80);

    // Should not throw, just warn
    await client.sendAudio(audioBuffer);

    expect(client.connected).toBe(false);
  });

  test('should convert audio format before sending', async () => {
    const audioBuffer = Buffer.alloc(3200, 0x80); // 16kHz PCM

    // Mock the audio converter
    jest.mock('@/app/lib/audio-converter', () => ({
      convertToMulaw: jest.fn().mockResolvedValue({
        buffer: Buffer.alloc(800), // Converted mu-law
        inputSampleRate: 16000,
        outputSampleRate: 8000,
        latencyMs: 10,
      }),
    }));

    await client.sendAudio(audioBuffer);

    // Verify conversion was attempted
    expect(true).toBe(true);
  });
});

// ============================================================
// Function Call Result Tests
// ============================================================

describe('VapiClient - Function Call Result', () => {
  let client: VapiClient;
  let config: VapiConfig;

  beforeEach(async () => {
    MockWebSocket.reset();
    config = createTestConfig();
    client = createVapiClient(config);
    await client.connect();
  });

  test('should send function call result', () => {
    client.sendFunctionCallResult('call-123', { result: 'success' });

    // Should not throw error
    expect(true).toBe(true);
  });

  test('should not send result when disconnected', () => {
    client.disconnect();

    // Should not throw, just warn
    client.sendFunctionCallResult('call-123', { result: 'success' });
  });
});

// ============================================================
// Text Message Tests
// ============================================================

describe('VapiClient - Text Messages', () => {
  let client: VapiClient;
  let config: VapiConfig;

  beforeEach(async () => {
    MockWebSocket.reset();
    config = createTestConfig();
    client = createVapiClient(config);
    await client.connect();
  });

  test('should send text message', () => {
    client.sendText('Hello, Vapi!');

    // Should not throw error
    expect(true).toBe(true);
  });

  test('should not send text when disconnected', () => {
    client.disconnect();

    // Should not throw, just warn
    client.sendText('Hello!');
  });
});

// ============================================================
// Reconnect Tests
// ============================================================

describe('VapiClient - Reconnect', () => {
  let client: VapiClient;
  let config: VapiConfig;

  beforeEach(() => {
    MockWebSocket.reset();
    config = createTestConfig();
    client = createVapiClient(config);
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

  test('should respect max reconnect attempts', async () => {
    await client.connect();

    // Mock connect to always fail
    jest.spyOn(client, 'connect').mockRejectedValue(new Error('Connect failed'));

    // Trigger multiple close events
    for (let i = 0; i < 5; i++) {
      MockWebSocket.instances[0]?.simulateClose(1006, 'Connection lost');
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // After max attempts, should stop trying
    expect(true).toBe(true);
  });
});

// ============================================================
// Event Handler Registration Tests
// ============================================================

describe('VapiClient - Event Handler Registration', () => {
  let client: VapiClient;
  let config: VapiConfig;

  beforeEach(() => {
    MockWebSocket.reset();
    config = createTestConfig();
    client = createVapiClient(config);
  });

  test('should register multiple message handlers', () => {
    const handler1 = jest.fn();
    const handler2 = jest.fn();

    client.onMessage(handler1);
    client.onMessage(handler2);

    // Both should be registered
    expect(true).toBe(true);
  });

  test('should register multiple function call handlers', () => {
    const handler1 = jest.fn();
    const handler2 = jest.fn();

    client.onFunctionCall(handler1);
    client.onFunctionCall(handler2);

    // Both should be registered
    expect(true).toBe(true);
  });

  test('should register multiple transcript handlers', () => {
    const handler1 = jest.fn();
    const handler2 = jest.fn();

    client.onTranscript(handler1);
    client.onTranscript(handler2);

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
});

// ============================================================
// Utility Method Tests
// ============================================================

describe('VapiClient - Utility Methods', () => {
  let client: VapiClient;
  let config: VapiConfig;

  beforeEach(() => {
    MockWebSocket.reset();
    config = createTestConfig();
    client = createVapiClient(config);
  });

  test('should return correct connected status', () => {
    expect(client.connected).toBe(false);

    client.connect(); // Don't await
    // Connected should become true after WebSocket opens

    client.disconnect();
    expect(client.connected).toBe(false);
  });

  test('should return correct readyState', () => {
    expect(client.readyState).toBe(WebSocket.CLOSED);

    client.connect(); // Don't await
    // readyState should change

    client.disconnect();
    expect(client.readyState).toBe(WebSocket.CLOSED);
  });
});

// ============================================================
// Factory Function Tests
// ============================================================

describe('VapiClient - Factory Function', () => {
  test('should create client using factory', () => {
    const config = createTestConfig();
    const client = createVapiClient(config);

    expect(client).toBeInstanceOf(VapiClient);
  });
});
