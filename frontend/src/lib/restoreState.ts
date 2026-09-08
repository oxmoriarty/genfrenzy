// Shared utility: applies a getRestoreState server payload to the Zustand
// store. Used by both useSocketEvents (reconnect/refresh) and LandingScreen
// (late join) so the logic is in exactly one place.
import { useGameStore } from '@/store/gameStore';

type Store = ReturnType<typeof useGameStore.getState>;

export function applyRestoreState(store: Store, res: any) {
  store.setPlayerCount(res.playerCount ?? 0);
  if (typeof res.myScore === 'number') store.setMyScore(res.myScore);

  if (typeof res.quizDescription === 'string') {
    store.setQuizDescription(res.quizDescription);
  }

  if (res.quizStatus === 'waiting') {
    store.setLobbyCountdown(null);
    store.setPhase('lobby');
    return;
  }

  if (res.quizStatus === 'counting_down') {
    store.setLobbyCountdown(
      typeof res.countdownRemainingMs === 'number'
        ? Math.max(0, Math.round(res.countdownRemainingMs / 1000))
        : 5
    );
    store.setPhase('lobby');
    return;
  }

  if (res.quizStatus === 'ended') {
    store.setLobbyCountdown(null);
    if (res.leaderboard)   store.setLeaderboard(res.leaderboard);
    if (res.achievements)  store.setAchievements(res.achievements);
    if (typeof res.myRank === 'number') store.setMyRank(res.myRank);
    store.setPhase('achievements');
    return;
  }

  // active quiz — rebuild current question + phase
  store.setLobbyCountdown(null);

  if (typeof res.answerDuration === 'number') {
    store.setAnswerDuration(res.answerDuration);
  }
  if (typeof res.previewDuration === 'number' && res.previewDuration > 0) {
    store.setPreviewDuration(res.previewDuration);
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

  // Set phase last — ensures all data is in place before the screen renders
  if (res.phase) {
    store.setPhase(res.phase);
  }
}
