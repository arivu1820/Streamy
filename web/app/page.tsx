'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../lib/auth';

export default function Home() {
  const { user, ready } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!ready) return;
    router.replace(user ? '/rooms' : '/login');
  }, [ready, user, router]);
  return <div className="text-gray-500 text-sm">Loading…</div>;
}
