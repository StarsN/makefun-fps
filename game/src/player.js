// player.js — the human Striker: input into cmd, the camera, and the
// first-person view model. The camera rides the simulation's eye point with
// recoil, landing dips, walk bob and explosion shake layered on top; the
// view model is built per weapon from the same boxes as the bots' guns,
// with hands, sway, a reload dip and a draw raise.

import * as THREE from 'three';
import { G } from './state.js';
import { WEAPONS, PALETTE } from './config.js';
import { readPlayerCmd, keys, mouse, actions } from './input.js';
import { switchTo, throwGrenade, eyeOf } from './weapons.js';
import { gunOf } from './state.js';
import { camera, scene } from './world.js';
import * as fx from './fx.js';

let viewModel = null, vmGun = null, vmGunId = null;
let bobPhase = 0, landDip = 0, wasGrounded = true, stepT = 0;
let fovNow = 75;

const box = (w, h, d, color, rough = 0.7) =>
  new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.08 }));

function buildViewModel() {
  viewModel = new THREE.Group();
  const def = WEAPONS[G.player.current];
  vmGun = new THREE.Group();
  const receiver = box(0.075, 0.14, def.len * 0.6, PALETTE.dark, 0.45);
  vmGun.add(receiver);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, def.len * 0.5, 8),
    new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.35, metalness: 0.6 }));
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.035, -def.len * 0.52);
  vmGun.add(barrel);
  const grip = box(0.06, 0.15, 0.07, 0x2c3034, 0.5);
  grip.position.set(0, -0.12, 0.08);
  grip.rotation.x = 0.3;
  vmGun.add(grip);
  if (def.slot === 'primary') {
    const mag = box(0.05, 0.17, 0.08, 0x2c3034, 0.5);
    mag.position.set(0, -0.13, -def.len * 0.15);
    mag.rotation.x = 0.2;
    vmGun.add(mag);
    const stock = box(0.06, 0.1, 0.16, PALETTE.crateDark, 0.8);
    stock.position.set(0, -0.01, def.len * 0.36);
    vmGun.add(stock);
  }
  if (def.scoped) {
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.15, 10),
      new THREE.MeshStandardMaterial({ color: 0x0e1013, roughness: 0.25, metalness: 0.5 }));
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, 0.1, -0.05);
    vmGun.add(scope);
  }
  // Hands: right on the grip, left under the forestock, sleeves in Striker amber.
  const handR = box(0.07, 0.07, 0.09, PALETTE.skin);
  handR.position.set(0, -0.1, 0.09);
  vmGun.add(handR);
  const handL = box(0.07, 0.07, 0.09, PALETTE.skin);
  handL.position.set(-0.01, -0.06, -def.len * 0.34);
  vmGun.add(handL);
  const sleeve = box(0.09, 0.09, 0.2, PALETTE.strikerDark);
  sleeve.position.set(-0.01, -0.09, -def.len * 0.2);
  sleeve.rotation.x = 0.5;
  vmGun.add(sleeve);
  viewModel.add(vmGun);
  viewModel.position.set(0.23, -0.21, -0.42);
  camera.add(viewModel);
  vmGunId = G.player.current;
}

export function initPlayerView() {
  scene.add(camera);
  buildViewModel();
}

/** One simulation step of human input: fill cmd, handle keys and grenades. */
export function stepPlayer(dt) {
  const p = G.player;
  if (!p.alive) { p.cmd.f = 0; p.cmd.s = 0; p.cmd.fire = false; p.cmd.use = false; return; }
  readPlayerCmd(p, dt);
  if (G.phase === 'buy') { p.cmd.f = 0; p.cmd.s = 0; p.cmd.fire = false; p.cmd.jump = false; }
  if (G.phase !== 'live' && G.phase !== 'planted') { p.cmd.fire = false; p.cmd.use = false; }

  if (keys.has('Digit1') && p.loadout.primary) switchTo(p, p.loadout.primary);
  if (keys.has('Digit2')) switchTo(p, 'p9');
  if (actions.cycleNade) {
    actions.cycleNade = false;
    const owned = ['frag', 'flash', 'smoke'].filter((k) => p.nades[k] > 0);
    if (owned.length) {
      const i = owned.indexOf(p.nadeSel);
      p.nadeSel = owned[(i + 1) % owned.length];
    }
  }
  if (actions.throwNade) {
    actions.throwNade = false;
    throwGrenade(p);
  }
  // The Lance's scope: hold right mouse, only while it is up and still-ish.
  const wantScope = mouse.rdown && p.current === 'lance' && gunOf(p).reloading <= 0;
  p.scoped = wantScope;
  // Footsteps: running is loud, walking and crouching are not.
  if (p.speedNow > 3.4 && p.onGround && (G.phase === 'live' || G.phase === 'planted')) {
    stepT -= dt;
    if (stepT <= 0) { stepT = 0.34; G.noise.push({ x: p.pos.x, z: p.pos.z, t: G.time, team: p.team }); }
  }
}

/** Pose the camera and view model for this frame. */
export function renderPlayerView(dt) {
  const p = G.player;
  let eye, yaw, pitch;
  if (p.alive) {
    eye = eyeOf(p);
    yaw = p.yaw; pitch = p.pitch + (p.recoil ?? 0);
  } else if (G.spectate && G.spectate.alive) {
    const s = G.spectate;
    eye = eyeOf(s);
    yaw = s.yaw; pitch = s.pitch;
  } else {
    eye = { x: p.pos.x, y: 2.2, z: p.pos.z };
    yaw = p.yaw; pitch = -0.4;
  }
  // Landing dip and walk bob, only for the living player's own eyes.
  if (p.alive) {
    if (p.onGround && !wasGrounded) landDip = 0.09;
    wasGrounded = p.onGround;
    landDip = Math.max(0, landDip - dt * 0.5);
    if (p.onGround && p.speedNow > 0.4) bobPhase += dt * p.speedNow * 1.55;
  }
  const bobY = p.alive ? Math.sin(bobPhase * 2) * 0.016 * Math.min(1, p.speedNow / 4) - landDip : 0;
  const bobX = p.alive ? Math.sin(bobPhase) * 0.011 * Math.min(1, p.speedNow / 4) : 0;
  const sh = fx.shake;
  camera.position.set(
    eye.x + bobX * Math.cos(yaw) + (sh ? (Math.random() - 0.5) * 0.05 * sh : 0),
    eye.y + bobY + (sh ? (Math.random() - 0.5) * 0.05 * sh : 0),
    eye.z + bobX * -Math.sin(yaw) + (sh ? (Math.random() - 0.5) * 0.05 * sh : 0),
  );
  camera.rotation.order = 'YXZ';
  camera.rotation.set(pitch + (sh ? (Math.random() - 0.5) * 0.02 * sh : 0), yaw, 0);

  // Field of view: scope narrows it hard; a sprint-less game keeps 75 else.
  const targetFov = p.scoped ? 24 : 75;
  fovNow += (targetFov - fovNow) * Math.min(1, dt * 11);
  if (Math.abs(fovNow - camera.fov) > 0.05) { camera.fov = fovNow; camera.updateProjectionMatrix(); }

  // View model: rebuild on switch, sway with look, dip on reload, hide scoped.
  if (viewModel) {
    if (vmGunId !== p.current) buildViewModelFresh();
    const gun = gunOf(p);
    const reloading = gun.reloading > 0;
    const drawK = Math.max(0, (gun.drawUntil - G.time) / (WEAPONS[p.current].draw || 0.6));
    viewModel.visible = p.alive && !p.scoped;
    viewModel.position.y = -0.21 - (reloading ? 0.13 : 0) - drawK * 0.3 + bobY * 1.4;
    viewModel.position.x = 0.23 + bobX * 1.2;
    viewModel.rotation.x = (reloading ? -0.5 : 0) + (p.recoil ?? 0) * 1.6;
    viewModel.rotation.z = drawK * 0.4;
  }
}

function buildViewModelFresh() {
  if (viewModel) camera.remove(viewModel);
  buildViewModel();
}
