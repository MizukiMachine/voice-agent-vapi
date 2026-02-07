import { NextRequest, NextResponse } from 'next/server';
import {
  getUserProfile,
  getUserMemorySlots,
  isSupabaseConfigured,
  UserMemorySlot,
} from '@/app/lib/supabase';
import { ApiError, ErrorCodes, createErrorResponse } from '@/app/lib/errors';
import {
  isValidUUID,
  validateSessionConfig,
  type SessionConfigValidation,
} from '@/app/lib/validation';
import { logRequestError, getTraceId, createServiceLogger } from '@/app/lib/logger';
import {
  createWebRTCSession,
  generateSDPOffer,
  generateIceServers,
  type SDPOfferConfig,
} from '@/app/lib/webrtc-session-manager';
import type {
  CreateSessionRequest,
  CreateSessionResponse,
  WebRTCServerConfig,
  RTCIceServer,
} from '@/app/types';

const logger = createServiceLogger('session');

// ============================================================
// Environment Variables
// ============================================================

// Vapi Configuration
const VAPI_API_KEY = process.env.VAPI_API_KEY;
const VAPI_PUBLIC_KEY = process.env.VAPI_PUBLIC_KEY;
const VAPI_ASSISTANT_ID = process.env.VAPI_ASSISTANT_ID;

// Cartesia Configuration
const CARTESIA_API_KEY = process.env.CARTESIA_API_KEY;
const CARTESIA_VOICE_ID = process.env.CARTESIA_VOICE_ID || '79a125e8-cd45-4c05-9a83-4b0d4b0f3c29'; // Default: Lady voice
const CARTESIA_DEFAULT_SPEED = parseFloat(process.env.CARTESIA_DEFAULT_SPEED || '1.0');

// Legacy: OpenAI (for backward compatibility during migration)
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const REALTIME_MODEL = 'gpt-realtime';

const logger = createServiceLogger('session');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const REALTIME_MODEL = 'gpt-realtime';

/**
 * Session store (in-memory, for PoC)
 * In production, use Redis or similar
 *
 * NOTE: Using the shared sessionStore from webrtc-session-manager
 * This is kept here for backward compatibility with legacy OpenAI sessions
 */
interface VoiceSession {
  sessionId: string;
  userId: string;
  systemPrompt: string;
  createdAt: number;
}

export const sessionStore = new Map<string, VoiceSession>();

/**
 * Cleanup sessions older than 1 hour
 */
function cleanupOldSessions() {
  const oneHour = 60 * 60 * 1000;
  const now = Date.now();

  for (const [sessionId, session] of sessionStore.entries()) {
    if (now - session.createdAt > oneHour) {
      sessionStore.delete(sessionId);
    }
  }
}

// Run cleanup every 10 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(cleanupOldSessions, 10 * 60 * 1000);
}

/**
 * Tool definitions for OpenAI Realtime API
 */
const REALTIME_TOOLS = [
  {
    type: 'function' as const,
    name: 'calendar_action',
    description: 'Google Calendarで予定を確認・作成します。actionは "list"（予定一覧）または "create"（予定作成）です。',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'create'],
          description: 'リスト表示か作成か',
        },
        summary: {
          type: 'string',
          description: '予定のタイトル（createの場合必須）',
        },
        start: {
          type: 'string',
          description: '開始日時（ISO 8601形式、createの場合必須）',
        },
        end: {
          type: 'string',
          description: '終了日時（ISO 8601形式、createの場合必須）',
        },
        description: {
          type: 'string',
          description: '予定の説明',
        },
      },
      required: ['action'],
    },
  },
  {
    type: 'function' as const,
    name: 'docs_action',
    description: 'Google Docsでドキュメントを作成・編集します。',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'append', 'read'],
          description: '作成、追記、読み取りのいずれか',
        },
        title: {
          type: 'string',
          description: 'ドキュメントタイトル（createの場合必須）',
        },
        documentId: {
          type: 'string',
          description: 'ドキュメントID（append/readの場合必須）',
        },
        content: {
          type: 'string',
          description: '書き込む内容',
        },
      },
      required: ['action'],
    },
  },
  {
    type: 'function' as const,
    name: 'memo_action',
    description: 'ユーザーが覚えておいてほしい情報を保存します。スロット1〜10を指定します。',
    parameters: {
      type: 'object',
      properties: {
        slot_number: {
          type: 'number',
          description: '保存先スロット番号（1〜10）',
        },
        content: {
          type: 'string',
          description: '保存する内容（200文字以内）',
        },
      },
      required: ['slot_number', 'content'],
    },
  },
  {
    type: 'function' as const,
    name: 'map_action',
    description: '座標から位置情報（住所、近隣の場所）を取得します。',
    parameters: {
      type: 'object',
      properties: {
        latitude: {
          type: 'number',
          description: '緯度',
        },
        longitude: {
          type: 'number',
          description: '経度',
        },
      },
      required: ['latitude', 'longitude'],
    },
  },
];

/**
 * POST /api/session
 * Create a new voice session with WebRTC server configuration
 *
 * NEW FORMAT (Vapi + Cartesia):
 * Request body:
 * {
 *   "userId": string,
 *   "config": {
 *     "voiceId": string (optional),
 *     "speed": number (optional, 0.5 - 2.0)
 *   }
 * }
 *
 * Response:
 * {
 *   "sessionId": string,
 *   "serverConfig": {
 *     "sessionId": string,
 *     "sdpOffer": string,
 *     "iceServers": RTCIceServer[],
 *     "vapiConfig": {
 *       "publicKey": string,
 *       "assistantId": string
 *     }
 *   }
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, config } = body as CreateSessionRequest;

    // Validate userId
    if (!userId || !isValidUUID(userId)) {
      return NextResponse.json(
        createErrorResponse(ErrorCodes.INVALID_REQUEST, 'userId must be a valid UUID'),
        { status: 400 }
      );
    }

    // Validate optional config
    if (config) {
      const validation = validateSessionConfig(config);
      if (!validation.valid) {
        return NextResponse.json(
          createErrorResponse(ErrorCodes.INVALID_REQUEST, validation.errors.join(', ')),
          { status: 400 }
        );
      }
    }

    // Check Vapi configuration
    if (!VAPI_API_KEY || !VAPI_PUBLIC_KEY || !VAPI_ASSISTANT_ID) {
      return NextResponse.json(
        createErrorResponse(ErrorCodes.VAPI_ERROR, 'Vapi is not configured'),
        { status: 500 }
      );
    }

    // Check Cartesia configuration
    if (!CARTESIA_API_KEY) {
      return NextResponse.json(
        createErrorResponse(ErrorCodes.CARTESIA_ERROR, 'Cartesia is not configured'),
        { status: 500 }
      );
    }

    // Check Supabase
    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        createErrorResponse(ErrorCodes.SUPABASE_ERROR, 'Supabase is not configured'),
        { status: 500 }
      );
    }

    // Get user profile
    const profile = await getUserProfile(userId);
    if (!profile) {
      return NextResponse.json(
        createErrorResponse(ErrorCodes.USER_NOT_FOUND, 'User not found'),
        { status: 404 }
      );
    }

    // Get user memory slots
    const memorySlots = await getUserMemorySlots(userId);
    const systemPrompt = buildSystemPrompt(profile, memorySlots);

    // Create WebRTC session
    const session = createWebRTCSession(userId, systemPrompt);

    // Get user's configured speed or use default
    const speed = config?.speed ?? CARTESIA_DEFAULT_SPEED;
    const voiceId = config?.voiceId ?? CARTESIA_VOICE_ID;

    // Generate SDP offer for client
    const iceServers = generateIceServers();
    const sdpOffer = generateSDPOffer({
      sessionId: session.sessionId,
      iceServers,
    });

    // Build server config response
    const serverConfig: WebRTCServerConfig = {
      sessionId: session.sessionId,
      sdpOffer,
      iceServers,
      vapiConfig: {
        publicKey: VAPI_PUBLIC_KEY,
        assistantId: VAPI_ASSISTANT_ID,
      },
    };

    logger.info('WebRTC session created', {
      sessionId: session.sessionId,
      userId,
      voiceId,
      speed,
    });

    const response: CreateSessionResponse = {
      sessionId: session.sessionId,
      serverConfig,
    };

    return NextResponse.json(response);
  } catch (error) {
    const traceId = await getTraceId();
    logRequestError('/api/session', 'POST', error instanceof Error ? error : { message: String(error) }, traceId);

    if (error instanceof ApiError) {
      return NextResponse.json(
        createErrorResponse(error.code, error.message),
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to create session'),
      { status: 500 }
    );
  }
}

/**
 * Build system prompt with user profile and memory slots
 */
function buildSystemPrompt(profile: { name: string }, memorySlots: UserMemorySlot[]): string {
  const basePrompt = `あなたは${profile.name}さんの個人アシスタントです。
親しみやすく、丁寧な日本語で会話してください。
ユーザーの質問に答えたり、タスクを手伝ったりします。

利用可能なツール:
- calendar_action: Google Calendarで予定を確認・作成
- docs_action: Google Docsでドキュメントを作成・編集
- memo_action: ユーザーが覚えておいてほしいことを保存（スロット1-10を指定）
- map_action: 現在位置の情報を取得

ユーザーが「覚えておいて」「メモして」などと言った場合は、memo_actionツールを使用してください。
位置情報が必要な場合は、map_actionツールを使用してください。`;

  // Build memory slots section
  const filledSlots = memorySlots.filter((s) => s.content.trim() !== '');
  if (filledSlots.length > 0) {
    const memorySection = filledSlots
      .map((s) => `${s.slot_number}. ${s.content}`)
      .join('\n');

    return `${basePrompt}

## あなたが覚えていること:
${memorySection}

上記の情報を会話に自然に活用してください。ただし、情報を無理に言及する必要はありません。`;
  }

  return basePrompt;
}
