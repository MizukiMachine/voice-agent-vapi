/**
 * Type Definitions for Voice Engine PoC
 * Core types for API requests/responses and internal data structures
 */

// ============================================================
// Legacy UI Types (keep for compatibility)
// ============================================================

export interface User {
  id: string;
  name: string;
  hasVoiceProfile: boolean;
  createdAt: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

export interface SessionState {
  isActive: boolean;
  sessionId: string | null;
  userId: string | null;
  userName: string | null;
}

export interface LocationData {
  latitude: number;
  longitude: number;
  placeName?: string;
}

export interface NotificationData {
  type: 'message' | 'calendar' | 'reminder' | 'alert' | 'custom';
  title?: string;
  content: string;
  appName?: string;
}

// ============================================================
// User & Memory Types
// ============================================================

/**
 * User profile from database
 */
export interface UserProfile {
  id: string;
  name: string;
  voice_profile_blob: string | null;
  location_cool_time: number;
  location_search_radius: number;
  notification_tts_enabled: boolean;
  notification_tts_max_length: number;
  notification_tts_include_title: boolean;
  notification_tts_include_body: boolean;
  created_at: string;
}

/**
 * User memory slot (fixed 10 slots per user)
 */
export interface UserMemorySlot {
  id: string;
  user_id: string;
  slot_number: number;
  content: string;
  updated_at: string;
}

/**
 * User POI notification history (for cool-time management)
 */
export interface UserPoiNotification {
  id: string;
  user_id: string;
  poi_id: string;
  poi_name: string;
  notified_at: string;
  latitude: number;
  longitude: number;
}

// ============================================================
// Session Types (Vapi + Cartesia Architecture)
// ============================================================

/**
 * Voice session configuration
 */
export interface VoiceSession {
  sessionId: string;
  userId: string;
  systemPrompt: string;
  createdAt: number;
  vapiConfig: VapiConfig;
  cartesiaConfig: CartesiaConfig;
}

/**
 * Vapi configuration
 */
export interface VapiConfig {
  publicKey: string;
  assistantId: string;
  apiKey: string; // Server-side only
}

/**
 * Cartesia configuration
 */
export interface CartesiaConfig {
  apiKey: string; // Server-side only
  voiceId: string;
  speed: number; // 0.5 - 2.0
  sampleRate: number; // e.g., 16000, 24000, 44100
  outputFormat: 'pcm16' | 'mulaw' | 'opus';
}

/**
 * WebRTC server configuration
 */
export interface WebRTCServerConfig {
  sessionId: string;
  sdpOffer: string;
  iceServers: RTCIceServer[];
  vapiConfig: {
    publicKey: string;
    assistantId: string;
  };
}

/**
 * ICE server configuration for WebRTC
 */
export interface RTCIceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

// ============================================================
// Vapi Types
// ============================================================

/**
 * Vapi function call event
 */
export interface VapiFunctionCall {
  callId: string;
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * Vapi message types
 */
export interface VapiMessage {
  type: 'conversation-item' | 'function-call' | 'response' | 'error';
  data: unknown;
}

/**
 * Vapi response types
 */
export interface VapiTextResponse {
  text: string;
  isFinal: boolean;
}

// ============================================================
// Cartesia Types
// ============================================================

/**
 * Cartesia TTS options
 */
export interface CartesiaTTSOptions {
  /**
   * Voice ID to use for synthesis
   */
  voiceId?: string;
  /**
   * Playback speed (0.5 - 2.0)
   */
  speed?: number;
  /**
   * Sample rate for output audio
   */
  sampleRate?: number;
  /**
   * Output format
   */
  outputFormat?: 'pcm16' | 'mulaw' | 'opus';
  /**
   * Language code
   */
  language?: string;
}

/**
 * Cartesia WebSocket context
 */
export interface CartesiaContext {
  context_id: string;
}

/**
 * Cartesia TTS response
 */
export interface CartesiaTTSResponse {
  context_id: string;
  audio: string; // Base64 encoded audio
  is_final: boolean;
}

// ============================================================
// API Request/Response Types
// ============================================================

/**
 * POST /api/session request
 */
export interface CreateSessionRequest {
  userId: string;
  config?: {
    voiceId?: string;
    speed?: number;
  };
}

/**
 * POST /api/session response (new format for Vapi+Cartesia)
 */
export interface CreateSessionResponse {
  sessionId: string;
  serverConfig: WebRTCServerConfig;
}

/**
 * POST /api/session response (legacy OpenAI format - for compatibility)
 */
export interface LegacySessionResponse {
  sessionId: string;
  clientSecret: string;
  model: string;
}

// ============================================================
// Tool API Types
// ============================================================

/**
 * Calendar action request
 */
export interface CalendarActionRequest {
  action: 'list' | 'create';
  summary?: string;
  start?: string;
  end?: string;
  description?: string;
}

/**
 * Calendar action response
 */
export interface CalendarActionResponse {
  success: boolean;
  message?: string;
  events?: Array<{
    summary: string;
    start: string;
    end: string;
  }>;
}

/**
 * Docs action request
 */
export interface DocsActionRequest {
  action: 'create' | 'append' | 'read';
  title?: string;
  documentId?: string;
  content?: string;
}

/**
 * Docs action response
 */
export interface DocsActionResponse {
  success: boolean;
  message?: string;
  documentId?: string;
  content?: string;
}

/**
 * Memo action request
 */
export interface MemoActionRequest {
  slot_number: number;
  content: string;
}

/**
 * Memo action response
 */
export interface MemoActionResponse {
  success: boolean;
  message?: string;
  slot?: {
    slot_number: number;
    content: string;
  };
}

/**
 * Map/location action request
 */
export interface MapActionRequest {
  latitude: number;
  longitude: number;
  radius?: number;
}

/**
 * Map/location action response
 */
export interface MapActionResponse {
  success: boolean;
  address?: string;
  places?: Array<{
    name: string;
    types: string[];
    vicinity: string;
  }>;
}

// ============================================================
// Simulator Types
// ============================================================

/**
 * Location simulator request
 */
export interface LocationSimulatorRequest {
  place_name: string;
  cool_time?: number;
  radius?: number;
}

/**
 * Notification simulator request
 */
export interface NotificationSimulatorRequest {
  app_name: string;
  title: string;
  body: string;
  thread_id?: string;
}

// ============================================================
// Cockpit Types
// ============================================================

/**
 * Enrollment request
 */
export interface EnrollmentRequest {
  name: string;
  voice_profile_blob: string; // Base64 encoded
}

/**
 * Enrollment response
 */
export interface EnrollmentResponse {
  success: boolean;
  userId: string;
  message?: string;
}

/**
 * Users list response
 */
export interface UsersListResponse {
  users: Array<{
    id: string;
    name: string;
    created_at: string;
  }>;
}

/**
 * User selection request
 */
export interface UserSelectionRequest {
  userId: string;
}

/**
 * User settings
 */
export interface UserSettings {
  location_cool_time?: number;
  location_search_radius?: number;
  notification_tts_enabled?: boolean;
  notification_tts_max_length?: number;
  notification_tts_include_title?: boolean;
  notification_tts_include_body?: boolean;
}

// ============================================================
// Error Types
// ============================================================

/**
 * API error response
 */
export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    traceId?: string;
  };
}

/**
 * Error codes
 */
export const ErrorCodes = {
  INVALID_REQUEST: 'INVALID_REQUEST',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  SUPABASE_ERROR: 'SUPABASE_ERROR',
  GOOGLE_API_ERROR: 'GOOGLE_API_ERROR',
  OPENAI_ERROR: 'OPENAI_ERROR',
  VAPI_ERROR: 'VAPI_ERROR',
  CARTESIA_ERROR: 'CARTESIA_ERROR',
  WEBRTC_ERROR: 'WEBRTC_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

// ============================================================
// Logging Types
// ============================================================

/**
 * Log entry
 */
export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  service: string;
  message: string;
  metadata?: Record<string, unknown>;
  traceId?: string;
}

/**
 * Log stream request
 */
export interface LogStreamRequest {
  level?: 'info' | 'warn' | 'error' | 'debug' | 'all';
  limit?: number;
  service?: string;
}
