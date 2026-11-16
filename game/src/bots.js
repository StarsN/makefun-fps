// bots.js — the other seven soldiers. Each bot perceives the world the way
// a player does — a field of view, line of sight, gunfire it can hear, the
// sting of being hit — remembers where it last saw an enemy, and shares
// that with its team. On top of perception sit two mission brains: Strikers
// split across routes to a chosen site, plant and guard the charge;
// Sentinels hold posts on both sites, rotate on information, and retake to
// defuse. In a fight a bot aims with human error, fires bursts, strafes
// between them, and stops to shoot — the same bargain the player gets.

import { G, defOf } from './state.js';
import { NODES, findPath, nearestNode, SITES, siteAt } from './map.js';
import { losClear, yawTowards, yawDelta } from './physics.js';
import { eyeOf, switchTo, throwGrenade } from './weapons.js';
import { buyWeapon, buyGear, buyNade, refillAmmo } from './shop.js';
import { rnd, rr, chance } from './rng.js';

// Team knowledge: the last enemy contact each side can act on.
export const intel = {
  A: { t: -99, x: 0, z: 0, site: null },
  D: { t: -99, x: 0, z: 0, site: null },
};

const POSTS = { A: [37, 35], B: [42, 40] }; // Sentinel hold nodes, per site
const SITE_COVER = { A: [35, 37, 39, 11], B: [40, 42, 44, 17] };
const PLANT_NODE = { A: 36, B: 41 };
const ROUTES = {
  A: [{ via: 9, goal: 36 }, { via: 27, goal: 35 }, { via: 26, goal: 37 }],
  B: [{ via: 15, goal: 41 }, { via: 32, goal: 40 }, { via: 31, goal: 42 }],
};

export function makeBrain(a) {
  a.brain = {
    skill: { react: rr(0.30, 0.52), err: rr(0.85, 1.3) },
    thinkT: rr(0, 0.12), target: null, seenT: -9, lastSeen: { x: 0, z: 0 },
    reactAt: 0, alert: false, heardT: -9, heardX: 0, heardZ: 0,
    state: 'idle', goalNode: -1, path: [], pathI: 0,
    viaNode: -1, siteGoal: -1, routeIdx: 0, playerSite: null,
    postNode: -1, postSite: 'A', rotator: false, watchYaw: 0, crouchHold: false,
    burstLeft: 0, pauseUntil: 0, lastMag: 0, aimErr: 0.055,
    strafeDir: 1, strafeT: 0, stuckT: 0, scanPhase: rr(0, 6.28),
    threwSmoke: false, threwFlash: false, threwFrag: false, defuseRole: false,
  };
}

function resetRound(b) {
  b.target = null; b.seenT = -9; b.alert = false;
  b.goalNode = -1; b.path = []; b.pathI = 0;
  b.burstLeft = 0; b.pauseUntil = 0; b.aimErr = 0.055;
  b.threwSmoke = false; b.threwFlash = false; b.threwFrag = false;
  b.defuseRole = false; b.playerSite = null;
}

function setRoute(b, site, idx) {
  const r = ROUTES[site][idx % ROUTES[site].length];
  b.viaNode = r.via;
  b.siteGoal = r.goal;
  b.goalNode = -1; b.path = [];
}

/** Round start: pick the site, split the routes, post the Sentinels. */
export function planRound() {
  intel.A.t = -99; intel.D.t = -99;
  G.siteTarget = chance(0.52) ? 'A' : 'B';
  let ai = 0;
  for (const a of G.agents) {
    if (a.isPlayer || !a.brain) continue;
    const b = a.brain;
    resetRound(b);
    if (a.loadout.primary) switchTo(a, a.loadout.primary);
    else switchTo(a, 'p9');
    if (a.team === 'A') {
      b.routeIdx = ai++;
      setRoute(b, G.siteTarget, b.routeIdx);
      if (a.hasBomb) { // the carrier takes the fast main route and plants
        b.viaNode = ROUTES[G.siteTarget][0].via;
        b.siteGoal = PLANT_NODE[G.siteTarget];
      }
      b.state = 'push';
    } else {
      const di = G.agents.filter((x) => x.team === 'D' && !x.isPlayer).indexOf(a);
      const site = di % 2 === 0 ? 'A' : 'B';
      b.postSite = site;
      b.postNode = POSTS[site][Math.floor(di / 2) % 2];
      b.rotator = Math.floor(di / 2) === 1;
      b.watchYaw = Math.PI / 2; // face the western doors
      b.crouchHold = chance(0.4);
      b.state = 'setup';
    }
  }
}

/** What a bot buys in the buy phase, in priority order. */
export function botBuy(a) {
  refillAmmo(a);
  if (!a.loadout.primary) {
    if (a.money >= 2700) buyWeapon(a, 'ar9');
    else if (a.money >= 1400) buyWeapon(a, 'vk7');
  }
  if (!a.vest && a.money >= 1000) buyGear(a, 'fullkit');
  else if (!a.vest && a.money >= 650) buyGear(a, 'vest');
  else if (a.vest && !a.helmet && a.money >= 1000) buyGear(a, 'fullkit');
  if (a.team === 'D') {
    if (!a.nades.smoke && a.money >= 300 && chance(0.7)) buyNade(a, 'smoke');
    if (!a.nades.flash && a.money >= 200 && chance(0.5)) buyNade(a, 'flash');
  } else {
    if (!a.nades.flash && a.money >= 200 && chance(0.6)) buyNade(a, 'flash');
    if (!a.nades.frag && a.money >= 300 && chance(0.5)) buyNade(a, 'frag');
    if (!a.nades.smoke && a.money >= 300 && chance(0.3)) buyNade(a, 'smoke');
  }
  if (a.loadout.primary) switchTo(a, a.loadout.primary);
}

// --- perception ---------------------------------------------------------------

function perceive(a, b) {
  const eye = eyeOf(a);
  const blind = a.blind > 0.3;
  let best = null, bestD = Infinity;
  for (const e of G.agents) {
    if (!e.alive || e.team === a.team) continue;
    const d = Math.hypot(e.pos.x - a.pos.x, e.pos.z - a.pos.z);
    if (d > 58 || blind) continue;
    const facing = Math.abs(yawDelta(a.yaw, yawTowards(eye.x, eye.z, e.pos.x, e.pos.z))) < 1.05;
    const heardShot = e.firedT > G.time - 0.35 && d < 20;
    if (!facing && !heardShot && d > 2.2) continue;
    if (!losClear(eye.x, eye.y, eye.z, e.pos.x, e.pos.y + 1.25, e.pos.z)) continue;
    if (d < bestD) { bestD = d; best = e; }
  }
  if (best) {
    if (b.target !== best) {
      b.target = best;
      b.reactAt = G.time + b.skill.react * (b.alert ? 0.55 : 1);
      b.aimErr = 0.055 * b.skill.err;
    }
    b.seenT = G.time;
    b.lastSeen.x = best.pos.x; b.lastSeen.z = best.pos.z;
    b.alert = true;
    const it = intel[a.team];
    it.t = G.time; it.x = best.pos.x; it.z = best.pos.z;
    const s = siteAt(best.pos.x, best.pos.z);
    if (s) it.site = s.id;
  } else if (G.time - b.seenT > 4.5) b.target = null;

  // Gunfire carries: fresh enemy noise turns heads and feeds team intel.
  for (let i = G.noise.length - 1; i >= 0; i--) {
    const n = G.noise[i];
    if (n.team === a.team || G.time - n.t > 1.6) continue;
    if (Math.hypot(n.x - a.pos.x, n.z - a.pos.z) < 17) {
      b.heardT = G.time; b.heardX = n.x; b.heardZ = n.z;
      const it = intel[a.team];
      if (G.time - it.t > 2) {
        it.t = G.time; it.x = n.x; it.z = n.z;
        const s = siteAt(n.x, n.z);
        if (s) it.site = s.id;
      }
    }
  }
  // Being shot is the loudest information of all.
  if (a.lastHitBy && a.lastHitBy.alive && G.time - a.lastHitT < 0.4 && b.target !== a.lastHitBy) {
    b.target = a.lastHitBy;
    b.reactAt = G.time + b.skill.react * 0.4;
    b.seenT = G.time;
    b.lastSeen.x = a.lastHitBy.pos.x; b.lastSeen.z = a.lastHitBy.pos.z;
  }
}

// --- movement helpers -----------------------------------------------------------

function turnToward(a, want, dt, rate) {
  const d = yawDelta(a.yaw, want);
  const m = rate * dt;
  a.yaw += Math.max(-m, Math.min(m, d));
}

function steerTo(a, x, z, dt, arrive = 0.75) {
  const dx = x - a.pos.x, dz = z - a.pos.z;
  const d = Math.hypot(dx, dz);
  const want = yawTowards(a.pos.x, a.pos.z, x, z);
  turnToward(a, want, dt, 5.4);
  a.cmd.f = d < arrive ? 0 : Math.abs(yawDelta(a.yaw, want)) < 0.55 ? 1 : 0.35;
  a.pitch += (0 - a.pitch) * Math.min(1, dt * 4);
  return d < arrive;
}

function setGoal(a, b, nodeIdx) {
  if (b.goalNode === nodeIdx && b.path.length) return;
  b.goalNode = nodeIdx;
  const from = nearestNode(a.pos.x, a.pos.z);
  b.path = findPath(from, nodeIdx) ?? [nodeIdx];
  b.pathI = 0;
}

function followPath(a, b, dt) {
  if (b.pathI >= b.path.length) return true;
  const n = NODES[b.path[b.pathI]];
  if (steerTo(a, n.x, n.z, dt, 0.85)) { b.pathI++; return b.pathI >= b.path.length; }
  return false;
}

function holdPosition(a, b, dt, watchYaw) {
  a.cmd.f = 0; a.cmd.s = 0;
  const want = watchYaw + Math.sin(G.time * 0.4 + b.scanPhase) * 0.55;
  turnToward(a, want, dt, 1.6);
  a.cmd.crouch = b.crouchHold;
  a.pitch += (0 - a.pitch) * Math.min(1, dt * 3);
}

// --- combat ---------------------------------------------------------------------

function combat(a, b, dt) {
  const t = b.target;
  const eye = eyeOf(a);
  const distT = Math.hypot(t.pos.x - a.pos.x, t.pos.z - a.pos.z);
  const chestY = t.pos.y + (t.crouch ? 0.85 : 1.24);
  const wantYaw = yawTowards(eye.x, eye.z, t.pos.x, t.pos.z);
  turnToward(a, wantYaw, dt, distT < 8 ? 9.5 : 6.5);
  const hd = Math.hypot(t.pos.x - eye.x, t.pos.z - eye.z) || 1;
  const wantPitch = Math.atan2(chestY - eye.y, hd);
  a.pitch += Math.max(-4.5 * dt, Math.min(4.5 * dt, wantPitch - a.pitch));
  b.aimErr = Math.max(0.006 * b.skill.err, b.aimErr - dt * 0.055);

  const def = defOf(a);
  const gun = a.guns[a.current];
  if (gun.mag === 0 && gun.reserve > 0) a.cmd.reload = true;
  const aligned = Math.abs(yawDelta(a.yaw, wantYaw)) < 0.05 + b.aimErr * 1.6;
  const blindK = a.blind > 0.3 ? 3.2 : 1;
  if (b.burstLeft > 0) {
    a.cmd.fire = aligned && G.time >= b.reactAt;
    const fired = b.lastMag - gun.mag;
    if (fired > 0) b.burstLeft -= fired;
    if (b.burstLeft <= 0) {
      b.pauseUntil = G.time + rr(0.22, 0.5) * (def.id === 'lance' ? 2.4 : 1);
      a.cmd.fire = false;
    }
  } else if (G.time >= b.pauseUntil && aligned && G.time >= b.reactAt) {
    b.burstLeft = def.id === 'lance' ? 1 : Math.round(rr(2.5, 5.5));
  }
  b.lastMag = gun.mag;
  if (a.cmd.fire) { // the human wobble in every burst
    a.yaw += (rnd() - 0.5) * 2 * b.aimErr * blindK;
    a.pitch += (rnd() - 0.5) * 1.4 * b.aimErr * blindK;
  }

  // Range discipline: close to the band, back off inside it, strafe in it.
  const band = def.id === 'lance' ? [16, 34] : def.id === 'ar9' ? [9, 24] : def.id === 'vk7' ? [6, 15] : [5, 12];
  if (distT > band[1]) {
    steerTo(a, t.pos.x, t.pos.z, dt, band[1] * 0.8);
  } else if (distT < band[0] * 0.55) {
    // Back away along the line from the enemy through the bot.
    const away = yawTowards(t.pos.x, t.pos.z, a.pos.x, a.pos.z);
    steerTo(a, a.pos.x - Math.sin(away) * 3, a.pos.z - Math.cos(away) * 3, dt, 0.4);
  } else {
    b.strafeT -= dt;
    if (b.strafeT <= 0) { b.strafeT = rr(0.45, 1.05); b.strafeDir = -b.strafeDir; }
    const moving = b.burstLeft <= 0; // strafe between bursts, plant feet during
    a.cmd.s = moving ? b.strafeDir : 0;
    a.cmd.f = 0;
    turnToward(a, wantYaw, dt, 7);
    if (distT > 13 && b.burstLeft > 0 && chance(0.02)) b.crouchT = G.time + 0.9;
    a.cmd.crouch = G.time < (b.crouchT ?? 0);
  }
}

// --- missions ---------------------------------------------------------------------

function mission(a, b) {
  const bomb = G.bomb;
  const planted = bomb.state === 'planted' || bomb.state === 'defusing';
  if (a.team === 'D') {
    if (planted) {
      if (b.state !== 'retake' && b.state !== 'defuse') { b.state = 'retake'; b.goalNode = -1; b.path = []; }
      let nearest = null, nd = Infinity;
      for (const d of G.agents) {
        if (d.team !== 'D' || !d.alive) continue;
        const dd = Math.hypot(d.pos.x - bomb.x, d.pos.z - bomb.z);
        if (dd < nd) { nd = dd; nearest = d; }
      }
      b.defuseRole = nearest === a;
      if (b.defuseRole && siteAt(a.pos.x, a.pos.z)) b.state = 'defuse';
    } else if (b.state === 'retake' || b.state === 'defuse') {
      b.state = 'setup'; b.goalNode = -1; b.path = [];
    } else if (b.state === 'hold' && b.rotator) {
      const it = intel.D;
      if (it.site && it.site !== b.postSite && G.time - it.t < 10) {
        b.postSite = it.site;
        b.postNode = POSTS[it.site][1];
        b.state = 'rotate'; b.goalNode = -1; b.path = [];
      }
    }
  } else {
    if (planted) {
      if (b.state !== 'guard') { b.state = 'guard'; b.goalNode = -1; b.path = []; }
    } else if (bomb.state === 'dropped') {
      let nearest = null, nd = Infinity;
      for (const d of G.agents) {
        if (d.team !== 'A' || !d.alive) continue;
        const dd = Math.hypot(d.pos.x - bomb.x, d.pos.z - bomb.z);
        if (dd < nd) { nd = dd; nearest = d; }
      }
      if (nearest === a && b.state !== 'pickup') { b.state = 'pickup'; b.goalNode = -1; b.path = []; }
      else if (nearest !== a && b.state === 'pickup') b.state = 'push';
    } else if (a.hasBomb) {
      b.state = siteAt(a.pos.x, a.pos.z) ? 'plant' : 'push';
    } else if (b.state === 'pickup' || b.state === 'plant') {
      b.state = 'push';
    }
    // Follow the human's bomb: push the site they are heading for.
    const p = G.player;
    if (p && p.hasBomb && p.alive) {
      const ps = p.pos.z < -4 ? 'A' : p.pos.z > 4 ? 'B' : G.siteTarget;
      if (b.playerSite !== ps && b.state === 'push') {
        b.playerSite = ps;
        setRoute(b, ps, b.routeIdx);
      }
    }
  }
  grenadeScripts(a, b);
}

function grenadeScripts(a, b) {
  const site = G.siteTarget;
  // A Sentinel who hears a push coming smokes the site door, once.
  if (a.team === 'D' && b.state === 'hold' && !b.threwSmoke && a.nades.smoke > 0 &&
      G.time - b.heardT < 0.4 && intel.D.site === b.postSite) {
    const door = NODES[b.postSite === 'A' ? 11 : 17];
    a.nadeSel = 'smoke';
    a.yaw = yawTowards(a.pos.x, a.pos.z, door.x, door.z);
    a.pitch = 0.34;
    if (throwGrenade(a)) b.threwSmoke = true;
  }
  // A Striker flashes the site before entering it, once.
  if (a.team === 'A' && b.state === 'push' && !b.threwFlash && a.nades.flash > 0) {
    const entry = NODES[site === 'A' ? 11 : 17];
    if (Math.hypot(entry.x - a.pos.x, entry.z - a.pos.z) < 4.5) {
      const centre = NODES[site === 'A' ? 35 : 40];
      a.nadeSel = 'flash';
      a.yaw = yawTowards(a.pos.x, a.pos.z, centre.x, centre.z);
      a.pitch = 0.22;
      if (throwGrenade(a)) b.threwFlash = true;
    }
  }
  // A frag for an enemy who just broke line of sight behind cover.
  if (!b.threwFrag && a.nades.frag > 0 && b.target && G.time - b.seenT > 0.9 && G.time - b.seenT < 2.2 && chance(0.5)) {
    a.nadeSel = 'frag';
    a.yaw = yawTowards(a.pos.x, a.pos.z, b.lastSeen.x, b.lastSeen.z);
    a.pitch = 0.3;
    if (throwGrenade(a)) b.threwFrag = true;
  }
}

function act(a, b, dt) {
  const engaging = b.target && G.time - b.seenT < 0.3;
  if (engaging) { combat(a, b, dt); return; }
  // Hunt the last place the enemy was seen, then give up and rejoin the plan.
  if (b.target && G.time - b.seenT < 4.5) {
    if (steerTo(a, b.lastSeen.x, b.lastSeen.z, dt, 1)) {
      turnToward(a, a.yaw + Math.sin(G.time * 1.7 + b.scanPhase) * 0.8, dt, 2.5);
    }
    return;
  }
  b.aimErr = 0.055 * b.skill.err;

  switch (b.state) {
    case 'setup':
    case 'rotate':
      setGoal(a, b, b.postNode);
      if (followPath(a, b, dt)) b.state = 'hold';
      break;
    case 'hold':
      holdPosition(a, b, dt, b.watchYaw);
      break;
    case 'push': {
      if (b.viaNode >= 0) {
        setGoal(a, b, b.viaNode);
        if (followPath(a, b, dt)) b.viaNode = -1;
      } else {
        setGoal(a, b, b.siteGoal);
        followPath(a, b, dt);
      }
      const site = siteAt(a.pos.x, a.pos.z);
      if (site) {
        if (a.hasBomb) b.state = 'plant';
        else { b.state = 'guard'; b.goalNode = -1; b.path = []; }
      }
      break;
    }
    case 'plant': {
      const node = NODES[PLANT_NODE[G.siteTarget]];
      const site = siteAt(a.pos.x, a.pos.z);
      const spot = site ? node : NODES[b.siteGoal];
      if (steerTo(a, spot.x, spot.z, dt, 1.1)) {
        a.cmd.f = 0;
        turnToward(a, Math.PI / 2, dt, 3.5); // watch the western doors
        if (G.time - b.seenT > 1.1 || G.phaseT < 8) a.cmd.use = true;
      }
      break;
    }
    case 'guard': {
      const siteId = G.bomb.site?.id ?? (a.pos.z < 0 ? 'A' : 'B');
      const covers = SITE_COVER[siteId];
      const nodeIdx = covers[Math.abs(a.id) % covers.length];
      setGoal(a, b, nodeIdx);
      // Alternate guards watch the west lanes and the Sentinels' door.
      const watch = a.id % 2 === 0 ? Math.PI / 2 : -Math.PI / 2;
      if (followPath(a, b, dt)) holdPosition(a, b, dt, watch);
      break;
    }
    case 'pickup': {
      const bn = nearestNode(G.bomb.x, G.bomb.z);
      setGoal(a, b, bn);
      if (!followPath(a, b, dt)) break;
      steerTo(a, G.bomb.x, G.bomb.z, dt, 0.6);
      break;
    }
    case 'retake': {
      const siteId = G.bomb.site?.id ?? 'A';
      setGoal(a, b, PLANT_NODE[siteId]);
      followPath(a, b, dt);
      break;
    }
    case 'defuse': {
      if (steerTo(a, G.bomb.x, G.bomb.z, dt, 1.45)) {
        a.cmd.f = 0;
        turnToward(a, Math.PI / 2, dt, 3.5);
        if (G.time - b.seenT > 0.8) a.cmd.use = true;
      }
      break;
    }
    default:
      break;
  }
}

export function updateBot(a, dt) {
  const b = a.brain;
  if (!b) return;
  const cmd = a.cmd;
  cmd.f = 0; cmd.s = 0; cmd.fire = false; cmd.use = false;
  cmd.jump = false; cmd.reload = false; cmd.walk = false; cmd.crouch = false;
  if (!a.alive) return;
  if (G.phase !== 'live' && G.phase !== 'planted') return;
  b.thinkT -= dt;
  if (b.thinkT <= 0) { b.thinkT = 0.12; perceive(a, b); mission(a, b); }
  act(a, b, dt);
  // Stuck against a crate: hop and skip a path node.
  if (a.cmd.f > 0 && a.speedNow < 0.45) {
    b.stuckT += dt;
    if (b.stuckT > 0.8) {
      a.cmd.jump = true;
      if (b.pathI < b.path.length) b.pathI++;
      b.stuckT = 0;
    }
  } else b.stuckT = 0;
}
