// map.js — the Foundry, as data. Every wall, crate and container is an
// axis-aligned box { x, z, w, d, h, mat } (centre x/z, size w×d, height h,
// optional base y). The same list drives rendering (world.js), collision and
// bullet raycasts (physics.js) and the waypoint graph below, so what a bot
// paths around is exactly what the player sees.
//
// Layout, west to east: the Strikers' yard; three lanes north, centre and
// south (A-main, Mid, B-main) with a lobby and a link corridor feeding each
// site; the two plant sites in the east; the Sentinels' room between them.

export const BOUNDS = { x0: -31.8, x1: 31.8, z0: -23.8, z1: 23.8 };

const B = (x, z, w, d, h, mat, y = 0) => ({ x, z, w, d, h, mat, y });

export const BOXES = [
  // Perimeter
  B(0, -24.5, 66, 1, 5, 'concreteDark'), B(0, 24.5, 66, 1, 5, 'concreteDark'),
  B(-32.5, 0, 1, 50, 5, 'concreteDark'), B(32.5, 0, 1, 50, 5, 'concreteDark'),
  // Sealed strips behind A-main and B-main (visual mass, never entered)
  B(-20, -20.5, 24, 1, 4.2, 'concrete'), B(-20, 20.5, 24, 1, 4.2, 'concrete'),
  B(3, -22.25, 22, 3.5, 5, 'concreteDark'), B(3, 22.25, 22, 3.5, 5, 'concreteDark'),
  // Striker yard walls: north and south rows (doors at x -22..-19)
  B(-27, -12, 10, 2, 3.6, 'concrete'), B(-13.5, -12, 11, 2, 3.6, 'concrete'),
  B(-27, 12, 10, 2, 3.6, 'concrete'), B(-13.5, 12, 11, 2, 3.6, 'concrete'),
  // Yard east wall (mid door at z -1.5..1.5)
  B(-8, -5.75, 1, 8.5, 4.2, 'steel'), B(-8, 5.75, 1, 8.5, 4.2, 'steel'),
  // The z=-12 row extended east: doors at x 0..3 (A lobby) and 11.5..14.5 (A link)
  B(-4, -12, 8, 2, 3.6, 'concrete'), B(7.25, -12, 8.5, 2, 3.6, 'concrete'), B(15.25, -12, 1.5, 2, 3.6, 'concrete'),
  B(-4, 12, 8, 2, 3.6, 'concrete'), B(7.25, 12, 8.5, 2, 3.6, 'concrete'), B(15.25, 12, 1.5, 2, 3.6, 'concrete'),
  // Mid's north and south walls: doors at x 0..3 (lobbies) and 11.5..14.5 (links)
  B(-4, -3, 8, 1, 4.2, 'steel'), B(7.25, -3, 8.5, 1, 4.2, 'steel'), B(16.25, -3, 3.5, 1, 4.2, 'steel'),
  B(-4, 3, 8, 1, 4.2, 'steel'), B(7.25, 3, 8.5, 1, 4.2, 'steel'), B(16.25, 3, 3.5, 1, 4.2, 'steel'),
  // Lobby east walls (link doors at z -8.5..-5.5 and 5.5..8.5)
  B(10, -11.25, 1, 5.5, 4.2, 'concrete'), B(10, -4.25, 1, 2.5, 4.2, 'concrete'),
  B(10, 11.25, 1, 5.5, 4.2, 'concrete'), B(10, 4.25, 1, 2.5, 4.2, 'concrete'),
  // Site A west wall: doors from A-main (z -18..-15) and A-link (z -10..-7)
  B(16, -21, 1, 6, 4.6, 'concrete'), B(16, -12.5, 1, 5, 4.6, 'concrete'), B(16, -6.5, 1, 1, 4.6, 'concrete'),
  // Site B west wall: doors from B-main (z 15..18) and B-link (z 7..10)
  B(16, 21, 1, 6, 4.6, 'concrete'), B(16, 12.5, 1, 5, 4.6, 'concrete'), B(16, 6.5, 1, 1, 4.6, 'concrete'),
  // Sentinel room: west wall (mid door z -1.5..1.5), north and south walls (site doors x 26..29)
  B(22, -3.75, 1, 4.5, 4.2, 'steel'), B(22, 3.75, 1, 4.5, 4.2, 'steel'),
  B(24, -6, 4, 1, 4.2, 'steel'), B(30.5, -6, 3, 1, 4.2, 'steel'),
  B(24, 6, 4, 1, 4.2, 'steel'), B(30.5, 6, 3, 1, 4.2, 'steel'),

  // ---- Cover and structures ----
  // Site A: furnace block, container, stacks and crates
  B(24.5, -16, 4.5, 3.6, 3.4, 'steel'), B(25, -21, 7, 2.6, 2.6, 'contRed'),
  B(27, -11, 2.4, 2.4, 2.2, 'crateDark'), B(20, -11.5, 2.2, 1.1, 1.1, 'crate'),
  B(18.5, -20, 1.6, 1.6, 1.1, 'crate'),
  // Site B: press block, container, stacks and crates
  B(24.5, 16, 4.5, 3.6, 3.4, 'steel'), B(25, 21, 7, 2.6, 2.6, 'contTeal'),
  B(27, 11, 2.4, 2.4, 2.2, 'crateDark'), B(20, 11.5, 2.2, 1.1, 1.1, 'crate'),
  B(18.5, 20, 1.6, 1.6, 1.1, 'crate'),
  // Mid and the hub
  B(4, -1.9, 2, 1, 1.1, 'crate'), B(9, 1.9, 2, 1, 1.1, 'crate'),
  B(13, -2, 1.6, 1.6, 2.2, 'crateDark'),
  B(19, -4.6, 1.8, 1.1, 1.1, 'crate'), B(19, 4.6, 1.8, 1.1, 1.1, 'crate'),
  // Lanes and lobbies
  B(-6, -17, 2, 1.4, 1.1, 'crate'), B(6, -18, 1.6, 1.6, 1.1, 'crate'),
  B(-6, 17, 2, 1.4, 1.1, 'crate'), B(6, 18, 1.6, 1.6, 1.1, 'crate'),
  B(5, -8, 2, 2, 1.1, 'crate'), B(5, 8, 2, 2, 1.1, 'crate'),
  B(14.5, -11, 1.2, 1.2, 1.1, 'crate'), B(14.5, 11, 1.2, 1.2, 1.1, 'crate'),
  // Yard cover
  B(-18, 4, 2.2, 2.2, 2.2, 'crateDark'), B(-19, -5, 1.8, 1.4, 1.1, 'crate'),
  // Door lintels: a band above every doorway, so doors read as doors
  B(-20.5, -12, 3, 2, 1.2, 'steel', 3.0), B(-20.5, 12, 3, 2, 1.2, 'steel', 3.0),
  B(-8, 0, 1, 3, 1.2, 'steel', 3.0), B(22, 0, 1, 3, 1.2, 'steel', 3.0),
  B(16, -16.5, 1, 3, 1.6, 'concrete', 3.0), B(16, 16.5, 1, 3, 1.6, 'concrete', 3.0),
];

// Explosive barrels: shoot one and it clears the corner it guards.
export const BARRELS = [
  { x: 11.8, z: -16.8 }, { x: 19, z: -8.6 }, { x: 15.2, z: 0 },
  { x: 11.8, z: 16.8 }, { x: 19, z: 8.6 }, { x: -14, z: -8 },
];

// Plant zones. The charge can be planted anywhere inside; cx/cz is the
// middle, where the device model sits once planted.
export const SITES = {
  A: { id: 'A', x0: 18, x1: 30, z0: -21, z1: -10, cx: 24, cz: -15.5 },
  B: { id: 'B', x0: 18, x1: 30, z0: 10, z1: 21, cx: 24, cz: 15.5 },
};
export const inSite = (site, x, z) => x >= site.x0 && x <= site.x1 && z >= site.z0 && z <= site.z1;
export const siteAt = (x, z) => (inSite(SITES.A, x, z) ? SITES.A : inSite(SITES.B, x, z) ? SITES.B : null);

export const SPAWNS = {
  A: [
    { x: -29, z: -3, yaw: -Math.PI / 2 }, { x: -29, z: 3, yaw: -Math.PI / 2 },
    { x: -30.5, z: 0, yaw: -Math.PI / 2 }, { x: -27.5, z: 0, yaw: -Math.PI / 2 },
  ],
  D: [
    { x: 29.5, z: -2.5, yaw: Math.PI / 2 }, { x: 29.5, z: 2.5, yaw: Math.PI / 2 },
    { x: 30.5, z: 0, yaw: Math.PI / 2 }, { x: 27.8, z: 0, yaw: Math.PI / 2 },
  ],
};

// Waypoints the bots navigate by. `cover` marks a node tucked against
// something solid — where a bot ducks when it is taking fire.
const N = (x, z, cover = false, site = null) => ({ x, z, cover, site, edges: [] });
export const NODES = [
  N(-27, 0), N(-24, -6), N(-24, 6), N(-14, 0), N(-20.5, -12), N(-20.5, 12),
  N(-26, -17), N(-14, -17), N(-2, -17), N(8, -17), N(15, -16.5), N(17.5, -16.5, true),
  N(-26, 17), N(-14, 17), N(-2, 17), N(8, 17), N(15, 16.5), N(17.5, 16.5, true),
  N(-5, 0), N(3, 0, true), N(10, 0), N(15.5, 0), N(20, 0), N(24, 0), N(28, 0),
  N(1, -8, true), N(1.5, -12), N(13, -8), N(15, -8.5), N(13, -12.6),
  N(1, 8, true), N(1.5, 12), N(13, 8), N(15, 8.5), N(13, 12.6),
  N(21, -16, true, 'A'), N(21, -11, false, 'A'), N(28, -14, true, 'A'), N(28, -20, false, 'A'), N(19, -20, true, 'A'),
  N(21, 16, true, 'B'), N(21, 11, false, 'B'), N(28, 14, true, 'B'), N(28, 20, false, 'B'), N(19, 20, true, 'B'),
  N(27.5, -7.5, false, 'A'), N(27.5, 7.5, false, 'B'),
];

// --- waypoint graph: two nodes are linked when a bot can walk the straight
// line between them (no tall box in the way) and they are not far apart.
const segHitsBox = (ax, az, bx, bz, b) => {
  // Liang–Barsky clip of the segment against the box's 2D rectangle.
  const dx = bx - ax, dz = bz - az;
  let t0 = 0, t1 = 1;
  const p = [-dx, dx, -dz, dz];
  const q = [ax - (b.x - b.w / 2), b.x + b.w / 2 - ax, az - (b.z - b.d / 2), b.z + b.d / 2 - az];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i] < 0) return false; continue; }
    const t = q[i] / p[i];
    if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
    else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return true;
};

const blockers = BOXES.filter((b) => b.h >= 2.0 && b.y === 0);
for (let i = 0; i < NODES.length; i++) {
  for (let j = i + 1; j < NODES.length; j++) {
    const a = NODES[i], c = NODES[j];
    const dist = Math.hypot(c.x - a.x, c.z - a.z);
    if (dist > 17) continue;
    if (blockers.some((b) => segHitsBox(a.x, a.z, c.x, c.z, b))) continue;
    a.edges.push(j);
    c.edges.push(i);
  }
}

/** A* over the waypoint graph; returns a list of node indices or null. */
export function findPath(fromIdx, toIdx) {
  if (fromIdx === toIdx) return [fromIdx];
  const open = new Set([fromIdx]);
  const came = new Map(), gs = new Map([[fromIdx, 0]]);
  const h = (i) => Math.hypot(NODES[i].x - NODES[toIdx].x, NODES[i].z - NODES[toIdx].z);
  const fs = new Map([[fromIdx, h(fromIdx)]]);
  while (open.size) {
    let cur = -1, best = Infinity;
    for (const i of open) if (fs.get(i) < best) { best = fs.get(i); cur = i; }
    if (cur === toIdx) {
      const path = [cur];
      while (came.has(cur)) { cur = came.get(cur); path.unshift(cur); }
      return path;
    }
    open.delete(cur);
    for (const nb of NODES[cur].edges) {
      const g = gs.get(cur) + Math.hypot(NODES[nb].x - NODES[cur].x, NODES[nb].z - NODES[cur].z);
      if (g < (gs.get(nb) ?? Infinity)) {
        came.set(nb, cur); gs.set(nb, g); fs.set(nb, g + h(nb)); open.add(nb);
      }
    }
  }
  return null;
}

/** The waypoint nearest a point (optionally only nodes of one kind). */
export function nearestNode(x, z, filter = null) {
  let best = -1, bd = Infinity;
  for (let i = 0; i < NODES.length; i++) {
    if (filter && !filter(NODES[i])) continue;
    const d = (NODES[i].x - x) ** 2 + (NODES[i].z - z) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}
