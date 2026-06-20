'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, clearSession, getToken, getUser, setSession } from './api';
import { disconnectSocket } from './socket';

interface AuthCtx {
  user: any | null;
  ready: boolean;
  devLogin: (email: string, username?: string) => Promise<any>;
  logout: () => void;
  refresh: () => Promise<void>;
}
const Ctx = createContext<AuthCtx>(null as any);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const u = getUser();
    if (u && getToken()) setUser(u);
    setReady(true);
  }, []);

  async function devLogin(email: string, username?: string) {
    const res = await api.post('/auth/dev-login', { email, username });
    setSession(res.accessToken, res.user);
    setUser(res.user);
    return res;
  }
  function logout() {
    clearSession();
    disconnectSocket();
    setUser(null);
  }
  async function refresh() {
    const me = await api.get('/me');
    setUser(me);
    setSession(getToken()!, me);
  }

  return <Ctx.Provider value={{ user, ready, devLogin, logout, refresh }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  return useContext(Ctx);
}

/** Redirect to /login if not authenticated. */
export function useRequireAuth() {
  const { user, ready } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (ready && !user) router.replace('/login');
  }, [ready, user, router]);
  return user;
}
