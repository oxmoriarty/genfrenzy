import Redis from 'ioredis';

const URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Single Redis connection — redisSub was created but never used anywhere,
// so it's removed to avoid holding an unnecessary persistent connection.
export const redis = new Redis(URL, {
  maxRetriesPerRequest: 3,
  // Keep-alive prevents the connection from being dropped by the network
  // between quiz sessions (important on Render's free tier).
  keepAlive: 10000,
  // Reduce reconnect noise in logs
  reconnectOnError: (err) => {
    const targetError = 'READONLY';
    return err.message.includes(targetError);
  },
});

const QUIZ_TTL    = 7200;
const SESSION_TTL = 7200;

export const K = {
  quiz:          (code: string) => `quiz:${code}`,
  player:        (code: string, id: string) => `player:${code}:${id}`,
  players:       (code: string) => `players:${code}`,
  leaderboard:   (code: string) => `lb:${code}`,
  answers:       (code: string, qi: number) => `answers:${code}:${qi}`,
  playerSession: (playerId: string) => `session:player:${playerId}`,
  adminSession:  (code: string) => `session:admin:${code}`,
};

// ─── Quiz ─────────────────────────────────────────────────────────────────────
export async function getQuiz(code: string) {
  const d = await redis.get(K.quiz(code));
  return d ? JSON.parse(d) : null;
}
export async function setQuiz(code: string, q: any, ttl = QUIZ_TTL) {
  await redis.set(K.quiz(code), JSON.stringify(q), 'EX', ttl);
}

// ─── Player ───────────────────────────────────────────────────────────────────
export async function getPlayer(code: string, id: string) {
  const d = await redis.get(K.player(code, id));
  return d ? JSON.parse(d) : null;
}
export async function setPlayer(code: string, id: string, player: any, ttl = QUIZ_TTL) {
  const pipeline = redis.pipeline();
  pipeline.set(K.player(code, id), JSON.stringify(player), 'EX', ttl);
  pipeline.sadd(K.players(code), id);
  pipeline.expire(K.players(code), ttl);
  await pipeline.exec();
}

// Batch-write multiple players in a single Redis round-trip.
export async function setPlayersBatch(
  code: string, players: { id: string; data: any }[], ttl = QUIZ_TTL
) {
  if (!players.length) return;
  const pipeline = redis.pipeline();
  for (const { id, data } of players) {
    pipeline.set(K.player(code, id), JSON.stringify(data), 'EX', ttl);
    pipeline.sadd(K.players(code), id);
  }
  pipeline.expire(K.players(code), ttl);
  await pipeline.exec();
}

export async function getAllPlayers(code: string) {
  const ids = await redis.smembers(K.players(code));
  if (!ids.length) return [];
  const raw = await redis.mget(ids.map(id => K.player(code, id)));
  return raw.filter(Boolean).map(d => JSON.parse(d as string));
}

export async function removePlayer(code: string, id: string) {
  const pipeline = redis.pipeline();
  pipeline.del(K.player(code, id));
  pipeline.srem(K.players(code), id);
  pipeline.zrem(K.leaderboard(code), id);
  await pipeline.exec();
}

// ─── Leaderboard ──────────────────────────────────────────────────────────────
export async function updateScore(code: string, playerId: string, score: number, ttl = QUIZ_TTL) {
  const pipeline = redis.pipeline();
  pipeline.zadd(K.leaderboard(code), score, playerId);
  pipeline.expire(K.leaderboard(code), ttl);
  await pipeline.exec();
}
export async function getLeaderboard(code: string) {
  return redis.zrevrange(K.leaderboard(code), 0, -1, 'WITHSCORES');
}

// ─── Answers ──────────────────────────────────────────────────────────────────
export async function recordAnswer(
  code: string, qi: number, playerId: string, selected: string, timeLeft: number, ttl = QUIZ_TTL
) {
  const pipeline = redis.pipeline();
  pipeline.hset(K.answers(code, qi), playerId, JSON.stringify({ selected, timeLeft, at: Date.now() }));
  pipeline.expire(K.answers(code, qi), ttl);
  await pipeline.exec();
}

// ─── Pipelined answer handler write ──────────────────────────────────────────
// Combines setPlayer + updateScore + recordAnswer + pending_results hset
// into a single pipeline — reduces handleAnswer from 5 serial Redis
// round-trips down to 1 regardless of Upstash network latency.
export async function writeAnswerResult(
  code: string, qi: number, playerId: string, socketId: string,
  player: any, selected: string, timeLeft: number,
  pendingPayload: string, ttl = QUIZ_TTL
) {
  const pipeline = redis.pipeline();
  // Player record
  pipeline.set(K.player(code, playerId), JSON.stringify(player), 'EX', ttl);
  pipeline.sadd(K.players(code), playerId);
  pipeline.expire(K.players(code), ttl);
  // Score sorted set
  pipeline.zadd(K.leaderboard(code), player.score, playerId);
  pipeline.expire(K.leaderboard(code), ttl);
  // Answer audit
  pipeline.hset(K.answers(code, qi), playerId, JSON.stringify({ selected, timeLeft, at: Date.now() }));
  pipeline.expire(K.answers(code, qi), ttl);
  // Pending result for synchronized flush
  pipeline.hset(`pending_results:${code}`, socketId, pendingPayload);
  pipeline.expire(`pending_results:${code}`, 300);
  await pipeline.exec();
}

// ─── Sessions ──────────────────────────────────────────────────────────────────
interface PlayerSessionData { role: 'player'; code: string; playerId: string; username: string; }
interface AdminSessionData  { role: 'admin'; code: string; }
type SessionData = PlayerSessionData | AdminSessionData;

export async function setSession(socketId: string, data: SessionData, ttl = SESSION_TTL) {
  const pipeline = redis.pipeline();
  pipeline.set(`socketptr:${socketId}`, JSON.stringify(data), 'EX', ttl);
  if (data.role === 'player') {
    pipeline.set(K.playerSession(data.playerId), JSON.stringify(data), 'EX', ttl);
  } else {
    pipeline.set(K.adminSession(data.code), JSON.stringify(data), 'EX', ttl);
  }
  await pipeline.exec();
}
export async function getSession(socketId: string): Promise<SessionData | null> {
  const d = await redis.get(`socketptr:${socketId}`);
  return d ? JSON.parse(d) : null;
}
export async function deleteSession(socketId: string) {
  await redis.del(`socketptr:${socketId}`);
}
export async function getPlayerSession(playerId: string): Promise<PlayerSessionData | null> {
  const d = await redis.get(K.playerSession(playerId));
  return d ? JSON.parse(d) : null;
}
export async function getAdminSession(code: string): Promise<AdminSessionData | null> {
  const d = await redis.get(K.adminSession(code));
  return d ? JSON.parse(d) : null;
}
export async function clearPlayerSession(playerId: string) { await redis.del(K.playerSession(playerId)); }
export async function clearAdminSession(code: string)      { await redis.del(K.adminSession(code)); }
