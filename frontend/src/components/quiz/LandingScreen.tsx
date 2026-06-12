'use client';
import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Hash, User, ArrowRight, AlertCircle, Loader2 } from 'lucide-react';
import { getSocket, saveSession } from '@/lib/socket';
import { useGameStore } from '@/store/gameStore';
import { resumeAudio } from '@/lib/sounds';

export default function LandingScreen() {
  const [code, setCode]         = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const { setPhase, setPlayerInfo, setPlayerCount } = useGameStore();

  const join = useCallback(() => {
    const c = code.trim().toUpperCase();
    const u = username.trim();
    if (!c) { setError('Enter your quiz code'); return; }
    if (!u || u.length < 2) { setError('Username needs at least 2 characters'); return; }
    resumeAudio();
    setLoading(true);
    setError('');

    const sk = getSocket();
    const timer = setTimeout(() => {
      setLoading(false);
      setError('Connection timeout — check your internet and try again.');
    }, 10000);

    sk.emit('join_quiz', { code: c, username: u }, (res: any) => {
      clearTimeout(timer);
      setLoading(false);
      if (res.success) {
        // Save session for reconnect
        saveSession({ role: 'player', code: c, playerId: res.playerId, username: u });
        setPlayerInfo(res.playerId, u, c, res.quizTheme);
        setPlayerCount(res.playerCount);
        setPhase('lobby');
      } else {
        setError(res.error || 'Could not join quiz');
      }
    });
  }, [code, username, setPhase, setPlayerInfo, setPlayerCount]);

  return (
    <div className="relative flex items-center justify-center min-h-screen overflow-hidden"
      style={{ background: '#0A0A0F' }}>
      <div className="mesh-bg" />
      <div className="dot-grid" style={{ opacity: .55 }} />

      {[
        { top:'10%',  right:'8%', w:280, h:280, c:'rgba(108,71,255,.14)', delay:0 },
        { bottom:'12%', left:'6%', w:240, h:240, c:'rgba(0,212,180,.07)',  delay:2 },
        { top:'55%',  right:'3%', w:140, h:140, c:'rgba(59,110,255,.1)',  delay:1 },
      ].map((o, i) => (
        <motion.div key={i}
          animate={{ y:[0,-10,0], opacity:[.6,.95,.6] }}
          transition={{ duration:6+i*2, repeat:Infinity, ease:'easeInOut', delay:o.delay }}
          className="absolute rounded-full pointer-events-none blur-3xl"
          style={{ width:o.w, height:o.h, background:o.c,
            ...Object.fromEntries(['top','right','bottom','left']
              .filter(k => k in o).map(k => [k,(o as any)[k]])) }} />
      ))}

      <div className="relative z-10 w-full max-w-[420px] mx-auto px-6 py-16">

        {/* Game name */}
        <motion.div initial={{ opacity:0, y:-16 }} animate={{ opacity:1, y:0 }}
          transition={{ duration:.5 }} style={{ textAlign:'center', marginBottom:12 }}>
          <h1 className="font-display" style={{
            fontSize:64, fontWeight:700, letterSpacing:'-3px', lineHeight:1,
            background:'linear-gradient(135deg,#ffffff 0%,#BCA2FF 50%,#6C47FF 100%)',
            WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent',
          }}>GenFrenzy</h1>
        </motion.div>

        {/* Tagline */}
        <motion.div initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }}
          transition={{ delay:.15, duration:.4 }}
          style={{ textAlign:'center', marginBottom:40 }}>
          <p style={{ fontSize:16, color:'#9898AA', fontWeight:500 }}>
            Ready to go frenzy, genfren?
          </p>
        </motion.div>

        {/* Form */}
        <motion.div initial={{ opacity:0, y:22, scale:.97 }} animate={{ opacity:1, y:0, scale:1 }}
          transition={{ delay:.25, duration:.4, ease:'easeOut' }}>
          <div className="p-6 rounded-2xl"
            style={{ background:'#18181F', border:'1px solid #25252E',
              boxShadow:'0 2px 0 rgba(255,255,255,.04), 0 24px 64px rgba(0,0,0,.65)' }}>
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

              <div>
                <label className="block mb-2 font-mono text-xs tracking-widest uppercase"
                  style={{ color:'#9898AA' }}>Quiz Code</label>
                <div style={{ position:'relative' }}>
                  <Hash size={14} style={{ position:'absolute', left:14, top:'50%',
                    transform:'translateY(-50%)', color:'#3A3A48', pointerEvents:'none' }} />
                  <input className="font-mono field" placeholder="ENTER CODE"
                    value={code} maxLength={8} autoComplete="off"
                    style={{ paddingLeft:40, fontSize:17, letterSpacing:'.2em', textTransform:'uppercase' }}
                    onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,''))}
                    onKeyDown={e => e.key==='Enter' && join()} />
                </div>
              </div>

              <div>
                <label className="block mb-2 font-mono text-xs tracking-widest uppercase"
                  style={{ color:'#9898AA' }}>Username</label>
                <div style={{ position:'relative' }}>
                  <User size={14} style={{ position:'absolute', left:14, top:'50%',
                    transform:'translateY(-50%)', color:'#3A3A48', pointerEvents:'none' }} />
                  <input className="field" placeholder="Your name"
                    value={username} maxLength={20} autoComplete="off"
                    style={{ paddingLeft:40 }}
                    onChange={e => setUsername(e.target.value)}
                    onKeyDown={e => e.key==='Enter' && join()} />
                </div>
              </div>

              <AnimatePresence>
                {error && (
                  <motion.div initial={{ opacity:0, height:0 }} animate={{ opacity:1, height:'auto' }}
                    exit={{ opacity:0, height:0 }}
                    style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 14px',
                      borderRadius:10, background:'rgba(255,77,106,.1)',
                      border:'1px solid rgba(255,77,106,.25)', color:'#FF6B82', fontSize:13 }}>
                    <AlertCircle size={13} style={{ flexShrink:0 }} /> {error}
                  </motion.div>
                )}
              </AnimatePresence>

              <motion.button onClick={join} disabled={loading}
                style={{
                  width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:8,
                  padding:'15px 24px', borderRadius:12, fontWeight:600, fontSize:15, color:'#fff',
                  background: loading
                    ? 'rgba(108,71,255,.4)'
                    : 'linear-gradient(135deg,#3B6EFF 0%,#6C47FF 55%,#9B59FF 100%)',
                  boxShadow: loading ? 'none'
                    : '0 8px 32px rgba(108,71,255,.45), inset 0 1px 0 rgba(255,255,255,.12)',
                  cursor: loading ? 'default' : 'pointer',
                  border:'none', position:'relative', overflow:'hidden',
                }}
                whileHover={!loading ? { scale:1.016, boxShadow:'0 12px 40px rgba(108,71,255,.55)' } : {}}
                whileTap={!loading ? { scale:.984 } : {}}>
                {!loading && (
                  <div style={{ position:'absolute', inset:0, pointerEvents:'none',
                    background:'linear-gradient(105deg,transparent 30%,rgba(255,255,255,.1) 50%,transparent 70%)',
                    backgroundSize:'200% 100%', animation:'shimmer 2.5s linear infinite' }} />
                )}
                {loading
                  ? <><Loader2 size={15} className="anim-spin" /> Joining…</>
                  : <><span>Join Quiz</span><ArrowRight size={15} /></>}
              </motion.button>
            </div>
          </div>
        </motion.div>

        <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:.5 }}
          style={{ textAlign:'center', marginTop:20 }}>
          <a href="/admin"
            style={{ fontSize:13, color:'#6B6B80', textDecoration:'none', transition:'color .2s' }}
            onMouseOver={e => (e.currentTarget.style.color='#9898AA')}
            onMouseOut={e  => (e.currentTarget.style.color='#6B6B80')}>
            Admin Dashboard →
          </a>
        </motion.div>
      </div>
    </div>
  );
}