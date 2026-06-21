'use client';
import { useParams, useRouter } from 'next/navigation';
import { streamUrl } from '../../../lib/api';
import { useRequireAuth } from '../../../lib/auth';
import { useTheaterSession } from '../../../lib/useTheaterSession';
import { Avatar, Spinner, fmtTime, SectionTitle, Caption, Badge } from '../../../components/ui';
import { Icon } from '../../../components/icons';
import { ChatPanel } from '../../../components/ChatPanel';
import { VoiceBar } from '../../../components/VoiceBar';

export default function TheaterPage() {
  const user = useRequireAuth();
  const router = useRouter();
  const { id: sessionId } = useParams<{ id: string }>();
  const t = useTheaterSession(sessionId, user);

  if (!user) return null;
  if (t.ended)
    return (
      <div className="card p-10 text-center space-y-4 max-w-md mx-auto mt-10">
        <div className="w-12 h-12 rounded-2xl bg-panel2 border border-edge text-gray-400 flex items-center justify-center mx-auto">
          <Icon.Live size={22} />
        </div>
        <div className="text-lg font-medium">This session has ended.</div>
        <button className="btn-primary mx-auto" onClick={() => router.replace(`/rooms/${t.detail?.roomId || ''}`)}>
          <Icon.ArrowLeft size={16} /> Back to room
        </button>
      </div>
    );
  if (!t.detail) return <Spinner label="Joining the session and syncing to the group…" />;

  const { nowPlaying, isHost, isPlaying, clock, duration } = t;

  return (
    <div className="grid lg:grid-cols-[1fr_360px] gap-5">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <button className="btn-subtle btn-sm" onClick={() => router.push(`/rooms/${t.detail.roomId}`)}>
            <Icon.ArrowLeft size={15} /> Back to room
          </button>
          <div className="text-sm text-gray-300 font-medium flex items-center gap-2 min-w-0">
            <Icon.Film size={15} className="text-brand2 shrink-0" />
            <span className="truncate">{nowPlaying?.title}</span>
          </div>
        </div>

        <div className="bg-black rounded-2xl overflow-hidden relative border border-edge">
          {nowPlaying && (
            <video
              ref={t.videoRef}
              src={streamUrl(nowPlaying.id)}
              className="w-full aspect-video bg-black"
              onLoadedMetadata={(e) => t.setDuration((e.target as HTMLVideoElement).duration)}
              playsInline
              controls={false}
            />
          )}
          {t.banner && (
            <div
              role="status"
              aria-live="polite"
              className="absolute bottom-0 inset-x-0 bg-black/75 backdrop-blur-sm text-sm py-2 px-3 flex items-center justify-center gap-2"
            >
              <Icon.Info size={14} className="text-brand2 shrink-0" />
              {t.banner}
            </div>
          )}
        </div>

        {/* scrubber */}
        <div className="flex items-center gap-3 text-xs text-gray-400">
          <span className={isPlaying ? 'text-good' : 'text-gray-400'} title={isPlaying ? 'Playing' : 'Paused'}>
            {isPlaying ? <Icon.Play size={14} /> : <Icon.Pause size={14} />}
          </span>
          <span className="tabular-nums">{fmtTime(clock * 1000)}</span>
          <input
            type="range"
            min={0}
            max={duration || 0}
            value={clock}
            disabled={!isHost}
            onChange={(e) => t.emit('playback.seek', { positionMs: Number(e.target.value) * 1000 })}
            className="flex-1 accent-brand disabled:opacity-50"
            title={isHost ? 'Drag to seek for everyone' : 'Only the host can seek'}
          />
          <span className="tabular-nums">{fmtTime((duration || 0) * 1000)}</span>
        </div>

        {/* governance controls */}
        <div className="card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <SectionTitle icon="Vote">Playback controls</SectionTitle>
            {isHost ? <Badge tone="brand" icon="Host">You're the host</Badge> : <Badge tone="neutral" icon="Eye">Watching</Badge>}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-ghost" onClick={() => t.emit('playback.pause', {})} title="Anyone can pause for the whole group, instantly">
              <Icon.Pause size={16} /> Pause
            </button>
            {isHost ? (
              <>
                <button className="btn-primary" onClick={() => t.emit('playback.play', {})} title="Resume playback for everyone">
                  <Icon.Play size={16} /> Play / Resume
                </button>
                <button className="btn-ghost" onClick={() => t.emit('playback.seek', { positionMs: Math.max(0, (clock - 10) * 1000) })} title="Rewind 10s for everyone">
                  <Icon.Rewind size={16} /> 10s
                </button>
                <button className="btn-ghost" onClick={() => t.emit('playback.seek', { positionMs: (clock + 10) * 1000 })} title="Forward 10s for everyone">
                  <Icon.Forward size={16} /> 10s
                </button>
              </>
            ) : (
              <>
                <button className="btn-ghost" onClick={() => t.emit('playback.request', { type: 'rewind', positionMs: Math.max(0, (clock - 30) * 1000) })} title="Ask the host to rewind 30s">
                  <Icon.Hand size={16} /> Request <Icon.Rewind size={14} /> 30s
                </button>
                <button className="btn-ghost" onClick={() => t.emit('playback.request', { type: 'forward', positionMs: (clock + 30) * 1000 })} title="Ask the host to skip 30s">
                  <Icon.Hand size={16} /> Request <Icon.Forward size={14} /> 30s
                </button>
              </>
            )}
          </div>
          <Caption icon="Info">
            {isHost
              ? 'Anyone can pause. As host, you control resume and seeking — others send requests you approve.'
              : 'Anyone can pause for the group. Only the host can resume or seek — use Request and the host approves.'}
          </Caption>

          <div className="flex items-center gap-2 text-sm pt-3 border-t border-edge">
            <span className="text-gray-500 flex items-center gap-1.5 shrink-0">
              <Icon.Vote size={15} /> Change movie:
            </span>
            <select
              className="input w-auto py-1.5"
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) t.emit('playback.change.request', { videoId: e.target.value });
                e.target.value = '';
              }}
            >
              <option value="">Propose a different video…</option>
              {t.roomVideos
                .filter((v) => v.id !== nowPlaying?.id && v.status === 'ready')
                .map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.title}
                  </option>
                ))}
            </select>
          </div>
          <Caption icon="Vote">Changing the movie affects everyone, so it opens a group vote. A tie keeps the current video.</Caption>

          {isHost && t.requests.length > 0 && (
            <div className="space-y-2 pt-1">
              {t.requests.map((r) => (
                <div key={r.id} className="flex items-center justify-between bg-panel2 rounded-lg px-3 py-2 text-sm">
                  <span className="flex items-center gap-2">
                    <Icon.Hand size={15} className="text-warn" />@{r.byUsername} requested to jump to {fmtTime(r.positionMs)}
                  </span>
                  <div className="flex gap-2">
                    <button className="btn-good btn-sm" onClick={() => t.emit('playback.request.approve', { requestId: r.id })}>
                      <Icon.Check size={14} /> Approve
                    </button>
                    <button className="btn-subtle btn-sm" onClick={() => t.emit('playback.request.reject', { requestId: r.id })}>
                      <Icon.Close size={14} /> Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* participants */}
        <div className="card p-4">
          <SectionTitle icon="Eye">Watching now ({t.participants.length})</SectionTitle>
          <div className="flex flex-wrap gap-2 mt-3">
            {t.participants.map((p) => (
              <div key={p.userId} className="flex items-center gap-2 bg-panel2/60 border border-edge rounded-full pl-1 pr-3 py-1">
                <Avatar name={p.username} size={26} />
                <span className="text-sm">@{p.username}</span>
                {p.userId === t.hostId && (
                  <span className="text-brand2" title="Session host">
                    <Icon.Host size={14} />
                  </span>
                )}
                {isHost && p.userId !== user.id && (
                  <button
                    className="text-gray-500 hover:text-brand2 transition"
                    title={`Transfer host control to @${p.username}`}
                    onClick={() => t.emit('host.transfer.offer', { targetUserId: p.userId })}
                  >
                    <Icon.Transfer size={15} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <VoiceBar sessionId={sessionId} selfUsername={user.username} />
      </div>

      <ChatPanel roomId={t.detail.roomId} compact />

      {/* change-video vote modal */}
      {t.changeVote && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-30 p-4">
          <div className="card p-6 max-w-sm w-full space-y-4">
            <div className="flex items-center gap-2 font-medium">
              <span className="w-9 h-9 rounded-lg bg-brand/15 border border-brand/30 text-brand2 flex items-center justify-center">
                <Icon.Vote size={18} />
              </span>
              Change movie?
            </div>
            <div className="text-sm">
              Vote to switch to <b>“{t.changeVote.videoTitle}”</b>.
            </div>
            <Caption icon="Info">Changing the movie affects everyone, so it needs a group vote. A tie keeps the current video.</Caption>
            <div className="text-sm flex items-center gap-2">
              <Badge tone="good" icon="Check">
                {t.changeVote.approvals ?? 0} approve
              </Badge>
              <span className="text-gray-500">
                of {t.changeVote.participants ?? '—'}
                {t.changeVote.needed && t.changeVote.needed < 90 ? ` · needs ${t.changeVote.needed}` : ''}
              </span>
            </div>
            <div className="flex gap-2">
              <button className="btn-good flex-1" onClick={() => t.emit('playback.change.vote', { voteId: t.changeVote.voteId, value: 'approve' })}>
                <Icon.Check size={16} /> Approve
              </button>
              <button className="btn-subtle flex-1" onClick={() => t.emit('playback.change.vote', { voteId: t.changeVote.voteId, value: 'reject' })}>
                <Icon.Close size={16} /> Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {/* host transfer offer */}
      {t.hostOffer && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-30 p-4">
          <div className="card p-6 max-w-sm w-full space-y-4">
            <div className="flex items-center gap-2 font-medium">
              <span className="w-9 h-9 rounded-lg bg-brand/15 border border-brand/30 text-brand2 flex items-center justify-center">
                <Icon.Transfer size={18} />
              </span>
              Become the host?
            </div>
            <div className="text-sm text-gray-300">@{t.hostOffer.from} wants to transfer playback control to you.</div>
            <Caption icon="Host">As host you'll control resume and seeking. You can transfer it back anytime.</Caption>
            <div className="flex gap-2">
              <button
                className="btn-primary flex-1"
                onClick={() => {
                  t.emit('host.transfer.accept', {});
                  t.setHostOffer(null);
                }}
              >
                <Icon.Check size={16} /> Accept control
              </button>
              <button className="btn-subtle flex-1" onClick={() => t.setHostOffer(null)}>
                <Icon.Close size={16} /> Decline
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
