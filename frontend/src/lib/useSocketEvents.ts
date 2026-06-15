'use client';
import { useEffect, useRef } from 'react';
import { getSocket, saveSession, clearSession } from '@/lib/socket';
import { useGameStore } from '@/store/gameStore';
import { playSound } from '@/lib/sounds';

export function useSocketEvents() {
  const store = useGameStore();
  const ref   = useRef(store);
  ref.current = store;

  useEffect(() => {
    const sk = getSocket();

    // Restore logic — runs whenever we (re)connect. Defined as a function so
    // it can be called both from the 'connect' event AND immediately below
    // if the socket already connected before this effect attached its
    // listeners (socket.ts connects on module import, so on a page refresh
    // the 'connect' event often fires before useSocketEvents mounts).
    const tryRestore = () => {
      if (typeof window === 'undefined') return;
      const stored = localStorage.getItem('gf_session');
      if (!stored) return;
      try {
        const sess = JSON.parse(stored);
        if (sess.role === 'player' && sess.playerId && sess.code) {
          sk.emit('player_restore', { code: sess.code, playerId: sess.playerId }, (res: any) => {
            if (!res || !res.success) {
              // Session no longer valid — go back to landing
              clearSession();
              ref.current.reset();
              return;
            }
            applyRestoreState(ref.current, res);
          });
        }
      } catch (_) {}
    };

    // Socket may have already connected before this effect ran. Sync state
    // immediately to avoid a false "Reconnecting to server…" banner, and run
    // the restore now since the 'connect' event below may never fire again.
    if (sk.connected) {
      ref.current.setConnected(true);
      tryRestore();
    }

    sk.on('connect', () => {
      ref.current.setConnected(true);
      tryRestore();
    });

    sk.on('disconnect', () => ref.current.setConnected(false));

    sk.on('player_joined', (d: any) => ref.current.setPlayerCount(d.playerCount));
    sk.on('lobby_update',  (d: any) => ref.current.setPlayerCount(d.playerCount));

    sk.on('quiz_started', () => {
      // Lobby -> first question is about to arrive via new_question
    });

    sk.on('new_question', (d: any) => {
      // 1. Clear previous question immediately — prevents flash
      ref.current.clearQuestion();
      ref.current.setCurrentOptions([], false);
      ref.current.setSelectedIndices([]);

      const duration = typeof d.answerDuration === 'number' ? d.answerDuration : 15;
      ref.current.setAnswerDuration(duration);

      // 2. Set new question on next tick
      setTimeout(() => {
        ref.current.setCurrentQuestion({
          questionIndex:    d.questionIndex,
          totalQuestions:   d.totalQuestions,
          text:             d.text,
          imageBase64:      d.imageBase64 || null,
          isMultipleChoice: d.isMultipleChoice || false,
          phase:            'question_only',
          duration:         d.duration,
        });
        ref.current.setTimeLeft(duration);
        ref.current.setPhase('question_only');
      }, 30);
    });

    sk.on('show_options', (d: any) => {
      const duration = typeof d.answerDuration === 'number' ? d.answerDuration : 15;
      ref.current.setAnswerDuration(duration);
      ref.current.setCurrentOptions(d.options, d.isMultipleChoice || false);
      ref.current.setTimeLeft(duration);
      ref.current.setPhase('question_options');
    });

    sk.on('timer_update', (d: any) => {
      ref.current.setTimeLeft(d.timeLeft);
      // Countdown sound only in the final 5 seconds
      if (d.timeLeft <= 5 && d.timeLeft > 0) playSound('countdown');
    });

    sk.on('answer_result', (d: any) => {
      ref.current.setAnswerResult(d);
      ref.current.setMyScore(d.totalScore);
      ref.current.setMyRank(d.rank);
      ref.current.setPhase('answer_feedback');
      playSound(d.correct || d.partial ? 'correct' : 'wrong');
    });

    sk.on('correct_answer_reveal', (d: any) => {
      ref.current.setRevealCorrectIndices(d.correctIndices || []);
      ref.current.setPhase('correct_answer');
    });

    sk.on('leaderboard_update', (d: any) => {
      ref.current.setLeaderboard(d.leaderboard);
      const me = d.leaderboard.find((e: any) => e.playerId === ref.current.playerId);
      if (me) ref.current.setMyRank(me.rank);
      if (d.isIntermediate) ref.current.setPhase('intermediate_leaderboard');
    });

    sk.on('quiz_ended', (d: any) => {
      ref.current.setLeaderboard(d.leaderboard);
      ref.current.setAchievements(d.achievements);
      const me = d.leaderboard.find((e: any) => e.playerId === ref.current.playerId);
      if (me) ref.current.setMyRank(me.rank);
      ref.current.setPhase('achievements');
      playSound('achievement');
      clearSession();
    });

    return () => {
      ['connect','disconnect','player_joined','lobby_update','quiz_started','new_question',
       'show_options','timer_update','answer_result','correct_answer_reveal',
       'leaderboard_update','quiz_ended']
        .forEach(e => sk.off(e));
    };
  }, []);
}

// ─── Apply a player_restore payload to the store ─────────────────────────────
// Rebuilds the entire UI state to match the server's authoritative view of
// the quiz — used after a page refresh or socket reconnect.
function applyRestoreState(store: ReturnType<typeof useGameStore.getState>, res: any) {
  store.setPlayerCount(res.playerCount ?? 0);
  if (typeof res.myScore === 'number') store.setMyScore(res.myScore);

  if (typeof res.quizDescription === 'string') {
    store.setQuizDescription(res.quizDescription);
  }

  if (res.quizStatus === 'waiting') {
    store.setPhase('lobby');
    return;
  }

  if (res.quizStatus === 'ended') {
    if (res.leaderboard)   store.setLeaderboard(res.leaderboard);
    if (res.achievements)  store.setAchievements(res.achievements);
    if (typeof res.myRank === 'number') store.setMyRank(res.myRank);
    store.setPhase('achievements');
    return;
  }

  // active quiz — rebuild current question + phase
  if (typeof res.answerDuration === 'number') {
    store.setAnswerDuration(res.answerDuration);
  }

  if (res.questionIndex !== undefined) {
    store.setCurrentQuestion({
      questionIndex:    res.questionIndex,
      totalQuestions:   res.totalQuestions,
      text:             res.text,
      imageBase64:      res.imageBase64 || null,
      isMultipleChoice: res.isMultipleChoice || false,
      phase:            res.phase === 'question_only' ? 'question_only' : 'options',
      duration:         0,
    });
  }

  if (res.options) {
    store.setCurrentOptions(res.options, res.isMultipleChoice || false);
  }

  if (typeof res.timeLeft === 'number') {
    store.setTimeLeft(res.timeLeft);
  }

  if (typeof res.hasAnswered === 'boolean') {
    store.setHasAnswered(res.hasAnswered);
  }

  if (res.answerResult) {
    store.setAnswerResult(res.answerResult);
    if (typeof res.answerResult.rank === 'number') store.setMyRank(res.answerResult.rank);
  }

  if (res.correctIndices) {
    store.setRevealCorrectIndices(res.correctIndices);
  }

  if (res.leaderboard) {
    store.setLeaderboard(res.leaderboard);
    if (typeof res.myRank === 'number') store.setMyRank(res.myRank);
  }

  // Finally, set the phase — must happen after the above so the right
  // screen renders with the right data already in place
  if (res.phase) {
    store.setPhase(res.phase);
  }
}