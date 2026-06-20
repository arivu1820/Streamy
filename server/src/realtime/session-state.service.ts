import { Injectable } from '@nestjs/common';

/**
 * Authoritative LIVE session state. In production this lives in Redis so any
 * node can read/write it (streamy.md Sections 13, 25, 29). For the single-node
 * easy-run demo it is an in-memory map with the exact same semantics.
 */
export interface PlaybackRequest {
  id: string;
  type: 'seek' | 'forward' | 'rewind';
  byUserId: string;
  byUsername: string;
  positionMs: number;
  createdAt: number;
}
export interface ChangeVote {
  voteId: string;
  videoId: string;
  videoTitle: string;
  deadline: number;
  votes: Map<string, 'approve' | 'reject'>;
}
interface LiveSession {
  hostUserId: string;
  nowPlayingVideoId: string | null;
  isPlaying: boolean;
  positionMs: number; // anchor position
  serverTs: number; // when the anchor was set
  participants: Map<string, { username: string; sockets: Set<string> }>;
  requests: Map<string, PlaybackRequest>;
  changeVote?: ChangeVote;
  voice: Map<string, { username: string; muted: boolean }>; // userIds currently in voice
}

@Injectable()
export class SessionStateService {
  private sessions = new Map<string, LiveSession>();

  init(sessionId: string, s: { hostUserId: string; nowPlayingVideoId: string | null; positionMs?: number; isPlaying?: boolean }) {
    if (this.sessions.has(sessionId)) return this.sessions.get(sessionId)!;
    const live: LiveSession = {
      hostUserId: s.hostUserId,
      nowPlayingVideoId: s.nowPlayingVideoId,
      isPlaying: s.isPlaying ?? false,
      positionMs: s.positionMs ?? 0,
      serverTs: Date.now(),
      participants: new Map(),
      requests: new Map(),
      voice: new Map(),
    };
    this.sessions.set(sessionId, live);
    return live;
  }

  get(sessionId: string) {
    return this.sessions.get(sessionId);
  }

  /** Socket ids belonging to a user within a session (for targeted relays). */
  userSockets(live: LiveSession, userId: string): string[] {
    const p = live.participants.get(userId);
    return p ? [...p.sockets] : [];
  }

  voiceRoster(live: LiveSession): { userId: string; username: string; muted: boolean }[] {
    return [...live.voice.entries()].map(([userId, v]) => ({ userId, username: v.username, muted: v.muted }));
  }

  /** Current playback position accounting for elapsed time while playing. */
  currentPositionMs(s: LiveSession): number {
    if (!s.isPlaying) return s.positionMs;
    return s.positionMs + (Date.now() - s.serverTs);
  }

  setPlaying(s: LiveSession, isPlaying: boolean, positionMs?: number) {
    s.positionMs = positionMs ?? this.currentPositionMs(s);
    s.isPlaying = isPlaying;
    s.serverTs = Date.now();
  }

  seek(s: LiveSession, positionMs: number) {
    s.positionMs = Math.max(0, positionMs);
    s.serverTs = Date.now();
  }

  snapshot(sessionId: string) {
    const s = this.sessions.get(sessionId);
    if (!s) return null;
    return {
      sessionId,
      hostUserId: s.hostUserId,
      nowPlayingVideoId: s.nowPlayingVideoId,
      isPlaying: s.isPlaying,
      positionMs: this.currentPositionMs(s),
      serverTs: Date.now(),
      participants: [...s.participants.entries()].map(([userId, p]) => ({
        userId,
        username: p.username,
      })),
    };
  }

  remove(sessionId: string) {
    this.sessions.delete(sessionId);
  }
}
