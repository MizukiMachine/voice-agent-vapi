/**
 * WebSocket Endpoint for WebRTC Signaling and Audio Streaming
 *
 * This endpoint handles:
 * 1. WebRTC signaling (SDP exchange, ICE candidates)
 * 2. Audio streaming from client to server
 * 3. Audio streaming from server to client
 * 4. Function call routing to /api/tools/*
 *
 * Message Types (Client → Server):
 * - { type: 'sdp-answer', sdp: string }
 * - { type: 'ice-candidate', candidate: RTCIceCandidateInit }
 * - { type: 'audio', data: string (base64) }
 * - { type: 'function-result', callId: string, result: any }
 *
 * Message Types (Server → Client):
 * - { type: 'sdp-offer', sdp: string }
 * - { type: 'ice-candidate', candidate: RTCIceCandidateInit }
 * - { type: 'audio', data: string (base64) }
 * - { type: 'function-call', name: string, parameters: any, callId: string }
 * - { type: 'error', error: string }
 */

import { NextRequest } from 'next/server';
import { createServiceLogger } from '@/app/lib/logger';
import {
  updateSessionStatus,
  closeWebRTCSession,
  createPeerConnection,
  getPeerConnection,
  createDefaultIceServers,
} from '@/app/lib/webrtc-session-manager';
import {
  startAudioGateway,
  stopAudioGateway,
  sendClientAudio,
  sendFunctionCallResult,
  onFunctionCall,
  onAudio,
  onError,
  unregisterCallbacks,
} from '@/app/lib/audio-gateway';
import { VapiConfig, CartesiaConfig } from '@/app/types';
import { type RTCIceCandidateInit } from 'werift';
import WebSocket from 'ws';

const logger = createServiceLogger('webrtc-websocket');

// Ensure WebSocket upgrade
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Upgrade HTTP to WebSocket
 */
export async function GET(request: NextRequest) {
  // Next.js App Router doesn't directly support WebSocket upgrades
  // We need to return a special response to indicate WebSocket upgrade
  // In production, use a custom server or API route handler

  logger.info('WebSocket connection requested');

  return new Response(
    JSON.stringify({
      error: 'websocket_not_supported',
      message: 'WebSocket endpoint requires custom server configuration',
    }),
    {
      status: 426, // Upgrade Required
      headers: {
        'Content-Type': 'application/json',
        'Upgrade': 'websocket',
      },
    }
  );
}

/**
 * WebSocket connection handler (for custom server implementation)
 *
 * This is a placeholder showing how the WebSocket should be handled
 * when integrated with a custom server or API route handler.
 */
class WebRTCWebSocketConnection {
  private sessionId: string;
  private ws: WebSocket;
  private vapiConfig: VapiConfig;
  private cartesiaConfig: CartesiaConfig;

  constructor(
    sessionId: string,
    ws: WebSocket,
    vapiConfig: VapiConfig,
    cartesiaConfig: CartesiaConfig
  ) {
    this.sessionId = sessionId;
    this.ws = ws;
    this.vapiConfig = vapiConfig;
    this.cartesiaConfig = cartesiaConfig;
  }

  /**
   * Handle WebSocket connection
   */
  async handle(): Promise<void> {
    logger.info('WebSocket connection established', { sessionId: this.sessionId });

    // Start audio gateway
    try {
      await startAudioGateway({
        sessionId: this.sessionId,
        vapiConfig: this.vapiConfig,
        cartesiaConfig: this.cartesiaConfig,
      });

      // Register callbacks for gateway events
      this.registerGatewayCallbacks();

      // Create WebRTC peer connection
      this.createPeerConnection();

      // Setup WebSocket message handler
      this.ws.on('message', (data: Buffer) => {
        this.handleMessage(data);
      });

      // Setup WebSocket close handler
      this.ws.on('close', () => {
        this.handleClose();
      });

      // Setup WebSocket error handler
      this.ws.on('error', (error: ErrorEvent) => {
        logger.error('WebSocket error', { message: error.message }, { sessionId: this.sessionId });
      });

      // Send initial SDP offer
      await this.sendSDPOffer();

    } catch (error) {
      logger.error(
        'Failed to start audio gateway',
        error instanceof Error ? error : { message: String(error) },
        { sessionId: this.sessionId }
      );
      this.sendError('gateway_start_failed');
      this.ws.close();
    }
  }

  /**
   * Create WebRTC peer connection
   */
  private createPeerConnection(): void {
    logger.info('Creating WebRTC peer connection', { sessionId: this.sessionId });

    createPeerConnection(
      this.sessionId,
      {
        onIceCandidate: (candidate) => {
          this.sendICECandidate(candidate);
        },
        onTrack: (track) => {
          logger.info('Track received', {
            sessionId: this.sessionId,
            trackKind: track.kind,
          });
        },
        onConnectionStateChange: (state) => {
          logger.info('Connection state changed', {
            sessionId: this.sessionId,
            state,
          });

          // Update session status based on connection state
          if (state === 'connected') {
            updateSessionStatus(this.sessionId, 'connected');
          } else if (state === 'disconnected' || state === 'failed') {
            updateSessionStatus(this.sessionId, 'error');
          }
        },
        onIceConnectionStateChange: (state) => {
          logger.info('ICE connection state changed', {
            sessionId: this.sessionId,
            state,
          });
        },
      },
      {
        iceServers: createDefaultIceServers(),
        bundlePolicy: 'max-bundle',
        iceTransportPolicy: 'all',
      }
    );
  }

  /**
   * Register callbacks for audio gateway events
   */
  private registerGatewayCallbacks(): void {
    onFunctionCall(this.sessionId, (call) => {
      this.sendFunctionCall(call);
    });

    onAudio(this.sessionId, (audio, _isFinal) => {
      this.sendAudio(audio);
    });

    onError(this.sessionId, (type, error) => {
      this.sendError(`${type}: ${error}`);
    });
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(data: Buffer): void {
    try {
      const message = JSON.parse(data.toString());
      logger.debug('WebSocket message received', {
        sessionId: this.sessionId,
        type: message.type,
      });

      switch (message.type) {
        case 'sdp-answer':
          this.handleSDPAnswer(message.sdp);
          break;

        case 'ice-candidate':
          this.handleICECandidate(message.candidate);
          break;

        case 'audio':
          this.handleAudio(message.data);
          break;

        case 'function-result':
          this.handleFunctionResult(message.callId, message.result);
          break;

        default:
          logger.warn('Unknown message type', {
            sessionId: this.sessionId,
            type: message.type,
          });
      }
    } catch (error) {
      logger.error(
        'Failed to handle WebSocket message',
        error instanceof Error ? error : { message: String(error) },
        { sessionId: this.sessionId }
      );
    }
  }

  /**
   * Handle SDP answer from client
   */
  private async handleSDPAnswer(sdp: string): Promise<void> {
    logger.debug('SDP answer received', {
      sessionId: this.sessionId,
      sdpLength: sdp.length,
    });

    try {
      const peerManager = getPeerConnection(this.sessionId);
      if (!peerManager) {
        throw new Error('Peer connection not found');
      }

      await peerManager.setRemoteAnswer(sdp);

      logger.info('Remote SDP answer set successfully', {
        sessionId: this.sessionId,
      });
    } catch (error) {
      logger.error(
        'Failed to set remote SDP answer',
        error instanceof Error ? error : { message: String(error) },
        { sessionId: this.sessionId }
      );
      this.sendError('sdp_answer_failed');
    }
  }

  /**
   * Handle ICE candidate from client
   */
  private async handleICECandidate(candidate: RTCIceCandidateInit): Promise<void> {
    logger.debug('ICE candidate received', {
      sessionId: this.sessionId,
      candidate: candidate.candidate?.substring(0, 50),
    });

    try {
      const peerManager = getPeerConnection(this.sessionId);
      if (!peerManager) {
        throw new Error('Peer connection not found');
      }

      await peerManager.addIceCandidate(candidate);
    } catch (error) {
      logger.error(
        'Failed to add ICE candidate',
        error instanceof Error ? error : { message: String(error) },
        { sessionId: this.sessionId }
      );
      // Don't send error for ICE candidate failures, they're non-fatal
    }
  }

  /**
   * Handle audio data from client
   */
  private handleAudio(data: string): void {
    const audioBuffer = Buffer.from(data, 'base64');
    sendClientAudio(this.sessionId, audioBuffer);
  }

  /**
   * Handle function call result
   */
  private handleFunctionResult(callId: string, result: unknown): void {
    sendFunctionCallResult(this.sessionId, callId, result);
  }

  /**
   * Handle WebSocket close
   */
  private async handleClose(): Promise<void> {
    logger.info('WebSocket connection closed', { sessionId: this.sessionId });

    // Unregister callbacks
    unregisterCallbacks(this.sessionId);

    // Stop audio gateway
    stopAudioGateway(this.sessionId);

    // Close peer connection (this will also close the WebRTC session)
    await closeWebRTCSession(this.sessionId);
  }

  /**
   * Send SDP offer to client
   */
  private async sendSDPOffer(): Promise<void> {
    const peerManager = getPeerConnection(this.sessionId);
    if (!peerManager) {
      logger.error('Peer connection not found for SDP offer', undefined, {
        sessionId: this.sessionId,
      });
      return;
    }

    try {
      // Create SDP offer using werift
      // Note: createOffer() will automatically add an audio transceiver if none exists
      const sdp = await peerManager.createOffer();

      this.sendMessage({
        type: 'sdp-offer',
        sdp,
      });

      logger.info('SDP offer sent to client', {
        sessionId: this.sessionId,
        sdpLength: sdp.length,
      });
    } catch (error) {
      logger.error(
        'Failed to send SDP offer',
        error instanceof Error ? error : { message: String(error) },
        { sessionId: this.sessionId }
      );
      this.sendError('sdp_offer_failed');
    }
  }

  /**
   * Send audio data to client
   */
  private sendAudio(audioBuffer: Buffer): void {
    this.sendMessage({
      type: 'audio',
      data: audioBuffer.toString('base64'),
    });
  }

  /**
   * Send function call to client for routing
   */
  private sendFunctionCall(call: {
    name: string;
    parameters: Record<string, unknown>;
    callId: string;
  }): void {
    this.sendMessage({
      type: 'function-call',
      name: call.name,
      parameters: call.parameters,
      callId: call.callId,
    });
  }

  /**
   * Send error to client
   */
  private sendError(error: string): void {
    this.sendMessage({
      type: 'error',
      error,
    });
  }

  /**
   * Send ICE candidate to client
   */
  private sendICECandidate(candidate: RTCIceCandidateInit): void {
    this.sendMessage({
      type: 'ice-candidate',
      candidate,
    });
  }

  /**
   * Send message to client
   */
  private sendMessage(message: Record<string, unknown>): void {
    if (this.ws.readyState === this.ws.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }
}

// ============================================================
// Re-exports
// ============================================================

export { WebRTCWebSocketConnection };
