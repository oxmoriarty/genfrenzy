'use client';
import { useEffect, useRef } from 'react';
import { getSocket, saveSession, clearSession } from '@/lib/socket';
import { useGameStore } from '@/store/gameStore';
import { playSound } from '@/lib/sounds';
import { applyRestoreState } from '@/lib/restoreState';

export function useSocketEvents() {
  const store = useGameStore();
  const ref   = useRef(store);
  ref.current = store;
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const sk = getSocket();

    // Starts (or restarts) a client-side ticking countdown for the pre-quiz
    // lobby countdown. The server only tells us the total/remaining
    // duration once (on 'quiz_countdown' or via player_restore) — ticking
    // every second locally avoids needing a per-second server broadcast for
    // something this simple, matching how the rest of the app already
    // trusts a server-provided starting value (see the in-question timer).
    const startLobbyCountdown = (totalSeconds: number) => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
      let remaining = Math.max(0, Math.round(totalSeconds));
      ref.current.setLobbyCountdown(remaining);
      if (remaining <= 0) return;
      countdownIntervalRef.current = setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
          ref.current.setLobbyCountdown(0);
          if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
          }
          return;
        }
        ref.current.setLobbyCountdown(remaining);
      }, 1000);
    };

    // ── Session validity check ────────────────────────────────────────────
    // Runs on every connect (including the very first connect on a fresh
    // page load). This is the single authority on whether the locally
    // cached UI state (zustand's persisted `gf_game_state`) is still valid.
    //
    // Three cases:
    //  1. No `gf_session` at all -> nothing to restore. If there's leftover
    //     UI state from a previous, already-ended session (e.g. someone
    //     closed the tab right after a quiz ended, gf_session was cleared,
    //     but gf_game_state still shows the old leaderboard), wipe it so
    //     the landing page renders instead of stale results.
    //  2. `gf_session` exists -> ask the server to restore. If the server
    //     says the session is stale (quiz/player record expired, or the
    //     post-quiz grace period has passed), wipe everything and land on
    //     the landing page. Otherwise, rebuild the UI from the server's
    //     authoritative state.
    const tryRestore = () => {
      if (typeof window === 'undefined') return;
      const stored = localStorage.getItem('gf_session');

      if (!stored) {
        // No active session pointer. Any leftover persisted UI state from
        // a previous completed/abandoned session must not be shown.
        if (ref.current.phase !== 'landing') {
          ref.current.clearAll();
        }
        return;
      }

      try {
        const sess = JSON.parse(stored);
        if (sess.role !== 'player' || !sess.playerId || !sess.code) {
          ref.current.clearAll();
          return;
        }

        sk.emit('player_restore', { code: sess.code, playerId: sess.playerId }, (res: any) => {
          if (!res || !res.success || res.quizStatus === 'stale') {
            // Session is genuinely gone — clear the connection-session
            // pointer AND the cached UI snapshot, then land on the landing
            // page with a clean slate.
            clearSession();
            ref.current.clearAll();
            return;
          }
          applyRestoreState(ref.current, res);
          // If we reconnected mid-countdown, resume ticking from the
          // correct remaining value (applyRestoreState only set the
          // immediate number; it can't reach this hook's interval ref).
          if (res.quizStatus === 'counting_down' && typeof res.countdownRemainingMs === 'number') {
            startLobbyCountdown(res.countdownRemainingMs / 1000);
          }
        });
      } catch (_) {
        clearSession();
        ref.current.clearAll();
      }
    };

    // Socket may have already connected before this effect ran. Sync state
    // immediately to avoid a false "Reconnecting to server…" banner, and run
    // the restore/validity check now since the 'connect' event below may
    // never fire again for an already-connected socket.
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

    sk.on('quiz_countdown', (d: any) => {
      const totalSeconds = typeof d?.duration === 'number' ? d.duration / 1000 : 5;
      startLobbyCountdown(totalSeconds);
    });

    sk.on('new_question', (d: any) => {
      // Countdown (if any) is over now that the first question is arriving
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
      ref.current.setLobbyCountdown(null);

      // 1. Clear previous question immediately — prevents flash
      ref.current.clearQuestion();
      ref.current.setCurrentOptions([], false);
      ref.current.setSelectedIndices([]);

      const duration = typeof d.answerDuration === 'number' ? d.answerDuration : 15;
      ref.current.setAnswerDuration(duration);
      if (typeof d.previewDuration === 'number' && d.previewDuration > 0) {
        ref.current.setPreviewDuration(d.previewDuration);
      }

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
      // Connection-session pointer is cleared now (the quiz is genuinely
      // over for this socket's purposes), but the UI snapshot is
      // deliberately LEFT IN PLACE here — the player is actively looking
      // at the final leaderboard right now and a refresh in the next few
      // minutes should still show it (handled by the server-side grace
      // period in player_restore). It only gets wiped once the grace
      // period has elapsed, which the next tryRestore() call will detect
      // and act on via clearAll().
      clearSession();
    });

    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
      ['connect','disconnect','player_joined','lobby_update','quiz_started','quiz_countdown','new_question',
       'show_options','timer_update','answer_result','correct_answer_reveal',
       'leaderboard_update','quiz_ended']
        .forEach(e => sk.off(e));
    };
  }, []);
}

