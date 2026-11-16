// bomb.js — the objective. One Striker carries the charge; holding E inside
// a site plants it over 3.2 s, after which the Sentinels have 35 s to hold
// E on it for 6 s and defuse, or it levels the site. The device beeps
// faster as the timer runs down. Round wins and losses are rounds.js's
// business; this module only runs the device and reports through the bus.

import { RULES } from './config.js';
import { G, bus } from './state.js';
import { siteAt } from './map.js';
import { explodeAt } from './weapons.js';
import { sfxBeep, sfxPlant } from './audio.js';
import { bombView } from './world.js';

let nextBeep = 0;

export function resetBomb() {
  const b = G.bomb;
  b.state = 'idle'; b.carrier = null; b.site = null;
  b.timer = 0; b.channel = 0; b.channelBy = null;
  if (bombView) bombView.visible = false;
}

export function giveBomb(agent) {
  const b = G.bomb;
  if (b.carrier) b.carrier.hasBomb = false;
  b.carrier = agent;
  agent.hasBomb = true;
  b.state = 'carried';
  b.channel = 0;
}

/** The carrier died (or dropped it): the device lands at their feet. */
export function dropBomb() {
  const b = G.bomb;
  if (!b.carrier) return;
  b.x = b.carrier.pos.x;
  b.z = b.carrier.pos.z;
  b.carrier.hasBomb = false;
  b.carrier = null;
  b.state = 'dropped';
  b.channel = 0;
}

export function updateBomb(dt) {
  const b = G.bomb;
  // Sync the device model with the simulation.
  if (bombView) {
    if (b.state === 'dropped' || b.state === 'planted' || b.state === 'defusing') {
      bombView.visible = true;
      bombView.position.set(b.x, 0, b.z);
    } else if (b.state === 'carried' && b.carrier) {
      bombView.visible = true;
      bombView.position.set(b.carrier.pos.x - 0.2, 0.55, b.carrier.pos.z);
      bombView.rotation.y = b.carrier.yaw;
    } else bombView.visible = false;
  }

  if (b.state === 'dropped' && G.phase === 'live') {
    for (const a of G.agents) {
      if (a.alive && a.team === 'A' && Math.hypot(a.pos.x - b.x, a.pos.z - b.z) < 1.0) {
        giveBomb(a);
        bus.emit('bombPickup', { agent: a });
        break;
      }
    }
    return;
  }

  if (b.state === 'carried' || b.state === 'planting') {
    const c = b.carrier;
    if (!c || !c.alive) return;
    const site = siteAt(c.pos.x, c.pos.z);
    if (c.cmd.use && site && G.phase === 'live') {
      b.state = 'planting';
      b.channel += dt;
      if (b.channel >= RULES.plantTime) {
        b.state = 'planted';
        b.site = site;
        b.x = c.pos.x; b.z = c.pos.z;
        b.timer = RULES.bombTime;
        b.channel = 0;
        c.hasBomb = false;
        b.carrier = null;
        c.money = Math.min(RULES.moneyCap, c.money + RULES.plantReward);
        nextBeep = 0;
        sfxPlant();
        bus.emit('planted', { site, planter: c });
      }
    } else {
      b.state = 'carried';
      b.channel = 0;
    }
    return;
  }

  if (b.state === 'planted' || b.state === 'defusing') {
    b.timer -= dt;
    // Beeps: one a second early, four a second at the end.
    nextBeep -= dt;
    if (nextBeep <= 0) {
      sfxBeep(b.timer < 8);
      nextBeep = Math.max(0.24, b.timer / RULES.bombTime);
    }
    let defuser = null;
    for (const a of G.agents) {
      if (a.alive && a.team === 'D' && a.cmd.use && Math.hypot(a.pos.x - b.x, a.pos.z - b.z) < 1.7) { defuser = a; break; }
    }
    if (defuser) {
      b.state = 'defusing';
      b.channelBy = defuser;
      b.channel += dt;
      if (b.channel >= RULES.defuseTime) {
        b.state = 'done';
        bus.emit('defused', { agent: defuser });
        return;
      }
    } else {
      b.state = 'planted';
      b.channel = 0;
      b.channelBy = null;
    }
    if (b.timer <= 0) {
      b.state = 'done';
      explodeAt(b.site.cx, 1.2, b.site.cz, 13, 140, null, 'bomb');
      bus.emit('exploded', { site: b.site });
    }
  }
}
