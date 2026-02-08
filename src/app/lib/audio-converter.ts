/**
 * Audio Converter
 * Converts Opus 16kHz audio to mu-law 8kHz for Vapi compatibility
 *
 * Technical Requirements:
 * - Input: Opus codec, 16kHz sample rate (from WebRTC)
 * - Output: mu-law (G.711), 8kHz sample rate
 * - Latency: < 50ms
 *
 * Implementation Notes:
 * - Uses pure TypeScript/JavaScript for minimal latency
 * - No external process spawning (unlike ffmpeg)
 * - Supports both browser (Web Audio API) and Node.js environments
 */

import { createServiceLogger } from './logger';

const logger = createServiceLogger('audio-converter');

// ============================================================
// Constants
// ============================================================

export const DEFAULT_INPUT_SAMPLE_RATE = 16000;
export const DEFAULT_OUTPUT_SAMPLE_RATE = 8000;
export const TARGET_LATENCY_MS = 50;

// mu-law encoding table (ITU-T G.711)
const MULAW_BIAS = 0x84;
const MULAW_CLIP = 32635;

// ============================================================
// Types
// ============================================================

export interface AudioConversionOptions {
  inputSampleRate?: number;
  outputSampleRate?: number;
  channels?: number;
}

export interface ConversionResult {
  buffer: Buffer;
  inputSampleRate: number;
  outputSampleRate: number;
  latencyMs: number;
}

export class AudioConversionError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'AudioConversionError';
  }
}

// ============================================================
// mu-law Encoding/Decoding
// ============================================================

/**
 * Linear to mu-law encoding
 * Converts 16-bit linear PCM to 8-bit mu-law
 */
function linearToMulaw(sample: number): number {
  const sign = (sample >> 8) & 0x80;
  if (sign !== 0) {
    sample = -sample;
  }
  if (sample > MULAW_CLIP) {
    sample = MULAW_CLIP;
  }

  sample = sample + MULAW_BIAS;
  const exponent = MULAW_TAB[(sample >> 7) & 0xff] ?? 0;
  const mantissa = (sample >> 3) & 0x0f;
  const mulawByte = ~(sign | (exponent << 4) | mantissa);

  return mulawByte & 0xff;
}

/**
 * Precomputed mu-law exponent table
 * Based on ITU-T G.711 specification
 */
const MULAW_TAB = [
  0, 0, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3,
  4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4,
  5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5,
  5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5,
  6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6,
  6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6,
  6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6,
  6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6,
  7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7,
  7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7,
  7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7,
  7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7,
  7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7,
  7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7,
  7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7,
  7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7
];

// ============================================================
// Audio Conversion Functions
// ============================================================

/**
 * Validate audio buffer
 * Checks if buffer contains valid audio data
 */
export function validateAudioBuffer(buffer: Buffer): boolean {
  if (!buffer || buffer.length === 0) {
    return false;
  }

  // Check minimum size (at least 100 samples for 16-bit audio)
  if (buffer.length < 200) {
    return false;
  }

  // Check if buffer is not all zeros (silent audio)
  let hasNonZero = false;
  const checkLimit = Math.min(buffer.length, 1000);
  for (let i = 0; i < checkLimit; i++) {
    if (buffer[i] !== 0) {
      hasNonZero = true;
      break;
    }
  }

  return hasNonZero;
}

/**
 * Decode Opus to PCM
 * Note: This is a simplified implementation
 * In production, use opus-decoder or browser's OpusDecoder
 */
async function decodeOpusToPcm(opusBuffer: Buffer): Promise<Int16Array> {
  // For WebRTC scenarios, the audio might already be decoded
  // If the buffer is already PCM, return it directly
  if (isLikelyPcm(opusBuffer)) {
    return bufferToInt16Array(opusBuffer);
  }

  // If it's actual Opus data, we need to decode it
  // In a real implementation, you would use:
  // - Browser: OpusDecoder API
  // - Node.js: @discordjs/opus or opus-decoder package
  //
  // For this PoC, we'll assume the input is pre-decoded PCM
  throw new AudioConversionError(
    'Opus decoding not implemented. Input should be pre-decoded PCM from WebRTC.'
  );
}

/**
 * Check if buffer is likely PCM data
 */
function isLikelyPcm(buffer: Buffer): boolean {
  // Simple heuristic: PCM data typically has varying values
  // Opus Ogg pages have magic bytes 'OggS'
  if (buffer.length > 4 && buffer[0] === 0x4f && buffer[1] === 0x67) {
    return false; // Ogg container (Opus)
  }
  return true;
}

/**
 * Convert Buffer to Int16Array
 */
function bufferToInt16Array(buffer: Buffer): Int16Array {
  const samples = new Int16Array(buffer.length / 2);
  for (let i = 0; i < samples.length; i++) {
    samples[i] = buffer.readInt16LE(i * 2);
  }
  return samples;
}

/**
 * Resample audio from one sample rate to another
 * Uses simple linear interpolation for performance
 */
function resamplePcm(
  samples: Int16Array,
  inputRate: number,
  outputRate: number
): Int16Array {
  if (inputRate === outputRate) {
    return samples;
  }

  const ratio = inputRate / outputRate;
  const outputLength = Math.floor(samples.length / ratio);
  const resampled = new Int16Array(outputLength);

  for (let i = 0; i < outputLength; i++) {
    const position = i * ratio;
    const index = Math.floor(position);
    const fraction = position - index;

    // Linear interpolation
    const sample1 = samples[index] ?? 0;
    const sample2 = samples[index + 1] ?? 0;
    resampled[i] = Math.floor(sample1 + fraction * (sample2 - sample1));
  }

  return resampled;
}

/**
 * Convert PCM to mu-law
 */
function pcmToMulaw(pcm: Int16Array): Buffer {
  const mulaw = Buffer.alloc(pcm.length);
  for (let i = 0; i < pcm.length; i++) {
    const sample = pcm[i] ?? 0;
    mulaw[i] = linearToMulaw(sample);
  }
  return mulaw;
}

/**
 * Convert Opus/PCM audio to mu-law format
 *
 * @param audioData - Input audio buffer (Opus or PCM)
 * @param options - Conversion options
 * @returns Conversion result with output buffer and metadata
 *
 * @throws {AudioConversionError} If conversion fails
 */
export async function convertToMulaw(
  audioData: Buffer,
  options: AudioConversionOptions = {}
): Promise<ConversionResult> {
  const startTime = performance.now();

  const {
    inputSampleRate = DEFAULT_INPUT_SAMPLE_RATE,
    outputSampleRate = DEFAULT_OUTPUT_SAMPLE_RATE,
    channels = 1,
  } = options;

  try {
    // Step 1: Validate input
    if (!validateAudioBuffer(audioData)) {
      throw new AudioConversionError('Invalid audio buffer: empty or silent data');
    }

    logger.debug('Starting audio conversion', {
      inputSize: audioData.length,
      inputSampleRate,
      outputSampleRate,
      channels,
    });

    // Step 2: Decode Opus to PCM (if needed)
    const pcm = await decodeOpusToPcm(audioData);

    // Step 3: Resample if necessary
    const resampled = resamplePcm(pcm, inputSampleRate, outputSampleRate);

    // Step 4: Convert to mu-law
    const mulawBuffer = pcmToMulaw(resampled);

    const latency = performance.now() - startTime;

    // Check latency requirement
    if (latency > TARGET_LATENCY_MS) {
      logger.warn('Audio conversion exceeded target latency', {
        latency,
        target: TARGET_LATENCY_MS,
      });
    } else {
      logger.debug('Audio conversion completed', {
        outputSize: mulawBuffer.length,
        latency,
      });
    }

    return {
      buffer: mulawBuffer,
      inputSampleRate,
      outputSampleRate,
      latencyMs: latency,
    };
  } catch (error) {
    logger.error(
      'Audio conversion failed',
      error instanceof Error ? error : { message: String(error) }
    );
    throw new AudioConversionError(
      'Failed to convert audio to mu-law',
      error
    );
  }
}

/**
 * Create a conversion function with preset options
 */
export function createConverter(options: AudioConversionOptions) {
  return (audioData: Buffer) => convertToMulaw(audioData, options);
}

// ============================================================
// Utility Functions
// ============================================================

/**
 * Get audio duration from buffer
 */
export function getAudioDuration(buffer: Buffer, sampleRate: number, bitsPerSample = 16): number {
  const bytesPerSample = bitsPerSample / 8;
  const samples = buffer.length / bytesPerSample;
  return samples / sampleRate;
}

/**
 * Calculate buffer size for duration
 */
export function calculateBufferSize(
  durationMs: number,
  sampleRate: number,
  bitsPerSample = 16
): number {
  const durationSeconds = durationMs / 1000;
  const samplesPerChannel = Math.floor(durationSeconds * sampleRate);
  return samplesPerChannel * (bitsPerSample / 8);
}

// ============================================================
// Browser-specific utilities (for client-side conversion)
// ============================================================

/**
 * Create an AudioContext for browser-based conversion
 * Note: Only works in browser environment
 */
export async function createBrowserConverter(): Promise<{
  convert: (audioData: ArrayBuffer) => Promise<ArrayBufferLike>;
  close: () => void;
}> {
  if (typeof window === 'undefined') {
    throw new AudioConversionError('Browser converter only works in browser environment');
  }

  const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: unknown }).webkitAudioContext;
  if (!AudioContextClass) {
    throw new AudioConversionError('Web Audio API not supported in this browser');
  }

  const audioContext = new AudioContextClass({ sampleRate: DEFAULT_OUTPUT_SAMPLE_RATE }) as AudioContext;

  return {
    convert: async (audioData: ArrayBuffer) => {
      const audioBuffer = await audioContext.decodeAudioData(audioData.slice(0));

      // Create offline context for resampling and encoding
      const OfflineAudioContextClass = window.OfflineAudioContext || (window as unknown as { webkitOfflineAudioContext: unknown }).webkitOfflineAudioContext;
      if (!OfflineAudioContextClass) {
        throw new AudioConversionError('OfflineAudioContext not supported in this browser');
      }

      const offlineContext = new OfflineAudioContextClass(
        1,
        audioBuffer.length,
        DEFAULT_OUTPUT_SAMPLE_RATE
      ) as OfflineAudioContext;

      const source = offlineContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(offlineContext.destination);
      source.start();

      const renderedBuffer = await offlineContext.startRendering();

      // Convert to mu-law
      const pcm = new Int16Array(renderedBuffer.getChannelData(0).map(s => Math.floor(s * 32767)));
      return pcmToMulaw(pcm).buffer;
    },
    close: () => audioContext.close(),
  };
}

// ============================================================
// Re-exports
// ============================================================

const audioConverter = {
  convertToMulaw,
  validateAudioBuffer,
  createConverter,
  getAudioDuration,
  calculateBufferSize,
  createBrowserConverter,
  AudioConversionError,
};

export default audioConverter;
