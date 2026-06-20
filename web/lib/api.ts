export const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000') + '/api/v1';
export const ORIGIN = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem('streamy_token');
}
export function setSession(token: string, user: any) {
  window.localStorage.setItem('streamy_token', token);
  window.localStorage.setItem('streamy_user', JSON.stringify(user));
}
export function getUser(): any | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem('streamy_user');
  return raw ? JSON.parse(raw) : null;
}
export function clearSession() {
  window.localStorage.removeItem('streamy_token');
  window.localStorage.removeItem('streamy_user');
}

export class ApiError extends Error {
  code: string;
  status: number;
  details: any;
  constructor(status: number, code: string, message: string, details?: any) {
    super(message || code);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function request<T = any>(method: string, path: string, body?: any): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  let payload: BodyInit | undefined;
  if (body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(API_BASE + path, { method, headers, body: payload });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = data?.error || data?.message || {};
    const code = err?.code || data?.code || 'INTERNAL';
    throw new ApiError(res.status, code, err?.message || code, err);
  }
  return data as T;
}

export const api = {
  get: <T = any>(p: string) => request<T>('GET', p),
  post: <T = any>(p: string, b?: any) => request<T>('POST', p, b),
  put: <T = any>(p: string, b?: any) => request<T>('PUT', p, b),
  patch: <T = any>(p: string, b?: any) => request<T>('PATCH', p, b),
  del: <T = any>(p: string, b?: any) => request<T>('DELETE', p, b),
};

export function streamUrl(videoId: string): string {
  return `${ORIGIN}/api/v1/videos/${videoId}/stream?token=${encodeURIComponent(getToken() || '')}`;
}
