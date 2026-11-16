// main.js — boot and the frame loop. The simulation runs on a fixed 60 Hz
// step (rounds.update) no matter the display's refresh rate; rendering —
// actor posing, the camera, effects, the HUD — reads the state that step
// leaves behind. This file also owns the flow around the match: the menu,
// pointer lock, the pause that follows losing it, the buy menu's lock
// dance, and the staged ?shot= scenes the screenshots are taken from.

import { G, bus, makeGun } from './state.js';
import { SITES } from './map.js';
import { RULES } from './config.js';
import { buildWorld, updateWorld, renderer, scene, camera } from './world.js';
import { initFx, updateFx } from './fx.js';
import { createMatch, startMatch, update, cycleSpectate } from './rounds.js';
import { buildActors, syncActors } from './actors.js';
import { initPlayerView, stepPlayer, renderPlayerView } from './player.js';
import { initInput, lockPointer, actions } from './input.js';
import { unlockAudio } from './audio.js';
import * as hud from './hud.js';
import { seedRng } from './rng.js';

const params = new URLSearchParams(location.search);
const shotMode = params.get('shot');
const seed = Number(params.get('seed') ?? 7) || 7;

const container = document.getElementById('game');
buildWorld(container);
initFx(scene);
createMatch(seed);
buildActors();
initPlayerView();

let matchStarted = false;
let intentionalUnlock = false;
const canvas = renderer.domElement;

function engageLock() {
  if (shotMode || !matchStarted) return;
  intentionalUnlock = false;
  lockPointer(canvas);
}
function releaseLock() {
  intentionalUnlock = true;
  if (document.pointerLockElement) document.exitPointerLock();
}

initInput(canvas, {
  onLockChange(locked) {
    if (locked) { hud.hidePause(); G.paused = false; return; }
    if (!matchStarted || intentionalUnlock || shotMode) return;
    if (['buy', 'live', 'planted'].includes(G.phase)) {
      G.paused = true;
      hud.showPause();
    }
  },
});

hud.initHud({
  onPlay() {
    unlockAudio();
    hud.hideMenu();
    if (!matchStarted) { matchStarted = true; startMatch(); }
    hud.setBuyOpen(true);
    releaseLock(); // the buy menu needs a cursor; Deploy ends in the menu, not the lock
  },
  onResume() { hud.hidePause(); G.paused = false; engageLock(); },
  onQuit() {
    hud.hidePause();
    G.paused = false;
    matchStarted = false;
    G.phase = 'menu';
    hud.setBuyOpen(false);
    hud.showMenu();
  },
  onAgain() {
    hud.hideEnd();
    startMatch();
    hud.setBuyOpen(true);
    releaseLock();
  },
});

bus.on('roundStart', () => {
  if (!matchStarted || shotMode) return;
  hud.setBuyOpen(true);
  releaseLock();
});
bus.on('live', () => { hud.setBuyOpen(false); engageLock(); });
bus.on('buyClosed', () => engageLock());
bus.on('matchEnd', () => releaseLock());

canvas.addEventListener('mousedown', () => {
  if (matchStarted && G.player && !G.player.alive && (G.phase === 'live' || G.phase === 'planted')) cycleSpectate();
});

// --- staged scenes for the screenshots (?shot=cover|buy|plant|score) --------
// Each is the real game, arranged: the simulation runs, the bots play, the
// camera is the player's own. Nothing here draws anything the game cannot.
function stageShot(kind) {
  matchStarted = true;
  startMatch();
  const p = G.player;
  const give = (a, hp) => { if (hp) a.hp = hp; };
  if (kind === 'buy') {
    G.phaseT = RULES.buyTime;
    hud.setBuyOpen(true);
    return;
  }
  hud.setBuyOpen(false);
  if (kind === 'cover') {
    G.round = 5; G.scoreA = 3; G.scoreD = 2;
    p.money = 2350; p.vest = true; p.helmet = true; p.armor = 100;
    p.loadout.primary = 'ar9'; p.guns.ar9 = makeGun('ar9'); p.guns.ar9.mag = 24; p.current = 'ar9';
    p.pos = { x: 9.5, y: 0, z: 0.3 }; p.yaw = -Math.PI / 2 + 0.05; p.hp = 100;
    const foes = G.agents.filter((a) => a.team === 'D');
    foes[0].pos = { x: 22, y: 0, z: -1.2 }; foes[0].yaw = Math.PI / 2; foes[0].vest = true;
    foes[1].pos = { x: 27, y: 0, z: 5 }; foes[1].yaw = Math.PI / 2;
    const mates = G.agents.filter((a) => a.team === 'A' && !a.isPlayer);
    mates[0].pos = { x: 2.5, y: 0, z: -2.6 }; mates[0].yaw = -Math.PI / 2;
    mates[1].pos = { x: -3, y: 0, z: 4.5 }; mates[1].yaw = -Math.PI / 2;
    G.phase = 'live'; G.phaseT = 63;
  } else if (kind === 'plant') {
    G.round = 10; G.scoreA = 5; G.scoreD = 4;
    p.money = 3100; p.vest = true; p.helmet = true; p.armor = 100;
    p.loadout.primary = 'ar9'; p.guns.ar9 = makeGun('ar9'); p.guns.ar9.mag = 17; p.current = 'ar9';
    p.pos = { x: 20.5, y: 0, z: -10.5 }; p.yaw = -0.73; p.hp = 64; p.crouch = true;
    const b = G.bomb;
    b.state = 'planted'; b.site = SITES.A; b.x = 23.2; b.z = -13.2; b.timer = 17.5;
    bus.emit('planted', { site: SITES.A, planter: p });
    const foes = G.agents.filter((a) => a.team === 'D');
    foes[0].pos = { x: 25.5, y: 0, z: -8.5 }; foes[0].yaw = 1.19;
    foes[1].pos = { x: 22.5, y: 0, z: -3.6 }; foes[1].yaw = Math.PI * 0.8;
    give(foes[2], 55);
    const mates = G.agents.filter((a) => a.team === 'A' && !a.isPlayer);
    mates[0].pos = { x: 21, y: 0, z: -17.5 }; mates[0].yaw = -Math.PI / 2;
    G.phase = 'planted'; G.phaseT = 17.5;
  } else if (kind === 'score') {
    G.round = 12; G.scoreA = 7; G.scoreD = 5;
    p.stats = { kills: 14, deaths: 6, shots: 212, hits: 97, headshots: 5 };
    const lines = [[11, 8], [9, 9], [7, 10], [13, 7], [10, 9], [6, 11], [5, 12]];
    G.agents.filter((a) => !a.isPlayer).forEach((a, i) => {
      a.stats.kills = lines[i][0]; a.stats.deaths = lines[i][1];
    });
    G.phase = 'matchover';
    bus.emit('matchEnd', { winner: 'A' });
  }
}

let simHeld = false;
if (shotMode) {
  hud.hideMenu();
  stageShot(shotMode);
  // The staged scene renders frozen until the screenshot script releases
  // it, so the shot catches the moment it intends, not whenever the page
  // happened to finish loading.
  simHeld = true;
  window.__startSim = () => { simHeld = false; };
  window.__holdSim = () => { simHeld = true; };
} else {
  hud.showMenu();
}

// --- the loop -------------------------------------------------------------------

const STEP = 1 / 60;
let last = performance.now(), acc = 0;

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  dt = Math.min(dt, 0.25); // slow displays still track real time; the step stays fixed
  const running = matchStarted && !G.paused && !simHeld && G.phase !== 'menu';
  if (running) {
    acc += dt;
    while (acc >= STEP) {
      acc -= STEP;
      if (!shotMode) stepPlayer(STEP);
      update(STEP);
    }
    // The buy toggle and the scoreboard live outside the fixed step.
    if (!shotMode) {
      if (actions.buyToggle) {
        actions.buyToggle = false;
        if (G.phase === 'buy') {
          if (hud.buyIsOpen()) hud.setBuyOpen(false, true);
          else { hud.setBuyOpen(true); releaseLock(); }
        }
      }
      hud.setScoresVisible(actions.scores && (G.phase === 'live' || G.phase === 'planted' || G.phase === 'over'));
    }
  }
  syncActors(dt);
  renderPlayerView(dt);
  updateFx(dt);
  updateWorld(G.time);
  hud.updateHud();
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);
