'use client';
import React from 'react';

const COLORS = ['#7c5cff', '#34d399', '#fbbf24', '#f87171', '#38bdf8', '#fb7185', '#a78bfa'];

export function Avatar({ name, url, size = 32 }: { name: string; url?: string | null; size?: number }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={name} width={size} height={size} className="rounded-full object-cover" style={{ width: size, height: size }} />;
  }
  const initials = (name || '?').slice(0, 2).toUpperCase();
  const color = COLORS[(name || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
  return (
    <div
      aria-label={name}
      className="rounded-full flex items-center justify-center font-semibold text-white shrink-0"
      style={{ width: size, height: size, background: color, fontSize: size * 0.4 }}
    >
      {initials}
    </div>
  );
}

export function Dot({ online }: { online: boolean }) {
  return <span className={`inline-block w-2 h-2 rounded-full ${online ? 'bg-good' : 'bg-gray-600'}`} />;
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-gray-400 text-sm">
      <span className="inline-block w-4 h-4 border-2 border-gray-600 border-t-brand rounded-full animate-spin" />
      {label}
    </div>
  );
}

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="text-center py-12 px-6 card">
      <div className="text-gray-200 font-medium">{title}</div>
      {hint && <div className="text-gray-500 text-sm mt-1 max-w-md mx-auto">{hint}</div>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function fmtTime(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

export function relTime(iso: string | number | null) {
  if (!iso) return '';
  const d = typeof iso === 'number' ? iso : new Date(iso).getTime();
  const diff = Date.now() - d;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
