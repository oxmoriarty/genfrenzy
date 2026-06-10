'use client';
import { motion } from 'framer-motion';
import { CheckCircle2, XCircle, MinusCircle, TrendingUp, Zap } from 'lucide-react';
import { useGameStore } from '@/store/gameStore';

export default function FeedbackScreen() {
  const { answerResult, myScore, myRank, questionIndex, totalQuestions } = useGameStore();
  const correct = answerResult?.correct ?? false;
  const partial = answerResult?.partial ?? false;
  const pts     = answerResult?.points ?? 0;

  const state = correct ? 'correct' : partial ? 'partial' : 'wrong';
  const cfg = {
    correct: { Icon:CheckCircle2, color:'#00C98D', glow:'rgba(0,201,141,.28)', label:'Correct!',   bg:'rgba(0,201,141,.12)',   border:'rgba(0,201,141,.35)' },
    partial: { Icon:MinusCircle,  color:'#FFB547', glow:'rgba(255,181,71,.28)', label:'Partial!',  bg:'rgba(255,181,71,.12)',  border:'rgba(255,181,71,.35)' },
    wrong:   { Icon:XCircle,      color:'#FF4D6A', glow:'rgba(255,77,106,.28)', label:'Wrong!',    bg:'rgba(255,77,106,.12)',  border:'rgba(255,77,106,.35)' },
  }[state];

  return (
    <div style={{ position:'relative', minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'24px', overflow:'hidden', background:'#0A0A0F' }}>
      <div className="mesh-bg" />
      <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ duration:.35 }}
        style={{ position:'absolute', inset:0, pointerEvents:'none',
          background:`radial-gradient(ellipse 70% 50% at 50% 40%, ${cfg.glow.replace('.28','.12')} 0%,transparent 65%)` }} />

      <div style={{ position:'relative', zIndex:1, width:'100%', maxWidth:360, textAlign:'center' }}>

        {/* Icon */}
        <motion.div initial={{ scale:0, rotate:-18 }} animate={{ scale:1, rotate:0 }}
          transition={{ type:'spring', stiffness:320, damping:22 }}
          style={{ display:'flex', justifyContent:'center', marginBottom:24 }}>
          <div style={{ position:'relative' }}>
            <div style={{ width:96, height:96, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center',
              background:cfg.bg, border:`1px solid ${cfg.border}`, boxShadow:`0 0 60px ${cfg.glow}` }}>
              <cfg.Icon size={44} color={cfg.color} strokeWidth={1.5} />
            </div>
            {(correct || partial) && [0,1].map(i => (
              <motion.div key={i} animate={{ scale:[1,2.4], opacity:[.45,0] }}
                transition={{ duration:1.2, repeat:Infinity, delay:i*.5 }}
                style={{ position:'absolute', inset:0, borderRadius:'50%', border:`1px solid ${cfg.border}`, pointerEvents:'none' }} />
            ))}
          </div>
        </motion.div>

        {/* Label */}
        <motion.h2 initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} transition={{ delay:.14 }}
          className="font-display" style={{ fontSize:34, fontWeight:700, color:'#F0F0F8', letterSpacing:'-.5px', marginBottom:4 }}>
          {cfg.label}
        </motion.h2>

        {partial && (
          <motion.p initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:.2 }}
            style={{ fontSize:13, color:'#9898AA', marginBottom:12 }}>
            You got some correct — partial points awarded
          </motion.p>
        )}

        {/* Points */}
        <motion.div initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} transition={{ delay:.22 }}
          style={{ marginBottom:28 }}>
          {pts > 0 ? (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
              <Zap size={18} fill="#FFB547" color="#FFB547" />
              <span className="font-display" style={{ fontSize:46, fontWeight:700, letterSpacing:'-1.5px',
                background:'linear-gradient(135deg,#FFD700,#FFB547)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>
                +{pts.toLocaleString()}
              </span>
              <span style={{ fontSize:14, color:'#9898AA', alignSelf:'flex-end', marginBottom:6 }}>pts</span>
            </div>
          ) : (
            <p style={{ fontSize:14, color:'#9898AA' }}>No points this round</p>
          )}
        </motion.div>

        {/* Stats */}
        <motion.div initial={{ opacity:0, y:18 }} animate={{ opacity:1, y:0 }} transition={{ delay:.3 }}
          style={{ borderRadius:20, padding:'20px 24px', marginBottom:24,
            background:'#18181F', border:'1px solid #25252E', boxShadow:'0 4px 24px rgba(0,0,0,.55)' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:0 }}>
            {[
              { icon:<Zap size={11} />,        label:'Score', value: myScore.toLocaleString() },
              { icon:<TrendingUp size={11} />, label:'Rank',  value: `#${myRank||'—'}` },
            ].map(({ icon, label, value }, i) => (
              <div key={label} style={{ textAlign:'center', padding:'0 12px', borderRight:i===0?'1px solid #25252E':'none' }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:5, marginBottom:6, color:'#6B6B80', fontSize:10, fontFamily:'var(--font-jb)', textTransform:'uppercase', letterSpacing:'.12em' }}>
                  {icon} {label}
                </div>
                <div className="font-display" style={{ fontSize:28, fontWeight:700, color:'#F0F0F8', letterSpacing:'-.5px' }}>{value}</div>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.p initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:.45 }}
          style={{ fontSize:11, color:'#6B6B80', fontFamily:'var(--font-jb)', marginBottom:20 }}>
          Question {questionIndex+1} of {totalQuestions}
        </motion.p>

        <div style={{ display:'flex', justifyContent:'center', gap:5 }}>
          {[0,1,2].map(i => (
            <motion.div key={i} animate={{ opacity:[.25,1,.25] }}
              transition={{ duration:1.1, repeat:Infinity, delay:i*.22 }}
              style={{ width:5, height:5, borderRadius:'50%', background:'#3A3A48' }} />
          ))}
        </div>
      </div>
    </div>
  );
}
