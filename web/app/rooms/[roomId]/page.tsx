'use client';
import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '../../../lib/api';
import { useRequireAuth } from '../../../lib/auth';
import { getSocket } from '../../../lib/socket';
import { Avatar, Presence, Empty, Spinner, PageHeader, SectionTitle, Caption, Badge, relTime } from '../../../components/ui';
import { Icon, IconName } from '../../../components/icons';
import { ChatPanel } from '../../../components/ChatPanel';

type Tab = 'library' | 'sessions' | 'members' | 'chat';

export default function RoomPage() {
  const user = useRequireAuth();
  const router = useRouter();
  const { roomId } = useParams<{ roomId: string }>();
  const [room, setRoom] = useState<any>(null);
  const [tab, setTab] = useState<Tab>('library');
  const [err, setErr] = useState('');

  async function loadRoom() {
    try {
      setRoom(await api.get(`/rooms/${roomId}`));
    } catch (e: any) {
      setErr(e.code === 'NOT_MEMBER' ? 'You are not a member of this room.' : e.message);
    }
  }
  useEffect(() => {
    if (user) loadRoom();
  }, [user, roomId]);

  useEffect(() => {
    if (!user) return;
    getSocket().emit('room.subscribe', { roomId });
  }, [user, roomId]);

  if (!user) return null;
  if (err)
    return (
      <Empty
        icon="Shield"
        title={err}
        action={
          <button className="btn-ghost" onClick={() => router.replace('/rooms')}>
            <Icon.ArrowLeft size={16} /> Back to rooms
          </button>
        }
      />
    );
  if (!room) return <Spinner label="Loading room…" />;

  const tabs: { id: Tab; label: string; icon: IconName }[] = [
    { id: 'library', label: 'Library', icon: 'Film' },
    { id: 'sessions', label: 'Sessions', icon: 'Live' },
    { id: 'members', label: 'Members', icon: 'Members' },
    { id: 'chat', label: 'Chat', icon: 'Chat' },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        icon="Film"
        title={room.name}
        subtitle={`${room.memberCount} members · ${room.videoCount} videos${
          room.activeSessions > 0 ? ` · ${room.activeSessions} live now` : ''
        }`}
        actions={<LeaveButton roomId={roomId} memberCount={room.memberCount} onLeft={() => router.replace('/rooms')} />}
      />

      <div className="flex gap-1 border-b border-edge overflow-x-auto">
        {tabs.map((t) => {
          const I = Icon[t.icon];
          return (
            <button key={t.id} onClick={() => setTab(t.id)} className={tab === t.id ? 'tab-active' : 'tab-idle'}>
              <I size={16} />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'library' && <Library roomId={roomId} onChange={loadRoom} />}
      {tab === 'sessions' && <Sessions roomId={roomId} />}
      {tab === 'members' && <Members roomId={roomId} meId={user.id} />}
      {tab === 'chat' && <ChatPanel roomId={roomId} />}
    </div>
  );
}

function LeaveButton({ roomId, memberCount, onLeft }: { roomId: string; memberCount: number; onLeft: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const last = memberCount <= 1;
  return confirm ? (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-gray-400 hidden sm:block">
        {last ? "You're the last member — leaving archives this room." : 'Leave this room?'}
      </span>
      <button
        className="btn-danger btn-sm"
        onClick={async () => {
          await api.post(`/rooms/${roomId}/leave`);
          onLeft();
        }}
      >
        <Icon.Check size={15} /> Confirm
      </button>
      <button className="btn-subtle btn-sm" onClick={() => setConfirm(false)}>
        Cancel
      </button>
    </div>
  ) : (
    <button className="btn-ghost btn-sm" title="Leave this room (you can't remove anyone else)" onClick={() => setConfirm(true)}>
      <Icon.Leave size={15} /> Leave room
    </button>
  );
}

// ---------------- Library ----------------
function Library({ roomId, onChange }: { roomId: string; onChange: () => void }) {
  const router = useRouter();
  const [videos, setVideos] = useState<any[] | null>(null);
  const [uploading, setUploading] = useState(0);
  const [msg, setMsg] = useState('');
  const [msgTone, setMsgTone] = useState<'good' | 'bad'>('good');
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    setVideos(await api.get(`/rooms/${roomId}/videos`));
  }
  useEffect(() => {
    load();
    const s = getSocket();
    const reload = () => load();
    s.on('video.votes.updated', reload);
    s.on('video.deleted', reload);
    s.on('video.status.changed', reload);
    return () => {
      s.off('video.votes.updated', reload);
      s.off('video.deleted', reload);
      s.off('video.status.changed', reload);
    };
  }, [roomId]);

  async function upload(file: File) {
    setMsg('');
    const fd = new FormData();
    fd.append('file', file);
    fd.append('title', file.name);
    setUploading((n) => n + 1);
    try {
      await api.post(`/rooms/${roomId}/videos`, fd);
      await load();
      onChange();
      setMsgTone('good');
      setMsg(`"${file.name}" is ready to watch.`);
    } catch (e: any) {
      const m: Record<string, string> = {
        FILE_TOO_LARGE: 'That file is over the 10 GB limit. Try a smaller file.',
        UNSUPPORTED_FORMAT: "We can't play that format. Try MP4, MKV, AVI, MOV, or WebM.",
      };
      setMsgTone('bad');
      setMsg(m[e.code] || e.message);
    } finally {
      setUploading((n) => n - 1);
    }
  }

  async function vote(video: any, value: 'delete' | 'keep') {
    if (video.myVote === value) await api.del(`/videos/${video.id}/delete-vote`);
    else await api.put(`/videos/${video.id}/delete-vote`, { value });
    await load();
  }

  async function startSession(video: any) {
    const s = await api.post(`/rooms/${roomId}/sessions`, { videoId: video.id });
    router.push(`/sessions/${s.id}`);
  }

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <SectionTitle icon="Upload">Shared video library</SectionTitle>
          <div className="flex items-center gap-3">
            {uploading > 0 && <Spinner label={`Uploading & processing ${uploading}…`} />}
            <input
              ref={fileRef}
              type="file"
              accept="video/*,.mkv,.avi,.mov,.webm,.mp4"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload(f);
                e.target.value = '';
              }}
            />
            <button className="btn-primary" onClick={() => fileRef.current?.click()}>
              <Icon.Upload size={16} /> Upload video
            </button>
          </div>
        </div>
        <div className="mt-2">
          <Caption icon="Shield">
            Any member can upload (up to 10 GB). Only upload videos you have the right to share — Streamy
            doesn&apos;t monitor uploads; your group is responsible for what it shares.
          </Caption>
        </div>
        {msg && (
          <div className={`mt-2 ${msgTone === 'good' ? 'badge-good' : 'badge-bad'}`}>
            {msgTone === 'good' ? <Icon.Check size={13} /> : <Icon.Close size={13} />}
            {msg}
          </div>
        )}
      </div>

      {videos === null ? (
        <Spinner label="Loading library…" />
      ) : videos.length === 0 ? (
        <Empty icon="Film" title="This room has no videos yet" hint="Upload one so the group can watch together." />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {videos.map((v) => (
            <div key={v.id} className="card overflow-hidden">
              <div className="aspect-video bg-ink flex items-center justify-center text-gray-700 relative">
                <Icon.Play size={40} />
                <span className="absolute top-2 right-2">
                  {v.status === 'ready' ? (
                    <Badge tone="good" icon="Check">
                      Ready
                    </Badge>
                  ) : (
                    <Badge tone="warn" icon="Clock">
                      {v.status}
                    </Badge>
                  )}
                </span>
              </div>
              <div className="p-4 space-y-3">
                <div>
                  <div className="font-medium truncate">{v.title}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {v.container.toUpperCase()} · {(v.sizeBytes / 1e6).toFixed(0)} MB · by @{v.uploadedBy.username}
                  </div>
                </div>

                <div className="text-xs">
                  <div className="flex items-center justify-between text-gray-400">
                    <span className="flex items-center gap-1.5">
                      <Icon.Vote size={13} className="text-gray-500" />
                      Delete votes
                    </span>
                    <span>
                      <b className="text-gray-200">{v.tally.deleteVotes}</b> / needs {v.tally.needed} of{' '}
                      {v.tally.activeMembers}
                    </span>
                  </div>
                  <div className="h-1.5 bg-ink rounded mt-1.5 overflow-hidden">
                    <div
                      className="h-full bg-bad transition-all"
                      style={{ width: `${Math.min(100, (v.tally.deleteVotes / Math.max(1, v.tally.needed)) * 100)}%` }}
                    />
                  </div>
                  <Caption icon="Info">No one owns videos — removal needs more than half the members. A tie keeps it.</Caption>
                </div>

                <div className="flex gap-2">
                  <button className="btn-primary flex-1" onClick={() => startSession(v)} disabled={v.status !== 'ready'}>
                    <Icon.Play size={16} /> Watch
                  </button>
                  <button
                    className={v.myVote === 'delete' ? 'btn-danger' : 'btn-subtle'}
                    title={v.myVote === 'delete' ? 'You voted to delete — click to withdraw' : 'Vote to delete this video'}
                    onClick={() => vote(v, 'delete')}
                  >
                    <Icon.Trash size={16} />
                    {v.myVote === 'delete' ? 'Voted' : 'Delete'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------- Sessions ----------------
function Sessions({ roomId }: { roomId: string }) {
  const router = useRouter();
  const [sessions, setSessions] = useState<any[] | null>(null);
  async function load() {
    setSessions(await api.get(`/rooms/${roomId}/sessions`));
  }
  useEffect(() => {
    load();
    const id = setInterval(load, 4000);
    return () => clearInterval(id);
  }, [roomId]);

  if (sessions === null) return <Spinner label="Loading sessions…" />;
  if (sessions.length === 0)
    return (
      <Empty
        icon="Live"
        title="No one's watching right now"
        hint="Open the Library and hit Watch on any video to start a session, then invite the room."
      />
    );
  return (
    <div className="space-y-3">
      <Caption icon="Live">Live watch sessions in this room. Join any of them to be synced to the current moment.</Caption>
      <div className="grid sm:grid-cols-2 gap-4">
        {sessions.map((s) => (
          <div key={s.id} className="card p-4 flex items-center justify-between">
            <div className="min-w-0">
              <div className="font-medium truncate flex items-center gap-2">
                <Icon.Film size={16} className="text-brand2 shrink-0" />
                {s.nowPlaying?.title || 'Untitled'}
              </div>
              <div className="text-xs text-gray-500 mt-1 flex items-center gap-2">
                <Badge tone="brand" icon="Host">
                  @{s.hostUsername}
                </Badge>
                <span className="flex items-center gap-1">
                  <Icon.Eye size={13} /> {s.participantCount} watching
                </span>
              </div>
            </div>
            <button className="btn-primary" onClick={() => router.push(`/sessions/${s.id}`)}>
              <Icon.Play size={16} /> Join
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------- Members ----------------
function Members({ roomId, meId }: { roomId: string; meId: string }) {
  const [members, setMembers] = useState<any[] | null>(null);
  const [presence, setPresence] = useState<Record<string, any>>({});
  const [email, setEmail] = useState('');
  const [invite, setInvite] = useState<any>(null);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);

  async function load() {
    const [m, p] = await Promise.all([api.get(`/rooms/${roomId}/members`), api.get(`/rooms/${roomId}/presence`)]);
    setMembers(m);
    const map: Record<string, any> = {};
    p.forEach((x: any) => (map[x.userId] = x));
    setPresence(map);
  }
  useEffect(() => {
    load();
    const s = getSocket();
    const onP = (p: any) => setPresence((prev) => ({ ...prev, [p.userId]: p }));
    s.on('presence.updated', onP);
    return () => {
      s.off('presence.updated', onP);
    };
  }, [roomId]);

  async function sendInvite() {
    setErr('');
    setInvite(null);
    setCopied(false);
    try {
      const res = await api.post(`/rooms/${roomId}/invitations`, { email: email.trim() });
      setInvite(res);
      setEmail('');
    } catch (e: any) {
      const m: Record<string, string> = {
        ALREADY_MEMBER: "They're already in this room.",
        INVITE_ALREADY_PENDING: 'There is already a pending invite for that email.',
      };
      setErr(m[e.code] || e.message);
    }
  }

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <div className="card p-4">
        <SectionTitle icon="Members">Members</SectionTitle>
        <Caption icon="Info">Everyone here has equal rights. You can leave anytime, but no one can remove anyone else.</Caption>
        {members === null ? (
          <div className="mt-3">
            <Spinner />
          </div>
        ) : (
          <div className="space-y-2 mt-3">
            {members.map((m) => {
              const p = presence[m.userId] || {};
              const online = p.status === 'online';
              return (
                <div key={m.userId} className="flex items-center gap-3 p-2 rounded-lg hover:bg-panel2/60">
                  <Avatar name={m.username} url={m.avatarUrl} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm flex items-center gap-2">
                      @{m.username}
                      {m.userId === meId && (
                        <Badge tone="neutral">you</Badge>
                      )}
                    </div>
                    <div className="text-[11px] text-gray-500 flex items-center gap-1.5">
                      <Presence online={online} />
                      {online ? (
                        p.activity || 'online'
                      ) : (
                        <span className="flex items-center gap-1">
                          <Icon.Clock size={11} /> last active {relTime(p.lastActive) || 'a while ago'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="card p-4 h-fit">
        <SectionTitle icon="Invite">Invite by email</SectionTitle>
        <Caption icon="Mail">Any member can invite. The person must accept the invitation before joining.</Caption>
        <div className="flex gap-2 mt-3">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
              <Icon.Mail size={16} />
            </span>
            <input
              className="input pl-9"
              placeholder="friend@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && email.trim() && sendInvite()}
            />
          </div>
          <button className="btn-primary" disabled={!email.trim()} onClick={sendInvite}>
            <Icon.Send size={15} /> Invite
          </button>
        </div>
        {err && (
          <div className="badge-bad mt-2">
            <Icon.Close size={13} /> {err}
          </div>
        )}
        {invite && (
          <div className="mt-3 bg-panel2 border border-edge rounded-xl p-3">
            <div className="badge-good">
              <Icon.Check size={13} /> Invitation created for {invite.invitedEmail}
            </div>
            <Caption icon="Link">
              No email service in this demo — share this accept link (the invitee signs in with that email):
            </Caption>
            <div className="flex items-center gap-2 mt-1.5">
              <code className="text-[11px] text-brand2 break-all bg-ink rounded-md px-2 py-1.5 flex-1">
                {invite.acceptUrl}
              </code>
              <button
                className="icon-btn shrink-0"
                title="Copy link"
                onClick={() => {
                  navigator.clipboard?.writeText(invite.acceptUrl);
                  setCopied(true);
                }}
              >
                {copied ? <Icon.Check size={16} /> : <Icon.Link size={16} />}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
