'use client';
import { io, Socket } from 'socket.io-client';
import { ORIGIN, getToken } from './api';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (socket && socket.connected) return socket;
  if (!socket) {
    socket = io(ORIGIN + '/rt', {
      transports: ['websocket'],
      auth: { token: getToken() },
      autoConnect: true,
    });
  }
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
