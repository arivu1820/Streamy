'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from './api';
import { getSocket } from './socket';
import { fmtTime } from '../components/ui';

/**
 * All live watch-session wiring (REST detail + Socket.IO playback governance,
 * presence, late-join sync) for the Theater page. Keeping it in a hook keeps the
 * page component small and focused on layout.
 */
export function useTheaterSession(sessionId: string, user: any) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);

  const [detail, setDetail] = useState<any>(null);
  const [nowPlaying, setNowPlaying] = useState<{ id: string; title: string } | null>(null);
  const [hostId, setHostId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [participants, setParticipants] = useState<any[]>([]);
  const [duration, setDuration] = useState(0);
  const [clock, setClock] = useState(0);
  const [banner, setBanner] = useState('');
  const [requests, setRequests] = useState<any[]>([]);
  const [changeVote, setChangeVote] = useState<any>(null);
  const [hostOffer, setHostOffer] = useState<any>(null);
  const [roomVideos, setRoomVideos] = useState<any[]>([]);
  const [ended, setEnded] = useState(false);

  const isHost = hostId === user?.id;

  const applyState = useCallback((positionMs: number, serverTs: number, playing: boolean) => {
    const v = videoRef.current;
    if (!v) return;
    const elapsed = playing ? Date.now() - serverTs : 0;
    const target = (positionMs + elapsed) / 1000;
    if (Math.abs(v.currentTime - target) > 1.0) v.currentTime = target;
    if (playing && v.paused) v.play().catch(() => {});
    if (!playing && !v.paused) v.pause();
    setIsPlaying(playing);
  }, []);

  const participantsRef = useRef<any[]>([]);
  useEffect(() => {
    participantsRef.current = participants;
  }, [participants]);

  useEffect(() => {
    if (!user) return;
    let mounted = true;
    api
      .get(`/sessions/${sessionId}`)
      .then((d) => {
        if (!mounted) return;
        setDetail(d);
        setNowPlaying(d.nowPlaying);
        setHostId(d.hostUserId);
        api.get(`/rooms/${d.roomId}/videos`).then((vs) => mounted && setRoomVideos(vs));
      })
      .catch(() => router.replace('/rooms'));

    const s = getSocket();
    s.emit('session.join', { sessionId });

    const onSnapshot = (snap: any) => {
      if (!snap) return;
      setHostId(snap.hostUserId);
      setParticipants(snap.participants || []);
      applyState(snap.positionMs, snap.serverTs, snap.isPlaying);
    };
    const onJoined = (p: any) =>
      setParticipants((prev) => (prev.some((x) => x.userId === p.user.userId) ? prev : [...prev, p.user]));
    const onLeft = (p: any) => setParticipants((prev) => prev.filter((x) => x.userId !== p.userId));
    const onPaused = (e: any) => {
      applyState(e.positionMs, e.serverTs, false);
      setBanner(`${e.by} paused playback for the group.`);
    };
    const onPlayed = (e: any) => {
      applyState(e.positionMs, e.serverTs, true);
      setBanner('');
    };
    const onSeeked = (e: any) => {
      applyState(e.positionMs, e.serverTs, false);
      setBanner(`Jumped to ${fmtTime(e.positionMs)}${e.by ? ' by ' + e.by : ''}.`);
    };
    const onHostChanged = (e: any) => {
      setHostId(e.newHostUserId);
      const who = participantsRef.current.find((x) => x.userId === e.newHostUserId);
      setBanner(
        e.reason === 'host_left'
          ? `The host left. @${who?.username || 'someone'} is now the session host.`
          : `@${who?.username || 'someone'} is now the session host.`,
      );
    };
    const onReqCreated = (e: any) => setRequests((prev) => [...prev, e.request]);
    const onReqResolved = (e: any) => setRequests((prev) => prev.filter((r) => r.id !== e.requestId));
    const onChangeOpened = (e: any) => setChangeVote({ ...e, approvals: 1, rejects: 0, needed: 99 });
    const onChangeVoted = (e: any) =>
      setChangeVote((prev: any) => (prev && prev.voteId === e.voteId ? { ...prev, ...e } : prev));
    const onVideoChanged = (e: any) => {
      setChangeVote(null);
      setNowPlaying({ id: e.videoId, title: e.videoTitle });
      setBanner(`Movie changed to "${e.videoTitle}" by group vote.`);
    };
    const onChangeRejected = (e: any) => {
      setChangeVote(null);
      setBanner(`Change-video vote did not pass (${e.approvals}/${e.participants}). A tie keeps the current video.`);
    };
    const onHostOffered = (e: any) => {
      if (e.targetUserId === user.id) setHostOffer(e);
    };
    const onEnded = () => setEnded(true);
    const onErr = (e: any) => {
      const map: Record<string, string> = {
        NOT_HOST: 'Only the session host can do that. Ask the host or request control.',
        SESSION_ENDED: 'This session has ended.',
        STALE_REQUEST: 'That request is no longer valid.',
        CHANGE_VOTE_IN_PROGRESS: 'A change-video vote is already in progress.',
        VIDEO_NOT_READY: 'That video is not ready.',
      };
      setBanner(map[e.code] || e.code);
    };

    const map: [string, any][] = [
      ['session.state', onSnapshot], ['participant.joined', onJoined], ['participant.left', onLeft],
      ['playback.paused', onPaused], ['playback.played', onPlayed], ['playback.seeked', onSeeked],
      ['host.changed', onHostChanged], ['playback.request.created', onReqCreated], ['playback.request.resolved', onReqResolved],
      ['playback.change.opened', onChangeOpened], ['playback.change.voted', onChangeVoted], ['playback.video.changed', onVideoChanged],
      ['playback.change.rejected', onChangeRejected], ['host.transfer.offered', onHostOffered], ['session.ended', onEnded], ['error', onErr],
    ];
    map.forEach(([ev, fn]) => s.on(ev, fn));
    const hb = setInterval(() => s.emit('presence.heartbeat'), 25000);

    return () => {
      mounted = false;
      clearInterval(hb);
      s.emit('session.leave', { sessionId });
      map.forEach(([ev, fn]) => s.off(ev, fn));
    };
  }, [user, sessionId, applyState, router]);

  useEffect(() => {
    const id = setInterval(() => {
      const v = videoRef.current;
      if (v) setClock(v.currentTime);
    }, 500);
    return () => clearInterval(id);
  }, []);

  const emit = useCallback(
    (event: string, payload: any) => getSocket().emit(event, { sessionId, ...payload }),
    [sessionId],
  );

  return {
    videoRef, detail, nowPlaying, hostId, isHost, isPlaying, participants, duration, setDuration,
    clock, banner, requests, changeVote, hostOffer, setHostOffer, roomVideos, ended, emit,
  };
}
