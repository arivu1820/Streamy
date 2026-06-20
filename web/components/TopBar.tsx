'use client';
import Link from 'next/link';
import { useAuth } from '../lib/auth';
import { Avatar } from './ui';
import { useRouter } from 'next/navigation';

export function TopBar() {
  const { user, logout } = useAuth();
  const router = useRouter();
  return (
    <header className="border-b border-edge bg-panel/60 backdrop-blur sticky top-0 z-20">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/rooms" className="flex items-center gap-2 font-bold text-lg">
          <span className="text-brand">●</span> Streamy
        </Link>
        {user && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-400 hidden sm:block">@{user.username}</span>
            <Avatar name={user.username} url={user.avatarUrl} />
            <button
              className="btn-ghost text-xs"
              onClick={() => {
                logout();
                router.replace('/login');
              }}
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
