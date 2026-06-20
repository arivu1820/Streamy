'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { Spinner } from '../../../components/ui';

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const { user, ready, devLogin } = useAuth();
  const [info, setInfo] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.get(`/invitations/${token}`).then(setInfo).catch(() => setInfo({ status: 'invalid' }));
  }, [token]);

  async function accept() {
    setBusy(true);
    setErr('');
    try {
      // If signed in as a different email, sign in as the invited email (dev demo).
      if (!user || user.email.toLowerCase() !== info.invitedEmail) {
        await devLogin(info.invitedEmail);
      }
      const res = await api.post(`/invitations/${token}/accept`);
      router.replace(`/rooms/${res.roomId}`);
    } catch (e: any) {
      const m: Record<string, string> = {
        INVITE_EXPIRED: 'This invitation has expired. Ask a member to send a new one.',
        INVITE_INVALID: 'This invitation link is no longer valid.',
        INVITE_EMAIL_MISMATCH: `This invite is for ${info?.invitedEmail}. Sign in with that email to accept.`,
      };
      setErr(m[e.code] || e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!ready || !info) return <Spinner label="Loading invitation…" />;

  if (info.status !== 'pending') {
    const msg: Record<string, string> = {
      invalid: 'This invitation link is no longer valid.',
      expired: 'This invitation has expired. Ask a member to send a new one.',
      accepted: 'This invitation has already been used.',
      declined: 'This invitation was declined.',
      revoked: 'This invitation was revoked.',
    };
    return (
      <div className="max-w-md mx-auto mt-10 card p-8 text-center space-y-4">
        <div className="text-gray-200">{msg[info.status] || 'This invitation is not valid.'}</div>
        <button className="btn-ghost" onClick={() => router.replace('/rooms')}>Go to Streamy</button>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto mt-10 card p-8 text-center space-y-4">
      <div className="text-2xl">🎬</div>
      <div>
        <div className="text-lg font-semibold">@{info.invitedBy} invited you to “{info.roomName}”</div>
        <div className="text-sm text-gray-500 mt-1">Invitation for {info.invitedEmail}</div>
      </div>
      <p className="text-xs text-gray-500">
        Invites are bound to an email. Accepting will sign you in as {info.invitedEmail} (dev demo) and add you to the room.
      </p>
      <button className="btn-primary w-full justify-center" disabled={busy} onClick={accept}>
        {busy ? 'Joining…' : 'Accept invitation'}
      </button>
      {err && <div className="text-bad text-sm">{err}</div>}
    </div>
  );
}
