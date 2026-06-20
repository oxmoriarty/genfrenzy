import { Server } from 'socket.io';
import {
  getQuiz, setQuiz, getAllPlayers, getPlayer, setPlayer, setPlayersBatch,
  updateScore, getLeaderboard, recordAnswer, redis,
} from './redisClient';
import { Player, Quiz, QuestionResult } from './types';

const LOBBY_COUNTDOWN_MS   = 5000;  // 5s countdown shown in the lobby after admin starts the quiz
const Q_PREVIEW_DEFAULT_MS = 5000;  // default question-only phase (used when answerDuration >= 7s)
const Q_PREVIEW_MIN_MS     = 7000;  // minimum question-only phase when answerDuration < 7s
const TIMER_DELAY          = 1000;  // 1s head-start before the answer countdown begins
const REVEAL_MS            = 3000;  // 3s showing correct answer(s) before leaderboard
const LB_DISPLAY_MS        = 4000;  // 4s leaderboard between rounds
const RESULT_SHOW          = 3000;  // 3s for players to see answer_result before reveal

// Determine the question-only preview duration based on the configured
// answer duration: if the answer window is short (<7s), give players more
// time to read the question before the rush of options begins.
function getQPreviewMs(answerDurationSec: number): number {
  return answerDurationSec < 7 ? Q_PREVIEW_MIN_MS : Q_PREVIEW_DEFAULT_MS;
}

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

// Helper to update the quiz's current phase + timestamp (used for reconnect restore)
async function setPhase(code: string, phase: Quiz['currentPhase']) {
  const quiz: Quiz = await getQuiz(code);
  if (!quiz) return;
  quiz.currentPhase   = phase;
  quiz.phaseStartedAt = Date.now();
  await setQuiz(code, quiz);
}

// ─── Leaderboard builder ─────────────────────────────────────────────────────
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

// ─── Scoring — uses the quiz's configured answer duration ────────────────────
// Multi-choice: as long as the player picks AT LEAST ONE correct option,
// they earn points proportional to (correct picks / total correct options),
// regardless of any wrong options also selected. More correct picks = more
// points. Time-based multiplier always applies (timeLeft / answerDuration).
function calcScore(
  selected: number[], correctIndices: number[], isMulti: boolean,
  timeLeft: number, answerDuration: number
): { points: number; correct: boolean; partial: boolean } {
  if (!isMulti) {
    const correct = selected.length === 1 && selected[0] === correctIndices[0];
    return {
      points: correct ? Math.round(1000 * (timeLeft / answerDuration)) : 0,
      correct, partial: false,
    };
  }

  const hits  = selected.filter(s => correctIndices.includes(s)).length;
  const total = correctIndices.length;

  if (hits === 0) {
    return { points: 0, correct: false, partial: false };
  }

  const correct = hits === total;
  const ratio   = hits / total;
  const points  = Math.round(1000 * ratio * (timeLeft / answerDuration));

  return { points, correct, partial: !correct };
}

// ─── Achievements ─────────────────────────────────────────────────────────────
export async function computeAchievements(code: string) {
  const players: Player[] = await getAllPlayers(code);
  if (!players.length) return [];
  const lb      = await buildLeaderboard(code);
  const rankMap = new Map(lb.map(e => [e.playerId, e.rank]));
  const result: any[]  = [];
  const used    = new Set<string>();
  const pick = (sorted: Player[], type: string, label: string, desc: string) => {
    const p = sorted.find(x => !used.has(x.id));
    if (p) { used.add(p.id); result.push({ type, label, description: desc, playerId: p.id, username: p.username }); }
  };
  const avgTime = (p: Player) =>
    p.answerTimes.length ? p.answerTimes.reduce((a, b) => a + b, 0) / p.answerTimes.length : -1;
  pick([...players].sort((a,b) => b.score - a.score),
    'brainiac','Brainiac','Highest total score');
  pick([...players].sort((a,b) => b.correctAnswers!==a.correctAnswers
    ? b.correctAnswers-a.correctAnswers : avgTime(b)-avgTime(a)),
    'sharpshooter','Sharpshooter','Most fully correct answers');
  pick([...players].filter(p=>p.answerTimes.length)
    .sort((a,b)=>avgTime(a)-avgTime(b)||b.score-a.score),
    'speedster','Speedster','Fastest average answer');
  pick([...players].filter(p=>p.maxStreak>=2)
    .sort((a,b)=>b.maxStreak-a.maxStreak||b.score-a.score),
    'streak_king','Streak King','Longest answer streak');
  pick([...players]
    .filter(p=>p.initialRank>0&&(p.initialRank-(rankMap.get(p.id)||p.initialRank))>=2)
    .sort((a,b)=>{
      const ja=a.initialRank-(rankMap.get(a.id)||a.initialRank);
      const jb=b.initialRank-(rankMap.get(b.id)||b.initialRank);
      return jb-ja||(rankMap.get(a.id)||999)-(rankMap.get(b.id)||999);
    }), 'comeback_fren','Comeback Fren','Biggest rank jump');
  return result;
}

// ─── Start engine ─────────────────────────────────────────────────────────────
export async function startQuizEngine(io: Server, code: string) {
  const quiz: Quiz = await getQuiz(code);
  if (!quiz) return;
  clearTimers(code);

  // Snapshot initial ranks BEFORE the countdown so "Comeback Fren" etc. are
  // computed from the pre-quiz standing, exactly as before. Uses a Map for
  // O(1) lookups instead of Array.find() inside the loop (an O(n) scan
  // repeated per entry — O(n^2) total, which at 500 players is 250,000
  // comparisons) and batches the writes into a single Redis round-trip.
  const initial   = await getAllPlayers(code);
  const initialMap = new Map<string, Player>(initial.map((p: Player) => [p.id, p]));
  const initLb    = await buildLeaderboard(code);
  const rankedPlayers: Player[] = [];
  for (const entry of initLb) {
    const p = initialMap.get(entry.playerId);
    if (p) { p.initialRank = entry.rank; rankedPlayers.push(p); }
  }
  await setPlayersBatch(code, rankedPlayers.map(p => ({ id: p.id, data: p })));

  // Phase: counting_down — players see a 5s countdown in the lobby before
  // the first question appears. Status + timestamp are persisted so a
  // player who refreshes/reconnects during this window resumes the correct
  // remaining countdown instead of being dropped back to a plain "waiting"
  // lobby or breaking on an undefined current question.
  quiz.status             = 'counting_down';
  quiz.countdownStartedAt = Date.now();
  await setQuiz(code, quiz);

  io.to(code).emit('quiz_countdown', { duration: LOBBY_COUNTDOWN_MS });

  addTimer(code, setTimeout(async () => {
    const q: Quiz = await getQuiz(code);
    if (!q || q.status !== 'counting_down') return; // guard: quiz may have been reset/ended in the meantime
    q.status = 'active';
    q.currentQuestionIndex = 0;
    await setQuiz(code, q);
    runQuestion(io, code, 0);
  }, LOBBY_COUNTDOWN_MS));
}

async function runQuestion(io: Server, code: string, qi: number) {
  const quiz: Quiz = await getQuiz(code);
  if (!quiz || quiz.status !== 'active') return;
  if (qi >= quiz.questions.length) { endQuiz(io, code); return; }

  quiz.currentQuestionIndex = qi;
  await setQuiz(code, quiz);

  // Reset answered flag for all players — batched into a single Redis
  // round-trip via pipelining instead of one sequential write per player.
  // With 500 players this turns ~500 sequential round-trips (which could
  // take several seconds and stall the start of every question) into one.
  const players: Player[] = await getAllPlayers(code);
  for (const p of players) {
    p.answeredCurrentQuestion = false;
  }
  await setPlayersBatch(code, players.map(p => ({ id: p.id, data: p })));

  // Clear pending results from previous round
  await redis.del(`pending_results:${code}`);

  const q = quiz.questions[qi];

  // Per-question answer duration (seconds), configured by the admin at quiz
  // creation. Falls back to 15s for any legacy/older quiz data.
  const answerDuration = q.timeLimit && q.timeLimit > 0 ? q.timeLimit : 15;
  const answerMs       = answerDuration * 1000;
  const qPreviewMs     = getQPreviewMs(answerDuration);

  // Phase 1: Question only
  await setPhase(code, 'question_only');
  io.to(code).emit('new_question', {
    questionIndex: qi, totalQuestions: quiz.questions.length,
    text: q.text, imageBase64: q.imageBase64 || null,
    isMultipleChoice: q.isMultipleChoice,
    phase: 'question_only', duration: qPreviewMs,
    answerDuration,
  });

  addTimer(code, setTimeout(async () => {

    // Phase 2: Show options — emit before timer starts so clients render options first
    await setPhase(code, 'question_options');
    io.to(code).emit('show_options', {
      questionIndex: qi, options: q.options,
      isMultipleChoice: q.isMultipleChoice, duration: answerMs,
      answerDuration,
    });

    // Immediately show the full duration (e.g. "25") the moment options
    // appear — before the countdown begins.
    io.to(code).emit('timer_update', { timeLeft: answerDuration, questionIndex: qi });

    // 1-second pause so players see the starting number before it moves.
    await new Promise(r => setTimeout(r, TIMER_DELAY));

    // Countdown: 24, 23, 22 ... 1, 0
    let tl = answerDuration;
    const tick = setInterval(() => {
      tl = Math.max(0, tl - 1);
      io.to(code).emit('timer_update', { timeLeft: tl, questionIndex: qi });
    }, 1000);
    addTimer(code, tick);

    // When timer expires
    addTimer(code, setTimeout(async () => {
      clearInterval(tick);

      // Collect all players, mark unanswered as wrong — batched write
      // instead of one sequential round-trip per unanswered player. This
      // loop runs after every single question, so at 500 players (with
      // potentially hundreds not answering some rounds) the unbatched
      // version could add multiple seconds of delay before results,
      // reveal, and leaderboard could even begin for anyone.
      const ps2: Player[] = await getAllPlayers(code);
      const toUpdate: Player[] = [];
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
          toUpdate.push(p);
        }
      }
      await setPlayersBatch(code, toUpdate.map(p => ({ id: p.id, data: p })));

      // Build leaderboard
      const lb    = await buildLeaderboard(code);
      const lbMap = new Map(lb.map(e => [e.playerId, e.rank]));
      const ioRef = ((global as any).__gf_io as Server) || io;

      // Phase 3: answer_feedback — flush results to everyone simultaneously
      await setPhase(code, 'answer_feedback');

      const pendingRaw = await redis.hgetall(`pending_results:${code}`) || {};

      for (const [socketId, resultJson] of Object.entries(pendingRaw)) {
        try {
          const result = JSON.parse(resultJson as string);
          const rank   = lbMap.get(result.playerId) || 0;
          ioRef.to(socketId).emit('answer_result', {
            correct: result.correct, partial: result.partial,
            correctIndices: result.correctIndices,
            points: result.points, totalScore: result.totalScore,
            rank, questionIndex: qi,
          });
        } catch(_) {}
      }

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

      // Phase 4: After RESULT_SHOW ms, reveal the correct answer(s) to everyone
      addTimer(code, setTimeout(async () => {
        await setPhase(code, 'correct_answer');
        io.to(code).emit('correct_answer_reveal', {
          questionIndex: qi,
          correctIndices: q.correctIndices,
          options: q.options,
          isMultipleChoice: q.isMultipleChoice,
        });

        // Phase 5: After REVEAL_MS, send leaderboard to room
        addTimer(code, setTimeout(async () => {
          await setPhase(code, 'intermediate_leaderboard');
          io.to(code).emit('leaderboard_update', {
            leaderboard: lb, questionIndex: qi, isIntermediate: true,
          });

          // After LB_DISPLAY_MS, advance to next question
          addTimer(code, setTimeout(() => runQuestion(io, code, qi + 1), LB_DISPLAY_MS));
        }, REVEAL_MS));
      }, RESULT_SHOW));

    }, answerMs));

  }, qPreviewMs));
}

// ─── Handle player answer — stored, not emitted yet ──────────────────────────
export async function handleAnswer(
  io: Server, code: string, playerId: string,
  qi: number, selectedIndices: number[], timeLeft: number
) {
  const quiz   = await getQuiz(code);
  const player = await getPlayer(code, playerId);
  if (!quiz || !player || player.answeredCurrentQuestion || quiz.currentQuestionIndex !== qi) {
    return null;
  }

  const q = quiz.questions[qi];
  const answerDuration = q.timeLimit && q.timeLimit > 0 ? q.timeLimit : 15;
  const { points, correct, partial } = calcScore(
    selectedIndices, q.correctIndices, q.isMultipleChoice, timeLeft, answerDuration
  );

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

  // Store for synchronized flush at timer expiry
  await redis.hset(`pending_results:${code}`, player.socketId, JSON.stringify({
    playerId, correct, partial,
    correctIndices: q.correctIndices,
    points, totalScore: player.score,
  }));
  await redis.expire(`pending_results:${code}`, 300);

  return { correct, partial, correctIndices: q.correctIndices, points, totalScore: player.score };
}

export function setIoRef(io: Server) {
  (global as any).__gf_io = io;
}

async function endQuiz(io: Server, code: string) {
  const quiz = await getQuiz(code);
  if (!quiz) return;
  quiz.status  = 'ended';
  quiz.endedAt = Date.now();
  await setQuiz(code, quiz);
  const lb   = await buildLeaderboard(code);
  const achs = await computeAchievements(code);
  io.to(code).emit('quiz_ended', { leaderboard: lb, achievements: achs });
  clearTimers(code);
}

// ─── Restore state — used when a player reconnects/refreshes mid-quiz ────────
// Computes everything the frontend needs to rebuild its UI: current question,
// phase, remaining time, the player's result for the current question (if
// already revealed), correct answers (if in reveal phase), and the
// leaderboard (if in leaderboard phase).
export async function getRestoreState(code: string, playerId: string) {
  const quiz: Quiz = await getQuiz(code);
  if (!quiz) return { quizStatus: 'stale' as const };
  const player = await getPlayer(code, playerId);
  const all    = await getAllPlayers(code);

  if (quiz.status === 'waiting') {
    return {
      quizStatus: 'waiting' as const,
      quizTheme: quiz.theme,
      quizDescription: quiz.description || '',
      playerCount: all.length,
      myScore: player?.score ?? 0,
    };
  }

  if (quiz.status === 'counting_down') {
    // Compute remaining countdown so a refresh mid-countdown resumes at the
    // correct number instead of restarting a fresh 5s — keeps the countdown
    // perfectly in sync across every connected player regardless of when
    // they reconnect during this window.
    const startedAt   = quiz.countdownStartedAt || Date.now();
    const elapsed      = Date.now() - startedAt;
    const remainingMs  = Math.max(0, LOBBY_COUNTDOWN_MS - elapsed);
    return {
      quizStatus: 'counting_down' as const,
      quizTheme: quiz.theme,
      quizDescription: quiz.description || '',
      playerCount: all.length,
      myScore: player?.score ?? 0,
      countdownRemainingMs: remainingMs,
    };
  }

  if (quiz.status === 'ended') {
    // Grace period: a player who returns shortly after the quiz ends should
    // still see the final leaderboard (per spec — "if they got back a few
    // seconds after the quiz ends"). Beyond that window, treat the session
    // as stale so old results don't haunt future visits indefinitely.
    const GRACE_MS = 10 * 60 * 1000; // 10 minutes
    const endedAt  = quiz.endedAt || 0;
    const withinGrace = endedAt > 0 && (Date.now() - endedAt) < GRACE_MS;

    if (!withinGrace) {
      return { quizStatus: 'stale' as const };
    }

    const lb   = await buildLeaderboard(code);
    const achs = await computeAchievements(code);
    const me   = lb.find(e => e.playerId === playerId);
    return {
      quizStatus: 'ended' as const,
      quizTheme: quiz.theme,
      playerCount: all.length,
      myScore: player?.score ?? 0,
      myRank: me?.rank ?? 0,
      leaderboard: lb,
      achievements: achs,
    };
  }

  // ── active ──
  const qi    = quiz.currentQuestionIndex;
  const q     = quiz.questions[qi];
  const phase = quiz.currentPhase || 'question_only';
  const started = quiz.phaseStartedAt || Date.now();
  const elapsed  = Date.now() - started;

  const baseAnswerDuration = q.timeLimit && q.timeLimit > 0 ? q.timeLimit : 15;
  const base = {
    quizStatus: 'active' as const,
    quizTheme: quiz.theme,
    quizDescription: quiz.description || '',
    playerCount: all.length,
    myScore: player?.score ?? 0,
    questionIndex: qi,
    totalQuestions: quiz.questions.length,
    text: q.text,
    imageBase64: q.imageBase64 || null,
    isMultipleChoice: q.isMultipleChoice,
    phase,
    answerDuration: baseAnswerDuration,
  };

  if (phase === 'question_only') {
    return base;
  }

  if (phase === 'question_options') {
    const answerDuration = q.timeLimit && q.timeLimit > 0 ? q.timeLimit : 15;
    const totalMs     = (answerDuration * 1000) + TIMER_DELAY;
    const remainingMs = Math.max(0, totalMs - elapsed);
    const timeLeft    = Math.min(answerDuration, Math.ceil(remainingMs / 1000));
    return {
      ...base,
      options: q.options,
      timeLeft,
      answerDuration,
      hasAnswered: player?.answeredCurrentQuestion ?? false,
    };
  }

  if (phase === 'answer_feedback' || phase === 'correct_answer') {
    const result = player?.questionResults?.find((r: QuestionResult) => r.questionIndex === qi);
    const lb  = await buildLeaderboard(code);
    const me  = lb.find(e => e.playerId === playerId);
    return {
      ...base,
      options: q.options,
      correctIndices: q.correctIndices,
      answerResult: result ? {
        correct: result.correct,
        partial: result.partial,
        correctIndices: result.correctIndices,
        points: result.pointsEarned,
        totalScore: player?.score ?? 0,
        rank: me?.rank ?? 0,
        questionIndex: qi,
      } : null,
    };
  }

  if (phase === 'intermediate_leaderboard') {
    const lb = await buildLeaderboard(code);
    const me = lb.find(e => e.playerId === playerId);
    return {
      ...base,
      leaderboard: lb,
      myRank: me?.rank ?? 0,
    };
  }

  return base;
}

export { clearTimers };