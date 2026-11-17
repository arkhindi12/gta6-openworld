// The layout: the grid of avenues, the blocks between them and what is built on each block.
//
// This file holds no meshes and no simulation - only records. The renderer in world.js turns
// them into geometry, and the walker in player.js (and the crowd, and the police) asks them
// whether a point is solid. Keeping the layout data-only is what lets a screenshot stage the
// city and a test walk through it without a renderer attached.
//
// The grid: avenues at x = k*264 and z = k*264 for k = 0..6, each 48 m kerbside to kerbside.
// Between two avenues sits a block 216 m square. Every block starts 12 m in from the kerb, which
// gives each one a pavement ring, and inside that ring a lot or two of buildings, or a park.

import { MAP, TOWN, PALETTE } from './tuning.js';
import { makeRandom } from './rng.js';

export const PITCH = MAP.block;
export const HALF_ROAD = MAP.road / 2;
export const SETBACK = MAP.walkInset;
export const LAST_LINE = (MAP.cols - 1) * PITCH;

// The west side of town: promenade, then sand, then water. The south side: quay, then bay.
export const COAST = {
  kerb: -HALF_ROAD,
  promenade: -104,
  sand: -300,
  shore: -336,
  quay: LAST_LINE + HALF_ROAD,
  bay: LAST_LINE + HALF_ROAD + 26,
};

export const BOUNDS = {
  roadMin: -HALF_ROAD,
  roadMax: LAST_LINE + HALF_ROAD,
  x0: COAST.shore,
  x1: LAST_LINE + HALF_ROAD,
  z0: TOWN.min,
  z1: COAST.bay + 40,
};

const AVENUES = [];
for (let i = 0; i < MAP.cols; i += 1) AVENUES.push(i * PITCH);

/** The centre line of every avenue, shared by both axes. */
export function avenues() {
  return AVENUES;
}

const DISTRICTS = [
  { name: 'Gulf Promenade', near: (x) => x < 20 },
  { name: 'Neon Heights', near: (x, z) => x > 560 && x < 1120 && z > 380 && z < 1120 },
  { name: 'Coral Marina', near: (x, z) => z > 1340 },
  { name: 'Osprey Harbor', near: (x, z) => x > 1300 && z < 1360 },
  { name: 'Riviera Palms', near: (x, z) => x < 560 && z < 980 },
  { name: 'Sunglass Strip', near: (x, z) => z < 360 },
];

/** The name of the neighbourhood a point stands in, for the HUD's caption. */
export function districtOf(x, z) {
  for (const d of DISTRICTS) if (d.near(x, z)) return d.name;
  return 'Vice Meridian';
}

// ---------------------------------------------------------------- the layout itself

export class CityLayout {
  constructor(seed = 1) {
    this.seed = seed;
    this.blocks = [];
    this.buildings = [];
    this.parks = [];
    const rand = makeRandom(seed);
    this.buildGrid(rand);
  }

  buildGrid(rand) {
    for (let row = 0; row < MAP.rows - 1; row += 1) {
      for (let col = 0; col < MAP.cols - 1; col += 1) {
        const side = PITCH - MAP.road;
        const x = col * PITCH + HALF_ROAD;
        const z = row * PITCH + HALF_ROAD;
        // How close the block is to the middle of town, 1 at the centre falling to 0 at the rim:
        // the tall glass goes downtown and the low shops go out to the strip.
        const heart = Math.max(0, 1 - Math.hypot((col - 2.5) / 2.5, (row - 2.5) / 2.5));
        const block = { col, row, x, z, w: side, h: side, heart, kind: 'street' };
        const roll = rand();
        if (heart > 0.3 && roll < 0.72) block.kind = 'tower';
        else if (roll < 0.13) block.kind = 'park';
        this.blocks.push(block);

        if (block.kind === 'park') {
          this.parks.push({ block, x, z, w: side, h: side, palms: rand.int(16, 24) });
        } else {
          this.fillBlock(block, rand);
        }
      }
    }
  }

  /**
   * Two lots across, two down, with a service lane between them - or, for a tower block with
   * the luck for it, a single squat skyscraper. Each lot leaves 4 to 7 m of walkway to its block's
   * pavement, which is where the buildings get their fronts to look at.
   */
  fillBlock(block, rand) {
    const whole = block.kind === 'tower' && rand() < 0.4;
    const cols = whole ? 1 : 2;
    const rows = whole ? 1 : 2;
    const lane = whole ? 0 : 6;
    const innerW = block.w - SETBACK * 2;
    const innerH = block.h - SETBACK * 2;
    const lotW = (innerW - lane * (cols - 1)) / cols;
    const lotH = (innerH - lane * (rows - 1)) / rows;
    const storey = 3.7;

    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const inset = rand.range(4, 7.2);
        const w = lotW - inset * 2;
        const d = lotH - inset * 2;
        if (w < 12 || d < 12) continue;
        const floors = whole
          ? rand.int(10, 22)
          : block.kind === 'tower'
            ? rand.int(5, 15)
            : rand.int(2, 7);
        const podium = Math.max(2, Math.round(floors * rand.range(0.28, 0.45)));
        // A tower with a setback shaft: the bottom third is wide, the rest is a slimmer tower
        // rising out of it, which is what makes a downdown skyline read as more than boxes.
        const shafted = floors > podium + 3 && rand() < 0.72;
        const neonChance = block.kind === 'tower' ? 0.6 : 0.38;
        this.buildings.push({
          x: block.x + SETBACK + c * (lotW + lane) + inset,
          z: block.z + SETBACK + r * (lotH + lane) + inset,
          w,
          d,
          floors,
          height: floors * storey + 1.4,
          podium: shafted ? podium * storey : 0,
          shaft: shafted
            ? { w: w * rand.range(0.5, 0.8), d: d * rand.range(0.5, 0.8) }
            : null,
          wall: rand.pick(block.kind === 'tower' ? PALETTE.glass : PALETTE.towers),
          tint: rand.range(0.86, 1.12),
          lit: rand.range(0.24, 0.7),
          neon: rand() < neonChance ? rand.pick(PALETTE.neon) : null,
          neonFace: rand.int(0, 3),
          seed: rand.int(1, 99999),
          crown: floors > 8
            ? rand.pick(['antenna', 'box', 'none', 'box'])
            : rand.pick(['none', 'box', 'ac', 'none']),
        });
      }
    }
  }

  /** The first building whose footprint (grown by `pad`) contains the point, or null. */
  buildingAt(x, z, pad = 0) {
    const list = this.buildings;
    for (let i = 0; i < list.length; i += 1) {
      const b = list[i];
      if (x > b.x - pad && x < b.x + b.w + pad && z > b.z - pad && z < b.z + b.d + pad) return b;
    }
    return null;
  }

  /** True west of the waterline or south of the quay. */
  inWater(x, z) {
    return x < COAST.shore || z > COAST.bay;
  }

  /** Can somebody stand here? Not in the sea, not inside a wall. */
  isOpen(x, z, r = 0.4) {
    if (this.inWater(x, z)) return false;
    return this.buildingAt(x, z, r) === null;
  }

  /** True within `pad` of any avenue centre line. */
  isRoad(x, z, pad = 0) {
    for (const line of AVENUES) {
      if (Math.abs(x - line) < HALF_ROAD + pad) return true;
      if (Math.abs(z - line) < HALF_ROAD + pad) return true;
    }
    return false;
  }

  /** The avenue line closest to a coordinate on either axis. */
  closestAvenue(v) {
    let best = AVENUES[0];
    let gap = Infinity;
    for (const line of AVENUES) {
      const d = Math.abs(v - line);
      if (d < gap) {
        gap = d;
        best = line;
      }
    }
    return best;
  }
}
