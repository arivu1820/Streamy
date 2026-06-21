'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getSocket } from './socket';

/**
 * Mesh WebRTC voice chat scoped to a watch session (streamy.md Section 46).
 * - Audio flows peer-to-peer; our Socket.IO gateway is only the signaling relay.
 * - Free Google STUN for NAT discovery. Optional TURN via NEXT_PUBLIC_TURN_* envs.
 * - A newcomer initiates offers to everyone already in voice (avoids glare).
 * This hook is self-contained and does not touch playback, chat, or presence.
 */

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];
if (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_TURN_URL) {
  ICE_SERVERS.push({
    urls: process.env.NEXT_PUBLIC_TURN_URL,
    username: process.env.NEXT_PUBLIC_TURN_USERNAME,
    credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL,
  });
}

export interface VoicePeer {
  userId: string;
  username: string;
  muted: boolean;
}

export function useVoice(sessionId: string) {
  const [inVoice, setInVoice] = useState(false);
  const [muted, setMuted] = useState(false);
  const [peers, setPeers] = useState<VoicePeer[]>([]);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [error, setError] = useState<string | null>(null);

  // Always-visible list of everyone currently in voice (including self when joined).
  // Populated from session.state on load and kept live via voice.peer.* events.
  const [voicePresence, setVoicePresence] = useState<VoicePeer[]>([]);

  const localStream = useRef<MediaStream | null>(null);
  const pcs = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingIce = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const handlers = useRef<Record<string, (...a: any[]) => void>>({});

  // ---------- voicePresence helpers ----------
  const upsertPresence = useCallback((p: VoicePeer) => {
    setVoicePresence((prev) => {
      const i = prev.findIndex((x) => x.userId === p.userId);
      if (i >= 0) {
        const copy = [...prev];
        copy[i] = { ...copy[i], muted: p.muted, username: p.username || copy[i].username };
        return copy;
      }
      return [...prev, p];
    });
  }, []);

  const removePresence = useCallback((userId: string) => {
    setVoicePresence((prev) => prev.filter((x) => x.userId !== userId));
  }, []);

  // Always-on listeners: track who is in voice regardless of whether we joined.
  useEffect(() => {
    const s = getSocket();

    const onState = (snap: any) => {
      if (snap?.voiceRoster) setVoicePresence(snap.voiceRoster);
    };
    const onJoined = (p: { userId: string; username: string }) =>
      upsertPresence({ userId: p.userId, username: p.username, muted: false });
    const onLeft = (p: { userId: string }) => removePresence(p.userId);
    const onMuted = (p: { userId: string; muted: boolean }) =>
      setVoicePresence((prev) =>
        prev.map((x) => (x.userId === p.userId ? { ...x, muted: p.muted } : x)),
      );

    s.on('session.state', onState);
    s.on('voice.peer.joined', onJoined);
    s.on('voice.peer.left', onLeft);
    s.on('voice.peer.muted', onMuted);

    return () => {
      s.off('session.state', onState);
      s.off('voice.peer.joined', onJoined);
      s.off('voice.peer.left', onLeft);
      s.off('voice.peer.muted', onMuted);
    };
  }, [upsertPresence, removePresence]);

  // ---------- peers (WebRTC connections) ----------
  const upsertPeer = useCallback((p: VoicePeer) => {
    setPeers((prev) => {
      const i = prev.findIndex((x) => x.userId === p.userId);
      if (i >= 0) {
        const copy = [...prev];
        copy[i] = { ...copy[i], muted: p.muted, username: p.username || copy[i].username };
        return copy;
      }
      return [...prev, p];
    });
  }, []);

  const removePeer = useCallback((userId: string) => {
    pcs.current.get(userId)?.close();
    pcs.current.delete(userId);
    pendingIce.current.delete(userId);
    setPeers((prev) => prev.filter((x) => x.userId !== userId));
    setRemoteStreams((prev) => {
      const copy = { ...prev };
      delete copy[userId];
      return copy;
    });
  }, []);

  const createPeer = useCallback(
    (remoteUserId: string, remoteUsername: string, initiator: boolean) => {
      if (pcs.current.has(remoteUserId)) return pcs.current.get(remoteUserId)!;
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pcs.current.set(remoteUserId, pc);
      upsertPeer({ userId: remoteUserId, username: remoteUsername, muted: false });

      localStream.current?.getTracks().forEach((t) => pc.addTrack(t, localStream.current!));

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          getSocket().emit('voice.signal', {
            sessionId,
            targetUserId: remoteUserId,
            data: { candidate: e.candidate.toJSON() },
          });
        }
      };
      pc.ontrack = (e) => {
        setRemoteStreams((prev) => ({ ...prev, [remoteUserId]: e.streams[0] }));
      };
      pc.onconnectionstatechange = () => {
        if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) {
          // leave teardown / peer.left will handle removal; nothing forced here.
        }
      };

      if (initiator) {
        pc.createOffer()
          .then((offer) => pc.setLocalDescription(offer))
          .then(() => {
            getSocket().emit('voice.signal', {
              sessionId,
              targetUserId: remoteUserId,
              data: pc.localDescription,
            });
          })
          .catch(() => {});
      }
      return pc;
    },
    [sessionId, upsertPeer],
  );

  const drainIce = useCallback(async (userId: string, pc: RTCPeerConnection) => {
    const queued = pendingIce.current.get(userId);
    if (queued) {
      for (const c of queued) await pc.addIceCandidate(c).catch(() => {});
      pendingIce.current.delete(userId);
    }
  }, []);

  const join = useCallback(
    async (selfUserId: string, selfUsername: string) => {
      if (inVoice) return;
      setError(null);
      try {
        localStream.current = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      } catch {
        setError('Microphone permission is required to join voice.');
        return;
      }
      const s = getSocket();

      handlers.current.roster = ({ peers }: { peers: VoicePeer[] }) => {
        peers.forEach((p) => createPeer(p.userId, p.username, true));
        // Sync voicePresence with the full current roster + self
        setVoicePresence((prev) => {
          const merged = [...prev];
          peers.forEach((p) => {
            if (!merged.find((x) => x.userId === p.userId)) merged.push(p);
          });
          if (!merged.find((x) => x.userId === selfUserId)) {
            merged.push({ userId: selfUserId, username: selfUsername, muted: false });
          }
          return merged;
        });
      };
      handlers.current.joined = (p: { userId: string; username: string }) => {
        upsertPeer({ userId: p.userId, username: p.username, muted: false }); // they will offer us
      };
      handlers.current.left = (p: { userId: string }) => removePeer(p.userId);
      handlers.current.muted = (p: { userId: string; muted: boolean }) =>
        upsertPeer({ userId: p.userId, username: '', muted: p.muted } as VoicePeer);
      handlers.current.signal = async ({ fromUserId, fromUsername, data }: any) => {
        let pc = pcs.current.get(fromUserId);
        if (data.type === 'offer') {
          if (!pc) pc = createPeer(fromUserId, fromUsername, false);
          await pc.setRemoteDescription(data);
          await drainIce(fromUserId, pc);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          getSocket().emit('voice.signal', { sessionId, targetUserId: fromUserId, data: pc.localDescription });
        } else if (data.type === 'answer') {
          if (pc) {
            await pc.setRemoteDescription(data);
            await drainIce(fromUserId, pc);
          }
        } else if (data.candidate) {
          if (pc && pc.remoteDescription) {
            await pc.addIceCandidate(data.candidate).catch(() => {});
          } else {
            const q = pendingIce.current.get(fromUserId) || [];
            q.push(data.candidate);
            pendingIce.current.set(fromUserId, q);
          }
        }
      };

      s.on('voice.roster', handlers.current.roster);
      s.on('voice.peer.joined', handlers.current.joined);
      s.on('voice.peer.left', handlers.current.left);
      s.on('voice.peer.muted', handlers.current.muted);
      s.on('voice.signal', handlers.current.signal);

      s.emit('voice.join', { sessionId });
      setInVoice(true);
      setMuted(false);
      // Add self to voicePresence immediately (roster event fills in peers)
      upsertPresence({ userId: selfUserId, username: selfUsername, muted: false });
    },
    [inVoice, sessionId, createPeer, removePeer, upsertPeer, upsertPresence, drainIce],
  );

  const leave = useCallback(
    (selfUserId?: string) => {
      const s = getSocket();
      s.emit('voice.leave', { sessionId });
      s.off('voice.roster', handlers.current.roster);
      s.off('voice.peer.joined', handlers.current.joined);
      s.off('voice.peer.left', handlers.current.left);
      s.off('voice.peer.muted', handlers.current.muted);
      s.off('voice.signal', handlers.current.signal);
      pcs.current.forEach((pc) => pc.close());
      pcs.current.clear();
      pendingIce.current.clear();
      localStream.current?.getTracks().forEach((t) => t.stop());
      localStream.current = null;
      setRemoteStreams({});
      setPeers([]);
      setInVoice(false);
      if (selfUserId) removePresence(selfUserId);
    },
    [sessionId, removePresence],
  );

  const toggleMute = useCallback(
    (selfUserId?: string) => {
      const next = !muted;
      localStream.current?.getAudioTracks().forEach((t) => (t.enabled = !next));
      setMuted(next);
      getSocket().emit('voice.mute', { sessionId, muted: next });
      if (selfUserId) {
        setVoicePresence((prev) =>
          prev.map((x) => (x.userId === selfUserId ? { ...x, muted: next } : x)),
        );
      }
    },
    [muted, sessionId],
  );

  // Tear down on unmount.
  useEffect(() => {
    return () => {
      if (inVoice) leave();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inVoice]);

  return { inVoice, muted, peers, remoteStreams, error, voicePresence, join, leave, toggleMute };
}
