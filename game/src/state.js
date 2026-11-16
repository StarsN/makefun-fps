// state.js — the whole match in one object, plus the event bus the view
// layer listens to. Simulation modules write here; rendering and HUD only
// read. Nothing else in the game keeps a second copy of match state.

import { WEAPONS } from './config.js';

const listeners = new Map();

export const bus = {
  on(evt, fn) {
    if (!listeners.has(evt)) listeners.set(evt, []);
    listeners.get(evt).push(fn);
  },
  emit(evt, data) {
    const fns = listeners.get(evt);
    if (fns) for (const fn of fns) fn(data);
  },
};

export const G = {
  phase: 'menu', // menu | buy | live | planted | over | matchover
  paused: false,
  buyOpen: false,
  time: 0, // simulation clock, seconds since match start
  phaseT: 0, // seconds left in the current phase
  round: 0,
  scoreA: 0,
  scoreD: 0,
  lossStreakA: 0,
  lossStreakD: 0,
  agents: [],
  player: null,
  spectate: null, // agent a dead player is watching
  projectiles: [], // grenades in flight
  smokes: [], // active smoke clouds { x, z, r, until }
  barrels: [], // explosive barrels { x, z, hp, alive, mesh }
  noise: [], // recent gunfire { x, z, t, team } — bots hear it, the minimap shows it
  bomb: {
    state: 'idle', // idle | carried | dropped | planting | planted | defusing | done
    carrier: null,
    x: 0, z: 0, site: null,
    timer: 0,
    channel: 0, // plant/defuse progress, seconds
    channelBy: null,
  },
  winner: null, // 'A' | 'D' for the round, then the match
  winReason: '',
  siteTarget: 'A', // the site the Striker bots commit to this round
  stats: { shots: 0, hits: 0 }, // the player's accuracy line, match-wide
};

/** A fresh gun instance: rounds in the magazine, in reserve, and its bloom. */
export function makeGun(id) {
  const def = WEAPONS[id];
  return { id, mag: def.mag, reserve: def.reserve, bloom: 0, nextOk: 0, reloading: 0, drawUntil: 0 };
}

/**
 * One combatant. The player and every bot share this shape and the same
 * movement and weapon code; only the source of `cmd` differs — the keyboard
 * for the player, the brain in bots.js for the rest.
 */
export function makeAgent(id, team, name, isPlayer) {
  return {
    id, team, name, isPlayer,
    pos: { x: 0, y: 0, z: 0 },
    vel: { x: 0, y: 0, z: 0 },
    yaw: 0, pitch: 0,
    onGround: true, crouch: false, walk: false,
    speedNow: 0,
    hp: 100, alive: true,
    vest: false, helmet: false, armor: 0, // armor points mirror vest state for the HUD
    money: 0,
    loadout: { primary: null, sidearm: 'p9' },
    guns: { p9: makeGun('p9') },
    current: 'p9',
    nades: { frag: 0, flash: 0, smoke: 0 },
    nadeSel: 'frag',
    hasBomb: false,
    cmd: { f: 0, s: 0, jump: false, crouch: false, walk: false, fire: false, reload: false, use: false, yaw: 0, pitch: 0 },
    stats: { kills: 0, deaths: 0, shots: 0, hits: 0, headshots: 0 },
    // perception and damage memory
    lastHitBy: null, lastHitT: -9, lastHitDir: 0,
    blind: 0, blindDir: 1, // flashbang strength 0..1, decays over time
    firedT: -9, // last time this agent fired (noise)
    // bot brain (bots.js owns these fields)
    brain: null,
    // view layer (world.js / bots view sync owns these)
    mesh: null, parts: null, flashT: 0, deathT: 0, scoped: false,
  };
}

/** The gun an agent is holding right now. */
export const gunOf = (a) => a.guns[a.current];
/** The definition of the gun an agent is holding. */
export const defOf = (a) => WEAPONS[a.current];
