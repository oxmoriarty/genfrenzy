import { Server, Socket } from 'socket.io';
import { v4 as uuid } from 'uuid';
import {
  getQuiz, setQuiz, getPlayer, setPlayer, getAllPlayers,
  setSession, getSession, deleteSession, updateScore,
} from '../redisClient';
import { startQuizEngine, handleAnswer, buildLeaderboard, setIoRef, getRestoreState } from '../quizEngine';
import { Player, Quiz } from '../types';

const PWD = process.env.ADMIN_PASSWORD || 'Genlayerfrenzy26';
function genCode() { return Math.random().toString(36).substring(2, 8).toUpperCase(); }

export function register(io: Server, socket: Socket) {
  setIoRef(io);

  // NOTE: There is intentionally NO handshake-level auto-restore here.
  // A single, explicit, callback-driven restore path (`player_restore` /
  // `admin_rejoin`, both invoked by the client after connecting) is used
  // instead. Having two independent restore mechanisms (the old
  // fire-and-forget handshake restore + the explicit emit) raced against
  // each other and only one of them ever updated the client's UI state —
  // that was the root cause of players appearing "stuck" after a reconnect.

  // ── Admin: verify password ─────────────────────────────────────────────────
  socket.on('admin_verify', (data: any, cb: Function) => {
    if (data.password === PWD) cb({ success: true });
    else cb({ success: false, error: 'Invalid password' });
  });

  // ── Admin: create quiz ─────────────────────────────────────────────────────
  socket.on('admin_create_quiz', async (data: any, cb: Function) => {
    if (data.password !== PWD) return cb({ success: false, error: 'Invalid password' });
    const code = genCode();

    let answerDuration = Number(data.answerDuration);
    if (!Number.isFinite(answerDuration) || answerDuration <= 0) answerDuration = 15;
    answerDuration = Math.max(5, Math.min(60, Math.round(answerDuration)));

    let previewDuration = Number(data.previewDuration);
    if (!Number.isFinite(previewDuration) || previewDuration <= 0) previewDuration = 0; // 0 = use auto-computed default
    if (previewDuration > 0) previewDuration = Math.max(2, Math.min(30, Math.round(previewDuration)));

    const quiz: Quiz = {
      id: uuid(), code, theme: data.theme,
      description: (data.description || '').trim().slice(0, 300),
      questions: data.questions.map((q: any) => ({
        id: uuid(),
        text: q.text || '',
        imageBase64: q.imageBase64 || null,
        options: q.options,
        correctIndices: Array.isArray(q.correctIndices) ? q.correctIndices : [q.correctIndex ?? 0],
        isMultipleChoice: Array.isArray(q.correctIndices) ? q.correctIndices.length > 1 : false,
        timeLimit: answerDuration,
        previewDuration: previewDuration > 0 ? previewDuration : undefined,
      })),
      adminSocketId: socket.id,
      status: 'waiting',
      currentQuestionIndex: 0,
      createdAt: Date.now(),
    };
    await setQuiz(code, quiz);
    socket.join(code);
    socket.join(`admin:${code}`);
    await setSession(socket.id, { role: 'admin', code });
    cb({ success: true, code });
  });

  // ── Admin: start quiz ──────────────────────────────────────────────────────
  socket.on('admin_start_quiz', async (data: any, cb: Function) => {
    if (data.password !== PWD) return cb({ success: false, error: 'Invalid password' });
    const quiz: Quiz = await getQuiz(data.code);
    if (!quiz)                    return cb({ success: false, error: 'Quiz not found' });
    if (quiz.status !== 'waiting') return cb({ success: false, error: 'Already started' });
    io.to(data.code).emit('quiz_started', { theme: quiz.theme, totalQuestions: quiz.questions.length });
    await startQuizEngine(io, data.code);
    cb({ success: true });
  });

  // ── Admin: dashboard data ──────────────────────────────────────────────────
  socket.on('admin_get_dashboard', async (data: any, cb: Function) => {
    const quiz: Quiz = await getQuiz(data.code);
    if (!quiz) return cb({ success: false, error: 'Not found' });
    const players: Player[] = await getAllPlayers(data.code);
    const lb = await buildLeaderboard(data.code);
    cb({
      success: true,
      quiz: {
        theme: quiz.theme, status: quiz.status,
        currentQuestionIndex: quiz.currentQuestionIndex,
        totalQuestions: quiz.questions.length, code: quiz.code,
      },
      players: players.map(p => ({
        id: p.id, username: p.username, score: p.score,
        correctAnswers: p.correctAnswers,
        partialAnswers: p.partialAnswers || 0,
        incorrectAnswers: p.incorrectAnswers || 0,
        questionResults: p.questionResults || [],
      })),
      leaderboard: lb,
    });
  });

  // ── Admin: rejoin dashboard after reconnect/refresh ────────────────────────
  socket.on('admin_rejoin', async (data: any, cb: Function) => {
    if (data.password !== PWD) return cb({ success: false, error: 'Invalid password' });
    const code = data.code;
    const quiz: Quiz = await getQuiz(code);
    if (!quiz) return cb({ success: false, error: 'Quiz not found' });
    socket.join(code);
    socket.join(`admin:${code}`);
    await setSession(socket.id, { role: 'admin', code });
    cb({ success: true, status: quiz.status });
  });

  // ── Admin: export data ─────────────────────────────────────────────────────
  socket.on('admin_export_data', async (data: any, cb: Function) => {
    if (data.password !== PWD) return cb({ success: false, error: 'Invalid password' });
    const quiz: Quiz = await getQuiz(data.code);
    if (!quiz) return cb({ success: false, error: 'Quiz not found' });
    const players: Player[] = await getAllPlayers(data.code);
    const lb = await buildLeaderboard(data.code);
    const rankMap = new Map(lb.map(e => [e.playerId, e.rank]));
    const exportData = players.map(p => ({
      rank: rankMap.get(p.id) || 0,
      username: p.username, totalScore: p.score,
      correctAnswers: p.correctAnswers,
      partialAnswers: p.partialAnswers || 0,
      incorrectAnswers: p.incorrectAnswers || 0,
      maxStreak: p.maxStreak,
      questionResults: p.questionResults || [],
    })).sort((a, b) => a.rank - b.rank);
    cb({
      success: true, exportData,
      questions: quiz.questions.map((q, i) => ({
        index: i, text: q.text || `Question ${i + 1}`,
        isMultipleChoice: q.isMultipleChoice,
        correctIndices: q.correctIndices, options: q.options,
      })),
      theme: quiz.theme,
    });
  });

  // ── Player: join quiz ──────────────────────────────────────────────────────
  // Handles three cases: brand-new join, rejoin-while-waiting (e.g. typed the
  // same code+username again), and reconnect-mid-quiz (data.playerId present
  // and matches an existing player record).
  socket.on('join_quiz', async (data: any, cb: Function) => {
    const code     = data.code?.toUpperCase().trim();
    const username = data.username?.trim().slice(0, 20);
    if (!code || !username) return cb({ success: false, error: 'Code and username required' });

    const quiz: Quiz = await getQuiz(code);
    if (!quiz) return cb({ success: false, error: 'Quiz not found. Check your code.' });

    if (quiz.status === 'ended') {
      return cb({ success: false, error: 'This quiz has already ended.', quizStatus: 'ended' });
    }

    // Reconnect attempt: client already has a playerId from a previous join
    if (data.playerId) {
      const existing = await getPlayer(code, data.playerId);
      if (existing) {
        existing.socketId = socket.id;
        await setPlayer(code, existing.id, existing);
        await setSession(socket.id, { role: 'player', code, playerId: existing.id, username: existing.username });
        socket.join(code);
        const all   = await getAllPlayers(code);
        const count = all.length;
        cb({
          success: true, quizTheme: quiz.theme, quizDescription: quiz.description || '',
          playerCount: count, playerId: existing.id, reconnected: true,
        });
        return;
      }
      // playerId was provided but doesn't exist anymore (expired/invalid) —
      // fall through and treat as a brand-new join below.
    }

    if (quiz.status === 'active' || quiz.status === 'counting_down') {
      // Late join: quiz is already running. Create the player record and
      // immediately send them the current quiz state so they can participate
      // from the current question onwards. Their score starts at 0.
      //
      // Design decisions:
      //  - No room broadcast: the lobby phase is over; existing players don't
      //    need to know someone just joined mid-quiz. This keeps zero impact
      //    on existing players.
      //  - No lobby_update: the lobby UI isn't showing for anyone anymore.
      //  - Admin dashboard is already polling every 5s; no need for a push
      //    broadcast just for the admin counter.
      //  - answeredCurrentQuestion starts false (correct default — they
      //    haven't answered the current question because they just arrived).
      //  - joinedAt/joinedQuestionIndex recorded so CSV export can show
      //    which questions they participated in.
      const playerId = uuid();
      const joinedQi = quiz.currentQuestionIndex ?? 0;
      const player: Player = {
        id: playerId, socketId: socket.id, username, quizCode: code,
        score: 0, correctAnswers: 0, partialAnswers: 0, incorrectAnswers: 0,
        streak: 0, maxStreak: 0, answerTimes: [],
        initialRank: 0, answeredCurrentQuestion: false, questionResults: [],
        joinedQuestionIndex: joinedQi,
      };
      await setPlayer(code, playerId, player);
      await updateScore(code, playerId, 0);
      await setSession(socket.id, { role: 'player', code, playerId, username });
      socket.join(code);

      // Get current quiz state to synchronize the late joiner immediately.
      // getRestoreState already handles every phase (question_only,
      // question_options with remaining timer, answer_feedback, etc.) and
      // is the same path used by reconnecting players — reusing it here
      // avoids duplicating any state-reconstruction logic.
      const state = await getRestoreState(code, playerId);
      const all   = await getAllPlayers(code);

      cb({
        success: true,
        quizTheme: quiz.theme,
        quizDescription: quiz.description || '',
        playerCount: all.length,
        playerId,
        lateJoin: true,
        currentState: state,
      });
      return;
    }

    // Brand-new player joining a quiz that's still in the waiting lobby
    const playerId = uuid();
    const player: Player = {
      id: playerId, socketId: socket.id, username, quizCode: code,
      score: 0, correctAnswers: 0, partialAnswers: 0, incorrectAnswers: 0,
      streak: 0, maxStreak: 0, answerTimes: [],
      initialRank: 0, answeredCurrentQuestion: false, questionResults: [],
    };
    await setPlayer(code, playerId, player);
    await updateScore(code, playerId, 0);
    await setSession(socket.id, { role: 'player', code, playerId, username });
    socket.join(code);

    const all   = await getAllPlayers(code);
    const count = all.length;
    socket.to(code).emit('player_joined', { username, playerCount: count });
    io.to(`admin:${code}`).emit('player_joined', {
      username, playerCount: count,
      players: all.map((p: Player) => ({ id: p.id, username: p.username, score: p.score })),
    });
    io.to(code).emit('lobby_update', { playerCount: count });
    cb({ success: true, quizTheme: quiz.theme, quizDescription: quiz.description || '', playerCount: count, playerId });
  });

  // ── Player: restore session after reconnect / page refresh ─────────────────
  // This is the SINGLE source of truth for resuming a player's session. The
  // client calls this on every socket connect (including the very first
  // connect on a fresh page load) whenever it has a stored playerId+code.
  socket.on('player_restore', async (data: any, cb: Function) => {
    const { code, playerId } = data;
    if (!code || !playerId) return cb({ success: false });

    const quiz = await getQuiz(code);
    if (!quiz) {
      // Quiz record gone entirely (TTL'd out / never existed) — definitively
      // stale, client should clear everything and show landing.
      return cb({ success: false, quizStatus: 'stale' });
    }

    const player = await getPlayer(code, playerId);
    if (!player) {
      // Quiz still exists but this player's record is gone (TTL'd out from
      // a long absence, or admin reset). Also stale for this player.
      return cb({ success: false, quizStatus: 'stale' });
    }

    // Keep the player's socketId in sync so server-initiated emits
    // (answer_result, timer_update, etc.) always reach the live connection.
    player.socketId = socket.id;
    await setPlayer(code, playerId, player);
    await setSession(socket.id, { role: 'player', code, playerId, username: player.username });
    socket.join(code);

    const state = await getRestoreState(code, playerId);
    if (!state || (state as any).quizStatus === 'stale') {
      return cb({ success: false, quizStatus: 'stale' });
    }

    cb({ success: true, ...state });
  });

  // ── Player: submit answer ──────────────────────────────────────────────────
  socket.on('submit_answer', async (data: any, cb: Function) => {
    const sess = await getSession(socket.id);
    if (!sess || sess.role !== 'player') return cb({ success: false });
    const selected = Array.isArray(data.selectedIndices)
      ? data.selectedIndices
      : [data.answerIndex];
    await handleAnswer(io, sess.code, sess.playerId, data.questionIndex, selected, data.timeLeft);
    cb({ success: true });
  });

  // ── Disconnect ─────────────────────────────────────────────────────────────
  // A disconnect is NOT necessarily a departure — it's frequently a refresh,
  // a brief network blip, or the browser being backgrounded. We never
  // immediately purge player data here while the quiz is waiting/active;
  // the durable playerSession record (keyed by playerId, not socket.id)
  // simply persists until its TTL naturally expires or the player explicitly
  // leaves. Only the short-lived socketId pointer is cleaned up.
  socket.on('disconnect', async () => {
    const sess = await getSession(socket.id);
    if (!sess) return;

    if (sess.role === 'player') {
      const quiz: Quiz = await getQuiz(sess.code);
      // Only drop the player from the lobby count if the quiz is still in
      // 'waiting' status AND has genuinely been abandoned — but even then,
      // give a short grace window before removing them, since "minimized
      // browser" and "actually left" look identical at the instant of
      // disconnect. We rely on the player rejoining within the quiz/session
      // TTL; we do NOT eagerly call removePlayer() here anymore, since that
      // was indistinguishable from a true departure and caused players who
      // merely backgrounded their browser to vanish from the lobby count.
      if (quiz && quiz.status === 'waiting') {
        const all = await getAllPlayers(sess.code);
        io.to(sess.code).emit('lobby_update', { playerCount: all.length });
      }
    }

    await deleteSession(socket.id);
  });
}
