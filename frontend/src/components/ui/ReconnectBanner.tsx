'use client';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '@/store/gameStore';
import { WifiOff } from 'lucide-react';

export default function ReconnectBanner() {
  const connected = useGameStore(s => s.connected);
  const phase     = useGameStore(s => s.phase);
  const show = !connected && phase !== 'landing';
  return (
    <AnimatePresence>
      {show && (
        <motion.div initial={{ y:-40 }} animate={{ y:0 }} exit={{ y:-40 }}
          className="fixed top-0 inset-x-0 z-50 flex items-center justify-center gap-2 py-2 text-xs font-medium"
          style={{ background:'rgba(255,77,106,0.15)', borderBottom:'1px solid rgba(255,77,106,0.3)', color:'#FF4D6A', backdropFilter:'blur(12px)' }}>
          <WifiOff size={12} />
          Reconnecting to server…
        </motion.div>
      )}
    </AnimatePresence>
  );
}
