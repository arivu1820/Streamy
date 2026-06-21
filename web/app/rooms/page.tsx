'use client';
import { useEffect, useState } from 'react';
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

  async function load() {
    setRooms(await api.get('/rooms'));
  }
  useEffect(() => {
    if (user) load();
  }, [user]);

  async function create() {
    if (!name.trim()) return;
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
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                <Icon.Plus size={16} />
              </span>
              <input
                className="input pl-9 w-56"
                placeholder="New room name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && create()}
              />
            </div>
            <button className="btn-primary" disabled={creating || !name.trim()} onClick={create}>
              <Icon.Plus size={16} />
              Create room
            </button>
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
