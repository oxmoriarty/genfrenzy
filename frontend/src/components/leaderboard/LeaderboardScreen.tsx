'use client';
import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Trophy, Crown, Star, TrendingUp, Users } from 'lucide-react';
import { useGameStore } from '@/store/gameStore';
import { LeaderboardEntry } from '@/types';
import { playSound } from '@/lib/sounds';

const POD = [
  { rank:1, label:'Legendary Genfren', c:'#FFD700', glow:'rgba(255,215,0,.4)',    bg:'linear-gradient(145deg,rgba(255,215,0,.13),rgba(255,140,0,.07))',    border:'rgba(255,215,0,.3)',    tg:'linear-gradient(135deg,#FFD700,#FFA500)', h:100, sz:70 },
  { rank:2, label:'Elite Genfren',     c:'#C8C8E0', glow:'rgba(200,200,224,.28)', bg:'linear-gradient(145deg,rgba(200,200,224,.1),rgba(160,160,192,.05))', border:'rgba(200,200,224,.22)', tg:'linear-gradient(135deg,#E8E8F0,#9898B8)', h:76,  sz:58 },
  { rank:3, label:'Epic Genfren',      c:'#E8A96A', glow:'rgba(232,169,106,.28)', bg:'linear-gradient(145deg,rgba(232,169,106,.1),rgba(180,112,60,.05))',  border:'rgba(232,169,106,.22)', tg:'linear-gradient(135deg,#E8A96A,#B07040)', h:60,  sz:50 },
];

export default function LeaderboardScreen({ isFinal }: { isFinal: boolean }) {
  const lb       = useGameStore(s => s.leaderboard);
  const playerId = useGameStore(s => s.playerId);
  const myRank   = useGameStore(s => s.myRank);
  const setPhase = useGameStore(s => s.setPhase);

  useEffect(() => { if (isFinal) playSound('fanfare'); }, [isFinal]);

  // Mid-game: auto-advance after 4s (server drives timing, this is a safety fallback)
  useEffect(() => {
    if (isFinal) return;
    const t = setTimeout(() => {
      // Only advance if still on intermediate_leaderboard
      // (server will push new_question which changes phase anyway)
    }, 5000);
    return () => clearTimeout(t);
  }, [isFinal, setPhase]);

  const isMe = (e: LeaderboardEntry) => e.playerId === playerId;

  // Podium visual order: 2nd | 1st | 3rd
  const podiumOrder = [
    { entry: lb[1], p: POD[1] },
    { entry: lb[0], p: POD[0] },
    { entry: lb[2], p: POD[2] },
  ];

  return (
    <div style={{ position:'relative', minHeight:'100vh', display:'flex', flexDirection:'column', background:'#0A0A0F' }}>
      <div style={{ position:'absolute', top:0, left:0, right:0, height:320, pointerEvents:'none',
        background:'radial-gradient(ellipse 90% 60% at 50% 0%,rgba(108,71,255,.16) 0%,transparent 70%)' }}/>

      {/* Header */}
      <div style={{ position:'relative', zIndex:1, paddingTop:40, paddingBottom:16,
        paddingLeft:24, paddingRight:24, textAlign:'center' }}>
        <motion.div initial={{ opacity:0, y:-14 }} animate={{ opacity:1, y:0 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, marginBottom:8 }}>
            {isFinal
              ? <Trophy size={15} color="#FFB547"/>
              : <TrendingUp size={15} color="#6C47FF"/>}
            <span style={{ fontSize:10, letterSpacing:'.18em', textTransform:'uppercase',
              color:'#6B6B80', fontFamily:'var(--font-jb)' }}>
              {isFinal ? 'Final Results' : 'Standings'}
            </span>
          </div>
          <h2 className="font-display" style={{ fontSize:26, fontWeight:700,
            color:'#F0F0F8', letterSpacing:'-.5px' }}>
            {isFinal ? 'Quiz Complete' : 'Round Over'}
          </h2>
        </motion.div>
      </div>

      {/* ── FINAL ONLY: horizontal podium for top 3 ── */}
      {isFinal && (
        <div style={{ position:'relative', zIndex:1, padding:'0 16px 20px' }}>
          <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'center',
            gap:10, maxWidth:420, margin:'0 auto' }}>
            {podiumOrder.map(({ entry, p }, vi) => {
              if (!entry) return <div key={vi} style={{ flex:1 }}/>;
              const isFirst = p.rank === 1;
              const me = isMe(entry);
              return (
                <motion.div key={entry.playerId}
                  style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center' }}
                  initial={{ opacity:0, y:30 }} animate={{ opacity:1, y:0 }}
                  transition={{ delay:.06+vi*.1, type:'spring', stiffness:170, damping:22 }}>
                  {/* Crown above 1st only */}
                  {isFirst
                    ? <motion.div animate={{ y:[0,-4,0] }} transition={{ duration:2.2, repeat:Infinity, ease:'easeInOut' }} style={{ marginBottom:8 }}>
                        <Crown size={24} color={p.c} strokeWidth={1.5}/>
                      </motion.div>
                    : <div style={{ height:32 }}/>}
                  {/* Avatar */}
                  <div style={{ position:'relative', marginBottom:10 }}>
                    <div style={{ width:p.sz, height:p.sz, borderRadius:'50%',
                      background:`${p.c}18`, border:`2px solid ${p.c}55`,
                      boxShadow:`0 0 28px ${p.glow}, 0 4px 16px rgba(0,0,0,.6)`,
                      display:'flex', alignItems:'center', justifyContent:'center' }}>
                      <span className="font-display" style={{ fontSize:p.sz*.3, fontWeight:700, color:p.c }}>
                        {entry.username.slice(0,2).toUpperCase()}
                      </span>
                    </div>
                    <div style={{ position:'absolute', bottom:-4, right:-4, width:22, height:22,
                      borderRadius:'50%', background:'#18181F', border:`1.5px solid ${p.c}`,
                      color:p.c, display:'flex', alignItems:'center', justifyContent:'center',
                      fontSize:10, fontWeight:700, fontFamily:'var(--font-jb)' }}>{p.rank}</div>
                    {me && (
                      <div style={{ position:'absolute', top:-4, left:-4, width:20, height:20,
                        borderRadius:'50%', background:'#3B6EFF',
                        boxShadow:'0 0 10px rgba(59,110,255,.7)',
                        display:'flex', alignItems:'center', justifyContent:'center' }}>
                        <Star size={9} fill="#fff" color="#fff"/>
                      </div>
                    )}
                  </div>
                  {/* Pedestal */}
                  <div style={{ width:'100%', height:p.h, borderRadius:'14px 14px 0 0',
                    display:'flex', flexDirection:'column', alignItems:'center',
                    justifyContent:'flex-start', paddingTop:12, paddingLeft:6, paddingRight:6,
                    position:'relative', overflow:'hidden',
                    background:p.bg, border:`1px solid ${p.border}`, borderBottom:'none' }}>
                    <div style={{ position:'absolute', inset:0, pointerEvents:'none',
                      background:'linear-gradient(90deg,transparent 25%,rgba(255,255,255,.03) 50%,transparent 75%)',
                      backgroundSize:'200% 100%', animation:'shimmer 3.5s linear infinite' }}/>
                    <div style={{ fontWeight:600, fontSize:11, textAlign:'center',
                      color:'#C8C8D8', overflow:'hidden', textOverflow:'ellipsis',
                      whiteSpace:'nowrap', width:'90%' }}>
                      {entry.username}{me && <span style={{ color:'#9B59FF' }}>★</span>}
                    </div>
                    <div style={{ fontWeight:700, fontSize:isFirst?15:13, marginTop:4,
                      background:p.tg, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}
                      className="font-display">
                      {entry.score.toLocaleString()}
                    </div>
                    {isFirst && (
                      <div style={{ marginTop:5, fontSize:8, textAlign:'center',
                        letterSpacing:'.06em', textTransform:'uppercase',
                        color:`${p.c}70`, fontFamily:'var(--font-jb)', lineHeight:1.3 }}>
                        {p.label}
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── ALL entries vertical ──
           Mid: ranks 1-200 (everyone including top 3)
           Final: ranks 4-200 (top 3 shown above in podium) */}
      <div style={{ position:'relative', zIndex:1, flex:1, overflowY:'auto',
        padding:`0 16px ${myRank > (isFinal ? 3 : 0) ? '96px' : '24px'}` }}>
        <div style={{ maxWidth:520, margin:'0 auto', display:'flex', flexDirection:'column', gap:6 }}>
          {(isFinal ? lb.slice(3, 200) : lb.slice(0, 200)).length === 0 && (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
              gap:8, paddingTop:48, color:'#6B6B80' }}>
              <Users size={15}/> No rankings yet
            </div>
          )}
          {(isFinal ? lb.slice(3, 200) : lb.slice(0, 200)).map((entry, i) => {
            const me = isMe(entry);
            return (
              <motion.div key={entry.playerId}
                initial={{ opacity:0, x:-12 }} animate={{ opacity:1, x:0 }}
                transition={{ delay: Math.min(i * .02, .4) }}
                style={{ display:'flex', alignItems:'center', gap:12, padding:'11px 16px',
                  borderRadius:14,
                  background: me ? 'rgba(108,71,255,.1)' : '#18181F',
                  border:`1px solid ${me ? 'rgba(108,71,255,.28)' : '#25252E'}` }}>
                <div style={{ width:28, textAlign:'center', fontFamily:'var(--font-jb)',
                  fontSize:12, fontWeight:700, flexShrink:0,
                  color: entry.rank<=3
                    ? (entry.rank===1?'#FFD700':entry.rank===2?'#C8C8E0':'#E8A96A')
                    : entry.rank<=10 ? '#6C47FF' : '#3A3A48' }}>
                  {entry.rank}
                </div>
                <div style={{ width:32, height:32, borderRadius:10, flexShrink:0,
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontWeight:700, fontSize:11,
                  background: me?'rgba(108,71,255,.22)':'#111118',
                  color: me?'#9B59FF':'#9898AA',
                  border:`1px solid ${me?'rgba(108,71,255,.3)':'#25252E'}` }}>
                  {entry.username.slice(0,2).toUpperCase()}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <span style={{ fontSize:13, fontWeight:500, display:'block',
                    overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                    color: me?'#F0F0F8':'#C8C8D8' }}>
                    {entry.username}
                    {me && (
                      <span style={{ marginLeft:8, fontSize:10, padding:'2px 7px',
                        borderRadius:6, fontFamily:'var(--font-jb)', fontWeight:600,
                        background:'rgba(108,71,255,.2)', color:'#9B59FF' }}>you</span>
                    )}
                  </span>
                  <div style={{ display:'flex', gap:8, marginTop:2 }}>
                    {entry.correctAnswers > 0 && (
                      <span style={{ fontSize:10, color:'#00C98D', fontFamily:'var(--font-jb)' }}>
                        ✓{entry.correctAnswers}
                      </span>
                    )}
                    {(entry.partialAnswers??0) > 0 && (
                      <span style={{ fontSize:10, color:'#FFB547', fontFamily:'var(--font-jb)' }}>
                        ~{entry.partialAnswers}
                      </span>
                    )}
                    {(entry.incorrectAnswers??0) > 0 && (
                      <span style={{ fontSize:10, color:'#FF4D6A', fontFamily:'var(--font-jb)' }}>
                        ✗{entry.incorrectAnswers}
                      </span>
                    )}
                  </div>
                </div>
                <span style={{ fontFamily:'var(--font-jb)', fontWeight:700, fontSize:13,
                  flexShrink:0, color: me?'#F0F0F8':'#C8C8D8' }}>
                  {entry.score.toLocaleString()}
                </span>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Sticky my rank */}
      {((isFinal && myRank > 3) || (!isFinal && myRank > 0)) && (
        <motion.div initial={{ y:40, opacity:0 }} animate={{ y:0, opacity:1 }}
          style={{ position:'fixed', bottom:0, left:0, right:0, zIndex:20,
            padding:'12px 20px', background:'rgba(10,10,15,.97)',
            backdropFilter:'blur(16px)', borderTop:'1px solid #25252E' }}>
          <div style={{ maxWidth:520, margin:'0 auto', display:'flex',
            alignItems:'center', justifyContent:'space-between' }}>
            <div style={{ display:'flex', alignItems:'center', gap:6,
              fontSize:13, color:'#9898AA' }}>
              <TrendingUp size={13}/> Your position
            </div>
            <div className="font-display" style={{ fontSize:20, fontWeight:700,
              background:'linear-gradient(135deg,#3B6EFF,#9B59FF)',
              WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>
              #{myRank}
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}