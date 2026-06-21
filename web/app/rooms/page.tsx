'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api } from '../../lib/api';
import { useRequireAuth } from '../../lib/auth';
import { Empty, Spinner, PageHeader, Badge, Caption } from '../../components/ui';
import { Icon } from '../../components/icons';

export default function RoomsPage() {
  const user = useRequireAuth();
  const [rooms, setRooms] = useState<any[] | null>(null);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function load() {
    setRooms(await api.get('/rooms'));
  }
  useEffect(() => {
    if (user) load();
  }, [user]);

  function dismissHint() {
    if (hintTimer.current) clearTimeout(hintTimer.current);
    setShowHint(false);
  }

  async function create() {
    if (!name.trim()) {
      setShowHint(true);
      if (hintTimer.current) clearTimeout(hintTimer.current);
      hintTimer.current = setTimeout(() => setShowHint(false), 2000);
      return;
    }
    dismissHint();
    setCreating(true);
    try {
      await api.post('/rooms', { name: name.trim() });
      setName('');
      await load();
    } finally {
      setCreating(false);
    }
  }

  if (!user) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        icon="Film"
        title="Your rooms"
        subtitle="Private spaces for your friends — no owner or admin, everyone has equal rights."
        actions={
          <div className="flex gap-2">
            <input
              className="input w-56"
              placeholder="New room name"
              value={name}
              onChange={(e) => { setName(e.target.value); if (showHint) dismissHint(); }}
              onKeyDown={(e) => e.key === 'Enter' && create()}
            />
            <div className="relative">
              <button className="btn-primary" disabled={creating} onClick={create}>
                Create room
              </button>
              {showHint && (
                <div
                  onClick={dismissHint}
                  className="absolute right-0 top-full mt-2 z-50 cursor-pointer"
                  style={{ animation: 'fadeInUp 0.18s ease' }}
                >
                  <div
                    className="relative px-3.5 py-2 rounded-xl text-sm font-medium text-white select-none"
                    style={{
                      background: 'linear-gradient(135deg, #1d2230 0%, #242a3a 100%)',
                      border: '1px solid rgba(124,92,255,0.35)',
                      boxShadow: '0 8px 24px -4px rgba(0,0,0,0.5), 0 0 0 1px rgba(124,92,255,0.1)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <span className="text-brand2 mr-1.5">✦</span>
                    Enter a room name first
                    {/* tail */}
                    <span
                      className="absolute -top-[7px] right-5"
                      style={{
                        width: 0,
                        height: 0,
                        borderLeft: '7px solid transparent',
                        borderRight: '7px solid transparent',
                        borderBottom: '7px solid rgba(124,92,255,0.35)',
                      }}
                    />
                    <span
                      className="absolute -top-[5px] right-[21px]"
                      style={{
                        width: 0,
                        height: 0,
                        borderLeft: '6px solid transparent',
                        borderRight: '6px solid transparent',
                        borderBottom: '6px solid #1d2230',
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        }
      />

      {rooms === null ? (
        <Spinner label="Loading your rooms…" />
      ) : rooms.length === 0 ? (
        <Empty
          icon="Film"
          title="You're not in any rooms yet"
          hint="Create one above, then invite your friends by email to start watching together."
        />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {rooms.map((r) => (
            <Link key={r.id} href={`/rooms/${r.id}`} className="card card-hover p-5 block group">
              <div className="flex items-start justify-between">
                <div className="w-9 h-9 rounded-lg bg-panel2 border border-edge flex items-center justify-center text-brand2">
                  <Icon.Film size={18} />
                </div>
                <span className="text-gray-600 group-hover:text-brand2 transition">
                  <Icon.ChevronRight size={18} />
                </span>
              </div>
              <div className="font-semibold text-lg mt-3">{r.name}</div>
              {r.description && <div className="text-gray-500 text-sm mt-0.5 line-clamp-1">{r.description}</div>}
              <div className="flex flex-wrap gap-2 mt-4">
                <Badge tone="neutral" icon="Members">
                  {r.memberCount} members
                </Badge>
                <Badge tone="neutral" icon="Film">
                  {r.videoCount} videos
                </Badge>
                {r.activeSessions > 0 && (
                  <Badge tone="good" icon="Live">
                    {r.activeSessions} live
                  </Badge>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      <Caption icon="Shield">
        Streamy is invitation-only. There&apos;s no public discovery — the only way into a room is an email invite
        that the person accepts.
      </Caption>
    </div>
  );
}
