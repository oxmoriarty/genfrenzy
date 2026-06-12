'use client';
import { motion } from 'framer-motion';
import { Users, Clock, Hash, User } from 'lucide-react';
import { useGameStore } from '@/store/gameStore';

export default function LobbyScreen() {
  const { quizTheme, playerCount, username, quizCode } = useGameStore();
  return (
    <div style={{ position:'relative', minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', overflow:'hidden', background:'#0A0A0F', padding:'24px' }}>
      <div className="mesh-bg" />
      <div className="dot-grid" style={{ opacity:.4 }} />
      <div style={{ position:'absolute', top:0, left:0, right:0, height:1, background:'linear-gradient(90deg,transparent,rgba(108,71,255,.6),transparent)' }} />

      <div style={{ position:'relative', zIndex:1, width:'100%', maxWidth:360 }}>

        {/* Theme */}
        <motion.div initial={{ opacity:0, y:14 }} animate={{ opacity:1, y:0 }}
          style={{ textAlign:'center', marginBottom:36 }}>
          <div style={{ fontSize:10, letterSpacing:'.18em', textTransform:'uppercase', color:'#6B6B80', fontFamily:'var(--font-jb)', marginBottom:10 }}>Today's Theme</div>
          <h1 className="font-display" style={{ fontSize:28, fontWeight:700, color:'#F0F0F8', letterSpacing:'-.5px', lineHeight:1.2 }}>
            {quizTheme || 'GenLayer Quiz'}
          </h1>
        </motion.div>

        {/* Player orb */}
        <motion.div initial={{ opacity:0, scale:.75 }} animate={{ opacity:1, scale:1 }}
          transition={{ delay:.1, type:'spring', stiffness:180, damping:20 }}
          style={{ display:'flex', flexDirection:'column', alignItems:'center', marginBottom:36 }}>
          <div style={{ position:'relative', marginBottom:16 }}>
            {[0,1,2].map(i => (
              <motion.div key={i} animate={{ scale:[1,1.65+i*.25], opacity:[.4,0] }}
                transition={{ duration:2.2, repeat:Infinity, delay:i*.7, ease:'easeOut' }}
                style={{ position:'absolute', inset:0, borderRadius:'50%', border:'1px solid rgba(108,71,255,.28)', pointerEvents:'none' }} />
            ))}
            <div style={{ width:128, height:128, borderRadius:'50%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
              background:'linear-gradient(145deg,#18181F 0%,#111118 100%)',
              border:'1px solid #25252E',
              boxShadow:'0 0 60px rgba(108,71,255,.2), 0 8px 32px rgba(0,0,0,.6)' }}>
              <motion.div key={playerCount} initial={{ scale:.5, opacity:0 }} animate={{ scale:1, opacity:1 }}
                transition={{ type:'spring', stiffness:400 }}
                className="font-display" style={{ fontSize:44, fontWeight:700, color:'#F0F0F8', lineHeight:1, letterSpacing:'-2px' }}>
                {playerCount}
              </motion.div>
              <div style={{ display:'flex', alignItems:'center', gap:5, marginTop:4, color:'#6B6B80', fontSize:11 }}>
                <Users size={10} /> players
              </div>
            </div>
          </div>

          {/* Dot avatars */}
          <div style={{ display:'flex', gap:5, flexWrap:'wrap', justifyContent:'center', maxWidth:200 }}>
            {[...Array(Math.min(playerCount,12))].map((_,i) => (
              <motion.div key={i} initial={{ scale:0 }} animate={{ scale:1 }} transition={{ delay:i*.05, type:'spring' }}
                style={{ width:8, height:8, borderRadius:'50%', background:`hsl(${200+i*14},60%,62%)`, opacity:.8 }} />
            ))}
            {playerCount>12 && <span style={{ fontSize:10, color:'#6B6B80', fontFamily:'var(--font-jb)' }}>+{playerCount-12}</span>}
          </div>
        </motion.div>

        {/* Info card */}
        <motion.div initial={{ opacity:0, y:18 }} animate={{ opacity:1, y:0 }} transition={{ delay:.2 }}
          style={{ borderRadius:20, padding:20, marginBottom:24, background:'#18181F', border:'1px solid #25252E', boxShadow:'0 4px 24px rgba(0,0,0,.45)' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            {[
              { Icon: User,  label:'You',  value: username||'', mono:false },
              { Icon: Hash,  label:'Room', value: quizCode||'', mono:true  },
            ].map(({ Icon, label, value, mono }) => (
              <div key={label} style={{ padding:'12px 14px', borderRadius:12, background:'#111118', border:'1px solid #25252E' }}>
                <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8, color:'#6B6B80', fontFamily:'var(--font-jb)', fontSize:10, textTransform:'uppercase', letterSpacing:'.12em' }}>
                  <Icon size={9} /> {label}
                </div>
                <div style={{ fontWeight:600, fontSize:14, color:'#F0F0F8', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                  fontFamily: mono ? 'var(--font-jb)' : 'inherit',
                  letterSpacing: mono ? '.18em' : 'normal' }}>
                  {value}
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Waiting */}
        <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:.3 }}
          style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:12 }}>
          <div style={{ display:'flex', alignItems:'center', gap:7, fontSize:13, color:'#9898AA' }}>
            <Clock size={13} /> Waiting for the host to start…
          </div>
          <div style={{ display:'flex', gap:6 }}>
            {[0,1,2].map(i => (
              <motion.div key={i} animate={{ y:[0,-6,0], opacity:[.3,1,.3] }}
                transition={{ duration:.9, repeat:Infinity, delay:i*.2, ease:'easeInOut' }}
                style={{ width:6, height:6, borderRadius:'50%', background:'#6C47FF' }} />
            ))}
          </div>
        </motion.div>

      </div>
    </div>
  );
}