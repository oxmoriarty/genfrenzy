'use client';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Target, Brain, Flame, Rocket } from 'lucide-react';
import { useGameStore } from '@/store/gameStore';
import { Achievement } from '@/types';

const ACH: Record<Achievement['type'], { Icon: any; color: string; bg: string }> = {
  speedster:     { Icon:Zap,    color:'#FFB547', bg:'rgba(255,181,71,.12)'  },
  sharpshooter:  { Icon:Target, color:'#3B6EFF', bg:'rgba(59,110,255,.12)' },
  brainiac:      { Icon:Brain,  color:'#9B59FF', bg:'rgba(155,89,255,.12)' },
  streak_king:   { Icon:Flame,  color:'#FF4D6A', bg:'rgba(255,77,106,.12)' },
  comeback_fren: { Icon:Rocket, color:'#00D4B4', bg:'rgba(0,212,180,.12)'  },
};

const LABELS: Record<Achievement['type'], string> = {
  speedster:'Speedster', sharpshooter:'Sharpshooter', brainiac:'Brainiac',
  streak_king:'Streak King', comeback_fren:'Comeback Fren',
};

export default function AchievementsScreen() {
  const achievements = useGameStore(s => s.achievements);
  const setPhase     = useGameStore(s => s.setPhase);
  const [alive, setAlive] = useState(true);

  const go = () => { setAlive(false); setTimeout(() => setPhase('final_leaderboard'), 200); };
  useEffect(() => { const t = setTimeout(go, 4200); return () => clearTimeout(t); }, []);

  return (
    <AnimatePresence>
      {alive && (
        <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }}
          exit={{ opacity:0, transition:{ duration:.2 } }}
          onClick={go}
          style={{ position:'fixed', inset:0, zIndex:50, display:'flex', flexDirection:'column',
            alignItems:'center', justifyContent:'center', padding:'24px',
            background:'rgba(5,5,14,.92)', backdropFilter:'blur(18px)',
            WebkitBackdropFilter:'blur(18px)', cursor:'pointer' }}>

          {/* Stars */}
          {[...Array(22)].map((_,i) => (
            <motion.div key={i} animate={{ opacity:[.08,.55,.08] }}
              transition={{ duration:1.8+Math.random()*2, repeat:Infinity, delay:Math.random()*2 }}
              style={{ position:'absolute', width:1.5, height:1.5, borderRadius:'50%', background:'#fff',
                left:`${Math.random()*100}%`, top:`${Math.random()*100}%`, pointerEvents:'none' }} />
          ))}

          <div style={{ position:'relative', zIndex:1, width:'100%', maxWidth:400 }}>
            <motion.div initial={{ opacity:0, y:-16 }} animate={{ opacity:1, y:0 }} transition={{ delay:.06 }}
              style={{ textAlign:'center', marginBottom:28 }}>
              <h2 className="font-display" style={{ fontSize:28, fontWeight:700, color:'#F0F0F8', letterSpacing:'-.5px', marginBottom:6 }}>
                Achievements
              </h2>
              <p style={{ fontSize:11, color:'rgba(255,255,255,.3)', fontFamily:'var(--font-jb)' }}>Tap anywhere to skip</p>
            </motion.div>

            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {achievements.length === 0 ? (
                <p style={{ textAlign:'center', color:'rgba(255,255,255,.35)', fontSize:13, padding:'24px 0' }}>
                  No achievements this round
                </p>
              ) : achievements.map((a, i) => {
                const cfg = ACH[a.type];
                return (
                  <motion.div key={a.type}
                    initial={{ opacity:0, x:-24, scale:.93 }} animate={{ opacity:1, x:0, scale:1 }}
                    transition={{ delay:.16+i*.11, type:'spring', stiffness:280, damping:24 }}
                    style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 16px', borderRadius:18,
                      background:'rgba(255,255,255,.05)', border:`1px solid ${cfg.color}28`,
                      backdropFilter:'blur(6px)' }}>
                    <div style={{ width:44, height:44, borderRadius:14, background:cfg.bg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                      <cfg.Icon size={20} color={cfg.color} strokeWidth={1.8} />
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:700, fontSize:14, color:cfg.color, marginBottom:2 }}>{LABELS[a.type]}</div>
                      <div style={{ fontSize:11, color:'rgba(255,255,255,.4)', fontFamily:'var(--font-jb)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {a.description}
                      </div>
                    </div>
                    <div style={{ flexShrink:0, display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                      <div style={{ width:36, height:36, borderRadius:'50%', background:cfg.color,
                        display:'flex', alignItems:'center', justifyContent:'center',
                        fontSize:14, fontWeight:700, color:'#0A0A0F', fontFamily:'var(--font-clash)' }}>
                        {a.username.slice(0,2).toUpperCase()}
                      </div>
                      <span style={{ fontSize:9, color:cfg.color, fontFamily:'var(--font-jb)', maxWidth:52, textAlign:'center', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {a.username}
                      </span>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* Progress bar */}
            <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:.5 }}
              style={{ marginTop:24, height:2, borderRadius:2, background:'rgba(255,255,255,.08)', overflow:'hidden' }}>
              <motion.div initial={{ width:'100%' }} animate={{ width:'0%' }}
                transition={{ duration:4.2, ease:'linear' }}
                style={{ height:'100%', background:'linear-gradient(90deg,#3B6EFF,#9B59FF)', borderRadius:2 }} />
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
