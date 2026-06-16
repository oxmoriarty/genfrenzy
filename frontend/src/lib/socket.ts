import { io, Socket } from 'socket.io-client';

const URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';
let socket: Socket | null = null;

export function getSocket(): Socket {
  if (socket) return socket;

  // NOTE: session restore is handled entirely via the explicit
  // `player_restore` / `admin_rejoin` emits (see useSocketEvents.ts and
  // admin/page.tsx) — not via socket.handshake.auth. Auth-based handshake
  // restore raced against the explicit restore call and only one path ever
  // updated the UI, which was a root cause of players appearing stuck after
  // reconnecting. Keeping this socket free of auth-based restore logic
  // avoids reintroducing that race.
  socket = io(URL, {
    transports: ['websocket', 'polling'],
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 3000,
    timeout: 20000,
    withCredentials: true,
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

// Persists the player's stable identity (code/playerId/username) so a
// reconnect or full page refresh can resume the same session. This is
// SEPARATE from the zustand UI-state cache (`gf_game_state`) — this key
// represents "who am I / which quiz am I in", while gf_game_state is just a
// rendering cache that gets corrected by the server on every reconnect.
export function saveSession(data: Record<string, string>) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('gf_session', JSON.stringify(data));
  }
}

export function clearSession() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('gf_session');
  }
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}

if (typeof window !== 'undefined') {
  getSocket();
}