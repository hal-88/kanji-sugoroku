// オリジナルのちびキャラ4人（図形を組み合わせて作る）
import * as THREE from 'three';
import { part } from './toon.js';

export const CHARACTERS = [
  { id: 'tanuki', name: 'たぬき', color: 0xB98457, ui: '#B98457', ring: 0xFF8A3D },
  { id: 'neko', name: 'ねこ', color: 0xF6A04D, ui: '#F6A04D', ring: 0xFF5C7A },
  { id: 'usagi', name: 'うさぎ', color: 0xFFF1F4, ui: '#F7B6C6', ring: 0xB57BFF },
  { id: 'pengin', name: 'ペンギン', color: 0x3C4F86, ui: '#3C4F86', ring: 0x3FA9FF },
];

const SPH = new THREE.SphereGeometry(1, 28, 20);
const SPH_LO = new THREE.SphereGeometry(1, 16, 12);
const INK = 0x2b2233;
const CHEEK = 0xFF9AAE;

function eyes(g, { y = 1.25, x = 0.2, z = 0.5 } = {}) {
  for (const s of [-1, 1]) {
    g.add(part(SPH_LO, INK, { outline: 0, at: [s * x, y, z], scale: [0.085, 0.11, 0.06], cast: false }));
    g.add(part(SPH_LO, 0xffffff, { outline: 0, at: [s * x + 0.03, y + 0.045, z + 0.05], scale: 0.03, cast: false }));
  }
}
function cheeks(g, { y = 1.08, x = 0.36, z = 0.44 } = {}) {
  for (const s of [-1, 1]) g.add(part(SPH_LO, CHEEK, { outline: 0, at: [s * x, y, z], scale: [0.1, 0.065, 0.04], cast: false }));
}

export function makeCharacter(def) {
  const root = new THREE.Group();          // ばんの上の位置と向き
  const body = new THREE.Group();          // のび・ちぢみ（足もとが中心）
  const look = new THREE.Group();          // からだ全体（大きさ調整）
  root.add(body);
  body.add(look);
  look.scale.setScalar(0.5);

  const c = def.color;
  const dark = new THREE.Color(c).multiplyScalar(0.62).getHex();
  const belly = def.id === 'pengin' ? 0xffffff : def.id === 'usagi' ? 0xFFDCE6 : 0xFFE9C9;

  // からだ・頭・手足（共通）
  look.add(part(SPH, c, { at: [0, 0.5, 0], scale: [0.48, 0.45, 0.45] }));
  look.add(part(SPH, belly, { outline: 0, at: [0, 0.46, 0.2], scale: [0.33, 0.32, 0.28] }));
  look.add(part(SPH, c, { at: [0, 1.2, 0], scale: [0.62, 0.56, 0.56] }));
  for (const s of [-1, 1]) {
    look.add(part(SPH_LO, def.id === 'pengin' ? 0xFFA23D : dark, { at: [s * 0.2, 0.07, 0.08], scale: [0.17, 0.1, 0.22] }));
    if (def.id !== 'pengin') look.add(part(SPH_LO, c, { at: [s * 0.46, 0.55, 0.08], scale: 0.13 }));
  }

  switch (def.id) {
    case 'tanuki': {
      for (const s of [-1, 1]) {
        look.add(part(SPH_LO, dark, { at: [s * 0.38, 1.66, -0.02], scale: [0.17, 0.15, 0.1] }));
        look.add(part(SPH_LO, 0x5A3E2B, { outline: 0, at: [s * 0.21, 1.22, 0.49], scale: [0.17, 0.13, 0.06], cast: false }));
      }
      look.add(part(SPH_LO, 0xFFE9C9, { outline: 0, at: [0, 1.08, 0.5], scale: [0.2, 0.13, 0.08], cast: false }));
      look.add(part(SPH_LO, INK, { outline: 0, at: [0, 1.13, 0.56], scale: [0.06, 0.045, 0.04], cast: false }));
      const tail = new THREE.Group();
      tail.position.set(0, 0.42, -0.45);
      tail.rotation.x = -0.6;
      tail.add(part(SPH, c, { scale: [0.2, 0.2, 0.32] }));
      tail.add(part(SPH_LO, dark, { outline: 0, at: [0, 0, -0.19], scale: [0.16, 0.16, 0.1] }));
      look.add(tail);
      eyes(look, { z: 0.52 });
      cheeks(look);
      break;
    }
    case 'neko': {
      const cone = new THREE.ConeGeometry(0.2, 0.36, 20);
      const inner = new THREE.ConeGeometry(0.11, 0.22, 16);
      for (const s of [-1, 1]) {
        look.add(part(cone, c, { at: [s * 0.34, 1.7, 0], rot: [0, 0, -s * 0.38] }));
        look.add(part(inner, CHEEK, { outline: 0, at: [s * 0.33, 1.68, 0.09], rot: [0.2, 0, -s * 0.38], cast: false }));
      }
      // ひたいのしま
      for (const dx of [-0.12, 0, 0.12]) look.add(part(SPH_LO, 0xD9772A, { outline: 0, at: [dx, 1.66, 0.25], scale: [0.04, 0.09, 0.05], cast: false }));
      look.add(part(SPH_LO, CHEEK, { outline: 0, at: [0, 1.12, 0.56], scale: [0.05, 0.035, 0.03], cast: false }));
      const tail = part(new THREE.TorusGeometry(0.28, 0.075, 10, 24, Math.PI * 1.3), c, { at: [0, 0.62, -0.45], rot: [0, Math.PI / 2, 0.3] });
      look.add(tail);
      eyes(look);
      cheeks(look);
      break;
    }
    case 'usagi': {
      const ear = new THREE.CapsuleGeometry(0.12, 0.55, 6, 16);
      const inner = new THREE.CapsuleGeometry(0.065, 0.42, 4, 12);
      for (const s of [-1, 1]) {
        const e = new THREE.Group();
        e.position.set(s * 0.2, 1.95, -0.05);
        e.rotation.z = -s * 0.14;
        e.add(part(ear, c));
        e.add(part(inner, CHEEK, { outline: 0, at: [0, 0, 0.07], cast: false }));
        look.add(e);
      }
      look.add(part(SPH_LO, 0xffffff, { at: [0, 0.38, -0.46], scale: 0.15 }));
      look.add(part(SPH_LO, CHEEK, { outline: 0, at: [0, 1.12, 0.56], scale: [0.05, 0.035, 0.03], cast: false }));
      eyes(look, { y: 1.24 });
      cheeks(look);
      break;
    }
    case 'pengin': {
      look.add(part(SPH, 0xffffff, { outline: 0, at: [0, 1.12, 0.22], scale: [0.47, 0.4, 0.38] }));
      look.add(part(new THREE.ConeGeometry(0.09, 0.2, 16), 0xFFA23D, { at: [0, 1.08, 0.64], rot: [Math.PI / 2, 0, 0] }));
      for (const s of [-1, 1]) look.add(part(SPH_LO, c, { at: [s * 0.48, 0.55, 0], scale: [0.1, 0.28, 0.2], rot: [0, 0, s * 0.35] }));
      // ちいさなとさか
      look.add(part(SPH_LO, c, { at: [0, 1.78, 0.02], scale: [0.08, 0.12, 0.08], rot: [0.3, 0, 0] }));
      eyes(look, { y: 1.24, z: 0.58 });
      cheeks(look, { z: 0.52 });
      break;
    }
  }

  // 足もとの輪（自分の番のときに光る）
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.34, 0.46, 40),
    new THREE.MeshBasicMaterial({ color: def.ring, transparent: true, opacity: 0, depthWrite: false })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  root.add(ring);

  root.userData = { def, body, ring, phase: Math.random() * 6.28, busy: false };
  return root;
}
