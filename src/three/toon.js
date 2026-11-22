// アニメ風（トゥーン）の材質と、黒いふちどり
import * as THREE from 'three';

const gradient = (() => {
  const t = new THREE.DataTexture(new Uint8Array([110, 190, 255]), 3, 1, THREE.RedFormat);
  t.minFilter = THREE.NearestFilter;
  t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
})();

const mats = new Map();
export function toon(color) {
  const key = String(color);
  if (!mats.has(key)) mats.set(key, new THREE.MeshToonMaterial({ color, gradientMap: gradient }));
  return mats.get(key);
}

export const OUTLINE = new THREE.MeshBasicMaterial({ color: 0x2b2233, side: THREE.BackSide });

/**
 * トゥーンのメッシュを作る。
 * outline: ふちどりの太さ（0でなし。もとの大きさに対する割合）
 */
export function part(geo, color, { outline = 0.06, cast = true, receive = false, at, scale, rot } = {}) {
  const m = new THREE.Mesh(geo, toon(color));
  m.castShadow = cast;
  m.receiveShadow = receive;
  if (outline) {
    const o = new THREE.Mesh(geo, OUTLINE);
    o.scale.setScalar(1 + outline);
    o.castShadow = false;
    m.add(o);
  }
  if (at) m.position.set(...at);
  if (scale) Array.isArray(scale) ? m.scale.set(...scale) : m.scale.setScalar(scale);
  if (rot) m.rotation.set(...rot);
  return m;
}

export function flat(geo, color, opts = {}) {
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, ...opts }));
  return m;
}
