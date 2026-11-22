// 3Dの舞台：島・キャラ・ぴょん移動・カメラ。ゲームの進行（game.js）からはここの関数だけを呼ぶ。
import * as THREE from 'three';
import { buildWorld, TILE_COUNT } from './board.js';
import { CHARACTERS, makeCharacter } from './characters.js';
import { sfx } from '../sfx.js';

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const GOAL = TILE_COUNT - 1;
export const charDef = id => CHARACTERS.find(c => c.id === id);

let renderer, scene, camera, world, tiles;
let actors = [];          // { def, ch, pos }
let current = -1;
let view = 'orbit';       // 'orbit'（タイトル）／'follow'／'overview'
const camPos = new THREE.Vector3(0, 24, 22), camLook = new THREE.Vector3(0, 1, 0);
const anims = new Set();
const puffs = [];
const clock = new THREE.Clock();

export async function initStage(canvas) {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9FDCFF);
  scene.fog = new THREE.Fog(0x9FDCFF, 40, 85);
  camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9ccfff, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(9, 16, 7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -15, right: 15, top: 15, bottom: -15, near: 1, far: 50 });
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);

  await document.fonts.load('900 64px "Zen Maru Gothic"').catch(() => {});
  world = buildWorld(scene);
  tiles = world.tiles;

  addEventListener('resize', resize);
  resize();
  const g = cameraGoal(0);
  camPos.copy(g.pos);
  camLook.copy(g.look);
  renderer.setAnimationLoop(frame);
}

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

/* ---------- キャラの用意 ---------- */
export function setPlayers(charIds) {
  for (const a of actors) scene.remove(a.ch);
  actors = charIds.map(id => {
    const def = charDef(id);
    const ch = makeCharacter(def);
    scene.add(ch);
    return { def, ch, pos: 0 };
  });
  current = -1;
  actors.forEach(a => { a.ch.position.copy(spotOf(a)); });
}
export function setCurrent(i) { current = i; focus = null; }
// カメラだけ別の人に向ける（こうげきされた人を見せる）。null でもとにもどる
let focus = null;
export function setFocus(i) { focus = i; }
export function setView(v) { view = v; }
export function getView() { return view; }
export function tileType(i) { return tiles[i].type; }
export function posOf(i) { return actors[i].pos; }

// 3Dの位置を画面の位置にする（ポイントの数字をうかべる用）
export function screenPosOf(i) {
  const v = actors[i].ch.position.clone().add(new THREE.Vector3(0, 1.3, 0)).project(camera);
  return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight };
}

function spotOf(a, pos = a.pos) {
  const same = actors.filter(q => (q === a ? pos : q.pos) === pos);
  const base = tiles[pos].pos.clone();
  if (same.length > 1) {
    const k = same.indexOf(a);
    const offs = [[-0.24, -0.24], [0.24, 0.24], [-0.24, 0.24], [0.24, -0.24]];
    base.x += offs[k][0];
    base.z += offs[k][1];
  }
  return base;
}

/* ---------- アニメのしくみ ---------- */
function tween(duration, fn) {
  return new Promise(res => anims.add({ t: 0, d: REDUCED ? Math.min(duration, 0.05) : duration, fn, res }));
}
const lerpAngle = (a, b, t) => { const d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * t; };

function dust(at) {
  const geo = new THREE.SphereGeometry(1, 10, 8);
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false }));
    const a = i / 6 * Math.PI * 2 + Math.random() * 0.4;
    m.position.copy(at).add(new THREE.Vector3(Math.cos(a) * 0.15, 0.06, Math.sin(a) * 0.15));
    m.scale.setScalar(0.06);
    m.userData = { v: new THREE.Vector3(Math.cos(a) * 0.9, 0.5 + Math.random() * 0.3, Math.sin(a) * 0.9), life: 0 };
    scene.add(m);
    puffs.push(m);
  }
}

// 1マスぴょん（前にも後ろにも）
async function hop(a, to, step) {
  const ch = a.ch, body = ch.userData.body;
  ch.userData.busy = true;
  const from = ch.position.clone();
  const target = spotOf(a, to);
  const ang = Math.atan2(target.x - from.x, target.z - from.z);
  const r0 = ch.rotation.y;
  await tween(0.07, k => {
    body.scale.set(1 + 0.16 * k, 1 - 0.22 * k, 1 + 0.16 * k);
    ch.rotation.y = lerpAngle(r0, ang, k);
  });
  sfx('hop', step);
  const lift = 0.75 + Math.abs(target.y - from.y) * 0.5;
  await tween(0.3, k => {
    const s = Math.sin(Math.PI * k);
    ch.position.lerpVectors(from, target, k);
    ch.position.y += s * lift;
    const st = k < 0.2 ? k / 0.2 : 1;
    body.scale.set(1 + 0.16 * (1 - st) - 0.08 * s, 1 - 0.22 * (1 - st) + 0.2 * s, 1 + 0.16 * (1 - st) - 0.08 * s);
    body.rotation.x = Math.sin(Math.PI * 2 * k) * 0.15;
  });
  ch.position.copy(target);
  a.pos = to;
  dust(target);
  sfx('land');
  await tween(0.14, k => {
    const s = Math.sin(Math.PI * k);
    body.scale.set(1 + 0.2 * s, 1 - 0.26 * s, 1 + 0.2 * s);
    body.rotation.x = 0;
  });
  body.scale.set(1, 1, 1);
  ch.userData.busy = false;
}

// delta マス進む（マイナスならもどる）。onStep(いまのマス) が1マスごとに呼ばれる
export async function moveSteps(i, delta, onStep) {
  const a = actors[i];
  const dir = Math.sign(delta);
  for (let n = 0; n < Math.abs(delta); n++) {
    const to = a.pos + dir;
    if (to < 0 || to > GOAL) break;
    await hop(a, to, n);
    if (onStep) onStep(a.pos);
  }
  return a.pos;
}

// すぐにそのマスへ（確認用）
export function warp(i, pos) { actors[i].pos = pos; }

// しゅっと消えて、べつのマスに ぽんっと出る（ワープ・いれかえカード）
export async function teleport(i, pos) {
  const a = actors[i], ch = a.ch;
  ch.userData.busy = true;
  const s0 = ch.scale.x, y0 = ch.position.y, r0 = ch.rotation.y;
  sfx('hop', 3);
  await tween(0.32, k => {
    ch.scale.setScalar(Math.max(0.001, s0 * (1 - k)));
    ch.position.y = y0 + k * 1.2;
    ch.rotation.y = r0 + k * Math.PI * 3;
  });
  a.pos = pos;
  const to = spotOf(a);
  ch.position.copy(to);
  ch.position.y += 1.2;
  await tween(0.36, k => {
    const e = 1 - Math.pow(1 - k, 3);
    ch.scale.setScalar(Math.max(0.001, s0 * e));
    ch.position.y = to.y + (1 - e) * 1.2;
  });
  ch.scale.setScalar(s0);
  ch.position.copy(to);
  dust(to);
  sfx('land');
  ch.userData.busy = false;
}

export async function happy(i, times = 2) {
  const ch = actors[i].ch, body = ch.userData.body;
  ch.userData.busy = true;
  const y0 = ch.position.y, r0 = ch.rotation.y;
  for (let n = 0; n < times; n++) {
    await tween(0.45, k => {
      const s = Math.sin(Math.PI * k);
      ch.position.y = y0 + s * 0.9;
      ch.rotation.y = r0 + (1 - (1 - k) * (1 - k)) * Math.PI * 2;
      body.scale.set(1 - 0.06 * s, 1 + 0.12 * s, 1);
    });
  }
  ch.position.y = y0;
  body.scale.set(1, 1, 1);
  ch.userData.busy = false;
}

// しょんぼり（まちがえたとき）
export async function sad(i) {
  const body = actors[i].ch.userData.body;
  await tween(0.5, k => { const s = Math.sin(Math.PI * k); body.scale.set(1 + 0.1 * s, 1 - 0.15 * s, 1 + 0.1 * s); body.rotation.x = 0.25 * s; });
  body.rotation.x = 0;
}

/* ---------- カメラ ---------- */
function cameraGoal(t) {
  const narrow = innerWidth / innerHeight < 1;
  if (view === 'orbit' || current < 0) {
    const a = t * 0.06;
    return { pos: new THREE.Vector3(Math.sin(a) * 26, narrow ? 30 : 17, Math.cos(a) * 26), look: new THREE.Vector3(0, 1.2, 0) };
  }
  if (view === 'overview') return { pos: new THREE.Vector3(0, narrow ? 34 : 21, narrow ? 26 : 19), look: new THREE.Vector3(0, 0.6, 0.6) };
  const p = actors[focus ?? current].ch.position.clone();
  const out = new THREE.Vector3(p.x, 0, p.z);
  if (out.lengthSq() < 0.01) out.set(0, 0, 1);
  out.normalize();
  const dist = narrow ? 9.5 : 7.2;
  return { pos: p.clone().add(out.multiplyScalar(dist)).add(new THREE.Vector3(0, 5.8, 0)), look: p.clone().add(new THREE.Vector3(0, 0.4, 0)) };
}

/* ---------- まいフレーム ---------- */
function stepAnims(dt) {
  for (const a of [...anims]) {
    a.t += dt;
    const k = Math.min(1, a.t / a.d);
    a.fn(k);
    if (k >= 1) { anims.delete(a); a.res(); }
  }
}
// 画面が かくれて 絵が 止まっても、動きの とちゅうで 止まらないように すすめる
// （オンラインで ゲームが 先へ 進めなくなるのを ふせぐ）
let lastFrame = performance.now();
setInterval(() => { if (anims.size && performance.now() - lastFrame > 300) stepAnims(0.1); }, 100);

function frame() {
  lastFrame = performance.now();
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  stepAnims(dt);
  actors.forEach((a, i) => {
    const u = a.ch.userData;
    if (!u.busy) {
      // おなじマスに何人いても重ならないように、すこしずつ自分の場所へ
      a.ch.position.lerp(spotOf(a), Math.min(1, dt * 8));
      const s = Math.sin(t * 3 + u.phase);
      u.body.scale.set(1 - s * 0.015, 1 + s * 0.03, 1 - s * 0.015);
      u.body.rotation.z = Math.sin(t * 1.7 + u.phase) * 0.05;
      const yaw = Math.atan2(camera.position.x - a.ch.position.x, camera.position.z - a.ch.position.z);
      a.ch.rotation.y = lerpAngle(a.ch.rotation.y, yaw, Math.min(1, dt * 4));
    } else u.body.rotation.z = 0;
    const on = i === current;
    u.ring.material.opacity += ((on ? 0.9 : 0) - u.ring.material.opacity) * 0.15;
    u.ring.scale.setScalar(1 + (on ? Math.sin(t * 4) * 0.08 : 0));
  });
  for (let i = puffs.length - 1; i >= 0; i--) {
    const m = puffs[i], d = m.userData;
    d.life += dt;
    m.position.addScaledVector(d.v, dt);
    d.v.multiplyScalar(0.9);
    m.scale.setScalar(0.06 + d.life * 0.35);
    m.material.opacity = Math.max(0, 0.85 - d.life * 1.9);
    if (d.life > 0.45) { scene.remove(m); m.material.dispose(); puffs.splice(i, 1); }
  }
  world.update(t, dt);
  const g = cameraGoal(t);
  const k = view === 'orbit' ? 1 - Math.pow(0.2, dt) : 1 - Math.pow(0.02, dt);
  camPos.lerp(g.pos, k);
  camLook.lerp(g.look, 1 - Math.pow(0.01, dt));
  camera.position.copy(camPos);
  camera.lookAt(camLook);
  renderer.render(scene, camera);
}

/* ---------- キャラの顔アイコン（画像）を作る ---------- */
export function makePortraits(size = 256) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.setPixelRatio(1);
  r.setSize(size, size, false);
  const sc = new THREE.Scene();
  sc.add(new THREE.HemisphereLight(0xffffff, 0xbfd8ff, 1.7));
  const l = new THREE.DirectionalLight(0xffffff, 2.0);
  l.position.set(2, 3, 4);
  sc.add(l);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
  cam.position.set(0, 0.78, 2.35);
  cam.lookAt(0, 0.62, 0);
  const out = {};
  for (const def of CHARACTERS) {
    const ch = makeCharacter(def);
    ch.userData.ring.visible = false;
    ch.rotation.y = -0.25;
    sc.add(ch);
    r.render(sc, cam);
    out[def.id] = cv.toDataURL('image/png');
    sc.remove(ch);
  }
  r.dispose();
  r.forceContextLoss();
  return out;
}
