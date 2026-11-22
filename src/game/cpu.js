// CPU の かんがえ（つよさ 1＝よわい・2＝ふつう・3＝つよい）
// ここは「どうするか」を決めるだけ。画面の動きは game.js がやる。
import { CARDS, HAND_MAX } from './cards.js';
import { isCorrect } from './questions.js';
import { GOAL, tileType } from '../three/stage.js';

export const LEVELS = { 1: 'よわい', 2: 'ふつう', 3: 'つよい' };
import { rand as rnd } from './rng.js';
const pickOne = a => a[Math.floor(rnd() * a.length)];
const others = (S, p) => S.players.filter(q => q !== p && q.pos < GOAL);
const maxBy = (a, f) => a.reduce((b, x) => (b === null || f(x) > f(b) ? x : b), null);

/* ---------- 漢字の問題 ---------- */
// { think: 秒, text: 入れる答え } か { think, pass: true }
export function planAnswer(p, q, limit, hint) {
  const rate = Math.min(0.97, [0, 0.55, 0.75, 0.9][p.cpu] + (hint ? 0.15 : 0));
  const [lo, hi] = [null, [4, 11], [3, 8], [2, 5]][p.cpu];
  let think = lo + rnd() * (hi - lo);
  if (limit) think = Math.min(think, limit - 3);
  if (rnd() < rate) return { think, text: q.yomi };
  if (rnd() < 0.35) return { think, pass: true };
  return { think, text: wrongYomi(q) };
}
const KANA = Array.from('あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもらりるれろん');
function wrongYomi(q) {
  const a = Array.from(q.yomi);
  for (let t = 0; t < 30; t++) {
    const b = [...a];
    const k = Math.floor(rnd() * b.length);
    if (b.length > 2 && rnd() < 0.3) b.splice(k, 1); else b[k] = pickOne(KANA);
    const s = b.join('');
    if (!isCorrect(s, q)) return s;
  }
  return a.join('') + 'ん';
}

/* ---------- 自分の番に使うカード ---------- */
// マスの よさ（えらべるサイコロで どこに 止まるか）
function tileValue(p, pos) {
  if (pos >= GOAL) return 100;
  return { card: 3, point: 2, fwd: 2, shop: p.points >= 15 ? 2 : 0, minus: -2, back: -3 }[tileType(pos)] || 0;
}
// 手がたい人ほど 反撃カードを 持っているかも
const risk = q => (q.cards.length ? 0.7 : 1);

// そのカードを いま使うと どれくらい いいか
function judge(S, p, id, careless) {
  const os = others(S, p);
  const ahead = os.filter(q => q.pos > p.pos);
  const lead = maxBy(os, q => q.pos);
  const dist = GOAL - p.pos;
  const any = () => pickOne(os);
  switch (id) {
    case 'dice2': return { score: dist <= 12 ? 8 : 6 };
    case 'dice3': return { score: 8 };
    case 'lucky6': return { score: dist <= 6 ? 12 : 5 };
    case 'jump': return { score: dist <= 3 ? 12 : 4 };
    case 'pick': {
      if (careless) return { score: 5, pip: 1 + Math.floor(rnd() * 6) };
      let pip = 6, best = -Infinity;
      for (let v = 1; v <= 6; v++) { const s = v * 0.6 + tileValue(p, p.pos + v); if (s > best) { best = s; pip = v; } }
      return { score: best >= 100 ? 12 : 5, pip };
    }
    case 'warp': {
      if (!lead) return null;
      const gain = lead.pos - 1 - p.pos;
      if (gain < 1) return null;
      return { score: careless ? 5 : gain >= 5 ? 4 + gain / 2 : 0 };
    }
    case 'attack': case 'stop': {
      if (!os.length) return null;
      const t = careless ? any() : lead;
      let score = t.pos > p.pos ? 4 + (t === lead ? 1 : 0) : 1;
      if (id === 'stop' && GOAL - t.pos <= 8) score += 1;
      return { score: score * risk(t), target: t.i };
    }
    case 'thief': {
      if (!os.length) return null;
      const t = careless ? any() : maxBy(os, q => q.points);
      return { score: (Math.min(20, t.points) / 4) * risk(t), target: t.i };
    }
    case 'bomb':
      if (!ahead.length) return null;
      return { score: 1 + ahead.length * 3 };
    case 'swap': {
      if (!os.length) return null;
      const t = careless ? any() : lead;
      const gain = t.pos - p.pos;
      if (!careless && gain <= 0) return null;
      return { score: careless ? 5 : gain >= 4 ? (3 + gain / 2) * risk(t) : 0, target: t.i };
    }
    case 'snatch': {
      if (!os.length) return null;
      const t = careless ? any() : maxBy(os, q => q.cards.length);
      if (!careless && !t.cards.length) return null;
      return { score: (3 + t.cards.length) * risk(t), target: t.i };
    }
    case 'hint': return { score: p.cpu === 3 ? 1 : 3.5 };
    case 'draw': return { score: 4 };
  }
  return null;
}

// { idx, id, target, pip } か null（使わない）
export function planCard(S, p) {
  const usable = p.cards.map((id, idx) => ({ id, idx })).filter(c => CARDS[c.id].kind !== 'counter');
  if (!usable.length) return null;
  if (p.cpu === 1) {
    if (rnd() > 0.45) return null;
    const c = pickOne(usable), j = judge(S, p, c.id, true);
    return j ? { ...j, ...c } : null;
  }
  let best = null;
  for (const c of usable) {
    const j = judge(S, p, c.id, false);
    if (j && (!best || j.score > best.score)) best = { ...j, ...c };
  }
  if (!best || best.score < (p.cpu === 3 ? 3 : 4)) return null;
  if (p.cpu === 2 && rnd() < 0.2) return null;
  return best;
}

/* ---------- 反撃 ---------- */
// 'guard' / 'reflect' / 'none'
export function planCounter(target, attacker, id, owned) {
  const harm = {
    attack: 3, stop: 4, bomb: 5,
    thief: Math.min(20, target.points) / 4,
    swap: (target.pos - attacker.pos) / 2,
    snatch: target.cards.length > 1 ? 3 : 0,
  }[id] ?? 3;
  if (harm <= 0) return 'none';
  if (target.cpu === 1 && rnd() < 0.4) return 'none';
  if (target.cpu === 2 && harm < 2 && rnd() < 0.5) return 'none';
  if (target.cpu === 3 && harm < 2) return 'none';
  if (owned.includes('reflect') && id !== 'swap') return 'reflect';
  if (owned.includes('guard')) return 'guard';
  return owned[0];
}

/* ---------- お店・すてる ---------- */
const WANT = { dice3: 8, bomb: 6, warp: 6, reflect: 6, swap: 6, stop: 5, dice2: 5, lucky6: 5, pick: 5, guard: 4, snatch: 4, attack: 4, thief: 4, draw: 4, jump: 3, hint: 2 };
const want = (id, p) => (id === 'hint' && p.cpu < 3 ? 4 : WANT[id] || 3);

// 買うカードの番号（-1 は 買わない）
export function planShop(p, items) {
  const ok = items.map((id, k) => ({ id, k })).filter(x => p.points >= CARDS[x.id].price);
  if (!ok.length) return -1;
  if (p.cpu === 1) return rnd() < 0.6 ? pickOne(ok).k : -1;
  const full = p.cards.length >= HAND_MAX;
  const worst = full ? Math.min(...p.cards.map(c => want(c, p))) : 0;
  const best = maxBy(ok, x => want(x.id, p));
  const gain = want(best.id, p) - worst;
  return gain >= (full ? 1 : 3) ? best.k : -1;
}

// 手札がいっぱいのとき すてる カードの番号
export function planDiscard(p, all) {
  if (p.cpu === 1) return Math.floor(rnd() * all.length);
  let k = 0;
  all.forEach((c, i) => { if (want(c, p) < want(all[k], p)) k = i; });
  return k;
}
