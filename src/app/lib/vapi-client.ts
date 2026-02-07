/**
 * Vapi WebSocket Client
 * Handles WebSocket connection to Vapi for STT + LLM + Function Calling
 *
 * Reference: https://github.com/VapiAI/server-sdk-typescript
 */

import { createServiceLogger } from './logger';
import WebSocket from 'ws';

const logger = createServiceLogger('vapi-client');

// ============================================================
// Types
// ============================================================

export interface VapiConfig {
  apiKey: string;
  publicKey: string;
  assistantId: string;
}

export interface VapiMessageBase {
  type: string;
  [key: string]: unknown;
}

export interface VapiFunctionCallMessage extends VapiMessageBase {
  type: 'function-call';
  functionCall: {
    name: string;
    parameters: Record<string, unknown>;
    callId: string;
  };
}

export interface VapiTextMessage extends VapiMessageBase {
  type: 'conversation-item';
  conversationItem: {
    role: 'assistant' | 'user';
    content: string;
    contentType: 'text';
  };
}

export interface VapiTranscriptMessage extends VapiMessageBase {
  type: 'transcript';
  transcript: string;
  isFinal: boolean;
}

export interface VapiErrorMessage extends VapiMessageBase {
  type: 'error';
  error: string;
  message?: string;
}

export type VapiMessage =
  | VapiFunctionCallMessage
  | VapiTextMessage
  | VapiTranscriptMessage
  | VapiErrorMessage;

export type VapiEventHandler = (message: VapiMessage) => void;
export type VapiFunctionCallHandler = (call: {
  name: string;
  parameters: Record<string, unknown>;
  callId: string;
}) => void;
export type VapiTranscriptHandler = (transcript: string, isFinal: boolean) => void;
export type VapiErrorHandler = (error: string, message?: string) => void;

// ============================================================
// Vapi Client
// ============================================================

export class VapiClient {
  private ws: WebSocket | null = null;
  private config: VapiConfig;
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;
  private reconnectDelay = 1000;

  // Event handlers
  private onMessageHandlers: Set<VapiEventHandler> = new Set();
  private onFunctionCallHandlers: Set<VapiFunctionCallHandler> = new Set();
  private onTranscriptHandlers: Set<VapiTranscriptHandler> = new Set();
  private onErrorHandlers: Set<VapiErrorHandler> = new Set();
  private onConnectHandlers: Set<() => void> = new Set();
  private onDisconnectHandlers: Set<() => void> = new Set();

  constructor(config: VapiConfig) {
    this.config = config;
  }

  /**
   * Connect to Vapi WebSocket
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Vapi WebSocket endpoint
        const wsUrl = 'wss://api.vapi.ai/ws';

        logger.info('Connecting to Vapi WebSocket', {
          assistantId: this.config.assistantId,
        });

        this.ws = new WebSocket(wsUrl, {
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
          },
        });

        // Connection opened
        this.ws.on('open', () => {
          logger.info('Vapi WebSocket connected');
          this.isConnected = true;
          this.reconnectAttempts = 0;

          // Send initial configuration
          this.sendConfig();

          // Notify handlers
          this.onConnectHandlers.forEach((handler) => handler());

          resolve();
        });

        // Message received
        this.ws.on('message', (data: Buffer) => {
          try {
            const message = JSON.parse(data.toString()) as VapiMessage;
            this.handleMessage(message);
          } catch (error) {
            logger.error('Failed to parse Vapi message', {
              message: error instanceof Error ? error.message : String(error),
            });
          }
        });

        // Error occurred
        this.ws.on('error', (error) => {
          logger.error('Vapi WebSocket error', {
            message: error.message,
          });
          this.onErrorHandlers.forEach((handler) =>
            handler('websocket_error', error.message)
          );
        });

        // Connection closed
        this.ws.on('close', (code, reason) => {
          logger.info('Vapi WebSocket closed', { code, reason: reason.toString() });
          this.isConnected = false;

          // Notify handlers
          this.onDisconnectHandlers.forEach((handler) => handler());

          // Attempt reconnect if not intentionally closed
          if (code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnect();
          }
        });
      } catch (error) {
        logger.error('Failed to create Vapi WebSocket connection', {
          message: error instanceof Error ? error.message : String(error),
        });
        reject(error);
      }
    });
  }

  /**
   * Send initial configuration
   */
  private sendConfig(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const configMessage = {
      type: 'config',
      config: {
        assistantId: this.config.assistantId,
      },
    };

    this.ws.send(JSON.stringify(configMessage));
    logger.debug('Vapi config sent');
  }

  /**
   * Handle incoming message from Vapi
   */
  private handleMessage(message: VapiMessage): void {
    logger.debug('Vapi message received', { type: message.type });

    // Notify all message handlers
    this.onMessageHandlers.forEach((handler) => handler(message));

    // Route to specific handlers
    switch (message.type) {
      case 'function-call':
        this.onFunctionCallHandlers.forEach((handler) =>
          handler({
            name: message.functionCall.name,
            parameters: message.functionCall.parameters,
            callId: message.functionCall.callId,
          })
        );
        break;

      case 'transcript':
        this.onTranscriptHandlers.forEach((handler) =>
          handler(message.transcript, message.isFinal ?? false)
        );
        break;

      case 'error':
        this.onErrorHandlers.forEach((handler) =>
          handler(message.error, message.message as string)
        );
        break;
    }
  }

  /**
   * Send audio data to Vapi
   * Converts Opus 16kHz to mu-law 8kHz as required by Vapi
   */
  sendAudio(audioData: Buffer): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      logger.warn('Cannot send audio: WebSocket not connected');
      return;
    }

    // Convert audio format (Opus 16kHz → mu-law 8kHz)
    // This is a placeholder - actual conversion requires audio processing library
    const convertedAudio = this.convertAudioFormat(audioData);

    const message = {
      type: 'audio',
      audio: convertedAudio.toString('base64'),
    };

    this.ws.send(JSON.stringify(message));
  }

  /**
   * Convert audio format
   * TODO: Implement proper Opus → mu-law conversion
   */
  private convertAudioFormat(audioData: Buffer): Buffer {
    // Placeholder: just return the original data
    // In production, use audio processing library like node-ffmpeg or similar
    return audioData;
  }

  /**
   * Send function call result back to Vapi
   */
  sendFunctionCallResult(callId: string, result: unknown): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      logger.warn('Cannot send function result: WebSocket not connected');
      return;
    }

    const message = {
      type: 'function-call-result',
      callId,
      result,
    };

    this.ws.send(JSON.stringify(message));
    logger.debug('Function call result sent', { callId });
  }

  /**
   * Send text message to Vapi
   */
  sendText(text: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      logger.warn('Cannot send text: WebSocket not connected');
      return;
    }

    const message = {
      type: 'conversation-item',
      conversationItem: {
        role: 'user',
        content: text,
        contentType: 'text',
      },
    };

    this.ws.send(JSON.stringify(message));
    logger.debug('Text message sent', { text: text.substring(0, 50) });
  }

  /**
   * Reconnect to Vapi
   */
  private reconnect(): void {
    this.reconnectAttempts++;
    const delay = this.reconnectDelay * this.reconnectAttempts;

    logger.info('Reconnecting to Vapi...', {
      attempt: this.reconnectAttempts,
      delay,
    });

    setTimeout(() => {
      this.connect().catch((error) => {
        logger.error('Reconnect failed', {
          message: error instanceof Error ? error.message : String(error),
        });
      });
    }, delay);
  }

  /**
   * Disconnect from Vapi
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
      this.isConnected = false;
      logger.info('Vapi WebSocket disconnected');
    }
  }

  // ============================================================
  // Event Handlers Registration
  // ============================================================

  onMessage(handler: VapiEventHandler): void {
    this.onMessageHandlers.add(handler);
  }

  onFunctionCall(handler: VapiFunctionCallHandler): void {
    this.onFunctionCallHandlers.add(handler);
  }

  onTranscript(handler: VapiTranscriptHandler): void {
    this.onTranscriptHandlers.add(handler);
  }

  onError(handler: VapiErrorHandler): void {
    this.onErrorHandlers.add(handler);
  }

  onConnect(handler: () => void): void {
    this.onConnectHandlers.add(handler);
  }

  onDisconnect(handler: () => void): void {
    this.onDisconnectHandlers.add(handler);
  }

  // ============================================================
  // Utility Methods
  // ============================================================

  get connected(): boolean {
    return this.isConnected;
  }

  get readyState(): number {
    return this.ws?.readyState ?? WebSocket.CLOSED;
  }
}

// ============================================================
// Factory Function
// ============================================================

export function createVapiClient(config: VapiConfig): VapiClient {
  return new VapiClient(config);
}

// ============================================================
// Re-exports
// ============================================================

export type {
  VapiConfig,
  VapiMessage,
  VapiFunctionCallMessage,
  VapiTextMessage,
  VapiTranscriptMessage,
  VapiErrorMessage,
};
