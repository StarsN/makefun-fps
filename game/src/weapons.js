// weapons.js — gunplay and everything that flies. A shot is a ray tested
// against the map (physics.rayHit) and against each opponent's body: a head
// sphere over a torso capsule, legs below the knee line — head hits pay the
// weapon's headMult, armour shaves body and (with a helmet) head damage, and
// damage falls off with distance. Spread grows with movement, airtime and
// sustained fire (bloom), so the game rewards stopping to shoot. Grenades
// are real projectiles with bounce and fuses; explosions respect cover.

import { WEAPONS, BODY } from './config.js';
import { BOXES } from './map.js';
import { G, bus, gunOf, defOf } from './state.js';
import { rayHit, yawDir } from './physics.js';
import * as fx from './fx.js';
import { sfxShot, sfxDry, sfxReload, sfxHit, sfxKill, sfxExplosion, sfxFlash, sfxSmoke, sfxThrow } from './audio.js';
import { rnd } from './rng.js';

export const eyeOf = (a) => ({
  x: a.pos.x,
  y: a.pos.y + (a.crouch ? BODY.eyeCrouch : BODY.eyeStand),
  z: a.pos.z,
});

const falloff = (def, dist) => {
  const [start, end, min] = def.range;
  if (dist <= start) return 1;
  if (dist >= end) return min;
  return 1 - (1 - min) * ((dist - start) / (end - start));
};

/** Volume of a sound at the player's ear, by distance. */
const volAt = (x, z, own = 1) => {
  const p = G.player;
  if (!p) return 0.4;
  const d = Math.hypot(p.pos.x - x, p.pos.z - z);
  return Math.max(0, Math.min(1, own * (1.12 - d / 40)));
};

// --- body hit tests ---------------------------------------------------------

// Closest approach of a ray (origin o, unit dir d, length len) to a segment.
function raySegment(o, d, len, ax, ay, az, bx, by, bz) {
  const ux = d.x * len, uy = d.y * len, uz = d.z * len;
  const vx = bx - ax, vy = by - ay, vz = bz - az;
  const wx = o.x - ax, wy = o.y - ay, wz = o.z - az;
  const A = ux * ux + uy * uy + uz * uz, B = ux * vx + uy * vy + uz * vz;
  const C = vx * vx + vy * vy + vz * vz, D = ux * wx + uy * wy + uz * wz;
  const E = vx * wx + vy * wy + vz * wz;
  const den = A * C - B * B;
  let s = den > 1e-9 ? (B * E - C * D) / den : 0;
  s = Math.max(0, Math.min(1, s));
  const t = C > 1e-9 ? (B * s + E) / C : 0;
  const tc = Math.max(0, Math.min(1, t));
  const sc = Math.max(0, Math.min(1, (B * tc - D) / (A || 1)));
  const px = o.x + ux * sc - (ax + vx * tc), py = o.y + uy * sc - (ay + vy * tc), pz = o.z + uz * sc - (az + vz * tc);
  return { t: sc * len, y: ay + vy * tc, d2: px * px + py * py + pz * pz };
}

function raySphere(o, d, cx, cy, cz, r) {
  const lx = cx - o.x, ly = cy - o.y, lz = cz - o.z;
  const tca = lx * d.x + ly * d.y + lz * d.z;
  if (tca < 0) return -1;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  if (d2 > r * r) return -1;
  return tca - Math.sqrt(r * r - d2);
}

/** Test one bullet against one agent; returns { dist, part } or null. */
function hitAgent(o, d, maxDist, a) {
  const top = a.pos.y + (a.crouch ? 0.98 : 1.44);
  const headY = a.pos.y + (a.crouch ? BODY.headYCrouch : BODY.headY);
  const th = raySphere(o, d, a.pos.x, headY, a.pos.z, BODY.headR + 0.03);
  const seg = raySegment(o, d, maxDist, a.pos.x, a.pos.y + 0.28, a.pos.z, a.pos.x, top, a.pos.z);
  const tb = seg.d2 < 0.315 * 0.315 ? seg.t : -1;
  if (th >= 0 && (tb < 0 || th <= tb)) return { dist: th, part: 'head' };
  if (tb >= 0) return { dist: tb, part: seg.y < a.pos.y + BODY.legY ? 'legs' : 'chest' };
  return null;
}

// --- damage -----------------------------------------------------------------

export function applyDamage(target, dmg, part, attacker, cause) {
  if (!target.alive || dmg <= 0) return;
  if (part === 'head' && target.helmet) dmg *= 0.55;
  if (part !== 'head' && target.vest) dmg *= 0.55;
  target.hp -= dmg;
  target.flashT = 0.14;
  if (attacker) {
    target.lastHitBy = attacker;
    target.lastHitT = G.time;
    const dx = attacker.pos.x - target.pos.x, dz = attacker.pos.z - target.pos.z;
    target.lastHitDir = Math.atan2(dx, dz);
  }
  if (target.isPlayer && attacker) bus.emit('playerHurt', { dir: target.lastHitDir, hp: target.hp });
  if (target.hp <= 0) {
    target.hp = 0;
    target.alive = false;
    target.deathT = 0;
    target.stats.deaths++;
    if (attacker && attacker !== target) {
      attacker.stats.kills++;
      if (part === 'head') attacker.stats.headshots++;
      if (attacker.team !== target.team) attacker.money = Math.min(9000, attacker.money + 300);
    }
    bus.emit('kill', { victim: target, attacker, cause, headshot: part === 'head' });
  } else if (attacker && attacker.isPlayer) {
    sfxHit(part === 'head');
    bus.emit('playerHit', { part });
  }
}

/** Radial damage with a cover discount — grenades, barrels, the bomb. */
export function explodeAt(x, y, z, radius, maxDmg, owner, cause) {
  fx.explosionFx(x, Math.max(0.4, y), z, radius);
  sfxExplosion(Math.max(0.25, volAt(x, z)));
  for (const a of G.agents) {
    if (!a.alive) continue;
    const cx = a.pos.x, cy = a.pos.y + 0.9, cz = a.pos.z;
    const d = Math.hypot(cx - x, cy - y, cz - z);
    if (d > radius + 0.4) continue;
    let dmg = maxDmg * Math.max(0.08, 1 - d / (radius + 0.8));
    // Solid cover between the blast and the body cuts it to a quarter.
    const dir = { x: (cx - x) / (d || 1), y: (cy - y) / (d || 1), z: (cz - z) / (d || 1) };
    if (rayHit(x, y, z, dir.x, dir.y, dir.z, Math.max(0, d - 0.3))) dmg *= 0.25;
    if (a.vest) dmg *= 0.8;
    applyDamage(a, dmg, 'chest', owner === a ? null : owner, cause);
  }
  for (const b of G.barrels) {
    if (!b.alive) continue;
    if (Math.hypot(b.x - x, b.z - z) < radius && !b.boomT) b.boomT = G.time + 0.14;
  }
  if (G.player && G.player.alive) {
    const d = Math.hypot(G.player.pos.x - x, G.player.pos.z - z);
    if (d < radius + 3) fx.addShake(Math.max(0, 0.5 - d * 0.05));
  }
}

// --- firing -------------------------------------------------------------------

function fireBullet(a, def, gun) {
  const eye = eyeOf(a);
  const pitch = a.pitch + (a.recoil ?? 0);
  // Spread: base cone, widened by speed, airtime and bloom; narrowed by
  // crouching and walking. This is the whole "stop to aim" bargain.
  const speedK = 1 + (a.speedNow / BODY.speed) * (def.moveSpread - 1);
  const airK = a.onGround ? 1 : 2.6;
  const stanceK = a.crouch ? 0.72 : a.walk ? 0.85 : 1;
  const spread = (def.spread * speedK * airK + gun.bloom) * stanceK;
  const yaw = a.yaw + (rnd() - 0.5) * 2 * spread;
  const pit = pitch + (rnd() - 0.5) * 2 * spread;
  const d = {
    x: -Math.sin(yaw) * Math.cos(pit),
    y: Math.sin(pit),
    z: -Math.cos(yaw) * Math.cos(pit),
  };
  const MAX = 140;
  const wall = rayHit(eye.x, eye.y, eye.z, d.x, d.y, d.z, MAX);
  let endDist = wall ? wall.dist : MAX;
  let end = { x: eye.x + d.x * endDist, y: eye.y + d.y * endDist, z: eye.z + d.z * endDist };
  let hitA = null, hitPart = null;
  for (const t of G.agents) {
    if (t === a || !t.alive || t.team === a.team) continue;
    const h = hitAgent(eye, d, endDist, t);
    if (h && h.dist < endDist) { endDist = h.dist; hitA = t; hitPart = h.part; }
  }
  // Barrels are valid targets too.
  let hitBarrel = null;
  for (const b of G.barrels) {
    if (!b.alive) continue;
    const tb = raySphere(eye, d, b.x, 0.5, b.z, 0.38);
    if (tb >= 0 && tb < endDist) { endDist = tb; hitBarrel = b; hitA = null; }
  }
  end = { x: eye.x + d.x * endDist, y: eye.y + d.y * endDist, z: eye.z + d.z * endDist };

  const fwd = yawDir(a.yaw);
  const mx = eye.x + fwd.x * 0.55, mz = eye.z + fwd.z * 0.55, my = eye.y - 0.14;
  fx.tracer(mx, my, mz, end.x, end.y, end.z);
  fx.muzzle(mx, my, mz, def.id === 'lance' ? 1.5 : 1);
  if (hitA) {
    let dmg = def.damage * falloff(def, endDist);
    if (hitPart === 'head') dmg *= def.headMult;
    else if (hitPart === 'legs') dmg *= 0.75;
    fx.impact(end.x, end.y, end.z, 'flesh');
    if (a.isPlayer) { a.stats.hits++; }
    applyDamage(hitA, dmg, hitPart, a, def.id);
    if (a.isPlayer && !hitA.alive) sfxKill();
  } else if (hitBarrel) {
    fx.impact(end.x, end.y, end.z, 'metal');
    hitBarrel.hp -= def.damage;
    hitBarrel.lastHitBy = a;
    if (hitBarrel.hp <= 0 && !hitBarrel.boomT) hitBarrel.boomT = G.time + 0.05;
  } else if (wall) {
    const mat = wall.box?.mat ?? '';
    fx.impact(end.x, end.y, end.z, mat.startsWith('steel') || mat.startsWith('cont') ? 'metal' : mat.startsWith('crate') ? 'wood' : 'concrete');
  }
}

/** Per-step weapon handling for one agent: draw, reload, fire, bloom decay. */
export function updateWeapon(a, dt) {
  const gun = gunOf(a), def = defOf(a);
  if (gun.reloading > 0) {
    gun.reloading -= dt;
    if (gun.reloading <= 0) {
      const take = Math.min(def.mag - gun.mag, gun.reserve);
      gun.mag += take;
      gun.reserve -= take;
    }
  }
  gun.bloom = Math.max(0, gun.bloom - dt * 0.028);
  a.recoil = Math.max(0, (a.recoil ?? 0) - dt * 0.09);

  const busy = gun.reloading > 0 || G.time < gun.drawUntil;
  if (a.cmd.reload && !busy && gun.mag < def.mag && gun.reserve > 0) startReload(a);
  if (!a.cmd.fire) a.fireLatch = false;
  if (!a.cmd.fire || busy || G.phase !== 'live' && G.phase !== 'planted') return;
  if (!def.auto && a.fireLatch) return;
  if (G.time < gun.nextOk) return;
  if (gun.mag <= 0) {
    sfxDry();
    gun.nextOk = G.time + 0.3;
    if (gun.reserve > 0) startReload(a);
    return;
  }
  a.fireLatch = true;
  gun.mag--;
  gun.nextOk = G.time + 60 / def.rpm;
  gun.bloom = Math.min(def.bloomMax, gun.bloom + def.bloom);
  a.recoil = Math.min(0.11, (a.recoil ?? 0) + def.kick);
  a.firedT = G.time;
  G.noise.push({ x: a.pos.x, z: a.pos.z, t: G.time, team: a.team });
  if (a.isPlayer) a.stats.shots++;
  sfxShot(def.id, a.isPlayer ? 1 : volAt(a.pos.x, a.pos.z, 0.85));
  fireBullet(a, def, gun);
  // The player's ejected casing, from the view model's ejection port.
  if (a.isPlayer) {
    const eye = eyeOf(a);
    fx.casing(eye.x, eye.y - 0.16, eye.z, a.yaw);
  }
}

export function startReload(a) {
  const gun = gunOf(a), def = defOf(a);
  if (gun.reloading > 0 || gun.mag >= def.mag || gun.reserve <= 0) return;
  gun.reloading = def.reload;
  a.scoped = false;
  if (a.isPlayer) sfxReload();
}

/** Switch the held weapon; returns false when the agent does not own it. */
export function switchTo(a, id) {
  if (a.current === id || !a.guns[id]) return false;
  const gun = gunOf(a);
  gun.reloading = 0;
  a.current = id;
  a.guns[id].drawUntil = G.time + WEAPONS[id].draw;
  a.scoped = false;
  return true;
}

// --- grenades -----------------------------------------------------------------

export function throwGrenade(a) {
  const kind = a.nadeSel;
  if (a.nades[kind] <= 0 || (G.phase !== 'live' && G.phase !== 'planted')) return false;
  a.nades[kind]--;
  const eye = eyeOf(a);
  const pit = a.pitch + 0.16;
  const vx = -Math.sin(a.yaw) * Math.cos(pit), vz = -Math.cos(a.yaw) * Math.cos(pit);
  const sp = 13.5;
  const mesh = fx.projectileMesh(kind);
  G.projectiles.push({
    kind, owner: a, mesh,
    x: eye.x + vx * 0.4, y: eye.y, z: eye.z + vz * 0.4,
    vx: vx * sp, vy: Math.sin(pit) * sp + 1.6, vz: vz * sp,
    fuse: kind === 'frag' ? 1.6 : kind === 'flash' ? 1.25 : 1.35,
    bounces: 0,
  });
  sfxThrow();
  return true;
}

function detonate(p) {
  const { kind, owner } = p;
  if (kind === 'frag') {
    explodeAt(p.x, Math.max(0.5, p.y), p.z, 5.5, 95, owner, 'frag');
  } else if (kind === 'flash') {
    fx.explosionFx(p.x, p.y, p.z, 1.2);
    sfxFlash();
    for (const a of G.agents) {
      if (!a.alive) continue;
      const eye = eyeOf(a);
      const d = Math.hypot(eye.x - p.x, eye.y - p.y, eye.z - p.z);
      if (d > 24) continue;
      // Facing factor: full in the eyes, a glance from the side, little from behind.
      const f = yawDir(a.yaw);
      const dot = (f.x * (p.x - eye.x) + f.z * (p.z - eye.z)) / (Math.hypot(p.x - eye.x, p.z - eye.z) || 1);
      let s = dot > 0.55 ? 1 : dot > 0 ? 0.5 : 0.14;
      s *= Math.max(0, 1 - d / 26);
      // A wall between the agent and the pop cancels it.
      const dir = { x: (p.x - eye.x) / (d || 1), y: (p.y - eye.y) / (d || 1), z: (p.z - eye.z) / (d || 1) };
      if (rayHit(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, d - 0.1)) s = 0;
      if (s > 0.03) a.blind = Math.max(a.blind, Math.min(1, s));
    }
  } else {
    G.smokes.push({ x: p.x, z: p.z, r: 4.2, born: G.time, until: G.time + 14 });
    if (volAt(p.x, p.z) > 0.1) sfxSmoke();
  }
}

export function updateProjectiles(dt) {
  for (let i = G.projectiles.length - 1; i >= 0; i--) {
    const p = G.projectiles[i];
    p.fuse -= dt;
    p.vy -= 11.5 * dt;
    const px = p.x, pz = p.z;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    if (p.y < 0.08) {
      p.y = 0.08;
      if (Math.abs(p.vy) > 1.2) { p.vy = -p.vy * 0.38; p.vx *= 0.7; p.vz *= 0.7; p.bounces++; }
      else { p.vy = 0; p.vx *= 0.86; p.vz *= 0.86; }
    }
    // Wall bounce: if the new spot is inside a box, step back and reflect
    // whichever velocity component carried it in.
    for (const b of BOXES) {
      if (p.y > b.y + b.h || p.y < b.y) continue;
      if (p.x > b.x - b.w / 2 - 0.06 && p.x < b.x + b.w / 2 + 0.06 &&
          p.z > b.z - b.d / 2 - 0.06 && p.z < b.z + b.d / 2 + 0.06) {
        if (Math.abs(p.vx) > Math.abs(p.vz)) { p.x = px; p.vx = -p.vx * 0.4; }
        else { p.z = pz; p.vz = -p.vz * 0.4; }
        break;
      }
    }
    p.mesh.position.set(p.x, p.y, p.z);
    p.mesh.rotation.x += dt * 6; p.mesh.rotation.z += dt * 4;
    if (p.fuse <= 0) {
      detonate(p);
      p.mesh.removeFromParent();
      G.projectiles.splice(i, 1);
    }
  }
  // Barrels whose fuse was lit by a bullet or a blast.
  for (const b of G.barrels) {
    if (b.alive && b.boomT && G.time >= b.boomT) {
      b.alive = false;
      b.mesh.visible = false;
      explodeAt(b.x, 0.7, b.z, 5.2, 88, b.lastHitBy ?? null, 'barrel');
    }
  }
}
