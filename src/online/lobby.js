// オンラインの 画面：部屋を つくる／入る → 部屋の中（メンバー・学年・時間・CPU）→ ゲーム
import { CHARACTERS } from '../three/characters.js';
import { sfx } from '../sfx.js';
import { ONLINE } from './config.js';
import * as Net from './net.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const KEY = 'kanji-sugoroku-online';
const LEVEL = { 1: 'よわい', 2: 'ふつう', 3: 'つよい' };

let opt = null;        // main.js から もらう { showScreen, face, startGame, toTitle }
let prof = { name: '', char: 'tanuki' };
let code = null, room = null, uid = null, off = null, seenRound = null, playing = false, busy = false;

try { prof = { ...prof, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch (e) { /* なし */ }
const saveProf = () => { try { localStorage.setItem(KEY, JSON.stringify(prof)); } catch (e) { /* なし */ } };

export function initOnline(o) {
  opt = o;
  $('#o-name').value = prof.name;
  $('#o-name').addEventListener('input', e => { prof.name = Net.cleanName(e.target.value); saveProf(); });
  $('#o-chars').addEventListener('click', e => {
    const b = e.target.closest('button[data-c]');
    if (!b) return;
    sfx('tap');
    prof.char = b.dataset.c;
    saveProf();
    paintEntry();
  });
  $('#o-code').addEventListener('input', e => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4); });
  $('#btn-create').addEventListener('click', create);
  $('#btn-join').addEventListener('click', join);
  $('#o-code').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) join(); });
  $('#btn-online-back').addEventListener('click', () => { sfx('tap'); opt.toTitle(); });
  $('#btn-room-leave').addEventListener('click', async () => { sfx('tap'); await leave(); });
  $('#btn-room-start').addEventListener('click', start);
  $('#btn-add-cpu').addEventListener('click', addCpu);
  $('#room-grade').addEventListener('click', e => { const b = e.target.closest('button'); if (b && amHost()) { sfx('tap'); Net.setSettings(code, { grade: Number(b.dataset.v) }); } });
  $('#room-time').addEventListener('click', e => { const b = e.target.closest('button'); if (b && amHost()) { sfx('tap'); Net.setSettings(code, { time: Number(b.dataset.v) }); } });
  $('#room-members').addEventListener('click', onMemberClick);
}

/* ---------- はいる前 ---------- */
export function openOnline() {
  opt.showScreen('online');
  $('#online-entry').hidden = false;
  $('#online-room').hidden = true;
  msg('');
  paintEntry();
  $('#o-test').textContent = Net.isTestMode() ? 'テストモード（このパソコンの 別のタブどうしだけ）' : '';
}
function paintEntry() {
  $('#o-chars').innerHTML = CHARACTERS.map(c => `<button type="button" data-c="${c.id}" aria-pressed="${prof.char === c.id}" aria-label="${c.name}">${opt.face(c.id)}</button>`).join('');
}
const msg = (t, el = '#o-msg') => { $(el).textContent = t; };
function checkName() {
  prof.name = Net.cleanName($('#o-name').value);
  saveProf();
  if (!prof.name) { msg('なまえを 入れてね'); $('#o-name').focus(); return false; }
  return true;
}

async function create() {
  if (busy || !checkName()) return;
  sfx('tap');
  busy = true;
  msg('部屋を つくっています…');
  try {
    const c = await Net.createRoom(prof);
    await enter(c);
  } catch (e) {
    console.error(e);
    msg('部屋を つくれませんでした。通信を たしかめてね');
  } finally { busy = false; }
}
async function join() {
  if (busy || !checkName()) return;
  const c = $('#o-code').value.trim();
  if (!/^\d{4}$/.test(c)) { msg('4けたの ばんごうを 入れてね'); return; }
  sfx('tap');
  busy = true;
  msg('さがしています…');
  try {
    const r = await Net.joinRoom(c, prof);
    if (!r.ok) { msg(r.reason); return; }
    await enter(c);
  } catch (e) {
    console.error(e);
    msg('入れませんでした。通信を たしかめてね');
  } finally { busy = false; }
}

/* ---------- 部屋の中 ---------- */
async function enter(c) {
  code = c;
  uid = await Net.myUid();
  seenRound = null;
  room = null;
  $('#room-code').textContent = c;
  showRoom();
  if (off) off();
  off = await Net.watchRoom(c, onRoom);
}
function showRoom() {
  opt.showScreen('online');
  $('#online-entry').hidden = true;
  $('#online-room').hidden = false;
  msg('', '#room-msg');
}
const amHost = () => !!room && room.meta && room.meta.host === uid;

function onRoom(r) {
  if (!code) return;
  if (!r || !r.meta) {
    // 部屋が 消えた
    const wasPlaying = playing;
    stopWatch();
    if (wasPlaying) return; // ゲーム中は そのまま（ゲームの 中で ぬけた人として あつかわれる）
    openOnline();
    msg('部屋が なくなりました');
    return;
  }
  room = r;
  const round = r.game?.round || 0;
  if (seenRound === null) seenRound = r.meta.status === 'playing' ? round - 1 : round;
  // ホストが いなくなっていたら、いちばん はやく 入った人が ホストに なる
  const active = Net.roster(r).filter(m => m.uid && m.online !== false);
  if (active.length && !active.some(m => m.uid === r.meta.host) && active[0].uid === uid) Net.setMeta(code, { host: uid });
  // ゲームが はじまった
  if (round > seenRound && r.meta.status === 'playing' && r.game) {
    seenRound = round;
    if (r.game.players.some(p => p.uid === uid)) { startRound(r.game); return; }
  }
  if (!playing) paintRoom();
}

function paintRoom() {
  const list = Net.roster(room);
  const used = list.map(m => m.char);
  const host = amHost();
  $('#room-members').innerHTML = list.map((m, i) => {
    const mine = m.uid === uid;
    const charCell = mine
      ? `<div class="chars">${CHARACTERS.map(c => `<button type="button" data-c="${c.id}" aria-pressed="${m.char === c.id}" ${used.includes(c.id) && m.char !== c.id ? 'disabled' : ''} aria-label="${c.name}">${opt.face(c.id)}</button>`).join('')}</div>`
      : `<span class="one-face">${opt.face(m.char)}</span>`;
    const tags = [
      m.uid && m.uid === room.meta.host ? '<span class="host-tag">ホスト</span>' : '',
      mine ? '<small>（あなた）</small>' : '',
      m.uid && m.online === false ? '<small class="off">（つうしんが きれた）</small>' : '',
    ].join('');
    const cpuCell = m.cpuId
      ? (host
        ? `<button type="button" class="who is-cpu" data-cpu="${m.cpuId}">CPU<small>${LEVEL[m.cpu || 2]}</small></button><button type="button" class="pill icon x-cpu" data-del="${m.cpuId}" aria-label="CPU を 出す">×</button>`
        : `<span class="who is-cpu">CPU<small>${LEVEL[m.cpu || 2]}</small></span>`)
      : '';
    return `<div class="prow ${mine ? 'me' : ''}"><span class="no">${i + 1}P</span>${charCell}<span class="rname">${esc(m.cpuId ? 'CPU' : m.name)}${tags}</span>${cpuCell}</div>`;
  }).join('');
  $('#room-host-only').hidden = !host;
  $$('#room-grade button').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.v) === (room.settings?.grade || 4))));
  $$('#room-time button').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.v) === (room.settings?.time ?? 20))));
  $('#btn-add-cpu').disabled = list.length >= ONLINE.maxPlayers;
  const start = $('#btn-room-start');
  start.hidden = !host;
  start.disabled = list.filter(m => !m.uid || m.online !== false).length < 2;
  msg(host
    ? (start.disabled ? 'ともだちが 入るのを まってね（CPU を 入れても あそべるよ）' : 'そろったら「はじめる！」')
    : `学年 ${room.settings?.grade || 4}年・${room.settings?.time ? room.settings.time + '秒' : '時間なし'}　ホストが はじめるのを まってね`, '#room-msg');
}

async function onMemberClick(e) {
  const c = e.target.closest('.prow.me .chars button[data-c]');
  if (c && !c.disabled) {
    sfx('tap');
    prof.char = c.dataset.c;
    saveProf();
    Net.setMine(code, { char: c.dataset.c });
    return;
  }
  if (!amHost()) return;
  const w = e.target.closest('[data-cpu]');
  if (w) {
    sfx('tap');
    const cur = room.cpus?.[w.dataset.cpu]?.cpu || 2;
    Net.setCpu(code, w.dataset.cpu, { cpu: cur % 3 + 1 });
    return;
  }
  const d = e.target.closest('[data-del]');
  if (d) { sfx('tap'); Net.removeCpu(code, d.dataset.del); }
}

function addCpu() {
  if (!amHost()) return;
  const used = Net.usedChars(room);
  const free = CHARACTERS.find(c => !used.includes(c.id));
  if (!free || Net.roster(room).length >= ONLINE.maxPlayers) return;
  sfx('tap');
  Net.addCpu(code, free.id);
}

async function start() {
  if (!amHost() || busy) return;
  sfx('tap');
  busy = true;
  try { await Net.startRound(code, room); } catch (e) { console.error(e); msg('はじめられませんでした', '#room-msg'); } finally { busy = false; }
}

async function startRound(g) {
  playing = true;
  const net = await Net.makeNet(code, g.round);
  const players = g.players.map(p => ({ ...p, name: p.cpu ? `CPU${CHARACTERS.find(c => c.id === p.char)?.name || ''}` : p.name }));
  opt.startGame({ grade: g.grade, time: g.time, seed: g.seed, players }, net, async v => {
    playing = false;
    if (v === 'lobby' && code) {
      if (amHost()) await Net.setMeta(code, { status: 'lobby' });
      showRoom();
      if (room) paintRoom();
    } else {
      await leave({ inGame: false });
    }
  });
}

/* ---------- 出る ---------- */
function stopWatch() {
  if (off) off();
  off = null;
  code = null;
  room = null;
  playing = false;
}
export async function leave({ inGame = false } = {}) {
  const c = code;
  stopWatch();
  if (c) { try { await Net.leaveRoom(c, { inGame }); } catch (e) { console.error(e); } }
  opt.toTitle();
}
export const inRoom = () => !!code;
