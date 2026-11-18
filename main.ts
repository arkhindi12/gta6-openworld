// The hand-in for Vice Meridian.
//
// A gta6-01 entry is an output directory holding three things: `game/` (the playable static game),
// `screenshots/` (three or four renders, the first by name the cover) and `dossier.json` (the
// summary the judge reads, written by the vendored make.fun library from exactly those two trees).
// This program produces all three, and refuses to produce a partial one.
//
// The shape is: look at every input, then copy, then build. Each stage throws a HandInError with a
// sentence naming what is wrong, and the top-level catch prints it and sets a non-zero exit code.
// A broken hand-in therefore cannot look like a successful one — not with an empty directory, not
// with a stale dossier, not with a screenshot the scorer would bounce.
//
// Two details are worth calling out because they are the difference between "it ran" and "it is
// right":
//
//   * The dossier is built from the *staged copy* under the output directory, not from the source
//     tree. That is what the grader does, so a dossier that is written is a dossier that describes
//     the files sitting beside it.
//   * `readGameTree` is run against the staged copy after the copy as well, and its totals are what
//     the summary prints. The numbers in the summary are therefore measured, not counted by hand.
//
// Usage, from the repository root:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// MAKEFUN_OUTPUT_DIR defaults to /output, which is where the bounty's container mounts it. Serve the
// game itself with `node serve.ts` and open http://localhost:8080.

import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier, DossierError, readGameTree } from './vendor/makefun-game.ts';

// The scorer's caps, passed through unchanged. Only text_max_bytes shapes the dossier's bytes; the
// rest are here so this program refuses an entry the scorer would refuse, before writing anything.
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

const SHOTS_MAX = CAPS.screenshots.max;
const SHOT_MAX_BYTES = CAPS.screenshots.max_bytes;

/** The entry, read from beside this program and written wherever the grader asked for it. */
const ROOT = fileURLToPath(new URL('.', import.meta.url));
const GAME_SRC = join(ROOT, 'game');
const SHOTS_SRC = join(ROOT, 'screenshots');
const OUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

/** A hand-in that cannot be built, with a message meant for the person who ran it. */
class HandInError extends Error {
  constructor(message) {
    super(message);
    this.name = 'HandInError';
  }
}

const kib = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// ---------------------------------------------------------------- reading the inputs

/**
 * The screenshots to hand in, in the order the dossier will take them — byte order of the names, the
 * first being the cover. Refuses a missing or empty directory, too many files, and one over the
 * cap, naming the file and its size.
 */
function collectScreenshots() {
  if (!existsSync(SHOTS_SRC)) {
    throw new HandInError(
      `screenshots/: no such directory (${SHOTS_SRC}) — an entry hands in its renders of the game beside it, the first by name the cover`,
    );
  }
  if (!statSync(SHOTS_SRC).isDirectory()) {
    throw new HandInError(`screenshots/: not a directory (${SHOTS_SRC}) — put the renders back in it`);
  }

  const names = readdirSync(SHOTS_SRC, { withFileTypes: true })
    .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  if (names.length === 0) {
    throw new HandInError('screenshots/: holds no image — the first render by name is the cover, and a dossier with no pictures is not an entry');
  }
  if (names.length > SHOTS_MAX) {
    throw new HandInError(`screenshots/: holds ${plural(names.length, 'image', 'images')} (${names.join(', ')}), over the ${SHOTS_MAX} a dossier may carry — remove the extras`);
  }

  for (const name of names) {
    const size = statSync(join(SHOTS_SRC, name)).size;
    if (size === 0) {
      throw new HandInError(`screenshots/${name}: empty, 0 bytes — a screenshot is a PNG or JPEG render`);
    }
    if (size > SHOT_MAX_BYTES) {
      throw new HandInError(
        `screenshots/${name}: ${size} bytes (${kib(size)}), over the ${SHOT_MAX_BYTES}-byte (256 KiB) cap — re-encode it smaller`,
      );
    }
  }
  return names;
}

/**
 * Refuse a game/ that is not there, has no page, or would not survive the caps; return its measured
 * tree. `readGameTree` also rejects a symbolic link, more than 993 files and directories, more than
 * 48 MiB of files and a path over 1000 bytes, so a tree the scorer would bounce stops here.
 */
function inspectGame() {
  if (!existsSync(GAME_SRC) || !statSync(GAME_SRC).isDirectory()) {
    throw new HandInError(`game/: no such directory (${GAME_SRC}) — the entry is game/index.html and its files, beside this program`);
  }
  const page = join(GAME_SRC, 'index.html');
  if (!existsSync(page) || !statSync(page).isFile()) {
    throw new HandInError('game/index.html: missing — a game is a directory of static files with its page at the root, and there would be nothing for the judge to open');
  }
  const tree = readGameTree(GAME_SRC, CAPS);
  if (tree.files.length === 0) throw new HandInError('game/: holds no files — the tree is there but empty');
  if (!tree.files.some((file) => file.path === 'index.html')) {
    throw new HandInError('game/index.html: not among the files the tree lists — the page must be a plain file at the root of game/');
  }
  return tree;
}

// ---------------------------------------------------------------- writing the output

/**
 * Write the output directory from scratch: the two trees and nothing else. A previous run's leftover
 * file would otherwise be copied into the dossier as though this run had produced it.
 */
function stage(shots) {
  mkdirSync(OUT_DIR, { recursive: true });
  for (const stale of ['game', 'screenshots', 'dossier.json']) {
    rmSync(join(OUT_DIR, stale), { recursive: true, force: true });
  }
  try {
    cpSync(GAME_SRC, join(OUT_DIR, 'game'), { recursive: true, dereference: false, errorOnExist: false });
    mkdirSync(join(OUT_DIR, 'screenshots'), { recursive: true });
    for (const name of shots) copyFileSync(join(SHOTS_SRC, name), join(OUT_DIR, 'screenshots', name));
  } catch (err) {
    throw new HandInError(`copying the entry into ${OUT_DIR} failed (${(err as Error).message})`);
  }
  if (!existsSync(join(OUT_DIR, 'game', 'index.html'))) {
    throw new HandInError(`the copy in ${OUT_DIR}/game has no index.html — the copy did not land where it should`);
  }
}

/** Build the dossier from the staged copy, write it, and report what was handed in. */
function finish(shots) {
  let dossier;
  try {
    dossier = buildDossier(OUT_DIR, CAPS);
  } catch (err) {
    if (err instanceof DossierError) throw new HandInError(`dossier: ${err.message}`);
    throw err;
  }
  const dossierPath = join(OUT_DIR, 'dossier.json');
  writeFileSync(dossierPath, dossier);
  const written = statSync(dossierPath).size;
  if (written !== dossier.length) {
    throw new HandInError(`dossier.json: wrote ${written} bytes but built ${dossier.length} — the output directory is not behaving`);
  }

  const stagedGame = readGameTree(join(OUT_DIR, 'game'), CAPS);
  const shotBytes = shots.reduce((sum, name) => sum + statSync(join(OUT_DIR, 'screenshots', name)).size, 0);

  console.log(`hand-in written to ${OUT_DIR}`);
  console.log(`  game/         ${plural(stagedGame.files.length, 'file', 'files')}, ${stagedGame.totalBytes} bytes (${kib(stagedGame.totalBytes)})`);
  console.log(`  screenshots/  ${plural(shots.length, 'file', 'files')}, ${shotBytes} bytes (${kib(shotBytes)}): ${shots.join(', ')}`);
  console.log(`  dossier.json  ${written} bytes (${kib(written)})`);
}

// ---------------------------------------------------------------- the run

function main() {
  const shots = collectScreenshots();
  inspectGame();
  stage(shots);
  finish(shots);
}

try {
  main();
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`hand-in failed: ${message}`);
  process.exitCode = 1;
}