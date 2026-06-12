'use client';
import { useCallback, useRef } from 'react';
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

const TOTAL = 15; // seconds per question

export default function QuestionScreen() {
  const {
    phase, currentQuestion, currentOptions, isMultipleChoice,
    questionIndex, totalQuestions, timeLeft,
    hasAnswered, selectedIndices,
    setHasAnswered, toggleSelected, setSelectedIndices,
  } = useGameStore();

  const tlRef = useRef(timeLeft);
  tlRef.current = timeLeft;

  const submit = useCallback((indices: number[]) => {
    if (hasAnswered || phase !== 'question_options') return;
    setHasAnswered(true);
    getSocket().emit('submit_answer', {
      questionIndex,
      selectedIndices: indices,
      timeLeft: tlRef.current,
    }, () => {});
  }, [hasAnswered, phase, questionIndex, setHasAnswered]);

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

  // Null guard — shows blank while transition clears old question
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

  const urgent  = phase === 'question_options' && timeLeft <= 5;
  const warning = phase === 'question_options' && timeLeft > 5 && timeLeft <= 10;
  const tc  = urgent ? '#FF4D6A' : warning ? '#FFB547' : '#3B6EFF';
  const pct = timeLeft / TOTAL;
  const C   = 2 * Math.PI * 20;

  return (
    <div style={{ position:'relative', minHeight:'100vh', display:'flex', flexDirection:'column', background:'#0A0A0F' }}>

      {/* Progress bar */}
      <div style={{ height:3, background:'#111118', flexShrink:0 }}>
        <motion.div
          animate={{ scaleX: phase === 'question_options' ? pct : 1 }}
          transition={{ duration:.4 }}
          style={{ height:'100%', transformOrigin:'left',
            background:`linear-gradient(90deg,${tc},${tc}88)` }} />
      </div>

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

        {/* Timer ring */}
        <AnimatePresence mode="wait">
          {phase === 'question_options' && (
            <motion.div key="timer" initial={{ scale:.6, opacity:0 }} animate={{ scale:1, opacity:1 }}
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
          )}
        </AnimatePresence>
      </div>

      {/* Body */}
      <div style={{ flex:1, display:'flex', flexDirection:'column',
        padding:'0 16px 32px', maxWidth:700, margin:'0 auto', width:'100%' }}>

        {/* Question card — stable key (no phase) prevents re-mount flash */}
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

        {/* Options */}
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