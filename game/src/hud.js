// hud.js — everything drawn in the DOM: vitals, ammo and money, the round
// clock, killfeed, hit markers, damage direction, banners, the plant/defuse
// bar, the buy menu, the scoreboard, the end screen and the minimap. It
// reads state.js and writes elements; the only calls back into the game are
// the buy and button callbacks handed to initHud.

import { G, bus, defOf } from './state.js';
import { WEAPONS, NADES, GEAR, BUY_MENU, RULES, BODY } from './config.js';
import { BOXES, SITES } from './map.js';
import { yawDelta, yawTowards } from './physics.js';
import { playerBuy } from './rounds.js';
import { canBuy, priceOf } from './shop.js';

const $ = (id) => document.getElementById(id);
const els = {};
let cb = {};
let feedItems = [];
let bannerUntil = 0, toastUntil = 0, hitmarkUntil = 0, hurtPulse = 0, sbT = 0;

const fmtTime = (t) => {
  t = Math.max(0, Math.ceil(t));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};
const teamCls = (team) => (team === 'A' ? 't-a' : 't-d');
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function banner(big, sub = '', cls = '') {
  els.banner.className = cls;
  els.banner.querySelector('.big').textContent = big;
  els.banner.querySelector('.sub').textContent = sub;
  els.banner.classList.add('on');
  bannerUntil = performance.now() + 2600;
}

export function toast(msg, ms = 3400) {
  els.toast.textContent = msg;
  els.toast.classList.add('on');
  toastUntil = performance.now() + ms;
}

export function initHud(callbacks) {
  cb = callbacks;
  for (const id of ['hud', 'minimap', 'score-a', 'score-d', 'timer', 'round-label', 'bomb-state',
    'killfeed', 'gear', 'hp-fill', 'hp-num', 'armor-fill', 'armor-num', 'money', 'ammo-mag',
    'ammo-reserve', 'weapon-name', 'nades', 'crosshair', 'hitmarker', 'hitdir', 'banner',
    'progress', 'progress-label', 'progress-fill', 'toast', 'spectate', 'spectate-name',
    'vignette', 'scope', 'flashfx', 'menu', 'buy', 'buy-grid', 'buy-money', 'buy-timer',
    'pause', 'scoreboard', 'sb-title', 'sb-body', 'end', 'end-title', 'end-copy', 'end-stats']) {
    els[id] = $(id);
  }
  $('btn-play').addEventListener('click', () => cb.onPlay?.());
  $('btn-resume').addEventListener('click', () => cb.onResume?.());
  $('btn-quit').addEventListener('click', () => cb.onQuit?.());
  $('btn-again').addEventListener('click', () => cb.onAgain?.());
  $('btn-close-buy').addEventListener('click', () => setBuyOpen(false, true));
  buildBuyGrid();
  addEventListener('keydown', (e) => {
    if (els.buy.hidden) return;
    const item = BUY_MENU.find(([key]) => `Digit${key}` === e.code);
    if (item) { playerBuy(item[1], item[2]); refreshBuy(); }
  });

  bus.on('kill', ({ victim, attacker, cause, headshot }) => {
    const aName = attacker ? `<b class="${teamCls(attacker.team)}">${esc(attacker.name)}</b>` : '<b>—</b>';
    const wName = WEAPONS[cause]?.name ?? (cause === 'frag' ? 'Frag' : cause === 'barrel' ? 'Barrel' : cause === 'bomb' ? 'Charge' : cause);
    const el = document.createElement('div');
    el.className = 'kf';
    el.innerHTML = `${aName}<span class="wpn">${esc(wName)}${headshot ? ' <span class="hs">◎ head</span>' : ''}</span><b class="${teamCls(victim.team)}">${esc(victim.name)}</b>`;
    els.killfeed.prepend(el);
    feedItems.push({ el, until: performance.now() + 5200 });
    while (feedItems.length > 5) { const old = feedItems.shift(); old.el.remove(); }
    if (attacker?.isPlayer) {
      els.hitmarker.className = 'kill';
      hitmarkUntil = performance.now() + 130;
    }
  });
  bus.on('playerHit', ({ part }) => {
    els.hitmarker.className = part === 'head' ? 'head' : '';
    hitmarkUntil = performance.now() + 95;
  });
  bus.on('playerHurt', () => { hurtPulse = 1; });
  bus.on('roundStart', ({ round }) => {
    banner(`Round ${round}`, G.player.hasBomb ? 'You carry the charge — plant it at A or B' : 'Plant the charge, or eliminate the Sentinels', '');
    if (G.player.hasBomb) toast('You have the charge. Hold E inside site A or B to plant.');
    if (round === 1) setTimeout(() => toast('Buy phase: press B to open the buy menu.'), 2900);
    refreshBuy();
  });
  bus.on('planted', ({ site }) => {
    banner('Charge planted', `Site ${site.id} — defend it`, 'win');
    els['bomb-state'].classList.add('on');
  });
  bus.on('roundEnd', ({ winner, reason }) => {
    els['bomb-state'].classList.remove('on');
    const reasons = {
      elimination: winner === 'A' ? 'Sentinels eliminated' : 'Strikers eliminated',
      bomb: 'The charge detonated',
      defused: 'The charge was defused',
      time: 'The clock ran out',
    };
    banner(winner === 'A' ? 'Round won' : 'Round lost', reasons[reason] ?? '', winner === 'A' ? 'win' : 'lose');
    setBuyOpen(false);
  });
  bus.on('bombPickup', ({ agent }) => { if (agent.isPlayer) toast('Charge picked up — plant it at A or B.'); });
  bus.on('bought', () => refreshBuy());
  bus.on('matchEnd', ({ winner }) => showEnd(winner));
}

// --- buy menu ---------------------------------------------------------------

function itemDesc(kind, id) {
  if (kind === 'weapon') { const w = WEAPONS[id]; return `${w.damage} dmg · ${w.mag} rounds · ${w.auto ? 'automatic' : 'bolt action'}`; }
  if (kind === 'gear') return GEAR[id].desc;
  if (kind === 'nade') return NADES[id].desc;
  return 'Refill every reserve magazine to full.';
}
function itemName(kind, id) {
  if (kind === 'weapon') return WEAPONS[id].name;
  if (kind === 'gear') return GEAR[id].name;
  if (kind === 'nade') return NADES[id].name;
  return 'Reserve ammo';
}

function buildBuyGrid() {
  els['buy-grid'].innerHTML = '';
  for (const [key, kind, id] of BUY_MENU) {
    const btn = document.createElement('button');
    btn.className = 'buy-item';
    btn.dataset.kind = kind;
    btn.dataset.id = id;
    btn.innerHTML = `<span class="pr">$${priceOf(kind, id)}</span><span class="nm"><span class="key">${key}</span>${itemName(kind, id)}</span><span class="ds">${itemDesc(kind, id)}</span>`;
    btn.addEventListener('click', () => { playerBuy(kind, id); refreshBuy(); });
    els['buy-grid'].appendChild(btn);
  }
}

export function refreshBuy() {
  const p = G.player;
  if (!p) return;
  els['buy-money'].textContent = `$${p.money}`;
  for (const btn of els['buy-grid'].children) {
    const { kind, id } = btn.dataset;
    const owned = (kind === 'weapon' && p.loadout[WEAPONS[id].slot] === id) ||
      (kind === 'gear' && ((id === 'vest' && p.vest) || (id === 'fullkit' && p.vest && p.helmet))) ||
      (kind === 'nade' && p.nades[id] >= (id === 'flash' ? 2 : 1));
    btn.classList.toggle('owned', owned);
    btn.disabled = !canBuy(p, kind, id);
    btn.querySelector('.pr').textContent = owned ? 'OWNED' : `$${priceOf(kind, id)}`;
  }
}

export function setBuyOpen(open, byUser = false) {
  if (open && G.phase !== 'buy') open = false;
  G.buyOpen = open;
  els.buy.hidden = !open;
  if (open) refreshBuy();
  if (byUser) bus.emit('buyClosed', {});
}
export const buyIsOpen = () => !els.buy.hidden;

// --- overlays -----------------------------------------------------------------

export function showMenu() { els.menu.hidden = false; els.hud.classList.remove('on'); }
export function hideMenu() { els.menu.hidden = true; els.hud.classList.add('on'); }
export function showPause() { els.pause.hidden = false; }
export function hidePause() { els.pause.hidden = true; }

function statsTable(agents) {
  const rows = [...agents].sort((x, y) => y.stats.kills - x.stats.kills || x.stats.deaths - y.stats.deaths)
    .map((a) => `<tr class="${a.isPlayer ? 'me' : ''} ${a.alive ? '' : 'dead'}"><td class="${teamCls(a.team)}">${esc(a.name)}</td><td>${a.stats.kills}</td><td>${a.stats.deaths}</td><td>$${a.money}</td></tr>`)
    .join('');
  return `<table class="sb"><tr><th>Player</th><th>Kills</th><th>Deaths</th><th>Money</th></tr>${rows}</table>`;
}

export function setScoresVisible(v) {
  els.scoreboard.hidden = !v;
  if (v && performance.now() - sbT > 200) {
    sbT = performance.now();
    els['sb-title'].textContent = `Strikers ${G.scoreA} — ${G.scoreD} Sentinels · Round ${G.round}`;
    els['sb-body'].innerHTML = statsTable(G.agents);
  }
}

function showEnd(winner) {
  setBuyOpen(false);
  els.end.hidden = false;
  const p = G.player;
  els['end-title'].textContent = winner === 'A' ? 'Victory — the foundry is yours' : winner === 'D' ? 'Defeat — the Sentinels hold' : 'Drawn match';
  const acc = p.stats.shots ? Math.round((p.stats.hits / p.stats.shots) * 100) : 0;
  els['end-copy'].textContent = `Final score ${G.scoreA} — ${G.scoreD}. You: ${p.stats.kills} kills, ${p.stats.deaths} deaths, ${p.stats.headshots} headshots, ${acc}% accuracy.`;
  els['end-stats'].innerHTML = statsTable(G.agents);
}
export function hideEnd() { els.end.hidden = true; }

// --- per-frame ----------------------------------------------------------------

function drawMinimap() {
  const cv = els.minimap;
  const g = cv.getContext('2d');
  const X = (x) => ((x + 33) / 66) * cv.width;
  const Z = (z) => ((z + 25) / 50) * cv.height;
  g.clearRect(0, 0, cv.width, cv.height);
  g.fillStyle = 'rgba(24,28,32,0.9)';
  g.fillRect(0, 0, cv.width, cv.height);
  for (const s of [SITES.A, SITES.B]) {
    g.strokeStyle = s.id === 'A' ? '#f5a524' : '#39c2b0';
    g.lineWidth = 2;
    g.strokeRect(X(s.x0), Z(s.z0), X(s.x1) - X(s.x0), Z(s.z1) - Z(s.z0));
    g.fillStyle = g.strokeStyle;
    g.font = '700 15px ui-monospace, monospace';
    g.fillText(s.id, X(s.cx) - 5, Z(s.cz) + 5);
  }
  g.fillStyle = '#454e55';
  for (const b of BOXES) {
    if (b.y > 0) continue;
    g.fillRect(X(b.x - b.w / 2), Z(b.z - b.d / 2), Math.max(2, X(b.x + b.w / 2) - X(b.x - b.w / 2)), Math.max(2, Z(b.z + b.d / 2) - Z(b.z - b.d / 2)));
  }
  // The charge: carried shows nothing, dropped blinks amber, planted pulses red.
  const bomb = G.bomb;
  if (bomb.state === 'dropped' || bomb.state === 'planted' || bomb.state === 'defusing') {
    g.fillStyle = bomb.state === 'dropped' ? '#f5a524' : (Math.sin(G.time * 6) > 0 ? '#e5484d' : '#7a1d20');
    g.save();
    g.translate(X(bomb.x), Z(bomb.z));
    g.rotate(Math.PI / 4);
    g.fillRect(-4, -4, 8, 8);
    g.restore();
  }
  for (const a of G.agents) {
    if (!a.alive || a.isPlayer) continue;
    if (a.team === 'A') {
      g.fillStyle = '#f5a524';
      g.beginPath(); g.arc(X(a.pos.x), Z(a.pos.z), 4, 0, 7); g.fill();
    } else if (G.time - a.firedT < 2) {
      // Sentinels show only while their gunfire is fresh.
      g.fillStyle = '#39c2b0';
      g.beginPath(); g.arc(X(a.pos.x), Z(a.pos.z), 4, 0, 7); g.fill();
    }
  }
  const p = G.player;
  if (p && p.alive) {
    g.save();
    g.translate(X(p.pos.x), Z(p.pos.z));
    g.rotate(-p.yaw);
    g.fillStyle = '#ece7db';
    g.beginPath();
    g.moveTo(0, -7); g.lineTo(4.6, 5); g.lineTo(-4.6, 5);
    g.closePath(); g.fill();
    g.restore();
  }
}

export function updateHud() {
  const p = G.player;
  if (!p) return;
  const now = performance.now();
  // Feed expiry.
  for (let i = feedItems.length - 1; i >= 0; i--) {
    if (now > feedItems[i].until) { feedItems[i].el.remove(); feedItems.splice(i, 1); }
  }
  if (now > bannerUntil) els.banner.classList.remove('on');
  if (now > toastUntil) els.toast.classList.remove('on');
  els.hitmarker.style.opacity = now < hitmarkUntil ? 1 : 0;

  // Clock and score.
  els['score-a'].textContent = G.scoreA;
  els['score-d'].textContent = G.scoreD;
  els['round-label'].textContent = G.phase === 'buy' ? `Round ${G.round} · Buy` : `Round ${G.round} of ${RULES.maxRounds}`;
  const t = G.phase === 'planted' ? G.bomb.timer : G.phaseT;
  els.timer.textContent = fmtTime(t);
  els.timer.classList.toggle('low', t < 11 && (G.phase === 'live' || G.phase === 'planted'));
  if (!els.buy.hidden) els['buy-timer'].textContent = `${Math.max(0, Math.ceil(G.phaseT))}s`;

  // Vitals.
  const hp = Math.max(0, Math.round(p.hp));
  els['hp-num'].textContent = hp;
  els['hp-fill'].style.width = `${hp}%`;
  els['hp-fill'].className = `fill ${hp <= 30 ? 'crit' : hp <= 60 ? 'hurt' : ''}`;
  els['armor-num'].textContent = p.vest ? 100 : 0;
  els['armor-fill'].style.width = p.vest ? '100%' : '0%';
  els.gear.textContent = [p.vest ? 'VEST' : '', p.helmet ? 'HELMET' : '', p.hasBomb ? '◆ CHARGE' : ''].filter(Boolean).join('  ');

  // Wallet and weapon.
  els.money.textContent = `$${p.money}`;
  const gun = p.guns[p.current], def = defOf(p);
  els['ammo-mag'].textContent = gun.reloading > 0 ? '—' : gun.mag;
  els['ammo-mag'].className = gun.mag === 0 ? 'out' : gun.mag <= Math.ceil(def.mag * 0.25) ? 'low' : '';
  els['ammo-reserve'].textContent = `/ ${gun.reserve}`;
  els['weapon-name'].textContent = gun.reloading > 0 ? 'Reloading…' : def.name;
  els.nades.innerHTML = ['frag', 'flash', 'smoke']
    .map((k) => `<span class="nd ${p.nadeSel === k ? 'sel' : ''}">${k.toUpperCase()} <b>${p.nades[k]}</b></span>`).join('');

  // Crosshair: the gap is the gun's true current spread, in pixels.
  const speedK = 1 + (p.speedNow / BODY.speed) * (def.moveSpread - 1);
  const spread = def.spread * speedK * (p.onGround ? 1 : 2.6) + gun.bloom;
  els.crosshair.style.setProperty('--gap', `${(4 + spread * 620).toFixed(1)}px`);
  const showCross = p.alive && !p.scoped && G.phase !== 'menu';
  els.crosshair.classList.toggle('hidden', !showCross);
  els.scope.classList.toggle('on', !!p.scoped && p.alive);

  // Damage feedback: a low-health wash, a hurt pulse, a direction arc.
  hurtPulse = Math.max(0, hurtPulse - 0.03);
  els.vignette.style.opacity = Math.max(p.alive && p.hp < 45 ? (45 - p.hp) / 60 : 0, hurtPulse * 0.85);
  if (p.lastHitBy && G.time - p.lastHitT < 0.9 && p.alive) {
    const rel = yawDelta(p.yaw, yawTowards(p.pos.x, p.pos.z, p.lastHitBy.pos.x, p.lastHitBy.pos.z));
    els.hitdir.style.transform = `rotate(${-rel}rad)`;
    els.hitdir.style.opacity = 0.9;
  } else els.hitdir.style.opacity = 0;
  els.flashfx.style.opacity = p.blind > 0 ? Math.min(0.97, p.blind * 1.15) : 0;

  // Plant / defuse progress.
  const b = G.bomb;
  let prog = null;
  if (b.state === 'planting' && b.carrier?.isPlayer) prog = { label: 'Planting the charge', k: b.channel / RULES.plantTime };
  else if (b.state === 'defusing') prog = { label: 'The charge is being defused', k: b.channel / RULES.defuseTime };
  els.progress.classList.toggle('on', !!prog);
  if (prog) {
    els['progress-label'].textContent = prog.label;
    els['progress-fill'].style.width = `${Math.min(100, prog.k * 100)}%`;
  }

  // Spectate note.
  const spec = !p.alive && (G.phase === 'live' || G.phase === 'planted');
  els.spectate.classList.toggle('on', spec);
  if (spec) els['spectate-name'].textContent = G.spectate ? G.spectate.name : '—';

  drawMinimap();
}
