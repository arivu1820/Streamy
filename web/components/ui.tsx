'use client';
import React from 'react';
import { Icon, IconName } from './icons';

const COLORS = ['#7c5cff', '#34d399', '#fbbf24', '#f87171', '#38bdf8', '#fb7185', '#a78bfa'];

export function Avatar({ name, url, size = 32 }: { name: string; url?: string | null; size?: number }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={url}
        alt={name}
        width={size}
        height={size}
        className="rounded-full object-cover ring-1 ring-edge"
        style={{ width: size, height: size }}
      />
    );
  }
  const initials = (name || '?').slice(0, 2).toUpperCase();
  const color = COLORS[(name || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
  return (
    <div
      aria-label={name}
      title={name}
      className="rounded-full flex items-center justify-center font-semibold text-white shrink-0 ring-1 ring-white/10"
      style={{ width: size, height: size, background: color, fontSize: size * 0.4 }}
    >
      {initials}
    </div>
  );
}

/** Presence dot with accessible label (color is never the only signal). */
export function Presence({ online }: { online: boolean }) {
  return (
    <span className="inline-flex items-center" title={online ? 'Online' : 'Offline'}>
      <span className={`inline-block w-2 h-2 rounded-full ${online ? 'bg-good shadow-[0_0_8px] shadow-good/60' : 'bg-gray-600'}`} />
    </span>
  );
}

/** Page header: icon + title + one-line self-explanatory subtitle + optional actions. */
export function PageHeader({
  icon,
  title,
  subtitle,
  actions,
}: {
  icon: IconName;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  const I = Icon[icon];
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-brand/15 border border-brand/30 text-brand2 flex items-center justify-center">
          <I size={20} />
        </div>
        <div>
          <h1 className="text-xl font-bold leading-tight">{title}</h1>
          {subtitle && <p className="text-sm text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Section title inside a card: icon + label. */
export function SectionTitle({ icon, children }: { icon: IconName; children: React.ReactNode }) {
  const I = Icon[icon];
  return (
    <div className="section-title">
      <span className="text-brand2">
        <I size={16} />
      </span>
      {children}
    </div>
  );
}

/** Self-explanatory caption block. Defaults to an info glyph; use tone for emphasis. */
export function Caption({
  children,
  icon = 'Info',
  tone = 'muted',
}: {
  children: React.ReactNode;
  icon?: IconName;
  tone?: 'muted' | 'brand' | 'warn';
}) {
  const I = Icon[icon];
  const color = tone === 'brand' ? 'text-brand2' : tone === 'warn' ? 'text-warn' : 'caption-icon';
  return (
    <p className="caption">
      <span className={color}>
        <I size={13} />
      </span>
      <span>{children}</span>
    </p>
  );
}

export function Badge({
  tone = 'neutral',
  icon,
  children,
}: {
  tone?: 'neutral' | 'brand' | 'good' | 'warn' | 'bad';
  icon?: IconName;
  children: React.ReactNode;
}) {
  const I = icon ? Icon[icon] : null;
  return (
    <span className={`badge-${tone}`}>
      {I && <I size={12} />}
      {children}
    </span>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-gray-400 text-sm" role="status" aria-live="polite">
      <span className="inline-block w-4 h-4 border-2 border-gray-600 border-t-brand rounded-full animate-spin" />
      {label}
    </div>
  );
}

export function Empty({
  icon = 'Sparkle',
  title,
  hint,
  action,
}: {
  icon?: IconName;
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  const I = Icon[icon];
  return (
    <div className="text-center py-14 px-6 card border-dashed">
      <div className="w-12 h-12 rounded-2xl bg-panel2 border border-edge text-gray-400 flex items-center justify-center mx-auto">
        <I size={22} />
      </div>
      <div className="text-gray-100 font-medium mt-4">{title}</div>
      {hint && <div className="text-gray-500 text-sm mt-1 max-w-md mx-auto">{hint}</div>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
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
