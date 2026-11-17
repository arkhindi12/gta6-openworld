// The crowd: people walking the pavements, and what a gunshot does to them.
//
// A person is a small record: a spot, a direction, a stride phase, a mood. They walk the strip
// between the kerb and a building's setback, turn at the corners when the wander wants them to,
// and never walk into a wall — if the next step is into one, they turn.
//
// A shot within earshot turns everybody round and sends them running away from it, and the sight of
// a body does the same to anyone close enough to see one. A round that lands on a body drops it,
// and the fall is permanent for the length of a life: the record stays where it fell with `down`
// counting the seconds since, which is what the renderer uses to lay it out.
//
// Nothing here knows what a mesh is. The renderer reads x, z, yaw, phase, moving, run, down.

import { CROWD, PALETTE } from './settings.js';
import { avenues, COAST, districtOf } from './layout.js';
import { rngFrom, wrap } from './random.js';

// The pavement strip runs from just outside the kerb to a building's setback.
const KERB = 24 + 1.6;
const EDGE = 24 + 7.4;

/** A person. `extra` can override any field, which is how a staged scene dresses a pedestrian. */
export function newPerson(rand, x, z, yaw = 0, extra = {}) {
  return {
    x,
    z,
    yaw,
    dir: { x: Math.cos(yaw), z: Math.sin(yaw) },
    pace: rand.range(CROWD.walk[0], CROWD.walk[1]),
    phase: rand.range(0, Math.PI * 2),
    moving: 1,
    run: 0,
    down: 0,
    panic: 0,
    hat: rand.chance(0.22),
    skin: rand.pick(PALETTE.skins),
    shirt: rand.pick(PALETTE.shirts),
    trousers: rand.pick(PALETTE.trousers),
    bag: rand.chance(0.25),
    district: 'street',
    ...extra,
  };
}

/** The seeded crowd: spread along both sides of every avenue. */
export function seedCrowd(seed = 5) {
  const rand = rngFrom(seed);
  const lines = avenues();
  const last = lines[lines.length - 1];
  const people = [];
  let guard = 0;
  while (people.length < CROWD.count && guard < CROWD.count * 40) {
    guard += 1;
    const alongX = rand.chance();
    const line = rand.pick(lines);
    const side = rand.chance() ? 1 : -1;
    const along = rand.range(-2, last + 2);
    const off = rand.range(KERB + 0.6, EDGE - 0.6);
    const x = alongX ? along : line + side * off;
    const z = alongX ? line + side * off : along;
    if (x < COAST.shore + 2 || z > COAST.bay - 2) continue;
    const alongDir = rand.chance() ? 1 : -1;
    const yaw = alongX ? (alongDir > 0 ? 0 : Math.PI) : alongDir > 0 ? Math.PI / 2 : -Math.PI / 2;
    people.push(newPerson(rand, x, z, yaw));
  }
  return people;
}

/**
 * A shot went off at (x, z): everybody within `radius` turns and runs the other way. `onFirst`
 * fires once, on the first person who heard it, which is how the caller learns somebody saw.
 */
export function scatterCrowd(people, x, z, radius = 46, onFirst = null) {
  let first = true;
  for (const p of people) {
    if (p.down > 0) continue;
    const d = Math.hypot(p.x - x, p.z - z);
    if (d > radius) continue;
    // Straight away from the noise, with a little shoulder-room so a crowd fans out.
    const a = Math.atan2(p.z - z, p.x - x) + Math.sin(p.phase * 7.3) * 0.5;
    p.dir = { x: Math.cos(a), z: Math.sin(a) };
    p.yaw = a;
    p.panic = 3.6 + Math.min(3, d * 0.05);
    p.run = 1;
    if (first && onFirst) {
      onFirst(p);
      first = false;
    }
  }
}

/** Somebody saw a body: they run from it, a beat later than the shot itself. */
function flinchAtBodies(people, i) {
  const p = people[i];
  for (let k = 0; k < people.length; k += 1) {
    if (k === i) continue;
    const other = people[k];
    if (other.down <= 0) continue;
    if (Math.hypot(p.x - other.x, p.z - other.z) > 14) continue;
    const a = Math.atan2(p.z - other.z, p.x - other.x);
    p.dir = { x: Math.cos(a), z: Math.sin(a) };
    p.yaw = a;
    p.panic = Math.max(p.panic, 2.6);
    return;
  }
}

/**
 * Step the crowd. `time` only drives a slow wander so nobody walks a perfect line; `player` is
 * passed when the player is on foot, so the crowd parts around them instead of through them.
 */
export function walkCrowd(people, dt, time, layout, player = null) {
  const lines = avenues();
  const lastLine = lines[lines.length - 1];
  for (let i = 0; i < people.length; i += 1) {
    const p = people[i];
    if (p.down > 0) {
      p.down += dt;
      continue;
    }
    p.panic = Math.max(0, p.panic - dt);
    const running = p.panic > 0.3;
    p.run = running ? 1 : 0;
    const speed = running ? CROWD.flee : p.pace;
    if (running && p.panic > 3.0) flinchAtBodies(people, i);
    p.phase += dt * (running ? 13 : 5.6) * (p.pace / 1.5);

    // The body turns toward where it is going, at a walking rate.
    const want = Math.atan2(p.dir.z, p.dir.x);
    p.yaw += Math.max(-8 * dt, Math.min(8 * dt, wrap(want - p.yaw)));

    const mag = Math.hypot(p.dir.x, p.dir.z) || 1;
    const nx = p.x + (p.dir.x / mag) * speed * dt;
    const nz = p.z + (p.dir.z / mag) * speed * dt;
    if (layout.isOpen(nx, nz, 0.35)) {
      p.x = nx;
      p.z = nz;
      p.moving = 1;
    } else {
      // A wall or the water: turn hard, and if running, turn along it rather than into it.
      const a = running ? p.yaw + Math.PI * 0.5 * (Math.sin(p.phase * 0.7) > 0 ? 1 : -1) : p.yaw + Math.PI;
      p.dir = { x: Math.cos(a), z: Math.sin(a) };
      p.moving = running ? 1 : 0;
    }

    if (!running) {
      // A pedestrian turns off the pavement now and then, but only near an avenue corner.
      const nearLine = lines.some((l) => Math.abs(p.x - l) < EDGE + 2 || Math.abs(p.z - l) < EDGE + 2);
      if (nearLine && Math.sin(p.x * 0.011 + p.z * 0.007 + time * 0.31) > 0.985) {
        p.dir = Math.random() < 0.5 ? { x: -p.dir.z, z: p.dir.x } : { x: p.dir.z, z: -p.dir.x };
      }
      // And nobody walks into the same wall twice: glance a couple of metres ahead.
      const onX = Math.abs(Math.cos(p.yaw)) > 0.5;
      if (onX && layout.buildingAt(p.x + Math.cos(p.yaw) * 2.5, p.z, 0.3)) p.dir = { x: -p.dir.x, z: p.dir.z };
      if (!onX && layout.buildingAt(p.x, p.z + Math.sin(p.yaw) * 2.5, 0.3)) p.dir = { x: p.dir.x, z: -p.dir.z };
    } else {
      // A person fleeing the street keeps inside the grid: the edge turns them along it.
      if (p.x < 0 || p.x > lastLine) p.dir = { x: -p.dir.x, z: p.dir.z };
      if (p.z < 0 || p.z > lastLine) p.dir = { x: p.dir.x, z: -p.dir.z };
    }

    // The player shoulders through the crowd rather than over it.
    if (player) {
      const gap = Math.hypot(p.x - player.x, p.z - player.z);
      if (gap < 1.1 && gap > 0.001) {
        p.x += ((p.x - player.x) / gap) * (1.1 - gap);
        p.z += ((p.z - player.z) / gap) * (1.1 - gap);
      }
    }
    p.district = districtOf(p.x, p.z);
  }
}

/** The nearest standing person within `r` of a point, or null. */
export function personAt(people, x, z, r = 0.6) {
  let best = null;
  let gap = r;
  for (const p of people) {
    if (p.down > 0) continue;
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < gap) {
      gap = d;
      best = p;
    }
  }
  return best;
}

/** Drop everybody within `r` of a point. Returns how many fell. */
export function fellAt(people, x, z, r = 0.75) {
  let fell = 0;
  for (const p of people) {
    if (p.down > 0) continue;
    if (Math.hypot(p.x - x, p.z - z) < r) {
      p.down = 0.001;
      p.moving = 0;
      fell += 1;
    }
  }
  return fell;
}

/**
 * How far ahead a car may drive before a body in its path stops it. Walking people do not block
 * traffic; somebody lying in the lane does, which is what makes a shootout jam the street.
 */
export function bodyAhead(people, x, z, yaw, reach = 12, halfWidth = 1.6) {
  let best = Infinity;
  const fx = Math.cos(yaw);
  const fz = Math.sin(yaw);
  for (const p of people) {
    if (p.down <= 0) continue;
    const dx = p.x - x;
    const dz = p.z - z;
    const ahead = dx * fx + dz * fz;
    if (ahead <= 0 || ahead >= reach) continue;
    if (Math.abs(dx * fz - dz * fx) >= halfWidth) continue;
    best = Math.min(best, ahead - 1.4);
  }
  return best;
}