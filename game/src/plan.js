// The plan of the city: which avenues exist, what stands on each block, and the two questions the
// rest of the game asks about it — "may somebody stand here?" and "is this in the sea?".
//
// Records only. No meshes, no simulation, no three.js. That is what lets the renderer build the
// world from the same data the player walks through, and what lets a staged photograph be staged
// against the geometry the collision test uses.
//
// A block is the square between four avenues: 206 m across, starting 23 m in from an avenue's
// centre line. Its buildings sit 13 m further in, which leaves a pavement ring the width of a
// sidewalk for the crowd to walk and the palms to line.

import { GRID, CITY, PALETTE } from './config.js';
import { seeded } from './seed.js';

export const PITCH = GRID.pitch;
export const KERB = GRID.kerb;
export const SETBACK = GRID.setback;
export const AVENUE_LAST = CITY.last - KERB;

/** West of the first avenue: promenade, then beach, then water. South of the last: quay, then bay. */
export const SHORE = {
  kerb: -KERB,
  promenade: -98,
  sand: -268,
  water: -304,
  quay: CITY.last,
  bay: CITY.last + 34,
};

export const EDGE = {
  x0: SHORE.water,
  x1: CITY.last,
  z0: CITY.first,
  z1: SHORE.bay,
};

export { CITY };

const LINES = [];
for (let i = 0; i < GRID.cols; i += 1) LINES.push(i * PITCH);

/** The centre line of every avenue. Both axes share the list, because the grid is square. */
export const AVENUES = LINES;

const QUARTERS = [
  { name: 'Gulf Promenade', test: (x) => x < 30 },
  { name: 'Neon Heights', test: (x, z) => x > 540 && x < 1080 && z > 360 && z < 1080 },
  { name: 'Coral Marina', test: (x, z) => z > 1290 },
  { name: 'Osprey Harbor', test: (x, z) => x > 1260 && z < 1310 },
  { name: 'Riviera Palms', test: (x, z) => x < 540 && z < 940 },
  { name: 'Sunglass Strip', test: (x, z) => z < 340 },
];

/** Which quarter of town a point is in, for the caption under the minimap. */
export function quarterOf(x, z) {
  for (const q of QUARTERS) if (q.test(x, z)) return q.name;
  return 'Vice Meridian';
}

export class CityPlan {
  constructor(seed = 1) {
    this.seed = seed;
    this.blocks = [];
    this.buildings = [];
    this.parks = [];
    this.layOut(seeded(seed));
  }

  /** Decide every block's character, then fill it. */
  layOut(rand) {
    for (let row = 0; row < GRID.rows - 1; row += 1) {
      for (let col = 0; col < GRID.cols - 1; col += 1) {
        const block = {
          col,
          row,
          x: col * PITCH + KERB,
          z: row * PITCH + KERB,
          w: CITY.blockSide,
          h: CITY.blockSide,
          // 1 downtown, 0 at the rim: the glass goes in the middle and the low shops out on the edge.
          core: Math.max(0, 1 - Math.hypot((col - 2.5) / 3.0, (row - 2.5) / 3.0)),
          kind: 'street',
        };
        const roll = rand();
        if (block.core > 0.2 && roll < 0.86) block.kind = 'tower';
        else if (roll < 0.14) block.kind = 'park';
        this.blocks.push(block);

        if (block.kind === 'park') {
          this.parks.push({ block, x: block.x, z: block.z, w: block.w, h: block.h, palms: rand.whole(16, 24) });
        } else {
          this.cutLots(block, rand);
        }
      }
    }
  }

  /**
   * Two lots across and two down, with a service lane between them — or, for a lucky tower block,
   * one squat skyscraper. Each lot leaves 4 to 7 m of walkway to the pavement, which is the front
   * the shopfronts hang on and the neon boards face.
   */
  cutLots(block, rand) {
    const single = block.kind === 'tower' && rand() < 0.4;
    const across = single ? 1 : 2;
    const down = single ? 1 : 2;
    const lane = single ? 0 : 6;
    const innerW = block.w - SETBACK * 2;
    const innerH = block.h - SETBACK * 2;
    const lotW = (innerW - lane * (across - 1)) / across;
    const lotH = (innerH - lane * (down - 1)) / down;

    for (let r = 0; r < down; r += 1) {
      for (let c = 0; c < across; c += 1) {
        const margin = rand.span(4, 7.2);
        const w = lotW - margin * 2;
        const d = lotH - margin * 2;
        if (w < 12 || d < 12) continue;

        const floors = single ? rand.whole(22, 42) : block.kind === 'tower' ? rand.whole(10, 26) : rand.whole(2, 7);
        const base = Math.max(2, Math.round(floors * rand.span(0.28, 0.46)));
        // A wide podium with a slimmer shaft out of it is what makes a skyline read as a skyline
        // rather than as a row of boxes.
        const shafted = floors > base + 3 && rand() < 0.7;
        this.buildings.push({
          x: block.x + SETBACK + c * (lotW + lane) + margin,
          z: block.z + SETBACK + r * (lotH + lane) + margin,
          w,
          d,
          floors,
          height: floors * GRID.storey + 1.4,
          podium: shafted ? base * GRID.storey : 0,
          shaft: shafted ? { w: w * rand.span(0.5, 0.8), d: d * rand.span(0.5, 0.8) } : null,
          wall: rand.oneOf(block.kind === 'tower' ? PALETTE.glass : PALETTE.walls),
          shade: rand.span(0.86, 1.12),
          lit: rand.span(0.26, 0.68),
          neon: rand() < (block.kind === 'tower' ? 0.58 : 0.36) ? rand.oneOf(PALETTE.neon) : null,
          neonFace: rand.whole(0, 3),
          seed: rand.whole(1, 99999),
          crown: floors > 8 ? rand.oneOf(['antenna', 'box', 'none', 'box']) : rand.oneOf(['none', 'box', 'ac', 'none']),
        });
      }
    }
  }

  /** The first building whose footprint, grown by `pad`, holds the point, or null. */
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
    return x < SHORE.water || z > SHORE.bay;
  }

  /** May somebody stand here? Not in the sea, not inside a wall. */
  isOpen(x, z, r = 0.4) {
    if (this.inWater(x, z)) return false;
    return this.buildingAt(x, z, r) === null;
  }

  /** True within `pad` of an avenue's centre line, on either axis. */
  onAvenue(x, z, pad = 0) {
    for (let i = 0; i < LINES.length; i += 1) {
      if (Math.abs(x - LINES[i]) < KERB + pad) return true;
      if (Math.abs(z - LINES[i]) < KERB + pad) return true;
    }
    return false;
  }

  /** The avenue line nearest a single coordinate. */
  nearestAvenue(v) {
    let best = LINES[0];
    let gap = Infinity;
    for (const line of LINES) {
      const d = Math.abs(v - line);
      if (d < gap) {
        gap = d;
        best = line;
      }
    }
    return best;
  }

  /** The pavement strip a pedestrian may walk: outside the kerb, inside the setback. */
  onPavement(x, z) {
    for (const line of LINES) {
      const dz = Math.abs(z - line);
      const dx = Math.abs(x - line);
      if (dz > KERB && dz < KERB + SETBACK && x > SHORE.promenade && x < CITY.last) return true;
      if (dx > KERB && dx < KERB + SETBACK && z > CITY.first && z < SHORE.quay) return true;
    }
    return false;
  }
}