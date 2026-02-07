/**
 * Audio Gateway
 * Handles bidirectional audio routing between Client, Vapi, and Cartesia
 *
 * Architecture:
 *   Client (WebRTC) ↔ [Audio Gateway] ↔ Vapi (WebSocket, STT+LLM)
 *                                             ↓ (text response)
 *                                            Cartesia (WebSocket, TTS)
 *
 * This module orchestrates the entire audio pipeline:
 * 1. Client audio → Vapi (for STT + LLM processing)
 * 2. Vapi text response → Cartesia (for TTS synthesis)
 * 3. Cartesia audio → Client (playback)
 */

import { createServiceLogger } from './logger';
import { createVapiClient, type VapiClient } from './vapi-client';
import { createCartesiaClient, type CartesiaClient } from './cartesia-client';
import {
  getWebRTCSession,
  closeWebRTCSession,
  updateSessionStatus,
} from './webrtc-session-manager';
import type { VapiConfig, CartesiaConfig } from './types';

const logger = createServiceLogger('audio-gateway');

// ============================================================
// Types
// ============================================================

export interface GatewayConfig {
  sessionId: string;
  vapiConfig: VapiConfig;
  cartesiaConfig: CartesiaConfig;
}

export interface GatewaySession {
  sessionId: string;
  vapiClient: VapiClient;
  cartesiaClient: CartesiaClient;
  isActive: boolean;
  createdAt: number;
}

// ============================================================
// Gateway Session Store
// ============================================================

class GatewayStore {
  private sessions = new Map<string, GatewaySession>();

  create(config: GatewayConfig): GatewaySession {
    const vapiClient = createVapiClient(config.vapiConfig);
    const cartesiaClient = createCartesiaClient(config.cartesiaConfig);

    const session: GatewaySession = {
      sessionId: config.sessionId,
      vapiClient,
      cartesiaClient,
      isActive: true,
      createdAt: Date.now(),
    };

    this.sessions.set(config.sessionId, session);
    logger.info('Gateway session created', { sessionId: config.sessionId });

    // Setup audio pipeline
    this.setupAudioPipeline(session);

    return session;
  }

  get(sessionId: string): GatewaySession | undefined {
    return this.sessions.get(sessionId);
  }

  close(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    // Disconnect clients
    session.vapiClient.disconnect();
    session.cartesiaClient.disconnect();

    // Remove session
    this.sessions.delete(sessionId);
    logger.info('Gateway session closed', { sessionId });

    return true;
  }

  /**
   * Setup the audio pipeline for a session
   * Connects Vapi and Cartesia events
   */
  private setupAudioPipeline(session: GatewaySession): void {
    const { vapiClient, cartesiaClient, sessionId } = session;

    // When Vapi sends text response, forward to Cartesia for TTS
    vapiClient.onMessage((message) => {
      if (message.type === 'conversation-item') {
        const textMessage = message as { type: string; conversationItem: { role: string; content: string } };
        if (textMessage.conversationItem.role === 'assistant') {
          const text = textMessage.conversationItem.content;
          if (text && text.trim().length > 0) {
            logger.debug('Vapi text → Cartesia TTS', {
              sessionId,
              text: text.substring(0, 50),
            });
            cartesiaClient.synthesize(text);
          }
        }
      }
    });

    // When Vapi sends function call, notify for external routing
    vapiClient.onFunctionCall((call) => {
      logger.info('Vapi function call received', {
        sessionId,
        name: call.name,
        callId: call.callId,
      });
      // This will be handled by the WebSocket endpoint
      this.emitFunctionCall(sessionId, call);
    });

    // When Cartesia sends audio, notify for client forwarding
    cartesiaClient.onAudio((audioData, isFinal) => {
      logger.debug('Cartesia audio → Client', {
        sessionId,
        bytes: audioData.length,
        isFinal,
      });
      this.emitAudio(sessionId, audioData, isFinal);
    });

    // Error handling
    vapiClient.onError((error, message) => {
      logger.error('Vapi error', { sessionId, error, message });
      this.emitError(sessionId, 'vapi_error', error);
    });

    cartesiaClient.onError((error, detail) => {
      logger.error('Cartesia error', { sessionId, error, detail });
      this.emitError(sessionId, 'cartesia_error', error);
    });
  }

  /**
   * Emit function call event (to be handled by WebSocket route)
   */
  private emitFunctionCall(
    sessionId: string,
    call: { name: string; parameters: Record<string, unknown>; callId: string }
  ): void {
    // In production, this would emit to a WebSocket connection or event emitter
    // For now, we'll use a simple callback registry
    const callbacks = functionCallCallbacks.get(sessionId);
    if (callbacks) {
      callbacks.forEach((callback) => callback(call));
    }
  }

  /**
   * Emit audio event (to be handled by WebSocket route)
   */
  private emitAudio(sessionId: string, audioData: Buffer, isFinal: boolean): void {
    const callbacks = audioCallbacks.get(sessionId);
    if (callbacks) {
      callbacks.forEach((callback) => callback(audioData, isFinal));
    }
  }

  /**
   * Emit error event
   */
  private emitError(sessionId: string, type: string, error: string): void {
    const callbacks = errorCallbacks.get(sessionId);
    if (callbacks) {
      callbacks.forEach((callback) => callback(type, error));
    }
  }
}

// Callback registries for event forwarding
const functionCallCallbacks = new Map<string, Set<(call: { name: string; parameters: Record<string, unknown>; callId: string }) => void>>();
const audioCallbacks = new Map<string, Set<(audio: Buffer, isFinal: boolean) => void>>();
const errorCallbacks = new Map<string, Set<(type: string, error: string) => void>>();

export const gatewayStore = new GatewayStore();

// ============================================================
// Public API
// ============================================================

/**
 * Start an audio gateway session
 */
export async function startAudioGateway(config: GatewayConfig): Promise<GatewaySession> {
  logger.info('Starting audio gateway', { sessionId: config.sessionId });

  // Create gateway session
  const session = gatewayStore.create(config);

  // Connect Vapi
  await session.vapiClient.connect();

  // Connect Cartesia
  await session.cartesiaClient.connect();

  // Update session status
  updateSessionStatus(config.sessionId, 'connected');

  logger.info('Audio gateway started', { sessionId: config.sessionId });

  return session;
}

/**
 * Stop an audio gateway session
 */
export function stopAudioGateway(sessionId: string): boolean {
  logger.info('Stopping audio gateway', { sessionId });

  // Close gateway session
  const closed = gatewayStore.close(sessionId);

  // Update session status
  if (closed) {
    updateSessionStatus(sessionId, 'disconnected');
    closeWebRTCSession(sessionId);

    // Clear callbacks
    functionCallCallbacks.delete(sessionId);
    audioCallbacks.delete(sessionId);
    errorCallbacks.delete(sessionId);
  }

  return closed;
}

/**
 * Send audio from client to Vapi
 */
export function sendClientAudio(sessionId: string, audioData: Buffer): void {
  const session = gatewayStore.get(sessionId);
  if (!session) {
    logger.warn('Cannot send audio: session not found', { sessionId });
    return;
  }

  session.vapiClient.sendAudio(audioData);
}

/**
 * Send function call result back to Vapi
 */
export function sendFunctionCallResult(
  sessionId: string,
  callId: string,
  result: unknown
): void {
  const session = gatewayStore.get(sessionId);
  if (!session) {
    logger.warn('Cannot send function result: session not found', { sessionId });
    return;
  }

  session.vapiClient.sendFunctionCallResult(callId, result);
}

/**
 * Send text message to Vapi
 */
export function sendTextMessage(sessionId: string, text: string): void {
  const session = gatewayStore.get(sessionId);
  if (!session) {
    logger.warn('Cannot send text: session not found', { sessionId });
    return;
  }

  session.vapiClient.sendText(text);
}

// ============================================================
// Event Registration (for WebSocket route)
// ============================================================

export function onFunctionCall(
  sessionId: string,
  callback: (call: { name: string; parameters: Record<string, unknown>; callId: string }) => void
): void {
  if (!functionCallCallbacks.has(sessionId)) {
    functionCallCallbacks.set(sessionId, new Set());
  }
  functionCallCallbacks.get(sessionId)!.add(callback);
}

export function onAudio(
  sessionId: string,
  callback: (audio: Buffer, isFinal: boolean) => void
): void {
  if (!audioCallbacks.has(sessionId)) {
    audioCallbacks.set(sessionId, new Set());
  }
  audioCallbacks.get(sessionId)!.add(callback);
}

export function onError(
  sessionId: string,
  callback: (type: string, error: string) => void
): void {
  if (!errorCallbacks.has(sessionId)) {
    errorCallbacks.set(sessionId, new Set());
  }
  errorCallbacks.get(sessionId)!.add(callback);
}

export function unregisterCallbacks(sessionId: string): void {
  functionCallCallbacks.delete(sessionId);
  audioCallbacks.delete(sessionId);
  errorCallbacks.delete(sessionId);
}

// ============================================================
// Re-exports
// ============================================================

export type { GatewayConfig, GatewaySession };
