// Hands in Palmera Heat for the make.fun gta6-01 bounty (Node 22, standard library only).
// The game is game/: static files (index.html, style.css, src/*.js ES modules and the vendored
// three.js build in game/vendor/three.min.js) that desktop Chrome plays offline with no build step.
// This program copies game/ and screenshots/ next to it into the output folder and writes
// dossier.json there with the kit's unchanged vendor/makefun-game.ts, so both runs write the same bytes.
//
// Play locally:      node serve.ts   (then open http://localhost:8080)
// Retake the shots:  node shoot.ts   (headless Chrome, scenes listed in shots.json)
// Hand in locally:   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

if (!existsSync(join(repoRoot, 'game', 'index.html'))) {
  throw new Error('game/index.html is missing: there is no game to hand in');
}
mkdirSync(outputDir, { recursive: true });
cpSync(join(repoRoot, 'game'), join(outputDir, 'game'), { recursive: true });
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
if (existsSync(join(repoRoot, 'screenshots'))) {
  cpSync(join(repoRoot, 'screenshots'), join(outputDir, 'screenshots'), { recursive: true });
}

// The limits the gate enforces; only text_max_bytes changes the dossier's bytes, the rest make
// buildDossier refuse an entry the scorer would refuse anyway.
const limits = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};
writeFileSync(join(outputDir, 'dossier.json'), buildDossier(outputDir, limits));
