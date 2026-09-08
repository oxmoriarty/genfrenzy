export interface Question {
  id: string;
  text: string;
  imageBase64?: string;          // optional image (base64 data-url)
  options: string[];
  correctIndices: number[];      // supports multiple correct answers
  isMultipleChoice: boolean;     // true = multi-select
  timeLimit: number;       // answer duration in seconds (admin-configured)
  previewDuration?: number;  // question preview duration in seconds (admin-configured, optional)
}

export interface Quiz {
  id: string;
  code: string;
  theme: string;
  description?: string;   // few-sentence description of the quiz theme, shown in lobby
  questions: Question[];
  adminSocketId: string;
  status: 'waiting' | 'counting_down' | 'active' | 'ended';
  currentQuestionIndex: number;
  currentPhase?: 'question_only' | 'question_options' | 'answer_feedback' | 'correct_answer' | 'intermediate_leaderboard';
  phaseStartedAt?: number;
  createdAt: number;
  endedAt?: number;   // timestamp when status became 'ended' — used for the post-quiz grace period
  countdownStartedAt?: number; // timestamp when the pre-quiz 5s countdown began
}

export interface Player {
  id: string;
  socketId: string;
  username: string;
  quizCode: string;
  score: number;
  correctAnswers: number;        // questions fully correct
  partialAnswers: number;        // multi-choice: at least 1 correct but not all
  incorrectAnswers: number;
  streak: number;
  maxStreak: number;
  answerTimes: number[];
  initialRank: number;
  answeredCurrentQuestion: boolean;
  // Per-question detail for XLSX export
  questionResults: QuestionResult[];
  joinedQuestionIndex?: number; // question index when player joined (undefined = joined before quiz started)
}

export interface QuestionResult {
  questionIndex: number;
  questionText: string;
  correct: boolean;
  partial: boolean;
  pointsEarned: number;
  selectedIndices: number[];
  correctIndices: number[];
}

export interface LeaderboardEntry {
  playerId: string;
  username: string;
  score: number;
  rank: number;
  correctAnswers: number;
  partialAnswers: number;
  incorrectAnswers: number;
  streak: number;
  maxStreak: number;
}

export interface Achievement {
  type: 'speedster' | 'sharpshooter' | 'brainiac' | 'streak_king' | 'comeback_fren';
  label: string;
  description: string;
  playerId: string;
  username: string;
}
