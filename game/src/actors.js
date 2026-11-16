// actors.js — the bodies. Every bot is a stylised soldier assembled from
// boxes: legs that swing as it runs, a torso in its team's colour, a head
// with a helmet or cap, and a gun that tracks its aim pitch. The simulation
// owns the truth; this module only poses meshes to match, once per frame.

import * as THREE from 'three';
import { G } from './state.js';
import { PALETTE, WEAPONS } from './config.js';
import { scene } from './world.js';

const box = (w, h, d, color, rough = 0.85) =>
  new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.05 }));

function buildGun(def) {
  const grp = new THREE.Group();
  const body = box(0.07, 0.13, def.len * 0.62, PALETTE.dark, 0.5);
  body.position.z = -def.len * 0.2;
  grp.add(body);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, def.len * 0.45, 8),
    new THREE.MeshStandardMaterial({ color: 0x191c1f, roughness: 0.4, metalness: 0.6 }));
  barrel.rotation.x = Math.PI / 2;
  barrel.position.z = -def.len * 0.72;
  barrel.position.y = 0.03;
  grp.add(barrel);
  const mag = box(0.05, 0.16, 0.07, 0x2c3034, 0.5);
  mag.position.set(0, -0.12, -def.len * 0.18);
  mag.rotation.x = 0.25;
  grp.add(mag);
  if (def.scoped) {
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.16, 8),
      new THREE.MeshStandardMaterial({ color: 0x101214, roughness: 0.3, metalness: 0.5 }));
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, 0.1, -def.len * 0.2);
    grp.add(scope);
  }
  grp.traverse((m) => { m.castShadow = true; });
  return grp;
}

function buildBody(agent) {
  const team = agent.team === 'A'
    ? { main: PALETTE.striker, dark: PALETTE.strikerDark }
    : { main: PALETTE.sentinel, dark: PALETTE.sentinelDark };
  const root = new THREE.Group();
  const parts = {};

  const hips = new THREE.Group();
  hips.position.y = 0.86;
  root.add(hips);
  parts.hips = hips;
  for (const side of [-1, 1]) {
    const leg = box(0.15, 0.86, 0.17, PALETTE.dark);
    leg.position.set(0, -0.43, 0);
    const pivot = new THREE.Group();
    pivot.position.set(0.11 * side, 0, 0);
    pivot.add(leg);
    hips.add(pivot);
    parts[side < 0 ? 'legL' : 'legR'] = pivot;
  }
  const torso = box(0.46, 0.62, 0.24, team.main);
  torso.position.y = 0.31;
  hips.add(torso);
  parts.torso = torso;
  const vestMesh = box(0.4, 0.44, 0.3, team.dark);
  vestMesh.position.set(0, 0.28, 0);
  hips.add(vestMesh);
  parts.vestMesh = vestMesh;

  const headPivot = new THREE.Group();
  headPivot.position.y = 0.72;
  hips.add(headPivot);
  parts.headPivot = headPivot;
  const head = box(0.23, 0.25, 0.23, PALETTE.skin);
  head.position.y = 0.13;
  headPivot.add(head);
  parts.head = head;
  const helmet = box(0.27, 0.12, 0.27, team.dark);
  helmet.position.y = 0.26;
  headPivot.add(helmet);
  parts.helmet = helmet;

  // Arms: the left reaches forward to the forestock, the right holds the grip.
  const armL = box(0.1, 0.52, 0.1, team.dark);
  const armLPivot = new THREE.Group();
  armLPivot.position.set(-0.29, 0.56, 0);
  armL.position.set(0, -0.2, -0.12);
  armL.rotation.x = -0.9;
  armLPivot.add(armL);
  hips.add(armLPivot);
  const armR = box(0.1, 0.46, 0.1, team.dark);
  const armRPivot = new THREE.Group();
  armRPivot.position.set(0.29, 0.56, 0);
  armR.position.set(0, -0.18, -0.05);
  armR.rotation.x = -0.55;
  armRPivot.add(armR);
  hips.add(armRPivot);

  // The gun hangs off the torso's aim pivot, so pitch reads clearly.
  const aim = new THREE.Group();
  aim.position.set(0.16, 0.52, -0.1);
  hips.add(aim);
  parts.aim = aim;
  parts.gunId = null;
  parts.gun = null;

  root.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  agent.mesh = root;
  agent.parts = parts;
  agent.walkCycle = 0;
  scene.add(root);
}

export function buildActors() {
  for (const a of G.agents) {
    if (a.isPlayer) continue;
    buildBody(a);
  }
}

export function syncActors(dt) {
  for (const a of G.agents) {
    if (a.isPlayer || !a.mesh) continue;
    const p = a.parts;
    const m = a.mesh;
    m.position.set(a.pos.x, a.pos.y, a.pos.z);
    if (!a.alive) {
      // Fall where they stood; settle over a third of a second.
      a.deathT += dt;
      const k = Math.min(1, a.deathT / 0.35);
      m.rotation.set(-Math.PI / 2 * k * 0.92, a.yaw, 0);
      m.position.y = a.pos.y + 0.12 * k;
      continue;
    }
    m.rotation.set(0, a.yaw, 0);
    a.walkCycle += a.speedNow * dt * 2.1;
    const swing = Math.sin(a.walkCycle) * Math.min(0.55, a.speedNow * 0.14);
    p.legL.rotation.x = swing;
    p.legR.rotation.x = -swing;
    const crouchK = a.crouch ? 0.55 : 1;
    p.hips.position.y = 0.86 * crouchK + Math.abs(Math.sin(a.walkCycle)) * 0.03 * Math.min(1, a.speedNow);
    p.hips.rotation.x = a.crouch ? 0.16 : 0;
    p.aim.rotation.x = a.pitch;
    p.headPivot.rotation.x = a.pitch * 0.7;
    p.vestMesh.visible = a.vest;
    p.helmet.visible = a.helmet;
    // Swap the gun model when the held weapon changes.
    if (p.gunId !== a.current) {
      if (p.gun) p.aim.remove(p.gun);
      p.gun = buildGun(WEAPONS[a.current]);
      p.aim.add(p.gun);
      p.gunId = a.current;
    }
    // Damage flash on the torso.
    const flash = a.flashT > 0 ? 1 : 0;
    p.torso.material.emissive.setRGB(flash * 0.7, flash * 0.08, flash * 0.05);
    if (a.flashT > 0) a.flashT -= dt;
  }
}
