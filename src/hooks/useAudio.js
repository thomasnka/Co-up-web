// src/hooks/useAudio.js
// Tách audio engine ra khỏi GameBoard để game board làm việc nhẹ hơn
import { useState, useCallback, useRef } from 'react';

export function useAudio() {
  const [isMuted, setIsMuted] = useState(
    () => localStorage.getItem('xq.muted') === 'true'
  );
  const audioCtxRef = useRef(null);

  // Lấy hoặc tạo AudioContext (lazy)
  const getCtx = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtxRef.current;
  }, []);

  // Prime AudioContext khi user tương tác lần đầu
  const primeAudio = useCallback(() => {
    try {
      const ctx = getCtx();
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    } catch (e) {}
  }, [getCtx]);

  const playSound = useCallback((type) => {
    if (isMuted) return;
    try {
      const ctx = getCtx();
      if (ctx.state === 'suspended') {
        ctx.resume().then(() => playSound(type));
        return;
      }
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      const now = ctx.currentTime;

      switch (type) {
        case 'move':
          osc.type = 'sine';
          osc.frequency.setValueAtTime(440, now);
          osc.frequency.exponentialRampToValueAtTime(330, now + 0.1);
          gain.gain.setValueAtTime(0.2, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
          osc.start(now); osc.stop(now + 0.1); break;
        case 'eat':
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(600, now);
          osc.frequency.exponentialRampToValueAtTime(200, now + 0.15);
          gain.gain.setValueAtTime(0.28, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
          osc.start(now); osc.stop(now + 0.16); break;
        case 'check':
          osc.type = 'square';
          osc.frequency.setValueAtTime(880, now);
          osc.frequency.setValueAtTime(1100, now + 0.1);
          gain.gain.setValueAtTime(0.12, now);
          gain.gain.setValueAtTime(0.12, now + 0.1);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
          osc.start(now); osc.stop(now + 0.25); break;
        case 'illegal':
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(220, now);
          osc.frequency.exponentialRampToValueAtTime(110, now + 0.12);
          gain.gain.setValueAtTime(0.15, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
          osc.start(now); osc.stop(now + 0.13); break;
        case 'join':
          osc.type = 'sine';
          osc.frequency.setValueAtTime(440, now);
          osc.frequency.exponentialRampToValueAtTime(880, now + 0.15);
          gain.gain.setValueAtTime(0.15, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
          osc.start(now); osc.stop(now + 0.2); break;
        default: return;
      }
    } catch (e) {}
  }, [isMuted, getCtx]);

  const toggleMute = useCallback(() => {
    setIsMuted(prev => {
      const next = !prev;
      localStorage.setItem('xq.muted', next);
      return next;
    });
  }, []);

  return { isMuted, playSound, toggleMute, primeAudio };
}
