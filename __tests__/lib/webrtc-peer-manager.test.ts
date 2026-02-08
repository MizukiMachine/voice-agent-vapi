/**
 * WebRTC Peer Manager Tests
 *
 * Tests for the WebRTC peer connection manager using werift library.
 */

import {
  WebRTCPeerManager,
  createWebRTCPeerManager,
  createDefaultIceServers,
  type RTCIceServer,
  type WebRTCSessionEvents,
} from '@/app/lib/webrtc-peer-manager';

// Mock the logger to avoid noise in tests
jest.mock('@/app/lib/logger', () => ({
  createServiceLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

describe('WebRTCPeerManager', () => {
  let sessionId: string;
  let iceServers: RTCIceServer[];
  let events: WebRTCSessionEvents;

  beforeEach(() => {
    sessionId = 'test-session-' + Math.random().toString(36).substring(7);
    iceServers = createDefaultIceServers();

    // Mock event handlers
    events = {
      onIceCandidate: jest.fn(),
      onTrack: jest.fn(),
      onConnectionStateChange: jest.fn(),
      onIceConnectionStateChange: jest.fn(),
      onDataChannel: jest.fn(),
    };
  });

  afterEach(async () => {
    // Clean up any peer connections
    jest.clearAllMocks();
  });

  describe('createWebRTCPeerManager', () => {
    it('should create a new peer connection manager', () => {
      const manager = createWebRTCPeerManager({
        sessionId,
        iceServers,
      });

      expect(manager).toBeInstanceOf(WebRTCPeerManager);
      expect(manager.getSessionId()).toBe(sessionId);
      expect(manager.getConnectionState()).toBe('new');
      expect(manager.getIceConnectionState()).toBe('new');
    });

    it('should create peer connection with custom ICE servers', () => {
      const customServers: RTCIceServer[] = [
        { urls: 'stun:custom.stun.server:3478' },
      ];

      const manager = createWebRTCPeerManager({
        sessionId,
        iceServers: customServers,
      });

      expect(manager).toBeInstanceOf(WebRTCPeerManager);
    });

    it('should accept event handlers', () => {
      const onIceCandidate = jest.fn();
      const onConnectionStateChange = jest.fn();

      const manager = createWebRTCPeerManager({
        sessionId,
        iceServers,
      }, {
        onIceCandidate,
        onConnectionStateChange,
      });

      expect(manager).toBeInstanceOf(WebRTCPeerManager);
    });
  });

  describe('createOffer', () => {
    it('should create an SDP offer', async () => {
      const manager = createWebRTCPeerManager({
        sessionId,
        iceServers,
      });

      const offer = await manager.createOffer();

      expect(offer).toBeTruthy();
      expect(typeof offer).toBe('string');
      expect(offer).toContain('v=0'); // SDP version
      expect(offer).toContain('m=audio'); // Audio media
      expect(offer).toContain('a=mid:'); // Media ID
    });

    it('should set local description after creating offer', async () => {
      const manager = createWebRTCPeerManager({
        sessionId,
        iceServers,
      });

      await manager.createOffer();

      const signalingState = manager.getSignalingState();
      expect(signalingState).toBe('have-local-offer');
    });

    it('should throw error if peer connection is closed', async () => {
      const manager = createWebRTCPeerManager({
        sessionId,
        iceServers,
      });

      await manager.close();

      await expect(manager.createOffer()).rejects.toThrow();
    });
  });

  describe('createAnswer', () => {
    it('should create an SDP answer', async () => {
      const manager = createWebRTCPeerManager({
        sessionId,
        iceServers,
      });

      // First, we need to set a remote offer to create an answer
      const offerSdp = `v=0
o=- 123456789 2 IN IP4 0.0.0.0
s=-
t=0 0
a=group:BUNDLE 0
a=msid-semantic:WMS *
m=audio 9 UDP/TLS/RTP/SAVPF 111
c=IN IP4 0.0.0.0
a=ice-ufrag:test
a=ice-pwd:test
a=fingerprint:sha-256 AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA
a=setup:actpass
a=mid:0
a=sendrecv
a=rtpmap:111 opus/48000/2`;

      await manager.setRemoteOffer(offerSdp);

      const answer = await manager.createAnswer();

      expect(answer).toBeTruthy();
      expect(typeof answer).toBe('string');
      expect(answer).toContain('v=0'); // SDP version
      expect(answer).toContain('m=audio'); // Audio media
    });
  });

  describe('setRemoteAnswer', () => {
    it('should set remote SDP answer', async () => {
      const manager = createWebRTCPeerManager({
        sessionId,
        iceServers,
      });

      // Create offer first
      await manager.createOffer();

      const answerSdp = `v=0
o=- 987654321 2 IN IP4 0.0.0.0
s=-
t=0 0
a=group:BUNDLE 0
a=msid-semantic:WMS *
m=audio 9 UDP/TLS/RTP/SAVPF 111
c=IN IP4 0.0.0.0
a=ice-ufrag:test
a=ice-pwd:test
a=fingerprint:sha-256 AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA
a=setup:active
a=mid:0
a=sendrecv
a=rtpmap:111 opus/48000/2`;

      await expect(manager.setRemoteAnswer(answerSdp)).resolves.not.toThrow();
    });

    it('should throw error if peer connection is closed', async () => {
      const manager = createWebRTCPeerManager({
        sessionId,
        iceServers,
      });

      await manager.close();

      const answerSdp = `v=0
o=- 987654321 2 IN IP4 0.0.0.0
s=-
t=0 0
m=audio 9 UDP/TLS/RTP/SAVPF 111`;

      await expect(manager.setRemoteAnswer(answerSdp)).rejects.toThrow();
    });
  });

  describe('setRemoteOffer', () => {
    it('should set remote SDP offer', async () => {
      const manager = createWebRTCPeerManager({
        sessionId,
        iceServers,
      });

      const offerSdp = `v=0
o=- 123456789 2 IN IP4 0.0.0.0
s=-
t=0 0
a=group:BUNDLE 0
a=msid-semantic:WMS *
m=audio 9 UDP/TLS/RTP/SAVPF 111
c=IN IP4 0.0.0.0
a=ice-ufrag:test
a=ice-pwd:test
a=fingerprint:sha-256 AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA
a=setup:actpass
a=mid:0
a=sendrecv
a=rtpmap:111 opus/48000/2`;

      await expect(manager.setRemoteOffer(offerSdp)).resolves.not.toThrow();
    });
  });

  describe('addIceCandidate', () => {
    it('should add ICE candidate', async () => {
      const manager = createWebRTCPeerManager({
        sessionId,
        iceServers,
      });

      const candidate: RTCIceCandidateInit = {
        candidate: 'candidate:1 1 UDP 2130706431 192.168.1.1 54321 typ host',
        sdpMid: '0',
        sdpMLineIndex: 0,
      };

      // This should not throw even if candidate is invalid
      await expect(manager.addIceCandidate(candidate)).resolves.not.toThrow();
    });
  });

  describe('addAudioTransceiver', () => {
    it('should add audio transceiver', () => {
      const manager = createWebRTCPeerManager({
        sessionId,
        iceServers,
      });

      const transceiver = manager.addAudioTransceiver('sendrecv');

      expect(transceiver).toBeDefined();
      expect(transceiver.mid).toBeDefined();

      const transceivers = manager.getTransceivers();
      expect(transceivers.length).toBeGreaterThan(0);
    });

    it('should throw error if peer connection is closed', async () => {
      const manager = createWebRTCPeerManager({
        sessionId,
        iceServers,
      });

      await manager.close();

      expect(() => manager.addAudioTransceiver('sendrecv')).toThrow();
    });
  });

  describe('Connection State', () => {
    it('should return initial connection state as new', () => {
      const manager = createWebRTCPeerManager({
        sessionId,
        iceServers,
      });

      expect(manager.getConnectionState()).toBe('new');
      expect(manager.getIceConnectionState()).toBe('new');
      expect(manager.getIceGatheringState()).toBe('new');
    });

    it('should return false for isConnected initially', () => {
      const manager = createWebRTCPeerManager({
        sessionId,
        iceServers,
      });

      expect(manager.isConnected()).toBe(false);
    });
  });

  describe('close', () => {
    it('should close peer connection', async () => {
      const manager = createWebRTCPeerManager({
        sessionId,
        iceServers,
      });

      await expect(manager.close()).resolves.not.toThrow();

      // Calling close again should be safe
      await expect(manager.close()).resolves.not.toThrow();
    });
  });

  describe('getLocalIceCandidates', () => {
    it('should return empty array initially', () => {
      const manager = createWebRTCPeerManager({
        sessionId,
        iceServers,
      });

      expect(manager.getLocalIceCandidates()).toEqual([]);
    });

    it('should clear local ICE candidates', () => {
      const manager = createWebRTCPeerManager({
        sessionId,
        iceServers,
      });

      // Create a valid candidate object
      const candidate = manager['localIceCandidates'];
      candidate.push({
        candidate: 'candidate:1 1 UDP 2130706431 192.168.1.1 54321 typ host',
        sdpMid: '0',
        sdpMLineIndex: 0,
      });

      expect(manager.getLocalIceCandidates().length).toBeGreaterThan(0);

      manager.clearLocalIceCandidates();

      expect(manager.getLocalIceCandidates()).toEqual([]);
    });
  });
});

describe('createDefaultIceServers', () => {
  it('should create default ICE servers', () => {
    const servers = createDefaultIceServers();

    expect(servers).toBeInstanceOf(Array);
    expect(servers.length).toBeGreaterThan(0);
    expect(servers[0]?.urls).toBeDefined();
  });

  it('should include custom servers if provided', () => {
    const customServers: RTCIceServer[] = [
      { urls: 'stun:custom.stun.server:3478' },
    ];

    const servers = createDefaultIceServers(customServers);

    expect(servers.length).toBeGreaterThan(customServers.length);
    expect(servers[0]?.urls).toBe('stun:custom.stun.server:3478');
  });
});
