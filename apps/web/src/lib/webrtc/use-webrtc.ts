'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  SocketEvents,
  type CallIceCandidatePayload,
  type CallSdpPayload,
} from '@vently/shared';
import { useSocket } from '@/lib/socket/use-socket';
import { getIceServers } from './ice-servers';

export type CallState =
  | 'IDLE'
  | 'DIALING' // we initiated, waiting for callee
  | 'RINGING' // they initiated, waiting for us to accept
  | 'CONNECTING' // SDP/ICE exchange in flight
  | 'CONNECTED'
  | 'ENDED';

interface UseWebRTCArgs {
  conversationId: string;
  /** If we're the receiving side, pass true to start in RINGING state. */
  isIncoming?: boolean;
}

interface UseWebRTCReturn {
  callState: CallState;
  remoteStream: MediaStream | null;
  startCall: () => Promise<void>;
  acceptCall: () => Promise<void>;
  rejectCall: () => void;
  hangup: () => void;
  toggleMute: () => void;
  muted: boolean;
  speakerOn: boolean;
  toggleSpeaker: () => void;
  error: string | null;
}

export function useWebRTC({ conversationId, isIncoming = false }: UseWebRTCArgs): UseWebRTCReturn {
  const socket = useSocket();

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

  const [callState, setCallState] = useState<CallState>(isIncoming ? 'RINGING' : 'IDLE');
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [muted, setMuted] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const teardown = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.onicecandidate = null;
      pcRef.current.ontrack = null;
      pcRef.current.onconnectionstatechange = null;
      pcRef.current.close();
      pcRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    setRemoteStream(null);
    pendingCandidatesRef.current = [];
  }, []);

  const createPeerConnection = useCallback(async () => {
    const iceServers = await getIceServers();
    const pc = new RTCPeerConnection({ iceServers });

    pc.onicecandidate = (e) => {
      if (e.candidate && socket) {
        socket.emit(SocketEvents.CALL_ICE_CANDIDATE, {
          conversationId,
          candidate: e.candidate.toJSON(),
        });
      }
    };

    pc.ontrack = (e) => {
      const [stream] = e.streams;
      setRemoteStream(stream ?? null);
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') setCallState('CONNECTED');
      else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        setCallState('ENDED');
      }
    };

    pcRef.current = pc;
    return pc;
  }, [conversationId, socket]);

  const getLocalStream = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    localStreamRef.current = stream;
    return stream;
  }, []);

  const startCall = useCallback(async () => {
    if (!socket) return;
    setError(null);
    setCallState('DIALING');
    try {
      const stream = await getLocalStream();
      const pc = await createPeerConnection();
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      socket.emit(SocketEvents.CALL_INVITE, { conversationId, fromUserId: '' });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit(SocketEvents.CALL_OFFER, { conversationId, sdp: offer });
      setCallState('CONNECTING');
    } catch (err) {
      setError((err as Error).message ?? 'Could not start call');
      teardown();
      setCallState('ENDED');
    }
  }, [socket, conversationId, createPeerConnection, getLocalStream, teardown]);

  const acceptCall = useCallback(async () => {
    if (!socket) return;
    setError(null);
    setCallState('CONNECTING');
    try {
      const stream = await getLocalStream();
      const pc = await createPeerConnection();
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      socket.emit(SocketEvents.CALL_ACCEPT, { conversationId, fromUserId: '' });
    } catch (err) {
      setError((err as Error).message ?? 'Microphone permission denied');
      teardown();
      setCallState('ENDED');
    }
  }, [socket, conversationId, createPeerConnection, getLocalStream, teardown]);

  const rejectCall = useCallback(() => {
    socket?.emit(SocketEvents.CALL_REJECT, { conversationId, fromUserId: '' });
    teardown();
    setCallState('ENDED');
  }, [socket, conversationId, teardown]);

  const hangup = useCallback(() => {
    socket?.emit(SocketEvents.CALL_HANGUP, { conversationId });
    teardown();
    setCallState('ENDED');
  }, [socket, conversationId, teardown]);

  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !muted;
    stream.getAudioTracks().forEach((t) => (t.enabled = !next));
    setMuted(next);
  }, [muted]);

  const toggleSpeaker = useCallback(() => {
    setSpeakerOn((on) => !on);
  }, []);

  // ─── Socket event wiring ─────────────────────────────────────────────────

  useEffect(() => {
    if (!socket) return;

    const onOffer = async ({ sdp }: CallSdpPayload) => {
      const pc = pcRef.current ?? (await createPeerConnection());
      // If we didn't already set up local tracks (caller side handled this in
      // startCall), make sure we have them now.
      if (!localStreamRef.current) {
        const stream = await getLocalStream();
        stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      }
      await pc.setRemoteDescription(sdp);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit(SocketEvents.CALL_ANSWER, { conversationId, sdp: answer });
      // Drain any candidates that arrived early.
      for (const c of pendingCandidatesRef.current) {
        try {
          await pc.addIceCandidate(c);
        } catch {
          // ignore
        }
      }
      pendingCandidatesRef.current = [];
    };

    const onAnswer = async ({ sdp }: CallSdpPayload) => {
      const pc = pcRef.current;
      if (!pc) return;
      await pc.setRemoteDescription(sdp);
      for (const c of pendingCandidatesRef.current) {
        try {
          await pc.addIceCandidate(c);
        } catch {
          // ignore
        }
      }
      pendingCandidatesRef.current = [];
    };

    const onIce = async ({ candidate }: CallIceCandidatePayload) => {
      const pc = pcRef.current;
      if (!pc || !pc.remoteDescription) {
        pendingCandidatesRef.current.push(candidate);
        return;
      }
      try {
        await pc.addIceCandidate(candidate);
      } catch {
        // ignore
      }
    };

    const onAccept = () => {
      // Caller side: peer accepted. SDP offer/answer flow continues automatically.
    };
    const onReject = () => {
      teardown();
      setCallState('ENDED');
    };
    const onHangup = () => {
      teardown();
      setCallState('ENDED');
    };

    socket.on(SocketEvents.CALL_OFFER, onOffer);
    socket.on(SocketEvents.CALL_ANSWER, onAnswer);
    socket.on(SocketEvents.CALL_ICE_CANDIDATE, onIce);
    socket.on(SocketEvents.CALL_ACCEPT, onAccept);
    socket.on(SocketEvents.CALL_REJECT, onReject);
    socket.on(SocketEvents.CALL_HANGUP, onHangup);

    return () => {
      socket.off(SocketEvents.CALL_OFFER, onOffer);
      socket.off(SocketEvents.CALL_ANSWER, onAnswer);
      socket.off(SocketEvents.CALL_ICE_CANDIDATE, onIce);
      socket.off(SocketEvents.CALL_ACCEPT, onAccept);
      socket.off(SocketEvents.CALL_REJECT, onReject);
      socket.off(SocketEvents.CALL_HANGUP, onHangup);
    };
  }, [socket, conversationId, createPeerConnection, getLocalStream, teardown]);

  // Tear down everything when the consuming component unmounts.
  useEffect(() => () => teardown(), [teardown]);

  return {
    callState,
    remoteStream,
    startCall,
    acceptCall,
    rejectCall,
    hangup,
    toggleMute,
    muted,
    speakerOn,
    toggleSpeaker,
    error,
  };
}
