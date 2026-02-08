# Audio Test Fixtures

This directory contains audio files for testing the audio conversion functionality.

## Files

### test-100ms-16khz.pcm
- **Format**: Raw PCM (16-bit little-endian)
- **Sample Rate**: 16,000 Hz
- **Channels**: 1 (mono)
- **Duration**: 100 ms
- **Content**: 440 Hz sine wave
- **Size**: 3,200 bytes (1,600 samples × 2 bytes)

**Purpose**: Tests PCM input to mu-law conversion

### test-100ms-16khz.opus
- **Format**: Opus (Ogg container)
- **Sample Rate**: 16,000 Hz
- **Channels**: 1 (mono)
- **Duration**: 100 ms
- **Content**: 440 Hz sine wave
- **Bitrate**: 24 kbps

**Purpose**: Tests Opus decoding and conversion (future enhancement)

## Generation

These files were generated using ffmpeg:

```bash
# PCM
ffmpeg -f lavfi -i "sine=frequency=440:sample_rate=16000:duration=0.1" \
  -f s16le -ar 16000 -ac 1 test-100ms-16khz.pcm

# Opus
ffmpeg -f lavfi -i "sine=frequency=440:sample_rate=16000:duration=0.1" \
  -c:a libopus -b:a 24k -ar 16000 -ac 1 test-100ms-16khz.opus
```

## Usage in Tests

```typescript
import fs from 'fs';
import path from 'path';
import { convertToMulaw } from '@/app/lib/audio-converter';

// Load fixture
const pcmBuffer = fs.readFileSync(
  path.join(__dirname, '__fixtures__/audio/test-100ms-16khz.pcm')
);

// Test conversion
const result = await convertToMulaw(pcmBuffer);
expect(result.buffer).toBeDefined();
```
