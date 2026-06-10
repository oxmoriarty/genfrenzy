'use client';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '@/store/gameStore';
import { X, AlertCircle, CheckCircle2, Info } from 'lucide-react';

const ICONS = { error: AlertCircle, success: CheckCircle2, info: Info };
const COLORS = { error:'#FF4D6A', success:'#00C98D', info:'#6C47FF' };

export default function ToastStack() {
  const toasts = useGameStore(s => s.toasts);
  const remove = useGameStore(s => s.removeToast);
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map(t => {
          const Icon = ICONS[t.type||'info'];
          const color = COLORS[t.type||'info'];
          return (
            <motion.div key={t.id}
              initial={{ opacity:0, x:40, scale:.9 }}
              animate={{ opacity:1, x:0,  scale:1  }}
              exit={{    opacity:0, x:40, scale:.9  }}
              transition={{ duration:.2 }}
              className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm pointer-events-auto"
              style={{ background:'#18181F', border:'1px solid #25252E', boxShadow:'0 8px 32px rgba(0,0,0,.5)', color:'#F0F0F8', minWidth:240, maxWidth:320 }}>
              <Icon size={14} style={{ color, flexShrink:0 }} />
              <span className="flex-1 text-sm" style={{ color:'#C8C8D8' }}>{t.message}</span>
              <button onClick={() => remove(t.id)} className="flex-shrink-0 opacity-50 hover:opacity-100 transition-opacity">
                <X size={13} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
