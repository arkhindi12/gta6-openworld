// Traffic: what a car is on this street, and how it drives when nobody is in it.
//
// A car in the traffic holds a heading (one of four axes), the avenue it runs along and which side
// of the centre line it keeps. It accelerates to its own cruise speed, but the sensor in front of
// its nose looks down the lane for the nearest thing — another car, the player's car, a cruiser,
// a body in the road — and the throttle falls away with the gap, so a boulevard queues behind a
// stalled taxi and then flows again.
//
// At a junction a car may turn. A turn is never a snap: the car hands its position to a quadratic
// laid from where it is, round the middle of the crossing, onto the lane of its new avenue, and
// follows it out facing the new heading. Most cars go straight on, because a grid where everything
// turns is a grid that jams.
//
// `parked` cars sit at the kerb with the engine off until somebody steals one; `stolen` cars are
// the player's and this module stops touching them.

import { TRAFFIC, PALETTE } from './settings.js';
import { avenues, HALF_ROAD } from './layout.js';
import { rngFrom } from './random.js';
import { SHAPES, TAXI_PAINT } from './vehicles.js';

export const LANE = 5.4; // a lane's centre, from the avenue's middle line
export const DIRECTIONS = [
  { dx: 1, dz: 0 },
  { dx: -1, dz: 0 },
  { dx: 0, dz: 1 },
  { dx: 0, dz: -1 },
];

/** Right-hand traffic: eastbound keeps south of the line, northbound keeps east of it. */
export function laneOffset(dir) {
  if (dir.dx !== 0) return dir.dx > 0 ? LANE : -LANE;
  return dir.dz > 0 ? -LANE : LANE;
}

/** The cardinal axis a heading is closest to. */
export function axisOf(yaw) {
  if (Math.abs(Math.cos(yaw)) >= Math.abs(Math.sin(yaw))) return { dx: Math.cos(yaw) >= 0 ? 1 : -1, dz: 0 };
  return { dx: 0, dz: Math.sin(yaw) >= 0 ? 1 : -1 };
}

/** A car record. `x, z` is its centre, `yaw` its heading from +x, `len` its length along that. */
export function newCar(kind, x, z, yaw, paint, extra = {}) {
  const shape = SHAPES[kind] ?? SHAPES.sedan;
  return {
    kind,
    len: shape.len,
    wid: shape.wid,
    shape,
    x,
    z,
    yaw,
    speed: 0,
    dir: axisOf(yaw),
    line: 0,
    turn: null,
    cool: 0,
    paint: paint ?? PALETTE.cars[0],
    lights: 0,
    stolen: false,
    parked: false,
    occupied: true,
    bodyAhead: Infinity,
    ...extra,
  };
}

/** A car seated in the lane of avenue `line`, `along` metres up it, heading `dir`. */
export function carInLane(kind, line, along, dir, paint, extra = {}) {
  const off = laneOffset(dir);
  const x = dir.dx !== 0 ? along : line + off;
  const z = dir.dz !== 0 ? along : line + off;
  const car = newCar(kind, x, z, Math.atan2(dir.dz, dir.dx), paint, extra);
  car.dir = { dx: dir.dx, dz: dir.dz };
  car.line = line;
  return car;
}

/** A car at the kerb: in the lane but pushed toward the pavement, engine off. */
export function kerbCar(kind, line, along, dir, paint) {
  const car = carInLane(kind, line, along, dir, paint, { parked: true, occupied: false });
  const off = laneOffset(dir);
  if (dir.dx !== 0) car.z += off * 1.6;
  else car.x += off * 1.6;
  return car;
}

/** How far along its avenue a car has come. */
function progress(car) {
  return car.dir.dx !== 0 ? car.x : car.z;
}

/** True inside a junction box, where cars must not be born. */
function inJunction(v) {
  return avenues().some((line) => Math.abs(v - line) < HALF_ROAD + 2);
}

/** The seeded fleet: cars spread over the avenues, with a few kerb cars mixed in. */
export function seedTraffic(seed = 7) {
  const rand = rngFrom(seed * 11 + 3);
  const lines = avenues();
  const low = -HALF_ROAD + 40;
  const high = lines[lines.length - 1] + HALF_ROAD - 40;
  const cars = [];
  let guard = 0;

  while (cars.length < TRAFFIC.count && guard < TRAFFIC.count * 80) {
    guard += 1;
    const dir = rand.pick(DIRECTIONS);
    const line = rand.pick(lines);
    const along = Math.floor(rand.range(low, high) / 40) * 40 + 20;
    if (inJunction(along)) continue;
    const kind = rand.pick(['sedan', 'sedan', 'coupe', 'suv', 'cab', 'sedan', 'drop', 'van', 'coupe']);
    const paint = kind === 'cab' ? TAXI_PAINT : rand.pick(PALETTE.cars);
    const car = carInLane(kind, line, along, dir, paint);
    if (cars.some((c) => Math.hypot(c.x - car.x, c.z - car.z) < 30)) continue;
    car.speed = rand.range(car.shape.top[0] * 0.55, car.shape.top[1] * 0.75);
    car.cruise = rand.range(car.shape.top[0], car.shape.top[1]);
    cars.push(car);
  }

  // A handful left at the kerb where the player can walk up and take one.
  for (let i = 0; i < 6; i += 1) {
    const dir = rand.pick(DIRECTIONS);
    const line = rand.pick(lines);
    const along = Math.floor(rand.range(low, high) / 40) * 38 + 24;
    if (inJunction(along)) continue;
    cars.push(kerbCar(rand.pick(['sedan', 'coupe', 'suv']), line, along, dir, rand.pick(PALETTE.cars)));
  }
  return cars;
}

// ---------------------------------------------------------------- the driving

/**
 * Advance every AI car one step.
 *
 * `blockers` are bodies a car must not drive through — the player's car and each cruiser — given
 * as {x, z, len}. `playerOnFoot` is the player's position when they are not in a car, so traffic
 * stops for somebody standing in the lane instead of driving over them.
 */
export function driveTraffic(cars, dt, blockers = [], playerOnFoot = null) {
  for (const car of cars) {
    if (car.stolen || car.parked) continue;
    car.cool = Math.max(0, car.cool - dt);
    car.lights = Math.max(0, car.lights - dt * 3.2);

    // ---- the sensor: the nearest body ahead, inside the lane.
    let gap = 120;
    for (const other of cars) {
      if (other === car) continue;
      const ahead = (other.x - car.x) * car.dir.dx + (other.z - car.z) * car.dir.dz;
      if (ahead <= 0 || ahead > 46) continue;
      const side = Math.abs((other.x - car.x) * car.dir.dz - (other.z - car.z) * car.dir.dx);
      if (side > 2.7) continue;
      gap = Math.min(gap, ahead - other.len * 0.5 - car.len * 0.5 - 0.6);
    }
    for (const b of blockers) {
      const ahead = (b.x - car.x) * car.dir.dx + (b.z - car.z) * car.dir.dz;
      const side = Math.abs((b.x - car.x) * car.dir.dz - (b.z - car.z) * car.dir.dx);
      if (ahead > 0 && side < 3.0) gap = Math.min(gap, ahead - (b.len ?? 4.6) * 0.5 - car.len * 0.5);
    }
    if (playerOnFoot) {
      const ahead = (playerOnFoot.x - car.x) * car.dir.dx + (playerOnFoot.z - car.z) * car.dir.dz;
      const side = Math.abs((playerOnFoot.x - car.x) * car.dir.dz - (playerOnFoot.z - car.z) * car.dir.dx);
      if (ahead > 0 && side < 2.4) gap = Math.min(gap, ahead - 3);
    }
    if (car.bodyAhead < gap) gap = car.bodyAhead;

    // ---- the throttle: hold the cruise, or fall away with the gap to what is in front.
    const want = gap < 5 ? 0 : gap < 26 ? car.cruise * (0.18 + 0.032 * gap) : car.cruise;
    const rate = want < car.speed ? 5.2 : 1.15;
    car.speed += (want - car.speed) * Math.min(1, dt * rate);
    // Brake lights: harder the faster the throttle is falling away from the speed.
    if (want < car.speed - 0.4) car.lights = Math.min(1, car.lights + dt * (want < 0.5 ? 9 : 5));

    if (car.turn) {
      followTurn(car, dt);
      continue;
    }

    // ---- a junction ahead? Most cars go straight on; the rest take the turn.
    const at = progress(car);
    const sign = car.dir.dx + car.dir.dz;
    for (const line of avenues()) {
      if (line === car.line) continue;
      const d = (line - at) * sign;
      if (d <= 0.5 || d > 5.5) continue;
      if (car.cool > 0) break;
      const roll = Math.abs(Math.sin(car.x * 0.0017 + car.z * 0.0029 + line * 0.013));
      if (roll < 0.4) break;
      beginTurn(car, line, roll);
      break;
    }
    if (car.turn) continue;

    // ---- straight on down the lane, easing back to the middle of it.
    const target = car.line + laneOffset(car.dir);
    if (car.dir.dx !== 0) car.z += (target - car.z) * Math.min(1, dt * 2.2);
    else car.x += (target - car.x) * Math.min(1, dt * 2.2);
    car.x += car.dir.dx * car.speed * dt;
    car.z += car.dir.dz * car.speed * dt;
    car.yaw = Math.atan2(car.dir.dz, car.dir.dx);

    // ---- off the end of the grid: turn round onto the other lane of the nearest avenue.
    const ends = avenueEnds();
    if (at < ends.min - 8 || at > ends.max + 8) {
      car.dir = { dx: -car.dir.dx, dz: -car.dir.dz };
      let best = Infinity;
      for (const line of avenues()) {
        const d = Math.abs((car.dir.dx !== 0 ? car.z : car.x) - line);
        if (d < best) {
          best = d;
          car.line = line;
        }
      }
      car.cool = 2;
    }
  }
}

/** The far kerbs of the grid, where a car that drives off the end turns round. */
export function avenueEnds() {
  const lines = avenues();
  return { min: -HALF_ROAD, max: lines[lines.length - 1] + HALF_ROAD };
}

/**
 * Begin a turn through the junction at (cx, cz). The car leaves the junction a lane offset to the
 * right of its new heading, and the control point sits on the corner it turns through, so the arc
 * bends the right way and never cuts across the middle of the crossing.
 */
function beginTurn(car, line, roll) {
  const onX = car.dir.dx !== 0;
  // Right-hand traffic: a right turn is the common band, a left the rare one.
  const next = onX
    ? { dx: 0, dz: roll < 0.7 ? (car.dir.dx > 0 ? 1 : -1) : car.dir.dx > 0 ? -1 : 1 }
    : { dx: roll < 0.7 ? (car.dir.dz > 0 ? -1 : 1) : car.dir.dz > 0 ? 1 : -1, dz: 0 };
  const cx = onX ? line : car.line;
  const cz = onX ? car.line : line;
  const off = laneOffset(next);
  const to = next.dx !== 0 ? { x: cx + off, z: cz } : { x: cx, z: cz + off };
  const from = { x: car.x, z: car.z };
  const ctrl = { x: cx, z: cz };
  const len = Math.max(9, Math.hypot(to.x - from.x, to.z - from.z));
  car.turn = { from, ctrl, to, next, line, t: 0, len, pace: Math.max(5.5, Math.min(car.speed, 11)) };
  car.cool = 6;
}

/** Walk the quadratic a turning car is on, and land it in the new lane facing the new way. */
function followTurn(car, dt) {
  const t = car.turn;
  t.t = Math.min(1, t.t + (t.pace * dt) / t.len);
  const u = 1 - t.t;
  car.x = u * u * t.from.x + 2 * u * t.t * t.ctrl.x + t.t * t.t * t.to.x;
  car.z = u * u * t.from.z + 2 * u * t.t * t.ctrl.z + t.t * t.t * t.to.z;
  const tx = 2 * u * (t.ctrl.x - t.from.x) + 2 * t.t * (t.to.x - t.ctrl.x);
  const tz = 2 * u * (t.ctrl.z - t.from.z) + 2 * t.t * (t.to.z - t.ctrl.z);
  if (tx * tx + tz * tz > 1e-5) car.yaw = Math.atan2(tz, tx);
  if (t.t >= 1) {
    car.dir = { ...t.next };
    car.line = t.line;
    car.turn = null;
    car.speed = Math.min(car.speed, t.pace * 1.1);
    car.cool = 4;
  }
}