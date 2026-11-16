// fx.js — the view-layer effects, all pooled: tracer streaks, muzzle
// flashes with a real light, impact particles (dust, sparks, hit puffs),
// explosion fireballs, smoke clouds, ejected casings and camera shake.
// Nothing here touches game state; the simulation calls in and fx renders.

import * as THREE from 'three';
import { G } from './state.js';

let scene = null;
export let shake = 0;

const TRACERS = 28, FLASHES = 6, PARTICLES = 700, CASINGS = 14;
let tracerPool = [], flashPool = [], casingPool = [];
let pGeo, pPos, pCol, pVel = [], pLife = [], pHead = 0;
const smokeMeshes = new Map();

const V = () => new THREE.Vector3();

export function initFx(s) {
  scene = s;
  // Tracers: thin additive streaks, stretched between muzzle and hit point.
  const tGeo = new THREE.BoxGeometry(0.014, 0.014, 1);
  for (let i = 0; i < TRACERS; i++) {
    const m = new THREE.Mesh(tGeo, new THREE.MeshBasicMaterial({
      color: 0xffd9a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    m.visible = false;
    scene.add(m);
    tracerPool.push({ m, life: 0 });
  }
  // Muzzle flashes: a star sprite plus one shared point light per flash.
  const flashTex = makeFlashTexture();
  for (let i = 0; i < FLASHES; i++) {
    const grp = new THREE.Group();
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({
      map: flashTex, color: 0xffc266, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    spr.scale.set(0.55, 0.55, 1);
    grp.add(spr);
    const light = new THREE.PointLight(0xffa845, 0, 9, 1.8);
    grp.add(light);
    grp.visible = false;
    scene.add(grp);
    flashPool.push({ grp, spr, light, life: 0 });
  }
  // Particles: one Points cloud for every burst in the game.
  pPos = new Float32Array(PARTICLES * 3);
  pCol = new Float32Array(PARTICLES * 3);
  for (let i = 0; i < PARTICLES; i++) { pVel.push({ x: 0, y: 0, z: 0 }); pLife.push(0); pPos[i * 3 + 1] = -50; }
  pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const points = new THREE.Points(pGeo, new THREE.PointsMaterial({
    size: 0.055, vertexColors: true, transparent: true, opacity: 0.92, depthWrite: false,
  }));
  points.frustumCulled = false;
  scene.add(points);
  // Casings.
  const cGeo = new THREE.BoxGeometry(0.016, 0.016, 0.045);
  const cMat = new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.35, metalness: 0.8 });
  for (let i = 0; i < CASINGS; i++) {
    const m = new THREE.Mesh(cGeo, cMat);
    m.visible = false;
    scene.add(m);
    casingPool.push({ m, vel: V(), rot: V(), life: 0 });
  }
}

function makeFlashTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 2, 64, 64, 62);
  grad.addColorStop(0, 'rgba(255,240,200,1)');
  grad.addColorStop(0.35, 'rgba(255,180,80,0.85)');
  grad.addColorStop(1, 'rgba(255,120,20,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = 'rgba(255,220,160,0.9)';
  g.beginPath(); // a four-point star over the glow
  g.moveTo(64, 2); g.lineTo(70, 58); g.lineTo(126, 64); g.lineTo(70, 70); g.lineTo(64, 126); g.lineTo(58, 70); g.lineTo(2, 64); g.lineTo(58, 58);
  g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const _a = V(), _b = V(), _d = V();

export function tracer(ax, ay, az, bx, by, bz) {
  const t = tracerPool.find((p) => p.life <= 0) ?? tracerPool[0];
  _a.set(ax, ay, az); _b.set(bx, by, bz);
  _d.subVectors(_b, _a);
  const len = _d.length();
  if (len < 0.5) return;
  t.m.position.copy(_a).addScaledVector(_d, 0.5);
  t.m.scale.set(1, 1, len);
  t.m.lookAt(_b);
  t.m.material.opacity = 0.85;
  t.m.visible = true;
  t.life = 0.055;
}

export function muzzle(x, y, z, big = 1) {
  const f = flashPool.find((p) => p.life <= 0) ?? flashPool[0];
  f.grp.position.set(x, y, z);
  f.spr.material.rotation = Math.random() * Math.PI;
  f.spr.scale.set(0.5 * big, 0.5 * big, 1);
  f.light.intensity = 14 * big;
  f.grp.visible = true;
  f.life = 0.045;
}

function burst(x, y, z, n, color, speed, up, life, spread = 1) {
  const col = new THREE.Color(color);
  for (let k = 0; k < n; k++) {
    const i = pHead;
    pHead = (pHead + 1) % PARTICLES;
    pPos[i * 3] = x; pPos[i * 3 + 1] = y; pPos[i * 3 + 2] = z;
    pCol[i * 3] = col.r; pCol[i * 3 + 1] = col.g; pCol[i * 3 + 2] = col.b;
    pVel[i].x = (Math.random() - 0.5) * 2 * speed * spread;
    pVel[i].y = Math.random() * up;
    pVel[i].z = (Math.random() - 0.5) * 2 * speed * spread;
    pLife[i] = life * (0.6 + Math.random() * 0.7);
  }
}

/** Impact puff: colour by what was hit. */
export function impact(x, y, z, kind) {
  if (kind === 'flesh') burst(x, y, z, 6, 0x77201e, 1.0, 1.3, 0.38);
  else if (kind === 'metal') burst(x, y, z, 8, 0xffb84d, 2.2, 1.8, 0.3);
  else if (kind === 'wood') burst(x, y, z, 8, 0xa8894f, 1.4, 1.6, 0.45);
  else burst(x, y, z, 7, 0x9a9a92, 1.2, 1.5, 0.5);
}

export function explosionFx(x, y, z, radius) {
  burst(x, y + 0.4, z, 46, 0xff8c3a, radius * 1.15, 5.2, 0.7);
  burst(x, y + 0.4, z, 30, 0xffd27a, radius * 0.8, 3.6, 0.5);
  burst(x, y + 0.3, z, 22, 0x555049, radius * 0.5, 2.4, 1.3);
  const f = flashPool[0];
  f.grp.position.set(x, y + 0.6, z);
  f.spr.scale.set(radius * 1.6, radius * 1.6, 1);
  f.light.intensity = 60;
  f.light.distance = radius * 6;
  f.grp.visible = true;
  f.life = 0.16;
  shake = Math.min(1, shake + 0.55);
}

export function casing(x, y, z, yaw) {
  const c = casingPool.find((p) => p.life <= 0);
  if (!c) return;
  c.m.position.set(x, y, z);
  c.vel.set(Math.cos(yaw) * 1.1 + (Math.random() - 0.5) * 0.4, 1.5 + Math.random() * 0.5, -Math.sin(yaw) * 1.1 + (Math.random() - 0.5) * 0.4);
  c.rot.set(Math.random() * 9, Math.random() * 9, Math.random() * 9);
  c.m.visible = true;
  c.life = 0.9;
}

export function addShake(n) { shake = Math.min(1, shake + n); }

/** A grenade's flying body, by kind. */
export function projectileMesh(kind) {
  let mesh;
  if (kind === 'frag') {
    mesh = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0x44502e, roughness: 0.6, metalness: 0.3 }));
  } else if (kind === 'flash') {
    mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.15, 10),
      new THREE.MeshStandardMaterial({ color: 0xb9c0c7, roughness: 0.3, metalness: 0.8 }));
  } else {
    mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.16, 10),
      new THREE.MeshStandardMaterial({ color: 0x707880, roughness: 0.5, metalness: 0.5 }));
  }
  mesh.castShadow = true;
  if (scene) scene.add(mesh);
  return mesh;
}

const smokeGeo = new THREE.IcosahedronGeometry(1, 2);
const smokeMat = new THREE.MeshStandardMaterial({ color: 0xb9bcbe, roughness: 1, transparent: true, opacity: 0.86, depthWrite: false });

export function updateFx(dt) {
  for (const t of tracerPool) {
    if (t.life <= 0) continue;
    t.life -= dt;
    t.m.material.opacity = Math.max(0, t.life / 0.055) * 0.85;
    if (t.life <= 0) t.m.visible = false;
  }
  for (const f of flashPool) {
    if (f.life <= 0) continue;
    f.life -= dt;
    f.spr.material.opacity = Math.max(0, f.life / 0.045);
    f.light.intensity *= 0.55;
    if (f.life <= 0) { f.grp.visible = false; f.light.intensity = 0; f.light.distance = 9; }
  }
  for (let i = 0; i < PARTICLES; i++) {
    if (pLife[i] <= 0) continue;
    pLife[i] -= dt;
    pVel[i].y -= 5.5 * dt;
    pPos[i * 3] += pVel[i].x * dt;
    pPos[i * 3 + 1] += pVel[i].y * dt;
    pPos[i * 3 + 2] += pVel[i].z * dt;
    if (pPos[i * 3 + 1] < 0.02) { pPos[i * 3 + 1] = 0.02; pVel[i].y = 0; }
    if (pLife[i] <= 0) pPos[i * 3 + 1] = -50;
  }
  pGeo.attributes.position.needsUpdate = true;
  pGeo.attributes.color.needsUpdate = true;
  for (const c of casingPool) {
    if (c.life <= 0) continue;
    c.life -= dt;
    c.vel.y -= 9.5 * dt;
    c.m.position.addScaledVector(c.vel, dt);
    c.m.rotation.x += c.rot.x * dt; c.m.rotation.y += c.rot.y * dt;
    if (c.m.position.y < 0.03) { c.m.position.y = 0.03; c.vel.set(0, 0, 0); c.rot.set(0, 0, 0); }
    if (c.life <= 0) c.m.visible = false;
  }
  // Smoke clouds mirror G.smokes: grow in, hold, thin out at the end.
  const seen = new Set();
  for (const sm of G.smokes) {
    seen.add(sm);
    let m = smokeMeshes.get(sm);
    if (!m) {
      m = new THREE.Mesh(smokeGeo, smokeMat.clone());
      m.position.set(sm.x, 1.5, sm.z);
      scene.add(m);
      smokeMeshes.set(sm, m);
    }
    const age = G.time - sm.born;
    const left = sm.until - G.time;
    const grow = Math.min(1, age / 0.9);
    const fade = Math.min(1, Math.max(0, left / 1.6));
    m.scale.setScalar(sm.r * (0.55 + 0.45 * grow));
    m.material.opacity = 0.86 * Math.min(grow, fade);
    m.rotation.y += dt * 0.05;
  }
  for (const [sm, m] of smokeMeshes) {
    if (!seen.has(sm)) { scene.remove(m); m.material.dispose(); smokeMeshes.delete(sm); }
  }
  shake = Math.max(0, shake - dt * 2.6);
}
