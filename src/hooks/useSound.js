// =============================================================================
// FILE: src/hooks/useSound.js
// Batch 2: Sound system theo xqchess
//
// xqchess lessons:
//   - Sound files: /sounds/move.mp3, eat.mp3, check.mp3, join.mp3
//   - Priority: check > eat > move
//   - Audio priming: unlock browser autoplay policy trước khi play
//     (spectator/direct URL bị block vì không có user gesture)
//   - Mute/volume lưu localStorage (key: xq.sound.muted, xq.sound.volume)
//   - Volume default 0.85
//   - Clone node nếu audio element có sẵn trong DOM, else new Audio()
// =============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';

const SOUND_MUTED_KEY  = 'xq.sound.muted';
const SOUND_VOLUME_KEY = 'xq.sound.volume';
const DEFAULT_VOLUME   = 0.85;
const SOUNDS = ['move', 'eat', 'check', 'join'];

// ── Helpers (pure, không dùng React) ─────────────────────────────────────────

const getSavedMuted = () => {
  try { return localStorage.getItem(SOUND_MUTED_KEY) === 'true'; }
  catch { return false; }
};

const getSavedVolume = () => {
  try {
    const raw = localStorage.getItem(SOUND_VOLUME_KEY);
    const v = raw == null ? DEFAULT_VOLUME : parseFloat(raw);
    return isNaN(v) ? DEFAULT_VOLUME : Math.max(0, Math.min(1, v));
  } catch { return DEFAULT_VOLUME; }
};

const saveMuted = (muted) => {
  try { localStorage.setItem(SOUND_MUTED_KEY, muted ? 'true' : 'false'); } catch {}
};

const saveVolume = (v) => {
  try { localStorage.setItem(SOUND_VOLUME_KEY, String(Math.max(0, Math.min(1, v)))); } catch {}
};

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useSound() {
  const [isMuted, setIsMuted]   = useState(getSavedMuted);
  const [volume, setVolume]     = useState(getSavedVolume);
  const primedRef               = useRef(false);  // audio context unlocked?
  const audioPoolRef            = useRef({});      // preloaded Audio objects

  // ── Preload audio pool khi mount ────────────────────────────────────────────
  useEffect(() => {
    SOUNDS.forEach(name => {
      try {
        const a = new Audio(`/sounds/${name}.mp3`);
        a.preload = 'auto';
        audioPoolRef.current[name] = a;
      } catch {}
    });
  }, []);

  // ── Audio priming — xqchess style ───────────────────────────────────────────
  // Browser gate audio.play() behind user gesture (Chrome autoplay policy).
  // Spectators landing on /game/<id> directly get their first sound from WS
  // callback — not a gesture — so it's blocked.
  // Register capture-phase listeners; on gesture, silently play move.mp3 muted
  // to unlock the audio pipeline. Only mark primed after play() RESOLVES.
  useEffect(() => {
    if (primedRef.current) return;

    const events = ['click', 'touchstart', 'keydown', 'pointerdown'];
    let cleaned = false;

    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      events.forEach(ev => document.removeEventListener(ev, prime, true));
    };

    const prime = () => {
      if (primedRef.current) { cleanup(); return; }
      try {
        const a = new Audio('/sounds/move.mp3');
        a.muted = true;
        a.volume = 0;
        const p = a.play();
        if (p && p.then) {
          p.then(() => { primedRef.current = true; cleanup(); }).catch(() => {});
        } else {
          primedRef.current = true;
          cleanup();
        }
      } catch {}
    };

    events.forEach(ev => document.addEventListener(ev, prime, true));
    return cleanup;
  }, []);

  // ── Play ─────────────────────────────────────────────────────────────────────
  const play = useCallback((name) => {
    if (!name) return;
    const v = getSavedVolume();
    if (getSavedMuted() || v <= 0) return;

    try {
      // Ưu tiên clone từ pool (xqchess: cloneNode để tránh phải wait ended)
      const source = audioPoolRef.current[name];
      const audio = source ? source.cloneNode(true) : new Audio(`/sounds/${name}.mp3`);
      audio.volume = v;
      const p = audio.play();
      if (p && p.catch) p.catch(() => {});
    } catch {}
  }, []);

  // ── playMove: xqchess sound priority check > eat > move ─────────────────────
  const playMove = useCallback((soundName) => {
    // soundName đã được tính đúng priority trong useGameState
    play(soundName);
  }, [play]);

  const playJoin = useCallback(() => play('join'), [play]);

  // ── Controls ─────────────────────────────────────────────────────────────────
  const toggleMute = useCallback(() => {
    setIsMuted(prev => {
      const next = !prev;
      saveMuted(next);
      // Nếu unmute và volume = 0 → reset về default (xqchess behavior)
      if (!next && getSavedVolume() <= 0) {
        setVolume(DEFAULT_VOLUME);
        saveVolume(DEFAULT_VOLUME);
      }
      // Play test sound khi unmute
      if (!next) setTimeout(() => play('move'), 50);
      return next;
    });
  }, [play]);

  const setVolumeLevel = useCallback((v) => {
    const clamped = Math.max(0, Math.min(1, v));
    setVolume(clamped);
    saveVolume(clamped);
    setIsMuted(clamped <= 0);
    saveMuted(clamped <= 0);
  }, []);

  return {
    isMuted,
    volume,
    play,
    playMove,
    playJoin,
    toggleMute,
    setVolumeLevel,
  };
}