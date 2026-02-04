'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { User, Message } from '@/app/types';
import { createClientLogger } from '@/app/lib/logger-client';

const logger = createClientLogger('voice');

const REALTIME_API_URL = 'https://api.openai.com/v1/realtime/calls';

interface VoiceInterfaceProps {
  user: User | null;
  onSessionStart: (sessionId: string) => void;
  onSessionEnd: () => void;
  onMessage: (message: Message) => void;
}

/**
 * Tool name → API route mapping
 */
const TOOL_ROUTE_MAP: Record<string, string> = {
  calendar_action: '/api/tools/calendar',
  docs_action: '/api/tools/docs',
  memo_action: '/api/tools/memo',
  map_action: '/api/tools/location',
};

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

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  const cleanupConnection = useCallback(() => {
    if (dcRef.current) {
      dcRef.current.close();
      dcRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.srcObject = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupConnection();
    };
  }, [cleanupConnection]);

  /**
   * Execute a function call by routing to the appropriate tool API endpoint.
   * Wraps arguments in the existing VAPI-compatible format that tool routes expect.
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
   * Handle incoming data channel messages from OpenAI Realtime API
   */
  const handleDataChannelMessage = useCallback(
    async (event: MessageEvent, dc: RTCDataChannel) => {
      try {
        const msg = JSON.parse(event.data);

        switch (msg.type) {
          // GA: response.audio_transcript.done → response.output_audio_transcript.done
          case 'response.output_audio_transcript.done':
          case 'response.audio_transcript.done': // Fallback for compatibility
            onMessage({
              id: `assistant-${Date.now()}`,
              role: 'assistant',
              content: msg.transcript || '',
              timestamp: new Date(),
            });
            setIsSpeaking(false);
            break;

          // GA: response.audio.delta → response.output_audio.delta
          case 'response.output_audio.delta':
          case 'response.audio.delta': // Fallback for compatibility
            setIsSpeaking(true);
            break;

          case 'response.output_audio.done':
          case 'response.audio.done': // Fallback for compatibility
            setIsSpeaking(false);
            break;

          case 'conversation.item.input_audio_transcription.completed':
            if (msg.transcript) {
              onMessage({
                id: `user-${Date.now()}`,
                role: 'user',
                content: msg.transcript,
                timestamp: new Date(),
              });
            }
            break;

          case 'response.function_call_arguments.done': {
            const fnCallId = msg.call_id;
            const fnName = msg.name;
            const fnArgs = JSON.parse(msg.arguments || '{}');

            const result = await executeFunctionCall(fnCallId, fnName, fnArgs);

            // Send function call output back to Realtime API
            dc.send(
              JSON.stringify({
                type: 'conversation.item.create',
                item: {
                  type: 'function_call_output',
                  call_id: fnCallId,
                  output: result,
                },
              })
            );

            // Trigger the model to respond after receiving function output
            dc.send(JSON.stringify({ type: 'response.create' }));
            break;
          }

          case 'response.done':
            setIsSpeaking(false);
            break;

          case 'error':
            logger.error('Realtime API error', { error: msg.error });
            setError(msg.error?.message || 'Realtime API error');
            break;

          // GA: conversation.item.created → conversation.item.added/done
          case 'conversation.item.added':
          case 'conversation.item.done':
          case 'session.created':
          case 'session.updated':
          case 'input_audio_buffer.speech_started':
          case 'input_audio_buffer.speech_stopped':
          case 'input_audio_buffer.committed':
          case 'response.created':
          case 'response.output_item.added':
          case 'response.output_item.done':
          case 'response.content_part.added':
          case 'response.content_part.done':
          case 'conversation.item.created': // Fallback for compatibility
          case 'response.output_audio_transcript.delta':
          case 'response.audio_transcript.delta': // Fallback for compatibility
          case 'rate_limits.updated':
            // Known events - log at debug level
            logger.debug('Event', { type: msg.type });
            break;

          default:
            logger.debug('Unhandled event', { type: msg.type });
            break;
        }
      } catch (err) {
        logger.error('Data channel message parse error', { error: String(err) });
      }
    },
    [onMessage, executeFunctionCall]
  );

  const startSession = useCallback(async () => {
    if (!user) return;

    setIsConnecting(true);
    setError(null);

    try {
      // 1. Get ephemeral token from our server
      const res = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || 'Failed to create session');
      }

      const { sessionId: sid, clientSecret, model } = await res.json();

      // 2. Create RTCPeerConnection
      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      // 3. Set up remote audio playback
      const audioEl = new Audio();
      audioEl.autoplay = true;
      audioRef.current = audioEl;

      pc.ontrack = (event) => {
        audioEl.srcObject = event.streams[0] ?? null;
        logger.info('Remote audio track received');
      };

      // 4. Add local microphone track
      const localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = localStream;
      localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

      // 5. Create data channel for Realtime API events
      const dc = pc.createDataChannel('oai-events');
      dcRef.current = dc;

      dc.onopen = () => {
        logger.info('Data channel opened');
      };

      dc.onmessage = (event) => handleDataChannelMessage(event, dc);

      // 6. Create SDP offer and set local description
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // 7. Exchange SDP with OpenAI Realtime API (GA: calls endpoint)
      const sdpResponse = await fetch(REALTIME_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${clientSecret}`,
          'Content-Type': 'application/sdp',
        },
        body: offer.sdp,
      });

      if (!sdpResponse.ok) {
        throw new Error(`WebRTC SDP exchange failed: ${sdpResponse.status}`);
      }

      const answerSdp = await sdpResponse.text();
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });

      // 8. Session established
      setSessionId(sid);
      setIsActive(true);
      setIsConnecting(false);
      onSessionStart(sid);

      logger.info('WebRTC session established', { sessionId: sid, model });

      onMessage({
        id: `sys-${Date.now()}`,
        role: 'system',
        content: `Session started for ${user.name} (WebRTC)`,
        timestamp: new Date(),
      });
    } catch (err) {
      logger.error('Session start error', {
        error: err instanceof Error ? err.message : String(err),
      });
      setError(err instanceof Error ? err.message : 'Unknown error');
      setIsConnecting(false);
      cleanupConnection();
    }
  }, [user, onSessionStart, onMessage, handleDataChannelMessage, cleanupConnection]);

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
  }, [onMessage, onSessionEnd, cleanupConnection]);

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
        Voice Interface
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
      </div>
    </div>
  );
}
