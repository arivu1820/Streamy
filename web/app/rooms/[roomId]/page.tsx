'use client';
import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, ApiError } from '../../../lib/api';
import { useRequireAuth } from '../../../lib/auth';
import { getSocket } from '../../../lib/socket';
import { Avatar, Dot, Empty, Spinner, relTime } from '../../../components/ui';
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
    const s = getSocket();
    s.emit('room.subscribe', { roomId });
  }, [user, roomId]);

  if (!user) return null;
  if (err) return <Empty title={err} action={<button className="btn-ghost" onClick={() => router.replace('/rooms')}>Back to rooms</button>} />;
  if (!room) return <Spinner label="Loading room…" />;

  const tabs: { id: Tab; label: string }[] = [
    { id: 'library', label: 'Library' },
    { id: 'sessions', label: 'Sessions' },
    { id: 'members', label: 'Members' },
    { id: 'chat', label: 'Chat' },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">{room.name}</h1>
          <p className="text-gray-500 text-sm">
            {room.memberCount} members · {room.videoCount} videos
            {room.activeSessions > 0 && <span className="text-good"> · {room.activeSessions} live now</span>}
          </p>
        </div>
        <LeaveButton roomId={roomId} memberCount={room.memberCount} onLeft={() => router.replace('/rooms')} />
      </div>

      <div className="flex gap-1 border-b border-edge">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm border-b-2 -mb-px ${
              tab === t.id ? 'border-brand text-white' : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
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
      <span className="text-gray-400">{last ? "You're the last member — leaving archives this room." : 'Leave this room?'}</span>
      <button
        className="btn-danger"
        onClick={async () => {
          await api.post(`/rooms/${roomId}/leave`);
          onLeft();
        }}
      >
        Confirm leave
      </button>
      <button className="btn-ghost" onClick={() => setConfirm(false)}>Cancel</button>
    </div>
  ) : (
    <button className="btn-ghost" onClick={() => setConfirm(true)}>Leave room</button>
  );
}

// ---------------- Library ----------------
function Library({ roomId, onChange }: { roomId: string; onChange: () => void }) {
  const router = useRouter();
  const [videos, setVideos] = useState<any[] | null>(null);
  const [uploading, setUploading] = useState(0);
  const [msg, setMsg] = useState('');
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
      setMsg(`"${file.name}" is ready to watch.`);
    } catch (e: any) {
      const m: Record<string, string> = {
        FILE_TOO_LARGE: 'That file is over the 10 GB limit.',
        UNSUPPORTED_FORMAT: "We can't play that format. Try MP4, MKV, AVI, MOV, or WebM.",
      };
      setMsg(m[e.code] || e.message);
    } finally {
      setUploading((n) => n - 1);
    }
  }

  async function vote(video: any, value: 'delete' | 'keep') {
    if (video.myVote === value) {
      await api.del(`/videos/${video.id}/delete-vote`);
    } else {
      await api.put(`/videos/${video.id}/delete-vote`, { value });
    }
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
          <div className="text-sm text-gray-400">
            Any member can upload (up to 10 GB). Only you can share content you have the right to share.
          </div>
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
            <button className="btn-primary" onClick={() => fileRef.current?.click()}>Upload video</button>
          </div>
        </div>
        {msg && <div className="text-sm text-gray-300 mt-2">{msg}</div>}
      </div>

      {videos === null ? (
        <Spinner label="Loading library…" />
      ) : videos.length === 0 ? (
        <Empty title="This room has no videos yet" hint="Upload one so the group can watch together." />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {videos.map((v) => (
            <div key={v.id} className="card p-4 space-y-3">
              <div className="aspect-video bg-ink rounded-lg flex items-center justify-center text-gray-700 text-4xl">▶</div>
              <div>
                <div className="font-medium truncate">{v.title}</div>
                <div className="text-xs text-gray-500">
                  {v.container.toUpperCase()} · {(v.sizeBytes / 1e6).toFixed(0)} MB · by @{v.uploadedBy.username}
                </div>
              </div>

              <div className="text-xs">
                <div className="flex items-center justify-between text-gray-400">
                  <span>
                    Delete votes: <b className="text-gray-200">{v.tally.deleteVotes}</b> / needs {v.tally.needed} of {v.tally.activeMembers}
                  </span>
                </div>
                <div className="h-1.5 bg-ink rounded mt-1 overflow-hidden">
                  <div className="h-full bg-bad" style={{ width: `${Math.min(100, (v.tally.deleteVotes / Math.max(1, v.tally.needed)) * 100)}%` }} />
                </div>
                <div className="text-[11px] text-gray-600 mt-1">A tie keeps the video. You can change or withdraw your vote anytime.</div>
              </div>

              <div className="flex gap-2">
                <button className="btn-primary flex-1" onClick={() => startSession(v)} disabled={v.status !== 'ready'}>
                  Watch
                </button>
                <button
                  className={`btn ${v.myVote === 'delete' ? 'bg-bad text-white' : 'btn-ghost'}`}
                  title="Vote to delete"
                  onClick={() => vote(v, 'delete')}
                >
                  Delete · {v.myVote === 'delete' ? 'voted' : 'vote'}
                </button>
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
    return <Empty title="No one's watching right now" hint="Open the Library and hit Watch on any video to start a session." />;
  return (
    <div className="grid sm:grid-cols-2 gap-4">
      {sessions.map((s) => (
        <div key={s.id} className="card p-4 flex items-center justify-between">
          <div>
            <div className="font-medium">{s.nowPlaying?.title || 'Untitled'}</div>
            <div className="text-xs text-gray-500">
              host @{s.hostUsername} · {s.participantCount} watching
            </div>
          </div>
          <button className="btn-primary" onClick={() => router.push(`/sessions/${s.id}`)}>Join</button>
        </div>
      ))}
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
        <div className="text-sm font-medium mb-3">Members</div>
        {members === null ? (
          <Spinner />
        ) : (
          <div className="space-y-2">
            {members.map((m) => {
              const p = presence[m.userId] || {};
              return (
                <div key={m.userId} className="flex items-center gap-3">
                  <Avatar name={m.username} url={m.avatarUrl} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm flex items-center gap-2">
                      @{m.username} {m.userId === meId && <span className="text-[10px] text-gray-500">(you)</span>}
                    </div>
                    <div className="text-[11px] text-gray-500 flex items-center gap-1">
                      <Dot online={p.status === 'online'} />
                      {p.status === 'online' ? p.activity || 'online' : `last active ${relTime(p.lastActive)}`}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="card p-4 h-fit">
        <div className="text-sm font-medium mb-1">Invite by email</div>
        <div className="text-xs text-gray-500 mb-3">Any member can invite. The person must accept before joining.</div>
        <div className="flex gap-2">
          <input className="input" placeholder="friend@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button className="btn-primary" disabled={!email.trim()} onClick={sendInvite}>Invite</button>
        </div>
        {err && <div className="text-bad text-sm mt-2">{err}</div>}
        {invite && (
          <div className="mt-3 text-sm bg-panel2 border border-edge rounded-lg p-3">
            <div className="text-good">Invitation created for {invite.invitedEmail}.</div>
            <div className="text-xs text-gray-400 mt-1">
              No email service in this demo — share this accept link (the invitee must sign in with that email):
            </div>
            <code className="text-[11px] text-brand2 break-all block mt-1">{invite.acceptUrl}</code>
          </div>
        )}
      </div>
    </div>
  );
}
