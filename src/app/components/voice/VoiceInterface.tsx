'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { User, Message, CreateSessionResponse } from '@/app/types';
import { createClientLogger } from '@/app/lib/logger-client';

const logger = createClientLogger('voice');

/**
 * Tool name → API route mapping
 */
const TOOL_ROUTE_MAP: Record<string, string> = {
  calendar_action: '/api/tools/calendar',
  docs_action: '/api/tools/docs',
  memo_action: '/api/tools/memo',
  map_action: '/api/tools/location',
};

interface VoiceInterfaceProps {
  user: User | null;
  onSessionStart: (sessionId: string) => void;
  onSessionEnd: () => void;
  onMessage: (message: Message) => void;
}

/**
 * VoiceInterface - Server-Side WebRTC (Vapi + Cartesia)
 *
 * This component connects to the server's WebSocket endpoint for WebRTC signaling
 * and audio streaming. The server handles Vapi (STT+LLM) and Cartesia (TTS) integration.
 *
 * Architecture:
 * Client --WebSocket--> Server --Vapi WS--> Vapi API
 *                      --Cartesia WS--> Cartesia API
 */
export default function VoiceInterface({
  user,
  onSessionStart,
  onSessionEnd,
  onMessage,
}: VoiceInterfaceProps) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Refs
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const audioQueueRef = useRef<AudioBuffer[]>([]);
  const isPlayingRef = useRef(false);

  /**
   * Cleanup connection
   */
  const cleanupConnection = useCallback(() => {
    logger.info('Cleaning up connection');

    // Close WebSocket
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    // Close WebRTC PeerConnection
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }

    // Stop local media stream
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    // Clear audio element
    if (audioRef.current) {
      audioRef.current.srcObject = null;
    }

    // Clear audio queue
    audioQueueRef.current = [];
    isPlayingRef.current = false;
  }, []);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      cleanupConnection();
    };
  }, [cleanupConnection]);

  /**
   * Execute a function call by routing to the appropriate tool API endpoint
   */
  const executeFunctionCall = useCallback(
    async (callId: string, name: string, args: Record<string, unknown>): Promise<string> => {
      logger.info('Function call received', { callId, name });

      onMessage({
        id: `tool-${Date.now()}`,
        role: 'system',
        content: `Tool: ${name}(${JSON.stringify(args)})`,
        timestamp: new Date(),
      });

      const route = TOOL_ROUTE_MAP[name];
      if (!route) {
        logger.warn('Unknown tool', { name });
        return JSON.stringify({ success: false, error: `Unknown tool: ${name}` });
      }

      try {
        const res = await fetch(route, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: {
              toolCallList: [
                {
                  id: callId,
                  function: {
                    name,
                    arguments: { ...args, userId: user?.id },
                  },
                },
              ],
              call: { metadata: { userId: user?.id } },
            },
          }),
        });

        const data = await res.json();
        const result =
          data.results?.[0]?.result || JSON.stringify({ success: false, error: 'No result' });

        onMessage({
          id: `tool-result-${Date.now()}`,
          role: 'system',
          content: `Result: ${result}`,
          timestamp: new Date(),
        });

        return result;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        logger.error('Tool execution error', { name, error: errorMsg });
        return JSON.stringify({ success: false, error: errorMsg });
      }
    },
    [user, onMessage]
  );

  /**
   * Handle WebSocket message from server
   */
  const handleWebSocketMessage = useCallback(
    async (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data);
        logger.debug('WebSocket message received', { type: msg.type });

        switch (msg.type) {
          case 'sdp-offer':
            // Server sent SDP offer - create answer and send back
            await handleSDPOffer(msg.sdp);
            break;

          case 'ice-candidate':
            // Server sent ICE candidate - add to peer connection
            await handleICECandidate(msg.candidate);
            break;

          case 'audio':
            // Server sent audio data - play it
            handleIncomingAudio(msg.data);
            break;

          case 'function-call':
            // Server received function call from Vapi - execute it
            const result = await executeFunctionCall(msg.callId, msg.name, msg.parameters);
            // Send result back to server
            sendWebSocketMessage({
              type: 'function-result',
              callId: msg.callId,
              result,
            });
            break;

          case 'error':
            logger.error('Server error', { error: msg.error });
            setError(msg.error);
            break;

          case 'transcript':
            // Optional: Server sends transcript updates
            if (msg.text) {
              onMessage({
                id: `transcript-${Date.now()}`,
                role: msg.role === 'assistant' ? 'assistant' : 'user',
                content: msg.text,
                timestamp: new Date(),
              });

              if (msg.role === 'assistant') {
                setIsSpeaking(true);
              }
            }
            break;

          case 'transcript-end':
            setIsSpeaking(false);
            break;

          default:
            logger.debug('Unknown WebSocket message type', { type: msg.type });
        }
      } catch (err) {
        logger.error('WebSocket message parse error', { error: String(err) });
      }
    },
    [onMessage, executeFunctionCall]
  );

  /**
   * Handle SDP offer from server
   */
  const handleSDPOffer = useCallback(async (sdp: string) => {
    const pc = pcRef.current;
    if (!pc) {
      logger.error('PeerConnection not initialized');
      return;
    }

    try {
      logger.info('Setting remote SDP offer', { sdpLength: sdp.length });
      await pc.setRemoteDescription({ type: 'offer', sdp });

      // Create SDP answer
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      // Send answer to server
      sendWebSocketMessage({
        type: 'sdp-answer',
        sdp: answer.sdp,
      });

      logger.info('SDP answer sent to server');
    } catch (err) {
      logger.error('SDP offer handling error', { error: String(err) });
      setError('Failed to establish WebRTC connection');
    }
  }, []);

  /**
   * Handle ICE candidate from server
   */
  const handleICECandidate = useCallback(async (candidate: RTCIceCandidateInit) => {
    const pc = pcRef.current;
    if (!pc) {
      return;
    }

    try {
      await pc.addIceCandidate(candidate);
      logger.debug('ICE candidate added');
    } catch (err) {
      logger.error('ICE candidate error', { error: String(err) });
    }
  }, []);

  /**
   * Handle incoming audio data from server
   */
  const handleIncomingAudio = useCallback(async (base64Data: string) => {
    try {
      // Decode base64 audio data
      const audioData = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));

      // Create audio context if needed
      const audioContext = new AudioContext({ sampleRate: 24000 });

      // Decode audio data
      const audioBuffer = await audioContext.decodeAudioData(audioData.buffer);

      // Add to queue
      audioQueueRef.current.push(audioBuffer);

      // Start playing if not already playing
      if (!isPlayingRef.current) {
        playAudioQueue();
      }
    } catch (err) {
      logger.error('Audio decode error', { error: String(err) });
    }
  }, []);

  /**
   * Play audio queue
   */
  const playAudioQueue = useCallback(async () => {
    if (audioQueueRef.current.length === 0 || isPlayingRef.current) {
      return;
    }

    isPlayingRef.current = true;
    setIsSpeaking(true);

    const audioBuffer = audioQueueRef.current.shift()!;
    const audioContext = new AudioContext({ sampleRate: 24000 });
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);

    source.onended = () => {
      isPlayingRef.current = false;
      if (audioQueueRef.current.length > 0) {
        playAudioQueue();
      } else {
        setIsSpeaking(false);
      }
    };

    source.start();
  }, []);

  /**
   * Send message to WebSocket server
   */
  const sendWebSocketMessage = useCallback((message: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
      logger.debug('WebSocket message sent', { type: message.type });
    }
  }, []);

  /**
   * Start voice session
   */
  const startSession = useCallback(async () => {
    if (!user) {
      setError('Please select a user first');
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      // Step 1: Create session via API
      const res = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || 'Failed to create session');
      }

      const sessionData = (await res.json()) as CreateSessionResponse;
      const { sessionId: sid, serverConfig } = sessionData;

      logger.info('Session created', { sessionId: sid });

      // Step 2: Create WebSocket connection to server
      // WebSocket server runs on port 3001 (separate from Next.js on port 3000)
      const wsUrl = `ws://localhost:3001/api/webrtc?sessionId=${sid}`;
      const ws = new WebSocket(wsUrl);

      wsRef.current = ws;

      ws.onopen = () => {
        logger.info('WebSocket connected');
      };

      ws.onmessage = handleWebSocketMessage;

      ws.onerror = (event) => {
        logger.error('WebSocket error', { event });
        setError('WebSocket connection error');
      };

      ws.onclose = () => {
        logger.info('WebSocket closed');
        if (isActive) {
          endSession();
        }
      };

      // Step 3: Create RTCPeerConnection
      const pc = new RTCPeerConnection({
        iceServers: serverConfig.iceServers,
      });
      pcRef.current = pc;

      // Step 4: Set up remote audio playback
      const audioEl = new Audio();
      audioEl.autoplay = true;
      audioRef.current = audioEl;

      pc.ontrack = (event) => {
        audioEl.srcObject = event.streams[0] ?? null;
        logger.info('Remote audio track received');
      };

      // Step 5: Add local microphone track
      const localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = localStream;
      localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

      // Step 6: Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          sendWebSocketMessage({
            type: 'ice-candidate',
            candidate: event.candidate.toJSON(),
          });
        }
      };

      // Step 7: Wait for connection state
      pc.onconnectionstatechange = () => {
        logger.info('Connection state changed', { state: pc.connectionState });

        if (pc.connectionState === 'connected') {
          setIsActive(true);
          setSessionId(sid);
          setIsConnecting(false);
          onSessionStart(sid);

          onMessage({
            id: `sys-${Date.now()}`,
            role: 'system',
            content: `Session started for ${user.name} (Server-Side WebRTC)`,
            timestamp: new Date(),
          });
        } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          setError('WebRTC connection failed');
          setIsActive(false);
        }
      };

      // Create offer (will be sent when WS is connected)
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      logger.info('WebRTC PeerConnection created', { sessionId: sid });

    } catch (err) {
      logger.error('Session start error', {
        error: err instanceof Error ? err.message : String(err),
      });
      setError(err instanceof Error ? err.message : 'Unknown error');
      setIsConnecting(false);
      cleanupConnection();
    }
  }, [user, onSessionStart, onMessage, handleWebSocketMessage, cleanupConnection, sendWebSocketMessage]);

  /**
   * End voice session
   */
  const endSession = useCallback(() => {
    cleanupConnection();

    setIsActive(false);
    setIsMuted(false);
    setIsSpeaking(false);
    setSessionId(null);

    onMessage({
      id: `sys-${Date.now()}`,
      role: 'system',
      content: 'Session ended',
      timestamp: new Date(),
    });

    onSessionEnd();
  }, [cleanupConnection, onMessage, onSessionEnd]);

  /**
   * Toggle mute state
   */
  const toggleMute = useCallback(() => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);

    // Mute/unmute the local audio track
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !newMuted;
      });
    }

    onMessage({
      id: `sys-${Date.now()}`,
      role: 'system',
      content: newMuted ? 'Microphone muted' : 'Microphone unmuted',
      timestamp: new Date(),
    });
  }, [isMuted, onMessage]);

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        Voice Interface (Server-Side WebRTC)
      </h2>

      <div className="space-y-4">
        {/* User Info */}
        {user ? (
          <div className="rounded bg-zinc-100 p-3 dark:bg-zinc-800">
            <div className="text-sm text-zinc-500">Current User</div>
            <div className="font-medium text-zinc-900 dark:text-zinc-100">{user.name}</div>
          </div>
        ) : (
          <div className="rounded bg-yellow-100 p-3 text-sm text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
            Select a user from Cockpit to start voice session
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded bg-red-100 p-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Controls */}
        <div className="flex gap-2">
          {!isActive ? (
            <button
              onClick={startSession}
              disabled={isConnecting || !user}
              className="flex-1 rounded bg-green-600 py-3 text-white hover:bg-green-700 disabled:opacity-50"
            >
              {isConnecting ? 'Connecting...' : user ? 'Start Session' : 'Select User First'}
            </button>
          ) : (
            <>
              <button
                onClick={toggleMute}
                className={`flex-1 rounded py-3 text-white ${
                  isMuted
                    ? 'bg-yellow-600 hover:bg-yellow-700'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {isMuted ? 'Unmute' : 'Mute'}
              </button>
              <button
                onClick={endSession}
                className="flex-1 rounded bg-red-600 py-3 text-white hover:bg-red-700"
              >
                End Session
              </button>
            </>
          )}
        </div>

        {/* Status */}
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <span
            className={`h-2 w-2 rounded-full ${
              isActive
                ? isSpeaking
                  ? 'bg-blue-500 animate-pulse'
                  : isMuted
                    ? 'bg-yellow-500'
                    : 'bg-green-500 animate-pulse'
                : isConnecting
                  ? 'bg-orange-500 animate-pulse'
                  : 'bg-zinc-400'
            }`}
          />
          {isConnecting
            ? 'Connecting...'
            : isActive
              ? isSpeaking
                ? 'Assistant speaking...'
                : isMuted
                  ? 'Muted'
                  : 'Listening...'
              : user
                ? 'Ready to start'
                : 'Not connected'}
        </div>

        {/* Connection Info */}
        {sessionId && (
          <div className="rounded bg-zinc-100 p-2 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
            <div>Session ID: {sessionId.slice(0, 8)}...</div>
          </div>
        )}
      </div>
    </div>
  );
}
