export interface Question {
  questionIndex:    number;
  totalQuestions:   number;
  text:             string;
  imageBase64?:     string | null;
  isMultipleChoice: boolean;
  phase:            'question_only' | 'options';
  duration:         number;
}

export interface AnswerResult {
  correct:        boolean;
  partial:        boolean;
  correctIndices: number[];
  points:         number;
  totalScore:     number;
  rank:           number;
  questionIndex:  number;
}

export interface LeaderboardEntry {
  playerId:        string;
  username:        string;
  score:           number;
  rank:            number;
  correctAnswers:  number;
  partialAnswers:  number;
  incorrectAnswers: number;
  streak:          number;
  maxStreak:       number;
}

export interface Achievement {
  type:        'speedster'|'sharpshooter'|'brainiac'|'streak_king'|'comeback_fren';
  label:       string;
  description: string;
  playerId:    string;
  username:    string;
}

export interface Toast { id: string; message: string; type?: 'info'|'error'|'success'; }

export interface GameState {
  phase: 'landing'|'lobby'|'question_only'|'question_options'|'answer_feedback'|'intermediate_leaderboard'|'achievements'|'final_leaderboard';
  playerId:          string|null;
  username:          string|null;
  quizCode:          string|null;
  quizTheme:         string|null;
  playerCount:       number;
  currentQuestion:   Question|null;
  currentOptions:    string[];
  isMultipleChoice:  boolean;
  questionIndex:     number;
  totalQuestions:    number;
  timeLeft:          number;
  hasAnswered:       boolean;
  selectedIndices:   number[];       // tracks multi-select choices
  answerResult:      AnswerResult|null;
  leaderboard:       LeaderboardEntry[];
  achievements:      Achievement[];
  myScore:           number;
  myRank:            number;
  connected:         boolean;
  toasts:            Toast[];
}
