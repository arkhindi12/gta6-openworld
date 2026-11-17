// Vice Meridian's hand-in program.
//
// What a gta6-01 entry has to produce, in the grader's terms: an output directory holding game/ (the
// playable static game), screenshots/ (3 or 4 renders, the first by name the cover) and dossier.json,
// the summary the judge reads, written by the vendored make.fun library from exactly those two trees.
//
// The order here is checks first, bytes second. Every input is inspected before a single file is
// copied, so a broken hand-in fails with a sentence naming what is wrong and with a non-zero exit
// code instead of leaving a half-written output directory that looks finished. The dossier is then
// built from the staged copy rather than from the sources, which is what the grader does, so a
// dossier that is written is a dossier that matches the files beside it.
//
// Usage, from this directory:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// MAKEFUN_OUTPUT_DIR defaults to /output, which is where the bounty's container mounts it.
// Serve the game itself with `node serve.ts` and open http://localhost:8080.

import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier, DossierError, readGameTree } from './vendor/makefun-game.ts';

// The scorer's caps, passed through unchanged: only text_max_bytes shapes the dossier's bytes, the
// rest make this program refuse an entry the scorer would refuse.
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

// The bounty's own shape for screenshots/: three or four PNG or JPEG renders.
const SHOTS_MIN = 3;
const SHOTS_MAX = CAPS.screenshots.max;
const SHOT_MAX_BYTES = CAPS.screenshots.max_bytes;

/** One output directory's worth of work: where the entry is read from and where it is written. */
const ROOT = fileURLToPath(new URL('.', import.meta.url));
const GAME_DIR = join(ROOT, 'game');
const SHOTS_DIR = join(ROOT, 'screenshots');
const OUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

/** A hand-in that cannot be built, with a message meant for the person who ran it. */
class HandInError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HandInError';
  }
}

const kib = (bytes: number): string => `${(bytes / 1024).toFixed(1)} KiB`;
const count = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

// ---------------------------------------------------------------- the inputs

/**
 * The screenshots to hand in, in the order the dossier will take them (byte order of the names, the
 * first the cover). Refuses a missing or empty directory, too many files, and one over the cap,
 * naming the file and its size.
 */
function collectScreenshots(): string[] {
  let stats;
  try {
    stats = statSync(SHOTS_DIR);
  } catch {
    throw new HandInError(`screenshots/: no such directory (${SHOTS_DIR}) — an entry hands in ${SHOTS_MIN} or 4 renders of its game, the first by name the cover`);
  }
  if (!stats.isDirectory()) throw new HandInError('screenshots/: not a directory — rename it back and put the renders in it');

  const names = readdirSync(SHOTS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  if (names.length === 0) {
    throw new HandInError('screenshots/: holds no image — the bounty needs 3 or 4 renders of the game, the first by name the cover');
  }
  if (names.length < SHOTS_MIN) {
    throw new HandInError(`screenshots/: holds ${count(names.length, 'image', 'images')} (${names.join(', ')}), but the bounty needs at least ${SHOTS_MIN}`);
  }
  if (names.length > SHOTS_MAX) {
    throw new HandInError(`screenshots/: holds ${count(names.length, 'image', 'images')} (${names.join(', ')}), over the ${SHOTS_MAX} the dossier may carry — remove the extras`);
  }

  for (const name of names) {
    const size = statSync(join(SHOTS_DIR, name)).size;
    if (size > SHOT_MAX_BYTES) {
      throw new HandInError(`screenshots/${name}: ${size} bytes (${kib(size)}), over the ${SHOT_MAX_BYTES}-byte (256 KiB) cap — re-encode it smaller`);
    }
    if (size === 0) throw new HandInError(`screenshots/${name}: empty, 0 bytes — a screenshot is a PNG or JPEG render`);
  }
  return names;
}

/** Refuses a game/ that is not there or has no page, then the caps; returns the tree for the summary. */
function inspectGame() {
  if (!existsSync(GAME_DIR) || !statSync(GAME_DIR).isDirectory()) {
    throw new HandInError(`game/: no such directory (${GAME_DIR}) — the entry is game/index.html and its files, beside this program`);
  }
  const index = join(GAME_DIR, 'index.html');
  if (!existsSync(index) || !statSync(index).isFile()) {
    throw new HandInError('game/index.html: missing — a game is a directory of static files with its page at the root, and there is nothing for the judge to open');
  }
  // readGameTree also refuses a symbolic link, more entries than game_max_files (993) and more bytes
  // than game_max_bytes (48 MiB), so a tree the scorer would not take stops here.
  return readGameTree(GAME_DIR, CAPS);
}

// ---------------------------------------------------------------- the output

/**
 * Write the output directory from scratch: the two trees, nothing stale. A previous run's leftover
 * file would otherwise be copied into the dossier as if this run had produced it.
 */
function stage(gameFiles: number, shots: string[]): void {
  mkdirSync(OUT_DIR, { recursive: true });
  for (const stale of ['game', 'screenshots', 'dossier.json']) {
    rmSync(join(OUT_DIR, stale), { recursive: true, force: true });
  }
  try {
    cpSync(GAME_DIR, join(OUT_DIR, 'game'), { recursive: true });
    mkdirSync(join(OUT_DIR, 'screenshots'), { recursive: true });
    for (const name of shots) copyFileSync(join(SHOTS_DIR, name), join(OUT_DIR, 'screenshots', name));
  } catch (err) {
    throw new HandInError(`copying the entry to ${OUT_DIR} failed (${(err as Error).message})`);
  }
  if (gameFiles === 0) throw new HandInError('game/: copied no files — the tree is there but empty');
}

/** Build the dossier from the staged copy and report what was handed in. */
function finish(shots: string[]): void {
  let dossier: Uint8Array;
  try {
    dossier = buildDossier(OUT_DIR, CAPS);
  } catch (err) {
    if (err instanceof DossierError) throw new HandInError(`dossier: ${err.message}`);
    throw err;
  }
  writeFileSync(join(OUT_DIR, 'dossier.json'), dossier);

  const staged = readGameTree(join(OUT_DIR, 'game'), CAPS);
  const shotBytes = shots.reduce((sum, name) => sum + statSync(join(OUT_DIR, 'screenshots', name)).size, 0);

  console.log(`hand-in written to ${OUT_DIR}`);
  console.log(`  game/         ${count(staged.files.length, 'file', 'files')}, ${staged.totalBytes} bytes (${kib(staged.totalBytes)})`);
  console.log(`  screenshots/  ${count(shots.length, 'file', 'files')}, ${shotBytes} bytes: ${shots.join(', ')}`);
  console.log(`  dossier.json  ${dossier.length} bytes (${kib(dossier.length)})`);
}

// ---------------------------------------------------------------- the run

function main(): void {
  const shots = collectScreenshots();
  const tree = inspectGame();
  stage(tree.files.length, shots);
  finish(shots);
}

try {
  main();
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`hand-in failed: ${message}`);
  process.exitCode = 1;
}