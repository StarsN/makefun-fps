// audio.js — every sound in Breachline is synthesised with WebAudio: noise
// bursts through filters for gunfire, sine blips for the bomb and the UI, a
// filtered boom for explosions. No audio files, nothing fetched. Sounds are
// fire-and-forget; a call before the first user gesture is silently dropped.

let ctx = null, master = null, noiseBuf = null;

export function unlockAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch { ctx = null; }
}

function noise(dur, { vol = 0.5, freq = 1200, q = 0.8, type = 'lowpass', slide = 0, delay = 0 } = {}) {
  if (!ctx) return;
  const t0 = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.playbackRate.value = 0.7 + Math.random() * 0.6;
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.setValueAtTime(freq, t0); f.Q.value = q;
  if (slide) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t0); src.stop(t0 + dur + 0.05);
}

function tone(freq, dur, { vol = 0.3, type = 'sine', slide = 0, delay = 0 } = {}) {
  if (!ctx) return;
  const t0 = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g).connect(master);
  o.start(t0); o.stop(t0 + dur + 0.05);
}

/** A gunshot: crack + body. vol scales with distance; own shots pass 1. */
export function sfxShot(kind, vol) {
  if (vol <= 0.01) return;
  if (kind === 'lance') {
    noise(0.34, { vol: vol * 0.9, freq: 2600, slide: -2200 });
    tone(90, 0.22, { vol: vol * 0.7, type: 'triangle', slide: -50 });
  } else if (kind === 'p9') {
    noise(0.13, { vol: vol * 0.55, freq: 2100, slide: -1400 });
  } else if (kind === 'vk7') {
    noise(0.11, { vol: vol * 0.5, freq: 1900, slide: -1200 });
  } else {
    noise(0.17, { vol: vol * 0.65, freq: 1700, slide: -1200 });
    tone(120, 0.1, { vol: vol * 0.35, type: 'triangle', slide: -60 });
  }
}

export const sfxDry = () => tone(1400, 0.05, { vol: 0.15, type: 'square' });
export const sfxReload = () => { noise(0.07, { vol: 0.2, freq: 900 }); tone(500, 0.05, { vol: 0.12, delay: 0.09 }); noise(0.06, { vol: 0.22, freq: 1300, delay: 0.2 }); };
export const sfxHit = (head) => tone(head ? 1750 : 1250, 0.06, { vol: 0.22, type: 'square' });
export const sfxKill = () => { tone(880, 0.07, { vol: 0.2, type: 'square' }); tone(1320, 0.1, { vol: 0.2, type: 'square', delay: 0.07 }); };
export const sfxHurt = () => noise(0.12, { vol: 0.3, freq: 500 });
export const sfxThrow = () => noise(0.16, { vol: 0.12, freq: 800, type: 'bandpass', slide: 500 });
export const sfxFlash = () => { tone(3400, 0.5, { vol: 0.16, slide: -2600 }); noise(0.2, { vol: 0.2, freq: 4000, type: 'highpass' }); };
export const sfxSmoke = () => noise(0.7, { vol: 0.14, freq: 2600, type: 'bandpass', slide: -1400 });
export const sfxBeep = (hi = false) => tone(hi ? 1560 : 1040, 0.07, { vol: 0.16, type: 'square' });
export const sfxPlant = () => { tone(660, 0.08, { vol: 0.18, type: 'square' }); tone(990, 0.09, { vol: 0.18, type: 'square', delay: 0.1 }); };
export const sfxClick = () => tone(1150, 0.04, { vol: 0.14, type: 'square' });
export const sfxError = () => tone(180, 0.14, { vol: 0.16, type: 'sawtooth' });
export function sfxExplosion(big = 1) {
  noise(1.1 * big, { vol: 0.85, freq: 900, slide: -820 });
  tone(55, 0.8 * big, { vol: 0.8, type: 'sine', slide: -25 });
}
export function sfxRoundEnd(win) {
  if (win) { tone(523, 0.14, { vol: 0.2, type: 'triangle' }); tone(784, 0.22, { vol: 0.2, type: 'triangle', delay: 0.12 }); }
  else { tone(392, 0.16, { vol: 0.2, type: 'triangle' }); tone(262, 0.26, { vol: 0.2, type: 'triangle', delay: 0.13 }); }
}
