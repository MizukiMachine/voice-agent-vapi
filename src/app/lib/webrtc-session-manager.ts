/**
 * WebRTC Session Manager
 * Manages WebRTC sessions for server-side audio gateway
 *
 * This module handles:
 * - Session lifecycle (create, get, close, cleanup)
 * - SDP offer/answer generation using werift
 * - Audio routing between client, Vapi, and Cartesia
 * - Peer connection management
 */

import { randomUUID } from 'crypto';
import { createServiceLogger } from './logger';
import {
  createWebRTCPeerManager,
  createDefaultIceServers,
  type WebRTCPeerManager,
  type WebRTCSessionEvents,
  type PeerConnectionConfig,
} from './webrtc-peer-manager';

const logger = createServiceLogger('webrtc-session-manager');

// ============================================================
// Types
// ============================================================

export interface WebRTCSession {
  sessionId: string;
  userId: string;
  systemPrompt: string;
  createdAt: number;
  lastActivityAt: number;
  status: 'created' | 'connected' | 'disconnected' | 'error';
  // Peer connection manager (initialized when needed)
  peerManager?: WebRTCPeerManager;
}

export interface SessionConfig {
  vapiKey: string;
  vapiPublicKey: string;
  vapiAssistantId: string;
  cartesiaApiKey: string;
  cartesiaVoiceId: string;
  cartesiaSpeed: number;
}

// ============================================================
// Session Store
// ============================================================

/**
 * In-memory session store
 * In production, use Redis or similar for distributed systems
 */
class SessionStore {
  private sessions = new Map<string, WebRTCSession>();
  private userSessions = new Map<string, Set<string>>();

  /**
   * Create a new session
   */
  create(userId: string, systemPrompt: string): WebRTCSession {
    const sessionId = randomUUID();
    const now = Date.now();

    const session: WebRTCSession = {
      sessionId,
      userId,
      systemPrompt,
      createdAt: now,
      lastActivityAt: now,
      status: 'created',
    };

    this.sessions.set(sessionId, session);

    // Track user's sessions
    if (!this.userSessions.has(userId)) {
      this.userSessions.set(userId, new Set());
    }
    this.userSessions.get(userId)!.add(sessionId);

    logger.info('Session created', { sessionId, userId });
    return session;
  }

  /**
   * Get a session by ID
   */
  get(sessionId: string): WebRTCSession | undefined {
    const session = this.sessions.get(sessionId);
    if (session) {
      // Update last activity
      session.lastActivityAt = Date.now();
    }
    return session;
  }

  /**
   * Update session status
   */
  updateStatus(sessionId: string, status: WebRTCSession['status']): boolean {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = status;
      session.lastActivityAt = Date.now();
      logger.info('Session status updated', { sessionId, status });
      return true;
    }
    return false;
  }

  /**
   * Close a session
   */
  close(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    // Remove from user sessions
    const userSessionIds = this.userSessions.get(session.userId);
    if (userSessionIds) {
      userSessionIds.delete(sessionId);
      if (userSessionIds.size === 0) {
        this.userSessions.delete(session.userId);
      }
    }

    // Remove session
    this.sessions.delete(sessionId);

    logger.info('Session closed', { sessionId, userId: session.userId });
    return true;
  }

  /**
   * Get all sessions for a user
   */
  getByUser(userId: string): WebRTCSession[] {
    const sessionIds = this.userSessions.get(userId);
    if (!sessionIds) {
      return [];
    }

    const sessions: WebRTCSession[] = [];
    for (const sessionId of sessionIds) {
      const session = this.sessions.get(sessionId);
      if (session) {
        sessions.push(session);
      }
    }

    return sessions;
  }

  /**
   * Clean up old sessions
   */
  cleanup(maxAge: number = 60 * 60 * 1000): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.lastActivityAt > maxAge) {
        this.close(sessionId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info('Old sessions cleaned up', { count: cleaned });
    }

    return cleaned;
  }

  /**
   * Get session count
   */
  get count(): number {
    return this.sessions.size;
  }
}

// ============================================================
// Session Manager
// ============================================================

export const sessionStore = new SessionStore();

/**
 * Cleanup old sessions periodically
 */
const CLEANUP_INTERVAL = 10 * 60 * 1000; // 10 minutes
const SESSION_MAX_AGE = 60 * 60 * 1000; // 1 hour

if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    sessionStore.cleanup(SESSION_MAX_AGE);
  }, CLEANUP_INTERVAL);
}

/**
 * Create a new WebRTC session
 */
export function createWebRTCSession(
  userId: string,
  systemPrompt: string
): WebRTCSession {
  return sessionStore.create(userId, systemPrompt);
}

/**
 * Get a WebRTC session by ID
 */
export function getWebRTCSession(sessionId: string): WebRTCSession | undefined {
  return sessionStore.get(sessionId);
}

/**
 * Close a WebRTC session
 * Also closes the peer connection if it exists
 */
export async function closeWebRTCSession(sessionId: string): Promise<boolean> {
  // Close peer connection first
  await closePeerConnection(sessionId);

  return sessionStore.close(sessionId);
}

/**
 * Update session status
 */
export function updateSessionStatus(
  sessionId: string,
  status: WebRTCSession['status']
): boolean {
  return sessionStore.updateStatus(sessionId, status);
}

/**
 * Get all sessions for a user
 */
export function getUserSessions(userId: string): WebRTCSession[] {
  return sessionStore.getByUser(userId);
}

// ============================================================
// WebRTC Peer Connection Management
// ============================================================

/**
 * Create and initialize a peer connection manager for a session
 */
export function createPeerConnection(
  sessionId: string,
  events?: WebRTCSessionEvents,
  config?: Partial<PeerConnectionConfig>
): WebRTCPeerManager {
  const session = getWebRTCSession(sessionId);
  if (!session) {
    throw new Error(`Session ${sessionId} not found`);
  }

  // Use default ICE servers if not provided
  const iceServers = config?.iceServers ?? createDefaultIceServers();

  const peerManager = createWebRTCPeerManager(
    {
      sessionId,
      iceServers,
      iceTransportPolicy: config?.iceTransportPolicy,
      bundlePolicy: config?.bundlePolicy,
    },
    events
  );

  // Store peer manager in session
  session.peerManager = peerManager;

  logger.info('Peer connection created for session', { sessionId });

  return peerManager;
}

/**
 * Get peer connection manager for a session
 */
export function getPeerConnection(sessionId: string): WebRTCPeerManager | undefined {
  const session = getWebRTCSession(sessionId);
  return session?.peerManager;
}

/**
 * Close peer connection for a session
 */
export async function closePeerConnection(sessionId: string): Promise<void> {
  const session = getWebRTCSession(sessionId);
  if (session?.peerManager) {
    await session.peerManager.close();
    session.peerManager = undefined;
    logger.info('Peer connection closed for session', { sessionId });
  }
}

// ============================================================
// Re-exports for convenience
// ============================================================

// Re-export types and functions from webrtc-peer-manager
export type {
  RTCIceServer,
  WebRTCSessionEvents,
  RTCPeerConnectionState,
  RTCIceConnectionState,
} from './webrtc-peer-manager';

export {
  createDefaultIceServers,
} from './webrtc-peer-manager';
