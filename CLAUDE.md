# Voice Engine PoC - Claude Code Work Guidelines

## Project Overview

**Purpose**: Web-based PoC for API connectivity verification and backend logic validation as a precursor to iOS Native / Meta Glass app development

**Design Philosophy**: Client is Thin, Server is Fat
- Client: Debug Console (voice/mock data transmission, response verification)
- Server: Core Logic (complete aggregation of memory, decision-making, tool execution)
- **Mandatory**: Design that allows API server to be used without modification when migrating to native apps

## Log-Driven Development

### Overview

This project adopts "Log-Driven Development." All implementation work should proceed while recording as work logs.

### Purpose of Logs

1. **Maintain Consistency**: Prevent drift from past discussions and decisions
2. **Traceability**: Clarify what was implemented when, and why decisions were made
3. **Handoff**: Continue work without losing context even in new sessions
4. **Debugging**: Trace back implementation history when problems occur

### Log Structure

```
docs/
├── ARCHITECTURE.md          # System architecture, tech stack
├── IMPLEMENTATION_PLAN.md   # Implementation plan (Issue breakdown, DAG)
├── API_SPECIFICATION.md     # API specification
└── logs/
    ├── YYYY-MM-DD-001.md    # Daily work log (sequential)
    ├── YYYY-MM-DD-002.md
    └── ...
```

### Work Log Format

Each work log file should be written in the following format:

```markdown
# Work Log: YYYY-MM-DD-NNN

## Session Information
- Start Time: HH:MM
- Target Phase/Issue: Phase X, Issue #Y

## Work Goals
- What to achieve in this session

## Implementation Content

### 1. [Work Item]
- Implemented file: `path/to/file.ts`
- Overview of changes
- Important decisions and reasons

### 2. [Work Item]
...

## Problems Encountered and Solutions
- Problem: XXX
- Solution: YYY

## Handoff to Next Session
- Unfinished tasks
- Points to note

## Created/Updated File List
- `path/to/file1.ts` - Created
- `path/to/file2.ts` - Updated
```

### Pre-Work Routine

1. Create new log file in `docs/logs/`
2. Check previous log and understand handoff items
3. Document work goals for this session
4. Start implementation

### Post-Work Routine

1. Record implementation content in log
2. Document problems encountered and solutions
3. Document handoff to next session
4. Update created/updated file list

## Priority Rules

- **High**: Completion of server-side logic (API, DB, Webhook)
- **High**: Comprehensive testing of backend logic through simulator functionality
- **Low**: UI design (developer admin console level is acceptable)

## Strict Rules

> **strict_rule**: Do not spend effort on web-specific hacks (sleep prevention, etc.), focus on API connectivity verification

- Assume browser foreground for operation verification
- Do not implement WakeLock/black screen prevention
- UI at developer admin console level is acceptable

## Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Framework | Next.js 16 (App Router) | SSR, API Routes |
| Language | TypeScript 5.x | Type safety |
| UI | React 19, Tailwind CSS | Simple debug UI |
| Voice AI | OpenAI Realtime API (Direct) | GPT-4o, TTS/STT, Function Calling |
| Database | Supabase PostgreSQL | user_profiles, user_memories |
| External APIs | Google Calendar, Docs, Geocoding | Tool execution |
| Deployment | Cloud Run | Serverless container |

## Directory Structure

```
voice-engine-studio/
├── CLAUDE.md                 # This file
├── docs/
│   ├── ARCHITECTURE.md       # System architecture diagram
│   ├── IMPLEMENTATION_PLAN.md # Implementation plan
│   ├── API_SPECIFICATION.md  # API specification
│   └── logs/                 # Work logs
├── src/
│   └── app/
│       ├── page.tsx          # Main debug console
│       ├── api/
│       │   ├── session/route.ts       # OpenAI Realtime session creation
│       │   ├── tools/
│       │   │   ├── calendar/route.ts  # Google Calendar integration
│       │   │   ├── docs/route.ts      # Google Docs integration
│       │   │   ├── location/route.ts  # Maps/Geocoding integration
│       │   │   └── memo/route.ts      # User memory slots
│       │   ├── simulate/
│       │   │   ├── location/route.ts  # Location simulator
│       │   │   └── notification/route.ts
│       │   ├── cockpit/
│       │   │   ├── enroll/route.ts    # User enrollment
│       │   │   ├── users/route.ts     # User list
│       │   │   └── select/route.ts    # User selection
│       │   └── health/route.ts        # Health check
│       ├── components/
│       │   ├── cockpit/
│       │   ├── voice/
│       │   │   └── VoiceInterface.tsx # WebRTC client for OpenAI Realtime
│       │   ├── simulator/
│       │   └── log/
│       └── lib/
│           ├── supabase.ts
│           ├── logger.ts
│           └── errors.ts
├── supabase/
│   └── functions/
│       └── extract-facts/
│           └── index.ts
├── Dockerfile                # Cloud Run deployment
├── cloudbuild.yaml           # Cloud Build configuration
└── types/
```

## Environment Variables

```bash
# ============================================================
# Safe to make public (client-side - NEXT_PUBLIC_* prefix)
# ============================================================

# Supabase (Anon Key is protected by RLS, public by design)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# App URL (deployment URL)
NEXT_PUBLIC_APP_URL=

# ============================================================
# MUST NOT BE MADE PUBLIC (server-side only)
# ============================================================

# Supabase (Service Role Key - bypasses RLS, never public)
SUPABASE_SERVICE_ROLE_KEY=

# Google Cloud (OAuth credentials - never public)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REFRESH_TOKEN=
GOOGLE_MAPS_API_KEY=

# OpenAI (API Key - never public)
OPENAI_API_KEY=
```

### Secrets for Supabase Edge Functions

Environment variables used in Edge Functions need to be set separately as Supabase secrets:

```bash
# Set secrets with Supabase CLI
supabase secrets set OPENAI_API_KEY=sk-xxx
```

## OpenAI Realtime API Integration

### Architecture

```
┌─────────────────┐         WebRTC (SDP)         ┌──────────────────────┐
│   Browser       │◄────────────────────────────►│   OpenAI Realtime    │
│   Client        │      (Data Channel)          │      API Server      │
└────────┬────────┘                                └──────────────────────┘
         │                                                 │
         │                                                 │
         │ REST API                                        │ Function Call
         │                                                 │ (via Data Channel)
         ▼                                                 ▼
┌─────────────────┐         Tool Execution        ┌──────────────────────┐
│  Next.js API    │◄──────────────────────────────│  External Services   │
│   /api/tools/*  │                                │  (Calendar/Docs/etc) │
└─────────────────┘                                └──────────────────────┘
```

### Session Flow

1. **Client** → `POST /api/session` → Server
2. **Server** → `POST https://api.openai.com/v1/realtime/sessions` → OpenAI
3. **OpenAI** → `{ client_secret, model }` → Server
4. **Server** → `{ sessionId, clientSecret, model }` → Client
5. **Client**: Establish WebRTC PeerConnection
6. **Client** → SDP Offer → OpenAI Realtime API
7. **OpenAI** → SDP Answer → Client
8. **Start Conversation**: Bidirectional audio stream communication
9. **Function Call**: Route to `/api/tools/*` via Data Channel

### Function Calling

```
OpenAI → (response.function_call_arguments.done)
       → { call_id, name, arguments }
       → Client → /api/tools/{name}
       → External API
       → Response → Client
       → (conversation.item.create + response.create)
       → OpenAI
```
