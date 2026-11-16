// physics.js — movement, collision and rays. Agents are boxes on a flat
// floor: velocity with ground acceleration and friction (fast stops, so
// counter-strafing works), gravity and a small jump, resolved axis by axis
// against the map's boxes. Rays are slab tests against the same boxes, so a
// bullet, a bot's sightline and the map the player sees are one geometry.

import { BOXES, BOUNDS } from './map.js';
import { BODY } from './config.js';
import { G } from './state.js';

/** Facing direction for a yaw (three.js convention: yaw 0 looks down -z). */
export const yawDir = (yaw) => ({ x: -Math.sin(yaw), z: -Math.cos(yaw) });
/** The yaw that faces from (ax, az) toward (bx, bz). */
export const yawTowards = (ax, az, bx, bz) => Math.atan2(-(bx - ax), -(bz - az));
/** Shortest signed turn from yaw a to yaw b, in (-pi, pi]. */
export function yawDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

const HALF = 0.30; // the agent's half-extent for collision

function collides(x, y, z) {
  for (const b of BOXES) {
    if (y >= b.y + b.h - 0.22 || y + 1.55 <= b.y) continue; // feet above it, or it is overhead
    if (x + HALF > b.x - b.w / 2 && x - HALF < b.x + b.w / 2 &&
        z + HALF > b.z - b.d / 2 && z - HALF < b.z + b.d / 2) return true;
  }
  return false;
}

/**
 * Advance one agent by dt from its cmd: wish direction from yaw and the
 * f/s (forward/strafe) inputs, ground accel + friction, crouch and walk
 * speed caps, jump and gravity, then axis-separated collision.
 */
export function moveAgent(a, dt) {
  const cmd = a.cmd;
  const sin = Math.sin(a.yaw), cos = Math.cos(a.yaw);
  // Forward on the ground is (-sin, -cos); right is (cos, -sin)... in xz:
  const fx = -sin, fz = -cos, rx = cos, rz = -sin;
  let wx = fx * cmd.f + rx * cmd.s;
  let wz = fz * cmd.f + rz * cmd.s;
  const wl = Math.hypot(wx, wz);
  if (wl > 1) { wx /= wl; wz /= wl; }

  const cap = a.crouch ? BODY.crouchSpeed : cmd.walk ? BODY.walkSpeed : BODY.speed;
  if (a.onGround) {
    // Friction first (this is what makes a counter-strafe stop dead), then accelerate.
    const sp = Math.hypot(a.vel.x, a.vel.z);
    if (sp > 0) {
      const drop = sp * BODY.friction * dt;
      const k = Math.max(0, sp - drop) / sp;
      a.vel.x *= k; a.vel.z *= k;
    }
    a.vel.x += wx * BODY.accel * dt;
    a.vel.z += wz * BODY.accel * dt;
    const sp2 = Math.hypot(a.vel.x, a.vel.z);
    if (sp2 > cap) { a.vel.x *= cap / sp2; a.vel.z *= cap / sp2; }
    if (cmd.jump) { a.vel.y = BODY.jumpVel; a.onGround = false; }
  } else {
    a.vel.x += wx * BODY.airAccel * dt;
    a.vel.z += wz * BODY.airAccel * dt;
  }
  a.vel.y -= BODY.gravity * dt;

  // Integrate and resolve, one axis at a time.
  let nx = a.pos.x + a.vel.x * dt;
  if (!collides(nx, a.pos.y, a.pos.z)) a.pos.x = nx; else a.vel.x = 0;
  let nz = a.pos.z + a.vel.z * dt;
  if (!collides(a.pos.x, a.pos.y, nz)) a.pos.z = nz; else a.vel.z = 0;
  a.pos.y += a.vel.y * dt;
  if (a.pos.y <= 0) { a.pos.y = 0; a.vel.y = 0; a.onGround = true; }
  else if (a.vel.y !== 0) a.onGround = a.pos.y === 0;

  a.pos.x = Math.max(BOUNDS.x0, Math.min(BOUNDS.x1, a.pos.x));
  a.pos.z = Math.max(BOUNDS.z0, Math.min(BOUNDS.z1, a.pos.z));
  a.speedNow = Math.hypot(a.vel.x, a.vel.z);
}

// --- rays -----------------------------------------------------------------

const hit = { dist: 0, x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0, box: null };

/**
 * Cast a ray against every map box and the floor. Returns the shared `hit`
 * scratch object (copy what you need before the next cast), or null.
 */
export function rayHit(ox, oy, oz, dx, dy, dz, maxDist) {
  let best = maxDist, bnx = 0, bny = 0, bnz = 0, bbox = null;
  for (const b of BOXES) {
    const x0 = b.x - b.w / 2, x1 = b.x + b.w / 2;
    const y0 = b.y, y1 = b.y + b.h;
    const z0 = b.z - b.d / 2, z1 = b.z + b.d / 2;
    let tmin = 0, tmax = best, nx = 0, ny = 0, nz = 0;
    // X slab
    if (Math.abs(dx) < 1e-9) { if (ox < x0 || ox > x1) continue; }
    else {
      const inv = 1 / dx;
      let t1 = (x0 - ox) * inv, t2 = (x1 - ox) * inv;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      if (t1 > tmin) { tmin = t1; nx = dx > 0 ? -1 : 1; ny = 0; nz = 0; }
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }
    // Y slab
    if (Math.abs(dy) < 1e-9) { if (oy < y0 || oy > y1) continue; }
    else {
      const inv = 1 / dy;
      let t1 = (y0 - oy) * inv, t2 = (y1 - oy) * inv;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      if (t1 > tmin) { tmin = t1; nx = 0; ny = dy > 0 ? -1 : 1; nz = 0; }
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }
    // Z slab
    if (Math.abs(dz) < 1e-9) { if (oz < z0 || oz > z1) continue; }
    else {
      const inv = 1 / dz;
      let t1 = (z0 - oz) * inv, t2 = (z1 - oz) * inv;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      if (t1 > tmin) { tmin = t1; nx = 0; ny = 0; nz = dz > 0 ? -1 : 1; }
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }
    if (tmin < best && tmin >= 0) { best = tmin; bnx = nx; bny = ny; bnz = nz; bbox = b; }
  }
  // The floor plane y = 0.
  if (dy < -1e-9) {
    const t = -oy / dy;
    if (t >= 0 && t < best) { best = t; bnx = 0; bny = 1; bnz = 0; bbox = null; }
  }
  if (best >= maxDist) return null;
  hit.dist = best;
  hit.x = ox + dx * best; hit.y = oy + dy * best; hit.z = oz + dz * best;
  hit.nx = bnx; hit.ny = bny; hit.nz = bnz; hit.box = bbox;
  return hit;
}

/** Does the 2D segment pass through any live smoke cloud? */
export function smokeBlocks(ax, az, bx, bz) {
  for (const sm of G.smokes) {
    if (G.time > sm.until) continue;
    const dx = bx - ax, dz = bz - az;
    const len2 = dx * dx + dz * dz || 1;
    let t = ((sm.x - ax) * dx + (sm.z - az) * dz) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = ax + dx * t - sm.x, pz = az + dz * t - sm.z;
    if (px * px + pz * pz < (sm.r * 0.92) ** 2) return true;
  }
  return false;
}

/**
 * Line of sight between two points (eye heights included): clear when no
 * box blocks the ray and no smoke cloud sits on the line.
 */
export function losClear(ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const dist = Math.hypot(dx, dy, dz);
  if (dist < 0.01) return true;
  const inv = 1 / dist;
  const blocked = rayHit(ax, ay, az, dx * inv, dy * inv, dz * inv, dist - 0.05) !== null;
  if (blocked) return false;
  return !smokeBlocks(ax, az, bx, bz);
}
