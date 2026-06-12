import { create } from 'zustand';
import { GameState, Achievement, AnswerResult, LeaderboardEntry, Question, Toast } from '@/types';

interface Store extends GameState {
  clearQuestion(): void;
  setPhase(p: GameState['phase']): void;
  setPlayerInfo(id: string, u: string, c: string, t: string): void;
  setPlayerCount(n: number): void;
  setCurrentQuestion(q: Question): void;
  setCurrentOptions(o: string[], isMulti: boolean): void;
  setTimeLeft(t: number): void;
  setHasAnswered(v: boolean): void;
  toggleSelected(i: number): void;
  setSelectedIndices(arr: number[]): void;
  setAnswerResult(r: AnswerResult | null): void;
  setLeaderboard(l: LeaderboardEntry[]): void;
  setAchievements(a: Achievement[]): void;
  setMyScore(s: number): void;
  setMyRank(r: number): void;
  setConnected(v: boolean): void;
  addToast(msg: string, type?: Toast['type']): void;
  removeToast(id: string): void;
  reset(): void;
}

const init: GameState = {
  phase: 'landing',
  playerId: null, username: null, quizCode: null, quizTheme: null,
  playerCount: 0, currentQuestion: null, currentOptions: [],
  isMultipleChoice: false,
  questionIndex: 0, totalQuestions: 0, timeLeft: 15,
  hasAnswered: false, selectedIndices: [], answerResult: null,
  leaderboard: [], achievements: [],
  myScore: 0, myRank: 0, connected: false, toasts: [],
};

export const useGameStore = create<Store>((set, get) => ({
  ...init,

  clearQuestion: () => set({
    currentQuestion: null, currentOptions: [],
    selectedIndices: [], hasAnswered: false, answerResult: null,
  }),

  setPhase:      p   => set({ phase: p }),
  setPlayerInfo: (id, u, c, t) => set({ playerId: id, username: u, quizCode: c, quizTheme: t }),
  setPlayerCount: n  => set({ playerCount: n }),

  setCurrentQuestion: q => set({
    currentQuestion: q,
    questionIndex:   q.questionIndex,
    totalQuestions:  q.totalQuestions,
    isMultipleChoice: q.isMultipleChoice,
    hasAnswered: false,
    answerResult: null,
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

  setSelectedIndices: arr => set({ selectedIndices: arr }),
  setAnswerResult:    r   => set({ answerResult: r }),
  setLeaderboard:     l   => set({ leaderboard: l }),
  setAchievements:    a   => set({ achievements: a }),
  setMyScore:         s   => set({ myScore: s }),
  setMyRank:          r   => set({ myRank: r }),
  setConnected:       v   => set({ connected: v }),

  addToast: (msg, type = 'info') => {
    const id = Math.random().toString(36).slice(2);
    set(s => ({ toasts: [...s.toasts.slice(-3), { id, message: msg, type }] }));
    setTimeout(() => get().removeToast(id), 3500);
  },

  removeToast: id => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),

  reset: () => set({ ...init, connected: get().connected }),
}));