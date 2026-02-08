/**
 * WebRTC Peer Connection Manager
 *
 * Manages WebRTC peer connections using the werift library.
 * Handles SDP offer/answer generation, ICE candidate exchange,
 * DTLS handshake, and media track management.
 *
 * This module provides a complete WebRTC implementation for server-side
 * audio gateway functionality.
 */

import {
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
  RTCIceCandidateInit,
  MediaStreamTrack,
  RTCRtpTransceiver,
} from 'werift';
import { createServiceLogger } from './logger';

const logger = createServiceLogger('webrtc-peer-manager');

// ============================================================
// Types
// ============================================================

export interface RTCIceServer {
  urls: string;
  username?: string;
  credential?: string;
}

export interface PeerConnectionConfig {
  sessionId: string;
  iceServers: RTCIceServer[];
  iceTransportPolicy?: 'all' | 'relay';
  bundlePolicy?: 'disable' | 'max-compat' | 'max-bundle';
}

export interface WebRTCSessionEvents {
  onIceCandidate?: (candidate: RTCIceCandidateInit) => void;
  onTrack?: (track: MediaStreamTrack, transceiver: RTCRtpTransceiver) => void;
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
  onIceConnectionStateChange?: (state: RTCIceConnectionState) => void;
  onDataChannel?: (channel: unknown) => void;
}

export type RTCPeerConnectionState =
  | 'new'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'failed'
  | 'closed';

export type RTCIceConnectionState =
  | 'new'
  | 'checking'
  | 'connected'
  | 'completed'
  | 'disconnected'
  | 'failed'
  | 'closed';

// ============================================================
// WebRTC Peer Connection Manager
// ============================================================

/**
 * Manages a single WebRTC peer connection
 */
export class WebRTCPeerManager {
  private pc: RTCPeerConnection;
  private sessionId: string;
  private config: PeerConnectionConfig;
  private events: WebRTCSessionEvents;
  private isClosed = false;
  private localIceCandidates: RTCIceCandidateInit[] = [];

  constructor(config: PeerConnectionConfig, events: WebRTCSessionEvents = {}) {
    this.sessionId = config.sessionId;
    this.config = config;
    this.events = events;

    // Create RTCPeerConnection with werift
    this.pc = new RTCPeerConnection({
      iceServers: config.iceServers.map((s) => ({
        urls: s.urls,
        username: s.username,
        credential: s.credential,
      })),
      iceTransportPolicy: config.iceTransportPolicy ?? 'all',
      bundlePolicy: config.bundlePolicy ?? 'max-bundle',
      // Enable IPv4, disable IPv6 for server environments
      iceUseIpv4: true,
      iceUseIpv6: false,
      // Use link-local address for containerized environments
      iceUseLinkLocalAddress: true,
    });

    this.setupEventHandlers();

    logger.info('WebRTC PeerConnection created', {
      sessionId: this.sessionId,
      iceServers: config.iceServers.length,
    });
  }

  // ============================================================
  // SDP Offer/Answer Management
  // ============================================================

  /**
   * Create SDP offer
   */
  async createOffer(): Promise<string> {
    this.assertNotClosed();

    logger.debug('Creating SDP offer', { sessionId: this.sessionId });

    try {
      // Add audio transceiver before creating offer to ensure audio media line is included
      if (this.pc.getTransceivers().length === 0) {
        this.addAudioTransceiver('sendrecv');
      }

      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);

      logger.info('SDP offer created and set as local description', {
        sessionId: this.sessionId,
        sdpLength: offer.sdp.length,
      });

      return offer.sdp;
    } catch (error) {
      logger.error(
        'Failed to create SDP offer',
        error instanceof Error ? error : { message: String(error) },
        { sessionId: this.sessionId }
      );
      throw new Error(`Failed to create SDP offer: ${error}`);
    }
  }

  /**
   * Create SDP answer
   */
  async createAnswer(): Promise<string> {
    this.assertNotClosed();

    logger.debug('Creating SDP answer', { sessionId: this.sessionId });

    try {
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);

      logger.info('SDP answer created and set as local description', {
        sessionId: this.sessionId,
        sdpLength: answer.sdp.length,
      });

      return answer.sdp;
    } catch (error) {
      logger.error(
        'Failed to create SDP answer',
        error instanceof Error ? error : { message: String(error) },
        { sessionId: this.sessionId }
      );
      throw new Error(`Failed to create SDP answer: ${error}`);
    }
  }

  /**
   * Set remote SDP answer
   */
  async setRemoteAnswer(sdp: string): Promise<void> {
    this.assertNotClosed();

    logger.debug('Setting remote SDP answer', {
      sessionId: this.sessionId,
      sdpLength: sdp.length,
    });

    try {
      const answer = new RTCSessionDescription(sdp, 'answer');

      await this.pc.setRemoteDescription(answer);

      logger.info('Remote SDP answer set successfully', {
        sessionId: this.sessionId,
      });
    } catch (error) {
      logger.error(
        'Failed to set remote SDP answer',
        error instanceof Error ? error : { message: String(error) },
        { sessionId: this.sessionId }
      );
      throw new Error(`Failed to set remote SDP answer: ${error}`);
    }
  }

  /**
   * Set remote SDP offer
   */
  async setRemoteOffer(sdp: string): Promise<void> {
    this.assertNotClosed();

    logger.debug('Setting remote SDP offer', {
      sessionId: this.sessionId,
      sdpLength: sdp.length,
    });

    try {
      const offer = new RTCSessionDescription(sdp, 'offer');

      await this.pc.setRemoteDescription(offer);

      logger.info('Remote SDP offer set successfully', {
        sessionId: this.sessionId,
      });
    } catch (error) {
      logger.error(
        'Failed to set remote SDP offer',
        error instanceof Error ? error : { message: String(error) },
        { sessionId: this.sessionId }
      );
      throw new Error(`Failed to set remote SDP offer: ${error}`);
    }
  }

  // ============================================================
  // ICE Candidate Management
  // ============================================================

  /**
   * Add ICE candidate
   */
  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    this.assertNotClosed();

    logger.debug('Adding ICE candidate', {
      sessionId: this.sessionId,
      candidate: candidate.candidate?.substring(0, 50) ?? 'null',
    });

    try {
      await this.pc.addIceCandidate(candidate);

      logger.debug('ICE candidate added successfully', {
        sessionId: this.sessionId,
      });
    } catch (error) {
      logger.error(
        'Failed to add ICE candidate',
        error instanceof Error ? error : { message: String(error) },
        { sessionId: this.sessionId }
      );
      // Don't throw for ICE candidate errors, they're non-fatal
    }
  }

  /**
   * Get queued local ICE candidates
   */
  getLocalIceCandidates(): RTCIceCandidateInit[] {
    return [...this.localIceCandidates];
  }

  /**
   * Clear queued local ICE candidates
   */
  clearLocalIceCandidates(): void {
    this.localIceCandidates = [];
  }

  // ============================================================
  // Media Track Management
  // ============================================================

  /**
   * Add transceiver for audio
   */
  addAudioTransceiver(direction: 'sendrecv' | 'sendonly' | 'recvonly' = 'sendrecv'): RTCRtpTransceiver {
    this.assertNotClosed();

    logger.debug('Adding audio transceiver', {
      sessionId: this.sessionId,
      direction,
    });

    try {
      const transceiver = this.pc.addTransceiver('audio', { direction });

      logger.info('Audio transceiver added', {
        sessionId: this.sessionId,
        mid: transceiver.mid,
      });

      return transceiver;
    } catch (error) {
      logger.error(
        'Failed to add audio transceiver',
        error instanceof Error ? error : { message: String(error) },
        { sessionId: this.sessionId }
      );
      throw new Error(`Failed to add audio transceiver: ${error}`);
    }
  }

  /**
   * Get all transceivers
   */
  getTransceivers(): RTCRtpTransceiver[] {
    return this.pc.getTransceivers();
  }

  // ============================================================
  // Connection State
  // ============================================================

  /**
   * Get current connection state
   */
  getConnectionState(): RTCPeerConnectionState {
    return this.pc.connectionState as RTCPeerConnectionState;
  }

  /**
   * Get current ICE connection state
   */
  getIceConnectionState(): RTCIceConnectionState {
    return this.pc.iceConnectionState as RTCIceConnectionState;
  }

  /**
   * Get current ICE gathering state
   */
  getIceGatheringState(): 'new' | 'gathering' | 'complete' {
    return this.pc.iceGatheringState;
  }

  /**
   * Get signaling state
   */
  getSignalingState(): string {
    return this.pc.signalingState;
  }

  /**
   * Check if connection is established
   */
  isConnected(): boolean {
    return (
      this.pc.connectionState === 'connected' &&
      (this.pc.iceConnectionState === 'connected' || this.pc.iceConnectionState === 'completed')
    );
  }

  // ============================================================
  // Connection Management
  // ============================================================

  /**
   * Close the peer connection
   */
  async close(): Promise<void> {
    if (this.isClosed) {
      return;
    }

    logger.info('Closing WebRTC PeerConnection', {
      sessionId: this.sessionId,
      connectionState: this.pc.connectionState,
    });

    this.isClosed = true;

    try {
      await this.pc.close();
      logger.info('WebRTC PeerConnection closed', { sessionId: this.sessionId });
    } catch (error) {
      logger.error(
        'Error closing WebRTC PeerConnection',
        error instanceof Error ? error : { message: String(error) },
        { sessionId: this.sessionId }
      );
    }
  }

  /**
   * Restart ICE
   */
  restartIce(): void {
    this.assertNotClosed();

    logger.info('Restarting ICE', { sessionId: this.sessionId });

    try {
      this.pc.restartIce();
    } catch (error) {
      logger.error(
        'Failed to restart ICE',
        error instanceof Error ? error : { message: String(error) },
        { sessionId: this.sessionId }
      );
      throw new Error(`Failed to restart ICE: ${error}`);
    }
  }

  // ============================================================
  // Event Handlers
  // ============================================================

  /**
   * Set up event handlers for the peer connection
   */
  private setupEventHandlers(): void {
    // ICE candidate handler
    this.pc.onIceCandidate.subscribe((candidate) => {
      if (candidate) {
        const candidateInit: RTCIceCandidateInit = {
          candidate: candidate.candidate,
          sdpMid: candidate.sdpMid,
          sdpMLineIndex: candidate.sdpMLineIndex,
        };

        this.localIceCandidates.push(candidateInit);

        logger.debug('Local ICE candidate generated', {
          sessionId: this.sessionId,
          candidate: candidate.candidate.substring(0, 50),
        });

        if (this.events.onIceCandidate) {
          this.events.onIceCandidate(candidateInit);
        }
      } else {
        logger.info('ICE gathering complete', { sessionId: this.sessionId });
      }
    });

    // Track handler
    this.pc.onTrack.subscribe((track) => {
      logger.info('Remote track received', {
        sessionId: this.sessionId,
        trackKind: track.kind,
        trackId: track.id,
      });

      if (this.events.onTrack) {
        // Find the transceiver for this track
        const transceivers = this.pc.getTransceivers();
        const transceiver = transceivers.find((t) => t.receiver?.track === track);
        this.events.onTrack(track, transceiver!);
      }
    });

    // Connection state change handler
    this.pc.connectionStateChange.subscribe((state) => {
      logger.info('Connection state changed', {
        sessionId: this.sessionId,
        state,
      });

      if (this.events.onConnectionStateChange) {
        this.events.onConnectionStateChange(state as RTCPeerConnectionState);
      }
    });

    // ICE connection state change handler
    this.pc.iceConnectionStateChange.subscribe((state) => {
      logger.info('ICE connection state changed', {
        sessionId: this.sessionId,
        state,
      });

      if (this.events.onIceConnectionStateChange) {
        this.events.onIceConnectionStateChange(state as RTCIceConnectionState);
      }
    });

    // Data channel handler (for future use)
    this.pc.onDataChannel.subscribe((channel) => {
      logger.info('Data channel received', {
        sessionId: this.sessionId,
        label: channel.label,
      });

      if (this.events.onDataChannel) {
        this.events.onDataChannel(channel);
      }
    });
  }

  // ============================================================
  // Utilities
  // ============================================================

  /**
   * Assert that the connection is not closed
   */
  private assertNotClosed(): void {
    if (this.isClosed) {
      throw new Error(`PeerConnection is closed for session ${this.sessionId}`);
    }
  }

  /**
   * Get session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Get statistics
   */
  async getStats(): Promise<unknown> {
    this.assertNotClosed();

    try {
      return await this.pc.getStats();
    } catch (error) {
      logger.error(
        'Failed to get stats',
        error instanceof Error ? error : { message: String(error) },
        { sessionId: this.sessionId }
      );
      return null;
    }
  }
}

// ============================================================
// Factory Functions
// ============================================================

/**
 * Create a new WebRTC peer connection manager
 */
export function createWebRTCPeerManager(
  config: PeerConnectionConfig,
  events?: WebRTCSessionEvents
): WebRTCPeerManager {
  return new WebRTCPeerManager(config, events);
}

/**
 * Create default ICE servers configuration
 */
export function createDefaultIceServers(customServers?: RTCIceServer[]): RTCIceServer[] {
  const defaultServers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
  ];

  if (customServers && customServers.length > 0) {
    return [...customServers, ...defaultServers];
  }

  return defaultServers;
}

// ============================================================
// Re-exports
// ============================================================

export {
  RTCSessionDescription,
  RTCIceCandidate,
  MediaStreamTrack,
  RTCRtpTransceiver,
};
