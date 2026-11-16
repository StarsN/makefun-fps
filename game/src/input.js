// input.js — keyboard and mouse for the one human player: raw key state,
// pointer-lock mouse look, and the one-shot action flags (throw, plant,
// interact) the simulation consumes each step. Menus and buttons live in
// hud.js; this module only knows about playing the game.

export const keys = new Set();
export const mouse = { dx: 0, dy: 0, down: false, rdown: false };
export const actions = { throwNade: false, cycleNade: false, buyToggle: false, scores: false };

let locked = false;
export const isLocked = () => locked;

export function initInput(canvas, { onLockChange } = {}) {
  addEventListener('keydown', (e) => {
    if (e.code === 'Tab') { e.preventDefault(); actions.scores = true; }
    if (['Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyR', 'KeyB', 'KeyE', 'KeyG'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    keys.add(e.code);
    if (e.code === 'KeyG') actions.throwNade = true;
    if (e.code === 'Digit4') actions.cycleNade = true;
    if (e.code === 'KeyB') actions.buyToggle = true;
  });
  addEventListener('keyup', (e) => {
    keys.delete(e.code);
    if (e.code === 'Tab') actions.scores = false;
  });
  addEventListener('blur', () => keys.clear());

  canvas.addEventListener('mousedown', (e) => {
    if (!locked) return;
    if (e.button === 0) mouse.down = true;
    if (e.button === 2) mouse.rdown = true;
  });
  addEventListener('mouseup', (e) => {
    if (e.button === 0) mouse.down = false;
    if (e.button === 2) mouse.rdown = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  addEventListener('mousemove', (e) => {
    if (!locked) return;
    mouse.dx += e.movementX || 0;
    mouse.dy += e.movementY || 0;
  });
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
    if (!locked) { mouse.down = false; mouse.rdown = false; keys.clear(); }
    if (onLockChange) onLockChange(locked);
  });
}

export function lockPointer(canvas) {
  try {
    const p = canvas.requestPointerLock?.();
    if (p && p.catch) p.catch(() => {}); // Chrome rate-limits re-locks; a miss is not an error
  } catch { /* the next user click will lock instead */ }
}

/** Fill the player's cmd from the keyboard and the accumulated mouse delta. */
export function readPlayerCmd(player, dt) {
  const cmd = player.cmd;
  cmd.f = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
  cmd.s = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
  cmd.jump = keys.has('Space');
  cmd.crouch = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
  cmd.walk = keys.has('ShiftLeft') || keys.has('ShiftRight');
  cmd.fire = mouse.down;
  cmd.reload = keys.has('KeyR');
  cmd.use = keys.has('KeyE');
  // Mouse look: sensitivity scaled so a full desk swipe is about a 240° turn.
  const sens = player.scoped ? 0.0011 : 0.0023;
  player.yaw -= mouse.dx * sens;
  player.pitch -= mouse.dy * sens;
  const lim = Math.PI / 2 - 0.01;
  player.pitch = Math.max(-lim, Math.min(lim, player.pitch));
  mouse.dx = 0; mouse.dy = 0;
  cmd.yaw = player.yaw;
  cmd.pitch = player.pitch;
}
