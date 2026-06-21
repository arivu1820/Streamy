'use client';
import { io, Socket } from 'socket.io-client';
import { ORIGIN, getToken } from './api';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (socket && socket.connected) return socket;
  if (!socket) {
    socket = io(ORIGIN + '/rt', {
      // Prefer a raw WebSocket, but allow HTTP long-polling to fall back to.
      // This matters on hosts like Render: during a cold start (the free
      // instance spins down after ~15 min idle) the first WS upgrade can fail,
      // and polling lets the client connect and then upgrade once the box is warm.
      transports: ['websocket', 'polling'],
      auth: { token: getToken() },
      autoConnect: true,
      // Resilient reconnection so a dropped socket (deploy, cold start, flaky
      // network) re-establishes automatically instead of going dead.
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    });
  }
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
