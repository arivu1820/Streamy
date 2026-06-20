import { Injectable } from '@nestjs/common';

interface Presence {
  username: string;
  connCount: number;
  lastActive: number;
  status: 'online' | 'offline';
  currentSessionId: string | null;
  activity: string | null;
  rooms: Set<string>;
}

/** In-memory presence (Redis in prod). Reference-counted per socket connection. */
@Injectable()
export class PresenceService {
  private map = new Map<string, Presence>();

  connect(userId: string, username: string) {
    const p = this.map.get(userId);
    if (p) {
      p.connCount++;
      p.status = 'online';
      p.lastActive = Date.now();
    } else {
      this.map.set(userId, {
        username,
        connCount: 1,
        lastActive: Date.now(),
        status: 'online',
        currentSessionId: null,
        activity: null,
        rooms: new Set(),
      });
    }
  }

  disconnect(userId: string) {
    const p = this.map.get(userId);
    if (!p) return;
    p.connCount = Math.max(0, p.connCount - 1);
    p.lastActive = Date.now();
    if (p.connCount === 0) {
      p.status = 'offline';
      p.currentSessionId = null;
      p.activity = null;
    }
  }

  touch(userId: string) {
    const p = this.map.get(userId);
    if (p) p.lastActive = Date.now();
  }

  trackRoom(userId: string, roomId: string) {
    this.map.get(userId)?.rooms.add(roomId);
  }

  setActivity(userId: string, sessionId: string | null, activity: string | null) {
    const p = this.map.get(userId);
    if (p) {
      p.currentSessionId = sessionId;
      p.activity = activity;
      p.lastActive = Date.now();
    }
  }

  get(userId: string) {
    const p = this.map.get(userId);
    if (!p) return { status: 'offline', lastActive: null, currentSessionId: null, activity: null };
    return {
      status: p.status,
      lastActive: p.lastActive,
      currentSessionId: p.currentSessionId,
      activity: p.activity,
    };
  }

  forUsers(userIds: string[]) {
    return userIds.map((id) => ({ userId: id, ...this.get(id) }));
  }
}
