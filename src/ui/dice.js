// 日本のサイコロ（点の目・1だけ大きな赤い点）。本物の 立方体（3D）で 転がって、真上から見た形で止まる。
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { part } from '../three/toon.js';
import { sfx } from '../sfx.js';

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const sleep = ms => new Promise(r => setTimeout(r, ms));
// 点のならび（3×3 の 1〜9 番）。向かいあう目の合計が7（1と6・2と5・3と4）
const PIPS = { 1: [5], 2: [3, 7], 3: [3, 5, 7], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
// それぞれの目が どの向きの面か（n＝面の向き、u・v＝面の上での 右・上）
const FACES = {
  1: { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
  6: { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  2: { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  5: { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
  3: { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
  4: { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
};
const V = a => new THREE.Vector3(...a);
const UP = new THREE.Vector3(0, 1, 0);
const GAP = 1.35;          // サイコロどうしの 間

let R = null;              // { renderer, scene, camera, canvas, dice: [] }

function makeDie() {
  const g = new THREE.Group();
  g.add(part(new RoundedBoxGeometry(1, 1, 1, 5, 0.16), 0xFFFBF2, { outline: 0.05, cast: false }));
  const pip = new THREE.CircleGeometry(0.085, 24);
  const one = new THREE.CircleGeometry(0.19, 40);
  const ink = new THREE.MeshBasicMaterial({ color: 0x2B2233 });
  const red = new THREE.MeshBasicMaterial({ color: 0xE0242B });
  for (const [val, f] of Object.entries(FACES)) {
    const n = V(f.n), u = V(f.u), v = V(f.v);
    for (const p of PIPS[val]) {
      const col = (p - 1) % 3 - 1, row = 1 - Math.floor((p - 1) / 3);
      const m = new THREE.Mesh(val === '1' ? one : pip, val === '1' ? red : ink);
      m.position.copy(n.clone().multiplyScalar(0.503)).addScaledVector(u, col * 0.27).addScaledVector(v, row * 0.27);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
      g.add(m);
    }
  }
  return g;
}

// その目が 真上（カメラのほう）を向く 向き。点が 画面に まっすぐ ならぶように する
function restQuat(val) {
  const q = new THREE.Quaternion().setFromUnitVectors(V(FACES[val].n), UP);
  // 面の「上」が 画面の上（−Z）を 向くように、Y のまわりで そろえる
  const vUp = V(FACES[val].v).applyQuaternion(q);
  const yaw = Math.atan2(vUp.x, vUp.z);   // いまの「上」の 向き（Y のまわり）
  return new THREE.Quaternion().setFromAxisAngle(UP, Math.PI - yaw).multiply(q);
}

function setup() {
  if (R) return R;
  const canvas = document.createElement('canvas');
  canvas.className = 'dice-canvas';
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd9e6ff, 1.9));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(-2, 6, 3);
  scene.add(sun);
  // 真上から 見る（画面の上＝−Z）
  const camera = new THREE.PerspectiveCamera(12, 1, 0.1, 80);   // せまい角度で 遠くから＝ほぼ 真上の 見え方
  camera.position.set(0, 7, 0.001);
  camera.up.set(0, 0, -1);
  camera.lookAt(0, 0, 0);
  // かげ
  const sc = document.createElement('canvas');
  sc.width = sc.height = 64;
  const g = sc.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 4, 32, 32, 32);
  grd.addColorStop(0, 'rgba(43,34,51,.45)');
  grd.addColorStop(1, 'rgba(43,34,51,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const shadowTex = new THREE.CanvasTexture(sc);
  R = { renderer, scene, camera, canvas, dice: [], shadowTex, raf: 0 };
  return R;
}

function layout(count) {
  const r = setup();
  const PX = innerWidth < 700 ? 96 : 128;   // サイコロ1こ分の 画面の 大きさ（CSS の px）
  const w = PX * ((count - 1) * GAP + 1.6), h = PX * 1.6;
  r.renderer.setSize(w, h, false);
  r.canvas.style.width = `${w}px`;
  r.canvas.style.height = `${h}px`;
  r.camera.aspect = w / h;
  // サイコロ1こ（1.0）が だいたい PX の大きさに 見える きょり
  const fovH = THREE.MathUtils.degToRad(r.camera.fov);
  r.camera.position.y = (h / PX) / 2 / Math.tan(fovH / 2) + 1;
  r.camera.updateProjectionMatrix();
  while (r.dice.length < count) {
    const d = makeDie();
    const s = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), new THREE.MeshBasicMaterial({ map: r.shadowTex, transparent: true, depthWrite: false }));
    s.rotation.x = -Math.PI / 2;
    r.scene.add(d, s);
    r.dice.push({ d, s });
  }
  r.dice.forEach((o, i) => { o.d.visible = o.s.visible = i < count; });
}

const easeOut = k => 1 - Math.pow(1 - k, 3);
// はねる高さ（だんだん 小さく）
const hop = k => {
  const b = [[0, 0.3, 1.1], [0.3, 0.6, 0.45], [0.6, 0.82, 0.16]];
  for (const [a, e, hgt] of b) if (k < e) { const t = (k - a) / (e - a); return Math.sin(Math.PI * t) * hgt; }
  return 0;
};

// count こ ふって、出た目の配列を返す。values をわたすとその目にする（オンラインで同じ目を見せる用）
export async function rollDice(count = 1, { forceSix = false, values } = {}) {
  const pop = document.querySelector('#dice-pop');
  const vals = values || Array.from({ length: count }, () => forceSix ? 6 : 1 + Math.floor(Math.random() * 6));
  layout(vals.length);
  const r = R;
  pop.innerHTML = '';
  pop.append(r.canvas);
  const sum = document.createElement('div');
  sum.className = 'die-sum';
  pop.append(sum);

  const n = vals.length, dur = REDUCED ? 0.15 : 1.15;
  const rolls = vals.map((v, i) => ({
    end: restQuat(v),
    axis: new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.3, Math.random() - 0.5).normalize(),
    turn: Math.PI * (4 + Math.random() * 2),
    x: (i - (n - 1) / 2) * GAP,
    from: (Math.random() - 0.5) * 0.4,
  }));
  const t0 = performance.now();
  const draw = () => {
    const k = Math.min(1, (performance.now() - t0) / 1000 / dur);
    rolls.forEach((o, i) => {
      const { d, s } = r.dice[i];
      // 回りながら だんだん 止まって、さいごは ぴったり 出た目が 上
      const q = new THREE.Quaternion().setFromAxisAngle(o.axis, (1 - easeOut(k)) * o.turn);
      d.quaternion.copy(q).multiply(o.end);
      const y = hop(k);
      d.position.set(o.x + o.from * (1 - easeOut(k)), 0.5 + y, (1 - easeOut(k)) * -0.3);
      s.position.set(d.position.x, 0.01, d.position.z);
      s.scale.setScalar(1 - y * 0.35);
      s.material.opacity = 1 - y * 0.5;
    });
    r.renderer.render(r.scene, r.camera);
    return k;
  };
  draw();
  pop.classList.add('show');
  sfx('roll');
  const loop = () => { if (draw() < 1) r.raf = requestAnimationFrame(loop); };
  cancelAnimationFrame(r.raf);
  r.raf = requestAnimationFrame(loop);
  await sleep(dur * 1000 + 60);
  cancelAnimationFrame(r.raf);
  draw();
  sfx('rolled');
  sum.textContent = n > 1 ? `${vals.join(' ＋ ')} ＝ ${vals.reduce((a, b) => a + b, 0)}` : `${vals[0]}`;
  sum.classList.add('show');
  await sleep(850);
  pop.classList.remove('show');
  await sleep(200);
  return vals;
}
