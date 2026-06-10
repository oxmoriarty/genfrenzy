import { Server } from 'socket.io';
import {
  getQuiz, setQuiz, getAllPlayers, getPlayer, setPlayer,
  updateScore, getLeaderboard, recordAnswer, redis,
} from './redisClient';
import { Player, Question, Quiz, QuestionResult } from './types';

const Q_PREVIEW_MS  = 5000;
const ANSWER_MS     = 20000;
const BETWEEN_MS    = 500;
const LB_DISPLAY_MS = 5000;

const timers = new Map<string, (NodeJS.Timeout | ReturnType<typeof setInterval>)[]>();

function clearTimers(code: string) {
  const ts = timers.get(code) || [];
  ts.forEach(t => { try { clearTimeout(t as any); clearInterval(t as any); } catch(_){} });
  timers.delete(code);
}
function addTimer(code: string, t: NodeJS.Timeout | ReturnType<typeof setInterval>) {
  if (!timers.has(code)) timers.set(code, []);
  timers.get(code)!.push(t);
}

// ─── Leaderboard builder ─────────────────────────────────────────────
export async function buildLeaderboard(code: string) {
  const raw     = await getLeaderboard(code);
  const players = await getAllPlayers(code);
  const pmap    = new Map<string, Player>(players.map((p: Player) => [p.id, p]));
  const entries = [];
  for (let i = 0; i < raw.length; i += 2) {
    const pid   = raw[i];
    const score = parseInt(raw[i + 1], 10);
    const p     = pmap.get(pid);
    if (p) {
      entries.push({
        playerId: pid, username: p.username, score, rank: Math.floor(i / 2) + 1,
        correctAnswers: p.correctAnswers, partialAnswers: p.partialAnswers ?? 0,
        incorrectAnswers: p.incorrectAnswers ?? 0,
        streak: p.streak, maxStreak: p.maxStreak,
      });
    }
  }
  return entries;
}

// ─── Scoring ──────────────────────────────────────────────────────────
function calcScore(
  selected: number[], correctIndices: number[], isMulti: boolean, timeLeft: number
): { points: number; correct: boolean; partial: boolean } {
  if (!isMulti) {
    const correct = selected.length === 1 && selected[0] === correctIndices[0];
    return { points: correct ? Math.round(1000 * (timeLeft / 20)) : 0, correct, partial: false };
  }
  const hits      = selected.filter(s => correctIndices.includes(s)).length;
  const wrongPicks = selected.filter(s => !correctIndices.includes(s)).length;
  if (hits === 0 || wrongPicks > 0) return { points: 0, correct: false, partial: false };
  const correct = hits === correctIndices.length;
  const ratio   = hits / correctIndices.length;
  return { points: Math.round(1000 * ratio * (timeLeft / 20)), correct, partial: !correct };
}

// ─── Achievements ─────────────────────────────────────────────────────
export async function computeAchievements(code: string) {
  const players: Player[] = await getAllPlayers(code);
  if (!players.length) return [];
  const lb      = await buildLeaderboard(code);
  const rankMap = new Map(lb.map(e => [e.playerId, e.rank]));
  const result: any[] = [];
  const used    = new Set<string>();
  const pick = (sorted: Player[], type: string, label: string, desc: string) => {
    const p = sorted.find(x => !used.has(x.id));
    if (p) { used.add(p.id); result.push({ type, label, description: desc, playerId: p.id, username: p.username }); }
  };
  const avgTime = (p: Player) =>
    p.answerTimes.length ? p.answerTimes.reduce((a, b) => a + b, 0) / p.answerTimes.length : -1;
  pick([...players].sort((a,b) => b.score - a.score), 'brainiac','Brainiac','Highest total score');
  pick([...players].sort((a,b) => b.correctAnswers!==a.correctAnswers?b.correctAnswers-a.correctAnswers:avgTime(b)-avgTime(a)), 'sharpshooter','Sharpshooter','Most fully correct answers');
  pick([...players].filter(p=>p.answerTimes.length).sort((a,b)=>avgTime(a)-avgTime(b)||b.score-a.score), 'speedster','Speedster','Fastest average answer');
  pick([...players].filter(p=>p.maxStreak>=2).sort((a,b)=>b.maxStreak-a.maxStreak||b.score-a.score), 'streak_king','Streak King','Longest answer streak');
  pick([...players].filter(p=>p.initialRank>0&&(p.initialRank-(rankMap.get(p.id)||p.initialRank))>=2).sort((a,b)=>{
    const ja=a.initialRank-(rankMap.get(a.id)||a.initialRank);
    const jb=b.initialRank-(rankMap.get(b.id)||b.initialRank);
    return jb-ja||(rankMap.get(a.id)||999)-(rankMap.get(b.id)||999);
  }),'comeback_fren','Comeback Fren','Biggest rank jump');
  return result;
}

// ─── Start engine ─────────────────────────────────────────────────────
export async function startQuizEngine(io: Server, code: string) {
  const quiz: Quiz = await getQuiz(code);
  if (!quiz) return;
  clearTimers(code);
  quiz.status = 'active';
  quiz.currentQuestionIndex = 0;
  await setQuiz(code, quiz);
  const initial = await getAllPlayers(code);
  const initLb  = await buildLeaderboard(code);
  for (const entry of initLb) {
    const p = initial.find((x: Player) => x.id === entry.playerId);
    if (p) { p.initialRank = entry.rank; await setPlayer(code, p.id, p); }
  }
  runQuestion(io, code, 0);
}

async function runQuestion(io: Server, code: string, qi: number) {
  const quiz: Quiz = await getQuiz(code);
  if (!quiz || quiz.status !== 'active') return;
  if (qi >= quiz.questions.length) { endQuiz(io, code); return; }

  quiz.currentQuestionIndex = qi;
  await setQuiz(code, quiz);

  const players: Player[] = await getAllPlayers(code);
  for (const p of players) {
    p.answeredCurrentQuestion = false;
    await setPlayer(code, p.id, p);
  }

  // Clear any pending results from previous round
  await redis.del(`pending_results:${code}`);

  const q = quiz.questions[qi];
  io.to(code).emit('new_question', {
    questionIndex: qi, totalQuestions: quiz.questions.length,
    text: q.text, imageBase64: q.imageBase64 || null,
    isMultipleChoice: q.isMultipleChoice, phase: 'question_only', duration: Q_PREVIEW_MS,
  });

  addTimer(code, setTimeout(async () => {
    io.to(code).emit('show_options', {
      questionIndex: qi, options: q.options,
      isMultipleChoice: q.isMultipleChoice, duration: ANSWER_MS,
    });

    let tl = ANSWER_MS / 1000;
    const tick = setInterval(() => {
      tl = Math.max(0, tl - 1);
      io.to(code).emit('timer_update', { timeLeft: tl, questionIndex: qi });
    }, 1000);
    addTimer(code, tick);

    // When timer expires: flush all pending results, THEN show leaderboard
    addTimer(code, setTimeout(async () => {
      clearInterval(tick);

      // Mark unanswered players as wrong
      const ps2: Player[] = await getAllPlayers(code);
      for (const p of ps2) {
        if (!p.answeredCurrentQuestion) {
          p.streak = 0;
          if (!p.questionResults) p.questionResults = [];
          p.questionResults.push({
            questionIndex: qi, questionText: q.text,
            correct: false, partial: false, pointsEarned: 0,
            selectedIndices: [], correctIndices: q.correctIndices,
          });
          p.incorrectAnswers = (p.incorrectAnswers || 0) + 1;
          await setPlayer(code, p.id, p);
        }
      }

      // Build updated leaderboard
      const lb = await buildLeaderboard(code);
      const lbMap = new Map(lb.map(e => [e.playerId, e.rank]));

      // Flush all pending results to each player's socket simultaneously
      const pendingRaw = await redis.hgetall(`pending_results:${code}`) || {};
      const io2 = (global as any).__gf_io as Server;
      const ioRef = io2 || io;

      for (const [socketId, resultJson] of Object.entries(pendingRaw)) {
        try {
          const result = JSON.parse(resultJson as string);
          const rank   = lbMap.get(result.playerId) || 0;
          ioRef.to(socketId).emit('answer_result', {
            correct:        result.correct,
            partial:        result.partial,
            correctIndices: result.correctIndices,
            points:         result.points,
            totalScore:     result.totalScore,
            rank,
            questionIndex: qi,
          });
        } catch(_) {}
      }

      // Players who didn't answer get answer_result too (wrong, 0 pts)
      for (const p of ps2) {
        if (!p.answeredCurrentQuestion) {
          ioRef.to(p.socketId).emit('answer_result', {
            correct: false, partial: false,
            correctIndices: q.correctIndices,
            points: 0, totalScore: p.score,
            rank: lbMap.get(p.id) || 0,
            questionIndex: qi,
          });
        }
      }

      await redis.del(`pending_results:${code}`);

      // Emit leaderboard to room
      io.to(code).emit('leaderboard_update', { leaderboard: lb, questionIndex: qi, isIntermediate: true });

      addTimer(code, setTimeout(() => runQuestion(io, code, qi + 1), BETWEEN_MS + LB_DISPLAY_MS));
    }, ANSWER_MS));
  }, Q_PREVIEW_MS));
}

// ─── Handle player answer — store result, don't emit yet ─────────────
export async function handleAnswer(
  io: Server, code: string, playerId: string,
  qi: number, selectedIndices: number[], timeLeft: number
) {
  const quiz   = await getQuiz(code);
  const player = await getPlayer(code, playerId);

  if (!quiz || !player || player.answeredCurrentQuestion || quiz.currentQuestionIndex !== qi) {
    return null; // null = don't emit anything yet
  }

  const q = quiz.questions[qi];
  const { points, correct, partial } = calcScore(selectedIndices, q.correctIndices, q.isMultipleChoice, timeLeft);

  if (!player.questionResults) player.questionResults = [];
  player.questionResults.push({
    questionIndex: qi, questionText: q.text,
    correct, partial, pointsEarned: points,
    selectedIndices, correctIndices: q.correctIndices,
  });

  if (correct) {
    player.score += points; player.correctAnswers += 1;
    player.streak += 1; player.maxStreak = Math.max(player.maxStreak, player.streak);
    player.answerTimes.push(timeLeft);
  } else if (partial) {
    player.score += points; player.partialAnswers = (player.partialAnswers || 0) + 1;
    player.streak = 0; player.answerTimes.push(timeLeft);
  } else {
    player.streak = 0; player.incorrectAnswers = (player.incorrectAnswers || 0) + 1;
  }

  player.answeredCurrentQuestion = true;
  await setPlayer(code, playerId, player);
  await updateScore(code, playerId, player.score);
  await recordAnswer(code, qi, playerId, selectedIndices.join(','), timeLeft);

  // Store the result — will be flushed when timer expires
  const pendingKey = `pending_results:${code}`;
  await redis.hset(pendingKey, player.socketId, JSON.stringify({
    playerId, correct, partial,
    correctIndices: q.correctIndices,
    points, totalScore: player.score,
  }));
  await redis.expire(pendingKey, 300);

  // Return result so socketHandler can confirm receipt (without emitting to client)
  return { correct, partial, correctIndices: q.correctIndices, points, totalScore: player.score };
}

// Store io reference globally so runQuestion can access it
export function setIoRef(io: Server) {
  (global as any).__gf_io = io;
}

async function endQuiz(io: Server, code: string) {
  const quiz = await getQuiz(code);
  if (!quiz) return;
  quiz.status = 'ended';
  await setQuiz(code, quiz);
  const lb   = await buildLeaderboard(code);
  const achs = await computeAchievements(code);
  io.to(code).emit('quiz_ended', { leaderboard: lb, achievements: achs });
  clearTimers(code);
}

export { clearTimers };