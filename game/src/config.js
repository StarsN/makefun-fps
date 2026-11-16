// config.js — every tuning number of Breachline in one place: the palette,
// the weapons, the grenades, the economy and the round timings. No logic
// lives here; the other modules read these tables and act on them.

// Foundry palette: charcoal steel, concrete, rust, hazard amber (Strikers)
// against oxidised teal (Sentinels). One accent per team, everywhere.
export const PALETTE = {
  sky: 0x9db4c0,
  fog: 0x8fa5b1,
  ground: 0x5c5f5c,
  concrete: 0x8d8d84,
  concreteDark: 0x62655f,
  steel: 0x4d585f,
  steelLight: 0x6b767f,
  rust: 0x9c5a33,
  containerRed: 0x8e3b2f,
  containerTeal: 0x2f6f6a,
  containerSand: 0xa8894f,
  crate: 0x9a7d4f,
  crateDark: 0x77603a,
  hazard: 0xf5a524,
  barrel: 0xb3402a,
  striker: 0xf5a524,
  strikerDark: 0x8a5f14,
  sentinel: 0x39c2b0,
  sentinelDark: 0x1d6a61,
  skin: 0xc9a189,
  dark: 0x22262a,
};

// Weapons. damage is per bullet at the chest before falloff; headMult scales
// a head hit (armour then applies). spread is the half-angle of the shot cone
// in radians for a still, grounded shooter; moveSpread multiplies it by the
// shooter's speed, bloom is what sustained fire adds per shot.
export const WEAPONS = {
  p9: {
    id: 'p9', name: 'P9 Sidearm', slot: 'sidearm', price: 0, auto: true,
    damage: 26, headMult: 3.4, rpm: 380, mag: 12, reserve: 48,
    spread: 0.010, moveSpread: 2.4, bloom: 0.004, bloomMax: 0.030,
    reload: 1.5, draw: 0.45, range: [20, 46, 0.55], kick: 0.011,
    pellets: 1, botSkill: 1.0, len: 0.34,
  },
  vk7: {
    id: 'vk7', name: 'VK-7 Carbine', slot: 'primary', price: 1400, auto: true,
    damage: 22, headMult: 3.0, rpm: 820, mag: 30, reserve: 90,
    spread: 0.015, moveSpread: 1.8, bloom: 0.0035, bloomMax: 0.034,
    reload: 2.1, draw: 0.6, range: [14, 34, 0.5], kick: 0.008,
    pellets: 1, botSkill: 1.05, len: 0.62,
  },
  ar9: {
    id: 'ar9', name: 'AR-9 Rifle', slot: 'primary', price: 2700, auto: true,
    damage: 33, headMult: 3.5, rpm: 620, mag: 30, reserve: 90,
    spread: 0.0075, moveSpread: 2.6, bloom: 0.0045, bloomMax: 0.036,
    reload: 2.4, draw: 0.7, range: [26, 60, 0.62], kick: 0.013,
    pellets: 1, botSkill: 1.12, len: 0.78,
  },
  lance: {
    id: 'lance', name: 'Lance Long Rifle', slot: 'primary', price: 4500, auto: false,
    damage: 108, headMult: 2.0, rpm: 41, mag: 5, reserve: 25,
    spread: 0.0006, moveSpread: 9.0, bloom: 0.0, bloomMax: 0.0,
    reload: 3.1, draw: 0.9, range: [40, 120, 0.9], kick: 0.055,
    pellets: 1, botSkill: 0.9, len: 1.05, scoped: true,
  },
};

export const NADES = {
  frag: { id: 'frag', name: 'Frag grenade', price: 300, desc: 'High explosive. 95 damage at the core, falls off over 5.5 m. Cooks off 1.6 s after the throw.' },
  flash: { id: 'flash', name: 'Flash grenade', price: 200, desc: 'Blinds anyone looking at it. Full effect facing it inside 12 m; a turned back shrugs it off.' },
  smoke: { id: 'smoke', name: 'Smoke grenade', price: 300, desc: 'A 14-second grey wall, 4.2 m wide. Nobody — bot or human — sees through it.' },
};

export const GEAR = {
  vest: { id: 'vest', name: 'Kevlar vest', price: 650, desc: 'Body shots lose 45% of their damage.' },
  fullkit: { id: 'fullkit', name: 'Vest + helmet', price: 1000, desc: 'The vest, plus a helmet: head shots lose 45% too.' },
};

// The buy menu, in display order: [key, kind, id].
export const BUY_MENU = [
  ['1', 'weapon', 'vk7'],
  ['2', 'weapon', 'ar9'],
  ['3', 'weapon', 'lance'],
  ['4', 'gear', 'vest'],
  ['5', 'gear', 'fullkit'],
  ['6', 'nade', 'frag'],
  ['7', 'nade', 'flash'],
  ['8', 'nade', 'smoke'],
  ['9', 'ammo', 'ammo'],
];

// Round and match timings (seconds) and the economy.
export const RULES = {
  teamSize: 4,
  roundsToWin: 7,
  maxRounds: 12,
  buyTime: 12,
  roundTime: 100,
  bombTime: 35,
  plantTime: 3.2,
  defuseTime: 6,
  endTime: 5.5,
  startMoney: 800,
  moneyCap: 9000,
  killReward: 300,
  plantReward: 300,
  winElim: 2400,
  winBomb: 2650,
  winDefuse: 2650,
  winTime: 2400,
  lossBase: 1400,
  lossStep: 500,
  lossMax: 2900,
};

export const AMMO_PRICE = 150;

// Movement and body numbers shared by the player and every bot.
export const BODY = {
  radius: 0.34,
  eyeStand: 1.62,
  eyeCrouch: 1.12,
  headY: 1.58,       // centre of the head sphere, standing
  headYCrouch: 1.06,
  headR: 0.13,
  chestTop: 1.48,    // capsule from here down to the legs
  legY: 0.78,        // below this a hit is a leg hit
  speed: 4.7,        // m/s at full tilt
  walkSpeed: 2.4,    // shift-walk: quiet and steadier
  crouchSpeed: 1.7,
  accel: 42,         // ground acceleration
  friction: 9.5,
  airAccel: 2.2,
  jumpVel: 4.4,
  gravity: 12.5,
};
