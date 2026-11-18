// cityPlan.js — the town as plain records, and the four questions the rest of the game asks it.
//
// No meshes and no three.js: this module decides what stands where, and answers "may a body stand
// at this point", "is this the sea", "is this an avenue" and "which part of town is this". The
// renderer builds its geometry from exactly these records and the collision tests read the same
// ones, so what you can see and what you can walk into can never disagree.
//
// A block is the square between four avenues. Its buildings sit one pavement-depth inside the
// kerb, which leaves a walking ring around every block — that ring is where the crowd lives and
// where the shopfronts and the neon face.

import { GRID, CITY, SHORE, PAINT } from './scale.js';
import { stream } from './random.js';

export const PITCH = GRID.pitch;
export const KERB = GRID.half;
export const WALK = GRID.setback;
export const SETBACK = GRID.setback;
export const AVENUES = Object.freeze(Array.from({ length: GRID.cols }, (_, i) => i * PITCH));

// The corners of the walkable town, used by the map and by anything that clamps to the streets.
export const EDGE = { x0: SHORE.water, x1: CITY.last, z0: CITY.first, z1: SHORE.bay };
export const BOUNDS = EDGE;
export { CITY, SHORE };

const DISTRICTS = [
  { name: 'Gulf Promenade', holds: (x) => x < 30 },
  { name: 'Sunglass Strip', holds: (x, z) => z < 340 },
  { name: 'Riviera Palms', holds: (x, z) => x < 540 && z < 940 },
  { name: 'Neon Heights', holds: (x, z) => x > 540 && x < 1080 && z > 360 && z < 1080 },
  { name: 'Osprey Harbor', holds: (x, z) => x > 1260 && z < 1310 },
  { name: 'Coral Marina', holds: (x, z) => z > 1290 },
];

/** The district a point falls in, for the caption under the minimap. */
export function districtOf(x, z) {
  for (const d of DISTRICTS) if (d.holds(x, z)) return d.name;
  return 'Vice Meridian';
}

export class CityPlan {
  constructor(seed = 1) {
    this.seed = seed;
    this.blocks = [];
    this.buildings = [];
    this.parks = [];
    this.survey(stream(seed));
  }

  /**
   * Walk the lattice once and give every block a character, then fill it. `centrality` is 1 at the
   * middle of town and 0 at the edge: the glass towers go where the money is and the low, busy
   * shopfronts out on the rim, which is what makes a skyline read from the water.
   */
  survey(rand) {
    for (let row = 0; row < GRID.rows - 1; row += 1) {
      for (let col = 0; col < GRID.cols - 1; col += 1) {
        const block = {
          col,
          row,
          x: col * PITCH + KERB,
          z: row * PITCH + KERB,
          w: CITY.blockSide,
          h: CITY.blockSide,
          centrality: Math.max(0, 1 - Math.hypot((col - 2.5) / 3, (row - 2.5) / 3)),
          kind: 'street',
        };
        const roll = rand();
        if (block.centrality > 0.2 && roll < 0.86) block.kind = 'tower';
        else if (roll < 0.14) block.kind = 'park';
        this.blocks.push(block);

        if (block.kind === 'park') {
          this.parks.push({ block, x: block.x, z: block.z, w: block.w, h: block.h, palms: rand.int(16, 24) });
        } else {
          this.lots(block, rand);
        }
      }
    }
  }

  /**
   * Cut a block into lots: normally two by two with a service lane between them, occasionally one
   * squat tower. Each lot is inset a few metres more than the pavement, so every frontage has a
   * strip of its own for the shopfront band and the neon to hang over.
   */
  lots(block, rand) {
    const oneTower = block.kind === 'tower' && rand() < 0.4;
    const cols = oneTower ? 1 : 2;
    const rows = oneTower ? 1 : 2;
    const lane = oneTower ? 0 : 6;
    const innerW = block.w - WALK * 2;
    const innerH = block.h - WALK * 2;
    const cellW = (innerW - lane * (cols - 1)) / cols;
    const cellH = (innerH - lane * (rows - 1)) / rows;

    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const trim = rand.between(4, 7.2);
        const w = cellW - trim * 2;
        const d = cellH - trim * 2;
        if (w < 12 || d < 12) continue;

        const floors = oneTower ? rand.int(22, 42) : block.kind === 'tower' ? rand.int(10, 26) : rand.int(2, 7);
        const podiumFloors = Math.max(2, Math.round(floors * rand.between(0.28, 0.46)));
        const stepped = floors > podiumFloors + 3 && rand() < 0.7;

        this.buildings.push({
          x: block.x + WALK + c * (cellW + lane) + trim,
          z: block.z + WALK + r * (cellH + lane) + trim,
          w,
          d,
          floors,
          height: floors * GRID.storey + 1.4,
          podium: stepped ? podiumFloors * GRID.storey : 0,
          shaft: stepped ? { w: w * rand.between(0.5, 0.8), d: d * rand.between(0.5, 0.8) } : null,
          wall: rand.pick(block.kind === 'tower' ? PAINT.curtain : PAINT.facades),
          tint: rand.between(0.86, 1.12),
          lit: rand.between(0.26, 0.68),
          neon: rand() < (block.kind === 'tower' ? 0.58 : 0.36) ? rand.pick(PAINT.neon) : null,
          neonSide: rand.int(0, 3),
          grain: rand.int(1, 99999),
          crown: floors > 8 ? rand.pick(['antenna', 'box', 'none', 'box']) : rand.pick(['none', 'box', 'ac', 'none']),
        });
      }
    }
  }

  /** The first building whose footprint, grown by `pad`, holds the point — or null. */
  buildingAt(x, z, pad = 0) {
    const list = this.buildings;
    for (let i = 0; i < list.length; i += 1) {
      const b = list[i];
      if (x > b.x - pad && x < b.x + b.w + pad && z > b.z - pad && z < b.z + b.d + pad) return b;
    }
    return null;
  }

  /** True outside the shoreline: west of the waterline, or south of the quay. */
  inWater(x, z) {
    return x < SHORE.water || z > SHORE.bay;
  }

  /** May a body stand here? Not in the sea, not inside a wall. */
  isOpen(x, z, pad = 0.4) {
    if (this.inWater(x, z)) return false;
    return this.buildingAt(x, z, pad) === null;
  }

  /** True within `pad` of an avenue centreline, on either axis. */
  onAvenue(x, z, pad = 0) {
    for (let i = 0; i < AVENUES.length; i += 1) {
      if (Math.abs(x - AVENUES[i]) < KERB + pad) return true;
      if (Math.abs(z - AVENUES[i]) < KERB + pad) return true;
    }
    return false;
  }

  /** The avenue line nearest one coordinate. */
  nearestAvenue(v) {
    let best = AVENUES[0];
    for (const line of AVENUES) if (Math.abs(line - v) < Math.abs(best - v)) best = line;
    return best;
  }

  /** The walking ring of a block: past the kerb, before the frontage. */
  onPavement(x, z) {
    for (const line of AVENUES) {
      const dz = Math.abs(z - line);
      const dx = Math.abs(x - line);
      if (dz > KERB && dz < KERB + WALK && x > SHORE.promenade && x < CITY.last) return true;
      if (dx > KERB && dx < KERB + WALK && z > CITY.first && z < SHORE.quay) return true;
    }
    return false;
  }
}