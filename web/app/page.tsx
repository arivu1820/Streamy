'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../lib/auth';
import { Spinner } from '../components/ui';

export default function Home() {
  const { user, ready } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!ready) return;
    router.replace(user ? '/rooms' : '/login');
  }, [ready, user, router]);
  return (
    <div className="mt-10 flex justify-center">
      <Spinner label="Loading Streamy…" />
    </div>
  );
}
