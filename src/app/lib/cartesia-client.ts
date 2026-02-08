/**
 * Cartesia WebSocket Client
 * Handles WebSocket connection to Cartesia for Streaming TTS with speed control
 *
 * Reference: https://docs.cartesia.ai/api-reference/tts/websocket
 * Reference: https://github.com/cartesia-ai/cartesia-js
 */

import { createServiceLogger } from './logger';
import WebSocket from 'ws';

const logger = createServiceLogger('cartesia-client');

// ============================================================
// Types
// ============================================================

export interface CartesiaConfig {
  apiKey: string;
  voiceId: string;
  speed: number; // 0.5 - 2.0
  sampleRate?: number; // e.g., 16000, 24000, 44100
  outputFormat?: 'pcm16' | 'mulaw' | 'opus';
  language?: string;
}

export interface CartesiaTTSRequest {
  context_id?: string;
  text: string;
  voice: {
    id: string;
    __experimental_controls?: {
      speed?: number;
    };
  };
  output_format: {
    container: 'raw' | 'wav';
    encoding: 'pcm16' | 'mulaw' | 'opus';
    sample_rate: number;
  };
}

export interface CartesiaTTSResponse {
  context_id: string;
  audio: string; // Base64 encoded
  alignment?: Record<string, unknown>;
}

export interface CartesiaErrorMessage {
  type: 'error';
  error: string;
  detail?: string;
}

export type CartesiaMessage = CartesiaTTSResponse | CartesiaErrorMessage;

export type CartesiaAudioHandler = (audioData: Buffer, isFinal: boolean) => void;
export type CartesiaErrorHandler = (error: string, detail?: string) => void;

// ============================================================
// Cartesia Client
// ============================================================

export class CartesiaClient {
  private ws: WebSocket | null = null;
  private config: CartesiaConfig;
  private isConnected = false;
  private currentContextId: string | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;
  private reconnectDelay = 1000;

  // Event handlers
  private onAudioHandlers: Set<CartesiaAudioHandler> = new Set();
  private onErrorHandlers: Set<CartesiaErrorHandler> = new Set();
  private onConnectHandlers: Set<() => void> = new Set();
  private onDisconnectHandlers: Set<() => void> = new Set();

  constructor(config: CartesiaConfig) {
    this.config = {
      ...config,
      sampleRate: config.sampleRate ?? 24000,
      outputFormat: config.outputFormat ?? 'pcm16',
      language: config.language ?? 'en',
    };
  }

  /**
   * Connect to Cartesia WebSocket
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Cartesia WebSocket endpoint
        // Format: wss://api.cartesia.ai/tts/websocket?api_key={API_KEY}&cartesia_version={VERSION}
        const wsUrl = `wss://api.cartesia.ai/tts/websocket?api_key=${this.config.apiKey}&cartesia_version=2024-06-10`;

        logger.info('Connecting to Cartesia WebSocket', {
          voiceId: this.config.voiceId,
          speed: this.config.speed,
        });

        this.ws = new WebSocket(wsUrl, {
          headers: {
            'Cartesia-Version': '2024-06-10',
          },
        });

        // Connection opened
        this.ws.on('open', () => {
          logger.info('Cartesia WebSocket connected');
          this.isConnected = true;
          this.reconnectAttempts = 0;

          // Notify handlers
          this.onConnectHandlers.forEach((handler) => handler());

          resolve();
        });

        // Message received
        this.ws.on('message', (data: Buffer) => {
          try {
            const message = JSON.parse(data.toString()) as CartesiaMessage;
            this.handleMessage(message);
          } catch (error) {
            logger.error(
              'Failed to parse Cartesia message',
              error instanceof Error ? error : { message: String(error) }
            );
          }
        });

        // Error occurred
        this.ws.on('error', (error) => {
          logger.error('Cartesia WebSocket error', error);
          this.onErrorHandlers.forEach((handler) =>
            handler('websocket_error', error.message)
          );
        });

        // Connection closed
        this.ws.on('close', (code, reason) => {
          logger.info('Cartesia WebSocket closed', { code, reason: reason.toString() });
          this.isConnected = false;
          this.currentContextId = null;

          // Notify handlers
          this.onDisconnectHandlers.forEach((handler) => handler());

          // Attempt reconnect if not intentionally closed
          if (code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnect();
          }
        });
      } catch (error) {
        logger.error(
          'Failed to create Cartesia WebSocket connection',
          error instanceof Error ? error : { message: String(error) }
        );
        reject(error);
      }
    });
  }

  /**
   * Handle incoming message from Cartesia
   */
  private handleMessage(message: CartesiaMessage): void {
    if ('type' in message && message.type === 'error') {
      logger.error('Cartesia error', { message: message.error }, { detail: message.detail });
      this.onErrorHandlers.forEach((handler) =>
        handler(message.error, message.detail)
      );
      return;
    }

    // Audio response
    if ('context_id' in message && 'audio' in message) {
      this.currentContextId = message.context_id;

      // Decode base64 audio
      const audioData = Buffer.from(message.audio, 'base64');

      logger.debug('Cartesia audio received', {
        contextId: message.context_id,
        bytes: audioData.length,
      });

      // Notify handlers
      this.onAudioHandlers.forEach((handler) => handler(audioData, true));
    }
  }

  /**
   * Synthesize text to speech (streaming)
   */
  synthesize(text: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      logger.warn('Cannot synthesize: WebSocket not connected');
      return;
    }

    const request: CartesiaTTSRequest = {
      context_id: this.currentContextId ?? undefined,
      text,
      voice: {
        id: this.config.voiceId,
        __experimental_controls: {
          speed: this.config.speed,
        },
      },
      output_format: {
        container: 'raw',
        encoding: this.config.outputFormat ?? 'pcm16',
        sample_rate: this.config.sampleRate ?? 24000,
      },
    };

    this.ws.send(JSON.stringify(request));
    logger.debug('TTS request sent', {
      text: text.substring(0, 50),
      contextId: this.currentContextId,
    });
  }

  /**
   * Set voice speed (0.5 - 2.0)
   */
  setSpeed(speed: number): void {
    if (speed < 0.5 || speed > 2.0) {
      logger.warn('Invalid speed value', { speed, validRange: '0.5 - 2.0' });
      return;
    }

    this.config.speed = speed;
    logger.debug('Voice speed updated', { speed });
  }

  /**
   * Set voice ID
   */
  setVoice(voiceId: string): void {
    this.config.voiceId = voiceId;
    this.currentContextId = null; // Reset context for new voice
    logger.debug('Voice ID updated', { voiceId });
  }

  /**
   * Reset context (start new TTS context)
   */
  resetContext(): void {
    this.currentContextId = null;
    logger.debug('Context reset');
  }

  /**
   * Reconnect to Cartesia
   */
  private reconnect(): void {
    this.reconnectAttempts++;
    const delay = this.reconnectDelay * this.reconnectAttempts;

    logger.info('Reconnecting to Cartesia...', {
      attempt: this.reconnectAttempts,
      delay,
    });

    setTimeout(() => {
      this.connect().catch((error) => {
        logger.error(
          'Reconnect failed',
          error instanceof Error ? error : { message: String(error) }
        );
      });
    }, delay);
  }

  /**
   * Disconnect from Cartesia
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
      this.isConnected = false;
      this.currentContextId = null;
      logger.info('Cartesia WebSocket disconnected');
    }
  }

  // ============================================================
  // Event Handlers Registration
  // ============================================================

  onAudio(handler: CartesiaAudioHandler): void {
    this.onAudioHandlers.add(handler);
  }

  onError(handler: CartesiaErrorHandler): void {
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

  get contextId(): string | null {
    return this.currentContextId;
  }
}

// ============================================================
// Factory Function
// ============================================================

export function createCartesiaClient(config: CartesiaConfig): CartesiaClient {
  return new CartesiaClient(config);
}

// ============================================================
// Voice Helper Functions
// ============================================================

/**
 * Get default Cartesia voice IDs
 */
export const CARTESIA_VOICES = {
  // English voices
  '79a125e8-cd45-4c05-9a83-4b0d4b0f3c29': 'Lady (American English)',
  'dfkecmkjemfjmcmdidhj': 'Default Voice',
  // Add more voices as needed
} as const;

/**
 * Get voice ID by name
 */
export function getVoiceIdByName(name: string): string | undefined {
  const voiceMap: Record<string, string> = {
    'lady': '79a125e8-cd45-4c05-9a83-4b0d4b0f3c29',
    'default': 'dfkecmkjemfjmcmdidhj',
    // Add more mappings
  };

  return voiceMap[name.toLowerCase()];
}

// ============================================================
// Re-exports
// ============================================================
