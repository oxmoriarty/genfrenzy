import Redis from 'ioredis';

const URL = process.env.REDIS_URL || 'redis://localhost:6379';
export const redis    = new Redis(URL, { maxRetriesPerRequest: 3 });
export const redisSub = new Redis(URL, { maxRetriesPerRequest: 3 });

redis.on('connect', () => console.log('[Redis] Connected'));
redis.on('error',   (e: Error) => console.error('[Redis] Error:', e.message));

export const K = {
  quiz:    (c: string)             => `quiz:${c}`,
  players: (c: string)             => `players:${c}`,
  player:  (c: string, id: string) => `player:${c}:${id}`,
  lb:      (c: string)             => `lb:${c}`,
  answers: (c: string, q: number)  => `ans:${c}:q${q}`,
  session: (sid: string)           => `sess:${sid}`,
};

export async function getQuiz(c: string) {
  const d = await redis.get(K.quiz(c));
  return d ? JSON.parse(d) : null;
}
export async function setQuiz(c: string, q: any, ttl = 7200) {
  await redis.set(K.quiz(c), JSON.stringify(q), 'EX', ttl);
}
export async function getPlayer(c: string, id: string) {
  const d = await redis.get(K.player(c, id));
  return d ? JSON.parse(d) : null;
}
export async function setPlayer(c: string, id: string, p: any, ttl = 7200) {
  await redis.set(K.player(c, id), JSON.stringify(p), 'EX', ttl);
  await redis.sadd(K.players(c), id);
  await redis.expire(K.players(c), ttl);
}
export async function getAllPlayers(c: string) {
  const ids = await redis.smembers(K.players(c));
  if (!ids.length) return [];
  const pipe = redis.pipeline();
  ids.forEach(id => pipe.get(K.player(c, id)));
  const res = await pipe.exec();
  return (res || []).map(r => r && r[1] ? JSON.parse(r[1] as string) : null).filter(Boolean);
}
export async function removePlayer(c: string, id: string) {
  await redis.del(K.player(c, id));
  await redis.srem(K.players(c), id);
  await redis.zrem(K.lb(c), id);
}
export async function updateScore(c: string, id: string, score: number) {
  await redis.zadd(K.lb(c), score, id);
}
export async function getLeaderboard(c: string, limit = 200) {
  return redis.zrevrangebyscore(K.lb(c), '+inf', '-inf', 'WITHSCORES', 'LIMIT', 0, limit);
}
export async function setSession(sid: string, data: any, ttl = 7200) {
  await redis.set(K.session(sid), JSON.stringify(data), 'EX', ttl);
}
export async function getSession(sid: string) {
  const d = await redis.get(K.session(sid));
  return d ? JSON.parse(d) : null;
}
export async function deleteSession(sid: string) {
  await redis.del(K.session(sid));
}
// ans can be comma-joined string (multi-choice) or single number string
export async function recordAnswer(c: string, q: number, id: string, ans: string, tl: number) {
  await redis.hset(K.answers(c, q), id, JSON.stringify({ ans, tl, ts: Date.now() }));
  await redis.expire(K.answers(c, q), 7200);
}
