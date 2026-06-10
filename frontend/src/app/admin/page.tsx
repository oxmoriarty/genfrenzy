'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Trash2, Check, Play, Users, Hash, BarChart2,
  ChevronRight, AlertCircle, Loader2, Copy, Image as ImageIcon,
  X, Download, CheckSquare,
} from 'lucide-react';
import { getSocket } from '@/lib/socket';

// ─── Types ─────────────────────────────────────────────────────────────────
interface QInput {
  text: string;
  imageBase64: string | null;
  options: string[];
  correctIndices: number[];       // multi-correct
}
interface PlayerRow { id: string; username: string; score: number; correctAnswers: number; partialAnswers: number; incorrectAnswers: number; questionResults: any[]; }
interface LBEntry { playerId: string; username: string; score: number; rank: number; correctAnswers: number; partialAnswers: number; }
type View = 'login' | 'create' | 'dashboard';

const BLANK_Q = (): QInput => ({ text:'', imageBase64:null, options:['','','',''], correctIndices:[] });

// ─── CSV export ────────────────────────────────────────────
function exportCSV(
  players: PlayerRow[],
  questions: any[],
  theme: string,
  quizCode: string
) {
  const sorted = [...players]
    .sort((a, b) => b.score - a.score)
    .map((p, i) => ({ ...p, rank: i + 1 }));

  const CRLF = '\r\n';

  const esc = (v: any): string => {
    const s = String(v ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\r') || s.includes('\n')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };

  const row = (...cols: any[]): string => cols.map(esc).join(',') + CRLF;

  let csv = '';

  // Quiz info
  csv += row('GenFrenzy Quiz Results');
  csv += row('Quiz Code', quizCode);
  csv += row('Theme', theme);
  csv += row('Total Players', sorted.length);
  csv += row('Total Questions', questions.length);
  csv += CRLF;

  // Leaderboard
  csv += row('LEADERBOARD');
  csv += row('Rank', 'Username', 'Total Score', 'Correct', 'Partial', 'Wrong', 'Max Streak');
  for (const p of sorted) {
    csv += row(p.rank, p.username, p.score, p.correctAnswers, p.partialAnswers || 0, p.incorrectAnswers || 0, 0);
  }
  csv += CRLF;

  // Per-question breakdown
  csv += row('QUESTION BREAKDOWN');
  const qResultHeaders = questions.map((_: any, i: number) => 'Q' + (i + 1) + ' Result');
  const qPointsHeaders  = questions.map((_: any, i: number) => 'Q' + (i + 1) + ' Points');
  csv += row('Rank', 'Username', 'Total Score', ...qResultHeaders, ...qPointsHeaders);
  for (const p of sorted) {
    const qr = p.questionResults || [];
    const results = questions.map((_: any, qi: number) => {
      const x = qr.find((r: any) => r.questionIndex === qi);
      return x ? (x.correct ? 'Correct' : x.partial ? 'Partial' : 'Wrong') : 'No answer';
    });
    const pts = questions.map((_: any, qi: number) => {
      const x = qr.find((r: any) => r.questionIndex === qi);
      return x?.pointsEarned ?? 0;
    });
    csv += row(p.rank, p.username, p.score, ...results, ...pts);
  }
  csv += CRLF;

  // Question reference
  csv += row('QUESTIONS');
  csv += row('Q#', 'Question Text', 'Type', 'Correct Options');
  for (let qi = 0; qi < questions.length; qi++) {
    const q = questions[qi];
    const correctOpts = (q.correctIndices as number[])
      .map((ci: number) => q.options[ci] || ('Option ' + (ci + 1)))
      .join(' | ');
    csv += row(
      'Q' + (qi + 1),
      q.text || ('Question ' + (qi + 1)),
      q.isMultipleChoice ? 'Multiple Choice' : 'Single Choice',
      correctOpts
    );
  }

  // Add BOM for Excel UTF-8 compatibility, then download
  const bom  = '\uFEFF';
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'GenFrenzy_' + quizCode + '_Results.csv';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
}

// ─── Main Component ────────────────────────────────────────────────────────
export default function AdminPage() {
  const [view,      setView]      = useState<View>('login');
  const [password,  setPassword]  = useState('');
  const [loginErr,  setLoginErr]  = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [theme,     setTheme]     = useState('');
  const [questions, setQuestions] = useState<QInput[]>([BLANK_Q()]);
  const [createErr, setCreateErr] = useState('');
  const [creating,  setCreating]  = useState(false);
  const [quizCode,  setQuizCode]  = useState('');
  const [status,    setStatus]    = useState<'waiting'|'active'|'ended'>('waiting');
  const [players,   setPlayers]   = useState<PlayerRow[]>([]);
  const [lb,        setLb]        = useState<LBEntry[]>([]);
  const [totalQ,    setTotalQ]    = useState(0);
  const [currentQ,  setCurrentQ]  = useState(0);
  const [starting,  setStarting]  = useState(false);
  const [copied,    setCopied]    = useState(false);
  const [exporting, setExporting] = useState(false);
  const codeRef = useRef(quizCode);
  codeRef.current = quizCode;

  const sk = getSocket();

  const refresh = useCallback(() => {
    if (!codeRef.current) return;
    sk.emit('admin_get_dashboard', { code:codeRef.current }, (res:any) => {
      if (!res.success) return;
      setPlayers(res.players); setLb(res.leaderboard);
      setStatus(res.quiz.status); setCurrentQ(res.quiz.currentQuestionIndex);
    });
  }, []);

  useEffect(() => {
    if (view !== 'dashboard') return;
    sk.on('player_joined', (d:any) => { if (d.players) setPlayers(d.players); refresh(); });
    sk.on('player_left',   refresh);
    sk.on('leaderboard_update', (d:any) => setLb(d.leaderboard||[]));
    sk.on('quiz_ended', (d:any) => { setLb(d.leaderboard||[]); setStatus('ended'); });
    const iv = setInterval(refresh, 5000);
    refresh();
    return () => {
      sk.off('player_joined'); sk.off('player_left');
      sk.off('leaderboard_update'); sk.off('quiz_ended');
      clearInterval(iv);
    };
  }, [view, refresh]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const login = () => {
    if (!password.trim()) { setLoginErr('Enter the admin password'); return; }
    setLoginLoading(true);
    setLoginErr('');
    sk.emit('admin_verify', { password }, (res: any) => {
      setLoginLoading(false);
      if (res.success) {
        setView('create');
      } else {
        setLoginErr('Wrong password. Try again.');
        setPassword('');
      }
    });
  };

  const create = () => {
    if (!theme.trim()) { setCreateErr('Enter a quiz theme'); return; }
    if (questions.some(q => !q.text.trim() && !q.imageBase64)) { setCreateErr('Every question needs text or an image'); return; }
    if (questions.some(q => q.options.some(o => !o.trim()))) { setCreateErr('Fill all option fields'); return; }
    if (questions.some(q => q.correctIndices.length === 0)) { setCreateErr('Mark at least one correct answer per question'); return; }
    setCreating(true); setCreateErr('');
    sk.emit('admin_create_quiz', { password, theme, questions }, (res:any) => {
      setCreating(false);
      if (res.success) { setQuizCode(res.code); setTotalQ(questions.length); setView('dashboard'); }
      else setCreateErr(res.error || 'Failed to create quiz');
    });
  };

  const startQuiz = () => {
    setStarting(true);
    sk.emit('admin_start_quiz', { password, code:quizCode }, (res:any) => {
      setStarting(false);
      if (res.success) setStatus('active');
    });
  };

  const doExport = () => {
    setExporting(true);
    sk.emit('admin_export_data', { password, code:quizCode }, (res:any) => {
      setExporting(false);
      if (!res.success) { alert(res.error || 'Export failed'); return; }
      exportCSV(res.exportData, res.questions, res.theme, quizCode);
    });
  };

  const copyCode = () => {
    navigator.clipboard.writeText(quizCode).then(() => { setCopied(true); setTimeout(()=>setCopied(false),2000); });
  };

  // ── Question helpers ──────────────────────────────────────────────────────
  const updateQ   = (i:number, f:keyof QInput, v:any) => setQuestions(qs => { const n=[...qs]; (n[i] as any)[f]=v; return n; });
  const updateOpt = (qi:number, oi:number, v:string)  => setQuestions(qs => { const n=[...qs]; n[qi].options[oi]=v; return n; });
  const addQ      = () => setQuestions(qs => [...qs, BLANK_Q()]);
  const removeQ   = (i:number) => setQuestions(qs => qs.filter((_,j)=>j!==i));

  const toggleCorrect = (qi:number, oi:number) => {
    setQuestions(qs => {
      const n = [...qs];
      const curr = n[qi].correctIndices;
      n[qi].correctIndices = curr.includes(oi) ? curr.filter(x=>x!==oi) : [...curr, oi];
      return n;
    });
  };

  const handleImageUpload = (qi:number, file: File) => {
    if (!file.type.startsWith('image/')) return;
    if (file.size > 5 * 1024 * 1024) { alert('Image must be under 5MB'); return; }
    const reader = new FileReader();
    reader.onload = (e) => updateQ(qi, 'imageBase64', e.target?.result as string);
    reader.readAsDataURL(file);
  };

  // ── Shared style tokens ───────────────────────────────────────────────────
  const card  = { background:'#18181F' as const, border:'1px solid #25252E' as const, borderRadius:20 };
  const rowStyle = { display:'flex' as const, alignItems:'center' as const, gap:10, padding:'10px 18px', borderBottom:'1px solid #111118' as const };

  // ── LOGIN ─────────────────────────────────────────────────────────────────
  if (view==='login') return (
    <div style={{ minHeight:'100vh', background:'#0A0A0F', display:'flex', alignItems:'center', justifyContent:'center', padding:24, position:'relative' }}>
      <div className="mesh-bg" /><div className="dot-grid" style={{ opacity:.4 }} />
      <motion.div initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }}
        style={{ position:'relative', zIndex:1, width:'100%', maxWidth:380 }}>
        <div style={{ textAlign:'center', marginBottom:36 }}>
          <h1 className="font-display" style={{ fontSize:26, fontWeight:700, color:'#F0F0F8', letterSpacing:'-.5px', marginBottom:6 }}>Admin Dashboard</h1>
          <p style={{ fontSize:13, color:'#6B6B80' }}>Login to create a quiz</p>
        </div>
        <div style={{ ...card, padding:28 }}>
          <label style={{ display:'block', fontSize:10, letterSpacing:'.16em', textTransform:'uppercase', color:'#9898AA', fontFamily:'var(--font-jb)', marginBottom:10 }}>Password</label>
          <input type="password" className="field" placeholder="••••••••••"
            value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==='Enter'&&login()}
            style={{ marginBottom:loginErr?12:16 }} />
          {loginErr && <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'#FF6B82', marginBottom:12 }}><AlertCircle size={12}/>{loginErr}</div>}
          <motion.button onClick={login} disabled={loginLoading}
            whileHover={!loginLoading ? { scale:1.015 } : {}}
            whileTap={!loginLoading ? { scale:.985 } : {}}
            style={{ width:'100%', padding:'13px', borderRadius:12, border:'none',
              cursor: loginLoading ? 'default' : 'pointer', fontWeight:600, fontSize:14, color:'#fff',
              background: loginLoading ? 'rgba(59,110,255,0.5)' : 'linear-gradient(135deg,#3B6EFF,#6C47FF)',
              boxShadow: loginLoading ? 'none' : '0 8px 28px rgba(108,71,255,.4)',
              display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
            {loginLoading
              ? <><Loader2 size={15} className="anim-spin" /> Verifying…</>
              : 'Enter Dashboard'}
          </motion.button>
        </div>

      </motion.div>
    </div>
  );

  // ── CREATE ────────────────────────────────────────────────────────────────
  if (view==='create') return (
    <div style={{ minHeight:'100vh', background:'#0A0A0F' }}>
      <div style={{ position:'sticky', top:0, zIndex:10, background:'rgba(10,10,15,.97)', backdropFilter:'blur(16px)', borderBottom:'1px solid #25252E', padding:'14px 24px' }}>
        <div style={{ maxWidth:720, margin:'0 auto', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <div className="font-display" style={{ fontSize:17, fontWeight:700, color:'#F0F0F8' }}>Create Quiz</div>
            <div style={{ fontSize:11, color:'#6B6B80' }}>{questions.length} question{questions.length!==1?'s':''} · {theme||'No theme set'}</div>
          </div>
          <motion.button onClick={create} disabled={creating} whileHover={!creating?{scale:1.016}:{}} whileTap={!creating?{scale:.984}:{}}
            style={{ display:'flex', alignItems:'center', gap:7, padding:'10px 20px', borderRadius:12, border:'none',
              cursor:creating?'default':'pointer', fontWeight:600, fontSize:13, color:'#fff',
              background:creating?'rgba(108,71,255,.4)':'linear-gradient(135deg,#3B6EFF,#6C47FF)',
              boxShadow:creating?'none':'0 6px 20px rgba(108,71,255,.4)' }}>
            {creating ? <><Loader2 size={13} className="anim-spin"/>Creating…</> : <>Create Quiz<ChevronRight size={14}/></>}
          </motion.button>
        </div>
      </div>

      <div style={{ maxWidth:720, margin:'0 auto', padding:'24px 24px 80px', display:'flex', flexDirection:'column', gap:16 }}>
        {createErr && (
          <div style={{ display:'flex', alignItems:'center', gap:8, padding:'12px 16px', borderRadius:12, background:'rgba(255,77,106,.1)', border:'1px solid rgba(255,77,106,.25)', color:'#FF6B82', fontSize:13 }}>
            <AlertCircle size={13}/>{createErr}
          </div>
        )}

        {/* Theme */}
        <div style={{ ...card, padding:20 }}>
          <label style={{ display:'block', fontSize:10, letterSpacing:'.16em', textTransform:'uppercase', color:'#9898AA', fontFamily:'var(--font-jb)', marginBottom:10 }}>Quiz Theme</label>
          <input className="field" placeholder="e.g. GenLayer Fundamentals" value={theme} onChange={e=>setTheme(e.target.value)} />
        </div>

        {/* Questions */}
        {questions.map((q, qi) => {
          const isMulti = q.correctIndices.length > 1;
          return (
            <motion.div key={qi} initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} style={{ ...card, padding:22 }}>
              {/* Header */}
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{ width:26, height:26, borderRadius:8, background:'rgba(108,71,255,.2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color:'#6C47FF', fontFamily:'var(--font-jb)' }}>{qi+1}</div>
                  <span style={{ fontSize:12, color:'#9898AA', fontFamily:'var(--font-jb)', textTransform:'uppercase', letterSpacing:'.1em' }}>Question {qi+1}</span>
                  {isMulti && <span style={{ padding:'2px 8px', borderRadius:100, fontSize:9, fontWeight:600, background:'rgba(155,89,255,.18)', color:'#9B59FF', fontFamily:'var(--font-jb)', border:'1px solid rgba(155,89,255,.3)' }}>MULTI-CORRECT</span>}
                </div>
                {questions.length > 1 && (
                  <button onClick={()=>removeQ(qi)} style={{ display:'flex', alignItems:'center', gap:4, background:'none', border:'none', cursor:'pointer', color:'#6B6B80', fontSize:12, padding:'4px 8px', borderRadius:8, transition:'color .15s' }}
                    onMouseOver={e=>(e.currentTarget.style.color='#FF4D6A')} onMouseOut={e=>(e.currentTarget.style.color='#6B6B80')}>
                    <Trash2 size={12}/>Remove
                  </button>
                )}
              </div>

              {/* Question text */}
              <input className="field" placeholder="Question text (optional if image is provided)"
                value={q.text} onChange={e=>updateQ(qi,'text',e.target.value)} style={{ marginBottom:12 }} />

              {/* Image upload */}
              <div style={{ marginBottom:14 }}>
                {q.imageBase64 ? (
                  <div style={{ position:'relative', borderRadius:12, overflow:'hidden', border:'1px solid #25252E', background:'#111118' }}>
                    <img src={q.imageBase64} alt="question" style={{ width:'100%', maxHeight:200, objectFit:'contain', display:'block' }} />
                    <button onClick={()=>updateQ(qi,'imageBase64',null)}
                      style={{ position:'absolute', top:8, right:8, width:28, height:28, borderRadius:'50%', background:'rgba(0,0,0,.7)', border:'1px solid #3A3A48', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#F0F0F8' }}>
                      <X size={13}/>
                    </button>
                  </div>
                ) : (
                  <label style={{ display:'flex', alignItems:'center', gap:8, padding:'11px 14px', borderRadius:12, border:'1.5px dashed #3A3A48', cursor:'pointer', color:'#6B6B80', fontSize:13, transition:'border-color .2s, color .2s' }}
                    onMouseOver={e=>{(e.currentTarget as HTMLElement).style.borderColor='#6C47FF';(e.currentTarget as HTMLElement).style.color='#9B59FF';}}
                    onMouseOut={e=>{(e.currentTarget as HTMLElement).style.borderColor='#3A3A48';(e.currentTarget as HTMLElement).style.color='#6B6B80';}}>
                    <ImageIcon size={15}/> Upload image (optional · max 5MB)
                    <input type="file" accept="image/*" style={{ display:'none' }} onChange={e=>e.target.files?.[0]&&handleImageUpload(qi,e.target.files[0])} />
                  </label>
                )}
              </div>

              {/* Options + correct toggles */}
              <div style={{ marginBottom:10 }}>
                <div style={{ fontSize:10, color:'#6B6B80', fontFamily:'var(--font-jb)', letterSpacing:'.12em', textTransform:'uppercase', marginBottom:10 }}>
                  Options · <span style={{ color:'#9B59FF' }}>click ✓ to mark correct (multiple allowed)</span>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:9 }}>
                  {q.options.map((opt, oi) => {
                    const isCorrect = q.correctIndices.includes(oi);
                    return (
                      <div key={oi} style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <button onClick={()=>toggleCorrect(qi,oi)}
                          style={{ width:24, height:24, borderRadius:7, border:`2px solid ${isCorrect?'#00C98D':'#3A3A48'}`,
                            background:isCorrect?'#00C98D':'transparent', flexShrink:0, cursor:'pointer',
                            display:'flex', alignItems:'center', justifyContent:'center', transition:'all .15s' }}>
                          {isCorrect && <Check size={12} color="#fff" strokeWidth={2.5}/>}
                        </button>
                        <div style={{ flex:1, display:'flex', alignItems:'center', gap:6, background:'#111118', border:'1px solid #25252E', borderRadius:10, padding:'0 10px', height:40 }}>
                          <span style={{ fontFamily:'var(--font-jb)', fontSize:11, fontWeight:700, color:'#6B6B80', width:16 }}>{'ABCD'[oi]}</span>
                          <input value={opt} onChange={e=>updateOpt(qi,oi,e.target.value)} placeholder={`Option ${'ABCD'[oi]}`}
                            style={{ flex:1, background:'none', border:'none', outline:'none', fontSize:13, color:'#F0F0F8', fontFamily:'var(--font-plus)' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              {q.correctIndices.length > 0 && (
                <div style={{ fontSize:11, color:'#00C98D', fontFamily:'var(--font-jb)' }}>
                  ✓ Marked correct: {q.correctIndices.map(i=>'ABCD'[i]).join(', ')}
                  {q.correctIndices.length > 1 && <span style={{ color:'#9B59FF', marginLeft:8 }}>· Multi-correct question</span>}
                </div>
              )}
            </motion.div>
          );
        })}

        <motion.button onClick={addQ} whileHover={{ borderColor:'#6C47FF', color:'#9B59FF' }}
          style={{ padding:'14px', borderRadius:18, border:'1.5px dashed #25252E', background:'none', cursor:'pointer', fontSize:13, color:'#6B6B80', display:'flex', alignItems:'center', justifyContent:'center', gap:8, transition:'all .2s' }}>
          <Plus size={14}/>Add Question
        </motion.button>
      </div>
    </div>
  );

  // ── DASHBOARD ─────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight:'100vh', background:'#0A0A0F' }}>
      <div className="mesh-bg" />

      {/* Header */}
      <div style={{ position:'relative', zIndex:1, background:'rgba(17,17,24,.97)', borderBottom:'1px solid #25252E', padding:'20px 24px' }}>
        <div style={{ maxWidth:960, margin:'0 auto', display:'flex', flexWrap:'wrap', alignItems:'center', justifyContent:'space-between', gap:16 }}>
          <div>
            <div style={{ marginBottom:10 }}>
              <h1 className="font-display" style={{ fontSize:20, fontWeight:700, color:'#F0F0F8' }}>Admin Dashboard</h1>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
              <span style={{ fontSize:11, color:'#6B6B80', fontFamily:'var(--font-jb)' }}>Code:</span>
              <code style={{ fontSize:18, fontWeight:700, color:'#F0F0F8', fontFamily:'var(--font-jb)', letterSpacing:'.2em', background:'rgba(255,255,255,.06)', padding:'3px 12px', borderRadius:8 }}>{quizCode}</code>
              <button onClick={copyCode}
                style={{ display:'flex', alignItems:'center', gap:5, padding:'5px 10px', borderRadius:8, border:'1px solid #25252E', background:'none', cursor:'pointer', fontSize:11, color:'#9898AA', transition:'all .2s' }}>
                {copied ? <><Check size={11} color="#00C98D"/>Copied!</> : <><Copy size={11}/>Copy</>}
              </button>
              <span style={{ display:'flex', alignItems:'center', gap:5, padding:'4px 10px', borderRadius:100, fontSize:11, fontFamily:'var(--font-jb)',
                background: status==='active'?'rgba(0,201,141,.15)':status==='ended'?'rgba(255,77,106,.15)':'rgba(255,255,255,.07)',
                color: status==='active'?'#00C98D':status==='ended'?'#FF4D6A':'#9898AA',
                border:`1px solid ${status==='active'?'rgba(0,201,141,.3)':status==='ended'?'rgba(255,77,106,.3)':'#25252E'}` }}>
                <motion.span animate={{ opacity:[1,.4,1] }} transition={{ duration:1.5, repeat:Infinity }}
                  style={{ width:6, height:6, borderRadius:'50%', display:'inline-block', background:'currentColor' }} />
                {status==='waiting'?'Waiting':status==='active'?'Live':'Ended'}
              </span>
            </div>
          </div>

          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            {status==='active' && (
              <div style={{ textAlign:'center' }}>
                <div style={{ fontSize:10, color:'#6B6B80', fontFamily:'var(--font-jb)', marginBottom:2 }}>QUESTION</div>
                <div className="font-display" style={{ fontSize:22, fontWeight:700, color:'#F0F0F8' }}>{currentQ+1}/{totalQ}</div>
              </div>
            )}
            {status==='ended' && (
              <motion.button onClick={doExport} disabled={exporting}
                whileHover={!exporting?{scale:1.03,boxShadow:'0 12px 36px rgba(0,212,180,.4)'}:{}}
                whileTap={!exporting?{scale:.97}:{}}
                style={{ display:'flex', alignItems:'center', gap:8, padding:'11px 22px', borderRadius:14, border:'none', cursor:exporting?'default':'pointer', fontWeight:700, fontSize:14, color:'#fff',
                  background:exporting?'rgba(0,212,180,.3)':'linear-gradient(135deg,#00A88E,#00D4B4)',
                  boxShadow:'0 8px 28px rgba(0,212,180,.3)' }}>
                {exporting ? <><Loader2 size={14} className="anim-spin"/>Exporting…</> : <><Download size={14}/>Download CSV</>}
              </motion.button>
            )}
            {status==='waiting' && (
              <motion.button onClick={startQuiz} disabled={starting}
                whileHover={!starting?{scale:1.03,boxShadow:'0 12px 36px rgba(0,201,141,.45)'}:{}}
                whileTap={!starting?{scale:.97}:{}}
                style={{ display:'flex', alignItems:'center', gap:8, padding:'12px 28px', borderRadius:14, border:'none', cursor:starting?'default':'pointer', fontWeight:700, fontSize:15, color:'#fff',
                  background:starting?'rgba(0,201,141,.35)':'linear-gradient(135deg,#059669,#00C98D)',
                  boxShadow:'0 8px 28px rgba(0,201,141,.35)' }}>
                {starting ? <><Loader2 size={15} className="anim-spin"/>Starting…</> : <><Play size={15} fill="#fff"/>Start Quiz</>}
              </motion.button>
            )}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ position:'relative', zIndex:1, maxWidth:960, margin:'0 auto', padding:'20px 24px 0' }}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:20 }}>
          {[
            { Icon:Users,     label:'Players',   value:players.length },
            { Icon:Hash,      label:'Questions', value:totalQ },
            { Icon:BarChart2, label:'Top Score', value:lb[0]?.score?.toLocaleString()||'—' },
          ].map(({ Icon, label, value }) => (
            <div key={label} style={{ ...card, padding:'16px 20px', display:'flex', alignItems:'center', gap:12 }}>
              <div style={{ width:36, height:36, borderRadius:10, background:'rgba(108,71,255,.15)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <Icon size={16} color="#6C47FF" />
              </div>
              <div>
                <div style={{ fontSize:10, color:'#6B6B80', fontFamily:'var(--font-jb)', textTransform:'uppercase', letterSpacing:'.12em', marginBottom:3 }}>{label}</div>
                <div className="font-display" style={{ fontSize:22, fontWeight:700, color:'#F0F0F8', letterSpacing:'-.5px' }}>{value}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Tables */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, paddingBottom:40 }}>
          {/* Players */}
          <div style={{ ...card, padding:0, overflow:'hidden' }}>
            <div style={{ padding:'14px 18px', borderBottom:'1px solid #25252E', display:'flex', alignItems:'center', gap:8 }}>
              <Users size={13} color="#6C47FF" />
              <span style={{ fontWeight:600, fontSize:13, color:'#F0F0F8' }}>Players</span>
              <span style={{ marginLeft:'auto', fontSize:11, color:'#6B6B80', fontFamily:'var(--font-jb)' }}>{players.length}</span>
            </div>
            <div style={{ maxHeight:340, overflowY:'auto' }}>
              {players.length===0 ? (
                <div style={{ padding:'32px 18px', textAlign:'center', fontSize:13, color:'#6B6B80' }}>Waiting for players…</div>
              ) : players.map((p,i) => (
                <motion.div key={p.id} initial={{ opacity:0, x:-8 }} animate={{ opacity:1, x:0 }} transition={{ delay:i*.04 }}
                  style={{ ...rowStyle }}>
                  <div style={{ width:28, height:28, borderRadius:9, background:'rgba(108,71,255,.18)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:'#6C47FF', flexShrink:0 }}>
                    {p.username.slice(0,2).toUpperCase()}
                  </div>
                  <span style={{ flex:1, fontSize:13, color:'#C8C8D8', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.username}</span>
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:2 }}>
                    <span style={{ fontSize:12, fontWeight:700, color:'#6C47FF', fontFamily:'var(--font-jb)' }}>{p.score.toLocaleString()}</span>
                    <span style={{ fontSize:9, color:'#6B6B80', fontFamily:'var(--font-jb)' }}>✓{p.correctAnswers} ~{p.partialAnswers||0} ✗{p.incorrectAnswers||0}</span>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Rankings */}
          <div style={{ ...card, padding:0, overflow:'hidden' }}>
            <div style={{ padding:'14px 18px', borderBottom:'1px solid #25252E', display:'flex', alignItems:'center', gap:8 }}>
              <BarChart2 size={13} color="#6C47FF" />
              <span style={{ fontWeight:600, fontSize:13, color:'#F0F0F8' }}>Live Rankings</span>
              {status==='ended' && (
                <button onClick={doExport} disabled={exporting}
                  style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:5, padding:'5px 10px', borderRadius:8, border:'1px solid rgba(0,212,180,.3)', background:'rgba(0,212,180,.1)', cursor:'pointer', fontSize:11, color:'#00D4B4', fontWeight:600 }}>
                  <Download size={11}/> CSV
                </button>
              )}
            </div>
            <div style={{ maxHeight:340, overflowY:'auto' }}>
              {lb.length===0 ? (
                <div style={{ padding:'32px 18px', textAlign:'center', fontSize:13, color:'#6B6B80' }}>Rankings appear after quiz starts</div>
              ) : lb.slice(0,30).map(e => (
                <div key={e.playerId} style={{ ...rowStyle, background: e.rank<=3?'rgba(108,71,255,.06)':'transparent' }}>
                  <span style={{ width:24, textAlign:'center', fontSize:11, fontWeight:700, fontFamily:'var(--font-jb)', flexShrink:0,
                    color: e.rank===1?'#FFD700':e.rank===2?'#C8C8E0':e.rank===3?'#E8A96A':'#3A3A48' }}>
                    #{e.rank}
                  </span>
                  <span style={{ flex:1, fontSize:13, color:'#C8C8D8', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{e.username}</span>
                  <span style={{ fontSize:12, fontWeight:700, color:'#6C47FF', fontFamily:'var(--font-jb)' }}>{e.score.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}