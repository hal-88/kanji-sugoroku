// 島・うずまきの道・マス・お城・木や雲
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { part, toon, flat } from './toon.js';

export const TILE_H = 0.22;

// マップ（長さ）。島の大きさ・うずまきの まき数・季節が かわる
export const MAPS = {
  short:  { id: 'short',  name: 'みじかい', stage: 'はるの こじま',   tiles: 28, scale: 0.8,  turns: 2.3,  theme: 'spring' },
  normal: { id: 'normal', name: 'ふつう',   stage: 'なつの しま',     tiles: 40, scale: 1,    turns: 2.75, theme: 'summer' },
  long:   { id: 'long',   name: 'ながい',   stage: 'あきの おおしま', tiles: 56, scale: 1.25, turns: 3.2,  theme: 'autumn' },
};
export const THEMES = {
  spring: { sky: 0xBFE8FF, sea: 0x7FD6F2, grass: 0xA6E07C, beach: 0xF8E7B5,
    round: [0xFFB7D0, 0xFF9EC2, 0xFFC8DA, 0x6BD07A], pine: [0x3FAF6A, 0x4CC07A], flowers: [0xFF8FA8, 0xFFFFFF, 0xFFD45C, 0xFFB7D0], flowerRate: 0.35 },
  summer: { sky: 0x9FDCFF, sea: 0x6FCBEF, grass: 0x8EDB6A, beach: 0xF6E2A4,
    round: [0x5CC46A, 0x6BD07A, 0x4DB860], pine: [0x3FAF6A, 0x4CC07A], flowers: [0xFF8FA8, 0xFFFFFF, 0xFFD45C, 0xB57BFF], flowerRate: 0.18 },
  autumn: { sky: 0xAED8F2, sea: 0x5FBCE4, grass: 0xBBD56C, beach: 0xF3DDA0,
    round: [0xF29B3D, 0xE8623D, 0xF2C94C, 0xD9822B], pine: [0x3F9F5E, 0x4CAF6A], flowers: [0xFFD45C, 0xFF8A5B, 0xFFFFFF], flowerRate: 0.15 },
};

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
let SC = 1;   // いまの 島の 大きさ（ふつう＝1）
export const groundY = r => 0.35 + 2.4 * (1 - smooth(1.4, 9.6 * SC, r));

// マスの種類（ふつうの マスは なし。ぜんぶ なにかが おきる）
export const TILE_TYPES = {
  normal: { color: 0xFFF8EA, label: '' },
  start:  { color: 0x7BD88F, label: 'スタート' },
  goal:   { color: 0xFFD45C, label: 'ゴール' },
  point:  { color: 0x6EC1FF, label: '＋10' },
  minus:  { color: 0xFF7A7A, label: '−10' },
  card:   { color: 0xFFD45C, label: 'カード' },
  shop:   { color: 0xC39BFF, label: 'お店' },
  fwd:    { color: 0x7BD88F, label: '＋2' },
  back:   { color: 0xFFA45C, label: '−2' },
  chance: { color: 0xFF9AD5, label: 'チャンス' },
  again:  { color: 0x5FD3C8, label: 'もう1回' },
};

// マスの ならびを 作る。お店は 7マスごと、ほかは わりあいで まぜる（いつも 同じ ならびに なる）
export function makeLayout(n) {
  const out = Array(n).fill(null);
  out[0] = 'start';
  out[n - 1] = 'goal';
  const free = [];
  for (let i = 1; i < n - 1; i++) {
    if (i % 7 === 6 && i < n - 2) out[i] = 'shop';
    else free.push(i);
  }
  const RATE = [['card', 0.27], ['point', 0.19], ['chance', 0.14], ['minus', 0.09], ['fwd', 0.08], ['back', 0.08], ['again', 0.06]];
  const bag = [];
  for (const [t, r] of RATE) for (let k = 0; k < Math.round(free.length * r); k++) bag.push(t);
  while (bag.length < free.length) bag.push(bag.length % 2 ? 'point' : 'card');
  bag.length = free.length;
  const rand = mulberry(n * 97 + 13);
  const bad = new Set(['minus', 'back']);
  for (let tries = 0; tries < 400; tries++) {
    for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
    free.forEach((i, k) => { out[i] = bag[k]; });
    // おなじ マスが となりあわない・はじめの 2マスと ゴールの 前は わるい マスに しない・すすむ／もどる が となりあわない
    let ok = !bad.has(out[1]) && !bad.has(out[2]) && !bad.has(out[n - 2]);
    for (let i = 1; ok && i < n - 2; i++) {
      if (out[i] === out[i + 1]) ok = false;
      if (bad.has(out[i]) && bad.has(out[i + 1])) ok = false;
      if ((out[i] === 'fwd' || out[i] === 'back') && (out[i + 1] === 'fwd' || out[i + 1] === 'back')) ok = false;
    }
    if (ok) break;
  }
  return out;
}

// うずまきの道を、同じ間かくで n こに分ける
function spiralPoints(map) {
  const dense = [];
  const TILE_COUNT = map.tiles;
  const turns = Math.PI * map.turns, r0 = 9.4 * map.scale, r1 = 1.75;
  for (let i = 0; i <= 2000; i++) {
    const u = i / 2000, th = -Math.PI * 0.35 + u * turns, r = r0 - (r0 - r1) * u;
    dense.push(new THREE.Vector3(Math.cos(th) * r, 0, Math.sin(th) * r));
  }
  const lens = [0];
  for (let i = 1; i < dense.length; i++) lens.push(lens[i - 1] + dense[i].distanceTo(dense[i - 1]));
  const total = lens[lens.length - 1], pts = [];
  let j = 0;
  for (let k = 0; k < TILE_COUNT; k++) {
    const target = total * k / (TILE_COUNT - 1);
    while (j < lens.length - 2 && lens[j + 1] < target) j++;
    const f = (target - lens[j]) / (lens[j + 1] - lens[j] || 1);
    const p = dense[j].clone().lerp(dense[j + 1], f);
    p.y = groundY(Math.hypot(p.x, p.z));
    pts.push(p);
  }
  return pts;
}

function labelTexture(text, color) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const g = cv.getContext('2d');
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const big = text.length <= 3;
  g.font = `900 ${big ? 92 : 64}px "Zen Maru Gothic", "Hiragino Maru Gothic ProN", sans-serif`;
  g.lineWidth = 16;
  g.strokeStyle = '#ffffff';
  g.lineJoin = 'round';
  g.strokeText(text, 128, 136);
  g.fillStyle = color;
  g.fillText(text, 128, 136);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function buildWorld(scene, mapId = 'normal') {
  const map = MAPS[mapId] || MAPS.normal;
  const th = THEMES[map.theme];
  SC = map.scale;
  const LAYOUT = makeLayout(map.tiles);
  const world = new THREE.Group();
  scene.add(world);

  // 海
  const sea = new THREE.Mesh(new THREE.CircleGeometry(90 * SC, 64), toon(th.sea));
  sea.rotation.x = -Math.PI / 2;
  sea.receiveShadow = true;
  world.add(sea);
  const foam = flat(new THREE.RingGeometry(11.5 * SC, 12.6 * SC, 80), 0xffffff, { opacity: 0.75 });
  foam.rotation.x = -Math.PI / 2;
  foam.position.y = 0.03;
  world.add(foam);

  // 島（草の丘＋すなはま）
  const prof = [];
  for (let r = 0; r <= 10.8 * SC; r += 0.2) prof.push(new THREE.Vector2(r, groundY(r)));
  prof.push(new THREE.Vector2(11.0 * SC, 0.3));
  const grass = new THREE.Mesh(new THREE.LatheGeometry(prof.reverse(), 72), toon(th.grass));
  grass.receiveShadow = true;
  world.add(grass);
  const beach = new THREE.Mesh(new THREE.LatheGeometry([
    new THREE.Vector2(12.0 * SC, -0.6), new THREE.Vector2(11.9 * SC, 0.08), new THREE.Vector2(11.0 * SC, 0.3),
  ], 72), toon(th.beach));
  beach.receiveShadow = true;
  world.add(beach);

  // 道とマス
  const pts = spiralPoints(map);
  const tileGeo = new RoundedBoxGeometry(0.98, TILE_H, 0.98, 3, 0.1);
  const tiles = [];
  pts.forEach((p, i) => {
    const type = LAYOUT[i] || 'normal';  // （ふつうの マスは もう ない）
    const def = TILE_TYPES[type];
    const g = new THREE.Group();
    g.position.copy(p);
    const next = pts[Math.min(i + 1, pts.length - 1)], prev = pts[Math.max(i - 1, 0)];
    g.rotation.y = Math.atan2(next.x - prev.x, next.z - prev.z);
    const tile = part(tileGeo, def.color, { outline: 0.05, cast: true, receive: true, at: [0, TILE_H / 2, 0] });
    g.add(tile);
    const text = type === 'normal' ? String(i) : def.label;
    if (text) {
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.86), new THREE.MeshBasicMaterial({
        map: labelTexture(text, type === 'normal' ? '#C9B79A' : '#2B2233'), transparent: true, depthWrite: false,
      }));
      // 字の上が島の中心を向く＝外側（カメラ側）から読める
      plane.rotation.order = 'YXZ';
      plane.rotation.y = Math.atan2(p.x, p.z);
      plane.rotation.x = -Math.PI / 2;
      plane.position.set(p.x, p.y + TILE_H + 0.005, p.z);
      world.add(plane);
    }
    world.add(g);
    tiles.push({ index: i, type, pos: p.clone().setY(p.y + TILE_H), group: g });
  });

  // マスのあいだの小石
  const stone = new THREE.CylinderGeometry(0.11, 0.13, 0.06, 12);
  for (let i = 0; i < pts.length - 1; i++) {
    const m = pts[i].clone().lerp(pts[i + 1], 0.5);
    m.y = groundY(Math.hypot(m.x, m.z)) + 0.03;
    world.add(part(stone, 0xE9D7B5, { outline: 0, at: [m.x, m.y, m.z], receive: true }));
  }

  // お店の小屋
  tiles.filter(t => t.type === 'shop').forEach(t => {
    const out = new THREE.Vector3(t.pos.x, 0, t.pos.z).normalize();
    const at = t.pos.clone().add(out.multiplyScalar(1.15));
    at.y = groundY(Math.hypot(at.x, at.z));
    world.add(house(at, 0xFFF1D6, 0xB57BFF, 0.9));
  });

  // お城（ゴール）
  world.add(castle(new THREE.Vector3(0, groundY(0), 0)));

  // 木・花・家
  const rand = mulberry(7);
  const clear = (x, z, d) => pts.every(p => Math.hypot(p.x - x, p.z - z) > d) && Math.hypot(x, z) > 2.6;
  let placed = 0;
  const want = Math.round(70 * SC * SC);
  for (let n = 0; n < 1400 && placed < want; n++) {
    const r = 1.5 + rand() * 9.2 * SC, a = rand() * Math.PI * 2;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!clear(x, z, 1.3)) continue;
    const y = groundY(r);
    const k = rand();
    const fl = th.flowerRate;
    if (k < 0.82 - fl - 0.3) world.add(roundTree(x, y, z, 0.7 + rand() * 0.5, rand, th.round));
    else if (k < 0.82 - fl) world.add(pineTree(x, y, z, 0.7 + rand() * 0.5, th.pine));
    else if (k < 0.82 && clear(x, z, 1.6)) world.add(house(new THREE.Vector3(x, y, z), 0xFFF8EA, [0xFF7A7A, 0x6EC1FF, 0xFFB347][Math.floor(rand() * 3)], 0.75, rand() * 6));
    else world.add(flower(x, y, z, th.flowers[Math.floor(rand() * th.flowers.length)]));
    placed++;
  }

  // 雲
  const clouds = [];
  for (let i = 0; i < 9; i++) {
    const c = cloud(rand);
    // カメラが回る道（半径26・高さ17）にかからないように、遠くの空へ
    const a = rand() * Math.PI * 2, r = (34 + rand() * 12) * SC;
    c.position.set(Math.cos(a) * r, (5 + rand() * 6) * SC, Math.sin(a) * r);
    c.scale.setScalar(2.2);
    c.userData.speed = 0.04 + rand() * 0.05;
    world.add(c);
    clouds.push(c);
  }

  return {
    group: world,
    map,
    theme: th,
    tiles,
    update(t, dt) {
      foam.scale.setScalar(1 + Math.sin(t * 1.3) * 0.012);
      for (const c of clouds) {
        const th = Math.atan2(c.position.z, c.position.x) + c.userData.speed * dt * 0.1;
        const r = Math.hypot(c.position.x, c.position.z);
        c.position.x = Math.cos(th) * r;
        c.position.z = Math.sin(th) * r;
      }
    },
  };
}

function mulberry(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const SPH = new THREE.SphereGeometry(1, 18, 14);
function roundTree(x, y, z, s, rand, colors) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.scale.setScalar(s);
  g.add(part(new THREE.CylinderGeometry(0.08, 0.11, 0.5, 8), 0xA0703F, { at: [0, 0.25, 0] }));
  const green = colors[Math.floor(rand() * colors.length)];
  g.add(part(SPH, green, { at: [0, 0.78, 0], scale: 0.42, outline: 0.07 }));
  g.add(part(SPH, green, { at: [0.22, 0.62, 0.1], scale: 0.26, outline: 0.08 }));
  return g;
}
function pineTree(x, y, z, s, colors) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.scale.setScalar(s);
  g.add(part(new THREE.CylinderGeometry(0.07, 0.09, 0.3, 8), 0xA0703F, { at: [0, 0.15, 0] }));
  g.add(part(new THREE.ConeGeometry(0.42, 0.6, 12), colors[0], { at: [0, 0.5, 0] }));
  g.add(part(new THREE.ConeGeometry(0.32, 0.5, 12), colors[1], { at: [0, 0.85, 0] }));
  return g;
}
function flower(x, y, z, color) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.add(part(new THREE.CylinderGeometry(0.015, 0.015, 0.18, 4), 0x3FAF6A, { outline: 0, at: [0, 0.09, 0] }));
  g.add(part(SPH, color, { at: [0, 0.2, 0], scale: 0.07, outline: 0.15 }));
  return g;
}
function house(at, wall, roof, s = 1, rotY) {
  const g = new THREE.Group();
  g.position.copy(at);
  g.scale.setScalar(s);
  g.rotation.y = rotY ?? Math.atan2(-at.x, -at.z);
  g.add(part(new THREE.BoxGeometry(0.8, 0.6, 0.7), wall, { at: [0, 0.3, 0], outline: 0.04 }));
  g.add(part(new THREE.ConeGeometry(0.66, 0.5, 4), roof, { at: [0, 0.85, 0], rot: [0, Math.PI / 4, 0], outline: 0.04 }));
  g.add(part(new THREE.BoxGeometry(0.2, 0.32, 0.04), 0x8A5A3A, { outline: 0, at: [0, 0.16, 0.36] }));
  return g;
}
function castle(at) {
  const g = new THREE.Group();
  g.position.copy(at);
  const wall = 0xFFF8EA, roof = 0xFF6B8B;
  g.add(part(new THREE.CylinderGeometry(1.15, 1.25, 0.9, 24), wall, { at: [0, 0.45, 0], outline: 0.03, receive: true }));
  g.add(part(new THREE.CylinderGeometry(0.62, 0.68, 1.5, 20), wall, { at: [0, 1.6, 0], outline: 0.04 }));
  g.add(part(new THREE.ConeGeometry(0.85, 1.0, 20), roof, { at: [0, 2.85, 0], outline: 0.04 }));
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * Math.PI * 2 + Math.PI / 4;
    const x = Math.cos(a) * 1.05, z = Math.sin(a) * 1.05;
    g.add(part(new THREE.CylinderGeometry(0.24, 0.26, 1.2, 14), wall, { at: [x, 0.6, z], outline: 0.06 }));
    g.add(part(new THREE.ConeGeometry(0.34, 0.55, 14), 0x6EC1FF, { at: [x, 1.48, z], outline: 0.06 }));
  }
  g.add(part(new THREE.CylinderGeometry(0.02, 0.02, 0.7, 6), 0x8A5A3A, { outline: 0, at: [0, 3.6, 0] }));
  const flag = part(new THREE.BoxGeometry(0.42, 0.26, 0.02), 0xFFD45C, { at: [0.22, 3.82, 0], outline: 0.08 });
  g.add(flag);
  g.add(part(new THREE.BoxGeometry(0.34, 0.5, 0.06), 0xB57BFF, { outline: 0, at: [0, 0.32, 1.22] }));
  return g;
}
function cloud(rand) {
  const g = new THREE.Group();
  const n = 3 + Math.floor(rand() * 3);
  for (let i = 0; i < n; i++) {
    const s = 0.6 + rand() * 0.6;
    g.add(part(SPH, 0xffffff, { at: [i * 0.75 - n * 0.35, rand() * 0.3, rand() * 0.4], scale: [s, s * 0.8, s], outline: 0.04, cast: false }));
  }
  return g;
}
