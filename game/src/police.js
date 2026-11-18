// The Vice Meridian Police Department, as a state machine.
//
// Stars. A crime raises `stars`, from 1 to 5, and each star buys one more cruiser on the street.
//
// Cruisers. A cruiser is born on an avenue 150 to 225 m away and wide of the camera's view cone, so
// the heat arrives from behind or round a corner and never out of thin air. It drives the grid
// toward the player rather than at them — a car that aims straight at somebody wedges itself in a
// block corner within a hundred metres — and inside about 34 m it kills the engine and its crew
// dismounts.
//
// Officers. They leave the car on the far side, hold the ground between 9 and 30 m, fire on a
// cadence at any line of sight inside `copRange`, and close in otherwise. Three rounds put one
// down. One of the crew always walks in to make the collar, because a crew that only ever shoots
// from across the street means nobody is ever arrested.
//
// Cooling. `seen` is true while any cruiser or officer has a clear line to the player. After
// `calmAfter` seconds out of sight the heat starts to drain, and every `drainFor` seconds of quiet
// costs a star; losing the last one sends the board home.

import { LAW } from './config.js';
import { AVENUES, CITY, KERB } from './plan.js';
import { seeded } from './seed.js';
import { wrap } from './angles.js';
import { makeCar } from './traffic.js';
import { CRUISER_WHITE } from './carKit.js';

export function newPolice(seed = 1) {
  return {
    stars: 0,
    heat: 0,
    quiet: 0,
    seen: false,
    units: [],
    rounds: [],
    rand: seeded(seed * 13 + 5),
    alarm: 0,
    killed: 0,
    busted: 0,
    clock: 0,
    nextSpawn: 0,
  };
}

/**
 * A crime worth `n` stars. A shot is one, a body three, grand theft one or two depending on
 * whether a cruiser saw it. Reaching a level from clean jumps straight to `n`; escalating from an
 * existing level goes up one at a time, so a spree climbs rather than teleporting to five.
 */
export function raiseHeat(police, n = 1) {
  const before = police.stars;
  police.stars = before === 0 ? Math.min(LAW.maxStars, Math.max(1, n)) : Math.min(LAW.maxStars, before + 1);
  if (police.stars > before) police.alarm = 1.6;
  police.heat = 1;
  police.quiet = 0;
}

/** Everything goes home: used on an arrest, a death and a restart. */
export function standDown(police) {
  police.stars = 0;
  police.heat = 0;
  police.quiet = 0;
  police.seen = false;
  police.units.length = 0;
  police.rounds.length = 0;
}

/**
 * Can `from` see `to`? Sampled every ten metres through the blocks at chest height. Anything past
 * 160 m counts as visible: at that range the fog owns the silhouette anyway.
 */
export function sightLine(plan, from, to) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const d = Math.hypot(dx, dz);
  if (d > 160) return true;
  const steps = Math.max(3, Math.ceil(d / 10));
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    if (plan.buildingAt(from.x + dx * t, from.z + dz * t, 0.2)) return false;
  }
  return true;
}

/** One cruiser's crew: two officers, seated until the doors open. */
function newCrew(x, z, yaw, rand) {
  const crew = [];
  for (let i = 0; i < LAW.crew; i += 1) {
    crew.push({
      x,
      z,
      yaw,
      hp: 3,
      cool: 0.5 + rand() * 0.8,
      alive: true,
      down: 0,
      seat: i,
      moving: 0,
      inCar: true,
      flash: 0,
      collar: i === 0,
    });
  }
  return crew;
}

export function newUnit(x, z, yaw, police, extra = {}) {
  const car = makeCar('cruiser', x, z, yaw, CRUISER_WHITE, { id: police.units.length + 1 });
  const unit = {
    car,
    x,
    z,
    yaw,
    speed: 20,
    mode: 'chase', // chase -> stop -> deployed
    officers: newCrew(x, z, yaw, police.rand),
    tag: `vmpd-${String(police.units.length + 1).padStart(2, '0')}`,
    age: 0,
    siren: 0,
    ...extra,
  };
  police.units.push(unit);
  return unit;
}

/**
 * Put a cruiser on the map out of sight.
 *
 * The avenue matters as much as the distance. A car that runs along x must sit on an avenue whose
 * z is near the player's, and one that runs along z on an avenue whose x is near the player's;
 * otherwise it is born on the far side of the grid and spends the entire pursuit crossing town.
 */
function pickSpawn(police, player, viewYaw) {
  const rand = police.rand;
  const min = CITY.first;
  const max = CITY.last;
  for (let tries = 0; tries < 40; tries += 1) {
    const dir = { dx: 0, dz: 0 };
    const pick = rand.whole(0, 3);
    if (pick === 0) dir.dx = 1;
    else if (pick === 1) dir.dx = -1;
    else if (pick === 2) dir.dz = 1;
    else dir.dz = -1;

    const across = dir.dx !== 0 ? player.z : player.x;
    const ranked = AVENUES.map((line) => ({ line, gap: Math.abs(line - across) }))
      .sort((a, b) => a.gap - b.gap)
      .slice(0, 3);
    const line = ranked[tries % ranked.length].line;

    const d = rand.span(LAW.spawnMin, LAW.spawnMax);
    // In the right-hand lane for a car coming at the player from that side.
    const off = dir.dx !== 0 ? (dir.dx > 0 ? 7 : -7) : dir.dz > 0 ? -7 : 7;
    const x = dir.dx !== 0 ? player.x + dir.dx * d : line + off;
    const z = dir.dz !== 0 ? player.z + dir.dz * d : line + off;
    if (x < min || x > max || z < min || z > max) continue;
    if (police.units.some((u) => Math.hypot(u.x - x, u.z - z) < 60)) continue;
    const bearing = Math.atan2(z - player.z, x - player.x);
    if (Math.abs(wrap(bearing - viewYaw)) < 1.15) continue;
    return { x, z, dx: dir.dx, dz: dir.dz };
  }
  // Nothing out of sight: a point on the nearest avenue at range will do, and the cruiser appears
  // over the horizon rather than not at all.
  const line = nearestLine(player.z);
  const x = player.x;
  const z = line + (line > player.z ? -LAW.spawnMin : LAW.spawnMin);
  if (x < min || x > max || z < min || z > max) return null;
  return { x, z, dx: 0, dz: z > player.z ? -1 : 1 };
}

/**
 * Step the response by dt. `ctx` carries the player (with an approximate velocity), the solid
 * blockers cruisers must not drive through, a callback for each officer's shot, the camera heading
 * (for spawning out of view), and hitTest/onHit: whether a police round has found the player and
 * what to do about it.
 */
export function runPolice(police, dt, plan, ctx) {
  const { player, blockers = [], onFire = null, viewYaw = 0, hitTest = null, onHit = null } = ctx;
  police.alarm = Math.max(0, police.alarm - dt);
  police.clock += dt;

  // ---- who can see the player?
  let seen = false;
  for (const u of police.units) {
    if (Math.hypot(u.x - player.x, u.z - player.z) < 120 && sightLine(plan, u, player)) seen = true;
    for (const o of u.officers) {
      if (!o.alive || o.inCar) continue;
      if (Math.hypot(o.x - player.x, o.z - player.z) < LAW.copRange && sightLine(plan, o, player)) seen = true;
    }
  }
  police.seen = seen;

  if (police.stars > 0) {
    if (seen) {
      police.quiet = 0;
    } else {
      police.quiet += dt;
      if (police.quiet > LAW.calmAfter) {
        police.heat -= dt / LAW.drainFor;
        if (police.heat <= 0) {
          police.stars -= 1;
          police.heat = police.stars > 0 ? 0.75 : 0;
          police.quiet = LAW.calmAfter * 0.4;
          if (police.stars <= 0) standDown(police);
        }
      }
    }
  }

  // ---- the quota: one cruiser per star, arriving out of sight.
  const want = police.stars > 0 ? LAW.perStar[police.stars] ?? police.stars : 0;
  if (police.units.length < want && police.clock >= police.nextSpawn) {
    const spot = pickSpawn(police, player, viewYaw);
    if (spot) {
      // The spot lies `d` metres away along (dx, dz), so the cruiser drives back along (-dx, -dz).
      newUnit(spot.x, spot.z, Math.atan2(-spot.dz, -spot.dx), police);
      police.nextSpawn = police.clock + Math.max(1.4, 4.2 - police.stars * 0.6);
    }
  }

  for (const u of police.units) {
    u.age += dt;
    driveCruiser(u, dt, plan, player, blockers);
  }

  // ---- officers on foot, and the rounds they have fired.
  for (const u of police.units) {
    for (const o of u.officers) {
      if (o.down > 0) {
        o.down -= dt;
        if (o.down <= 0) o.alive = false;
        continue;
      }
      if (!o.alive || o.inCar) continue;
      stepOfficer(police, o, dt, plan, player, onFire);
    }
  }
  // ---- the rounds, walked in short hops so none tunnels through the player at 145 m/s, and
  // stopped by the first wall they meet.
  for (let i = police.rounds.length - 1; i >= 0; i -= 1) {
    const s = police.rounds[i];
    const travel = Math.hypot(s.vx, s.vz) * dt;
    const hops = Math.max(1, Math.ceil(travel / 0.5));
    let spent = false;
    for (let h = 0; h < hops && !spent; h += 1) {
      s.x += (s.vx * dt) / hops;
      s.z += (s.vz * dt) / hops;
      if (hitTest && hitTest(s.x, s.z)) {
        spent = true;
        if (onHit) onHit(s);
      } else if (plan.buildingAt(s.x, s.z, 0)) {
        spent = true;
      }
    }
    s.life -= dt;
    if (spent || s.life <= 0) police.rounds.splice(i, 1);
  }

  // ---- retire the cruisers the quota no longer needs, and send their crews home.
  if (police.units.length > want) {
    police.units.splice(want).forEach((u) => u.officers.forEach((o) => (o.alive = false)));
  }
}

function nearestLine(v) {
  let best = AVENUES[0];
  for (const line of AVENUES) if (Math.abs(line - v) < Math.abs(best - v)) best = line;
  return best;
}

// How far off an avenue a car may be and still count as driving along it.
const ON_STREET = 26;

/**
 * The point a cruiser drives at next.
 *
 *   - Already on one of the player's streets (within ON_STREET of the player's avenue on the axis
 *     it travels, or on the player's cross street)? The straight line to the player runs down that
 *     street, so take it.
 *   - Not? Then run to the junction of its own avenue and the player's other avenue, which puts it
 *     on a street that does lead to the player.
 *
 * The gap between those two cases is what stops the old failure mode: a car aiming at a corner it
 * can never quite reach orbits it at full throttle and never arrives. Aiming at a street means the
 * target is a long line, not a point, and overshooting it is harmless.
 */
function routeTo(u, player) {
  const ownX = nearestLine(u.x);
  const ownZ = nearestLine(u.z);
  const targetX = nearestLine(player.x);
  const targetZ = nearestLine(player.z);

  const onPlayerStreetX = Math.abs(u.z - targetZ) < ON_STREET;
  const onPlayerStreetZ = Math.abs(u.x - targetX) < ON_STREET;
  if (onPlayerStreetX || onPlayerStreetZ) return { x: player.x, z: player.z };

  const northSouth = Math.abs(u.x - ownX) < Math.abs(u.z - ownZ);
  if (northSouth) return { x: ownX, z: targetZ };
  return { x: targetX, z: ownZ };
}

/**
 * Drive one cruiser down the streets toward the player.
 *
 * It follows the grid until it is on a street that leads to them and only then takes the straight
 * line. Anything directly in front of the nose bends the wheel away from it, and a wall it does
 * hit costs most of its speed.
 */
function driveCruiser(u, dt, plan, player, blockers) {
  const dx = player.x - u.x;
  const dz = player.z - u.z;
  const dist = Math.hypot(dx, dz) || 1;

  const cruise = dist > 120 ? 30 : dist > 46 ? 20 : 9;
  const want = dist < 26 ? 0 : cruise;
  u.speed += (want - u.speed) * Math.min(1, dt * (want < u.speed ? 3.6 : 1.4));
  u.speed = Math.max(0, Math.min(38, u.speed));

  const aim = routeTo(u, player);
  // Close in, lead the player rather than chase where they have been.
  if (aim.x === player.x && aim.z === player.z && dist < 60) {
    aim.x += (player.vx ?? 0) * 0.35;
    aim.z += (player.vz ?? 0) * 0.35;
  }

  let steer = wrap(Math.atan2(aim.z - u.z, aim.x - u.x) - u.yaw);
  for (const b of blockers) {
    if (b === u.car) continue;
    const fx = b.x - u.x;
    const fz = b.z - u.z;
    const ahead = fx * Math.cos(u.yaw) + fz * Math.sin(u.yaw);
    const side = fx * Math.sin(u.yaw) - fz * Math.cos(u.yaw);
    if (ahead > 0 && ahead < 14 && Math.abs(side) < 3.4) steer += side > 0 ? -1.6 : 1.6;
  }
  u.yaw += Math.max(-1.9 * dt, Math.min(1.9 * dt, steer)) * Math.min(1, Math.abs(u.speed) / 5 + 0.25);

  const nx = u.x + Math.cos(u.yaw) * u.speed * dt;
  const nz = u.z + Math.sin(u.yaw) * u.speed * dt;
  if (!plan.buildingAt(nx, nz, 1.3) && !plan.inWater(nx, nz)) {
    u.x = nx;
    u.z = nz;
  } else {
    // A wall: crawl, and turn hard enough to come off it on the next street.
    u.speed *= 0.4;
    u.yaw += 1.9 * dt;
  }

  u.car.x = u.x;
  u.car.z = u.z;
  u.car.yaw = u.yaw;
  u.car.speed = u.speed;
  u.car.lights = want < u.speed ? 1 : 0;
  u.siren += dt;

  // Close enough: stop, and let the crew out on the far side of the car.
  if (dist < LAW.dismount && u.mode === 'chase') u.mode = 'stop';
  if (u.mode === 'stop' && (u.speed < 1.2 || dist < 20)) {
    u.mode = 'deployed';
    for (const [i, o] of u.officers.entries()) {
      const side = u.yaw + Math.PI + (i === 0 ? -0.7 : 0.7);
      const ox = u.x + Math.cos(side) * 3.2;
      const oz = u.z + Math.sin(side) * 3.2;
      const clear = !plan.buildingAt(ox, oz, 0.5) && !plan.inWater(ox, oz);
      o.x = clear ? ox : u.x;
      o.z = clear ? oz : u.z;
      o.inCar = false;
      o.yaw = Math.atan2(player.z - o.z, player.x - o.x);
    }
  }
  // Left behind: the crew gets back in and the chase resumes.
  if (u.mode === 'deployed' && dist > 48) {
    u.mode = 'chase';
    for (const o of u.officers) {
      if (o.alive && !o.inCar && Math.hypot(o.x - u.x, o.z - u.z) > 34) o.inCar = true;
    }
  }
}

function stepOfficer(police, o, dt, plan, player, onFire) {
  const dx = player.x - o.x;
  const dz = player.z - o.z;
  const dist = Math.hypot(dx, dz) || 1;
  o.yaw = Math.atan2(dz, dx);
  const sight = sightLine(plan, o, player);

  // Most of the crew holds the ground between 9 and 30 m and shoots from there. One of them, the
  // one who came out first, walks in to make the collar: an arrest needs a hand on a shoulder.
  const closer = o.collar === true;
  let move = 0;
  if (!sight || dist > 30) move = 1;
  else if (closer ? dist > 1.3 : dist < 9) move = closer ? 1 : -1;
  if (move !== 0) {
    const step = (closer && dist < 12 ? LAW.copWalk * 1.2 : move > 0 ? LAW.copRun : LAW.copWalk) * dt;
    const nx = o.x + (dx / dist) * step;
    const nz = o.z + (dz / dist) * step;
    if (!plan.buildingAt(nx, o.z, 0.45)) o.x = nx;
    if (!plan.buildingAt(o.x, nz, 0.45)) o.z = nz;
    o.moving = 1;
  } else {
    o.moving = 0;
  }

  o.cool -= dt;
  o.flash = Math.max(0, o.flash - dt * 8);
  if (o.cool <= 0 && sight && dist < LAW.copRange && (!closer || dist > 3.5)) {
    o.cool = LAW.fireGap + police.rand() * 0.55;
    o.flash = 1;
    const spread = (police.rand() - 0.5) * 0.09 + (dist > 40 ? 0.03 : 0);
    const heading = o.yaw + spread;
    police.rounds.push({
      x: o.x + Math.cos(heading) * 0.6,
      z: o.z + Math.sin(heading) * 0.6,
      vx: Math.cos(heading) * LAW.bullet,
      vz: Math.sin(heading) * LAW.bullet,
      life: LAW.copRange / LAW.bullet,
      y: 1.35,
    });
    if (onFire) onFire(o, heading);
  }
}

/** A player's round that lands on an officer. Three put one down. */
export function hitOfficer(police, x, z, r = 0.7) {
  for (const u of police.units) {
    for (const o of u.officers) {
      if (!o.alive || o.inCar) continue;
      if (Math.hypot(o.x - x, o.z - z) >= r) continue;
      o.hp -= 1;
      if (o.hp <= 0) {
        o.down = 0.9;
        police.killed += 1;
      }
      return o;
    }
  }
  return null;
}

/** A cruiser sitting on a stopped player, or an officer close enough to put cuffs on them. */
export function arrestAt(police, x, z) {
  if (police.stars <= 0) return null;
  for (const u of police.units) {
    if (u.mode === 'deployed' && Math.hypot(u.x - x, u.z - z) < 5.4) return u;
    for (const o of u.officers) {
      if (o.alive && !o.inCar && Math.hypot(o.x - x, o.z - z) < 1.9) return u;
    }
  }
  return null;
}

export { KERB };