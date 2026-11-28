// オンライン対戦の 部屋と、ゲーム中の「えらんだこと」の やりとり
//
// しくみ：みんなの iPad が 同じ「運のたね（seed）」で 同じ ゲームを 動かす。
// 送るのは 人が えらんだこと（サイコロ／カード・答え・相手・反撃・お店・すてるカード）だけ。
// えらんだことは log/回/番号 に 早い者勝ちで 1つずつ 書く。みんな 同じ じゅんに 読む。
//
// データの形（sugoroku/rooms/ばんごう4けた）
//   meta     { createdAt, host, status: 'lobby' | 'playing' }
//   settings { grade, time, map }
//   members  { uid: { name, char, joinedAt, online, left } }
//   cpus     { id: { char, cpu, at } }       … ホストが 入れた CPU
//   game     { round, seed, grade, time, map, players: [{ uid?, name, char, cpu }] }
//   log      { 回: { 番号: { k, v } } }       … k＝なにを えらんだか（'leave' は「ぬけたので CPU に」）
import { FIREBASE_CONFIG, ONLINE } from './config.js';

const forceLocal = new URLSearchParams(location.search).has('local');
let dbPromise = null;

/** 通信をはじめる（Firebase の設定が なければ テストモード） */
export function getDb() {
  if (!dbPromise) {
    dbPromise = FIREBASE_CONFIG && !forceLocal
      ? import('./firebaseDb.js').then(m => m.createFirebaseDb(FIREBASE_CONFIG))
      : import('./localDb.js').then(m => m.createLocalDb());
    dbPromise.catch(() => { dbPromise = null; });
  }
  return dbPromise;
}
export const isTestMode = () => !FIREBASE_CONFIG || forceLocal;

const R = (code, sub = '') => `sugoroku/rooms/${code}${sub ? '/' + sub : ''}`;
export const cleanName = s => String(s || '').trim().slice(0, ONLINE.nameMaxLength);

/** 部屋にいる人（入った順）＋ CPU */
export function roster(room) {
  const ms = Object.entries(room?.members || {})
    .map(([uid, m]) => ({ uid, ...m }))
    .filter(m => !m.left)
    .sort((a, b) => a.joinedAt - b.joinedAt || (a.uid < b.uid ? -1 : 1));
  const cs = Object.entries(room?.cpus || {})
    .map(([id, c]) => ({ cpuId: id, ...c }))
    .sort((a, b) => a.at - b.at);
  return [...ms, ...cs];
}
export const usedChars = room => roster(room).map(m => m.char);

/* ---------- 部屋 ---------- */
let presenceOff = null;
function presence(db, code) {
  if (presenceOff) presenceOff();
  presenceOff = db.onConnected(on => {
    if (!on) return;
    db.onDisconnectSet(R(code, `members/${db.uid}/online`), false);
    db.update(R(code, `members/${db.uid}`), { online: true }).catch(() => {});
  });
}
function stopPresence(db) {
  if (presenceOff) { presenceOff(); presenceOff = null; }
  db.cancelOnDisconnect();
}

export async function createRoom({ name, char }) {
  const db = await getDb();
  for (let t = 0; t < 30; t++) {
    const code = String(1000 + Math.floor(Math.random() * 9000));
    const old = await db.get(R(code, 'meta'));
    if (old && old.createdAt > db.now() - ONLINE.roomExpireHours * 3600000) continue;
    try {
      await db.set(R(code), {
        meta: { createdAt: db.now(), host: db.uid, status: 'lobby' },
        settings: { grade: 4, time: 20 },
        members: { [db.uid]: { name: cleanName(name), char, joinedAt: db.now(), online: true } },
      });
    } catch (e) { continue; }
    presence(db, code);
    return code;
  }
  throw new Error('部屋を 作れませんでした');
}

// { ok:true } か { ok:false, reason }
export async function joinRoom(code, { name, char }) {
  const db = await getDb();
  const room = await db.get(R(code));
  if (!room || !room.meta) return { ok: false, reason: 'その ばんごうの 部屋は ありません' };
  const mine = room.members && room.members[db.uid];
  if (!mine || mine.left) {
    if (room.meta.status !== 'lobby') return { ok: false, reason: 'その部屋は もう ゲーム中です' };
    if (roster(room).length >= ONLINE.maxPlayers) return { ok: false, reason: 'その部屋は もう いっぱいです' };
  }
  const used = usedChars(room).filter((c, i, a) => !(mine && !mine.left && c === mine.char));
  const ALL = ['tanuki', 'neko', 'usagi', 'pengin'];
  const myChar = used.includes(char) ? ALL.find(c => !used.includes(c)) : char;
  await db.set(R(code, `members/${db.uid}`), { name: cleanName(name), char: myChar, joinedAt: mine?.joinedAt || db.now(), online: true });
  presence(db, code);
  return { ok: true };
}

export async function leaveRoom(code, { inGame = false } = {}) {
  const db = await getDb();
  stopPresence(db);
  const room = await db.get(R(code));
  if (!room) return;
  const rest = roster(room).filter(m => m.uid && m.uid !== db.uid && m.online !== false);
  if (room.meta?.host === db.uid && rest.length) await db.update(R(code, 'meta'), { host: rest[0].uid });
  if (inGame) await db.update(R(code, `members/${db.uid}`), { left: true, online: false });
  else await db.remove(R(code, `members/${db.uid}`));
  // だれも いなくなったら 部屋を 消す
  const left = await db.get(R(code, 'members'));
  if (!left || Object.values(left).every(m => m.left || m.online === false)) await db.remove(R(code)).catch(() => {});
}

export async function watchRoom(code, cb) {
  const db = await getDb();
  return db.listen(R(code), cb);
}
export async function setMine(code, patch) { const db = await getDb(); return db.update(R(code, `members/${db.uid}`), patch); }
export async function setSettings(code, patch) { const db = await getDb(); return db.update(R(code, 'settings'), patch); }
export async function setMeta(code, patch) { const db = await getDb(); return db.update(R(code, 'meta'), patch); }
export async function addCpu(code, char) { const db = await getDb(); return db.push(R(code, 'cpus'), { char, cpu: 2, at: db.now() }); }
export async function setCpu(code, id, patch) { const db = await getDb(); return db.update(R(code, `cpus/${id}`), patch); }
export async function removeCpu(code, id) { const db = await getDb(); return db.remove(R(code, `cpus/${id}`)); }
export const myUid = async () => (await getDb()).uid;

/** ホストが ゲームを はじめる（いま 部屋にいる人＋CPU で） */
export async function startRound(code, room, map) {
  const db = await getDb();
  const players = roster(room)
    .filter(m => !m.uid || m.online !== false)
    .map(m => (m.uid ? { uid: m.uid, name: m.name, char: m.char, cpu: 0 } : { name: 'CPU', char: m.char, cpu: m.cpu || 2 }));
  const round = (room.game?.round || 0) + 1;
  await db.set(R(code, 'game'), {
    round, seed: (Math.random() * 0xffffffff) >>> 0, players,
    grade: room.settings?.grade || 4, time: room.settings?.time ?? 20,
    map: map || room.settings?.map || 'normal',
  });
  await db.update(R(code, 'meta'), { status: 'playing' });
}

/* ---------- ゲーム中の やりとり ---------- */
// game.js に わたす。commit＝自分が えらんだことを 書く／next＝ほかの人が えらぶのを 待つ
export async function makeNet(code, round) {
  const db = await getDb();
  const base = R(code, `log/${round}`);
  let cursor = 0;
  let members = {};
  const checks = new Set();
  const offs = new Set();
  const offM = db.listen(R(code, 'members'), m => { members = m || {}; checks.forEach(f => f()); });

  function entryAt(n, p) {
    return new Promise(resolve => {
      let timer = 0, done = false, off = null;
      const end = v => {
        if (done) return;
        done = true;
        if (off) off();
        clearTimeout(timer); checks.delete(check); offs.delete(stop);
        resolve(v);
      };
      const stop = () => end(null);
      // 待っている人が ぬけた・切れたままなら、その人を CPU に かえる（だれが 書いても 同じ 中身）
      const check = () => {
        if (!p || done) return;
        const m = members[p.uid];
        const gone = !m || m.left, off2 = m && m.online === false;
        if ((gone || off2) && !timer) timer = setTimeout(() => db.claim(`${base}/${n}`, { k: 'leave', v: p.i }), gone ? ONLINE.goneMs : ONLINE.offlineMs);
        else if (!gone && !off2 && timer) { clearTimeout(timer); timer = 0; }
      };
      // もう 書かれていると Firebase は すぐ（listen の 中で）知らせてくるので、off は あとから 止める
      off = db.listen(`${base}/${n}`, v => { if (v) end(v); });
      if (done) { off(); return; }
      checks.add(check);
      offs.add(stop);
      check();
    });
  }

  return {
    uid: db.uid,
    code,
    isMe: p => !!p && !p.cpu && p.uid === db.uid,
    /** 自分が えらんだことを 書く。先に「ぬけた」が 書かれていたら そちらを 返す */
    async commit(k, v) {
      const n = cursor++;
      const e = { k, v };
      if (await db.claim(`${base}/${n}`, e)) return e;
      return (await db.get(`${base}/${n}`)) || entryAt(n, null);
    },
    /** p さんが えらぶのを 待つ（{ k, v } が 返る） */
    next(p) { return entryAt(cursor++, p); },
    /** 早い者勝ち（読み早押し）：mine が { k, v } に なったら 書いてみる。だれかが 先に 書いたら そちらが 返る */
    race(mine) {
      const n = cursor++;
      mine.then(e => { if (e) db.claim(`${base}/${n}`, e); }).catch(() => {});
      return entryAt(n, null);
    },
    stop() { offM(); [...offs].forEach(f => f()); },
  };
}
