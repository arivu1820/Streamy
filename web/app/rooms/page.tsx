'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '../../lib/api';
import { useRequireAuth } from '../../lib/auth';
import { Empty, Spinner } from '../../components/ui';

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
      const room = await api.post('/rooms', { name: name.trim() });
      setName('');
      await load();
    } finally {
      setCreating(false);
    }
  }

  if (!user) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Your rooms</h1>
          <p className="text-gray-400 text-sm">Rooms have no owner or admin — everyone here has equal rights.</p>
        </div>
        <div className="flex gap-2">
          <input
            className="input w-56"
            placeholder="New room name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && create()}
          />
          <button className="btn-primary" disabled={creating || !name.trim()} onClick={create}>
            Create room
          </button>
        </div>
      </div>

      {rooms === null ? (
        <Spinner label="Loading rooms…" />
      ) : rooms.length === 0 ? (
        <Empty
          title="You're not in any rooms yet"
          hint="Create one and invite your friends by email to start watching together."
        />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {rooms.map((r) => (
            <Link key={r.id} href={`/rooms/${r.id}`} className="card p-5 hover:border-brand transition block">
              <div className="font-semibold text-lg">{r.name}</div>
              {r.description && <div className="text-gray-500 text-sm mt-0.5">{r.description}</div>}
              <div className="flex gap-3 text-xs text-gray-400 mt-4">
                <span>{r.memberCount} members</span>
                <span>·</span>
                <span>{r.videoCount} videos</span>
                {r.activeSessions > 0 && (
                  <>
                    <span>·</span>
                    <span className="text-good">{r.activeSessions} live now</span>
                  </>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
