'use client';
import React from 'react';

/**
 * One coherent icon family for the whole app. Every icon is a stroke-based 24×24
 * outline using currentColor, the same 1.8 stroke width, and round caps/joins — so
 * they all look like siblings while each glyph is distinct. Use via <Icon.Name/>.
 */

type P = { size?: number; className?: string; strokeWidth?: number };

function S({ size = 18, className, strokeWidth = 1.8, children }: P & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export const Icon = {
  Logo: (p: P) => (
    <S {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M10 8.5v7l5.5-3.5z" />
    </S>
  ),
  Play: (p: P) => (
    <S {...p}>
      <path d="M7 5.2v13.6a.7.7 0 0 0 1.06.6l11-6.8a.7.7 0 0 0 0-1.2l-11-6.8A.7.7 0 0 0 7 5.2z" />
    </S>
  ),
  Pause: (p: P) => (
    <S {...p}>
      <rect x="7" y="5" width="3.5" height="14" rx="1" />
      <rect x="13.5" y="5" width="3.5" height="14" rx="1" />
    </S>
  ),
  Rewind: (p: P) => (
    <S {...p}>
      <path d="M11 6 4 12l7 6V6z" />
      <path d="M20 6l-7 6 7 6V6z" />
    </S>
  ),
  Forward: (p: P) => (
    <S {...p}>
      <path d="M13 6l7 6-7 6V6z" />
      <path d="M4 6l7 6-7 6V6z" />
    </S>
  ),
  Mic: (p: P) => (
    <S {...p}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M6 11a6 6 0 0 0 12 0M12 17v4" />
    </S>
  ),
  MicOff: (p: P) => (
    <S {...p}>
      <path d="M9 9v2a3 3 0 0 0 4.5 2.6M15 11.5V6a3 3 0 0 0-5.7-1.3" />
      <path d="M6 11a6 6 0 0 0 9 5.2M12 17v4M4 4l16 16" />
    </S>
  ),
  Volume: (p: P) => (
    <S {...p}>
      <path d="M4 9v6h4l5 4V5L8 9z" />
      <path d="M16 9a3 3 0 0 1 0 6" />
    </S>
  ),
  Members: (p: P) => (
    <S {...p}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 19a6 6 0 0 1 12 0" />
      <path d="M16 6.2a3 3 0 0 1 0 5.6M21 19a5.5 5.5 0 0 0-4-5.3" />
    </S>
  ),
  Invite: (p: P) => (
    <S {...p}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 19a6 6 0 0 1 11 0" />
      <path d="M18 8v6M15 11h6" />
    </S>
  ),
  Film: (p: P) => (
    <S {...p}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18M3 15h18M8 4v16M16 4v16" />
    </S>
  ),
  Upload: (p: P) => (
    <S {...p}>
      <path d="M12 16V4M8 8l4-4 4 4" />
      <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </S>
  ),
  Trash: (p: P) => (
    <S {...p}>
      <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M10 11v6M14 11v6" />
    </S>
  ),
  Check: (p: P) => (
    <S {...p}>
      <path d="M5 12.5l4.5 4.5L19 7" />
    </S>
  ),
  Close: (p: P) => (
    <S {...p}>
      <path d="M6 6l12 12M18 6 6 18" />
    </S>
  ),
  Vote: (p: P) => (
    <S {...p}>
      <path d="M12 3v3M5.5 7.5 12 6l6.5 1.5" />
      <path d="M3 13l2.5-5.5L8 13a2.5 2.5 0 0 1-5 0zM16 13l2.5-5.5L21 13a2.5 2.5 0 0 1-5 0z" />
      <path d="M8 20h8M12 6v14" />
    </S>
  ),
  Host: (p: P) => (
    <S {...p}>
      <path d="M4 8l3.5 3L12 5l4.5 6L20 8l-1.5 9h-13z" />
      <path d="M5.5 20h13" />
    </S>
  ),
  Chat: (p: P) => (
    <S {...p}>
      <path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-4 3v-3H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" />
    </S>
  ),
  Send: (p: P) => (
    <S {...p}>
      <path d="M21 3 10.5 13.5M21 3l-6.5 18-4-8-8-4z" />
    </S>
  ),
  Edit: (p: P) => (
    <S {...p}>
      <path d="M4 20h4l10-10-4-4L4 16v4z" />
      <path d="M13.5 6.5l4 4" />
    </S>
  ),
  Leave: (p: P) => (
    <S {...p}>
      <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
      <path d="M9 8l-4 4 4 4M5 12h11" />
    </S>
  ),
  Plus: (p: P) => (
    <S {...p}>
      <path d="M12 5v14M5 12h14" />
    </S>
  ),
  ArrowLeft: (p: P) => (
    <S {...p}>
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </S>
  ),
  ChevronRight: (p: P) => (
    <S {...p}>
      <path d="M9 6l6 6-6 6" />
    </S>
  ),
  Mail: (p: P) => (
    <S {...p}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M4 7l8 6 8-6" />
    </S>
  ),
  Clock: (p: P) => (
    <S {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </S>
  ),
  Shield: (p: P) => (
    <S {...p}>
      <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" />
      <path d="M9 12l2 2 4-4" />
    </S>
  ),
  Info: (p: P) => (
    <S {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </S>
  ),
  Tip: (p: P) => (
    <S {...p}>
      <path d="M9 18h6M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" />
    </S>
  ),
  Live: (p: P) => (
    <S {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M6.3 6.3a8 8 0 0 0 0 11.4M17.7 6.3a8 8 0 0 1 0 11.4M3.5 3.5a12 12 0 0 0 0 17M20.5 3.5a12 12 0 0 1 0 17" />
    </S>
  ),
  Hand: (p: P) => (
    <S {...p}>
      <path d="M8 11V5.5a1.5 1.5 0 0 1 3 0V11M11 11V4.5a1.5 1.5 0 0 1 3 0V11M14 11V6.5a1.5 1.5 0 0 1 3 0V13a6 6 0 0 1-6 6h-1a5 5 0 0 1-3.6-1.5L5 15.5a1.5 1.5 0 0 1 2.3-1.9L8 14.3" />
    </S>
  ),
  Transfer: (p: P) => (
    <S {...p}>
      <path d="M4 8h13l-3-3M20 16H7l3 3" />
    </S>
  ),
  Eye: (p: P) => (
    <S {...p}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="2.5" />
    </S>
  ),
  Link: (p: P) => (
    <S {...p}>
      <path d="M10 14a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1 1" />
      <path d="M14 10a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5l1-1" />
    </S>
  ),
  Google: (p: P) => (
    <S {...p} strokeWidth={1.6}>
      <path d="M21 12.2c0-.7-.1-1.3-.2-2H12v3.8h5.1a4.4 4.4 0 0 1-1.9 2.9v2.4h3.1C20 17.6 21 15.2 21 12.2z" />
      <path d="M12 21c2.4 0 4.5-.8 6-2.2l-3.1-2.4c-.8.6-1.9.9-2.9.9-2.3 0-4.2-1.5-4.9-3.6H3.9v2.5A9 9 0 0 0 12 21z" />
      <path d="M7.1 13.7a5.4 5.4 0 0 1 0-3.4V7.8H3.9a9 9 0 0 0 0 8.4z" />
      <path d="M12 6.6c1.3 0 2.5.5 3.4 1.3l2.6-2.6A9 9 0 0 0 3.9 7.8l3.2 2.5C7.8 8.1 9.7 6.6 12 6.6z" />
    </S>
  ),
  Sparkle: (p: P) => (
    <S {...p}>
      <path d="M12 3l1.8 4.7L18.5 9l-4.7 1.8L12 15l-1.8-4.2L5.5 9l4.7-1.3z" />
      <path d="M18 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
    </S>
  ),
  Logout: (p: P) => (
    <S {...p}>
      <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
      <path d="M9 8l-4 4 4 4M5 12h11" />
    </S>
  ),
  Dot: (p: P) => (
    <S {...p}>
      <circle cx="12" cy="12" r="5" fill="currentColor" stroke="none" />
    </S>
  ),
};

export type IconName = keyof typeof Icon;
