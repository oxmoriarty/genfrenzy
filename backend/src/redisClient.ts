import Redis from 'ioredis';

const URL = process.env.REDIS_URL || 'redis://localhost:6379';
export const redis    = new Redis(URL, { maxRetriesPerRequest: 3 });
export const redisSub = new Redis(URL, { maxRetriesPerRequest: 3 });

const QUIZ_TTL    = 7200;  // 2 hours — covers lobby wait + full quiz duration
const SESSION_TTL = 7200;  // matches quiz TTL — session shouldn't outlive the quiz it belongs to

export const K = {
  quiz:        (code: string) => `quiz:${code}`,
  player:      (code: string, id: string) => `player:${code}:${id}`,
  players:     (code: string) => `players:${code}`,        // set of player IDs for this quiz
  leaderboard: (code: string) => `lb:${code}`,              // sorted set: score by playerId
  answers:     (code: string, qi: number) => `answers:${code}:${qi}`,
  // Session is now keyed by PLAYER ID (stable across reconnects), not socket.id
  // (which changes on every reconnect by design — keying by it was the root
  // cause of players losing their session after a disconnect/reconnect).
  playerSession: (playerId: string) => `session:player:${playerId}`,
  adminSession:  (code: string) => `session:admin:${code}`,
};

// ─── Quiz ───────────────────────────────────────────────────────────────────
export async function getQuiz(code: string) {
  const d = await redis.get(K.quiz(code));
  return d ? JSON.parse(d) : null;
}
export async function setQuiz(code: string, q: any, ttl = QUIZ_TTL) {
  await redis.set(K.quiz(code), JSON.stringify(q), 'EX', ttl);
}

// ─── Player ─────────────────────────────────────────────────────────────────
export async function getPlayer(code: string, id: string) {
  const d = await redis.get(K.player(code, id));
  return d ? JSON.parse(d) : null;
}
export async function setPlayer(code: string, id: string, player: any, ttl = QUIZ_TTL) {
  await redis.set(K.player(code, id), JSON.stringify(player), 'EX', ttl);
  await redis.sadd(K.players(code), id);
  await redis.expire(K.players(code), ttl);
}
export async function getAllPlayers(code: string) {
  const ids = await redis.smembers(K.players(code));
  if (!ids.length) return [];
  const raw = await redis.mget(ids.map(id => K.player(code, id)));
  return raw.filter(Boolean).map(d => JSON.parse(d as string));
}
export async function removePlayer(code: string, id: string) {
  await redis.del(K.player(code, id));
  await redis.srem(K.players(code), id);
  await redis.zrem(K.leaderboard(code), id);
}

// ─── Leaderboard (sorted set: member=playerId, score=points) ────────────────
export async function updateScore(code: string, playerId: string, score: number, ttl = QUIZ_TTL) {
  await redis.zadd(K.leaderboard(code), score, playerId);
  await redis.expire(K.leaderboard(code), ttl);
}
export async function getLeaderboard(code: string) {
  // Returns flat array: [playerId1, score1, playerId2, score2, ...] sorted desc
  return redis.zrevrange(K.leaderboard(code), 0, -1, 'WITHSCORES');
}

// ─── Answers (for export/audit) ──────────────────────────────────────────────
export async function recordAnswer(
  code: string, qi: number, playerId: string, selected: string, timeLeft: number, ttl = QUIZ_TTL
) {
  await redis.hset(K.answers(code, qi), playerId, JSON.stringify({ selected, timeLeft, at: Date.now() }));
  await redis.expire(K.answers(code, qi), ttl);
}

// ─── Sessions — keyed by stable identity (playerId / quiz code for admin) ───
// NOT keyed by socket.id, since socket.id changes on every reconnect.
interface PlayerSessionData {
  role: 'player';
  code: string;
  playerId: string;
  username: string;
}
interface AdminSessionData {
  role: 'admin';
  code: string;
}
type SessionData = PlayerSessionData | AdminSessionData;

export async function setSession(socketId: string, data: SessionData, ttl = SESSION_TTL) {
  // Maintain a socketId -> identity pointer (short-lived, just for the
  // current connection's disconnect handler to know who it was), AND the
  // durable identity-keyed record used for all restore/reconnect lookups.
  await redis.set(`socketptr:${socketId}`, JSON.stringify(data), 'EX', ttl);
  if (data.role === 'player') {
    await redis.set(K.playerSession(data.playerId), JSON.stringify(data), 'EX', ttl);
  } else {
    await redis.set(K.adminSession(data.code), JSON.stringify(data), 'EX', ttl);
  }
}

// Looks up a session by the CURRENT socket.id — used inside a handler that
// only has access to `socket.id` (e.g. submit_answer, disconnect).
export async function getSession(socketId: string): Promise<SessionData | null> {
  const d = await redis.get(`socketptr:${socketId}`);
  return d ? JSON.parse(d) : null;
}

export async function deleteSession(socketId: string) {
  await redis.del(`socketptr:${socketId}`);
  // Note: does NOT delete the durable playerSession/adminSession record —
  // that record must survive across reconnects. It expires naturally via
  // TTL, or is explicitly cleared via clearPlayerSession/clearAdminSession
  // when the player/admin truly leaves (quiz ended + grace period passed).
}

// Durable lookup by playerId — used for reconnect/restore flows where we
// already know the playerId (e.g. from the client's localStorage) and need
// to confirm it's still a valid, live session.
export async function getPlayerSession(playerId: string): Promise<PlayerSessionData | null> {
  const d = await redis.get(K.playerSession(playerId));
  return d ? JSON.parse(d) : null;
}
export async function getAdminSession(code: string): Promise<AdminSessionData | null> {
  const d = await redis.get(K.adminSession(code));
  return d ? JSON.parse(d) : null;
}
export async function clearPlayerSession(playerId: string) {
  await redis.del(K.playerSession(playerId));
}
export async function clearAdminSession(code: string) {
  await redis.del(K.adminSession(code));
}