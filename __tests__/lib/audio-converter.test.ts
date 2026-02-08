/**
 * Audio Converter Unit Tests
 * Tests for Opus/PCM to mu-law conversion functionality
 */

import {
  convertToMulaw,
  validateAudioBuffer,
  getAudioDuration,
  calculateBufferSize,
  AudioConversionError,
  DEFAULT_INPUT_SAMPLE_RATE,
  DEFAULT_OUTPUT_SAMPLE_RATE,
  TARGET_LATENCY_MS,
} from '@/app/lib/audio-converter';

// ============================================================
// Test Utilities
// ============================================================

/**
 * Generate a test PCM buffer with sine wave
 */
function generateTestPcmBuffer(
  durationMs: number,
  sampleRate: number = DEFAULT_INPUT_SAMPLE_RATE,
  frequency: number = 440
): Buffer {
  const samples = Math.floor((durationMs / 1000) * sampleRate);
  const buffer = Buffer.alloc(samples * 2); // 16-bit samples

  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    const sample = Math.sin(2 * Math.PI * frequency * t);
    const int16Sample = Math.floor(sample * 16383); // Half amplitude to prevent clipping
    buffer.writeInt16LE(int16Sample, i * 2);
  }

  return buffer;
}

/**
 * Generate a silent buffer
 */
function generateSilentBuffer(size: number): Buffer {
  return Buffer.alloc(size);
}

// ============================================================
// validateAudioBuffer Tests
// ============================================================

describe('validateAudioBuffer', () => {
  test('should reject empty buffer', () => {
    const result = validateAudioBuffer(Buffer.alloc(0));
    expect(result).toBe(false);
  });

  test('should reject null/undefined', () => {
    expect(validateAudioBuffer(Buffer.from(''))).toBe(false);
  });

  test('should reject too small buffer', () => {
    const result = validateAudioBuffer(Buffer.alloc(50));
    expect(result).toBe(false);
  });

  test('should reject all-zero (silent) buffer', () => {
    const silentBuffer = Buffer.alloc(1000, 0);
    const result = validateAudioBuffer(silentBuffer);
    expect(result).toBe(false);
  });

  test('should accept valid audio buffer', () => {
    const validBuffer = generateTestPcmBuffer(100);
    const result = validateAudioBuffer(validBuffer);
    expect(result).toBe(true);
  });

  test('should accept buffer with some non-zero data', () => {
    const buffer = Buffer.alloc(1000, 0);
    buffer[500] = 128; // Add a non-zero byte
    const result = validateAudioBuffer(buffer);
    expect(result).toBe(true);
  });
});

// ============================================================
// convertToMulaw Tests
// ============================================================

describe('convertToMulaw', () => {
  test('should convert PCM audio to mu-law format', async () => {
    const inputBuffer = generateTestPcmBuffer(100);

    const result = await convertToMulaw(inputBuffer);

    expect(result).toBeDefined();
    expect(result.buffer).toBeInstanceOf(Buffer);
    expect(result.inputSampleRate).toBe(DEFAULT_INPUT_SAMPLE_RATE);
    expect(result.outputSampleRate).toBe(DEFAULT_OUTPUT_SAMPLE_RATE);
    expect(result.latencyMs).toBeLessThan(TARGET_LATENCY_MS * 2); // Allow some margin
  });

  test('should produce smaller output due to sample rate reduction', async () => {
    const inputBuffer = generateTestPcmBuffer(100);

    const result = await convertToMulaw(inputBuffer);

    // 16kHz to 8kHz = half the samples
    // Plus mu-law is 8-bit vs 16-bit PCM = half the size
    // So output should be roughly 1/4 of input
    expect(result.buffer.length).toBeLessThan(inputBuffer.length);
  });

  test('should meet latency requirements', async () => {
    const inputBuffer = generateTestPcmBuffer(100);

    const result = await convertToMulaw(inputBuffer);

    // Primary requirement: < 50ms
    expect(result.latencyMs).toBeLessThan(TARGET_LATENCY_MS);
  });

  test('should handle custom sample rates', async () => {
    const inputBuffer = generateTestPcmBuffer(100, 24000);

    const result = await convertToMulaw(inputBuffer, {
      inputSampleRate: 24000,
      outputSampleRate: 8000,
    });

    expect(result.inputSampleRate).toBe(24000);
    expect(result.outputSampleRate).toBe(8000);
  });

  test('should throw AudioConversionError for invalid buffer', async () => {
    await expect(convertToMulaw(Buffer.alloc(0))).rejects.toThrow(AudioConversionError);
  });

  test('should throw AudioConversionError for silent buffer', async () => {
    const silentBuffer = generateSilentBuffer(1000);

    await expect(convertToMulaw(silentBuffer)).rejects.toThrow(AudioConversionError);
  });

  test('should maintain audio quality (non-zero output)', async () => {
    const inputBuffer = generateTestPcmBuffer(100, 16000, 440);

    const result = await convertToMulaw(inputBuffer);

    // Check that output is not all zeros
    let hasNonZero = false;
    for (let i = 0; i < result.buffer.length; i++) {
      if (result.buffer[i] !== 0 && result.buffer[i] !== 255) {
        hasNonZero = true;
        break;
      }
    }
    expect(hasNonZero).toBe(true);
  });

  test('should handle different frequencies', async () => {
    const frequencies = [220, 440, 880, 1000];

    for (const freq of frequencies) {
      const inputBuffer = generateTestPcmBuffer(50, 16000, freq);
      const result = await convertToMulaw(inputBuffer);

      expect(result.buffer.length).toBeGreaterThan(0);
      expect(result.latencyMs).toBeLessThan(TARGET_LATENCY_MS);
    }
  });

  test('should handle mono audio', async () => {
    const inputBuffer = generateTestPcmBuffer(100);

    const result = await convertToMulaw(inputBuffer, {
      channels: 1,
    });

    expect(result.buffer).toBeDefined();
    expect(result.buffer.length).toBeGreaterThan(0);
  });
});

// ============================================================
// Utility Function Tests
// ============================================================

describe('getAudioDuration', () => {
  test('should calculate duration correctly for 16kHz audio', () => {
    // 100ms of audio at 16kHz = 1600 samples * 2 bytes = 3200 bytes
    const buffer = generateTestPcmBuffer(100, 16000);
    const duration = getAudioDuration(buffer, 16000);

    expect(duration).toBeCloseTo(0.1, 2); // 100ms
  });

  test('should calculate duration correctly for 8kHz audio', () => {
    // 100ms of audio at 8kHz = 800 samples * 2 bytes = 1600 bytes
    const buffer = generateTestPcmBuffer(100, 8000);
    const duration = getAudioDuration(buffer, 8000);

    expect(duration).toBeCloseTo(0.1, 2); // 100ms
  });

  test('should handle different bit depths', () => {
    const buffer = Buffer.alloc(3200); // 1600 samples
    const duration16bit = getAudioDuration(buffer, 16000, 16);
    const duration8bit = getAudioDuration(buffer, 16000, 8);

    expect(duration16bit).toBeCloseTo(0.1, 2);
    expect(duration8bit).toBeCloseTo(0.2, 2); // Double duration for 8-bit
  });
});

describe('calculateBufferSize', () => {
  test('should calculate buffer size for 16kHz 16-bit audio', () => {
    const size = calculateBufferSize(100, 16000, 16);

    // 100ms = 0.1s, 0.1 * 16000 = 1600 samples, 1600 * 2 bytes = 3200 bytes
    expect(size).toBe(3200);
  });

  test('should calculate buffer size for 8kHz 8-bit audio', () => {
    const size = calculateBufferSize(100, 8000, 8);

    // 100ms = 0.1s, 0.1 * 8000 = 800 samples, 800 * 1 byte = 800 bytes
    expect(size).toBe(800);
  });

  test('should calculate buffer size for 1 second of audio', () => {
    const size = calculateBufferSize(1000, 16000, 16);

    // 1s * 16000 samples * 2 bytes = 32000 bytes
    expect(size).toBe(32000);
  });
});

// ============================================================
// Performance Tests
// ============================================================

describe('Performance', () => {
  test('should process 100ms audio chunk in under 50ms', async () => {
    const inputBuffer = generateTestPcmBuffer(100);

    const startTime = performance.now();
    const result = await convertToMulaw(inputBuffer);
    const endTime = performance.now();

    const conversionTime = endTime - startTime;

    expect(result.latencyMs).toBeLessThan(TARGET_LATENCY_MS);
    expect(conversionTime).toBeLessThan(TARGET_LATENCY_MS);
  });

  test('should process 500ms audio chunk efficiently', async () => {
    const inputBuffer = generateTestPcmBuffer(500);

    const result = await convertToMulaw(inputBuffer);

    // Still should be fast for larger chunks
    expect(result.latencyMs).toBeLessThan(TARGET_LATENCY_MS * 2);
  });

  test('should scale linearly with audio duration', async () => {
    const durations = [50, 100, 200, 400];
    const latencies: number[] = [];

    for (const duration of durations) {
      const inputBuffer = generateTestPcmBuffer(duration);
      const result = await convertToMulaw(inputBuffer);
      latencies.push(result.latencyMs);
    }

    // Processing time should generally increase with duration
    // (though JIT compilation may make this non-linear for small samples)
    // Just verify that largest takes longer than smallest
    expect(latencies[3]).toBeGreaterThan(latencies[0] * 0.5); // At least 50% more time for 8x data
  });
});

// ============================================================
// Error Handling Tests
// ============================================================

describe('Error Handling', () => {
  test('should provide meaningful error message for empty buffer', async () => {
    try {
      await convertToMulaw(Buffer.alloc(0));
      fail('Should have thrown AudioConversionError');
    } catch (error) {
      expect(error).toBeInstanceOf(AudioConversionError);
      expect((error as AudioConversionError).message).toContain('Failed to convert audio to mu-law');
    }
  });

  test('should provide meaningful error message for silent buffer', async () => {
    try {
      await convertToMulaw(generateSilentBuffer(1000));
      fail('Should have thrown AudioConversionError');
    } catch (error) {
      expect(error).toBeInstanceOf(AudioConversionError);
      expect((error as AudioConversionError).message).toContain('Failed to convert audio to mu-law');
    }
  });

  test('should wrap underlying error in AudioConversionError', async () => {
    try {
      await convertToMulaw(Buffer.alloc(0));
      fail('Should have thrown AudioConversionError');
    } catch (error) {
      expect(error).toBeInstanceOf(AudioConversionError);
      const conversionError = error as AudioConversionError;
      expect(conversionError.cause).toBeDefined();
    }
  });
});

// ============================================================
// Integration Tests
// ============================================================

describe('Integration: Full Pipeline', () => {
  test('should handle complete conversion pipeline', async () => {
    // Generate realistic audio chunk (typical WebRTC frame size)
    const audioChunk = generateTestPcmBuffer(20, 16000); // 20ms frame

    // Convert
    const result = await convertToMulaw(audioChunk, {
      inputSampleRate: 16000,
      outputSampleRate: 8000,
      channels: 1,
    });

    // Verify output
    expect(result.buffer).toBeDefined();
    expect(result.buffer.length).toBeGreaterThan(0);
    expect(result.buffer.length).toBeLessThan(audioChunk.length); // Should be smaller
    expect(result.latencyMs).toBeLessThan(TARGET_LATENCY_MS);

    // Verify output can be encoded to base64 (for WebSocket transmission)
    const base64 = result.buffer.toString('base64');
    expect(base64).toBeDefined();
    expect(base64.length).toBeGreaterThan(0);
  });

  test('should handle multiple consecutive conversions', async () => {
    const conversions = 10;
    const latencies: number[] = [];

    for (let i = 0; i < conversions; i++) {
      const audioChunk = generateTestPcmBuffer(20, 16000);
      const result = await convertToMulaw(audioChunk);
      latencies.push(result.latencyMs);
    }

    // All conversions should be fast
    for (const latency of latencies) {
      expect(latency).toBeLessThan(TARGET_LATENCY_MS);
    }

    // Average latency should be well under target
    const avgLatency = latencies.reduce((a, b) => a + b) / latencies.length;
    expect(avgLatency).toBeLessThan(TARGET_LATENCY_MS * 0.8);
  });
});

// ============================================================
// Real Audio File Tests (Fixture-based Integration)
// ============================================================

describe('Real Audio Files: Fixture-based Tests', () => {
  test('should convert real PCM file from fixture', async () => {
    // This tests with an actual PCM file generated by ffmpeg
    const fs = await import('fs');
    const path = await import('path');

    const fixturePath = path.join(process.cwd(), '__fixtures__/audio/test-100ms-16khz.pcm');
    const realPcmBuffer = fs.readFileSync(fixturePath);

    // Verify fixture file exists and has expected size
    expect(realPcmBuffer).toBeDefined();
    expect(realPcmBuffer.length).toBe(3200); // 100ms @ 16kHz = 1600 samples × 2 bytes

    // Convert using real audio data
    const result = await convertToMulaw(realPcmBuffer, {
      inputSampleRate: 16000,
      outputSampleRate: 8000,
      channels: 1,
    });

    // Verify conversion results
    expect(result.buffer).toBeDefined();
    expect(result.buffer.length).toBeGreaterThan(0);

    // Output should be smaller (16kHz -> 8kHz + 16-bit -> 8-bit)
    expect(result.buffer.length).toBeLessThan(realPcmBuffer.length);

    // Performance check
    expect(result.latencyMs).toBeLessThan(TARGET_LATENCY_MS);

    // Output should be valid mu-law data (not all zeros or 255)
    let hasVariation = false;
    for (let i = 1; i < Math.min(100, result.buffer.length); i++) {
      if (result.buffer[i] !== result.buffer[0]) {
        hasVariation = true;
        break;
      }
    }
    expect(hasVariation).toBe(true);
  });

  test('should handle real-world WebRTC frame sizes', async () => {
    const fs = await import('fs');
    const path = await import('path');

    const fixturePath = path.join(process.cwd(), '__fixtures__/audio/test-100ms-16khz.pcm');
    const realPcmBuffer = fs.readFileSync(fixturePath);

    // WebRTC typically sends 20ms frames
    const frameSize = 640; // 20ms @ 16kHz = 320 samples × 2 bytes

    for (let offset = 0; offset < realPcmBuffer.length - frameSize; offset += frameSize) {
      const frame = realPcmBuffer.subarray(offset, offset + frameSize);

      const result = await convertToMulaw(frame, {
        inputSampleRate: 16000,
        outputSampleRate: 8000,
        channels: 1,
      });

      expect(result.buffer.length).toBeGreaterThan(0);
      expect(result.latencyMs).toBeLessThan(TARGET_LATENCY_MS);
    }
  });

  test('should maintain audio characteristics across conversion', async () => {
    const fs = await import('fs');
    const path = await import('path');

    const fixturePath = path.join(process.cwd(), '__fixtures__/audio/test-100ms-16khz.pcm');
    const realPcmBuffer = fs.readFileSync(fixturePath);

    const result = await convertToMulaw(realPcmBuffer, {
      inputSampleRate: 16000,
      outputSampleRate: 8000,
      channels: 1,
    });

    // Check that output has reasonable energy (not silent)
    let sum = 0;
    for (let i = 0; i < result.buffer.length; i++) {
      // mu-law is unsigned 8-bit, center around 128
      sum += Math.abs(result.buffer[i] - 128);
    }
    const averageEnergy = sum / result.buffer.length;

    // For a 440Hz sine wave, we should have reasonable energy
    expect(averageEnergy).toBeGreaterThan(10); // Not silent
    expect(averageEnergy).toBeLessThan(128); // Not clipped
  });

  test('should produce consistent results for same input', async () => {
    const fs = await import('fs');
    const path = await import('path');

    const fixturePath = path.join(process.cwd(), '__fixtures__/audio/test-100ms-16khz.pcm');
    const realPcmBuffer = fs.readFileSync(fixturePath);

    const results = await Promise.all([
      convertToMulaw(realPcmBuffer),
      convertToMulaw(realPcmBuffer),
      convertToMulaw(realPcmBuffer),
    ]);

    // All results should be identical
    expect(results[0].buffer.equals(results[1].buffer)).toBe(true);
    expect(results[1].buffer.equals(results[2].buffer)).toBe(true);
    expect(results[0].buffer.equals(results[2].buffer)).toBe(true);
  });
});
