'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  SocketEvents,
  type CallIceCandidatePayload,
  type CallMode,
  type CallSdpPayload,
} from '@vently/shared';
import { useSocket } from '@/lib/socket/use-socket';
import { getIceServers } from './ice-servers';

export type CallState =
  | 'IDLE'
  | 'DIALING' // we initiated, waiting for peer to accept
  | 'RINGING' // they initiated, waiting for us to accept
  | 'CONNECTING' // SDP/ICE exchange in flight
  | 'CONNECTED'
  | 'ENDED';

interface UseWebRTCArgs {
  conversationId: string;
  mode?: CallMode;
  /** If we're the receiving side, pass true to start in RINGING state. */
  isIncoming?: boolean;
}

interface UseWebRTCReturn {
  callState: CallState;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  startCall: () => Promise<void>;
  acceptCall: () => Promise<void>;
  rejectCall: () => void;
  hangup: () => void;
  toggleMute: () => void;
  muted: boolean;
  cameraOn: boolean;
  toggleCamera: () => void;
  speakerOn: boolean;
  toggleSpeaker: () => void;
  error: string | null;
}

// How long the caller waits for the peer to accept before timing out.
const ACCEPT_TIMEOUT_MS = 30_000;

function isLocalMediaError(err: unknown) {
  const name = (err as DOMException | undefined)?.name;
  return (
    name === 'NotAllowedError' ||
    name === 'PermissionDeniedError' ||
    name === 'SecurityError' ||
    name === 'NotFoundError' ||
    name === 'DevicesNotFoundError' ||
    name === 'NotReadableError' ||
    name === 'TrackStartError'
  );
}

function getLocalMediaErrorMessage(err: unknown, mode: CallMode) {
  const error = err as DOMException | Error | undefined;
  const name = (error as DOMException | undefined)?.name;

  if (
    name === 'NotAllowedError' ||
    name === 'PermissionDeniedError' ||
    name === 'SecurityError'
  ) {
    return mode === 'video'
      ? 'Camera/microphone is blocked. Allow camera and microphone for this site, then try again.'
      : 'Microphone is blocked. Allow microphone for this site, then try again.';
  }

  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return mode === 'video'
      ? 'No camera or microphone was found on this device.'
      : 'No microphone was found on this device.';
  }

  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return mode === 'video'
      ? 'Camera or microphone is already in use. Close the other app, then try again.'
      : 'Microphone is already in use. Close the other app, then try again.';
  }

  return error?.message || (mode === 'video' ? 'Could not start video call' : 'Could not start call');
}

export function useWebRTC({
  conversationId,
  mode = 'voice',
  isIncoming = false,
}: UseWebRTCArgs): UseWebRTCReturn {
  const socket = useSocket();
  // Mirror `socket` into a ref so the PeerConnection callbacks (set once when
  // the PC is built) always reach the CURRENT socket. Without this, an
  // onicecandidate fired AFTER a socket.io reconnect would emit on the dead
  // socket and the candidate would never reach the peer — call stalls.
  const socketRef = useRef(socket);
  useEffect(() => {
    socketRef.current = socket;
  }, [socket]);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  // Caller-side flag: set when peer accepts so the SDP-offer step can fire.
  // Without this, we'd race the offer ahead of the peer's PeerConnection
  // existing — they're still on the ringer when the offer broadcast goes out
  // and the event is lost.
  const peerAcceptedRef = useRef(false);
  const acceptTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const [callState, setCallState] = useState<CallState>(isIncoming ? 'RINGING' : 'IDLE');
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [muted, setMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const teardown = useCallback(() => {
    if (acceptTimeoutRef.current) {
      clearTimeout(acceptTimeoutRef.current);
      acceptTimeoutRef.current = undefined;
    }
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
    setLocalStream(null);
    setRemoteStream(null);
    setMuted(false);
    setCameraOn(false);
    pendingCandidatesRef.current = [];
    peerAcceptedRef.current = false;
  }, []);

  const createPeerConnection = useCallback(async () => {
    const iceServers = await getIceServers();
    const pc = new RTCPeerConnection({ iceServers });

    pc.onicecandidate = (e) => {
      const s = socketRef.current;
      if (e.candidate && s) {
        s.emit(SocketEvents.CALL_ICE_CANDIDATE, {
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
  }, [conversationId]);

  const getLocalStream = useCallback(async () => {
    const constraints: MediaStreamConstraints =
      mode === 'video' ? { audio: true, video: true } : { audio: true, video: false };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    localStreamRef.current = stream;
    setLocalStream(stream);
    setMuted(false);
    setCameraOn(stream.getVideoTracks().some((track) => track.enabled));
    return stream;
  }, [mode]);

  /**
   * Caller flow:
   *   1. Get mic, create PC, attach local tracks.
   *   2. Emit call:invite. State = DIALING.
   *   3. Wait for call:accept from peer (handled in the socket effect).
   *   4. When call:accept arrives → createOffer + emit call:offer → state = CONNECTING.
   *   5. Peer answers with call:answer → setRemoteDescription → ICE → CONNECTED.
   */
  const startCall = useCallback(async () => {
    if (!socket) return;
    // Guard against double-fire: if a PC already exists (e.g. the voice-call
    // screen's auto-start effect re-ran on socket reconnect, or the user
    // tapped twice), bail. Re-entering would orphan the first PC and emit a
    // second CALL_INVITE, confusing the server's call state.
    if (pcRef.current) return;
    setError(null);
    setCallState('DIALING');
    peerAcceptedRef.current = false;
    try {
      const stream = await getLocalStream();
      const pc = await createPeerConnection();
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      socket.emit(SocketEvents.CALL_INVITE, { conversationId, fromUserId: '', mode });

      // Time out if the peer never accepts within 30s.
      acceptTimeoutRef.current = setTimeout(() => {
        if (!peerAcceptedRef.current) {
          setError('No answer');
          socket.emit(SocketEvents.CALL_HANGUP, { conversationId, reason: 'no-answer' });
          teardown();
          setCallState('ENDED');
        }
      }, ACCEPT_TIMEOUT_MS);
    } catch (err) {
      setError(getLocalMediaErrorMessage(err, mode));
      teardown();
      setCallState(isLocalMediaError(err) ? 'IDLE' : 'ENDED');
    }
  }, [socket, conversationId, mode, createPeerConnection, getLocalStream, teardown]);

  /**
   * Callee flow:
   *   1. Get mic, create PC, attach local tracks.
   *   2. Emit call:accept (this is the synchronization point the caller waits for).
   *      State = CONNECTING.
   *   3. Caller sends call:offer → setRemoteDescription → createAnswer →
   *      emit call:answer.
   *   4. ICE exchange continues → CONNECTED.
   */
  const acceptCall = useCallback(async () => {
    if (!socket) return;
    // Same double-fire guard as startCall: if the callee double-taps the
    // accept button or the effect re-runs, the second invocation would
    // create a second PC and emit a second CALL_ACCEPT.
    if (pcRef.current) return;
    setError(null);
    setCallState('CONNECTING');
    try {
      const stream = await getLocalStream();
      const pc = await createPeerConnection();
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      socket.emit(SocketEvents.CALL_ACCEPT, { conversationId, fromUserId: '', mode });
    } catch (err) {
      setError(getLocalMediaErrorMessage(err, mode));
      teardown();
      setCallState(isLocalMediaError(err) ? 'RINGING' : 'ENDED');
    }
  }, [socket, conversationId, mode, createPeerConnection, getLocalStream, teardown]);

  const rejectCall = useCallback(() => {
    socket?.emit(SocketEvents.CALL_REJECT, { conversationId, fromUserId: '', mode });
    teardown();
    setCallState('ENDED');
  }, [socket, conversationId, mode, teardown]);

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

  const toggleCamera = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const tracks = stream.getVideoTracks();
    if (tracks.length === 0) return;
    const next = !cameraOn;
    tracks.forEach((t) => (t.enabled = next));
    setCameraOn(next);
  }, [cameraOn]);

  const toggleSpeaker = useCallback(() => {
    setSpeakerOn((on) => !on);
  }, []);

  // ─── Socket event wiring ─────────────────────────────────────────────────

  useEffect(() => {
    if (!socket) return;

    const onAccept = async () => {
      // Caller side: peer is now on the call screen with their PeerConnection
      // ready. Safe to send the SDP offer now.
      peerAcceptedRef.current = true;
      if (acceptTimeoutRef.current) {
        clearTimeout(acceptTimeoutRef.current);
        acceptTimeoutRef.current = undefined;
      }
      const pc = pcRef.current;
      if (!pc) return;
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit(SocketEvents.CALL_OFFER, { conversationId, sdp: offer });
        setCallState('CONNECTING');
      } catch (err) {
        setError((err as Error).message ?? 'Could not create offer');
        teardown();
        setCallState('ENDED');
      }
    };

    const onOffer = async ({ sdp }: CallSdpPayload) => {
      const pc = pcRef.current;
      if (!pc) {
        // The offer arrived before we created our PeerConnection. This is the
        // bug we just fixed by waiting for call:accept on the caller side, so
        // we shouldn't see it anymore — but log it loudly if we do.
        console.warn('[webrtc] received call:offer with no peer connection ready');
        return;
      }
      try {
        await pc.setRemoteDescription(sdp);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit(SocketEvents.CALL_ANSWER, { conversationId, sdp: answer });
        // Drain any candidates that arrived before we set remoteDescription.
        for (const c of pendingCandidatesRef.current) {
          try {
            await pc.addIceCandidate(c);
          } catch {
            // ignore — peer may have sent a stale candidate after teardown
          }
        }
        pendingCandidatesRef.current = [];
      } catch (err) {
        setError((err as Error).message ?? 'Failed to answer');
        teardown();
        setCallState('ENDED');
      }
    };

    const onAnswer = async ({ sdp }: CallSdpPayload) => {
      const pc = pcRef.current;
      if (!pc) return;
      try {
        await pc.setRemoteDescription(sdp);
        for (const c of pendingCandidatesRef.current) {
          try {
            await pc.addIceCandidate(c);
          } catch {
            // ignore
          }
        }
        pendingCandidatesRef.current = [];
      } catch (err) {
        setError((err as Error).message ?? 'Failed to apply answer');
      }
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

    const onReject = () => {
      setError('Call rejected');
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
  }, [socket, conversationId, teardown]);

  // Tear down everything when the consuming component unmounts.
  useEffect(() => () => teardown(), [teardown]);

  return {
    callState,
    localStream,
    remoteStream,
    startCall,
    acceptCall,
    rejectCall,
    hangup,
    toggleMute,
    muted,
    cameraOn,
    toggleCamera,
    speakerOn,
    toggleSpeaker,
    error,
  };
}
