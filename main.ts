// Breachline — handover program (Node 22, standard library only).
//
// The game itself is the static site under game/: plain files a browser loads
// as ES modules, three.js 0.187.0 vendored beside them, no build step. This
// program hands the entry in the way the bounty asks: it copies game/ and
// screenshots/ from beside this file into the output directory and writes
// dossier.json there with the vendored make.fun library, so the dossier the
// judge reads is exactly the one the library builds from these files.
//
// Run it the way the grader does, or locally with an output directory:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The scorer's caps for this bounty: past any of them the scorer refuses the
// entry, so this program refuses first, with the same numbers.
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
};

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

writeFileSync(join(out, 'dossier.json'), buildDossier(out, CAPS));
console.log(`breachline: game/ and screenshots/ copied to ${out}, dossier.json written`);
