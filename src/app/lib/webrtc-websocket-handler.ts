/**
 * WebRTC WebSocket Handler
 *
 * Handles WebSocket connections for WebRTC signaling and audio streaming.
 * Integrates with the audio gateway (Vapi + Cartesia) for voice AI processing.
 *
 * Message Flow:
 * 1. Client connects → Server sends 'connected' message
 * 2. Client sends 'sdp-answer' → Server processes WebRTC negotiation
 * 3. Client sends 'ice-candidate' → Server forwards to WebRTC peer
 * 4. Client sends 'audio' → Server forwards to Vapi (STT + LLM)
 * 5. Server receives 'audio' from Cartesia → Server sends to Client
 * 6. Vapi sends 'function-call' → Server routes to /api/tools/* → Returns result
 */

import { WebSocket } from 'ws';
import { logDebug, logInfo, logWarn, logError } from './logger';
import type {
  WebSocketClientMessage,
  WebSocketServerMessage,
  AudioMessage,
  FunctionCallMessage,
  FunctionResultMessage,
} from '../types';

// Session store for active WebSocket connections
const sessions = new Map<string, WebSocketSession>();

/**
 * WebSocket Session State
 */
interface WebSocketSession {
  ws: WebSocket;
  sessionId: string;
  userId?: string;
  isConnected: boolean;
  createdAt: Date;
  lastActivity: Date;
}

/**
 * WebRTC WebSocket Handler Class
 */
export class WebRTCWebSocketHandler {
  private ws: WebSocket;
  private session: WebSocketSession;

  constructor(ws: WebSocket, sessionId: string) {
    this.ws = ws;
    this.session = {
      ws,
      sessionId,
      isConnected: true,
      createdAt: new Date(),
      lastActivity: new Date(),
    };

    // Store session
    sessions.set(sessionId, this.session);

    // Set up message handler
    this.ws.on('message', (data: Buffer) => {
      this.handleMessage(data);
    });

    // Set up close handler
    this.ws.on('close', () => {
      this.handleClose();
    });

    // Set up error handler
    this.ws.on('error', (error) => {
      this.handleError(error);
    });

    logInfo('WebRTC WebSocket session created', { sessionId });
  }

  /**
   * Handle incoming WebSocket message
   */
  private async handleMessage(data: Buffer): Promise<void> {
    try {
      this.session.lastActivity = new Date();

      // Parse message
      let message: WebSocketClientMessage;
      try {
        message = JSON.parse(data.toString('utf8'));
      } catch (err) {
        this.sendError('Invalid JSON message');
        return;
      }

      logDebug('WebSocket message received', {
        sessionId: this.session.sessionId,
        type: message.type,
      });

      // Route message based on type
      switch (message.type) {
        case 'sdp-answer':
          await this.handleSDPAnswer(message);
          break;

        case 'ice-candidate':
          await this.handleICECandidate(message);
          break;

        case 'audio':
          await this.handleAudio(message);
          break;

        case 'function-result':
          await this.handleFunctionResult(message);
          break;

        case 'ping':
          this.sendPong();
          break;

        default:
          this.sendError(`Unknown message type: ${(message as { type: string }).type}`);
      }
    } catch (err) {
      logError(
        'Error handling WebSocket message',
        err instanceof Error ? err : { message: String(err) },
        { sessionId: this.session.sessionId }
      );
      this.sendError('Internal server error');
    }
  }

  /**
   * Handle SDP Answer from client
   */
  private async handleSDPAnswer(message: { type: string; sdp: string }): Promise<void> {
    logInfo('SDP Answer received', {
      sessionId: this.session.sessionId,
    });

    // In a full WebRTC implementation, this would establish the peer connection
    // For now, we acknowledge receipt
    this.send({
      type: 'connected',
      message: 'SDP Answer processed',
      sessionId: this.session.sessionId,
    });
  }

  /**
   * Handle ICE Candidate from client
   */
  private async handleICECandidate(message: { type: string; candidate: RTCIceCandidateInit }): Promise<void> {
    logDebug('ICE Candidate received', {
      sessionId: this.session.sessionId,
    });

    // In a full WebRTC implementation, this would add the candidate to the peer connection
    // For now, we just log it
  }

  /**
   * Handle audio data from client
   * This should be forwarded to Vapi for STT + LLM processing
   */
  private async handleAudio(message: AudioMessage): Promise<void> {
    logDebug('Audio data received', {
      sessionId: this.session.sessionId,
      format: message.format,
      size: message.data.length,
    });

    // TODO: Forward to Vapi client
    // For now, echo back for testing
    // In production, this would go through the audio gateway:
    // Client → Audio Gateway → Vapi (STT + LLM) → Cartesia (TTS) → Client
  }

  /**
   * Handle function call result from client
   * This is the result of executing a function call
   */
  private async handleFunctionResult(message: FunctionResultMessage): Promise<void> {
    logInfo('Function result received', {
      sessionId: this.session.sessionId,
      callId: message.callId,
    });

    // TODO: Forward result to Vapi
    // In production, this would be sent back to Vapi to continue the conversation
  }

  /**
   * Handle WebSocket close
   */
  private handleClose(): void {
    logInfo('WebSocket connection closed', {
      sessionId: this.session.sessionId,
    });

    this.session.isConnected = false;
    sessions.delete(this.session.sessionId);

    // TODO: Close audio gateway connections
  }

  /**
   * Handle WebSocket error
   */
  private handleError(error: Error): void {
    logError('WebSocket error', error, {
      sessionId: this.session.sessionId,
    });

    this.session.isConnected = false;
    sessions.delete(this.session.sessionId);
  }

  /**
   * Send message to client
   */
  public send(message: WebSocketServerMessage): void {
    if (this.session.isConnected && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  /**
   * Send audio data to client
   */
  public sendAudio(data: string, format: 'opus' | 'mulaw' | 'pcm16' = 'opus', sampleRate?: number): void {
    this.send({
      type: 'audio',
      data,
      format,
      sampleRate,
    });
  }

  /**
   * Send function call to client
   */
  public sendFunctionCall(callId: string, name: string, parameters: Record<string, unknown>): void {
    this.send({
      type: 'function-call',
      callId,
      name,
      parameters,
    });
  }

  /**
   * Send error message to client
   */
  public sendError(error: string, code?: string): void {
    this.send({
      type: 'error',
      error,
      code,
    });
  }

  /**
   * Send pong message
   */
  private sendPong(): void {
    this.send({
      type: 'pong',
    });
  }

  /**
   * Close the WebSocket connection
   */
  public close(): void {
    if (this.session.isConnected && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close(1000, 'Normal closure');
    }
  }
}

/**
 * Create a new WebSocket session
 */
export function createWebSocketSession(ws: WebSocket, sessionId: string): WebRTCWebSocketHandler {
  return new WebRTCWebSocketHandler(ws, sessionId);
}

/**
 * Get a session by ID
 */
export function getSession(sessionId: string): WebSocketSession | undefined {
  return sessions.get(sessionId);
}

/**
 * Get all active sessions
 */
export function getAllSessions(): WebSocketSession[] {
  return Array.from(sessions.values());
}

/**
 * Close a session by ID
 */
export function closeSession(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (session && session.ws.readyState === WebSocket.OPEN) {
    session.ws.close(1000, 'Session closed');
  }
  sessions.delete(sessionId);
}

/**
 * Generate a unique session ID
 */
export function generateSessionId(): string {
  return `ws_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}
