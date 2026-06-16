import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { GameState, Achievement, AnswerResult, LeaderboardEntry, Question, Toast } from '@/types';

interface Store extends GameState {
  clearQuestion(): void;
  setPhase(p: GameState['phase']): void;
  setPlayerInfo(id: string, u: string, c: string, t: string, d?: string): void;
  setQuizDescription(d: string | null): void;
  setAnswerDuration(n: number): void;
  setPlayerCount(n: number): void;
  setLobbyCountdown(n: number | null): void;
  setCurrentQuestion(q: Question): void;
  setCurrentOptions(o: string[], isMulti: boolean): void;
  setTimeLeft(t: number): void;
  setHasAnswered(v: boolean): void;
  toggleSelected(i: number): void;
  setSelectedIndices(arr: number[]): void;
  setAnswerResult(r: AnswerResult | null): void;
  setRevealCorrectIndices(arr: number[]): void;
  setLeaderboard(l: LeaderboardEntry[]): void;
  setAchievements(a: Achievement[]): void;
  setMyScore(s: number): void;
  setMyRank(r: number): void;
  setConnected(v: boolean): void;
  addToast(msg: string, type?: Toast['type']): void;
  removeToast(id: string): void;
  reset(): void;
  clearAll(): void;  // resets state AND wipes the persisted localStorage snapshot
}

const init: GameState = {
  phase: 'landing',
  playerId: null, username: null, quizCode: null, quizTheme: null,
  quizDescription: null,
  playerCount: 0, lobbyCountdown: null, currentQuestion: null, currentOptions: [],
  isMultipleChoice: false,
  questionIndex: 0, totalQuestions: 0, timeLeft: 15, answerDuration: 15,
  hasAnswered: false, selectedIndices: [], answerResult: null,
  revealCorrectIndices: [],
  leaderboard: [], achievements: [],
  myScore: 0, myRank: 0, connected: false, toasts: [],
};

export const useGameStore = create<Store>()(
  persist(
    (set, get) => ({
      ...init,

      clearQuestion: () => set({
        currentQuestion: null, currentOptions: [],
        selectedIndices: [], hasAnswered: false, answerResult: null,
        revealCorrectIndices: [],
      }),

      setPhase:      p   => set({ phase: p }),
      setPlayerInfo: (id, u, c, t, d) => set({ playerId: id, username: u, quizCode: c, quizTheme: t, quizDescription: d ?? null }),
      setQuizDescription: d => set({ quizDescription: d }),
      setAnswerDuration:  n => set({ answerDuration: n }),
      setPlayerCount: n  => set({ playerCount: n }),
      setLobbyCountdown: n => set({ lobbyCountdown: n }),

      setCurrentQuestion: q => set({
        currentQuestion: q,
        questionIndex:   q.questionIndex,
        totalQuestions:  q.totalQuestions,
        isMultipleChoice: q.isMultipleChoice,
        hasAnswered: false,
        answerResult: null,
        revealCorrectIndices: [],
        selectedIndices: [],
      }),

      setCurrentOptions: (o, isMulti) => set({ currentOptions: o, isMultipleChoice: isMulti }),
      setTimeLeft:    t  => set({ timeLeft: t }),
      setHasAnswered: v  => set({ hasAnswered: v }),

      toggleSelected: i => set(s => ({
        selectedIndices: s.selectedIndices.includes(i)
          ? s.selectedIndices.filter(x => x !== i)
          : [...s.selectedIndices, i],
      })),

      setSelectedIndices:     arr => set({ selectedIndices: arr }),
      setAnswerResult:        r   => set({ answerResult: r }),
      setRevealCorrectIndices: arr => set({ revealCorrectIndices: arr }),
      setLeaderboard:         l   => set({ leaderboard: l }),
      setAchievements:        a   => set({ achievements: a }),
      setMyScore:             s   => set({ myScore: s }),
      setMyRank:              r   => set({ myRank: r }),
      setConnected:           v   => set({ connected: v }),

      addToast: (msg, type = 'info') => {
        const id = Math.random().toString(36).slice(2);
        set(s => ({ toasts: [...s.toasts.slice(-3), { id, message: msg, type }] }));
        setTimeout(() => get().removeToast(id), 3500);
      },

      removeToast: id => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),

      reset: () => set({ ...init, connected: get().connected }),

      // Wipes BOTH the in-memory store and the persisted localStorage
      // snapshot. Without this, a stale "achievements" phase with an old
      // leaderboard could sit in localStorage forever and render on every
      // future visit, since `reset()` alone only fixes in-memory state —
      // the persist middleware would simply write the stale data right
      // back on the next change, or worse, rehydrate it on the very next
      // page load before any socket logic runs.
      clearAll: () => {
        set({ ...init, connected: get().connected });
        if (typeof window !== 'undefined') {
          localStorage.removeItem('gf_game_state');
        }
      },
    }),
    {
      name: 'gf_game_state',
      storage: createJSONStorage(() => localStorage),
      // Persist only what's needed to rebuild the UI on reload.
      // Exclude toasts and connected (these should always start fresh).
      partialize: (s) => ({
        phase: s.phase,
        playerId: s.playerId,
        username: s.username,
        quizCode: s.quizCode,
        quizTheme: s.quizTheme,
        quizDescription: s.quizDescription,
        playerCount: s.playerCount,
        currentQuestion: s.currentQuestion,
        currentOptions: s.currentOptions,
        isMultipleChoice: s.isMultipleChoice,
        questionIndex: s.questionIndex,
        totalQuestions: s.totalQuestions,
        timeLeft: s.timeLeft,
        answerDuration: s.answerDuration,
        hasAnswered: s.hasAnswered,
        selectedIndices: s.selectedIndices,
        answerResult: s.answerResult,
        revealCorrectIndices: s.revealCorrectIndices,
        leaderboard: s.leaderboard,
        achievements: s.achievements,
        myScore: s.myScore,
        myRank: s.myRank,
      }),
    }
  )
);