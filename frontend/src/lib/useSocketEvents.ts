'use client';
import { useEffect, useRef } from 'react';
import { getSocket } from '@/lib/socket';
import { useGameStore } from '@/store/gameStore';
import { playSound } from '@/lib/sounds';

export function useSocketEvents() {
  const store = useGameStore();
  const ref   = useRef(store);
  ref.current = store;

  useEffect(() => {
    const sk = getSocket();
    sk.on('connect',    () => ref.current.setConnected(true));
    sk.on('disconnect', () => ref.current.setConnected(false));

    sk.on('player_joined', (d:any) => ref.current.setPlayerCount(d.playerCount));
    sk.on('lobby_update',  (d:any) => ref.current.setPlayerCount(d.playerCount));

    sk.on('new_question', (d:any) => {
      ref.current.setCurrentQuestion({
        questionIndex:    d.questionIndex,
        totalQuestions:   d.totalQuestions,
        text:             d.text,
        imageBase64:      d.imageBase64 || null,
        isMultipleChoice: d.isMultipleChoice || false,
        phase:            'question_only',
        duration:         d.duration,
      });
      ref.current.setCurrentOptions([], false);
      ref.current.setTimeLeft(20);
      ref.current.setPhase('question_only');
    });

    sk.on('show_options', (d:any) => {
      ref.current.setCurrentOptions(d.options, d.isMultipleChoice || false);
      ref.current.setTimeLeft(20);
      ref.current.setPhase('question_options');
    });

    sk.on('timer_update', (d:any) => {
      ref.current.setTimeLeft(d.timeLeft);
      if (d.timeLeft <= 5 && d.timeLeft > 0) playSound('countdown');
      else if (d.timeLeft > 5) playSound('tick');
    });

    sk.on('answer_result', (d:any) => {
      ref.current.setAnswerResult(d);
      ref.current.setMyScore(d.totalScore);
      ref.current.setMyRank(d.rank);
      ref.current.setPhase('answer_feedback');
      playSound(d.correct ? 'correct' : d.partial ? 'correct' : 'wrong');
    });

    sk.on('leaderboard_update', (d:any) => {
      ref.current.setLeaderboard(d.leaderboard);
      const me = d.leaderboard.find((e:any) => e.playerId === ref.current.playerId);
      if (me) ref.current.setMyRank(me.rank);
      if (d.isIntermediate) ref.current.setPhase('intermediate_leaderboard');
    });

    sk.on('quiz_ended', (d:any) => {
      ref.current.setLeaderboard(d.leaderboard);
      ref.current.setAchievements(d.achievements);
      const me = d.leaderboard.find((e:any) => e.playerId === ref.current.playerId);
      if (me) ref.current.setMyRank(me.rank);
      ref.current.setPhase('achievements');
      playSound('achievement');
    });

    return () => {
      ['connect','disconnect','player_joined','lobby_update','new_question','show_options',
       'timer_update','answer_result','leaderboard_update','quiz_ended'].forEach(e => sk.off(e));
    };
  }, []);
}
