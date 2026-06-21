'use client';
import Link from 'next/link';
import { useAuth } from '../lib/auth';
import { Avatar } from './ui';
import { Icon } from './icons';
import { useRouter } from 'next/navigation';

export function TopBar() {
  const { user, logout } = useAuth();
  const router = useRouter();
  return (
    <header className="border-b border-edge bg-ink/70 backdrop-blur-md sticky top-0 z-20">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/rooms" className="flex items-center gap-2 font-bold text-lg group">
          <span className="text-brand2 group-hover:text-brand transition">
            <Icon.Logo size={22} />
          </span>
          Streamy
        </Link>
        {user && (
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 text-sm text-gray-400">
              <Avatar name={user.username} url={user.avatarUrl} size={28} />
              <span>@{user.username}</span>
            </div>
            <button
              className="btn-subtle btn-sm"
              title="Sign out of Streamy"
              onClick={() => {
                logout();
                router.replace('/login');
              }}
            >
              <Icon.Logout size={15} />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
