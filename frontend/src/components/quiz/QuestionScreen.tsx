'use client';
import { useCallback, useRef, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Check, CheckSquare } from 'lucide-react';
import { useGameStore } from '@/store/gameStore';
import { getSocket } from '@/lib/socket';

const OPTS = [
  { L:'A', c:'#3B6EFF', g:'rgba(59,110,255,.32)',  bg:'rgba(59,110,255,.09)', sel:'rgba(59,110,255,.2)'  },
  { L:'B', c:'#9B59FF', g:'rgba(155,89,255,.32)',  bg:'rgba(155,89,255,.09)', sel:'rgba(155,89,255,.2)'  },
  { L:'C', c:'#FF6B35', g:'rgba(255,107,53,.32)',  bg:'rgba(255,107,53,.09)', sel:'rgba(255,107,53,.2)'  },
  { L:'D', c:'#00D4B4', g:'rgba(0,212,180,.32)',   bg:'rgba(0,212,180,.09)',  sel:'rgba(0,212,180,.2)'   },
];

// ── Timer ring — isolated component that ONLY subscribes to timeLeft and
// answerDuration. This is the key performance fix: timeLeft changes every
// second, but the option cards don't need to re-render when it does. By
// splitting the timer into its own component with its own narrow selector,
// the 4 option cards are completely unaffected by timer ticks.
const TimerRing = memo(function TimerRing() {
  const timeLeft     = useGameStore(s => s.timeLeft);
  const answerDuration = useGameStore(s => s.answerDuration);
  const phase        = useGameStore(s => s.phase);

  if (phase !== 'question_options') return null;

  const urgent  = timeLeft <= 5;
  const warning = timeLeft > 5 && timeLeft <= 10;
  const tc  = urgent ? '#FF4D6A' : warning ? '#FFB547' : '#3B6EFF';
  const pct = timeLeft / (answerDuration || 15);
  const C   = 2 * Math.PI * 20;

  return (
    <motion.div initial={{ scale:.6, opacity:0 }} animate={{ scale:1, opacity:1 }}
      style={{ position:'relative' }}>
      <motion.div
        animate={urgent ? { scale:[1,1.1,1] } : {}}
        transition={{ duration:.5, repeat: urgent ? Infinity : 0 }}>
        <svg width="56" height="56" viewBox="0 0 56 56">
          <circle cx="28" cy="28" r="20" fill="none"
            stroke={urgent?'rgba(255,77,106,.18)':warning?'rgba(255,183,71,.18)':'rgba(59,110,255,.13)'}
            strokeWidth="3.5"/>
          <circle cx="28" cy="28" r="20" fill="none"
            stroke={tc} strokeWidth="3.5" strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - pct)}
            style={{ transform:'rotate(-90deg)', transformOrigin:'50% 50%',
              transition:'stroke-dashoffset .45s linear, stroke .3s' }}/>
          <text x="28" y="33" textAnchor="middle" fontSize="13" fontWeight="700"
            fill={tc} fontFamily="var(--font-jb)">{timeLeft}</text>
        </svg>
      </motion.div>
      {urgent && (
        <motion.div animate={{ scale:[1,1.7], opacity:[.5,0] }}
          transition={{ duration:.9, repeat:Infinity }}
          style={{ position:'absolute', inset:0, borderRadius:'50%',
            border:'2px solid rgba(255,77,106,.45)', pointerEvents:'none' }}/>
      )}
    </motion.div>
  );
});

// ── Progress bar — also isolated so it doesn't drag along the whole screen
const ProgressBar = memo(function ProgressBar() {
  const timeLeft      = useGameStore(s => s.timeLeft);
  const answerDuration = useGameStore(s => s.answerDuration);
  const phase         = useGameStore(s => s.phase);

  const urgent  = phase === 'question_options' && timeLeft <= 5;
  const warning = phase === 'question_options' && timeLeft > 5 && timeLeft <= 10;
  const tc  = urgent ? '#FF4D6A' : warning ? '#FFB547' : '#3B6EFF';
  const pct = timeLeft / (answerDuration || 15);

  return (
    <div style={{ height:3, background:'#111118', flexShrink:0 }}>
      <motion.div
        animate={{ scaleX: phase === 'question_options' ? pct : 1 }}
        transition={{ duration:.4 }}
        style={{ height:'100%', transformOrigin:'left',
          background:`linear-gradient(90deg,${tc},${tc}88)` }} />
    </div>
  );
});

// ── Main question screen — subscribes to everything EXCEPT timeLeft ───────────
export default function QuestionScreen() {
  // Narrow selectors: only the fields this component actually uses.
  // timeLeft is deliberately excluded — TimerRing and ProgressBar handle it.
  const phase           = useGameStore(s => s.phase);
  const currentQuestion = useGameStore(s => s.currentQuestion);
  const currentOptions  = useGameStore(s => s.currentOptions);
  const isMultipleChoice = useGameStore(s => s.isMultipleChoice);
  const questionIndex   = useGameStore(s => s.questionIndex);
  const totalQuestions  = useGameStore(s => s.totalQuestions);
  const hasAnswered     = useGameStore(s => s.hasAnswered);
  const selectedIndices = useGameStore(s => s.selectedIndices);
  const setHasAnswered  = useGameStore(s => s.setHasAnswered);
  const toggleSelected  = useGameStore(s => s.toggleSelected);
  const setSelectedIndices = useGameStore(s => s.setSelectedIndices);

  // Keep timeLeft accessible for submit without subscribing the whole component
  const tlRef = useRef(0);
  // Safe: timeLeft changes don't cause re-renders here, but we need its
  // current value when submit fires. We read it directly from the store
  // singleton rather than subscribing.
  const getTimeLeft = useCallback(() => useGameStore.getState().timeLeft, []);

  const submit = useCallback((indices: number[]) => {
    if (hasAnswered || phase !== 'question_options') return;
    setHasAnswered(true);
    getSocket().emit('submit_answer', {
      questionIndex,
      selectedIndices: indices,
      timeLeft: getTimeLeft(),
    }, () => {});
  }, [hasAnswered, phase, questionIndex, setHasAnswered, getTimeLeft]);

  const handleSingleClick = useCallback((i: number) => {
    if (hasAnswered) return;
    setSelectedIndices([i]);
    submit([i]);
  }, [hasAnswered, submit, setSelectedIndices]);

  const handleMultiToggle = useCallback((i: number) => {
    if (hasAnswered) return;
    toggleSelected(i);
  }, [hasAnswered, toggleSelected]);

  const handleMultiSubmit = useCallback(() => {
    if (hasAnswered || selectedIndices.length === 0) return;
    submit(selectedIndices);
  }, [hasAnswered, selectedIndices, submit]);

  // Null guard — blank loading state while question transitions
  if (!currentQuestion) {
    return (
      <div style={{ minHeight:'100vh', background:'#0A0A0F', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div style={{ display:'flex', gap:6 }}>
          {[0,1,2].map(i => (
            <motion.div key={i}
              animate={{ opacity:[.3,1,.3], scale:[1,1.2,1] }}
              transition={{ duration:.9, repeat:Infinity, delay:i*.18 }}
              style={{ width:8, height:8, borderRadius:'50%', background:'#3A3A48' }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ position:'relative', minHeight:'100vh', display:'flex', flexDirection:'column', background:'#0A0A0F' }}>

      {/* Progress bar — isolated, only re-renders on timer ticks */}
      <ProgressBar />

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'14px 20px', maxWidth:700, margin:'0 auto', width:'100%' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontFamily:'var(--font-jb)', fontSize:13, fontWeight:600, color:'#F0F0F8' }}>
            Q{questionIndex + 1}<span style={{ color:'#6B6B80' }}>/{totalQuestions}</span>
          </span>
          {isMultipleChoice && phase === 'question_options' && (
            <span style={{ padding:'3px 10px', borderRadius:100, fontSize:10, fontWeight:600,
              background:'rgba(155,89,255,.18)', color:'#9B59FF',
              fontFamily:'var(--font-jb)', border:'1px solid rgba(155,89,255,.3)' }}>
              SELECT ALL THAT APPLY
            </span>
          )}
        </div>

        {/* Timer ring — isolated component, won't re-render option cards */}
        <AnimatePresence mode="wait">
          {phase === 'question_options' && <TimerRing key="timer" />}
        </AnimatePresence>
      </div>

      {/* Body */}
      <div style={{ flex:1, display:'flex', flexDirection:'column',
        padding:'0 16px 32px', maxWidth:700, margin:'0 auto', width:'100%' }}>

        {/* Question card */}
        <AnimatePresence mode="wait">
          <motion.div key={`q-${questionIndex}`}
            initial={{ opacity:0, y:14 }} animate={{ opacity:1, y:0 }}
            exit={{ opacity:0, y:-14 }} transition={{ duration:.28 }}
            style={{ borderRadius:22, padding:'22px 22px 18px', marginBottom:16,
              position:'relative', overflow:'hidden', background:'#18181F',
              border:'1px solid #25252E', boxShadow:'0 4px 32px rgba(0,0,0,.55)', minHeight:100 }}>
            <div style={{ position:'absolute', inset:0, pointerEvents:'none', borderRadius:22,
              background:'radial-gradient(ellipse at top left,rgba(108,71,255,.08) 0%,transparent 60%)' }}/>
            <div style={{ position:'relative', zIndex:1 }}>
              <div style={{ marginBottom:14 }}>
                <span style={{ fontSize:10, letterSpacing:'.16em', textTransform:'uppercase',
                  fontFamily:'var(--font-jb)', color:'#6B6B80' }}>
                  {phase === 'question_only'
                    ? 'Read the question'
                    : isMultipleChoice ? 'Choose all correct answers' : 'Choose the correct answer'}
                </span>
              </div>
              {currentQuestion.text && (
                <p style={{ fontSize:18, fontWeight:600, color:'#F0F0F8', lineHeight:1.5,
                  marginBottom: currentQuestion.imageBase64 ? 14 : 0 }}>
                  {currentQuestion.text}
                </p>
              )}
              {currentQuestion.imageBase64 && (
                <div style={{ marginTop: currentQuestion.text ? 14 : 0, borderRadius:14,
                  overflow:'hidden', border:'1px solid #25252E', background:'#111118',
                  display:'flex', alignItems:'center', justifyContent:'center' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={currentQuestion.imageBase64} alt="Question visual"
                    style={{ maxWidth:'100%', maxHeight:240, objectFit:'contain', display:'block' }}/>
                </div>
              )}
              {phase === 'question_only' && (
                <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:.4 }}
                  style={{ display:'flex', alignItems:'center', gap:6, marginTop:16,
                    fontSize:12, color:'#6B6B80', fontFamily:'var(--font-jb)' }}>
                  <motion.span animate={{ x:[0,4,0] }} transition={{ duration:1.2, repeat:Infinity }}>
                    <ChevronRight size={12}/>
                  </motion.span>
                  Options appear in a moment…
                </motion.div>
              )}
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Options — memoized structure, only re-renders when selections change */}
        <AnimatePresence>
          {phase === 'question_options' && (
            <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ duration:.22 }}>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:10 }}>
                {currentOptions.map((opt, i) => {
                  const o    = OPTS[i];
                  const isSel = selectedIndices.includes(i);
                  return (
                    <motion.div key={i} className="opt"
                      data-off={hasAnswered ? 'true' : 'false'}
                      onClick={() => isMultipleChoice ? handleMultiToggle(i) : handleSingleClick(i)}
                      initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }}
                      transition={{ delay:i*.07, duration:.25 }}
                      whileHover={!hasAnswered ? { y:-2, transition:{ duration:.1 } } : {}}
                      whileTap={!hasAnswered ? { scale:.975 } : {}}
                      style={{
                        background:   isSel ? o.sel : o.bg,
                        borderColor:  isSel ? o.c  : '#25252E',
                        boxShadow:    isSel ? `0 0 0 1px ${o.c}, 0 8px 28px ${o.g}` : 'none',
                      }}>
                      <div style={{ display:'flex', alignItems:'flex-start', gap:12, padding:'14px' }}>
                        {isMultipleChoice ? (
                          <div style={{ flexShrink:0, width:22, height:22, borderRadius:6, marginTop:2,
                            border:`2px solid ${isSel ? o.c : '#3A3A48'}`,
                            background: isSel ? o.c : 'transparent',
                            display:'flex', alignItems:'center', justifyContent:'center',
                            transition:'all .15s' }}>
                            {isSel && <Check size={12} color="#fff" strokeWidth={2.5}/>}
                          </div>
                        ) : (
                          <div style={{ flexShrink:0, width:28, height:28, borderRadius:8,
                            display:'flex', alignItems:'center', justifyContent:'center',
                            fontWeight:700, fontSize:12, transition:'all .15s',
                            background: isSel ? o.c : `${o.c}28`,
                            color: isSel ? '#fff' : o.c }}>
                            {o.L}
                          </div>
                        )}
                        <span style={{ fontSize:13, lineHeight:1.5, fontWeight:500, paddingTop:2,
                          color: isSel ? '#F0F0F8' : '#C8C8D8' }}>
                          {opt}
                        </span>
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              {isMultipleChoice && !hasAnswered && (
                <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }}
                  transition={{ delay:.3 }} style={{ marginTop:14 }}>
                  <motion.button onClick={handleMultiSubmit}
                    disabled={selectedIndices.length === 0}
                    whileHover={selectedIndices.length > 0 ? { scale:1.016 } : {}}
                    whileTap={selectedIndices.length > 0 ? { scale:.984 } : {}}
                    style={{
                      width:'100%', padding:'13px 24px', borderRadius:14, border:'none',
                      fontWeight:700, fontSize:14,
                      cursor: selectedIndices.length === 0 ? 'default' : 'pointer',
                      background: selectedIndices.length === 0
                        ? 'rgba(108,71,255,.2)' : 'linear-gradient(135deg,#3B6EFF,#6C47FF)',
                      color: selectedIndices.length === 0 ? '#6B6B80' : '#fff',
                      boxShadow: selectedIndices.length > 0 ? '0 8px 28px rgba(108,71,255,.4)' : 'none',
                      display:'flex', alignItems:'center', justifyContent:'center', gap:8,
                    }}>
                    <CheckSquare size={16}/>
                    {selectedIndices.length === 0
                      ? 'Select at least one answer'
                      : `Confirm ${selectedIndices.length} answer${selectedIndices.length > 1 ? 's' : ''}`}
                  </motion.button>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {hasAnswered && phase === 'question_options' && (
          <motion.p initial={{ opacity:0, y:5 }} animate={{ opacity:1, y:0 }}
            style={{ textAlign:'center', marginTop:18, fontSize:13, color:'#6B6B80',
              fontFamily:'var(--font-jb)' }}>
            Waiting for results…
          </motion.p>
        )}
      </div>
    </div>
  );
}