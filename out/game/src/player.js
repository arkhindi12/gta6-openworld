// The player: the body on the street, the hands on the wheel, and the pistol.
//
// This module owns everything about the player that is not a rendering decision. It moves them on
// foot with a wall slide, gets them in and out of cars, steers a car they have taken, fires the
// pistol and lets rounds fly, takes damage through armour and dies. It also keeps the wallet's
// saved progress in localStorage, so a run survives a reload.
//
// The input arrives as plain data - { move: {x, z}, aim: {x, z} | null, fire, use, run, reload } -
// with `move` already in world space, which is what lets a staged screenshot drive the player with
// a script instead of a keyboard.

import { GAIT, DRIVE, WEAPON } from './tuning.js';
import { stepAngle, foldAngle, makeRandom } from './rng.js';

const SAVE_KEY = 'vice-meridian/save/v1';
// Where the player starts, and where they wake up after an arrest or a bad night.
export const HOME = { x: 300, z: 1040 };

/** A fresh player at a spot on the pavement. */
export function newPlayer(x = HOME.x, z = HOME.z) {
  return {
    x,
    z,
    yaw: 0.6,
    aimYaw: 0.6,
    walkYaw: 0.6,
    phase: 0,
    moving: 0,
    running: 0,
    speed: 0,
    hp: 100,
    hpMax: 100,
    armour: 0,
    clip: WEAPON.clip,
    ammo: WEAPON.reserve,
    reload: 0,
    cool: 0,
    muzzle: 0,
    recoil: 0,
    hurt: 0,
    driving: null,
    lastCar: null,
  };
}

// ---------------------------------------------------------------- on foot

/**
 * Walk, on the frame's input. The body turns toward the walk vector and the chest and gun arm
 * follow the aim, so a player can strafe with the pistol held on a target.
 */
export function walkPlayer(sim, dt, input) {
  const p = sim.player;
  const move = input.move ?? { x: 0, z: 0 };
  const mag = Math.hypot(move.x, move.z);
  const running = !!input.run && mag > 0.1;
  const want = running ? GAIT.run : GAIT.walk;
  const targetSpeed = mag > 0.01 ? want : 0;
  p.speed += (targetSpeed - p.speed) * Math.min(1, dt * 10);

  if (mag > 0.01) {
    p.moving = 1;
    p.running = running ? 1 : 0;
    const sp = p.speed;
    const dx = (move.x / mag) * sp * dt;
    const dz = (move.z / mag) * sp * dt;
    slideBody(sim, p, dx, dz);
    p.phase += dt * (running ? 12.5 : 7.0) * Math.min(1.15, sp / GAIT.walk);
    p.walkYaw = Math.atan2(move.z, move.x);
    p.yaw = stepAngle(p.yaw, p.walkYaw, GAIT.turn * dt);
  } else {
    p.moving = 0;
    p.running = 0;
    p.phase += dt * 1.6;
  }
  if (input.aim) p.aimYaw = Math.atan2(input.aim.z - p.z, input.aim.x - p.x);
  else if (mag > 0.01) p.aimYaw = p.yaw;
}

/** Move with a wall slide, and refuse the sea. */
function slideBody(sim, p, dx, dz) {
  const r = GAIT.body;
  const layout = sim.layout;
  if (!layout.buildingAt(p.x + dx, p.z, r) && !layout.inWater(p.x + dx, p.z)) p.x += dx;
  if (!layout.buildingAt(p.x, p.z + dz, r) && !layout.inWater(p.x, p.z + dz)) p.z += dz;
}

// ---------------------------------------------------------------- driving

/**
 * Steer the car under the player. Throttle comes from W, the brake from S, the wheel from A and D.
 * Steering falls off with speed, so a car at forty metres a second cannot swing like one at ten,
 * and a wall scrapes the car down to a stop and costs a little health.
 */
export function drivePlayer(sim, dt, input) {
  const p = sim.player;
  const car = p.driving;
  if (!car) return;
  const throttle = input.move?.z < -0.1 ? 1 : 0;
  const brake = input.move?.z > 0.1 ? 1 : 0;
  const wheel = input.move?.x ?? 0;

  if (throttle) {
    const bite = 1 - Math.min(0.75, (Math.abs(car.speed) / DRIVE.topSpeed) * 0.9);
    car.speed += DRIVE.accel * bite * dt;
  } else if (brake) {
    car.speed -= DRIVE.brake * dt * (car.speed > 0 ? 1 : 0.35);
  } else {
    car.speed -= Math.sign(car.speed) * DRIVE.coast * dt;
  }
  car.speed = Math.max(-DRIVE.reverse, Math.min(DRIVE.topSpeed, car.speed));
  if (Math.abs(car.speed) < 0.2 && !throttle) car.speed = 0;

  const grip = Math.min(1, Math.abs(car.speed) / 9) * (1 - Math.min(0.55, (Math.abs(car.speed) / DRIVE.topSpeed) * 0.55));
  car.yaw += wheel * DRIVE.steer * grip * dt * (car.speed < -0.5 ? -1 : 1);
  car.lights = brake || (car.speed < 1 && throttle) ? 1 : Math.max(0, car.lights - dt * 4);

  const vx = Math.cos(car.yaw) * car.speed;
  const vz = Math.sin(car.yaw) * car.speed;
  const nx = car.x + vx * dt;
  const nz = car.z + vz * dt;
  const solid = (x, z) => sim.layout.buildingAt(x, z, 1.05) || sim.layout.inWater(x, z);
  let advanced = 0;
  if (!solid(nx, car.z)) {
    car.x = nx;
    advanced += Math.abs(vx * dt);
  }
  if (!solid(car.x, nz)) {
    car.z = nz;
    advanced += Math.abs(vz * dt);
  }
  const wanted = Math.hypot(vx * dt, vz * dt);
  if (wanted > 0.001 && advanced < wanted * 0.55) {
    // A wall, not a slide: the car scrapes to a stop, and it hurts.
    car.speed *= -0.18;
    sim.shake = Math.max(sim.shake, Math.min(0.7, Math.abs(car.speed) * 0.03 + 0.15));
    if (Math.abs(car.speed) > 3) hurt(sim, Math.min(6, Math.abs(car.speed) * 0.4));
  }

  // Bumping traffic: shove the other car along and give up some of the speed.
  for (const other of sim.traffic) {
    if (other === car) continue;
    const dx = other.x - car.x;
    const dz = other.z - car.z;
    const d = Math.hypot(dx, dz);
    const min = (other.len + car.len) * 0.42;
    if (d >= min || d <= 0.01) continue;
    const push = (min - d) * 0.6;
    other.x += (dx / d) * push;
    other.z += (dz / d) * push;
    if (!other.parked && !other.stolen) other.speed = Math.max(other.speed, Math.abs(car.speed) * 0.6);
    car.speed *= 0.88;
    sim.shake = Math.max(sim.shake, 0.3);
  }

  p.x = car.x;
  p.z = car.z;
  p.yaw = car.yaw;
  p.aimYaw = car.yaw;
  p.moving = Math.abs(car.speed) > 0.5 ? 1 : 0;
  p.running = Math.abs(car.speed) > 20 ? 1 : 0;
}

/** E: leave the car under the player, or take the nearest one within reach. */
export function toggleVehicle(sim) {
  const p = sim.player;
  if (p.driving) {
    const car = p.driving;
    car.speed *= 0.2;
    // Step out on the driver's side, if the pavement is clear there.
    const side = car.yaw + Math.PI / 2;
    const ox = car.x + Math.cos(side) * (car.wid * 0.5 + 0.9);
    const oz = car.z + Math.sin(side) * (car.wid * 0.5 + 0.9);
    if (sim.layout.isOpen(ox, oz, 0.4)) {
      p.x = ox;
      p.z = oz;
    }
    p.driving = null;
    p.yaw = car.yaw;
    return true;
  }
  const near = nearestCar(sim, GAIT.reach);
  if (near) return enterCar(sim, near);
  return false;
}

/** The closest car to the player within `reach`, or null. */
export function nearestCar(sim, reach = GAIT.reach) {
  const p = sim.player;
  let best = null;
  let gap = reach;
  for (const car of sim.traffic) {
    const d = Math.hypot(car.x - p.x, car.z - p.z);
    if (d < gap) {
      gap = d;
      best = car;
    }
  }
  return best;
}

/** Take a car over: out of the traffic's hands and into the player's. */
export function enterCar(sim, car) {
  const p = sim.player;
  if (!car || car.stolen) return false;
  car.stolen = true;
  car.parked = false;
  car.speed *= 0.3;
  car.lights = 0;
  p.driving = car;
  p.lastCar = car;
  p.x = car.x;
  p.z = car.z;
  p.yaw = car.yaw;
  p.aimYaw = car.yaw;
  sim.onCrime('theft', car);
  return true;
}

// ---------------------------------------------------------------- the pistol

/** Start a reload if there is anything to reload with. */
export function reloadWeapon(sim) {
  const p = sim.player;
  if (p.reload > 0 || p.clip >= WEAPON.clip || p.ammo <= 0) return;
  p.reload = WEAPON.reload;
}

function tickReload(sim, dt) {
  const p = sim.player;
  if (p.reload <= 0) return;
  p.reload -= dt;
  if (p.reload > 0) return;
  const take = Math.min(WEAPON.clip - p.clip, p.ammo);
  p.clip += take;
  p.ammo -= take;
  if (take > 0) sim.events.onReload?.();
}

/**
 * Fire one round down the aim. Sends a record into sim.rounds which the scene walks forward and
 * resolves; the headwind of heat and the crowd's reaction are the scene's business, handled
 * through onCrime.
 */
export function fireWeapon(sim) {
  const p = sim.player;
  if (p.reload > 0 || p.cool > 0) return false;
  if (p.clip <= 0) {
    if (p.ammo > 0) reloadWeapon(sim);
    return false;
  }
  p.clip -= 1;
  p.cool = WEAPON.cadence;
  p.muzzle = 1;
  p.recoil = 1;
  sim.shake = Math.max(sim.shake, 0.22);
  sim.story.shots += 1;

  const a = p.aimYaw + (sim.rand() - 0.5) * WEAPON.spread * 2;
  const from = p.driving ? { x: p.driving.x, z: p.driving.z } : { x: p.x, z: p.z };
  sim.rounds.push({
    x: from.x + Math.cos(a) * 1.0,
    z: from.z + Math.sin(a) * 1.0,
    vx: Math.cos(a) * WEAPON.speed,
    vz: Math.sin(a) * WEAPON.speed,
    y: p.driving ? 1.1 : 1.3,
    travelled: 0,
    life: 2,
  });
  sim.events.onShot?.(from, a);
  sim.onCrime('shot', from);
  return true;
}

// ---------------------------------------------------------------- health

/** Take damage through armour, and light the screen up for it. */
export function hurt(sim, amount) {
  const p = sim.player;
  let n = amount;
  if (p.armour > 0) {
    const soak = Math.min(p.armour, n * 0.6);
    p.armour -= soak;
    n -= soak;
  }
  p.hp = Math.max(0, p.hp - n);
  p.hurt = 1;
  sim.shake = Math.max(sim.shake, 0.9);
  sim.flash = 0.6;
}

// ---------------------------------------------------------------- saved progress

/** Progress survives a reload: jobs done, cash, and where the chain stands. */
export function saveProgress(story) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ index: story.index, done: story.done, cash: story.cash, passed: story.passed }));
  } catch {
    // Storage refused (private window, quota): the run simply is not remembered.
  }
}

/** Fold a saved chain back into a fresh story, clamping anything a hand-edited save broke. */
export function loadProgress(story, jobCount) {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    const index = Math.max(0, Math.min(jobCount, Math.floor(Number(data.index) || 0)));
    if (!index) return false;
    story.index = index;
    story.done = Math.max(0, Math.min(index, Math.floor(Number(data.done) || index)));
    story.cash = Math.max(0, Math.min(1e7, Math.floor(Number(data.cash) || 0)));
    story.passed = Array.isArray(data.passed) ? data.passed.slice(0, jobCount).map(String) : [];
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- moving a round

/**
 * Walk a round in hops small enough that it cannot tunnel through a person, a wall or an officer.
 * `hit` is called at each hop with the round; it returns true when the round has been consumed.
 * Returns true when the round is finished with.
 */
export function advanceRound(sim, r, dt, hit) {
  const stepLen = Math.hypot(r.vx, r.vz) * dt;
  const hops = Math.max(1, Math.ceil(stepLen / 0.8));
  let consumed = false;
  for (let h = 0; h < hops && !consumed; h += 1) {
    r.x += (r.vx * dt) / hops;
    r.z += (r.vz * dt) / hops;
    r.travelled += stepLen / hops;
    consumed = hit(r);
  }
  r.life -= dt;
  return consumed || r.life <= 0 || r.travelled > WEAPON.range;
}

export { makeRandom, foldAngle };
