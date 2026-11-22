// はじめの画面・ボタン・キーボード
import './style.css';
import * as Stage from './three/stage.js';
import { CHARACTERS } from './three/characters.js';
import { main, upper } from './ui/dialog.js';
import { sfx, toggleSound, soundOn, unlockSound } from './sfx.js';
import { startGame, stopGame, pressRoll, setPortraits, isPlaying, isOnline, tapHandCard } from './game/game.js';
import { initOnline, openOnline, leave as leaveOnline } from './online/lobby.js';
import { CARDS, CARD_IDS, cardHTML, timingText } from './game/cards.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

await Stage.initStage($('#stage'));
const portraits = Stage.makePortraits();
setPortraits(portraits);

/* ---------- 設定（この端末に覚えておく） ---------- */
const KEY = 'kanji-sugoroku-3d';
const DEFAULTS = {
  count: 2, grade: 4, time: 20,
  players: CHARACTERS.map(c => ({ char: c.id, name: '' })),
};
let setup = structuredClone(DEFAULTS);
try {
  const s = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (s && Array.isArray(s.players) && s.players.length === 4) setup = { ...DEFAULTS, ...s };
} catch (e) { /* なし */ }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(setup)); } catch (e) { /* なし */ } };

const face = id => {
  const c = CHARACTERS.find(x => x.id === id);
  return `<span class="ava" style="--c:${c.ui}"><img src="${portraits[id]}" alt="${c.name}"></span>`;
};

// ひと → CPU よわい → ふつう → つよい の じゅんに かわる
const WHO = ['ひと', 'CPU<small>よわい</small>', 'CPU<small>ふつう</small>', 'CPU<small>つよい</small>'];
function renderSetup() {
  $$('.seg').forEach(seg => $$('button', seg).forEach(b => b.setAttribute('aria-pressed', String(String(setup[seg.dataset.key]) === b.dataset.v))));
  const rows = $('#player-rows');
  rows.innerHTML = setup.players.slice(0, setup.count).map((p, i) => `
    <div class="prow" data-i="${i}">
      <span class="no">${i + 1}P</span>
      <div class="chars">${CHARACTERS.map(c => `<button type="button" data-c="${c.id}" aria-pressed="${p.char === c.id}" aria-label="${c.name}">${face(c.id)}</button>`).join('')}</div>
      <input maxlength="8" placeholder="${CHARACTERS.find(c => c.id === p.char).name}" value="${p.name.replace(/"/g, '&quot;')}" spellcheck="false">
      <button type="button" class="who ${p.cpu ? 'is-cpu' : ''}" title="タップで ひと／CPU を かえる">${WHO[p.cpu || 0]}</button>
    </div>`).join('');
}
$$('.seg').forEach(seg => seg.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  sfx('tap');
  setup[seg.dataset.key] = Number(b.dataset.v);
  save();
  renderSetup();
}));
$('#player-rows').addEventListener('click', e => {
  const w = e.target.closest('.who');
  if (w) {
    sfx('tap');
    const i = Number(w.closest('.prow').dataset.i);
    setup.players[i].cpu = ((setup.players[i].cpu || 0) + 1) % 4;
    save();
    renderSetup();
    return;
  }
  const b = e.target.closest('.chars button');
  if (!b) return;
  sfx('tap');
  const i = Number(b.closest('.prow').dataset.i), id = b.dataset.c;
  // ほかの人が使っていたキャラなら入れかえる（同じキャラは1人だけ）
  const j = setup.players.findIndex(p => p.char === id);
  if (j !== i && j >= 0) setup.players[j].char = setup.players[i].char;
  setup.players[i].char = id;
  save();
  renderSetup();
});
$('#player-rows').addEventListener('input', e => {
  const row = e.target.closest('.prow');
  if (!row) return;
  setup.players[Number(row.dataset.i)].name = e.target.value.trim().slice(0, 8);
  save();
});
renderSetup();

/* ---------- 画面の切りかえ ---------- */
function showScreen(name) { $$('.screen').forEach(s => s.classList.toggle('active', s.id === 'screen-' + name)); }
function backToTitle() { showScreen('title'); renderSetup(); }

$('#btn-start').addEventListener('click', () => {
  unlockSound();
  sfx('tap');
  showScreen('game');
  startGame({ grade: setup.grade, time: setup.time, players: setup.players.slice(0, setup.count).map(p => ({ ...p })) }, backToTitle);
});
$('#btn-roll').addEventListener('click', pressRoll);

/* ---------- オンライン ---------- */
initOnline({
  showScreen,
  face,
  toTitle: backToTitle,
  startGame: (settings, net, exit) => { showScreen('game'); startGame(settings, exit, net); },
});
$('#btn-online').addEventListener('click', () => { unlockSound(); sfx('tap'); openOnline(); });
$('#hand').addEventListener('click', e => {
  const c = e.target.closest('.kcard[data-i]');
  if (c) tapHandCard(Number(c.dataset.i));
});
$('#btn-view').addEventListener('click', () => {
  sfx('tap');
  const next = Stage.getView() === 'overview' ? 'follow' : 'overview';
  Stage.setView(next);
  $('#btn-view').textContent = next === 'overview' ? 'もどす' : 'ぜんたい';
});
$('#btn-quit').addEventListener('click', async () => {
  sfx('tap');
  const online = isOnline();
  const v = await upper.dialog({
    title: 'ゲームを やめる？',
    body: online ? '<p>部屋から 出ます。あなたの かわりに CPU が あそびます。</p>' : '<p>とちゅうの 記録は のこりません。</p>',
    buttons: [{ label: 'やめる', value: true, kind: 'primary' }, { label: 'つづける', value: false }],
  });
  if (v !== true) return;
  stopGame();
  if (online) await leaveOnline({ inGame: true });
  else backToTitle();
});
const SOUND_ON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>';
const SOUND_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor"/><path d="M17 9l5 6M22 9l-5 6"/></svg>';
const paintSound = () => { $('#btn-sound').innerHTML = soundOn() ? SOUND_ON : SOUND_OFF; };
$('#btn-sound').addEventListener('click', () => { toggleSound(); paintSound(); sfx('tap'); });
paintSound();

/* ---------- あそびかた ---------- */
function openHowto() {
  sfx('tap');
  const sq = [
    ['#6EC1FF', '＋10', 'ポイントが 10 ふえる'],
    ['#FF7A7A', '−10', 'ポイントが 10 へる'],
    ['#7BD88F', '＋2', 'さらに 2マス 進む'],
    ['#FFA45C', '−2', '2マス もどる'],
    ['#FFD45C', 'カード', 'カードが 1まい もらえる'],
    ['#C39BFF', 'お店', 'カードを 買える。通りすぎる ときも かならず よる'],
  ];
  const cards = CARD_IDS.map(id => `<div class="cl">${cardHTML(id, { cls: 'mini' })}<div><b>${CARDS[id].name}</b>（${CARDS[id].price}ポイント）<br>${CARDS[id].desc}<small>${timingText(id)}</small></div></div>`).join('');
  upper.dialog({
    cls: 'wide', title: 'あそびかた',
    body: `<div class="howto">
      <ol class="steps">
        <li><span class="st-n">1</span><div><b>サイコロを ふる</b>　自分の番に「サイコロを ふる」を おす</div></li>
        <li><span class="st-n">2</span><div><b>漢字の 読みかたに こたえる</b>　ひらがなで 入れて「こたえる」（ローマ字でも OK）</div></li>
        <li><span class="st-n">3</span><div><b>せいかいなら 進める＋ポイント</b>　2文字 10・3文字 15、はやく こたえると ＋5</div></li>
        <li><span class="st-n">4</span><div><b>とまった マスで できごと</b>　まちがえたら その場で ストップ</div></li>
        <li><span class="st-n">5</span><div><b>いちばん先に お城（ゴール）に ついた人の かち！</b></div></li>
      </ol>
      <h3 class="ht">マスの しゅるい</h3>
      <div class="sq-legend">${sq.map(([c, l, d]) => `<div class="sq"><i style="background:${c}">${l}</i><span>${d}</span></div>`).join('')}</div>
      <h3 class="ht">カード</h3>
      <p class="ht-note">手札は 3まいまで。自分の番に 1まい 使える（サイコロの前）。<br>「反撃」の カードは、あいてに こうげきされたとき 使える。</p>
      <div class="card-legend">${cards}</div>
    </div>`,
    buttons: [{ label: 'わかった！', value: true, kind: 'primary' }],
  });
}
$('#btn-howto').addEventListener('click', openHowto);
$('#btn-howto-title').addEventListener('click', openHowto);

/* ---------- キーボード（Enter・スペース） ---------- */
document.addEventListener('keydown', e => {
  if (e.isComposing || e.keyCode === 229) return;
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const t = e.target;
  const layer = upper.isOpen() ? upper : main.isOpen() ? main : null;
  if (layer) {
    if (t && (t.tagName === 'INPUT' || t.tagName === 'BUTTON')) return;
    if (e.key === 'Enter') { e.preventDefault(); layer.pressPrimary(); }
    return;
  }
  if (t && (t.tagName === 'INPUT' || t.tagName === 'BUTTON')) return;
  if (isPlaying() && !$('#btn-roll').disabled) { e.preventDefault(); pressRoll(); }
});
