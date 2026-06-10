import { io, Socket } from 'socket.io-client';
const URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';
let socket: Socket|null = null;
export function getSocket(): Socket {
  if (!socket || !socket.connected) {
    socket = io(URL, { transports:['websocket','polling'], reconnection:true, reconnectionAttempts:10, timeout:20000 });
  }
  return socket;
}
