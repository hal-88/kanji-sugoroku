// 効果音（ファイルを使わず、その場で音を作る）
let ctx = null;
let on = true;
try { on = localStorage.getItem('kanji-sugoroku-sound') !== 'off'; } catch (e) { /* なし */ }

export const soundOn = () => on;
export function toggleSound() {
  on = !on;
  try { localStorage.setItem('kanji-sugoroku-sound', on ? 'on' : 'off'); } catch (e) { /* なし */ }
  return on;
}
export function unlockSound() {
  try {
    ctx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch (e) { /* 音が出せない端末 */ }
}

function note(f, { t = 0, dur = 0.25, type = 'triangle', vol = 0.14, slide = 1 } = {}) {
  const now = ctx.currentTime + t;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, now);
  if (slide !== 1) o.frequency.exponentialRampToValueAtTime(f * slide, now + dur);
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(vol, now + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  o.connect(g).connect(ctx.destination);
  o.start(now);
  o.stop(now + dur + 0.03);
}

// ザッという 音（決闘の ぶつかる音）
function noise(t, dur, vol) {
  const now = ctx.currentTime + t, len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const s = ctx.createBufferSource(), g = ctx.createGain();
  s.buffer = buf;
  g.gain.value = vol;
  s.connect(g).connect(ctx.destination);
  s.start(now);
}

export function sfx(name, n = 0) {
  if (!on) return;
  unlockSound();
  if (!ctx) return;
  const N = note;
  switch (name) {
    case 'tap': N(880, { dur: 0.06, vol: 0.07, type: 'sine' }); break;
    case 'hop': N(520 + n * 40, { dur: 0.12, vol: 0.1, slide: 1.5 }); break;
    case 'land': N(180, { dur: 0.09, vol: 0.16, type: 'sine', slide: 0.6 }); break;
    case 'roll': [0, 0.08, 0.16, 0.3, 0.42, 0.62, 0.78, 0.88].forEach((t, i) => N(260 + Math.random() * 240, { t, dur: 0.05, vol: 0.05 - i * 0.004, type: 'square' })); break;
    case 'rolled': N(880, { dur: 0.25, vol: 0.12 }); break;
    case 'turn': [660, 880].forEach((f, i) => N(f, { t: i * 0.09, dur: 0.22, vol: 0.1, type: 'sine' })); break;
    case 'good': [523, 659, 784, 1047, 1319].forEach((f, i) => N(f, { t: i * 0.07, dur: 0.45, vol: 0.12 })); break;
    case 'bad': N(330, { dur: 0.28, vol: 0.09, type: 'sawtooth', slide: 0.8 }); N(247, { t: 0.22, dur: 0.42, vol: 0.09, type: 'sawtooth', slide: 0.8 }); break;
    case 'point': [1047, 1568].forEach((f, i) => N(f, { t: i * 0.08, dur: 0.3, vol: 0.09, type: 'sine' })); break;
    case 'minus': N(440, { dur: 0.35, vol: 0.1, type: 'triangle', slide: 0.5 }); break;
    case 'tick': N(1400, { dur: 0.035, vol: 0.05, type: 'square' }); break;
    case 'card': [1175, 1568, 2093].forEach((f, i) => N(f, { t: i * 0.06, dur: 0.35, vol: 0.07, type: 'sine' })); break;
    case 'guard': N(988, { dur: 0.5, vol: 0.09, type: 'sine' }); N(1319, { t: 0.06, dur: 0.6, vol: 0.07, type: 'sine' }); break;
    case 'hit': N(150, { dur: 0.3, vol: 0.24, type: 'sine', slide: 0.5 }); N(95, { t: 0.02, dur: 0.22, vol: 0.1, type: 'square', slide: 0.6 }); break;
    case 'boom': N(110, { dur: 0.7, vol: 0.28, type: 'sawtooth', slide: 0.3 }); N(70, { t: 0.05, dur: 0.6, vol: 0.18, type: 'square', slide: 0.5 }); break;
    case 'win': [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => N(f, { t: i * 0.12, dur: 0.55, vol: 0.13 })); break;
    case 'duel':
      // ドドドド… → カキーン！ → ドーン → ジャジャーン
      for (let i = 0; i < 12; i++) N(90 + i * 6, { t: i * 0.055, dur: 0.07, vol: 0.12 + i * 0.008, type: 'square', slide: 0.7 });
      noise(0.72, 0.35, 0.35);
      N(1760, { t: 0.72, dur: 0.6, vol: 0.12, type: 'sine' });
      N(2637, { t: 0.74, dur: 0.5, vol: 0.06, type: 'sine' });
      N(80, { t: 1.12, dur: 0.9, vol: 0.32, type: 'sawtooth', slide: 0.4 });
      noise(1.12, 0.5, 0.25);
      [392, 523, 659, 784].forEach((f, i) => N(f, { t: 1.45 + i * 0.09, dur: 0.6, vol: 0.11, type: 'sawtooth' }));
      break;
  }
}
