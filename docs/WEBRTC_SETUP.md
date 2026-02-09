# WebRTC Setup Guide

This guide covers the setup and testing of WebRTC components in the Voice Engine PoC.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Prerequisites](#prerequisites)
3. [Installation](#installation)
4. [Environment Variables](#environment-variables)
5. [Running Tests](#running-tests)
6. [Troubleshooting](#troubleshooting)
7. [Architecture Overview](#architecture-overview)

## Quick Start

```bash
# Run the setup script
./scripts/setup-webrtc.sh

# Edit environment variables
nano .env.local

# Run tests
npm test

# Start development server
npm run dev
```

## Prerequisites

### Required Software

- **Node.js**: 18.0.0 or higher
  ```bash
  node --version  # Should be v18 or higher
  ```

- **npm**: 8.0.0 or higher (or pnpm/yarn)
  ```bash
  npm --version
  ```

### Optional Software

- **ffmpeg**: For audio format conversion
  ```bash
  ffmpeg -version
  ```
  - **macOS**: `brew install ffmpeg`
  - **Ubuntu**: `sudo apt install ffmpeg`
  - **Windows**: `choco install ffmpeg`

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/MizukiMachine/voice-agent-vapi-cartesia.git
cd voice-agent-vapi-cartesia
```

### 2. Install Dependencies

```bash
npm install
# or
pnpm install
# or
yarn install
```

### 3. Run Setup Script

```bash
./scripts/setup-webrtc.sh
```

This script will:
- Check Node.js version
- Install npm dependencies
- Check for ffmpeg
- Create `.env.local` from template

### 4. Configure Environment Variables

Edit `.env.local` and add your API keys:

```bash
# Vapi Configuration
VAPI_API_KEY=your_vapi_api_key_here
VAPI_PUBLIC_KEY=your_vapi_public_key_here
VAPI_ASSISTANT_ID=your_assistant_id_here

# Cartesia Configuration
CARTESIA_API_KEY=your_cartesia_api_key_here
CARTESIA_VOICE_ID=79a125e8-cd45-4c05-9a83-4b0d4b0f3c29
CARTESIA_DEFAULT_SPEED=1.0
```

## Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `VAPI_API_KEY` | Vapi platform API key | `vapi_xxxx...` |
| `VAPI_PUBLIC_KEY` | Vapi public key | `public_xxxx...` |
| `VAPI_ASSISTANT_ID` | Vapi assistant ID | `assistant_xxxx...` |
| `CARTESIA_API_KEY` | Cartesia API key | `cu_xxxx...` |
| `CARTESIA_VOICE_ID` | Default voice ID | `79a125e8-cd45-4c05-9a83-4b0d4b0f3c29` |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `CARTESIA_DEFAULT_SPEED` | Voice speed (0.5 - 2.0) | `1.0` |
| `CARTESIA_SAMPLE_RATE` | Audio sample rate | `24000` |
| `CARTESIA_OUTPUT_FORMAT` | Audio format | `pcm16` |
| `ICE_SERVER_URLS` | STUN/TURN servers | Google STUN |

### Supabase Variables (if using database)

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### Google Cloud Variables (if using tools)

```bash
GOOGLE_MAPS_API_KEY=your-google-maps-key
GOOGLE_CLIENT_ID=your-oauth-client-id
GOOGLE_CLIENT_SECRET=your-oauth-client-secret
```

## Running Tests

### Run All Tests

```bash
npm test
```

### Run Specific Test Suite

```bash
# Vapi Client tests
npm test vapi-client.test.ts

# Cartesia Client tests
npm test cartesia-client.test.ts

# Audio Gateway tests
npm test audio-gateway.test.ts

# Integration tests
npm test audio-pipeline.test.ts
```

### Run Tests with Coverage

```bash
npm run test:coverage
```

### Run Tests in Watch Mode

```bash
npm run test:watch
```

### Expected Test Results

All tests should pass with coverage > 80%:

```
Test Suites: 6 passed, 6 total
Tests:       85 passed, 85 total
Coverage:    82.5%
```

## Troubleshooting

### Common Issues

#### 1. WebSocket Connection Errors

**Error**: `WebSocket connection failed`

**Solutions**:
- Check API keys are correct
- Verify network connectivity
- Check if Vapi/Cartesia services are operational

#### 2. Audio Conversion Errors

**Error**: `Audio conversion failed`

**Solutions**:
- Install ffmpeg: `brew install ffmpeg` (macOS)
- Verify input audio format is PCM 16-bit, 16kHz
- Check audio buffer size is sufficient (> 100 bytes)

#### 3. Module Not Found Errors

**Error**: `Cannot find module '@/app/lib/xxx'`

**Solutions**:
- Run `npm install` to ensure dependencies are installed
- Check `tsconfig.json` has correct path mappings
- Verify file exists at expected location

#### 4. Environment Variable Errors

**Error**: `API key not found`

**Solutions**:
- Ensure `.env.local` file exists
- Check variable names match exactly (case-sensitive)
- Restart development server after changing `.env.local`

#### 5. Test Timeout Errors

**Error**: `Test timeout exceeded`

**Solutions**:
- Increase test timeout in jest.config.js
- Check for async operations not properly awaited
- Verify WebSocket connections are properly closed

### Debug Mode

Enable debug logging:

```bash
# Set debug environment variable
export DEBUG=*

# Or in .env.local
DEBUG=*
```

### Logs

Check application logs:

```bash
# View server logs
npm run dev

# View test logs
npm test -- --verbose
```

## Architecture Overview

### Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        Voice Engine                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐         ┌─────────────┐         ┌──────────┐  │
│  │   Client    │◄───────►│ Audio       │◄───────►│  Vapi    │  │
│  │  (WebRTC)   │  Audio  │  Gateway    │  Text   │  (STT+   │  │
│  └─────────────┘         └─────────────┘         │   LLM)   │  │
│                                                  └──────────┘  │
│                                                       │         │
│                                                       ▼         │
│                                                  ┌──────────┐   │
│                                                  │ Cartesia │   │
│                                                  │   (TTS)  │   │
│                                                  └──────────┘   │
│                                                       │         │
│                                                       ▼         │
│                                                  ┌──────────┐   │
│                                                  │  Client  │   │
│                                                  │ (Playback│   │
│                                                  └──────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Audio Pipeline Flow

1. **Client → Vapi**: Audio is sent to Vapi for speech-to-text
2. **Vapi → Gateway**: Text response is returned
3. **Gateway → Cartesia**: Text is sent to Cartesia for TTS
4. **Cartesia → Client**: Synthesized audio is returned to client

### Key Components

| Component | File | Purpose |
|-----------|------|---------|
| VapiClient | `src/app/lib/vapi-client.ts` | WebSocket client for Vapi |
| CartesiaClient | `src/app/lib/cartesia-client.ts` | WebSocket client for Cartesia |
| AudioGateway | `src/app/lib/audio-gateway.ts` | Audio routing and orchestration |
| AudioConverter | `src/app/lib/audio-converter.ts` | Format conversion (Opus → mu-law) |

## Development Workflow

### 1. Make Changes

Edit source files in `src/app/lib/`

### 2. Run Tests

```bash
npm test
```

### 3. Check Coverage

```bash
npm run test:coverage
```

### 4. Commit Changes

```bash
git add .
git commit -m "feat: description of changes"
```

## Additional Resources

- [Vapi Documentation](https://docs.vapi.ai/)
- [Cartesia Documentation](https://docs.cartesia.ai/)
- [WebRTC MDN Guide](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API)
- [Project CLAUDE.md](../CLAUDE.md)
- [Architecture Documentation](./ARCHITECTURE.md)

## Support

For issues or questions:
- Check existing [GitHub Issues](https://github.com/MizukiMachine/voice-agent-vapi-cartesia/issues)
- Create a new issue with detailed description
- Include logs and error messages
