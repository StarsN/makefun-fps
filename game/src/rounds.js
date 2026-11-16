// rounds.js — the match itself: who plays, where they spawn, the phase
// clock (buy → live → planted → over), the money that flows after each
// round, and every win condition. It owns the order of a simulation step:
// bots think, every agent moves and shoots, then the bomb and grenades run.

import { G, bus, makeAgent, makeGun } from './state.js';
import { RULES } from './config.js';
import { SPAWNS, BARRELS } from './map.js';
import { makeBrain, planRound, botBuy, updateBot } from './bots.js';
import { resetBomb, giveBomb, dropBomb, updateBomb } from './bomb.js';
import { updateWeapon, updateProjectiles } from './weapons.js';
import { moveAgent } from './physics.js';
import { barrelViews } from './world.js';
import { buyWeapon, buyGear, buyNade, refillAmmo } from './shop.js';
import { seedRng, pick, rnd } from './rng.js';
import { sfxRoundEnd, sfxClick, sfxError } from './audio.js';

const BOT_NAMES = { A: ['Vex', 'Onyx', 'Rook'], D: ['Havoc', 'Bishop', 'Sable', 'Grimm'] };
let pendingEnd = null;

export function createMatch(seed) {
  seedRng(seed);
  G.agents = [];
  const player = makeAgent(0, 'A', 'You', true);
  G.agents.push(player);
  G.player = player;
  let id = 1;
  for (const name of BOT_NAMES.A) { const a = makeAgent(id++, 'A', name, false); makeBrain(a); G.agents.push(a); }
  for (const name of BOT_NAMES.D) { const a = makeAgent(id++, 'D', name, false); makeBrain(a); G.agents.push(a); }
  G.barrels = BARRELS.map((b, i) => ({ x: b.x, z: b.z, hp: 25, alive: true, boomT: 0, lastHitBy: null, mesh: barrelViews[i] }));

  bus.on('kill', ({ victim }) => {
    if (victim.hasBomb) dropBomb();
    if (victim.isPlayer) pickSpectate();
  });
  bus.on('planted', () => { G.phase = 'planted'; });
  bus.on('defused', () => { pendingEnd = { winner: 'D', reason: 'defused' }; });
  bus.on('exploded', () => { pendingEnd = { winner: 'A', reason: 'bomb' }; });
}

function pickSpectate() {
  const mates = G.agents.filter((a) => a.team === 'A' && !a.isPlayer && a.alive);
  G.spectate = mates[0] ?? null;
}

export function cycleSpectate() {
  const mates = G.agents.filter((a) => a.team === 'A' && !a.isPlayer && a.alive);
  if (!mates.length) { G.spectate = null; return; }
  const i = mates.indexOf(G.spectate);
  G.spectate = mates[(i + 1) % mates.length];
}

export function startMatch() {
  G.scoreA = 0; G.scoreD = 0;
  G.lossStreakA = 0; G.lossStreakD = 0;
  G.round = 0;
  for (const a of G.agents) {
    a.money = RULES.startMoney;
    a.loadout = { primary: null, sidearm: 'p9' };
    a.guns = { p9: makeGun('p9') };
    a.current = 'p9';
    a.vest = false; a.helmet = false; a.armor = 0;
    a.nades = { frag: 0, flash: 0, smoke: 0 };
    a.stats = { kills: 0, deaths: 0, shots: 0, hits: 0, headshots: 0 };
  }
  nextRound();
}

function nextRound() {
  G.round++;
  G.phase = 'buy';
  G.phaseT = RULES.buyTime;
  G.buyOpen = true;
  pendingEnd = null;
  G.noise.length = 0;
  for (const p of G.projectiles) p.mesh.removeFromParent();
  G.projectiles = [];
  G.smokes = [];
  G.spectate = null;

  // Spawn: shuffled slots so nobody owns a corner of the yard.
  for (const team of ['A', 'D']) {
    const mates = G.agents.filter((a) => a.team === team);
    const slots = [...SPAWNS[team]];
    for (let i = slots.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [slots[i], slots[j]] = [slots[j], slots[i]]; }
    mates.forEach((a, i) => {
      const s = slots[i % slots.length];
      a.pos = { x: s.x, y: 0, z: s.z };
      a.vel = { x: 0, y: 0, z: 0 };
      a.yaw = s.yaw; a.pitch = 0; a.recoil = 0;
      a.hp = 100; a.alive = true; a.crouch = false; a.blind = 0; a.scoped = false;
      a.deathT = 0; a.lastHitBy = null;
      const gun = a.guns[a.current];
      if (gun) { gun.reloading = 0; gun.bloom = 0; gun.nextOk = 0; gun.drawUntil = 0; }
      if (a.mesh) { a.mesh.rotation.set(0, a.yaw, 0); a.mesh.visible = true; }
    });
  }
  for (const b of G.barrels) { b.alive = true; b.hp = 25; b.boomT = 0; if (b.mesh) b.mesh.visible = true; }

  resetBomb();
  const attackers = G.agents.filter((a) => a.team === 'A');
  const carrier = rnd() < 0.3 ? G.player : pick(attackers);
  giveBomb(carrier);
  planRound();
  for (const a of G.agents) if (!a.isPlayer) botBuy(a);
  bus.emit('roundStart', { round: G.round });
}

function endRound(winner, reason) {
  if (winner === 'A') { G.scoreA++; G.lossStreakA = 0; G.lossStreakD++; }
  else { G.scoreD++; G.lossStreakD = 0; G.lossStreakA++; }
  const winPay = reason === 'bomb' ? RULES.winBomb : reason === 'defused' ? RULES.winDefuse : reason === 'time' ? RULES.winTime : RULES.winElim;
  const loser = winner === 'A' ? 'D' : 'A';
  const streak = loser === 'A' ? G.lossStreakA : G.lossStreakD;
  const lossPay = Math.min(RULES.lossMax, RULES.lossBase + RULES.lossStep * (streak - 1));
  for (const a of G.agents) {
    a.money = Math.min(RULES.moneyCap, a.money + (a.team === winner ? winPay : lossPay));
    // The dead leave their primary on the ground.
    if (!a.alive && a.loadout.primary) {
      delete a.guns[a.loadout.primary];
      a.loadout.primary = null;
      a.current = 'p9';
    }
  }
  G.winner = winner;
  G.winReason = reason;
  G.phase = 'over';
  G.phaseT = RULES.endTime;
  G.buyOpen = false;
  sfxRoundEnd(winner === 'A');
  bus.emit('roundEnd', { winner, reason });
}

const aliveCount = (team) => G.agents.filter((a) => a.team === team && a.alive).length;

function stepAgent(a, dt) {
  a.crouch = a.cmd.crouch;
  a.walk = a.cmd.walk;
  moveAgent(a, dt);
  updateWeapon(a, dt);
}

/** The player's buy-menu purchase, from hud.js. */
export function playerBuy(kind, id) {
  const p = G.player;
  if (G.phase !== 'buy') return false;
  let ok = false;
  if (kind === 'weapon') ok = buyWeapon(p, id);
  else if (kind === 'gear') ok = buyGear(p, id);
  else if (kind === 'nade') ok = buyNade(p, id);
  else if (kind === 'ammo') ok = refillAmmo(p);
  if (ok) { sfxClick(); bus.emit('bought', {}); } else sfxError();
  return ok;
}

/** One fixed simulation step. The player's cmd is filled by player.js first. */
export function update(dt) {
  G.time += dt;
  for (const a of G.agents) a.blind = Math.max(0, a.blind - dt * 0.38);
  while (G.noise.length && G.time - G.noise[0].t > 2.5) G.noise.shift();

  if (G.phase === 'buy') {
    G.phaseT -= dt;
    if (G.phaseT <= 0) {
      G.phase = 'live';
      G.phaseT = RULES.roundTime;
      G.buyOpen = false;
      bus.emit('live', {});
    }
    return;
  }
  if (G.phase === 'over') {
    G.phaseT -= dt;
    if (G.phaseT <= 0) {
      const decided = G.scoreA >= RULES.roundsToWin || G.scoreD >= RULES.roundsToWin || G.round >= RULES.maxRounds;
      if (decided) {
        G.phase = 'matchover';
        G.winner = G.scoreA === G.scoreD ? 'draw' : G.scoreA > G.scoreD ? 'A' : 'D';
        bus.emit('matchEnd', { winner: G.winner });
      } else nextRound();
    }
    return;
  }
  if (G.phase !== 'live' && G.phase !== 'planted') return;

  G.phaseT -= dt;
  for (const a of G.agents) if (!a.isPlayer) updateBot(a, dt);
  for (const a of G.agents) if (a.alive) stepAgent(a, dt);
  updateBomb(dt);
  updateProjectiles(dt);
  if (G.phase === 'planted') G.phaseT = Math.max(0, G.bomb.timer);

  if (!pendingEnd) {
    if (aliveCount('D') === 0) pendingEnd = { winner: 'A', reason: 'elimination' };
    // With the charge planted, wiping the Strikers is not enough: the
    // Sentinels still have to defuse it, so their elimination only counts
    // before the plant.
    else if (aliveCount('A') === 0 && G.phase === 'live') pendingEnd = { winner: 'D', reason: 'elimination' };
    else if (G.phase === 'live' && G.phaseT <= 0) pendingEnd = { winner: 'D', reason: 'time' };
  }
  if (pendingEnd && G.phase !== 'over') {
    const { winner, reason } = pendingEnd;
    pendingEnd = null;
    endRound(winner, reason);
  }
}
