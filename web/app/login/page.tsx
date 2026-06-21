'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../lib/auth';
import { Icon } from '../../components/icons';
import { Caption } from '../../components/ui';

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
        <div className="flex items-center gap-2.5">
          <span className="text-brand2">
            <Icon.Logo size={30} />
          </span>
          <h1 className="text-2xl font-bold">Streamy</h1>
        </div>
        <p className="text-gray-400 text-sm mt-2">
          A private video room for your friend group — watch together, in sync, with chat and voice.
        </p>

        <div className="mt-6 space-y-3">
          <button
            className="btn-ghost w-full justify-center opacity-70"
            disabled
            title="Set GOOGLE_CLIENT_ID in server/.env to enable real Google Sign-In"
          >
            <Icon.Google size={18} />
            Continue with Google
          </button>
          <Caption icon="Info">
            Google Sign-In is the production method. It&apos;s disabled until you add a client ID — use the
            dev login below to explore now.
          </Caption>

          <div className="flex items-center gap-3 text-[11px] uppercase tracking-wide text-gray-600 py-1">
            <div className="h-px bg-edge flex-1" /> dev login <div className="h-px bg-edge flex-1" />
          </div>

          <label className="label" htmlFor="email">
            Email
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
              <Icon.Mail size={16} />
            </span>
            <input
              id="email"
              className="input pl-9"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && email && go(email)}
            />
          </div>
          <button className="btn-primary w-full justify-center" disabled={!email || busy} onClick={() => go(email)}>
            {busy ? (
              'Signing in…'
            ) : (
              <>
                <Icon.ArrowLeft size={16} className="rotate-180" />
                Sign in
              </>
            )}
          </button>
          {err && (
            <div className="badge-bad w-full justify-center py-1.5">
              <Icon.Close size={13} />
              {err}
            </div>
          )}

          <div className="pt-2">
            <Caption icon="Members">
              Try the seeded demo accounts — open each in a separate browser profile to test syncing, voting,
              and voice between people.
            </Caption>
            <div className="flex flex-wrap gap-2 mt-2">
              {['alice@demo.test', 'bob@demo.test', 'carol@demo.test'].map((e) => (
                <button
                  key={e}
                  className="badge-neutral hover:border-brand/60 hover:text-white transition"
                  onClick={() => go(e)}
                >
                  <Icon.Plus size={12} />
                  {e}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      <p className="flex items-center justify-center gap-1.5 text-center text-xs text-gray-600 mt-4">
        <Icon.Shield size={13} />
        First sign-in auto-creates your profile. No passwords, ever.
      </p>
    </div>
  );
}
