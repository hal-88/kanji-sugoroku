// 日本のサイコロ（点の目・1だけ大きな赤い点）。真上から見た形で止まる。
import { sfx } from '../sfx.js';

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const sleep = ms => new Promise(r => setTimeout(r, ms));
// 向かいあう目の合計が7（1と6・2と5・3と4）
const PIPS = { 1: [5], 2: [3, 7], 3: [3, 5, 7], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
const FACE_ROT = { 1: [0, 0], 2: [-90, 0], 3: [0, -90], 4: [0, 90], 5: [90, 0], 6: [0, 180] };

function makeDie(v) {
  const d = document.createElement('div');
  d.className = 'die';
  d.innerHTML = `<div class="tilt"><div class="cube">${[1, 2, 3, 4, 5, 6].map(f =>
    `<div class="face f${f}">${PIPS[f].map(p => `<i style="grid-area:${Math.ceil(p / 3)}/${(p - 1) % 3 + 1}"></i>`).join('')}</div>`).join('')}</div></div>`;
  const [x, y] = FACE_ROT[v];
  d.querySelector('.cube').style.transform = `rotateX(${x}deg) rotateY(${y}deg)`;
  return d;
}

// count こ ふって、出た目の配列を返す。values をわたすとその目にする（オンラインで同じ目を見せる用）
export async function rollDice(count = 1, { forceSix = false, values } = {}) {
  const pop = document.querySelector('#dice-pop');
  pop.innerHTML = '';
  const vals = values || Array.from({ length: count }, () => forceSix ? 6 : 1 + Math.floor(Math.random() * 6));
  const dice = vals.map(() => { const d = makeDie(1 + Math.floor(Math.random() * 6)); pop.append(d); return d; });
  const sum = document.createElement('div');
  sum.className = 'die-sum';
  pop.append(sum);
  pop.classList.add('show');
  await new Promise(r => { requestAnimationFrame(() => requestAnimationFrame(r)); setTimeout(r, 80); });
  dice.forEach((d, i) => {
    const [x, y] = FACE_ROT[vals[i]];
    const sx = Math.random() < 0.5 ? 1 : -1, sy = Math.random() < 0.5 ? 1 : -1;
    d.classList.add('rolling');
    d.querySelector('.cube').style.transform = `rotateX(${x + 720 * sx}deg) rotateY(${y + 720 * sy}deg)`;
  });
  sfx('roll');
  await sleep(REDUCED ? 150 : 1150);
  sfx('rolled');
  sum.textContent = vals.length > 1 ? `${vals.join(' ＋ ')} ＝ ${vals.reduce((a, b) => a + b, 0)}` : `${vals[0]}`;
  sum.classList.add('show');
  await sleep(850);
  pop.classList.remove('show');
  await sleep(200);
  return vals;
}
