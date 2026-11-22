// カード10種の中身と、カードの絵
// kind: move（進む）／attack（こうげき）／counter（反撃＝あいての番に使う）／magic（ふしぎ）
// target: one（あいて1人をえらぶ）／ahead（自分より前の人全員）
import { rand } from './rng.js';
export const CARDS = {
  dice2:   { name: 'ふたつぶり',     kind: 'move',    price: 20, weight: 14, desc: 'サイコロを 2こ ふって、合計で 進む' },
  dice3:   { name: 'みっつぶり',     kind: 'move',    price: 40, weight: 6,  desc: 'サイコロを 3こ ふって、合計で 進む' },
  lucky6:  { name: 'ラッキー6',      kind: 'move',    price: 25, weight: 10, desc: 'ふった サイコロが かならず 6 になる' },
  jump:    { name: 'ひとっとび',     kind: 'move',    price: 15, weight: 12, desc: 'すぐに 3マス 進む（そのあと サイコロも ふれる）' },
  pick:    { name: 'えらべるサイコロ', kind: 'move',  price: 30, weight: 8,  desc: 'サイコロの 目を 1〜6から 自分で えらべる' },
  warp:    { name: 'おいつきワープ', kind: 'move',    price: 45, weight: 5,  desc: 'いちばん前の 人の すぐ うしろへ ワープ（そのあと サイコロも ふれる）' },
  attack:  { name: 'じゃまだて',     kind: 'attack',  price: 20, weight: 12, desc: 'あいて 1人を 3マス もどす', target: 'one' },
  stop:    { name: 'とおせんぼ',     kind: 'attack',  price: 30, weight: 8,  desc: 'あいて 1人を 1回 休みに する', target: 'one' },
  thief:   { name: 'ポイントどろぼう', kind: 'attack', price: 25, weight: 10, desc: 'あいて 1人の ポイントを 20 うばう', target: 'one' },
  bomb:    { name: 'ばくだん',       kind: 'attack',  price: 50, weight: 4,  desc: '自分より 前にいる 人 全員を 5マス もどす', target: 'ahead' },
  swap:    { name: 'いれかえ',       kind: 'attack',  price: 40, weight: 6,  desc: 'あいて 1人と、いる 場所を 入れかえる', target: 'one' },
  snatch:  { name: 'カードどろぼう', kind: 'attack',  price: 30, weight: 8,  desc: 'あいて 1人の カードを 1まい うばう（なにが とれるかは おたのしみ）', target: 'one' },
  guard:   { name: 'おまもり',       kind: 'counter', price: 20, weight: 12, desc: 'こうげきされた とき、1回 ふせぐ' },
  reflect: { name: 'はねかえし',     kind: 'counter', price: 40, weight: 6,  desc: 'こうげきされた とき、あいてに はね返す' },
  hint:    { name: 'ヒントめがね',   kind: 'magic',   price: 15, weight: 9,  desc: 'この番の 問題で、読みの さいしょの 1文字が 見える' },
  draw:    { name: 'くじびき',       kind: 'magic',   price: 25, weight: 8,  desc: 'カードを 2まい ひける' },
};
export const CARD_IDS = Object.keys(CARDS);
export const HAND_MAX = 3;
const KIND = { move: '進む', attack: 'こうげき', counter: '反撃', magic: 'ふしぎ' };

export function drawCard() {
  const total = CARD_IDS.reduce((a, id) => a + CARDS[id].weight, 0);
  let r = rand() * total;
  for (const id of CARD_IDS) { r -= CARDS[id].weight; if (r <= 0) return id; }
  return 'dice2';
}
// お店にならべる3まい（同じものは出さない）
export function shopItems(n = 3) {
  const out = [];
  while (out.length < n) { const id = drawCard(); if (!out.includes(id)) out.push(id); }
  return out;
}
export function timingText(id) {
  const c = CARDS[id];
  if (c.kind === 'counter') return 'あいての番に、こうげきされたら 使える';
  if (id === 'dice2' || id === 'dice3' || id === 'lucky6') return '使うと すぐ サイコロを ふる';
  if (id === 'pick') return '使うと すぐ 目を えらぶ';
  return '使ったあと、サイコロを ふる';
}

/* ---------- 絵 ---------- */
const PIPS = { 1: [5], 2: [3, 7], 3: [3, 5, 7], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
const mini = v => `<span class="md ${v === 1 ? 'one' : ''}">${PIPS[v].map(p => `<i style="grid-area:${Math.ceil(p / 3)}/${(p - 1) % 3 + 1}"></i>`).join('')}</span>`;
export const miniDie = mini;
const svg = inner => `<svg viewBox="0 0 64 64" aria-hidden="true">${inner}</svg>`;
const INK = '#2B2233';
const ART = {
  dice2: `<span class="md-row">${mini(3)}${mini(5)}</span>`,
  dice3: `<span class="md-row three">${mini(2)}${mini(6)}${mini(4)}</span>`,
  lucky6: `<span class="md-row">${mini(6)}</span><span class="spark s1">✦</span><span class="spark s2">✦</span>`,
  jump: svg(`<path d="M10 52 Q30 2 52 38" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>
    <path d="M40 36 L54 42 L56 27" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
    <text x="22" y="60" font-size="20" font-weight="900" fill="${INK}" font-family="Mochiy Pop One, sans-serif">+3</text>`),
  attack: svg(`<path d="M54 52 Q34 2 12 38" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>
    <path d="M24 36 L10 42 L8 27" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
    <text x="24" y="60" font-size="20" font-weight="900" fill="${INK}" font-family="Mochiy Pop One, sans-serif">−3</text>`),
  stop: svg(`<polygon points="22,6 42,6 58,22 58,42 42,58 22,58 6,42 6,22" fill="#FF5C7A" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
    <text x="32" y="43" text-anchor="middle" font-size="28" font-weight="900" fill="#fff" font-family="Zen Maru Gothic, sans-serif">休</text>`),
  thief: svg(`<circle cx="30" cy="34" r="22" fill="#FFD45C" stroke="${INK}" stroke-width="4"/>
    <circle cx="30" cy="34" r="15" fill="none" stroke="#E8A100" stroke-width="3"/>
    <text x="30" y="44" text-anchor="middle" font-size="26" font-weight="900" fill="${INK}" font-family="Mochiy Pop One, sans-serif">P</text>
    <path d="M44 10 L58 10 M52 4 L58 10 L52 16" fill="none" stroke="${INK}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>`),
  bomb: svg(`<circle cx="28" cy="38" r="20" fill="#3B3345" stroke="${INK}" stroke-width="4"/>
    <circle cx="21" cy="31" r="5" fill="#fff" opacity=".55"/>
    <rect x="34" y="14" width="10" height="9" rx="2" transform="rotate(35 39 18)" fill="#8A7F96" stroke="${INK}" stroke-width="3"/>
    <path d="M42 14 Q48 6 54 10" fill="none" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M56 3 L58 9 L63 8 L59 12 L62 17 L56 14 L53 18 L53 12 L48 10 L53 8 Z" fill="#FFB020" stroke="${INK}" stroke-width="2"/>`),
  guard: svg(`<path d="M32 5 L55 13 V30 C55 46 45 55 32 60 C19 55 9 46 9 30 V13 Z" fill="#9FD4FF" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
    <path d="M32 14 L46 19 V31 C46 41 40 47 32 51 C24 47 18 41 18 31 V19 Z" fill="#fff" opacity=".7"/>
    <path d="M24 33 L30 39 L41 26" fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`),
  reflect: svg(`<path d="M14 54 V28 A16 16 0 0 1 46 28 V40" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>
    <path d="M36 34 L46 46 L56 34" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M8 10 L14 16 M20 6 L20 14 M4 22 L12 22" stroke="#FFB020" stroke-width="4" stroke-linecap="round"/>`),
  pick: svg(`<rect x="10" y="10" width="44" height="44" rx="10" fill="#fff" stroke="${INK}" stroke-width="4"/>
    <text x="32" y="46" text-anchor="middle" font-size="34" font-weight="900" fill="#E0242B" font-family="Mochiy Pop One, sans-serif">?</text>
    <path d="M46 40 L46 58 L50 54 L53 61 L57 59 L54 52 L60 52 Z" fill="#FFD45C" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`),
  warp: svg(`<ellipse cx="32" cy="40" rx="26" ry="12" fill="#B57BFF" stroke="${INK}" stroke-width="4"/>
    <ellipse cx="32" cy="40" rx="16" ry="7" fill="#7A4FD6" stroke="${INK}" stroke-width="3"/>
    <ellipse cx="32" cy="40" rx="7" ry="3" fill="#2B2233"/>
    <path d="M32 30 V6 M22 15 L32 5 L42 15" fill="none" stroke="${INK}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`),
  swap: svg(`<path d="M10 24 H48" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>
    <path d="M38 13 L50 24 L38 35" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M54 44 H16" fill="none" stroke="#FF5C7A" stroke-width="7" stroke-linecap="round"/>
    <path d="M26 33 L14 44 L26 55" fill="none" stroke="#FF5C7A" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`),
  snatch: svg(`<rect x="8" y="14" width="26" height="36" rx="5" transform="rotate(-12 21 32)" fill="#FF8FA8" stroke="${INK}" stroke-width="4"/>
    <text x="21" y="40" text-anchor="middle" transform="rotate(-12 21 32)" font-size="18" font-weight="900" fill="#fff" font-family="Mochiy Pop One, sans-serif">?</text>
    <path d="M38 34 Q50 34 56 22" fill="none" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>
    <path d="M46 20 L57 20 L57 31" fill="none" stroke="${INK}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`),
  hint: svg(`<circle cx="18" cy="34" r="12" fill="#E6F6FF" stroke="${INK}" stroke-width="4.5"/>
    <circle cx="46" cy="34" r="12" fill="#E6F6FF" stroke="${INK}" stroke-width="4.5"/>
    <path d="M30 32 Q32 28 34 32" fill="none" stroke="${INK}" stroke-width="4"/>
    <text x="18" y="40" text-anchor="middle" font-size="15" font-weight="900" fill="${INK}" font-family="Zen Maru Gothic, sans-serif">あ</text>
    <path d="M52 8 L54 14 L60 16 L54 18 L52 24 L50 18 L44 16 L50 14 Z" fill="#FFD45C" stroke="${INK}" stroke-width="2"/>`),
  draw: svg(`<rect x="8" y="26" width="48" height="32" rx="6" fill="#B57BFF" stroke="${INK}" stroke-width="4"/>
    <rect x="20" y="24" width="24" height="7" rx="3.5" fill="${INK}"/>
    <rect x="22" y="4" width="13" height="24" rx="3" transform="rotate(-14 28 16)" fill="#fff" stroke="${INK}" stroke-width="3"/>
    <rect x="31" y="6" width="13" height="22" rx="3" transform="rotate(12 37 16)" fill="#FFD45C" stroke="${INK}" stroke-width="3"/>
    <text x="32" y="51" text-anchor="middle" font-size="16" font-weight="900" fill="#fff" font-family="Mochiy Pop One, sans-serif">+2</text>`),
};

export function cardHTML(id, { cls = '', price = false, i = null, disabled = false } = {}) {
  const c = CARDS[id];
  return `<div class="kcard k-${c.kind} ${cls} ${disabled ? 'off' : ''}" data-id="${id}"${i !== null ? ` data-i="${i}"` : ''} title="${c.name}：${c.desc}">
    <span class="kc-kind">${KIND[c.kind]}</span>
    <span class="kc-art">${ART[id]}</span>
    <span class="kc-name ${c.name.length > 5 ? 'long' : ''}">${c.name}</span>
    ${price ? `<span class="kc-price">${c.price}<small>P</small></span>` : ''}
  </div>`;
}
export const backHTML = (cls = '') => `<div class="kcard back ${cls}"><span class="kc-q">？</span></div>`;
