import { Server, Socket } from 'socket.io';
import { v4 as uuid } from 'uuid';
import {
  getQuiz, setQuiz, getPlayer, setPlayer, getAllPlayers,
  removePlayer, setSession, getSession, deleteSession, updateScore,
} from '../redisClient';
import { startQuizEngine, handleAnswer, buildLeaderboard, setIoRef } from '../quizEngine';
import { Player, Quiz } from '../types';

const PWD = process.env.ADMIN_PASSWORD || 'Genlayerfrenzy26';
function genCode() { return Math.random().toString(36).substring(2, 8).toUpperCase(); }

export function register(io: Server, socket: Socket) {
  setIoRef(io);

  // ── Admin: verify password ──────────────────────────────────────────────
  socket.on('admin_verify', (data: any, cb: Function) => {
    if (data.password === PWD) {
      cb({ success: true });
    } else {
      cb({ success: false, error: 'Invalid password' });
    }
  });


  // ── Admin: create quiz ──────────────────────────────────────────────────
  socket.on('admin_create_quiz', async (data: any, cb: Function) => {
    if (data.password !== PWD) return cb({ success: false, error: 'Invalid password' });
    const code = genCode();
    const quiz: Quiz = {
      id: uuid(), code, theme: data.theme,
      questions: data.questions.map((q: any) => ({
        id:               uuid(),
        text:             q.text || '',
        imageBase64:      q.imageBase64 || null,
        options:          q.options,
        correctIndices:   Array.isArray(q.correctIndices) ? q.correctIndices : [q.correctIndex ?? 0],
        isMultipleChoice: Array.isArray(q.correctIndices) ? q.correctIndices.length > 1 : false,
        timeLimit:        20,
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

  // ── Admin: start quiz ───────────────────────────────────────────────────
  socket.on('admin_start_quiz', async (data: any, cb: Function) => {
    if (data.password !== PWD) return cb({ success: false, error: 'Invalid password' });
    const quiz: Quiz = await getQuiz(data.code);
    if (!quiz)                    return cb({ success: false, error: 'Quiz not found' });
    if (quiz.status !== 'waiting') return cb({ success: false, error: 'Already started' });
    io.to(data.code).emit('quiz_started', { theme: quiz.theme, totalQuestions: quiz.questions.length });
    await startQuizEngine(io, data.code);
    cb({ success: true });
  });

  // ── Admin: dashboard data ───────────────────────────────────────────────
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

  // ── Admin: export data for XLSX (all player details) ───────────────────
  socket.on('admin_export_data', async (data: any, cb: Function) => {
    if (data.password !== PWD) return cb({ success: false, error: 'Invalid password' });
    const quiz: Quiz = await getQuiz(data.code);
    if (!quiz) return cb({ success: false, error: 'Quiz not found' });
    const players: Player[] = await getAllPlayers(data.code);
    const lb = await buildLeaderboard(data.code);
    const rankMap = new Map(lb.map(e => [e.playerId, e.rank]));

    const exportData = players.map(p => ({
      rank:            rankMap.get(p.id) || 0,
      username:        p.username,
      totalScore:      p.score,
      correctAnswers:  p.correctAnswers,
      partialAnswers:  p.partialAnswers || 0,
      incorrectAnswers: p.incorrectAnswers || 0,
      maxStreak:       p.maxStreak,
      questionResults: p.questionResults || [],
    })).sort((a, b) => a.rank - b.rank);

    cb({
      success: true,
      exportData,
      questions: quiz.questions.map((q, i) => ({
        index: i,
        text: q.text || `Question ${i + 1}`,
        isMultipleChoice: q.isMultipleChoice,
        correctIndices: q.correctIndices,
        options: q.options,
      })),
      theme: quiz.theme,
    });
  });

  // ── Player: join ────────────────────────────────────────────────────────
  socket.on('join_quiz', async (data: any, cb: Function) => {
    const code     = data.code?.toUpperCase().trim();
    const username = data.username?.trim().slice(0, 20);
    if (!code || !username) return cb({ success: false, error: 'Code and username required' });

    const quiz: Quiz = await getQuiz(code);
    if (!quiz)                    return cb({ success: false, error: 'Quiz not found. Check your code.' });
    if (quiz.status === 'ended')  return cb({ success: false, error: 'This quiz has already ended.' });
    if (quiz.status === 'active') return cb({ success: false, error: 'Quiz already in progress.' });

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
    cb({ success: true, quizTheme: quiz.theme, playerCount: count, playerId });
  });

  // ── Player: submit answer ────────────────────────────────────────────────
  // Result is stored in Redis and flushed to all players when the timer expires.
  // This ensures every player sees their result at the same time.
  socket.on('submit_answer', async (data: any, cb: Function) => {
    const sess = await getSession(socket.id);
    if (!sess || sess.role !== 'player') return cb({ success: false });
    const selected = Array.isArray(data.selectedIndices)
      ? data.selectedIndices
      : [data.answerIndex]; // backwards compat
    await handleAnswer(io, sess.code, sess.playerId, data.questionIndex, selected, data.timeLeft);
    // Acknowledge receipt only — actual result is sent when timer expires
    cb({ success: true });
  });

  // ── Disconnect ───────────────────────────────────────────────────────────
  socket.on('disconnect', async () => {
    const sess = await getSession(socket.id);
    if (!sess) return;
    if (sess.role === 'player') {
      const quiz: Quiz = await getQuiz(sess.code);
      if (quiz && quiz.status === 'waiting') {
        await removePlayer(sess.code, sess.playerId);
        const all = await getAllPlayers(sess.code);
        io.to(sess.code).emit('lobby_update', { playerCount: all.length });
        io.to(`admin:${sess.code}`).emit('player_left', { username: sess.username, playerCount: all.length });
      }
    }
    await deleteSession(socket.id);
  });
}