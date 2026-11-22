// ゲームの「運」（サイコロ・カード・問題の順・CPU）。
// オンラインでは、みんなが 同じ たね（seed）から 同じ じゅんに 運を 引くので、
// 送らなくても どの iPad でも 同じ 目・同じ カードになる。
let state = 1;

export function seedRng(seed) { state = (seed >>> 0) || 1; }
export const newSeed = () => (Math.random() * 0xffffffff) >>> 0;

// mulberry32
export function rand() {
  state = (state + 0x6D2B79F5) >>> 0;
  let t = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
