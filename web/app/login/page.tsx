'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../lib/auth';

export default function LoginPage() {
  const { devLogin } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function go(e: string) {
    setBusy(true);
    setErr('');
    try {
      await devLogin(e);
      router.replace('/rooms');
    } catch (x: any) {
      setErr(x.message || 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-md mx-auto mt-10">
      <div className="card p-8">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <span className="text-brand">●</span> Streamy
        </h1>
        <p className="text-gray-400 text-sm mt-1">A private shared video platform for friend groups.</p>

        <div className="mt-6 space-y-3">
          <button className="btn-ghost w-full justify-center opacity-60" disabled title="Set GOOGLE_CLIENT_ID to enable">
            Continue with Google (configure to enable)
          </button>

          <div className="flex items-center gap-3 text-xs text-gray-600">
            <div className="h-px bg-edge flex-1" /> dev login <div className="h-px bg-edge flex-1" />
          </div>

          <input
            className="input"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && email && go(email)}
          />
          <button className="btn-primary w-full justify-center" disabled={!email || busy} onClick={() => go(email)}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
          {err && <div className="text-bad text-sm">{err}</div>}

          <div className="text-xs text-gray-500 pt-2">
            Try the seeded demo accounts (open each in a different browser/profile to test syncing):
            <div className="flex flex-wrap gap-2 mt-2">
              {['alice@demo.test', 'bob@demo.test', 'carol@demo.test'].map((e) => (
                <button key={e} className="chip bg-panel2 border border-edge hover:border-brand" onClick={() => go(e)}>
                  {e}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      <p className="text-center text-xs text-gray-600 mt-4">
        First sign-in auto-creates your profile. Dev login stands in for Google in this demo build.
      </p>
    </div>
  );
}
