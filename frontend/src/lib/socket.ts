import { io, Socket } from 'socket.io-client';

const URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';
let socket: Socket | null = null;

export function getSocket(): Socket {
  if (socket) return socket;

  // Read stored session from localStorage for reconnect
  let auth: Record<string, string> = {};
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('gf_session');
    if (stored) {
      try { auth = JSON.parse(stored); } catch (_) {}
    }
  }

  socket = io(URL, {
    transports: ['websocket', 'polling'],
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 3000,
    timeout: 20000,
    withCredentials: true,
    auth,
  });

  socket.on('connect', () => {
    console.log('[Socket] Connected:', socket?.id);
  });
  socket.on('connect_error', (err) => {
    console.error('[Socket] Error:', err.message);
  });
  socket.on('disconnect', (reason) => {
    console.log('[Socket] Disconnected:', reason);
  });

  return socket;
}

export function saveSession(data: Record<string, string>) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('gf_session', JSON.stringify(data));
    // Update socket auth so next reconnect uses new session
    const sk = getSocket();
    (sk as any).auth = data;
  }
}

export function clearSession() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('gf_session');
    const sk = getSocket();
    (sk as any).auth = {};
  }
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}

if (typeof window !== 'undefined') {
  getSocket();
}