// The four pictures, staged from the address bar.
//
// ?shot=cover|foot|chase|driving builds the same seeded city the player gets, puts the cast where
// the picture needs them and parks the camera. Nothing here draws: main.js renders the result
// through the same render() the game uses, HUD and all, and then holds the frame so the picture is
// exactly what was staged.
//
// Placement is always "this avenue, this heading, this far along", never a raw x/z: the traffic
// module owns the lane offset, so a staged car sits in a real lane and the queue behind it brakes
// for it. The avenues sit on multiples of 264 m, their kerbs 24 m either side of a centre line,
// and the lanes 5.4 m to the right of it.

import { carInLane, newCar, LANE } from './traffic.js';
import { newPerson } from './crowd.js';
import { newStory } from './missions.js';

const NEUTRAL = { move: { x: 0, z: 0 }, fire: false, use: false, run: false, reload: false };

// The avenue all four pictures look up, and the cross street the turning cars come from.
export const SHOT_AVENUE = 792;
export const SHOT_CROSS = 1056;
const NORTH = { dx: 0, dz: -1 };
const SOUTH = { dx: 0, dz: 1 };
const EAST = { dx: 1, dz: 0 };
const WEST = { dx: -1, dz: 0 };
const PAVE_W = SHOT_AVENUE - 24 - 5;
const PAVE_E = SHOT_AVENUE + 24 + 5;

/** The x a northbound car keeps to on this avenue. */
function laneX(dir) {
  return SHOT_AVENUE + (dir === NORTH ? LANE : -LANE);
}

/** A car seated in a real lane, already rolling at `speed`. */
function carOn(sim, kind, line, along, dir, paint, speed) {
  const car = carInLane(kind, line, along, dir, paint);
  car.speed = speed;
  car.cruise = speed;
  sim.traffic.push(car);
  return car;
}

/** A pedestrian at a spot, facing `yaw`. */
function pedAt(sim, x, z, yaw, extra = {}) {
  const p = newPerson(sim.rand, x, z, yaw, extra);
  p.phase = sim.rand() * 6.28;
  sim.crowd.push(p);
  return p;
}

/** A cruiser with a two-officer crew, either seated or already out on the street. */
function unitAt(sim, x, z, yaw, deployed = true) {
  const car = newCar('cruiser', x, z, yaw, '#f2f3f5', { id: 900 + sim.police.units.length });
  car.len = 4.9;
  const unit = {
    car,
    x,
    z,
    yaw,
    speed: 0,
    mode: deployed ? 'deployed' : 'chase',
    officers: [],
    tag: `vmpd-${sim.police.units.length + 1}`,
    age: 4,
    siren: 1,
  };
  for (let i = 0; i < 2; i += 1) {
    unit.officers.push({
      x,
      z,
      yaw: 0,
      hp: 3,
      cool: 0.2 + i * 0.35,
      alive: true,
      down: 0,
      seat: i,
      moving: 0,
      inCar: !deployed,
      flash: 0,
      collar: i === 0,
    });
  }
  sim.police.units.push(unit);
  return unit;
}

/** Point every officer at the player and put a couple of their rounds in the air. */
function openFire(sim, count = 2) {
  sim.police.rounds.length = 0;
  const p = sim.player;
  let n = 0;
  for (const u of sim.police.units) {
    for (const o of u.officers) {
      if (!o.alive || o.inCar) continue;
      o.yaw = Math.atan2(p.z - o.z, p.x - o.x);
      if (n >= count) continue;
      const a = o.yaw + (n - 0.5) * 0.05;
      sim.police.rounds.push({
        x: o.x + Math.cos(a) * (3 + n * 4),
        z: o.z + Math.sin(a) * (3 + n * 4),
        vx: Math.cos(a) * 150,
        vz: Math.sin(a) * 150,
        life: 0.9,
        y: 1.35,
      });
      o.flash = 1;
      n += 1;
    }
  }
}

/**
 * Stage one of the four pictures. Returns { camera, input } or null if the name is not one of
 * them. The camera is a plain object in the same shape the follow camera uses.
 */
export function stageShot(name, sim) {
  if (name === 'cover') return stageCover(sim);
  if (name === 'foot') return stageFoot(sim);
  if (name === 'chase') return stageChase(sim);
  if (name === 'driving') return stageDriving(sim);
  return null;
}

/** The start screen: high over Neon Heights, looking down the towers to the gulf and the sun. */
function stageCover(sim) {
  sim.mode = 'title';
  sim.story = newStory();
  sim.story.cash = 12480;
  const p = sim.player;
  p.x = 690;
  p.z = 1010;
  p.yaw = -Math.PI / 2;
  p.aimYaw = -Math.PI / 2;
  sim.time = 0.9;
  return {
    camera: { x: 1120, y: 96, z: 1240, lx: -360, ly: 30, lz: 820, fov: 58 },
    input: () => NEUTRAL,
  };
}

/**
 * On the west pavement of Neon Heights facing up the avenue: the near lane coming at the camera,
 * the far lane heading away, both kerbs busy, the job marker up the street and a pink drop-top
 * parked at the kerb for the taking.
 */
function stageFoot(sim) {
  sim.mode = 'play';
  sim.story = newStory();
  sim.story.index = 1;
  sim.story.done = 1;
  sim.story.cash = 590;
  sim.story.toastT = 0;
  const p = sim.player;
  p.x = PAVE_W + 1.6;
  p.z = 1136;
  p.yaw = -Math.PI / 2;
  p.aimYaw = -Math.PI / 2 + 0.09;
  p.hp = 92;
  p.clip = 14;
  p.ammo = 51;
  p.phase = 1.1;
  p.moving = 1;
  p.running = 0;

  sim.traffic.length = 0;
  // Northbound, coming at the camera in the near lane, queued behind the coupe; southbound beyond
  // the centre line; a pair of cars crossing on the side street.
  carOn(sim, 'sedan', SHOT_AVENUE, 1104, NORTH, '#22e6d0', 9);
  carOn(sim, 'cab', SHOT_AVENUE, 1060, NORTH, '#ffcc33', 8);
  carOn(sim, 'coupe', SHOT_AVENUE, 1002, NORTH, '#8f5bff', 11);
  carOn(sim, 'suv', SHOT_AVENUE, 934, NORTH, '#f2f0ea', 12);
  carOn(sim, 'drop', SHOT_AVENUE, 1122, SOUTH, '#ff2f86', 12);
  carOn(sim, 'sedan', SHOT_AVENUE, 1062, SOUTH, '#ffd23c', 10);
  carOn(sim, 'van', SHOT_AVENUE, 996, SOUTH, '#177d95', 9);
  carOn(sim, 'sedan', SHOT_AVENUE, 1160, SOUTH, '#e8483f', 13);
  carOn(sim, 'sedan', SHOT_CROSS, 900, EAST, '#e8483f', 10);
  carOn(sim, 'coupe', SHOT_CROSS, 962, WEST, '#ff7a30', 9);
  carOn(sim, 'cab', SHOT_CROSS, 1010, EAST, '#ffcc33', 8);
  // One waiting at the kerb by the player, to steal.
  const kerb = carOn(sim, 'coupe', SHOT_AVENUE, 1080, NORTH, '#232331', 0);
  kerb.x = SHOT_AVENUE - 19.4;
  kerb.parked = true;

  sim.crowd.length = 0;
  pedAt(sim, PAVE_W + 1.6, 1108, Math.PI, { shirt: '#ff2f86', skin: '#d9a06b' });
  pedAt(sim, PAVE_W + 3.0, 1078, 0, { shirt: '#f4efe3', trousers: '#26324a', hat: true });
  pedAt(sim, PAVE_W + 1.2, 1036, Math.PI, { shirt: '#3d8bff', skin: '#a86b3f' });
  pedAt(sim, PAVE_W + 3.2, 994, 0, { shirt: '#ffd23c', bag: true });
  pedAt(sim, PAVE_E, 1100, 0, { shirt: '#22e6d0' });
  pedAt(sim, PAVE_E + 1.6, 1042, Math.PI, { shirt: '#ff7a30', skin: '#7a4a2a' });
  pedAt(sim, PAVE_E - 1.0, 986, 0, { shirt: '#63d07a', hat: true });
  pedAt(sim, PAVE_E + 0.8, 1156, Math.PI, { shirt: '#e8483f' });
  pedAt(sim, PAVE_W + 2.0, 958, Math.PI, { shirt: '#f4efe3' });
  pedAt(sim, PAVE_E + 1.0, 926, 0, { shirt: '#ff2f86' });
  pedAt(sim, PAVE_W + 4.4, 1168, Math.PI, { shirt: '#8f5bff' });
  pedAt(sim, PAVE_E + 2.4, 1168, Math.PI, { shirt: '#ffd23c', skin: '#a86b3f' });
  pedAt(sim, PAVE_W + 0.6, 900, 0, { shirt: '#177d95' });
  pedAt(sim, PAVE_E - 2.0, 890, Math.PI, { shirt: '#ff7a30', hat: true });
  const down = pedAt(sim, PAVE_E - 2.2, 1070, 0.4, { shirt: '#26324a', skin: '#e8b98c' });
  down.down = 4;

  // Over the right shoulder, a touch above head height: the player sits low and left of centre, the
  // avenue recedes to the vanishing point, the palm rank frames the left edge.
  return {
    camera: { x: p.x + 1.8, y: 3.3, z: p.z + 5.4, lx: p.x + 2.2, ly: 1.5, lz: p.z - 18, fov: 58 },
    input: () => ({ ...NEUTRAL, aim: { x: SHOT_AVENUE + 40, z: 900 } }),
  };
}

/**
 * Three stars in the avenue: two cruisers slewed across the lane, crews out and firing over their
 * doors, the crowd scattering, a body in the road, the player's own round in the air.
 */
function stageChase(sim) {
  sim.mode = 'play';
  sim.story = newStory();
  sim.story.index = 3;
  sim.story.done = 3;
  sim.story.cash = 2960;
  sim.story.toastT = 0;
  const p = sim.player;
  p.x = laneX(NORTH) - 1.4;
  p.z = 1016;
  p.yaw = -Math.PI / 2;
  p.aimYaw = -Math.PI / 2 + 0.05;
  p.hp = 61;
  p.armour = 18;
  p.clip = 9;
  p.ammo = 42;
  p.moving = 0;
  p.phase = 0.4;
  p.muzzle = 1;

  sim.police.stars = 3;
  sim.police.heat = 0.95;
  sim.police.quiet = 0;
  sim.police.seen = true;
  sim.police.units.length = 0;
  // Close enough that the bars, the livery and the officers' pistols all read: the nearest cruiser
  // is fourteen metres up the road and its crew is out in the lane. Two cruisers, four officers —
  // one crew on the near side of the avenue, one on the far.
  const a = unitAt(sim, laneX(NORTH) - 4.2, 1002, Math.PI / 2 + 0.42, true);
  const b = unitAt(sim, SHOT_AVENUE + 6.8, 996, Math.PI / 2 - 0.7, true);
  const spread = [
    [a, [[-2.6, 3.4], [-4.2, 6.2]]],
    [b, [[-3.0, 1.8], [2.2, 2.6]]],
  ];
  for (const [unit, spots] of spread) {
    unit.officers.forEach((o, i) => {
      o.x = unit.x + spots[i][0];
      o.z = unit.z + spots[i][1];
      o.yaw = Math.atan2(p.z - o.z, p.x - o.x);
      o.inCar = false;
    });
  }
  // One officer already down behind the far cruiser.
  b.officers[1].alive = false;
  b.officers[1].down = 0.5;

  sim.traffic.length = 0;
  const slewed = carOn(sim, 'suv', SHOT_AVENUE, 1040, NORTH, '#f2f0ea', 0);
  slewed.yaw += 0.7;
  carOn(sim, 'cab', SHOT_AVENUE, 950, NORTH, '#ffcc33', 0);
  carOn(sim, 'coupe', SHOT_CROSS, 1000, EAST, '#22e6d0', 0);
  carOn(sim, 'sedan', SHOT_AVENUE, 1030, SOUTH, '#8f5bff', 0);

  sim.crowd.length = 0;
  pedAt(sim, PAVE_W, 992, 0.4, { shirt: '#ff2f86' }).panic = 3.4;
  pedAt(sim, PAVE_W - 2, 950, -2.2, { shirt: '#ffd23c' }).panic = 3.2;
  pedAt(sim, PAVE_E, 1004, -0.4, { shirt: '#22e6d0' }).panic = 2.8;
  pedAt(sim, PAVE_E + 1.6, 952, -2.6, { shirt: '#f4efe3', hat: true }).panic = 3.0;
  pedAt(sim, SHOT_AVENUE + 20, 930, 0.2, { shirt: '#8f5bff' }).panic = 3.6;
  pedAt(sim, PAVE_W + 1, 906, -1.9, { shirt: '#63d07a' }).panic = 2.4;
  pedAt(sim, PAVE_E + 3, 1074, -1.2, { shirt: '#ff7a30' }).panic = 3.1;
  const body = pedAt(sim, SHOT_AVENUE - 15, 1006, 0.9, { shirt: '#26324a' });
  body.down = 2.4;
  const body2 = pedAt(sim, PAVE_W - 1, 930, -0.5, { shirt: '#e8483f', skin: '#7a4a2a' });
  body2.down = 1.2;
  for (const q of sim.crowd) {
    if (q.down > 0) continue;
    q.run = 1;
    q.moving = 1;
  }
  openFire(sim, 2);
  // The player's own round in the air, on its way to the near cruiser.
  sim.rounds.push({ x: p.x + 3.5, y: 1.35, z: p.z - 5.5, vx: 0, vz: -200, life: 0.5, travelled: 0 });

  // Low and close over the shoulder: the near cruiser fills the left, its crew in the road.
  return {
    camera: { x: p.x + 2.6, y: 2.85, z: p.z + 5.0, lx: p.x + 1.0, ly: 1.5, lz: p.z - 15, fov: 58 },
    input: () => ({ ...NEUTRAL, aim: { x: SHOT_AVENUE, z: 1200 } }),
  };
}

/**
 * A stolen drop-top flat out up the boulevard: the taxi and the coupe just ahead in the lane, the
 * oncoming side full, two stars on the tail, the crowd on both kerbs.
 */
function stageDriving(sim) {
  sim.mode = 'play';
  sim.story = newStory();
  sim.story.index = 4;
  sim.story.done = 4;
  sim.story.cash = 6180;
  sim.story.toastT = 0;
  const p = sim.player;
  p.hp = 78;
  p.clip = 11;
  p.ammo = 34;

  sim.traffic.length = 0;
  const hero = carOn(sim, 'drop', SHOT_AVENUE, 1080, NORTH, '#ff2f86', 30);
  hero.stolen = true;
  p.driving = hero;
  p.x = hero.x;
  p.z = hero.z;
  p.yaw = hero.yaw;
  p.aimYaw = hero.yaw;

  // Same lane, just ahead: the taxi the player is closing on, then the coupe beyond it.
  carOn(sim, 'cab', SHOT_AVENUE, 1052, NORTH, '#ffcc33', 24);
  carOn(sim, 'coupe', SHOT_AVENUE, 1004, NORTH, '#f2f0ea', 26);
  carOn(sim, 'sedan', SHOT_AVENUE, 956, NORTH, '#8f5bff', 22);
  carOn(sim, 'sedan', SHOT_AVENUE, 900, NORTH, '#177d95', 24);
  // Oncoming, one after another, close enough to pass at speed in the far lane.
  carOn(sim, 'suv', SHOT_AVENUE, 1058, SOUTH, '#177d95', 20);
  carOn(sim, 'sedan', SHOT_AVENUE, 998, SOUTH, '#e8483f', 18);
  carOn(sim, 'coupe', SHOT_AVENUE, 940, SOUTH, '#ffd23c', 21);
  carOn(sim, 'sedan', SHOT_AVENUE, 1160, SOUTH, '#22e6d0', 19);
  carOn(sim, 'sedan', SHOT_CROSS, 1000, EAST, '#ff7a30', 16);

  // The cruiser that started it, two lengths back with its bar going.
  sim.police.stars = 2;
  sim.police.heat = 0.8;
  sim.police.seen = true;
  sim.police.quiet = 0;
  sim.police.units.length = 0;
  const tail = newCar('cruiser', laneX(NORTH), 1108, -Math.PI / 2, '#f2f3f5', { id: 901 });
  sim.police.units.push({ car: tail, x: tail.x, z: tail.z, yaw: tail.yaw, speed: 26, mode: 'chase', officers: [], tag: 'vmpd-01', age: 8, siren: 3 });

  sim.crowd.length = 0;
  for (let i = 0; i < 16; i += 1) {
    const side = i % 2 === 0 ? PAVE_W : PAVE_E;
    pedAt(sim, side, 1180 - i * 24, i % 2 === 0 ? 0 : Math.PI, {
      shirt: ['#ff2f86', '#22e6d0', '#ffd23c', '#f4efe3'][i % 4],
    });
  }

  // Behind and above the drop-top: the boulevard running away north, the near lane full of tail
  // lights, the oncoming lane full of headlights.
  return {
    camera: { x: hero.x + 1.0, y: 3.5, z: hero.z + 7.4, lx: hero.x + 1.4, ly: 1.5, lz: hero.z - 26, fov: 58 },
    input: () => ({ ...NEUTRAL, move: { x: 0, z: -1 }, run: true }),
  };
}

export const SHOT_NAMES = ['cover', 'foot', 'chase', 'driving'];