/**
 * Centralized Configuration Module
 *
 * Loads and validates application configuration from environment variables.
 * Ensures required API keys and settings are present at startup.
 *
 * Design Philosophy:
 * - Fail fast: Throw errors for missing required configuration
 * - Single source of truth: All config loading happens here
 * - Type safe: Return properly typed config objects
 */

import type { VapiConfig, CartesiaConfig } from '../types';

// ============================================================
// Configuration Loading Errors
// ============================================================

class ConfigError extends Error {
  constructor(missingVars: string[]) {
    const message = `Missing required environment variables: ${missingVars.join(', ')}`;
    super(message);
    this.name = 'ConfigError';
  }
}

// ============================================================
// Vapi Configuration
// ============================================================

/**
 * Load Vapi configuration from environment variables
 *
 * Required environment variables:
 * - VAPI_API_KEY: Server-side API key
 * - VAPI_PUBLIC_KEY: Public key for client-side initialization
 * - VAPI_ASSISTANT_ID: Assistant ID for Vapi
 *
 * @throws {ConfigError} If required environment variables are missing
 * @returns {VapiConfig} Validated Vapi configuration
 */
export function loadVapiConfig(): VapiConfig {
  const apiKey = process.env.VAPI_API_KEY;
  const publicKey = process.env.VAPI_PUBLIC_KEY;
  const assistantId = process.env.VAPI_ASSISTANT_ID;

  const missingVars: string[] = [];
  if (!apiKey) missingVars.push('VAPI_API_KEY');
  if (!publicKey) missingVars.push('VAPI_PUBLIC_KEY');
  if (!assistantId) missingVars.push('VAPI_ASSISTANT_ID');

  if (missingVars.length > 0) {
    throw new ConfigError(missingVars);
  }

  // After validation, we know these are defined (non-null assertion)
  return {
    apiKey: apiKey!,
    publicKey: publicKey!,
    assistantId: assistantId!,
  };
}

// ============================================================
// Cartesia Configuration
// ============================================================

/**
 * Load Cartesia configuration from environment variables
 *
 * Required environment variables:
 * - CARTESIA_API_KEY: Server-side API key
 *
 * Optional environment variables (with defaults):
 * - CARTESIA_VOICE_ID: Voice ID to use (default: '79a125e6-c5a2-4b9d-8b3f-5c2a1b2d3e4f')
 * - CARTESIA_DEFAULT_SPEED: Playback speed 0.5-2.0 (default: '1.0')
 * - CARTESIA_SAMPLE_RATE: Audio sample rate (default: '24000')
 * - CARTESIA_OUTPUT_FORMAT: Output format (default: 'pcm16')
 *
 * @throws {ConfigError} If required environment variables are missing
 * @returns {CartesiaConfig} Validated Cartesia configuration
 */
export function loadCartesiaConfig(): CartesiaConfig {
  const apiKey = process.env.CARTESIA_API_KEY;

  if (!apiKey) {
    throw new ConfigError(['CARTESIA_API_KEY']);
  }

  // Parse optional configuration with defaults
  const voiceId = process.env.CARTESIA_VOICE_ID || '79a125e6-c5a2-4b9d-8b3f-5c2a1b2d3e4f';
  const speed = parseFloat(process.env.CARTESIA_DEFAULT_SPEED || '1.0');
  const sampleRate = parseInt(process.env.CARTESIA_SAMPLE_RATE || '24000', 10);
  const outputFormat = (process.env.CARTESIA_OUTPUT_FORMAT as CartesiaConfig['outputFormat']) || 'pcm16';

  // Validate speed range
  if (speed < 0.5 || speed > 2.0) {
    throw new Error('CARTESIA_DEFAULT_SPEED must be between 0.5 and 2.0');
  }

  // Validate output format
  const validFormats: CartesiaConfig['outputFormat'][] = ['pcm16', 'mulaw', 'opus'];
  if (!validFormats.includes(outputFormat)) {
    throw new Error(`CARTESIA_OUTPUT_FORMAT must be one of: ${validFormats.join(', ')}`);
  }

  return {
    apiKey: apiKey!, // Non-null assertion after validation
    voiceId,
    speed,
    sampleRate,
    outputFormat,
  };
}

// ============================================================
// WebSocket Configuration
// ============================================================

/**
 * Get WebSocket server URL for client-side connections
 *
 * Automatically determines the correct WebSocket URL based on environment:
 * - Development: ws://localhost:3001/api/webrtc
 * - Production: Based on NEXT_PUBLIC_WEBSOCKET_URL or derived from app URL
 *
 * @returns {string} WebSocket URL
 */
export function getWebSocketUrl(): string {
  // Client-side environment variable takes precedence
  if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_WEBSOCKET_URL) {
    return process.env.NEXT_PUBLIC_WEBSOCKET_URL;
  }

  // Server-side: construct from environment
  const wsPort = process.env.WEBSOCKET_PORT || '3001';
  const hostname = process.env.HOSTNAME || 'localhost';
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction) {
    // In production, use wss:// and the production hostname
    return `wss://${hostname}/api/webrtc`;
  } else {
    // In development, use ws://localhost:3001
    return `ws://localhost:${wsPort}/api/webrtc`;
  }
}

/**
 * Get WebSocket port for server configuration
 *
 * @returns {number} WebSocket server port
 */
export function getWebSocketPort(): number {
  return parseInt(process.env.WEBSOCKET_PORT || '3001', 10);
}

// ============================================================
// Configuration Validation
// ============================================================

/**
 * Validate that all required configuration is present
 *
 * This function is useful for startup checks to ensure
 * the application has all required configuration before
 * accepting connections.
 *
 * @returns {boolean} True if all configuration is valid
 * @throws {ConfigError} If required configuration is missing
 */
export function validateConfig(): boolean {
  loadVapiConfig();
  loadCartesiaConfig();
  return true;
}

// ============================================================
// Configuration Summary (for logging)
// ============================================================

/**
 * Get a summary of loaded configuration (without exposing secrets)
 *
 * This is useful for logging configuration status at startup
 * without exposing sensitive API keys.
 *
 * @returns {object} Configuration summary
 */
export function getConfigSummary(): {
  vapi: { configured: boolean; hasAssistant: boolean };
  cartesia: { configured: boolean; voiceId: string; speed: number };
  websocket: { port: number; url: string };
} {
  try {
    const vapiConfig = loadVapiConfig();
    const cartesiaConfig = loadCartesiaConfig();

    return {
      vapi: {
        configured: true,
        hasAssistant: !!vapiConfig.assistantId,
      },
      cartesia: {
        configured: true,
        voiceId: cartesiaConfig.voiceId,
        speed: cartesiaConfig.speed,
      },
      websocket: {
        port: getWebSocketPort(),
        url: getWebSocketUrl(),
      },
    };
  } catch (error) {
    return {
      vapi: { configured: false, hasAssistant: false },
      cartesia: { configured: false, voiceId: 'unknown', speed: 0 },
      websocket: { port: getWebSocketPort(), url: getWebSocketUrl() },
    };
  }
}
