'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, streamUrl } from '../../../lib/api';
import { useRequireAuth } from '../../../lib/auth';
import { getSocket } from '../../../lib/socket';
import { Avatar, Spinner, fmtTime } from '../../../components/ui';
import { ChatPanel } from '../../../components/ChatPanel';

export default function TheaterPage() {
  const user = useRequireAuth();
  const router = useRouter();
  const { id: sessionId } = useParams<{ id: string }>();

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

  // Apply authoritative state to the <video> element.
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
    const onJoined = (p: any) => setParticipants((prev) => (prev.some((x) => x.userId === p.user.userId) ? prev : [...prev, p.user]));
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
      setBanner(e.reason === 'host_left' ? `The host left. @${who?.username || 'someone'} is now the session host.` : `@${who?.username || 'someone'} is now the session host.`);
    };
    const onReqCreated = (e: any) => setRequests((prev) => [...prev, e.request]);
    const onReqResolved = (e: any) => setRequests((prev) => prev.filter((r) => r.id !== e.requestId));
    const onChangeOpened = (e: any) => setChangeVote({ ...e, approvals: 1, rejects: 0, needed: 99, myVote: null });
    const onChangeVoted = (e: any) => setChangeVote((prev: any) => (prev && prev.voteId === e.voteId ? { ...prev, ...e } : prev));
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

    s.on('session.state', onSnapshot);
    s.on('participant.joined', onJoined);
    s.on('participant.left', onLeft);
    s.on('playback.paused', onPaused);
    s.on('playback.played', onPlayed);
    s.on('playback.seeked', onSeeked);
    s.on('host.changed', onHostChanged);
    s.on('playback.request.created', onReqCreated);
    s.on('playback.request.resolved', onReqResolved);
    s.on('playback.change.opened', onChangeOpened);
    s.on('playback.change.voted', onChangeVoted);
    s.on('playback.video.changed', onVideoChanged);
    s.on('playback.change.rejected', onChangeRejected);
    s.on('host.transfer.offered', onHostOffered);
    s.on('session.ended', onEnded);
    s.on('error', onErr);

    const hb = setInterval(() => s.emit('presence.heartbeat'), 25000);

    return () => {
      mounted = false;
      clearInterval(hb);
      s.emit('session.leave', { sessionId });
      [
        ['session.state', onSnapshot], ['participant.joined', onJoined], ['participant.left', onLeft],
        ['playback.paused', onPaused], ['playback.played', onPlayed], ['playback.seeked', onSeeked],
        ['host.changed', onHostChanged], ['playback.request.created', onReqCreated], ['playback.request.resolved', onReqResolved],
        ['playback.change.opened', onChangeOpened], ['playback.change.voted', onChangeVoted], ['playback.video.changed', onVideoChanged],
        ['playback.change.rejected', onChangeRejected], ['host.transfer.offered', onHostOffered], ['session.ended', onEnded], ['error', onErr],
      ].forEach(([ev, fn]: any) => s.off(ev, fn));
    };
  }, [user, sessionId, applyState, router]);

  const participantsRef = useRef<any[]>([]);
  useEffect(() => {
    participantsRef.current = participants;
  }, [participants]);

  // local clock for the scrubber
  useEffect(() => {
    const id = setInterval(() => {
      const v = videoRef.current;
      if (v) setClock(v.currentTime);
    }, 500);
    return () => clearInterval(id);
  }, []);

  function emit(event: string, payload: any) {
    getSocket().emit(event, { sessionId, ...payload });
  }

  if (!user) return null;
  if (ended)
    return (
      <div className="card p-10 text-center space-y-3">
        <div className="text-lg font-medium">This session has ended.</div>
        <button className="btn-primary" onClick={() => router.replace(`/rooms/${detail?.roomId || ''}`)}>Back to room</button>
      </div>
    );
  if (!detail) return <Spinner label="Joining the session and syncing to the group…" />;

  return (
    <div className="grid lg:grid-cols-[1fr_360px] gap-5">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <button className="text-sm text-gray-400 hover:text-gray-200" onClick={() => router.push(`/rooms/${detail.roomId}`)}>
            ← Back to room
          </button>
          <div className="text-sm text-gray-400">{nowPlaying?.title}</div>
        </div>

        <div className="bg-black rounded-xl overflow-hidden relative">
          {nowPlaying && (
            <video
              ref={videoRef}
              src={streamUrl(nowPlaying.id)}
              className="w-full aspect-video bg-black"
              onLoadedMetadata={(e) => setDuration((e.target as HTMLVideoElement).duration)}
              playsInline
              controls={false}
            />
          )}
          {banner && (
            <div role="status" aria-live="polite" className="absolute bottom-0 inset-x-0 bg-black/70 text-sm text-center py-2 px-3">
              {banner}
            </div>
          )}
        </div>

        {/* scrubber */}
        <div className="flex items-center gap-3 text-xs text-gray-400">
          <span>{fmtTime(clock * 1000)}</span>
          <input
            type="range"
            min={0}
            max={duration || 0}
            value={clock}
            disabled={!isHost}
            onChange={(e) => emit('playback.seek', { positionMs: Number(e.target.value) * 1000 })}
            className="flex-1 accent-brand disabled:opacity-50"
          />
          <span>{fmtTime((duration || 0) * 1000)}</span>
        </div>

        {/* governance controls */}
        <div className="card p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-ghost" onClick={() => emit('playback.pause', {})}>⏸ Pause (anyone)</button>
            {isHost ? (
              <>
                <button className="btn-primary" onClick={() => emit('playback.play', {})}>▶ Play / Resume (host)</button>
                <button className="btn-ghost" onClick={() => emit('playback.seek', { positionMs: Math.max(0, (clock - 10) * 1000) })}>⏪ 10s</button>
                <button className="btn-ghost" onClick={() => emit('playback.seek', { positionMs: (clock + 10) * 1000 })}>10s ⏩</button>
              </>
            ) : (
              <>
                <span className="text-xs text-gray-500">Only the host can resume/seek. You can request:</span>
                <button className="btn-ghost" onClick={() => emit('playback.request', { type: 'rewind', positionMs: Math.max(0, (clock - 30) * 1000) })}>Request ⏪ 30s</button>
                <button className="btn-ghost" onClick={() => emit('playback.request', { type: 'forward', positionMs: (clock + 30) * 1000 })}>Request 30s ⏩</button>
              </>
            )}
          </div>

          {/* change video (any participant initiates a vote) */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-500">Change movie (group vote):</span>
            <select
              className="input w-auto py-1"
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) emit('playback.change.request', { videoId: e.target.value });
                e.target.value = '';
              }}
            >
              <option value="">Propose a different video…</option>
              {roomVideos
                .filter((v) => v.id !== nowPlaying?.id && v.status === 'ready')
                .map((v) => (
                  <option key={v.id} value={v.id}>{v.title}</option>
                ))}
            </select>
          </div>

          {/* host: incoming requests */}
          {isHost && requests.length > 0 && (
            <div className="space-y-2">
              {requests.map((r) => (
                <div key={r.id} className="flex items-center justify-between bg-panel2 rounded-lg px-3 py-2 text-sm">
                  <span>@{r.byUsername} requested to jump to {fmtTime(r.positionMs)}</span>
                  <div className="flex gap-2">
                    <button className="btn-primary py-1" onClick={() => emit('playback.request.approve', { requestId: r.id })}>Approve</button>
                    <button className="btn-ghost py-1" onClick={() => emit('playback.request.reject', { requestId: r.id })}>Reject</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* participants */}
        <div className="card p-4">
          <div className="text-sm font-medium mb-2">Watching now ({participants.length})</div>
          <div className="flex flex-wrap gap-3">
            {participants.map((p) => (
              <div key={p.userId} className="flex items-center gap-2">
                <Avatar name={p.username} size={28} />
                <span className="text-sm">@{p.username}</span>
                {p.userId === hostId && <span className="chip bg-brand/20 text-brand2">host</span>}
                {isHost && p.userId !== user.id && (
                  <button
                    className="text-[10px] text-gray-500 hover:text-brand2"
                    onClick={() => emit('host.transfer.offer', { targetUserId: p.userId })}
                  >
                    make host
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <ChatPanel roomId={detail.roomId} compact />

      {/* change-video vote modal */}
      {changeVote && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-30 p-4">
          <div className="card p-6 max-w-sm w-full space-y-4">
            <div className="font-medium">Vote: change movie to “{changeVote.videoTitle}”?</div>
            <div className="text-sm text-gray-400">
              Changing the movie affects everyone, so it needs a group vote. A tie keeps the current video.
            </div>
            <div className="text-sm">
              Approvals: <b>{changeVote.approvals ?? 0}</b> / {changeVote.participants ?? '—'}
              {changeVote.needed && changeVote.needed < 90 && <span className="text-gray-500"> (needs {changeVote.needed})</span>}
            </div>
            <div className="flex gap-2">
              <button className="btn-primary flex-1" onClick={() => emit('playback.change.vote', { voteId: changeVote.voteId, value: 'approve' })}>Approve</button>
              <button className="btn-ghost flex-1" onClick={() => emit('playback.change.vote', { voteId: changeVote.voteId, value: 'reject' })}>Reject</button>
            </div>
          </div>
        </div>
      )}

      {/* host transfer offer */}
      {hostOffer && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-30 p-4">
          <div className="card p-6 max-w-sm w-full space-y-4">
            <div className="font-medium">@{hostOffer.from} wants to transfer playback control to you.</div>
            <div className="flex gap-2">
              <button
                className="btn-primary flex-1"
                onClick={() => {
                  emit('host.transfer.accept', {});
                  setHostOffer(null);
                }}
              >
                Accept control
              </button>
              <button className="btn-ghost flex-1" onClick={() => setHostOffer(null)}>Decline</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
