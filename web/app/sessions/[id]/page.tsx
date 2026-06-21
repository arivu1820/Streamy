'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { streamUrl } from '../../../lib/api';
import { useRequireAuth } from '../../../lib/auth';
import { useTheaterSession } from '../../../lib/useTheaterSession';
import { getSocket } from '../../../lib/socket';
import { Avatar, Spinner, fmtTime, SectionTitle, Caption, Badge } from '../../../components/ui';
import { Icon } from '../../../components/icons';
import { ChatPanel } from '../../../components/ChatPanel';
import { VoiceBar } from '../../../components/VoiceBar';

// ── Recent messages (fullscreen only) ────────────────────────────────────────
// Single shared timer — resets on every new message. All disappear together.
type ChatToast = { id: string; username: string; body: string };

function useToasts(roomId: string | undefined) {
  const [toasts, setToasts] = useState<ChatToast[]>([]);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const paused = useRef(false);

  const scheduleClearing = useCallback(() => {
    if (clearTimer.current) clearTimeout(clearTimer.current);
    clearTimer.current = setTimeout(() => {
      if (!paused.current) setToasts([]);
    }, 3000);
  }, []);

  const pauseRemove = useCallback(() => { paused.current = true; }, []);
  const resumeRemove = useCallback(() => {
    paused.current = false;
    setToasts([]);
    if (clearTimer.current) clearTimeout(clearTimer.current);
  }, []);

  useEffect(() => {
    if (!roomId) return;
    const s = getSocket();
    const handler = (m: any) => {
      if (m.roomId !== roomId) return;
      const id = Math.random().toString(36).slice(2);
      setToasts((prev) => [...prev.slice(-2), { id, username: m.authorUsername, body: m.body }]);
      scheduleClearing();
    };
    s.on('chat.message.created', handler);
    return () => { s.off('chat.message.created', handler); };
  }, [roomId, scheduleClearing]);

  useEffect(() => () => { if (clearTimer.current) clearTimeout(clearTimer.current); }, []);

  return { toasts, pauseRemove, resumeRemove };
}

// ── Fullscreen overlay ────────────────────────────────────────────────────────
function FullscreenOverlay({ toasts, pauseRemove, resumeRemove, roomId, chatEnabled }: {
  toasts: ChatToast[]; pauseRemove: () => void; resumeRemove: () => void;
  roomId: string; chatEnabled: boolean;
}) {
  const [text, setText] = useState('');
  const [hovered, setHovered] = useState(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function onEnter() {
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
    setHovered(true);
    pauseRemove();
  }

  function onLeave() {
    if (text) return;
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
    leaveTimer.current = setTimeout(() => {
      setHovered(false);
      resumeRemove();
    }, 3000);
  }

  function send() {
    const b = text.trim();
    if (!b || !chatEnabled) return;
    getSocket().emit('chat.message.send', { roomId, body: b, clientNonce: Math.random().toString(36).slice(2) });
    setText('');
    setTimeout(onLeave, 0);
  }

  useEffect(() => () => { if (leaveTimer.current) clearTimeout(leaveTimer.current); }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      className={`absolute right-8 top-1/2 -translate-y-1/2 flex flex-col gap-3 w-80 z-30 transition-opacity duration-300 ${hovered ? 'opacity-100' : 'opacity-60'}`}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <div className="flex flex-col gap-2">
        {toasts.map((toast, i) => {
          const t = toasts.length > 1 ? i / (toasts.length - 1) : 0.5;
          const offsetPx = Math.round(Math.sin(t * Math.PI) * 52);
          return (
            <div
              key={toast.id}
              className="flex items-center gap-2 justify-end cursor-default"
              style={{ marginRight: offsetPx }}
            >
              <Avatar name={toast.username} size={24} />
              <span className="text-white font-semibold text-sm drop-shadow-lg">@{toast.username}</span>
              <span className="text-white/60 text-sm drop-shadow-lg">·</span>
              <span className="text-white/90 text-sm break-words drop-shadow-lg">{toast.body}</span>
            </div>
          );
        })}
      </div>

      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={onEnter}
          onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
          placeholder={chatEnabled ? 'Reply…' : 'Chat disabled by host'}
          disabled={!chatEnabled}
          className="flex-1 bg-black/60 backdrop-blur-sm border border-white/25 text-white placeholder-white/40 rounded-xl px-3 py-2 text-sm outline-none focus:border-white/60 transition"
        />
        <button
          onClick={send}
          disabled={!text.trim() || !chatEnabled}
          className="bg-black/60 backdrop-blur-sm border border-white/25 text-white/70 hover:text-white disabled:opacity-40 rounded-xl px-3 transition"
        >
          <Icon.Send size={15} />
        </button>
      </div>
    </div>
  );
}

// ── Permission toggle ─────────────────────────────────────────────────────────
function PermToggle({ label, icon, enabled, onChange }: {
  label: string; icon: keyof typeof Icon; enabled: boolean; onChange: (v: boolean) => void;
}) {
  const Ic = Icon[icon] as any;
  return (
    <button
      onClick={() => onChange(!enabled)}
      className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg border transition ${enabled ? 'bg-good/10 border-good/30 text-good' : 'bg-bad/10 border-bad/30 text-bad line-through opacity-60'}`}
      title={enabled ? `Disable ${label}` : `Enable ${label}`}
    >
      {Ic && <Ic size={12} />}{label}
    </button>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function TheaterPage() {
  const user = useRequireAuth();
  const router = useRouter();
  const { id: sessionId } = useParams<{ id: string }>();
  const t = useTheaterSession(sessionId, user);
  const [sideTab, setSideTab] = useState<'chat' | 'members'>('chat');

  const playerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [chatOverlay, setChatOverlay] = useState(true);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  function toggleFullscreen() {
    if (!playerRef.current) return;
    if (!document.fullscreenElement) playerRef.current.requestFullscreen().catch(() => {});
    else document.exitFullscreen();
  }

  const roomId = t.detail?.roomId;
  const { toasts, pauseRemove, resumeRemove } = useToasts(roomId);

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
  if (!t.detail) return <Spinner label="Joining the session and syncing to the group..." />;

  const { nowPlaying, isHost, isPlaying, clock, duration, myPermissions } = t;
  const setPermission = (targetUserId: string, patch: Record<string, boolean>) =>
    t.emit('host.member.permissions.set', { targetUserId, permissions: patch });

  return (
    <div className="grid lg:grid-cols-[1fr_360px] gap-5">
      {/* LEFT */}
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

        {/* Video player */}
        <div
          ref={playerRef}
          className="bg-black rounded-2xl overflow-hidden relative border border-edge group/player"
          style={isFullscreen ? { borderRadius: 0 } : undefined}
        >
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

          {/* Controls — shown on hover */}
          <div className="absolute top-3 right-3 flex gap-2 opacity-0 group-hover/player:opacity-100 transition-opacity duration-200 z-20">
            {isFullscreen && (
              <button
                title={chatOverlay ? 'Disable chat overlay' : 'Enable chat overlay'}
                onClick={() => setChatOverlay((v) => !v)}
                className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border backdrop-blur-sm transition ${chatOverlay ? 'bg-black/50 border-white/20 text-white/80 hover:text-white' : 'bg-black/50 border-white/10 text-white/30 line-through'}`}
              >
                <Icon.Chat size={13} />
                Chat {chatOverlay ? 'On' : 'Off'}
              </button>
            )}
            <button
              title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              onClick={toggleFullscreen}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border backdrop-blur-sm bg-black/50 border-white/20 text-white/80 hover:text-white transition"
            >
              {isFullscreen ? <Icon.Minimize size={13} /> : <Icon.Maximize size={13} />}
              {isFullscreen ? 'Exit' : 'Fullscreen'}
            </button>
          </div>

          {/* Banner */}
          {t.banner && (
            <div role="status" aria-live="polite" className="absolute bottom-0 inset-x-0 bg-black/75 backdrop-blur-sm text-sm py-2 px-3 flex items-center justify-center gap-2 z-10">
              <Icon.Info size={14} className="text-brand2 shrink-0" />{t.banner}
            </div>
          )}

          {/* Fullscreen overlay */}
          {isFullscreen && roomId && chatOverlay && (
            <FullscreenOverlay
              toasts={toasts}
              pauseRemove={pauseRemove}
              resumeRemove={resumeRemove}
              roomId={roomId}
              chatEnabled={isHost || myPermissions.chat}
            />
          )}
        </div>

        {/* Scrubber */}
        <div className="flex items-center gap-3 text-xs text-gray-400">
          <span className={isPlaying ? 'text-good' : 'text-gray-400'}>
            {isPlaying ? <Icon.Play size={14} /> : <Icon.Pause size={14} />}
          </span>
          <span className="tabular-nums">{fmtTime(clock * 1000)}</span>
          <input
            type="range" min={0} max={duration || 0} value={clock} disabled={!isHost}
            onChange={(e) => t.emit('playback.seek', { positionMs: Number(e.target.value) * 1000 })}
            className="flex-1 accent-brand disabled:opacity-50"
            title={isHost ? 'Drag to seek for everyone' : 'Only the host can seek'}
          />
          <span className="tabular-nums">{fmtTime((duration || 0) * 1000)}</span>
        </div>

        {/* Playback controls */}
        <div className="card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <SectionTitle icon="Vote">Playback controls</SectionTitle>
            {isHost ? <Badge tone="brand" icon="Host">You&apos;re the host</Badge> : <Badge tone="neutral" icon="Eye">Watching</Badge>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(isHost || myPermissions.playback) && (
              <button className="btn-ghost" onClick={() => t.emit('playback.pause', {})}><Icon.Pause size={16} /> Pause</button>
            )}
            {(isHost || myPermissions.playback) && (
              <button className="btn-primary" onClick={() => t.emit('playback.play', {})}><Icon.Play size={16} /> Play / Resume</button>
            )}
            {isHost && (
              <>
                <button className="btn-ghost" onClick={() => t.emit('playback.seek', { positionMs: Math.max(0, (clock - 10) * 1000) })}><Icon.Rewind size={16} /> 10s</button>
                <button className="btn-ghost" onClick={() => t.emit('playback.seek', { positionMs: (clock + 10) * 1000 })}><Icon.Forward size={16} /> 10s</button>
              </>
            )}
            {!isHost && myPermissions.request && (
              <>
                <button className="btn-ghost" onClick={() => t.emit('playback.request', { type: 'rewind', positionMs: Math.max(0, (clock - 30) * 1000) })}>
                  <Icon.Hand size={16} /> Request <Icon.Rewind size={14} /> 30s
                </button>
                <button className="btn-ghost" onClick={() => t.emit('playback.request', { type: 'forward', positionMs: (clock + 30) * 1000 })}>
                  <Icon.Hand size={16} /> Request <Icon.Forward size={14} /> 30s
                </button>
              </>
            )}
            {!isHost && !myPermissions.playback && (
              <span className="text-xs text-gray-500 flex items-center gap-1"><Icon.Info size={13} /> Playback controls disabled by host</span>
            )}
          </div>
          <Caption icon="Info">
            {isHost
              ? 'Anyone can pause and play. As host, you control seeking — others send requests you approve.'
              : myPermissions.playback
              ? 'You can pause and play for the group. Only the host can seek — use Request and the host approves.'
              : 'The host has disabled playback controls for you.'}
          </Caption>
          <div className="flex items-center gap-2 text-sm pt-3 border-t border-edge">
            <span className="text-gray-500 flex items-center gap-1.5 shrink-0"><Icon.Vote size={15} /> Change movie:</span>
            <select className="input w-auto py-1.5" defaultValue="" onChange={(e) => { if (e.target.value) t.emit('playback.change.request', { videoId: e.target.value }); e.target.value = ''; }}>
              <option value="">Propose a different video...</option>
              {t.roomVideos.filter((v) => v.id !== nowPlaying?.id && v.status === 'ready').map((v) => (
                <option key={v.id} value={v.id}>{v.title}</option>
              ))}
            </select>
          </div>
          <Caption icon="Vote">Changing the movie affects everyone, so it opens a group vote. A tie keeps the current video.</Caption>
          {isHost && t.requests.length > 0 && (
            <div className="space-y-2 pt-1">
              {t.requests.map((r) => (
                <div key={r.id} className="flex items-center justify-between bg-panel2 rounded-lg px-3 py-2 text-sm">
                  <span className="flex items-center gap-2"><Icon.Hand size={15} className="text-warn" />@{r.byUsername} requested to jump to {fmtTime(r.positionMs)}</span>
                  <div className="flex gap-2">
                    <button className="btn-good btn-sm" onClick={() => t.emit('playback.request.approve', { requestId: r.id })}><Icon.Check size={14} /> Approve</button>
                    <button className="btn-subtle btn-sm" onClick={() => t.emit('playback.request.reject', { requestId: r.id })}><Icon.Close size={14} /> Reject</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Participants */}
        <div className="card p-4">
          <SectionTitle icon="Eye">Watching now ({t.participants.length})</SectionTitle>
          <div className="flex flex-wrap gap-2 mt-3">
            {t.participants.map((p) => (
              <div key={p.userId} className="flex items-center gap-2 bg-panel2/60 border border-edge rounded-full pl-1 pr-3 py-1">
                <Avatar name={p.username} size={26} />
                <span className="text-sm">@{p.username}</span>
                {p.userId === t.hostId && <span className="text-brand2" title="Session host"><Icon.Host size={14} /></span>}
                {isHost && p.userId !== user.id && (
                  <button className="text-gray-500 hover:text-brand2 transition" title={`Transfer host to @${p.username}`} onClick={() => t.emit('host.transfer.offer', { targetUserId: p.userId })}>
                    <Icon.Transfer size={15} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <VoiceBar sessionId={sessionId} selfUserId={user.id} selfUsername={user.username} voiceEnabled={isHost || myPermissions.voice} />
      </div>

      {/* RIGHT — hidden when fullscreen */}
      {!isFullscreen && (
        <div className="flex flex-col">
          <div className="flex border-b border-edge">
            <button className={`flex-1 py-2.5 text-sm font-medium flex items-center justify-center gap-1.5 transition border-b-2 ${sideTab === 'chat' ? 'border-brand2 text-brand2' : 'border-transparent text-gray-500 hover:text-gray-300'}`} onClick={() => setSideTab('chat')}>
              <Icon.Chat size={14} /> Chat
            </button>
            {isHost && (
              <button className={`flex-1 py-2.5 text-sm font-medium flex items-center justify-center gap-1.5 transition border-b-2 ${sideTab === 'members' ? 'border-brand2 text-brand2' : 'border-transparent text-gray-500 hover:text-gray-300'}`} onClick={() => setSideTab('members')}>
                <Icon.Eye size={14} /> Members
                {t.participants.length > 0 && <span className="ml-1 bg-panel2 border border-edge text-[10px] px-1.5 py-0.5 rounded-full">{t.participants.length}</span>}
              </button>
            )}
          </div>

          {sideTab === 'chat' && <ChatPanel roomId={t.detail.roomId} compact chatEnabled={isHost || myPermissions.chat} />}

          {sideTab === 'members' && isHost && (
            <div className="card flex flex-col" style={{ minHeight: '60vh' }}>
              <div className="px-4 py-3 border-b border-edge">
                <span className="section-title"><span className="text-brand2"><Icon.Eye size={16} /></span> Manage members</span>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {t.participants.length === 0 && <div className="text-gray-500 text-sm text-center py-8">No participants yet.</div>}
                {t.participants.map((p) => {
                  const isMe = p.userId === user.id;
                  const isParticipantHost = p.userId === t.hostId;
                  const perms = t.memberPermissions[p.userId] ?? { chat: true, voice: true, playback: true, request: true };
                  return (
                    <div key={p.userId} className="bg-panel2/60 border border-edge rounded-xl p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <Avatar name={p.username} size={28} />
                        <span className="text-sm font-medium flex-1 truncate">@{p.username}</span>
                        {isParticipantHost && <span className="text-[10px] text-brand2 border border-brand/30 bg-brand/10 px-1.5 py-0.5 rounded">Host</span>}
                        {isMe && <span className="text-[10px] text-gray-500">(you)</span>}
                      </div>
                      {!isMe && !isParticipantHost ? (
                        <div className="flex flex-wrap gap-1.5">
                          <PermToggle label="Chat" icon="Chat" enabled={perms.chat} onChange={(v) => setPermission(p.userId, { chat: v })} />
                          <PermToggle label="Voice" icon="Mic" enabled={perms.voice} onChange={(v) => setPermission(p.userId, { voice: v })} />
                          <PermToggle label="Play/Pause" icon="Play" enabled={perms.playback} onChange={(v) => setPermission(p.userId, { playback: v })} />
                          <PermToggle label="Requests" icon="Hand" enabled={perms.request} onChange={(v) => setPermission(p.userId, { request: v })} />
                        </div>
                      ) : (
                        <div className="text-xs text-gray-600 italic">{isMe ? 'Cannot restrict yourself.' : 'Host always has full access.'}</div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="px-4 py-3 border-t border-edge">
                <Caption icon="Info">Click a badge to toggle that permission. Changes take effect immediately.</Caption>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Change-video vote modal */}
      {t.changeVote && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-30 p-4">
          <div className="card p-6 max-w-sm w-full space-y-4">
            <div className="flex items-center gap-2 font-medium">
              <span className="w-9 h-9 rounded-lg bg-brand/15 border border-brand/30 text-brand2 flex items-center justify-center"><Icon.Vote size={18} /></span>
              Change movie?
            </div>
            <div className="text-sm">Vote to switch to <b>&quot;{t.changeVote.videoTitle}&quot;</b>.</div>
            <Caption icon="Info">Changing the movie affects everyone, so it needs a group vote. A tie keeps the current video.</Caption>
            <div className="text-sm flex items-center gap-2">
              <Badge tone="good" icon="Check">{t.changeVote.approvals ?? 0} approve</Badge>
              <span className="text-gray-500">of {t.changeVote.participants ?? '---'}{t.changeVote.needed && t.changeVote.needed < 90 ? ` · needs ${t.changeVote.needed}` : ''}</span>
            </div>
            <div className="flex gap-2">
              <button className="btn-good flex-1" onClick={() => t.emit('playback.change.vote', { voteId: t.changeVote.voteId, value: 'approve' })}><Icon.Check size={16} /> Approve</button>
              <button className="btn-subtle flex-1" onClick={() => t.emit('playback.change.vote', { voteId: t.changeVote.voteId, value: 'reject' })}><Icon.Close size={16} /> Reject</button>
            </div>
          </div>
        </div>
      )}

      {/* Host transfer modal */}
      {t.hostOffer && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-30 p-4">
          <div className="card p-6 max-w-sm w-full space-y-4">
            <div className="flex items-center gap-2 font-medium">
              <span className="w-9 h-9 rounded-lg bg-brand/15 border border-brand/30 text-brand2 flex items-center justify-center"><Icon.Transfer size={18} /></span>
              Become the host?
            </div>
            <div className="text-sm text-gray-300">@{t.hostOffer.from} wants to transfer playback control to you.</div>
            <Caption icon="Host">As host you control seeking and member permissions. You can transfer it back anytime.</Caption>
            <div className="flex gap-2">
              <button className="btn-primary flex-1" onClick={() => { t.emit('host.transfer.accept', {}); }}><Icon.Check size={16} /> Accept</button>
              <button className="btn-subtle flex-1" onClick={() => { t.emit('host.transfer.decline', {}); }}><Icon.Close size={16} /> Decline</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
