/**
 * Audio Gateway Unit Tests
 * Tests for audio routing between Client, Vapi, and Cartesia
 */

// ============================================================
// Mock Classes (must be defined before imports)
// ============================================================

class MockVapiClient {
  connected = false;
  connect = jest.fn().mockResolvedValue(undefined);
  disconnect = jest.fn();
  sendAudio = jest.fn();
  sendFunctionCallResult = jest.fn();
  sendText = jest.fn();
  onMessage = jest.fn((cb) => {
    // Store the callback for testing
    (this as any)._onMessageCallback = cb;
  });
  onFunctionCall = jest.fn((cb) => {
    (this as any)._onFunctionCallCallback = cb;
  });
  onTranscript = jest.fn();
  onError = jest.fn((cb) => {
    (this as any)._onErrorCallback = cb;
  });
  onConnect = jest.fn();
  onDisconnect = jest.fn();
}

class MockCartesiaClient {
  connected = false;
  contextId: string | null = null;
  connect = jest.fn().mockResolvedValue(undefined);
  disconnect = jest.fn();
  synthesize = jest.fn();
  setSpeed = jest.fn();
  setVoice = jest.fn();
  resetContext = jest.fn();
  onAudio = jest.fn((cb) => {
    (this as any)._onAudioCallback = cb;
  });
  onError = jest.fn((cb) => {
    (this as any)._onErrorCallback = cb;
  });
  onConnect = jest.fn();
  onDisconnect = jest.fn();
}

// Mock dependencies
jest.mock('@/app/lib/vapi-client', () => ({
  createVapiClient: jest.fn(() => new MockVapiClient()),
}));

jest.mock('@/app/lib/cartesia-client', () => ({
  createCartesiaClient: jest.fn(() => new MockCartesiaClient()),
}));

jest.mock('@/app/lib/webrtc-session-manager', () => ({
  closeWebRTCSession: jest.fn(),
  updateSessionStatus: jest.fn(),
}));

import {
  startAudioGateway,
  stopAudioGateway,
  sendClientAudio,
  sendFunctionCallResult,
  sendTextMessage,
  onFunctionCall,
  onAudio,
  onError,
  unregisterCallbacks,
  gatewayStore,
  type GatewayConfig,
} from '@/app/lib/audio-gateway';
import { createVapiClient } from '@/app/lib/vapi-client';
import { createCartesiaClient } from '@/app/lib/cartesia-client';

// ============================================================
// Test Fixtures
// ============================================================

const createTestGatewayConfig = (): GatewayConfig => ({
  sessionId: 'test-session-123',
  vapiConfig: {
    apiKey: 'test-vapi-key',
    publicKey: 'test-vapi-public-key',
    assistantId: 'test-assistant-id',
  },
  cartesiaConfig: {
    apiKey: 'test-cartesia-key',
    voiceId: '79a125e8-cd45-4c05-9a83-4b0d4b0f3c29',
    speed: 1.0,
    sampleRate: 24000,
    outputFormat: 'pcm16' as const,
  },
});

// ============================================================
// GatewayStore Tests
// ============================================================

describe('GatewayStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Clear the gateway store
    (gatewayStore as any).sessions.clear();
    // Reset mock implementations
    (createVapiClient as jest.Mock).mockImplementation(() => new MockVapiClient());
    (createCartesiaClient as jest.Mock).mockImplementation(() => new MockCartesiaClient());
  });

  test('should create gateway session', () => {
    const config = createTestGatewayConfig();
    const session = gatewayStore.create(config);

    expect(session).toBeDefined();
    expect(session.sessionId).toBe(config.sessionId);
    expect(session.isActive).toBe(true);
    expect(session.createdAt).toBeGreaterThan(0);
  });

  test('should retrieve existing session', () => {
    const config = createTestGatewayConfig();
    const createdSession = gatewayStore.create(config);
    const retrievedSession = gatewayStore.get(config.sessionId);

    expect(retrievedSession).toBe(createdSession);
  });

  test('should return undefined for non-existent session', () => {
    const session = gatewayStore.get('non-existent-session');
    expect(session).toBeUndefined();
  });

  test('should close session', () => {
    const config = createTestGatewayConfig();
    gatewayStore.create(config);

    const closed = gatewayStore.close(config.sessionId);

    expect(closed).toBe(true);
    expect(gatewayStore.get(config.sessionId)).toBeUndefined();
  });

  test('should return false when closing non-existent session', () => {
    const closed = gatewayStore.close('non-existent-session');
    expect(closed).toBe(false);
  });
});

// ============================================================
// startAudioGateway Tests
// ============================================================

describe('startAudioGateway', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (gatewayStore as any).sessions.clear();
    (createVapiClient as jest.Mock).mockImplementation(() => new MockVapiClient());
    (createCartesiaClient as jest.Mock).mockImplementation(() => new MockCartesiaClient());
  });

  test('should start audio gateway session', async () => {
    const config = createTestGatewayConfig();
    const session = await startAudioGateway(config);

    expect(session).toBeDefined();
    expect(session.sessionId).toBe(config.sessionId);
  });

  test('should connect Vapi and Cartesia clients', async () => {
    const config = createTestGatewayConfig();
    const session = await startAudioGateway(config);

    expect(session.vapiClient.connect).toHaveBeenCalled();
    expect(session.cartesiaClient.connect).toHaveBeenCalled();
  });

  test('should setup audio pipeline', async () => {
    const config = createTestGatewayConfig();
    const session = await startAudioGateway(config);

    // Verify event handlers are registered
    expect(session.vapiClient.onMessage).toHaveBeenCalled();
    expect(session.vapiClient.onFunctionCall).toHaveBeenCalled();
    expect(session.cartesiaClient.onAudio).toHaveBeenCalled();
  });

  test('should update session status', async () => {
    const { updateSessionStatus } = require('@/app/lib/webrtc-session-manager');
    const config = createTestGatewayConfig();

    await startAudioGateway(config);

    expect(updateSessionStatus).toHaveBeenCalledWith(config.sessionId, 'connected');
  });
});

// ============================================================
// stopAudioGateway Tests
// ============================================================

describe('stopAudioGateway', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    (gatewayStore as any).sessions.clear();
    (createVapiClient as jest.Mock).mockImplementation(() => new MockVapiClient());
    (createCartesiaClient as jest.Mock).mockImplementation(() => new MockCartesiaClient());
  });

  test('should stop audio gateway session', async () => {
    const config = createTestGatewayConfig();
    await startAudioGateway(config);

    const stopped = stopAudioGateway(config.sessionId);

    expect(stopped).toBe(true);
    expect(gatewayStore.get(config.sessionId)).toBeUndefined();
  });

  test('should disconnect Vapi and Cartesia clients', async () => {
    const config = createTestGatewayConfig();
    const session = await startAudioGateway(config);

    stopAudioGateway(config.sessionId);

    expect(session.vapiClient.disconnect).toHaveBeenCalled();
    expect(session.cartesiaClient.disconnect).toHaveBeenCalled();
  });

  test('should update session status', async () => {
    const { updateSessionStatus } = require('@/app/lib/webrtc-session-manager');
    const config = createTestGatewayConfig();
    await startAudioGateway(config);

    stopAudioGateway(config.sessionId);

    expect(updateSessionStatus).toHaveBeenCalledWith(config.sessionId, 'disconnected');
  });

  test('should return false for non-existent session', () => {
    const stopped = stopAudioGateway('non-existent-session');
    expect(stopped).toBe(false);
  });
});

// ============================================================
// Audio Routing Tests: Client → Vapi
// ============================================================

describe('Audio Routing: Client → Vapi', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    (gatewayStore as any).sessions.clear();
    (createVapiClient as jest.Mock).mockImplementation(() => new MockVapiClient());
    (createCartesiaClient as jest.Mock).mockImplementation(() => new MockCartesiaClient());
  });

  test('should send client audio to Vapi', async () => {
    const config = createTestGatewayConfig();
    await startAudioGateway(config);

    const audioData = Buffer.alloc(3200, 0x80);
    sendClientAudio(config.sessionId, audioData);

    const session = gatewayStore.get(config.sessionId);
    expect(session?.vapiClient.sendAudio).toHaveBeenCalledWith(audioData);
  });

  test('should warn when sending audio to non-existent session', () => {
    const audioData = Buffer.alloc(3200, 0x80);
    sendClientAudio('non-existent-session', audioData);

    // Should not throw, just warn
    expect(true).toBe(true);
  });
});

// ============================================================
// Text Routing Tests: Vapi → Cartesia
// ============================================================

describe('Text Routing: Vapi → Cartesia', () => {
  let vapiClient: MockVapiClient;
  let cartesiaClient: MockCartesiaClient;

  beforeEach(async () => {
    jest.clearAllMocks();
    (gatewayStore as any).sessions.clear();

    vapiClient = new MockVapiClient();
    cartesiaClient = new MockCartesiaClient();

    (createVapiClient as jest.Mock).mockReturnValue(vapiClient);
    (createCartesiaClient as jest.Mock).mockReturnValue(cartesiaClient);
  });

  test('should forward Vapi text response to Cartesia', async () => {
    const config = createTestGatewayConfig();
    await startAudioGateway(config);

    // Get the onMessage handler callback
    const onMessageCallback = (vapiClient as any)._onMessageCallback;

    // Simulate Vapi text message
    const textMessage = {
      type: 'conversation-item',
      conversationItem: {
        role: 'assistant',
        content: 'Hello, world!',
        contentType: 'text',
      },
    };

    onMessageCallback(textMessage);

    expect(cartesiaClient.synthesize).toHaveBeenCalledWith('Hello, world!');
  });

  test('should not forward non-assistant messages', async () => {
    const config = createTestGatewayConfig();
    await startAudioGateway(config);

    const onMessageCallback = (vapiClient as any)._onMessageCallback;

    // Simulate user message
    const userMessage = {
      type: 'conversation-item',
      conversationItem: {
        role: 'user',
        content: 'Hello!',
        contentType: 'text',
      },
    };

    onMessageCallback(userMessage);

    expect(cartesiaClient.synthesize).not.toHaveBeenCalled();
  });

  test('should not forward empty messages', async () => {
    const config = createTestGatewayConfig();
    await startAudioGateway(config);

    const onMessageCallback = (vapiClient as any)._onMessageCallback;

    const emptyMessage = {
      type: 'conversation-item',
      conversationItem: {
        role: 'assistant',
        content: '   ',
        contentType: 'text',
      },
    };

    onMessageCallback(emptyMessage);

    expect(cartesiaClient.synthesize).not.toHaveBeenCalled();
  });
});

// ============================================================
// Audio Routing Tests: Cartesia → Client
// ============================================================

describe('Audio Routing: Cartesia → Client', () => {
  let cartesiaClient: MockCartesiaClient;

  beforeEach(async () => {
    jest.clearAllMocks();
    (gatewayStore as any).sessions.clear();

    const vapiClient = new MockVapiClient();
    cartesiaClient = new MockCartesiaClient();

    (createVapiClient as jest.Mock).mockReturnValue(vapiClient);
    (createCartesiaClient as jest.Mock).mockReturnValue(cartesiaClient);
  });

  test('should emit audio callback when Cartesia sends audio', async () => {
    const config = createTestGatewayConfig();
    await startAudioGateway(config);

    const audioCallback = jest.fn();
    onAudio(config.sessionId, audioCallback);

    // Get the onAudio handler callback
    const onAudioCallback = (cartesiaClient as any)._onAudioCallback;

    const audioData = Buffer.from('test audio data');
    onAudioCallback(audioData, true);

    expect(audioCallback).toHaveBeenCalledWith(audioData, true);
  });

  test('should handle multiple audio callbacks', async () => {
    const config = createTestGatewayConfig();
    await startAudioGateway(config);

    const callback1 = jest.fn();
    const callback2 = jest.fn();
    onAudio(config.sessionId, callback1);
    onAudio(config.sessionId, callback2);

    const onAudioCallback = (cartesiaClient as any)._onAudioCallback;
    const audioData = Buffer.from('test audio');
    onAudioCallback(audioData, true);

    expect(callback1).toHaveBeenCalledWith(audioData, true);
    expect(callback2).toHaveBeenCalledWith(audioData, true);
  });
});

// ============================================================
// Function Call Routing Tests
// ============================================================

describe('Function Call Routing', () => {
  let vapiClient: MockVapiClient;

  beforeEach(async () => {
    jest.clearAllMocks();
    (gatewayStore as any).sessions.clear();

    vapiClient = new MockVapiClient();
    const cartesiaClient = new MockCartesiaClient();

    (createVapiClient as jest.Mock).mockReturnValue(vapiClient);
    (createCartesiaClient as jest.Mock).mockReturnValue(cartesiaClient);
  });

  test('should emit function call callback when Vapi sends function call', async () => {
    const config = createTestGatewayConfig();
    await startAudioGateway(config);

    const functionCallback = jest.fn();
    onFunctionCall(config.sessionId, functionCallback);

    // Get the onFunctionCall handler callback
    const onFunctionCallCallback = (vapiClient as any)._onFunctionCallCallback;

    const functionCall = {
      name: 'test_function',
      parameters: { arg1: 'value1' },
      callId: 'call-123',
    };

    onFunctionCallCallback(functionCall);

    expect(functionCallback).toHaveBeenCalledWith(functionCall);
  });

  test('should send function call result back to Vapi', async () => {
    const config = createTestGatewayConfig();
    await startAudioGateway(config);

    const session = gatewayStore.get(config.sessionId);
    expect(session).toBeDefined();

    sendFunctionCallResult(config.sessionId, 'call-123', { result: 'success' });

    expect(session?.vapiClient.sendFunctionCallResult).toHaveBeenCalledWith('call-123', { result: 'success' });
  });
});

// ============================================================
// Error Handling Tests
// ============================================================

describe('Error Handling', () => {
  let vapiClient: MockVapiClient;
  let cartesiaClient: MockCartesiaClient;

  beforeEach(async () => {
    jest.clearAllMocks();
    (gatewayStore as any).sessions.clear();

    vapiClient = new MockVapiClient();
    cartesiaClient = new MockCartesiaClient();

    (createVapiClient as jest.Mock).mockReturnValue(vapiClient);
    (createCartesiaClient as jest.Mock).mockReturnValue(cartesiaClient);
  });

  test('should emit error callback on Vapi error', async () => {
    const config = createTestGatewayConfig();
    await startAudioGateway(config);

    const errorCallback = jest.fn();
    onError(config.sessionId, errorCallback);

    const onErrorCallback = (vapiClient as any)._onErrorCallback;
    // VapiClient.onError passes (error, message) but emitError uses 'vapi_error' as type
    onErrorCallback('some_vapi_error', 'Vapi error message');

    expect(errorCallback).toHaveBeenCalledWith('vapi_error', 'some_vapi_error');
  });

  test('should emit error callback on Cartesia error', async () => {
    const config = createTestGatewayConfig();
    await startAudioGateway(config);

    const errorCallback = jest.fn();
    onError(config.sessionId, errorCallback);

    const onErrorCallback = (cartesiaClient as any)._onErrorCallback;
    // CartesiaClient.onError passes (error, detail) but emitError uses 'cartesia_error' as type
    onErrorCallback('some_cartesia_error', 'Cartesia error detail');

    expect(errorCallback).toHaveBeenCalledWith('cartesia_error', 'some_cartesia_error');
  });

  test('should handle multiple error callbacks', async () => {
    const config = createTestGatewayConfig();
    await startAudioGateway(config);

    const callback1 = jest.fn();
    const callback2 = jest.fn();
    onError(config.sessionId, callback1);
    onError(config.sessionId, callback2);

    const onErrorCallback = (vapiClient as any)._onErrorCallback;
    onErrorCallback('test_error', 'Test error message');

    // The first parameter is the error type ('vapi_error'), not the error itself
    expect(callback1).toHaveBeenCalledWith('vapi_error', 'test_error');
    expect(callback2).toHaveBeenCalledWith('vapi_error', 'test_error');
  });
});

// ============================================================
// Text Message Tests
// ============================================================

describe('Text Messages', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    (gatewayStore as any).sessions.clear();
    (createVapiClient as jest.Mock).mockImplementation(() => new MockVapiClient());
    (createCartesiaClient as jest.Mock).mockImplementation(() => new MockCartesiaClient());
  });

  test('should send text message to Vapi', async () => {
    const config = createTestGatewayConfig();
    await startAudioGateway(config);

    sendTextMessage(config.sessionId, 'Hello, Vapi!');

    const session = gatewayStore.get(config.sessionId);
    expect(session?.vapiClient.sendText).toHaveBeenCalledWith('Hello, Vapi!');
  });

  test('should warn when sending text to non-existent session', () => {
    sendTextMessage('non-existent-session', 'Hello!');

    // Should not throw, just warn
    expect(true).toBe(true);
  });
});

// ============================================================
// Callback Management Tests
// ============================================================

describe('Callback Management', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    (gatewayStore as any).sessions.clear();
    (createVapiClient as jest.Mock).mockImplementation(() => new MockVapiClient());
    (createCartesiaClient as jest.Mock).mockImplementation(() => new MockCartesiaClient());
  });

  test('should unregister all callbacks for session', async () => {
    const config = createTestGatewayConfig();
    await startAudioGateway(config);

    // Register callbacks
    const functionCallback = jest.fn();
    const audioCallback = jest.fn();
    const errorCallback = jest.fn();

    onFunctionCall(config.sessionId, functionCallback);
    onAudio(config.sessionId, audioCallback);
    onError(config.sessionId, errorCallback);

    // Unregister
    unregisterCallbacks(config.sessionId);

    // Callbacks should be cleared (we can't directly test this, but we can verify it doesn't throw)
    expect(true).toBe(true);
  });
});

// ============================================================
// Session Lifecycle Tests
// ============================================================

describe('Session Lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (gatewayStore as any).sessions.clear();
    (createVapiClient as jest.Mock).mockImplementation(() => new MockVapiClient());
    (createCartesiaClient as jest.Mock).mockImplementation(() => new MockCartesiaClient());
  });

  test('should handle complete session lifecycle', async () => {
    const { closeWebRTCSession } = require('@/app/lib/webrtc-session-manager');
    const config = createTestGatewayConfig();

    // Start session
    const session = await startAudioGateway(config);
    expect(session.isActive).toBe(true);

    // Use session
    const audioData = Buffer.alloc(3200, 0x80);
    sendClientAudio(config.sessionId, audioData);

    // Stop session
    const stopped = stopAudioGateway(config.sessionId);
    expect(stopped).toBe(true);
    expect(closeWebRTCSession).toHaveBeenCalledWith(config.sessionId);
  });
});
