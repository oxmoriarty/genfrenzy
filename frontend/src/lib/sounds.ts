'use client';
let ctx: AudioContext | null = null;

function ac(): AudioContext {
  if (!ctx) ctx = new ((window as any).AudioContext || (window as any).webkitAudioContext)();
  return ctx!;
}

function tone(
  freq: number, type: OscillatorType,
  start: number, dur: number, gain: number,
  freqEnd?: number
) {
  const c = ac();
  const o = c.createOscillator();
  const g = c.createGain();
  o.connect(g);
  g.connect(c.destination);
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  if (freqEnd !== undefined) {
    o.frequency.linearRampToValueAtTime(freqEnd, start + dur);
  }
  g.gain.setValueAtTime(gain, start);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.start(start);
  o.stop(start + dur + 0.01);
}

export function playSound(
  s: 'correct' | 'wrong' | 'tick' | 'countdown' | 'fanfare' | 'achievement'
) {
  if (typeof window === 'undefined') return;
  try {
    const c = ac();
    const now = c.currentTime;

    if (s === 'tick') {
      // Soft, subtle wood-block style click — not intrusive
      tone(520, 'sine',     now,        0.045, 0.08);
      tone(260, 'sine',     now + 0.01, 0.035, 0.04);
    }

    if (s === 'countdown') {
      // Urgent rising blip for last 5 seconds — distinct from tick
      tone(880, 'sine',     now,        0.06,  0.18);
      tone(1100, 'sine',    now + 0.03, 0.06,  0.12);
    }

    if (s === 'correct') {
      // Bright rising chord — satisfying
      [523, 659, 784, 1047].forEach((f, i) =>
        tone(f, 'sine', now + i * 0.075, 0.22, 0.22)
      );
    }

    if (s === 'wrong') {
      // Descending dull thud
      tone(300, 'sawtooth', now,        0.10, 0.18, 180);
      tone(180, 'sawtooth', now + 0.10, 0.15, 0.12, 120);
    }

    if (s === 'fanfare') {
      // Victory fanfare
      [523, 659, 784, 659, 784, 1047].forEach((f, i) =>
        tone(f, 'triangle', now + i * 0.1, 0.22, 0.2)
      );
    }

    if (s === 'achievement') {
      // Sparkle unlock sound
      [440, 554, 659, 880, 1108].forEach((f, i) =>
        tone(f, 'sine', now + i * 0.07, 0.25, 0.18)
      );
    }
  } catch (_) {}
}

export function resumeAudio() {
  if (ctx?.state === 'suspended') ctx.resume();
}