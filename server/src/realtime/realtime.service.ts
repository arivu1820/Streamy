import { Injectable } from '@nestjs/common';
import type { Server } from 'socket.io';

/**
 * Thin holder for the Socket.IO server so non-gateway services (e.g. delete-vote
 * evaluation) can broadcast without circular dependencies. The gateway calls
 * setServer() in afterInit. In production this is where the Redis adapter lives
 * so any node can fan out to any socket (streamy.md Section 29).
 */
@Injectable()
export class RealtimeService {
  private server: Server | null = null;

  setServer(server: Server) {
    this.server = server;
  }
  get io(): Server | null {
    return this.server;
  }

  toRoom(roomId: string, event: string, payload: any) {
    this.server?.to(`room:${roomId}`).emit(event, payload);
  }
  toSession(sessionId: string, event: string, payload: any) {
    this.server?.to(`session:${sessionId}`).emit(event, payload);
  }
}
