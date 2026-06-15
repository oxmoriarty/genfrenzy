'use client';
import { motion } from 'framer-motion';
import { Check, X } from 'lucide-react';
import { useGameStore } from '@/store/gameStore';

const LETTERS = ['A','B','C','D'];

export default function CorrectAnswerScreen() {
  const {
    currentQuestion, currentOptions, revealCorrectIndices,
    questionIndex, totalQuestions, isMultipleChoice,
  } = useGameStore();

  return (
    <div style={{ position:'relative', minHeight:'100vh', display:'flex', flexDirection:'column',
      alignItems:'center', justifyContent:'center', padding:'24px', background:'#0A0A0F', overflow:'hidden' }}>
      <div className="mesh-bg" />

      <div style={{ position:'relative', zIndex:1, width:'100%', maxWidth:560 }}>

        {/* Header */}
        <motion.div initial={{ opacity:0, y:-12 }} animate={{ opacity:1, y:0 }}
          style={{ textAlign:'center', marginBottom:20 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, marginBottom:8 }}>
            <span style={{ fontSize:10, letterSpacing:'.18em', textTransform:'uppercase',
              color:'#6B6B80', fontFamily:'var(--font-jb)' }}>
              {isMultipleChoice ? 'Correct Answers' : 'Correct Answer'}
            </span>
          </div>
          <h2 className="font-display" style={{ fontSize:26, fontWeight:700, color:'#F0F0F8', letterSpacing:'-.5px' }}>
            Here's what it was
          </h2>
        </motion.div>

        {/* Question recap */}
        {currentQuestion?.text && (
          <motion.div initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} transition={{ delay:.08 }}
            style={{ borderRadius:18, padding:'16px 20px', marginBottom:16,
              background:'#18181F', border:'1px solid #25252E' }}>
            <p style={{ fontSize:15, fontWeight:600, color:'#C8C8D8', lineHeight:1.5, margin:0, textAlign:'center' }}>
              {currentQuestion.text}
            </p>
          </motion.div>
        )}

        {/* Options — correct highlighted green, others dimmed */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:10 }}>
          {currentOptions.map((opt, i) => {
            const isCorrect = revealCorrectIndices.includes(i);
            return (
              <motion.div key={i}
                initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }}
                transition={{ delay:.12 + i*.06, duration:.25 }}
                style={{
                  borderRadius:14, padding:'14px',
                  display:'flex', alignItems:'center', gap:10,
                  background: isCorrect ? 'rgba(0,201,141,.14)' : 'rgba(255,255,255,.02)',
                  border: `1.5px solid ${isCorrect ? 'rgba(0,201,141,.5)' : '#25252E'}`,
                  boxShadow: isCorrect ? '0 0 0 1px rgba(0,201,141,.3), 0 8px 28px rgba(0,201,141,.18)' : 'none',
                  opacity: isCorrect ? 1 : 0.45,
                }}>
                <div style={{
                  flexShrink:0, width:28, height:28, borderRadius:8,
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontWeight:700, fontSize:12,
                  background: isCorrect ? '#00C98D' : 'rgba(255,255,255,.06)',
                  color: isCorrect ? '#08110D' : '#6B6B80',
                }}>
                  {LETTERS[i]}
                </div>
                <span style={{ flex:1, fontSize:13, lineHeight:1.5, fontWeight:500,
                  color: isCorrect ? '#F0F0F8' : '#6B6B80' }}>
                  {opt}
                </span>
                {isCorrect && (
                  <div style={{ flexShrink:0, width:22, height:22, borderRadius:'50%',
                    background:'#00C98D', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <Check size={13} color="#08110D" strokeWidth={3} />
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>

        <motion.p initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:.5 }}
          style={{ textAlign:'center', marginTop:20, fontSize:11, color:'#6B6B80', fontFamily:'var(--font-jb)' }}>
          Question {questionIndex + 1} of {totalQuestions}
        </motion.p>
      </div>
    </div>
  );
}