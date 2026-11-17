// The Vice Meridian Police Department, as a state machine.
//
// Stars. Crime raises `stars`, from 1 to 5. Each star buys one more cruiser on the street.
//
// Cruisers. A cruiser is born on an avenue 150 to 230 m from the player and outside the frame's
// view cone, so the heat arrives from behind or round a corner and never from thin air. It drives
// at the player by heading for the point a moment ahead of them, steering round whatever is
// directly in front. Inside about 34 m it kills the engine and the crew dismounts.
//
// Officers. They leave the car on the side away from the player, hold the ground between 9 and
// 30 m, fire on a cadence at any line of sight inside `copRange`, and close in otherwise. Three
// rounds put one down; the player's rounds are resolved by the scene and reported through
// hitOfficer.
//
// Cooling. `seen` is true while any cruiser or officer has a clear line to the player. After
// `coolAfter` seconds out of sight the heat starts to drain, and each `coolFor` seconds of quiet
// costs a star; losing the last one sends the board home.

import { LAW } from './settings.js';
import { avenues, HALF_ROAD } from './layout.js';
import { rngFrom, wrap } from './random.js';
import { newCar } from './traffic.js';
import { CRUISER_PAINT } from './vehicles.js';

/** A police state: no stars, no units, no rounds in the air. */
export function newPolice(seed = 3) {
  return {
    stars: 0,
    heat: 0,
    quiet: 0,
    seen: false,
    units: [],
    rounds: [],
    rand: rngFrom(seed * 13 + 5),
    alarm: 0,
    killed: 0,
    busted: 0,
    clock: 0,
    nextSpawn: 0,
  };
}

/**
 * A crime worth `n` stars. A shot is one; a body is three; grand theft with a witness is two.
 * Raising the level from clean jumps straight to `n`; raising it while already wanted goes up one
 * at a time, so a spree escalates rather than teleporting to five.
 */
export function raiseHeat(police, n = 1) {
  const before = police.stars;
  if (before === 0) police.stars = Math.min(LAW.maxStars, Math.max(1, n));
  else police.stars = Math.min(LAW.maxStars, before + 1);
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
 * Can `from` see `to`? Sampled every ten metres through the blocks at chest height. Anything
 * beyond 160 m counts as visible: at that range the fog owns the silhouette anyway.
 */
export function lineOfSight(layout, from, to) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const d = Math.hypot(dx, dz);
  if (d > 160) return true;
  const steps = Math.max(3, Math.ceil(d / 10));
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    if (layout.buildingAt(from.x + dx * t, from.z + dz * t, 0.2)) return false;
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
      collar: false,
    });
  }
  return crew;
}

/** A cruiser record, for the officers to belong to and the renderer to draw. */
export function newUnit(x, z, yaw, police, extra = {}) {
  const car = newCar('cruiser', x, z, yaw, CRUISER_PAINT, { id: police.units.length + 1 });
  car.len = 4.9;
  car.wid = 2.02;
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
 * Put a cruiser on the map out of sight: a point on an avenue that actually leads to the player,
 * at the wanted distance, with the bearing wide of the camera's forward direction.
 *
 * The avenue matters. A car that runs along x must sit on an avenue whose z is near the player's,
 * and one that runs along z on an avenue whose x is near the player's; otherwise it is born on the
 * far side of the grid and spends the whole chase crossing town.
 */
function pickSpawn(police, player, viewYaw) {
  const rand = police.rand;
  const lines = avenues();
  const min = lines[0] - HALF_ROAD;
  const max = lines[lines.length - 1] + HALF_ROAD;
  for (let tries = 0; tries < 40; tries += 1) {
    const dir = { dx: 0, dz: 0 };
    const pick = rand.int(0, 3);
    if (pick === 0) dir.dx = 1;
    else if (pick === 1) dir.dx = -1;
    else if (pick === 2) dir.dz = 1;
    else dir.dz = -1;

    // The avenues this heading runs along, nearest the player first.
    const across = dir.dx !== 0 ? player.z : player.x;
    const ranked = lines
      .map((line) => ({ line, gap: Math.abs(line - across) }))
      .sort((a, b) => a.gap - b.gap)
      .slice(0, 3);
    const line = ranked[tries % ranked.length].line;

    const d = rand.range(LAW.spawnMin, LAW.spawnMax);
    // In the right-hand lane of a car heading toward the player from that side.
    const off = dir.dx !== 0 ? (dir.dx > 0 ? 7 : -7) : dir.dz > 0 ? -7 : 7;
    const x = dir.dx !== 0 ? player.x + dir.dx * d : line + off;
    const z = dir.dz !== 0 ? player.z + dir.dz * d : line + off;
    if (x < min || x > max || z < min || z > max) continue;
    if (police.units.some((u) => Math.hypot(u.x - x, u.z - z) < 60)) continue;
    const bearing = Math.atan2(z - player.z, x - player.x);
    if (Math.abs(wrap(bearing - viewYaw)) < 1.15) continue;
    return { x, z, dx: dir.dx, dz: dir.dz };
  }
  // Nothing out of sight: any point on the nearest avenue at range will do, and the cruiser shows
  // up over the horizon rather than not at all.
  const across = player.z;
  const line = lines.reduce((best, l) => (Math.abs(l - across) < Math.abs(best - across) ? l : best), lines[0]);
  const d = LAW.spawnMin;
  const x = player.x;
  const z = line + (line > player.z ? -d : d);
  if (x < min || x > max || z < min || z > max) return null;
  return { x, z, dx: 0, dz: z > player.z ? -1 : 1 };
}

/**
 * Step the response by dt. `ctx` carries the player (with an approximate velocity), the solid
 * blockers the cruisers must not drive through, a muzzle callback for each officer's shot, the
 * camera yaw (for spawning out of view), and hitTest/onHit: whether a police round has found the
 * player, and what to do about it.
 */
export function runPolice(police, dt, layout, ctx) {
  const { player, blockers = [], onFire = null, viewYaw = 0, hitTest = null, onHit = null } = ctx;
  police.alarm = Math.max(0, police.alarm - dt);
  police.clock += dt;

  // ---- who can see the player?
  let seen = false;
  for (const u of police.units) {
    if (Math.hypot(u.x - player.x, u.z - player.z) < 120 && lineOfSight(layout, u, player)) seen = true;
    for (const o of u.officers) {
      if (!o.alive || o.inCar) continue;
      if (Math.hypot(o.x - player.x, o.z - player.z) < LAW.copRange && lineOfSight(layout, o, player)) seen = true;
    }
  }
  police.seen = seen;

  if (police.stars > 0) {
    if (seen) {
      police.quiet = 0;
    } else {
      police.quiet += dt;
      if (police.quiet > LAW.coolAfter) {
        police.heat -= dt / LAW.coolFor;
        if (police.heat <= 0) {
          police.stars -= 1;
          police.heat = police.stars > 0 ? 0.75 : 0;
          police.quiet = LAW.coolAfter * 0.4;
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
      // The spot sits `d` metres away along (dx, dz), so the cruiser drives back along (-dx, -dz).
      newUnit(spot.x, spot.z, Math.atan2(-spot.dz, -spot.dx), police);
      police.nextSpawn = police.clock + Math.max(1.4, 4.2 - police.stars * 0.6);
    }
  }

  for (const u of police.units) {
    u.age += dt;
    driveCruiser(u, dt, layout, player, blockers);
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
      stepOfficer(police, o, dt, layout, player, onFire);
    }
  }
  // ---- the rounds, walked in short hops so none tunnels through the player at 150 m/s, and
  // stopped by the first wall they meet.
  for (let i = police.rounds.length - 1; i >= 0; i -= 1) {
    const s = police.rounds[i];
    const travel = Math.hypot(s.vx, s.vz) * dt;
    const hops = Math.max(1, Math.ceil(travel / 0.5));
    let gone = false;
    for (let h = 0; h < hops && !gone; h += 1) {
      s.x += (s.vx * dt) / hops;
      s.z += (s.vz * dt) / hops;
      if (hitTest && hitTest(s.x, s.z)) {
        gone = true;
        if (onHit) onHit(s);
      } else if (layout.buildingAt(s.x, s.z, 0)) {
        gone = true;
      }
    }
    s.life -= dt;
    if (gone || s.life <= 0) police.rounds.splice(i, 1);
  }

  // ---- retire the cruisers the quota no longer needs, and send their crews home.
  if (police.units.length > want) {
    police.units.splice(want).forEach((u) => u.officers.forEach((o) => (o.alive = false)));
  }
}

/** The avenue nearest a coordinate. */
function nearestAvenue(v) {
  const lines = avenues();
  let best = lines[0];
  for (const l of lines) if (Math.abs(l - v) < Math.abs(best - v)) best = l;
  return best;
}

// How far off an avenue a car may be and still count as driving along it.
const ON_STREET = 26;

/**
 * The point a cruiser drives at next.
 *
 * It drives the streets, not the straight line. Two cases:
 *   - It is already on one of the player's streets (within ON_STREET of the player's avenue on the
 *     axis it travels, or on the player's cross street). Then the straight line to the player runs
 *     down that street and it takes it.
 *   - It is not. Then it runs to the junction of its own avenue and the player's other avenue,
 *     which puts it on a street that leads to the player.
 *
 * The gap between the cases is what stops the old failure: a car aiming at a corner it can never
 * quite reach orbits it for ever at full throttle and never arrives. Aiming at a street means the
 * target is a long line, not a point, so overshooting is harmless.
 */
function routeTo(u, player) {
  const ownX = nearestAvenue(u.x);
  const ownZ = nearestAvenue(u.z);
  const targetX = nearestAvenue(player.x);
  const targetZ = nearestAvenue(player.z);

  const onPlayerStreetX = Math.abs(u.z - targetZ) < ON_STREET;
  const onPlayerStreetZ = Math.abs(u.x - targetX) < ON_STREET;
  if (onPlayerStreetX || onPlayerStreetZ) return { x: player.x, z: player.z };

  const onNS = Math.abs(u.x - ownX) < Math.abs(u.z - ownZ);
  if (onNS) return { x: ownX, z: targetZ };
  return { x: targetX, z: ownZ };
}

/**
 * Drive one cruiser down the streets to the player.
 *
 * A cruiser that simply aims at the player wedges itself into the corner of a block within a
 * hundred metres, so it follows the grid until it is on a street that leads to the player and only
 * then takes the straight line. Anything directly in front of the nose bends the wheel away from
 * it, and a wall it does hit costs most of its speed.
 */
function driveCruiser(u, dt, layout, player, blockers) {
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
  if (!layout.buildingAt(nx, nz, 1.3) && !layout.inWater(nx, nz)) {
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
  if (dist < 34 && u.mode === 'chase') u.mode = 'stop';
  if (u.mode === 'stop' && (u.speed < 1.2 || dist < 20)) {
    u.mode = 'deployed';
    for (const [i, o] of u.officers.entries()) {
      const side = u.yaw + Math.PI * 0.5 + (i === 0 ? 0.7 : -0.7) + Math.PI * 0.5;
      const ox = u.x + Math.cos(side) * 3.2;
      const oz = u.z + Math.sin(side) * 3.2;
      const clear = !layout.buildingAt(ox, oz, 0.5) && !layout.inWater(ox, oz);
      o.x = clear ? ox : u.x;
      o.z = clear ? oz : u.z;
      o.inCar = false;
      o.yaw = Math.atan2(player.z - o.z, player.x - o.x);
      // The first officer out is the one who walks in to make the collar.
      o.collar = i === 0;
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

function stepOfficer(police, o, dt, layout, player, onFire) {
  const dx = player.x - o.x;
  const dz = player.z - o.z;
  const dist = Math.hypot(dx, dz) || 1;
  o.yaw = Math.atan2(dz, dx);
  const sight = lineOfSight(layout, o, player);

  // Most of the crew holds the ground between 9 and 30 m and shoots from there. One of them —
  // whoever was put out first — walks in to make the collar: an arrest needs a hand on a shoulder,
  // and a crew that only ever shoots from across the street means the player is never busted.
  const closer = o.collar === true;
  let move = 0;
  if (!sight || dist > 30) move = 1;
  else if (closer ? dist > 1.3 : dist < 9) move = closer ? 1 : -1;
  if (move !== 0) {
    const sp = (closer && dist < 12 ? LAW.copWalk * 1.2 : move > 0 ? LAW.copRun : LAW.copWalk) * dt;
    const nx = o.x + (dx / dist) * sp;
    const nz = o.z + (dz / dist) * sp;
    if (!layout.buildingAt(nx, o.z, 0.45)) o.x = nx;
    if (!layout.buildingAt(o.x, nz, 0.45)) o.z = nz;
    if (o.x < -100) o.x = -100;
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
    const a = o.yaw + spread;
    police.rounds.push({
      x: o.x + Math.cos(a) * 0.6,
      z: o.z + Math.sin(a) * 0.6,
      vx: Math.cos(a) * LAW.bullet,
      vz: Math.sin(a) * LAW.bullet,
      life: LAW.copRange / LAW.bullet,
      y: 1.35,
    });
    if (onFire) onFire(o, a);
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

/** A cruiser parked on top of a stopped player, or an officer close enough for handcuffs. */
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