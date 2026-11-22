// ゲームの進行（1台で2〜4人が交代で遊ぶ／オンラインでは 1人1台）
// オンライン：みんなの iPad が 同じ 運のたね で 同じ 進行を 動かし、人が えらんだことだけを NET で やりとりする
// 1回の番：「○○の番！」→（カードを 何まいでも 使える）→ サイコロ → 漢字の問題 → 正解なら進む＋ポイント → マスのできごと
import * as Stage from '../three/stage.js';
import { GOAL, charDef } from '../three/stage.js';
import { main, ABORT } from '../ui/dialog.js';
import { rollDice } from '../ui/dice.js';
import { sfx } from '../sfx.js';
import { makeBag, isCorrect, hasKanji, pointsFor } from './questions.js';
import { CARDS, HAND_MAX, drawCard, shopItems, cardHTML, backHTML, timingText, miniDie } from './cards.js';
import { planAnswer, planCard, planCounter, planShop, planDiscard } from './cpu.js';
import { rand, seedRng, newSeed } from './rng.js';
import { pickPairs, makeBoard, cpuFlip } from './duel.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

let S = null;          // いまのゲーム
let gameId = 0;        // やめたら増える（とちゅうの処理を止めるため）
let portraits = {};
let onExit = () => {};
let NET = null;        // オンラインのときだけ（src/online/net.js の makeNet）
class Abort extends Error {}
const chk = id => { if (id !== gameId) throw new Abort(); };
async function wait(ms) { const id = gameId; await sleep(ms); chk(id); }
async function dlg(opts) { const id = gameId; const v = await main.dialog(opts); if (v === ABORT || id !== gameId) throw new Abort(); return v; }

/* ---------- CPU 用 ---------- */
const cpuTurn = () => !!S && !!S.players[S.current] && !!S.players[S.current].cpu;
// CPU の番の お知らせは、少し 見せてから 自動で 次へ
// （オンラインでは みんなの 画面が そろうように、いつも 自動で 次へ）
const au = (o, ms = 1900) => (cpuTurn() || NET ? { ...o, auto: o.auto || ms } : o);
// CPU が えらぶ ようすを 見せてから とじる（sel＝えらんだものに 光をつける）
function cpuMount(value, sel, ms = 1700) {
  return (el, finish) => {
    el.classList.add('cpu');
    const t1 = setTimeout(() => { const n = sel && el.querySelector(sel); if (n) n.classList.add('cpu-pick'); }, ms * 0.45);
    const t2 = setTimeout(() => finish(value), ms);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  };
}

/* ---------- オンライン用 ---------- */
const isRemote = p => !!NET && !p.cpu && !NET.isMe(p);   // ほかの iPad の人
const me = () => (NET ? S.players.find(q => NET.isMe(q)) : null);
// ぬけた人は CPU（ふつう）に かわる
function leaveTo(e) {
  const q = S.players[e.v];
  if (!q || q.cpu) return;
  q.cpu = 2;
  toast(`${q.name} が ぬけたので、CPU が かわりに あそぶよ`);
  paintPlayers();
  renderHand();
}
// ほかの iPad の人が えらぶのを 見せる：届いたら 光らせて とじる
function watchMount(ep, sel, note) {
  return (el, finish) => {
    el.classList.add('cpu');
    let t = 0, alive = true;
    if (note) { const n = document.createElement('p'); n.className = 'note watch-note'; n.textContent = note; el.querySelector('.s-body').append(n); }
    ep.then(e => {
      if (!alive || !e) return;
      const q = e.k !== 'leave' && sel ? sel(e.v) : null;
      const n = q && el.querySelector(q);
      if (n) n.classList.add('cpu-pick');
      t = setTimeout(() => finish(e), n ? 750 : 0);
    });
    return () => { alive = false; clearTimeout(t); };
  };
}
// 1つ えらぶ ダイアログ。えらぶ人が CPU でも、この iPad の人でも、ほかの iPad の人でも 同じ 形で 使える
// pick: { kind, cpu: () => CPU のえらぶ値, mount: 自分で えらぶときの mount, sel: 値 → 光らせる セレクタ, ms }
async function choose(p, opts, pick) {
  const id = gameId;
  for (;;) {
    if (p.cpu) { const v = pick.cpu(); return dlg({ ...opts, mount: cpuMount(v, pick.sel ? pick.sel(v) : null, pick.ms) }); }
    if (!NET) return dlg({ ...opts, mount: pick.mount });
    if (NET.isMe(p)) {
      const v = await dlg({ ...opts, mount: pick.mount });
      const e = await NET.commit(pick.kind, v);
      chk(id);
      if (e.k === 'leave') { leaveTo(e); continue; }
      return e.v;
    }
    const e = await dlg({ ...opts, mount: watchMount(NET.next(p), pick.sel, `${p.name} さんが えらんでいます…`) });
    if (e.k === 'leave') { leaveTo(e); continue; }
    return e.v;
  }
}

export const ava = (p, cls = '') => `<span class="ava ${cls}" style="--c:${charDef(p.char).ui}"><img src="${portraits[p.char]}" alt=""></span>`;
export function setPortraits(p) { portraits = p; }
export const isPlaying = () => !!S && !S.ended;
export const isOnline = () => !!NET;

// 確認用（npm run dev のときだけ）：__dev.warp(0, 37)／__dev.give(0, 'bomb')／__dev.points(0, 100)
if (import.meta.env.DEV) {
  window.__dev = {
    warp(i, pos) { S.players[i].pos = pos; Stage.warp(i, pos); paintPlayers(); },
    give(i, id) { S.players[i].cards.push(id); paintPlayers(); renderHand(); },
    points(i, n) { S.players[i].points = n; paintPlayers(); },
    shop: i => shop(S.players[i]).catch(() => {}),
    cardTile: i => cardTile(S.players[i]).catch(() => {}),
    duelIntro: (i, j) => duelIntro(S.players[i], S.players[j]).catch(() => {}),
    state: () => S,
  };
}

/* ---------- はじめる・やめる ---------- */
export function startGame(settings, exitTo, net = null) {
  gameId++;
  main.finish(ABORT);
  if (NET && NET !== net) NET.stop();
  NET = net;
  onExit = exitTo;
  seedRng(settings.seed ?? newSeed());
  S = {
    settings,
    players: settings.players.map((p, i) => ({
      i, char: p.char, name: p.name || charDef(p.char).name, cpu: p.cpu || 0, plan: null, uid: p.uid || null,
      pos: 0, points: 0, skip: false, cards: [], usedCard: 0, hint: false,   // usedCard＝この番に 使った まい数
      stats: { asked: 0, correct: 0, missed: [], cardsUsed: 0 },
    })),
    current: 0, phase: 'busy', ended: false, actionResolve: null,
    bag: makeBag(settings.grade),
  };
  // はじめに みんなへ カードを 1まい（運のたね から ひくので オンラインでも 同じ）
  S.players.forEach(p => p.cards.push(drawCard()));
  Stage.setMap(settings.map || 'normal');
  Stage.setPlayers(S.players.map(p => p.char));
  Stage.setView('follow');
  paintPlayers();
  renderHand();
  $('#turn-banner').innerHTML = '';
  run();
}
export function stopGame() {
  gameId++;
  main.finish(ABORT);
  if (NET) NET.stop();
  NET = null;
  S = null;
  setRollReady(false);
  $('#hand').innerHTML = '';
  Stage.setPlayers([]);
  Stage.setCurrent(-1);
  Stage.setView('orbit');
}

/* ---------- 画面のぬりかえ ---------- */
function paintPlayers() {
  if (!S) return;
  $('#players').innerHTML = S.players.map(p => `
    <div class="pcard ${p.i === S.current && !S.ended ? 'active' : ''} ${p.pos >= GOAL ? 'goal' : ''}" data-i="${p.i}">
      ${ava(p)}
      <div class="info">
        <div class="nm">${esc(p.name)}</div>
        <div class="pt">${p.points}<small> ポイント</small></div>
        <div class="rest">${p.pos >= GOAL ? 'ゴール！' : `あと ${GOAL - p.pos} マス`}</div>
      </div>
      <span class="hand-count" title="カード ${p.cards.length}まい">${'<i></i>'.repeat(p.cards.length)}</span>
      ${p.cpu ? '<span class="cpu-tag">CPU</span>' : ''}
      ${p.skip ? '<span class="badge" title="1回休み">休</span>' : ''}
    </div>`).join('');
}
// いまの人の手札（右下）
function renderHand() {
  const box = $('#hand');
  if (!S || S.ended) { box.innerHTML = ''; return; }
  const cur = S.players[S.current];
  const p = NET ? me() : cur;
  if (!p) { box.innerHTML = ''; return; }
  if (p.cpu) {
    // CPU の手札は 見えない（うらがえし）
    const slots = Array.from({ length: HAND_MAX }, (_, k) => (p.cards[k] ? backHTML() : '<div class="kcard empty"></div>'));
    box.innerHTML = `<div class="hand-label">${esc(p.name)}（CPU）の カード</div><div class="hand-row">${slots.join('')}</div>`;
    return;
  }
  const mine = p === cur;
  const can = mine && S.phase === 'action';
  const slots = [];
  for (let k = 0; k < HAND_MAX; k++) {
    const id = p.cards[k];
    slots.push(id ? cardHTML(id, { i: k, cls: can && CARDS[id].kind !== 'counter' ? 'usable' : '' }) : '<div class="kcard empty"></div>');
  }
  const note = !mine ? '（反撃カードは こうげきされたら 使える）' : p.usedCard ? `（この番 ${p.usedCard}まい 使ったよ）` : 'サイコロの前に 何まいでも';
  box.innerHTML = `<div class="hand-label">${NET ? 'あなた' : esc(p.name)} の カード <small>${note}</small></div><div class="hand-row">${slots.join('')}</div>`;
}
function bump(i) { const el = $(`#players .pcard[data-i="${i}"]`); if (el) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); } }
function setTurnBanner(p) { $('#turn-banner').innerHTML = `${ava(p)}<span class="nm">${esc(p.name)}</span><span>の番</span>`; }
function setRollReady(on, text = '') {
  const b = $('#btn-roll');
  b.disabled = !on;
  b.classList.toggle('ready', on);
  $('#hint').textContent = text;
}
let toastTimer = 0;
export function toast(text, tone = '') {
  const el = $('#toast');
  el.textContent = text;
  el.className = `toast show ${tone}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2000);
}
function floater(i, text, minus = false) {
  const { x, y } = Stage.screenPosOf(i);
  const el = document.createElement('div');
  el.className = `floater ${minus ? 'minus' : ''}`;
  el.textContent = text;
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  $('#floaters').append(el);
  setTimeout(() => el.remove(), 1500);
}
async function splash(html) {
  const el = $('#splash');
  el.innerHTML = html;
  el.classList.add('show');
  await wait(REDUCED ? 500 : 1100);
  el.classList.remove('show');
  await wait(250);
}
async function lookAt(i, ms = 500) { Stage.setFocus(i); await wait(ms); }
function lookBack() { Stage.setFocus(null); }

/* ---------- 進行 ---------- */
async function run() {
  const id = gameId, st = S;
  try {
    await wait(600);
    toast('みんなに カードを 1まい くばったよ！', 'good');
    sfx('card');
    await wait(900);
    while (!st.ended) {
      await playTurn(st.players[st.current]);
      chk(id);
      if (st.ended) break;
      st.current = (st.current + 1) % st.players.length;
    }
    await showResult();
  } catch (e) {
    if (!(e instanceof Abort)) console.error(e);
  }
}

async function playTurn(p) {
  const id = gameId;
  S.phase = 'busy';
  p.usedCard = 0;
  p.hint = false;
  p.plan = null;
  Stage.setCurrent(p.i);
  Stage.setView('follow');
  $('#btn-view').textContent = 'ぜんたい';
  setTurnBanner(p);
  paintPlayers();
  renderHand();
  await wait(450);
  sfx('turn');
  await splash(`${ava(p, 'lg')}<div class="big">${NET && NET.isMe(p) ? 'あなた' : esc(p.name)} の番！</div>`);

  if (p.skip) {
    p.skip = false;
    paintPlayers();
    await dlg({ title: '1回休み', body: `${ava(p, 'lg')}<p><b>${esc(p.name)}</b> は おやすみ。<br>つぎの人の番に なります。</p>`, buttons: [{ label: 'つぎへ', value: true, kind: 'primary' }], auto: 2400 });
    return;
  }

  // カードを 使う（サイコロの前に 何まいでも。サイコロの カードは 使うと すぐ ふる）か、サイコロをふる
  let mods = { count: 1, six: false, values: null };
  while (true) {
    const act = await waitForAction(p);
    if (act.type === 'roll') break;
    const r = await useCard(p, act.idx);
    chk(id);
    if (S.ended) return;
    if (r && r.roll) { mods = r; break; }
  }

  // もう1回マスに とまったら、もう1回 サイコロ（1回の番で 3回まで）
  for (let extra = 0; extra < 3; extra++) {
    const r = await rollAndGo(p, extra ? { count: 1, six: false, values: null } : mods);
    chk(id);
    if (r !== 'again' || S.ended) return;
    sfx('turn');
    await splash(`${ava(p, 'lg')}<div class="big">もう1回 サイコロ！</div>`);
  }
}

// サイコロ → 漢字の問題 → 正解なら 進む → マスの できごと（もどり値：'again'＝もう1回マス）
async function rollAndGo(p, mods) {
  const id = gameId;
  setRollReady(false);
  renderHand();
  const want = mods.values || Array.from({ length: mods.count }, () => (mods.six ? 6 : 1 + Math.floor(rand() * 6)));
  const vals = await rollDice(want.length, { values: want });
  chk(gameId);
  const n = vals.reduce((a, b) => a + b, 0);

  const q = S.bag.next();
  p.stats.asked++;
  const res = await askQuestion(p, q, { hint: p.hint, cpu: p.cpu ? planAnswer(p, q, S.settings.time, p.hint) : null });
  const word = `<ruby>${esc(q.kanji)}<rt>${esc(q.yomi)}</rt></ruby>`;

  if (!res.correct) {
    p.stats.missed.push(q);
    sfx('bad');
    Stage.sad(p.i);
    const lead = res.timeout ? '時間ぎれ！' : res.pass ? 'つぎは 読めるかな？' : 'おしい！';
    await dlg(au({
      tone: 'bad', title: 'ざんねん…',
      body: `<p>${lead} 正しい 読みは…</p><div class="r-word">${word}</div>${res.input ? `<p class="r-yours">こたえ：${esc(res.input)}</p>` : ''}<p><b>${esc(p.name)}</b> は 進めません</p>`,
      buttons: [{ label: 'つぎへ', value: true, kind: 'primary' }],
    }, 2600));
    return;
  }

  p.stats.correct++;
  const pts = pointsFor(q, res.timeLeft, S.settings.time);
  sfx('good');
  await dlg(au({
    tone: 'good', title: 'せいかい！',
    body: `${hanamaru()}<div class="r-word">${word}</div>
      <div class="r-pts">＋${pts.total}<small>ポイント${pts.fast ? '（はやい！＋5）' : ''}</small></div>
      <p class="r-move"><b>${n}</b> マス 進む</p>`,
    buttons: [{ label: '進む！', value: true, kind: 'primary big' }],
  }, 2200));
  p.points += pts.total;
  paintPlayers();
  bump(p.i);
  floater(p.i, `＋${pts.total}`);
  sfx('point');
  await wait(300);
  await move(p, n, { shops: true });
  if (p.pos >= GOAL) return reachGoal(p);
  if (await maybeDuel(p)) return;   // 決闘に 負けて もどったら マスの できごとは なし
  return tileEvent(p);
}

// shops:true のときは、とちゅうの お店で かならず 止まって 買い物 → のこりを 進む
async function move(p, delta, { shops = false } = {}) {
  const id = gameId;
  const step = async n => {
    await Stage.moveSteps(p.i, n, pos => { p.pos = pos; paintPlayers(); });
    chk(id);
    p.pos = Stage.posOf(p.i);
  };
  if (!shops || delta <= 0) return step(delta);
  let left = delta;
  while (left > 0 && p.pos < GOAL) {
    let k = 1;
    while (k < left && p.pos + k < GOAL && Stage.tileType(p.pos + k) !== 'shop') k++;
    await step(k);
    left -= k;
    if (left > 0 && p.pos < GOAL && Stage.tileType(p.pos) === 'shop') {
      await shop(p, { rest: left });
      toast(`のこり ${left}マス 進む！`, 'good');
      await wait(500);
    }
  }
}

function waitForAction(p) {
  const id = gameId;
  if (p.cpu) {
    // CPU：少し かんがえてから、カードを使うか サイコロを ふる
    return (async () => {
      setRollReady(false, `${p.name}（CPU）が かんがえ中…`);
      await wait(1200);
      if (p.usedCard < 3) {   // CPU は 1回の番に 3まいまで
        const plan = planCard(S, p);
        if (plan) { p.plan = plan; return { type: 'card', idx: plan.idx }; }
      }
      setRollReady(false, `${p.name}（CPU）が サイコロを ふるよ`);
      await wait(400);
      return { type: 'roll' };
    })();
  }
  if (isRemote(p)) {
    // ほかの iPad の人の 番：えらぶのを 待つ
    return (async () => {
      setRollReady(false, `${p.name} さんの 番です`);
      const e = await NET.next(p);
      chk(id);
      if (e.k === 'leave') { leaveTo(e); return waitForAction(p); }
      return e.v;
    })();
  }
  const ae = document.activeElement;
  if (ae && ae !== document.body) ae.blur();
  const local = new Promise(resolve => {
    S.phase = 'action';
    S.actionResolve = a => { S.actionResolve = null; S.phase = 'busy'; setRollReady(false); renderHand(); resolve(a); };
    const hasUsable = p.cards.some(c => CARDS[c].kind !== 'counter');
    setRollReady(true, hasUsable ? 'カードを 使うなら、先に カードを タップ' : `${NET ? '' : p.name + ' さん、'}サイコロを ふってね`);
    renderHand();
  }).then(a => { chk(id); return a; });
  if (!NET) return local;
  return local.then(async a => {
    const e = await NET.commit('act', a);
    chk(id);
    if (e.k === 'leave') { leaveTo(e); return waitForAction(p); }
    return e.v;
  });
}
export function pressRoll() {
  if (S && S.phase === 'action' && S.actionResolve && !main.isOpen()) { sfx('tap'); S.actionResolve({ type: 'roll' }); }
}

// 手札のカードをタップしたとき
export async function tapHandCard(idx) {
  if (!S || main.isOpen()) return;
  const p = NET ? me() : S.players[S.current];
  const id = p && p.cards[idx];
  if (!id || p.cpu) return;
  const c = CARDS[id];
  let note = '';
  if (c.kind === 'counter') note = 'このカードは、あいての番に こうげきされたとき 使えます';
  else if (S.phase !== 'action' || p !== S.players[S.current]) note = 'いまは 使えません（自分の番の サイコロの 前に 使えるよ）';
  else if (c.target === 'ahead' && !S.players.some(q => q !== p && q.pos > p.pos)) note = '自分より 前に だれも いないので 使えません';
  else if (id === 'warp') {
    const lead = leader(p);
    if (!lead || lead.pos <= p.pos) note = '自分が いちばん前なので 使えません';
    else if (lead.pos - 1 <= p.pos) note = 'もう いちばん前の 人の すぐ うしろに いるよ';
  }
  const canUse = !note;
  sfx('tap');
  const gid = gameId;
  const v = await main.dialog({
    tone: 'card', title: c.name,
    body: `<div class="card-big">${cardHTML(id, { cls: 'big' })}</div><p>${c.desc}</p><p><span class="chip">${timingText(id)}</span></p>${note ? `<p class="note">${note}</p>` : ''}`,
    buttons: canUse ? [{ label: 'つかう！', value: 'use', kind: 'primary big' }, { label: 'やめる', value: false }] : [{ label: 'とじる', value: false, kind: 'primary' }],
  });
  if (v === 'use' && gid === gameId && S.actionResolve && p === S.players[S.current] && p.cards[idx] === id) S.actionResolve({ type: 'card', idx });
}

/* ---------- カードの効果 ---------- */
// 自分いがいで いちばん前の人
const leader = p => S.players.filter(q => q !== p && q.pos < GOAL).sort((a, b) => b.pos - a.pos)[0];

// もどり値：{ roll:true, count, six, values }＝すぐサイコロ／null＝そのあとサイコロ／{ cancel:true }＝やめた
async function useCard(p, idx) {
  const id = p.cards[idx], c = CARDS[id];
  let target = null, pip = null;
  if (c.target === 'one') {
    target = await chooseTarget(p, id);
    if (target === null) return { cancel: true };
  }
  if (id === 'pick') {
    pip = await choosePip(p);
    if (pip === null) return { cancel: true };
  }
  p.cards.splice(idx, 1);
  p.usedCard++;
  p.stats.cardsUsed++;
  paintPlayers();
  renderHand();
  sfx('card');
  await splash(`<div class="card-pop">${cardHTML(id, { cls: 'big' })}</div><div class="big small">${esc(p.name)} の「${c.name}」！</div>`);

  switch (id) {
    case 'dice2': return { roll: true, count: 2, six: false };
    case 'dice3': return { roll: true, count: 3, six: false };
    case 'lucky6': return { roll: true, count: 1, six: true };
    case 'pick': return { roll: true, count: 1, six: false, values: [pip] };
    case 'jump':
      await move(p, 3, { shops: true });
      if (p.pos >= GOAL) await reachGoal(p);
      return null;
    case 'warp': {
      const lead = leader(p);
      const to = Math.max(p.pos, lead.pos - 1);
      await Stage.teleport(p.i, to);
      await wait(50);
      p.pos = to;
      paintPlayers();
      toast(`${lead.name} の すぐ うしろへ ワープ！`, 'good');
      await wait(1000);
      return null;
    }
    case 'attack': case 'stop': case 'thief': case 'swap': case 'snatch':
      await attackOne(p, target, id);
      return null;
    case 'hint':
      p.hint = true;
      floater(p.i, 'ヒント！');
      toast('この番の 問題で ヒントが 見えるよ', 'good');
      await wait(1100);
      return null;
    case 'draw':
      await drawTwo(p);
      return null;
    case 'bomb': {
      const ahead = S.players.filter(q => q !== p && q.pos > p.pos);
      sfx('boom');
      Stage.setView('overview');
      await wait(900);
      for (const q of ahead) await attackOne(p, q, 'bomb');
      Stage.setView('follow');
      return null;
    }
  }
  return null;
}

// えらべるサイコロ：1〜6の目をえらぶ
async function choosePip(p) {
  const v = await choose(p, {
    tone: 'card', title: 'どの目に する？',
    body: `<p>出したい 目を タップしてね</p><div class="pick-dice">${[1, 2, 3, 4, 5, 6].map(n => `<button type="button" class="pick-die" data-v="${n}" aria-label="${n}">${miniDie(n)}</button>`).join('')}</div>`,
    buttons: [{ label: 'やっぱり やめる', value: -1 }],
  }, {
    kind: 'pip',
    cpu: () => p.plan?.pip || 6,
    sel: v => `.pick-die[data-v="${v}"]`,
    mount: (el, finish) => { $$('.pick-die', el).forEach(b => b.addEventListener('click', () => { sfx('tap'); finish(Number(b.dataset.v)); })); },
  });
  return v > 0 ? v : null;
}

async function chooseTarget(p, id) {
  const others = S.players.filter(q => q !== p && q.pos < GOAL);
  if (others.length === 1) return others[0];
  const c = CARDS[id];
  const v = await choose(p, {
    tone: 'card', title: 'だれに 使う？',
    body: `<p>「${c.name}」：${c.desc}</p><div class="pick">${others.map(q => `
      <button type="button" class="pick-btn" data-i="${q.i}">${ava(q, 'lg')}<b>${esc(q.name)}</b><small>${q.points}ポイント・あと${GOAL - q.pos}マス</small><span class="hand-count">${'<i></i>'.repeat(q.cards.length)}</span></button>`).join('')}</div>`,
    buttons: [{ label: 'やっぱり やめる', value: -1 }],
  }, {
    kind: 'target',
    cpu: () => {
      const want = p.plan && others.find(q => q.i === p.plan.target);
      return (want || others[Math.floor(rand() * others.length)]).i;
    },
    sel: v => `.pick-btn[data-i="${v}"]`,
    mount: (el, finish) => { $$('.pick-btn', el).forEach(b => b.addEventListener('click', () => { sfx('tap'); finish(Number(b.dataset.i)); })); },
  });
  return v >= 0 ? S.players[v] : null;
}

// こうげき1回分（反撃のチャンスつき）
async function attackOne(attacker, target, id) {
  const counter = await askCounter(attacker, target, id);
  if (counter === 'guard') {
    sfx('guard');
    await lookAt(target.i, 400);
    floater(target.i, 'ガード！');
    toast(`${target.name} の おまもりが ふせいだ！`, 'good');
    await wait(1400);
    lookBack();
    return;
  }
  let from = attacker, to = target;
  if (counter === 'reflect' && id === 'swap') {
    // いれかえは はね返しても 同じなので、ふせいだことにする
    sfx('guard');
    await lookAt(target.i, 400);
    floater(target.i, 'はねかえし！');
    toast(`${target.name} が はねかえした！ いれかえは なしに なった`, 'good');
    await wait(1500);
    lookBack();
    return;
  }
  if (counter === 'reflect') {
    sfx('guard');
    await lookAt(target.i, 400);
    floater(target.i, 'はねかえし！');
    toast(`${target.name} が はねかえした！ ${attacker.name} に もどってきた！`, 'bad');
    await wait(1500);
    from = target; to = attacker;
  }
  await applyAttack(from, to, id);
  lookBack();
}

async function applyAttack(from, to, id) {
  await lookAt(to.i, 600);
  switch (id) {
    case 'attack':
      sfx('hit');
      Stage.sad(to.i);
      await wait(400);
      await move(to, -3);
      toast(`${to.name} は 3マス もどった！`, 'bad');
      await wait(900);
      break;
    case 'bomb':
      sfx('hit');
      Stage.sad(to.i);
      await wait(400);
      await move(to, -5);
      toast(`ドカーン！ ${to.name} は 5マス もどった！`, 'bad');
      await wait(900);
      break;
    case 'stop':
      to.skip = true;
      sfx('hit');
      Stage.sad(to.i);
      paintPlayers();
      floater(to.i, '1回休み', true);
      toast(`${to.name} は つぎの番 1回休み！`, 'bad');
      await wait(1500);
      break;
    case 'thief': {
      const amt = Math.min(20, to.points);
      to.points -= amt;
      from.points += amt;
      paintPlayers();
      bump(to.i); bump(from.i);
      if (amt) { sfx('minus'); floater(to.i, `−${amt}`, true); toast(`${from.name} が ${to.name} から ${amt}ポイント うばった！`, 'bad'); }
      else toast(`${to.name} は ポイントを もっていなかった…`);
      await wait(1500);
      break;
    }
    case 'swap': {
      const a = from.pos, b = to.pos;
      sfx('hit');
      Stage.setView('overview');
      await wait(500);
      await Promise.all([Stage.teleport(from.i, b), Stage.teleport(to.i, a)]);
      await wait(50);
      from.pos = b; to.pos = a;
      paintPlayers();
      toast(`${from.name} と ${to.name} が 入れかわった！`, 'bad');
      await wait(1300);
      Stage.setView('follow');
      break;
    }
    case 'snatch': {
      if (!to.cards.length) { toast(`${to.name} は カードを もっていなかった…`); await wait(1400); break; }
      const cid = to.cards.splice(Math.floor(rand() * to.cards.length), 1)[0];
      sfx('hit');
      Stage.sad(to.i);
      floater(to.i, 'カード −1', true);
      paintPlayers(); renderHand(); bump(to.i);
      await dlg(au({
        tone: 'card', title: 'カードを うばった！',
        body: `<div class="vs">${ava(from, 'lg')}<span class="vs-arrow">←</span>${ava(to, 'lg')}</div><div class="card-big">${cardHTML(cid, { cls: 'big' })}</div><p><b>${esc(from.name)}</b> が <b>${esc(to.name)}</b> の「${CARDS[cid].name}」を うばった！</p>`,
        buttons: [{ label: 'つぎへ', value: true, kind: 'primary' }],
      }, 2300));
      await gainCard(from, cid);
      break;
    }
  }
}

// こうげきされた人に「反撃カードを使う？」と聞く
async function askCounter(attacker, target, id) {
  const owned = [...new Set(target.cards.filter(c => CARDS[c].kind === 'counter'))];
  if (!owned.length) return null;
  await lookAt(target.i, 300);
  sfx('turn');
  const wasCpu = !!target.cpu;
  const v = await choose(target, {
    tone: 'alert', title: `${esc(target.name)} さん！`,
    body: `<div class="vs">${ava(attacker, 'lg')}<span class="vs-arrow">→</span>${ava(target, 'lg')}</div>
      <p><b>${esc(attacker.name)}</b> の「${CARDS[id].name}」が きた！<br>反撃カードを 使う？</p>
      <div class="card-row">${owned.map(c => cardHTML(c)).join('')}</div>
      ${target.cpu ? `<p class="note">${esc(target.name)}（CPU）が かんがえ中…</p>` : !NET ? `<p class="note">${esc(target.name)} さんに iPad を わたしてね</p>` : ''}`,
    buttons: [
      ...owned.map(c => ({ label: `${CARDS[c].name}を 使う`, value: c, kind: 'primary' })),
      { label: '使わない', value: 'none' },
    ],
  }, {
    kind: 'counter',
    cpu: () => planCounter(target, attacker, id, owned),
    ms: 1900,
  });
  if ((wasCpu || isRemote(target)) && v === 'none') { toast(`${target.name} は 反撃しなかった`); await wait(700); }
  if (v === 'none') return null;
  target.cards.splice(target.cards.indexOf(v), 1);
  target.stats.cardsUsed++;
  paintPlayers();
  return v;
}

/* ---------- カードを手に入れる ---------- */
async function gainCard(p, id) {
  if (p.cards.length < HAND_MAX) {
    p.cards.push(id);
    paintPlayers(); renderHand(); bump(p.i);
    return;
  }
  // 手札がいっぱい → 1まい すてる（新しいカードをすててもよい）
  const all = [...p.cards, id];
  const v = await choose(p, {
    tone: 'card', title: '手札が いっぱい！',
    body: `<p>カードは ${HAND_MAX}まいまで。<b>すてる カードを 1まい</b> えらんでね。</p>
      <div class="card-row pickable">${all.map((c, k) => `<div class="pick-card" data-k="${k}">${cardHTML(c)}${k === all.length - 1 ? '<span class="new-tag">NEW</span>' : ''}</div>`).join('')}</div>`,
    buttons: [],
  }, {
    kind: 'discard',
    cpu: () => planDiscard(p, all),
    sel: v => `.pick-card[data-k="${v}"]`,
    mount: (el, finish) => { $$('.pick-card', el).forEach(b => b.addEventListener('click', () => { sfx('tap'); finish(Number(b.dataset.k)); })); },
  });
  all.splice(v, 1);
  p.cards = all;
  paintPlayers(); renderHand();
}

async function cardTile(p) {
  const id = drawCard();
  sfx('card');
  await dlg(au({
    tone: 'card', title: 'カードを ゲット！',
    body: `<div class="card-big"><div class="flip">${cardHTML(id, { cls: 'big front' })}${backHTML('big flip-back')}</div></div><p><b>${CARDS[id].name}</b>：${CARDS[id].desc}</p><p><span class="chip">${timingText(id)}</span></p>`,
    buttons: [{ label: 'やったね', value: true, kind: 'primary' }],
  }));
  await gainCard(p, id);
}

// くじびき：2まい ひく
async function drawTwo(p) {
  const ids = [drawCard(), drawCard()];
  sfx('card');
  await dlg(au({
    tone: 'card', title: 'くじびき！',
    body: `<div class="card-row">${ids.map(id => `<div class="flip">${cardHTML(id, { cls: 'big front' })}${backHTML('big flip-back')}</div>`).join('')}</div><p>${ids.map(id => `<b>${CARDS[id].name}</b>`).join(' と ')} が 出た！</p>`,
    buttons: [{ label: 'やったね', value: true, kind: 'primary' }],
  }, 2300));
  for (const id of ids) await gainCard(p, id);
}

// rest があるときは「とちゅうで よった お店」（買い物のあと のこりを 進む）
async function shop(p, { rest = 0 } = {}) {
  const items = shopItems(3);
  sfx('turn');
  const v = await choose(p, {
    tone: 'shop', cls: 'wide', title: rest ? 'お店に よった！' : 'いらっしゃいませ！',
    body: `<p>${ava(p)}<span class="wallet"><b>${p.points}</b> ポイント もっている</span></p>
      <div class="card-row shop-row">${items.map((id, k) => {
        const ok = p.points >= CARDS[id].price;
        return `<button type="button" class="buy ${ok ? '' : 'cant'}" data-k="${k}" ${ok ? '' : 'disabled'}>${cardHTML(id)}<span class="price-tag">${CARDS[id].price}<small>ポイント</small></span><small>${CARDS[id].desc}</small>${ok ? '' : '<em>ポイントが たりない</em>'}</button>`;
      }).join('')}</div>
      <p class="note">1まい 買えます${p.cards.length >= HAND_MAX ? '（手札が いっぱいなので、買うと 1まい すてます）' : ''}${rest ? `<br>買い物の あと、のこり <b>${rest}マス</b> 進むよ` : ''}</p>`,
    buttons: [{ label: rest ? '買わずに 進む' : '買わない', value: -1 }],
  }, {
    kind: 'shop',
    cpu: () => planShop(p, items),
    sel: v => (v >= 0 ? `.buy[data-k="${v}"]` : null),
    ms: 2200,
    mount: (el, finish) => { $$('.buy:not(.cant)', el).forEach(b => b.addEventListener('click', () => { sfx('tap'); finish(Number(b.dataset.k)); })); },
  });
  if (v < 0) { if (!rest) { toast('またきてね！'); await wait(900); } return; }
  const id = items[v];
  p.points -= CARDS[id].price;
  sfx('point');
  floater(p.i, `−${CARDS[id].price}`, true);
  paintPlayers();
  toast(`「${CARDS[id].name}」を 買った！`, 'good');
  await gainCard(p, id);
  await wait(500);
}


/* ---------- 決闘（部首しんけいすいじゃく） ---------- */
// 同じマスに 止まったら 決闘。勝った人が ポイントを うばい、負けた人は 2マス もどる
const DUEL_PTS = 20;
// もどり値：true＝番の人が 負けて もどった（このあとの マスの できごとは なし）
async function maybeDuel(p) {
  if (S.ended || p.pos <= 0 || p.pos >= GOAL) return false;
  const there = S.players.filter(q => q !== p && q.pos === p.pos);
  if (!there.length) return false;
  const foe = there.sort((a, b) => b.points - a.points || a.i - b.i)[0];
  const { winner, pairs, got } = await duel(p, foe);
  const loser = winner === p ? foe : p;
  const amt = Math.min(DUEL_PTS, loser.points);
  const list = pairs.map(x => `<span class="dl-made"><b>${x.bushu}</b><small>${x.name}</small>＋<b>${x.rest}</b>＝<em>${x.kanji}</em></span>`).join('');
  sfx('win');
  await dlg(au({
    tone: 'good', title: `${esc(winner.name)} の かち！`,
    body: `<div class="vs">${ava(winner, 'lg')}<span class="vs-arrow">${got[winner.i]} − ${got[loser.i]}</span>${ava(loser, 'lg')}</div>
      <p><b>${esc(winner.name)}</b> は ${amt ? `<b>${esc(loser.name)}</b> から ${amt}ポイント ゲット！` : `${esc(loser.name)} が ポイントを もっていなかった…`}<br><b>${esc(loser.name)}</b> は 2マス もどる</p>
      <div class="dl-list">${list}</div>`,
    buttons: [{ label: 'つぎへ', value: true, kind: 'primary' }],
  }, 3200));
  loser.points -= amt;
  winner.points += amt;
  paintPlayers();
  bump(winner.i); bump(loser.i);
  if (amt) { floater(winner.i, `＋${amt}`); floater(loser.i, `−${amt}`, true); sfx('point'); }
  await lookAt(loser.i, 500);
  sfx('hit');
  Stage.sad(loser.i);
  await wait(300);
  await move(loser, -2);
  toast(`${loser.name} は 2マス もどった`, 'bad');
  await wait(900);
  lookBack();
  return loser === p;
}

// 決闘の はじまり：画面いっぱいの 演出（光の すじ・左右から 登場・VSで ぶつかる・決闘！！が ドーン）
async function duelIntro(a, b) {
  let el = $('#duel-intro');
  if (!el) { el = document.createElement('div'); el.id = 'duel-intro'; document.body.append(el); }
  const side = (p, cls) => `
    <div class="di-side ${cls}" style="--c:${charDef(p.char).ui}">
      <div class="di-ava">${ava(p)}</div>
      <div class="di-name">${esc(p.name)}</div>
    </div>`;
  const sparks = Array.from({ length: 14 }, (_, k) => `<i style="--a:${k * (360 / 14) + 8}deg;--d:${110 + (k % 3) * 45}px"></i>`).join('');
  el.innerHTML = `
    <div class="di-shake">
      <div class="di-bg"></div>
      <div class="di-rays"></div>
      <div class="di-panel left" style="--c:${charDef(a.char).ui}"></div>
      <div class="di-panel right" style="--c:${charDef(b.char).ui}"></div>
      <div class="di-slash"></div>
      <div class="di-vignette"></div>
      ${side(a, 'left')}${side(b, 'right')}
      <div class="di-vs">VS</div>
      <div class="di-sparks">${sparks}</div>
      <div class="di-flash"></div>
      <div class="di-title">決闘!!</div>
      <div class="di-sub">部首しんけいすいじゃく</div>
    </div>`;
  el.className = 'show';
  void el.offsetWidth;
  el.classList.add('go');
  sfx('duel');
  await wait(REDUCED ? 1400 : 2900);
  el.classList.add('out');
  await wait(320);
  el.className = '';
  el.innerHTML = '';
}

async function duel(a, b) {
  const id = gameId;
  await lookAt(b.i, 300);
  await duelIntro(a, b);
  lookBack();
  const pairs = pickPairs(S.settings.grade);
  const cards = makeBoard(pairs);
  const taken = Array(cards.length).fill(-1);   // とった人の 番号
  const seen = new Set();                        // いちど めくられた カード（CPU が 覚える）
  const got = { [a.i]: 0, [b.i]: 0 };
  let up = [];                                   // いま 表の カード
  let tapResolve = null;
  const face = (c, i) => {
    const x = pairs[c.pair];
    const inner = c.side === 'bushu'
      ? `<b>${x.bushu}</b><small>${x.name}</small><em>部首</em>`
      : `<b>${x.rest}</b>`;
    const who = taken[i] >= 0 ? S.players[taken[i]] : null;
    return `<button type="button" class="mc ${up.includes(i) || who ? 'up' : ''} ${who ? 'got' : ''} ${c.side}" data-i="${i}" ${who ? `style="--c:${charDef(who.char).ui}"` : ''}>
      <span class="mc-in"><span class="mc-back">？</span><span class="mc-face">${inner}</span></span></button>`;
  };
  const head = (turn, text) => `
    <div class="dl-head">
      <span class="dl-p ${turn === a ? 'now' : ''}">${ava(a)}<b>${esc(a.name)}</b><i>${got[a.i]}</i></span>
      <span class="dl-vs">VS</span>
      <span class="dl-p ${turn === b ? 'now' : ''}">${ava(b)}<b>${esc(b.name)}</b><i>${got[b.i]}</i></span>
    </div>
    <p class="dl-msg">${text}</p>`;
  let ctrl = null;
  const done = dlg({
    tone: 'card', cls: 'wide duel-sheet', title: '決闘！ 部首しんけいすいじゃく',
    body: `<div class="dl-top"></div><div class="dl-board">${cards.map(face).join('')}</div><p class="dl-rule">「部首」と もう1まいで 1つの 漢字が できたら ゲット！ ゲットしたら もう1回</p>`,
    buttons: [],
    mount: (el, finish) => {
      ctrl = { el, finish };
      el.addEventListener('click', e => {
        const c = e.target.closest('.mc');
        if (!c || !tapResolve) return;
        const i = Number(c.dataset.i);
        if (taken[i] >= 0 || up.includes(i)) return;
        const r = tapResolve;
        tapResolve = null;
        r(i);
      });
    },
  });
  done.catch(() => {});
  const guard = pr => Promise.race([pr, done.then(() => { throw new Abort(); })]);
  const draw = (turn, text) => {
    ctrl.el.querySelector('.dl-top').innerHTML = head(turn, text);
    const bd = ctrl.el.querySelector('.dl-board');
    bd.innerHTML = cards.map(face).join('');
    bd.classList.toggle('can', !!tapResolve);
  };
  const local = p => !p.cpu && (!NET || NET.isMe(p));
  // 1まい えらぶ（CPU・この iPad の人・ほかの iPad の人）
  async function pick(p) {
    for (;;) {
      if (p.cpu) {
        await wait(750);
        return cpuFlip(p.cpu, cards, taken.map(t => t >= 0), seen, up.length ? up[0] : null);
      }
      if (local(p)) {
        const pr = new Promise(r => { tapResolve = r; });
        draw(p, `${NET ? 'あなた' : esc(p.name) + ' さん'}の 番：カードを ${up.length ? 'もう1まい' : '2まい'} めくろう`);
        const i = await guard(pr);
        tapResolve = null;
        chk(id);
        if (!NET) return i;
        const e = await NET.commit('flip', i);
        chk(id);
        if (e.k === 'leave') { leaveTo(e); continue; }
        return e.v;
      }
      const e = await guard(NET.next(p));
      chk(id);
      if (e.k === 'leave') { leaveTo(e); continue; }
      return e.v;
    }
  }
  let turn = a;
  while (got[a.i] + got[b.i] < pairs.length) {
    draw(turn, local(turn) ? '' : `${esc(turn.name)}${turn.cpu ? '（CPU）' : ' さん'}が めくっています…`);
    up = [];
    const i1 = await pick(turn);
    up = [i1]; seen.add(i1); sfx('card');
    draw(turn, '');
    const i2 = await pick(turn);
    up = [i1, i2]; seen.add(i2); sfx('card');
    draw(turn, '');
    await wait(700);
    const c1 = cards[i1], c2 = cards[i2];
    if (c1.pair === c2.pair) {
      const x = pairs[c1.pair];
      taken[i1] = taken[i2] = turn.i;
      got[turn.i]++;
      up = [];
      sfx('good');
      draw(turn, `<span class="dl-hit"><b>${x.bushu}</b>（${x.name}）＋ <b>${x.rest}</b> ＝ <em>${x.kanji}</em></span><br>${esc(turn.name)} が ゲット！`);
      await wait(1600);
    } else {
      sfx('bad');
      draw(turn, 'ざんねん… 漢字に ならない');
      await wait(1100);
      up = [];
      turn = turn === a ? b : a;
    }
  }
  const winner = got[a.i] > got[b.i] ? a : b;
  ctrl.finish(true);
  await done;
  return { winner, pairs, got };
}

/* ---------- マスのできごと ---------- */
async function tileEvent(p) {
  const type = Stage.tileType(p.pos);
  switch (type) {
    case 'point':
      p.points += 10;
      sfx('point');
      floater(p.i, '＋10');
      toast('ポイントマス！ ＋10ポイント', 'good');
      paintPlayers(); bump(p.i);
      await wait(1200);
      break;
    case 'minus': {
      const lost = Math.min(10, p.points);
      p.points -= lost;
      sfx('minus');
      floater(p.i, `−${lost}`, true);
      toast(lost ? 'ざんねんマス… −10ポイント' : 'ざんねんマス…（ポイントは 0 のまま）', 'bad');
      paintPlayers(); bump(p.i);
      await wait(1200);
      break;
    }
    case 'fwd':
      toast('すすむマス！ さらに 2マス 進む', 'good');
      await wait(800);
      await move(p, 2, { shops: true });
      if (p.pos >= GOAL) return reachGoal(p);
      await maybeDuel(p);
      break;
    case 'back':
      toast('もどるマス… 2マス もどる', 'bad');
      await wait(800);
      await move(p, -2);
      break;
    case 'card':
      await cardTile(p);
      break;
    case 'shop':
      await shop(p);
      break;
    case 'chance':
      return chance(p);
    case 'again':
      floater(p.i, 'もう1回！');
      toast('もう1回マス！ もう1回 サイコロを ふれる', 'good');
      await wait(1100);
      return 'again';
  }
}

// チャンスマス：なにが おきるかは 運しだい（運のたね から えらぶので オンラインでも 同じ）
const CHANCES = [
  { id: 'pts20', w: 3, icon: '💰', text: '＋20ポイント！' },
  { id: 'card', w: 3, icon: '🃏', text: 'カードを 1まい もらえる！' },
  { id: 'go3', w: 2, icon: '👟', text: '3マス 進む！' },
  { id: 'gift', w: 2, icon: '🎁', text: 'みんなから 5ポイントずつ もらえる！' },
  { id: 'back3', w: 1, icon: '🌀', text: '3マス もどる…' },
  { id: 'rest', w: 1, icon: '💤', text: 'つぎの番は 1回休み…' },
];
async function chance(p) {
  const total = CHANCES.reduce((a, c) => a + c.w, 0);
  let r = rand() * total, pick = CHANCES[0];
  for (const c of CHANCES) { r -= c.w; if (r <= 0) { pick = c; break; } }
  sfx('card');
  await dlg(au({
    tone: 'card', title: 'チャンス！',
    body: `<div class="chance-reel"><span class="chance-icon">❔</span></div><p class="chance-text">なにが おきるかな…？</p>`,
    buttons: [{ label: 'OK', value: true, kind: 'primary' }],
    mount: el => {
      // くるくる 回って 止まる
      const ic = el.querySelector('.chance-icon'), tx = el.querySelector('.chance-text');
      const btn = el.querySelector('.s-actions .btn');
      if (btn) btn.disabled = true;
      let k = 0;
      const iv = setInterval(() => { ic.textContent = CHANCES[k++ % CHANCES.length].icon; sfx('tick'); }, 90);
      const t = setTimeout(() => {
        clearInterval(iv);
        ic.textContent = pick.icon;
        ic.classList.add('hit');
        tx.textContent = pick.text;
        sfx(pick.id === 'back3' || pick.id === 'rest' ? 'bad' : 'good');
        if (btn) btn.disabled = false;
      }, 1300);
      return () => { clearInterval(iv); clearTimeout(t); };
    },
  }, 3000));
  switch (pick.id) {
    case 'pts20':
      p.points += 20;
      floater(p.i, '＋20');
      sfx('point');
      paintPlayers(); bump(p.i);
      await wait(900);
      break;
    case 'card':
      await gainCard(p, drawCard());
      break;
    case 'go3':
      await move(p, 3, { shops: true });
      if (p.pos >= GOAL) return reachGoal(p);
      await maybeDuel(p);
      break;
    case 'gift': {
      let got = 0;
      for (const q of S.players) if (q !== p) { const a = Math.min(5, q.points); q.points -= a; got += a; }
      p.points += got;
      floater(p.i, `＋${got}`);
      sfx('point');
      paintPlayers(); bump(p.i);
      await wait(900);
      break;
    }
    case 'back3':
      Stage.sad(p.i);
      await move(p, -3);
      break;
    case 'rest':
      p.skip = true;
      paintPlayers();
      floater(p.i, '1回休み', true);
      await wait(900);
      break;
  }
}

async function reachGoal(p) {
  S.ended = true;
  S.winner = p.i;
  setRollReady(false);
  paintPlayers();
  renderHand();
  sfx('win');
  confetti();
  toast(`${p.name} が ゴール！`, 'good');
  await Stage.happy(p.i, 3);
}

/* ---------- 問題 ---------- */
async function askQuestion(p, q, opts) {
  const id = gameId;
  if (!NET || p.cpu) return questionDlg(p, q, opts);
  if (NET.isMe(p)) {
    const res = await questionDlg(p, q, opts);
    const e = await NET.commit('ans', res);
    chk(id);
    if (e.k === 'leave') { leaveTo(e); return { correct: false, pass: true }; }
    return e.v;
  }
  const e = await questionDlg(p, q, { ...opts, watch: NET.next(p) });
  if (e.k === 'leave') { leaveTo(e); return { correct: false, pass: true }; }
  return e.v;
}

// watch＝ほかの iPad の人の 答えを 待つ（届いたら その { k, v } で とじる）
function questionDlg(p, q, { hint = false, cpu = null, watch = null } = {}) {
  const limit = S.settings.time;
  const owner = !cpu && !watch;   // この iPad で 答える
  const timer = limit ? `<div class="timer"><svg viewBox="0 0 60 60"><circle class="track" cx="30" cy="30" r="25"/><circle class="bar" cx="30" cy="30" r="25" pathLength="1"/></svg><b>${limit}</b></div>` : '';
  const body = `
    <div class="q-head">
      <div class="q-who">${ava(p)}<span><b>${esc(p.name)}</b> の 問題<br><span class="chip">${S.settings.grade}年の漢字</span></span></div>
      ${timer}
    </div>
    <div class="q-card"><div class="q-kanji ${Array.from(q.kanji).length >= 3 ? 'len3' : ''}">${esc(q.kanji)}</div></div>
    <p class="q-lead">この 漢字の 読みかたは？</p>
    ${hint ? `<p class="q-hint">ヒント：さいしょの 文字は「<b>${esc(Array.from(q.yomi)[0])}</b>」</p>` : ''}
    <form class="q-form" autocomplete="off">
      <input class="q-input" type="text" lang="ja" placeholder="ひらがなで こたえよう" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done">
      <button class="btn primary" type="submit">こたえる</button>
    </form>
    <div class="q-sub"><p class="q-warn"></p><button type="button" class="btn small q-pass">わからない</button></div>`;
  return dlg({
    tone: 'q', cls: `q-sheet ${cpu || watch ? 'cpu' : ''}`, top: true, buttons: [], body,
    mount: (el, finish) => {
      const input = $('.q-input', el), warn = $('.q-warn', el);
      const start = performance.now();
      let raf = 0, done = false, lastSec = -1;
      const left = () => limit ? Math.max(0, limit - (performance.now() - start) / 1000) : 0;
      let iv = 0;
      const end = r => { if (done) return; done = true; cancelAnimationFrame(raf); clearInterval(iv); finish(r); };
      const shake = node => { node.animate([{ transform: 'translateX(-8px)' }, { transform: 'translateX(7px)' }, { transform: 'translateX(-4px)' }, { transform: 'none' }], { duration: 350 }); };
      $('.q-form', el).addEventListener('submit', e => {
        e.preventDefault();
        const raw = input.value;
        if (!raw.trim()) { shake(input); input.focus(); return; }
        if (hasKanji(raw)) { warn.textContent = '漢字に しないで、ひらがなで 入れてね'; shake(warn); input.focus(); return; }
        end({ correct: isCorrect(raw, q), input: raw.trim(), timeLeft: left() });
      });
      $('.q-pass', el).addEventListener('click', () => end({ correct: false, pass: true }));
      if (limit) {
        const tEl = $('.timer', el), bar = $('.timer .bar', el), num = $('.timer b', el);
        const tick = () => {
          const l = left();
          // 時間ぎれを 決めるのは 答える人の iPad だけ（CPU・ほかの人のは 見せるだけ）
          if (l <= 0) { num.textContent = '0'; bar.style.strokeDashoffset = '-1'; if (owner) end({ correct: false, timeout: true, input: input.value.trim() }); return; }
          const sec = Math.ceil(l);
          if (sec !== lastSec) {
            lastSec = sec;
            num.textContent = sec;
            tEl.classList.toggle('warn', sec <= 10 && sec > 5);
            tEl.classList.toggle('danger', sec <= 5);
            if (sec <= 5) sfx('tick');
          }
          bar.style.strokeDashoffset = String(-(1 - l / limit));
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        // 画面が かくれて 絵が 止まっても、時間ぎれは 決める
        if (owner) iv = setInterval(() => { if (left() <= 0) end({ correct: false, timeout: true, input: input.value.trim() }); }, 300);
      }
      if (cpu) {
        // CPU：かんがえて、1文字ずつ 入れて こたえる
        input.readOnly = true;
        input.placeholder = `${p.name}（CPU）が かんがえ中…`;
        const chars = cpu.text ? Array.from(cpu.text) : [];
        const start2 = Math.max(600, cpu.think * 1000 - chars.length * 170);
        setTimeout(() => {
          if (done) return;
          if (cpu.pass) { end({ correct: false, pass: true }); return; }
          chars.forEach((ch, k) => setTimeout(() => { if (!done) { input.value += ch; sfx('tap'); } }, k * 170));
          // のこり時間は 考えた 時間から 決める（オンラインで みんな 同じ ポイントに なるように）
          setTimeout(() => { if (!done) end({ correct: isCorrect(cpu.text, q), input: cpu.text, timeLeft: limit ? Math.max(0, limit - cpu.think) : 0 }); }, chars.length * 170 + 350);
        }, start2);
      } else if (watch) {
        input.readOnly = true;
        input.placeholder = `${p.name} さんが こたえ中…`;
        watch.then(e => {
          if (done || !e) return;
          if (e.k !== 'leave' && e.v && e.v.input) input.value = e.v.input;
          done = true;
          cancelAnimationFrame(raf);
          setTimeout(() => finish(e), 500);
        });
      } else setTimeout(() => { if (!done) input.focus(); }, 90);
      return () => { done = true; cancelAnimationFrame(raf); clearInterval(iv); };
    },
  });
}

function hanamaru() {
  const pts = [];
  for (let t = 0; t <= 1; t += 0.01) {
    const th = -Math.PI / 2 + t * Math.PI * 2 * 2.1, r = 3 + t * 22;
    pts.push([60 + r * Math.cos(th), 60 + r * Math.sin(th)]);
  }
  const th0 = -Math.PI / 2 + Math.PI * 2 * 2.1;
  for (let t = 0; t <= 1.04; t += 0.004) {
    const th = th0 + t * Math.PI * 2;
    const petal = 40 + 15 * Math.abs(Math.sin(3 * (th - th0)));
    const r = 25 + (petal - 25) * Math.min(1, t / 0.12);
    pts.push([60 + r * Math.cos(th), 60 + r * Math.sin(th)]);
  }
  return `<svg class="hanamaru" viewBox="0 0 120 120" aria-hidden="true"><path pathLength="1" d="M${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L')}"/></svg>`;
}

/* ---------- 結果 ---------- */
async function showResult() {
  const order = [...S.players].sort((a, b) => (b.pos >= GOAL) - (a.pos >= GOAL) || b.pos - a.pos || b.points - a.points);
  const rows = order.map((p, k) => `
    <div class="rk ${k === 0 ? 'first' : ''}">
      <span class="place">${k + 1}位</span>${ava(p, k === 0 ? 'lg' : '')}
      <span class="nm">${esc(p.name)}${p.cpu ? ' <small class="cpu-tag in">CPU</small>' : ''}</span>
      <span class="st"><b>${p.points}</b> ポイント・カード ${p.stats.cardsUsed}回<br>せいかい ${p.stats.correct} / ${p.stats.asked}　${p.pos >= GOAL ? 'ゴール' : `あと${GOAL - p.pos}マス`}</span>
    </div>`).join('');
  const seen = new Set(), missed = [];
  for (const p of S.players) for (const q of p.stats.missed) if (!seen.has(q.kanji)) { seen.add(q.kanji); missed.push(q); }
  const review = missed.length
    ? `<h3 class="rv-title">もういちど 読んでみよう</h3><div class="rv-list">${missed.map(q => `<span class="rv"><ruby>${esc(q.kanji)}<rt>${esc(q.yomi)}</rt></ruby></span>`).join('')}</div>`
    : '<p class="rv-perfect">まちがえた 漢字は ありません。すごい！</p>';
  const winner = S.players[S.winner];
  Stage.setView('follow');
  const v = await dlg({
    cls: 'wide', title: `${esc(winner.name)} の かち！`,
    body: `<div class="rank">${rows}</div>${review}`,
    buttons: NET
      ? [{ label: '部屋に もどる', value: 'lobby', kind: 'primary big' }, { label: 'はじめの画面へ', value: 'title' }]
      : [{ label: 'もういちど あそぶ', value: 'again', kind: 'primary big' }, { label: 'はじめの画面へ', value: 'title' }],
  });
  const settings = S.settings;
  if (v === 'again') startGame(settings, onExit);
  else { const exit = onExit; stopGame(); exit(v); }
}

/* ---------- 紙ふぶき ---------- */
function confetti() {
  if (REDUCED) return;
  const cv = $('#confetti'), ctx = cv.getContext('2d'), dpr = window.devicePixelRatio || 1;
  const W = innerWidth, H = innerHeight;
  cv.width = W * dpr; cv.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  cv.hidden = false;
  const colors = ['#FF5C7A', '#FFD45C', '#4FA8FF', '#4CC07A', '#B57BFF', '#FF8A5B'];
  const parts = Array.from({ length: 160 }, () => ({
    x: Math.random() * W, y: -20 - Math.random() * H * 0.7, vx: -1 + Math.random() * 2, vy: 1.8 + Math.random() * 2.6,
    r: Math.random() * 6.28, vr: -0.15 + Math.random() * 0.3, w: 8 + Math.random() * 8, h: 10 + Math.random() * 8,
    c: colors[Math.floor(Math.random() * colors.length)], star: Math.random() < 0.3, sway: Math.random() * 6.28,
  }));
  const t0 = performance.now();
  const frame = t => {
    ctx.clearRect(0, 0, W, H);
    for (const q of parts) {
      q.sway += 0.05; q.x += q.vx + Math.sin(q.sway) * 0.9; q.y += q.vy; q.r += q.vr;
      ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.r); ctx.fillStyle = q.c;
      if (q.star) { ctx.beginPath(); for (let k = 0; k < 10; k++) { const rr = k % 2 ? q.w * 0.3 : q.w * 0.7, a = k * Math.PI / 5; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } ctx.fill(); }
      else ctx.fillRect(-q.w / 2, -q.h / 4, q.w, q.h / 2);
      ctx.restore();
    }
    if (t - t0 < 6000) requestAnimationFrame(frame);
    else { ctx.clearRect(0, 0, W, H); cv.hidden = true; }
  };
  requestAnimationFrame(frame);
}
