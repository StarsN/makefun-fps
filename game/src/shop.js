// shop.js — the buy rules, shared by the player's buy menu and the bots'
// own shopping: what a purchase costs, what it grants, and when it is
// refused (not enough money, already owned, grenade pouch full).

import { WEAPONS, NADES, GEAR, AMMO_PRICE, RULES } from './config.js';
import { makeGun } from './state.js';

export const NADE_CAPS = { frag: 1, flash: 2, smoke: 1 };

export function buyWeapon(a, id) {
  const def = WEAPONS[id];
  if (!def || a.loadout[def.slot] === id || a.money < def.price) return false;
  a.money -= def.price;
  const old = a.loadout[def.slot];
  if (old && a.current === old) a.current = 'p9';
  if (old) delete a.guns[old];
  a.loadout[def.slot] = id;
  a.guns[id] = makeGun(id);
  return true;
}

export function buyGear(a, id) {
  const def = GEAR[id];
  if (!def || a.money < def.price) return false;
  if (id === 'vest' && a.vest) return false;
  if (id === 'fullkit' && a.vest && a.helmet) return false;
  a.money -= def.price;
  a.vest = true;
  if (id === 'fullkit') a.helmet = true;
  a.armor = 100;
  return true;
}

export function buyNade(a, id) {
  const def = NADES[id];
  if (!def || a.money < def.price || a.nades[id] >= NADE_CAPS[id]) return false;
  a.money -= def.price;
  a.nades[id]++;
  return true;
}

/** Top every owned gun's reserve back up; false when already full or broke. */
export function refillAmmo(a) {
  let needed = false;
  for (const id of Object.keys(a.guns)) {
    if (a.guns[id].reserve < WEAPONS[id].reserve) needed = true;
  }
  if (!needed || a.money < AMMO_PRICE) return false;
  a.money -= AMMO_PRICE;
  for (const id of Object.keys(a.guns)) a.guns[id].reserve = WEAPONS[id].reserve;
  return true;
}

/** Can this agent afford and use this menu entry at all? (For greying out.) */
export function canBuy(a, kind, id) {
  if (kind === 'weapon') return a.loadout[WEAPONS[id].slot] !== id && a.money >= WEAPONS[id].price;
  if (kind === 'gear') {
    if (id === 'vest') return !a.vest && a.money >= GEAR.vest.price;
    return !(a.vest && a.helmet) && a.money >= GEAR.fullkit.price;
  }
  if (kind === 'nade') return a.nades[id] < NADE_CAPS[id] && a.money >= NADES[id].price;
  if (kind === 'ammo') return a.money >= AMMO_PRICE;
  return false;
}

export const priceOf = (kind, id) =>
  kind === 'weapon' ? WEAPONS[id].price :
  kind === 'gear' ? GEAR[id].price :
  kind === 'nade' ? NADES[id].price : AMMO_PRICE;

export { RULES };
