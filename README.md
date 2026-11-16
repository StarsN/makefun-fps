[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/StarsN/makefun-fps/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/StarsN/makefun-fps/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

# Breachline

A round-based tactical first-person shooter for the browser, built on
three.js 0.187.0 — in the spirit of the classic bomb-defusal shooters, with
its own map, teams, weapons and names. You lead the **Strikers**: plant the
charge at site A or B, or eliminate the **Sentinels** holding the foundry.
They win by eliminating your team, running out the clock, or defusing.
First to 7 rounds, at most 12. Money earned each round buys rifles, armour
and grenades in the next.

Everything is procedural: the map geometry, the painted ground texture, the
soldiers, the sounds (synthesised WebAudio) — the game ships no image,
model or audio files and makes no network requests. three.js is vendored
under `game/vendor/three/`, byte for byte the kit's 0.187.0 build.

## Play it

```sh
node serve.ts            # serves game/ on http://localhost:8090
```

Open that address in a desktop browser and click **Deploy**. Or serve the
`game/` directory with any static file server.

| Input | Action |
| --- | --- |
| W A S D / mouse | Move / look (pointer lock) |
| Click / right-click | Fire / scope (Lance only) |
| Shift / Ctrl or C | Walk (quiet, steadier) / crouch |
| R · 1 · 2 | Reload · primary · sidearm |
| 4 · G | Cycle grenade · throw it |
| E (hold) | Plant the charge |
| B · Tab | Buy menu · scoreboard |
| Space | Jump |

## How it plays

- **Gunplay.** Hits are tested against a head sphere and a torso capsule:
  headshots pay up to 3.5× damage, legs 0.75×, armour shaves 45%. Spread
  grows with movement, airtime and sustained fire, so stopping — or
  crouching — to shoot is the winning habit. Damage falls off with range.
- **The objective.** One Striker carries the charge. Planting takes 3.2 s
  inside a site; the 35 s fuse then runs while the Sentinels retake and try
  to hold a 6 s defuse. A planted charge still wins the round for a wiped
  Striker team if it goes off.
- **Economy.** $800 to start. Kills pay $300, a plant $300, round wins
  $2,400–2,650, losses an escalating bonus. The buy menu (VK-7 carbine,
  AR-9 rifle, Lance long rifle, vest, vest + helmet, frag / flash / smoke
  grenades, reserve ammo) is open for 12 s before each round; the dead
  leave their primary behind.
- **Bots with a plan.** Seven bots share your perception rules — field of
  view, line of sight, hearing, being shot at — and team intel. Strikers
  split across the main, link and lobby routes to a chosen site, flash
  their entry, plant and guard. Sentinels hold posts on both sites, smoke
  a pushed door, rotate on contact, and retake with a designated defuser.
  In a fight they burst-fire, strafe between bursts, take cover nodes and
  frag enemies who break line of sight.
- **The Foundry.** An original map: a west yard, three lanes (A-main, Mid,
  B-main), a lobby and a link corridor feeding each site, two plant sites
  around a Sentinel room, explosive barrels guarding four corners, and a
  live minimap that only shows Sentinels while their gunfire is fresh.

## Layout of the entry

- `main.ts` — the handover program: copies `game/` and `screenshots/` to
  the output directory and writes `dossier.json` with the vendored library
  in `vendor/makefun-threejs.ts`.
- `game/index.html` — the page, its HUD and menus, and the import map that
  binds `three` to the vendored module.
- `game/src/` — the game, one job per module:
  `config` (tuning tables) · `state` (the match, in one object) · `map`
  (the Foundry as data, waypoint graph, A*) · `physics` (movement,
  collision, rays) · `world` (the three.js scene) · `actors` (bot bodies)
  · `player` (controls, camera, view model) · `input` · `weapons`
  (gunplay, grenades, explosions) · `bots` (perception and missions) ·
  `bomb` (plant / defuse / detonation) · `rounds` (phases and economy) ·
  `shop` (buy rules) · `hud` (DOM, minimap) · `fx` (tracers, particles,
  smoke) · `audio` (synthesised sound) · `rng` (the seeded random source).
- `screenshots/` — three renders of the game taken in a browser from its
  own staged scenes (`game/?shot=cover|buy|plant|score`): the cover is a
  live mid fight; the others show the buy phase and a planted charge.

The simulation runs on a fixed 60 Hz step, apart from rendering; all
randomness draws from one seeded source, so a match from a seed replays
identically.

## License

MIT — see `LICENSE`.
