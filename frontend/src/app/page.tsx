'use client';
import { useEffect } from 'react';
import { useGameStore } from '@/store/gameStore';
import { useSocketEvents } from '@/lib/useSocketEvents';
import { resumeAudio } from '@/lib/sounds';
import LandingScreen      from '@/components/quiz/LandingScreen';
import LobbyScreen        from '@/components/quiz/LobbyScreen';
import QuestionScreen     from '@/components/quiz/QuestionScreen';
import FeedbackScreen     from '@/components/quiz/FeedbackScreen';
import LeaderboardScreen  from '@/components/leaderboard/LeaderboardScreen';
import AchievementsScreen from '@/components/achievements/AchievementsScreen';
import ToastStack         from '@/components/ui/ToastStack';
import ReconnectBanner    from '@/components/ui/ReconnectBanner';

export default function Home() {
  useSocketEvents();
  const phase = useGameStore(s => s.phase);

  useEffect(() => {
    const h = () => resumeAudio();
    document.addEventListener('click', h, { once: true });
    document.addEventListener('touchstart', h, { once: true });
    return () => {
      document.removeEventListener('click', h);
      document.removeEventListener('touchstart', h);
    };
  }, []);

  return (
    <main className="min-h-screen w-full relative">
      <ReconnectBanner />
      {phase === 'landing'                   && <LandingScreen />}
      {phase === 'lobby'                     && <LobbyScreen />}
      {(phase==='question_only'||phase==='question_options') && <QuestionScreen />}
      {phase === 'answer_feedback'           && <FeedbackScreen />}
      {phase === 'intermediate_leaderboard'  && <LeaderboardScreen isFinal={false} />}
      {phase === 'achievements'              && <AchievementsScreen />}
      {phase === 'final_leaderboard'         && <LeaderboardScreen isFinal={true} />}
      <ToastStack />
    </main>
  );
}
