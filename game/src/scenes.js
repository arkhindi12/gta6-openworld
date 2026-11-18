// scenes.js — the four pictures, staged from the address bar.
//
// ?shot=cover|foot|chase|driving builds the same seeded city the player gets, puts the cast where
// the picture needs them and parks the camera. Nothing here draws: main.js renders the result
// through the same render() the game uses — HUD and all — and then holds the frame, so the picture
// is exactly what was staged.
//
// Placement is always "this avenue, this heading, this far along", never a raw x/z, because
// traffic.js owns the lane offset; a staged car therefore sits in a real lane and the queue behind
// it brakes for it. Avenues sit on multiples of 252 m, their kerbs 23 m either side of a centre
// line, and the lanes 5.3 m to the right of that.

import { carInLane, makeCar } from './traffic.js';
import { makePerson } from './crowd.js';
import { newStory } from './jobs.js';

const STILL = { move: { x: 0, z: 0 }, fire: false, use: false, run: false, reload: false };

// The avenue all four pictures look up, and the cross street the turning cars come from.
export const SHOT_AVENUE = 1008;
export const SHOT_CROSS = 756;
const NORTH = { dx: 0, dz: -1 };
const SOUTH = { dx: 0, dz: 1 };
const EAST = { dx: 1, dz: 0 };
const WEST = { dx: -1, dz: 0 };
// The pavement edges either side of that avenue: block three ends at 985, block four starts at 1031.
const PAVE_W = 979;
const PAVE_E = 1037;
const LANE_OFF = 5.3;

/** The x a northbound car keeps to on this avenue. */
const laneX = (dir) => SHOT_AVENUE + (dir === NORTH ? LANE_OFF : -LANE_OFF);

/** A car seated in a real lane, already rolling at `speed`. */
function roll(sim, kind, line, along, dir, paint, speed) {
  const car = carInLane(kind, line, along, dir, paint);
  car.speed = speed;
  car.cruise = speed;
  sim.traffic.push(car);
  return car;
}

/** A pedestrian at a spot, facing `heading`. */
function stand(sim, x, z, heading, extra = {}) {
  const p = makePerson(sim.rand, x, z, heading, extra);
  p.phase = sim.rand() * 6.28;
  sim.crowd.push(p);
  return p;
}

/** A cruiser with a two-officer crew, either seated or already out on the street. */
function cruiserAt(sim, x, z, heading, deployed = true) {
  const car = makeCar('cruiser', x, z, heading, '#f2f3f5', { id: 900 + sim.police.units.length });
  const unit = {
    car,
    x,
    z,
    yaw: heading,
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
function volley(sim, count = 2) {
  sim.police.rounds.length = 0;
  const p = sim.player;
  let n = 0;
  for (const u of sim.police.units) {
    for (const o of u.officers) {
      if (!o.alive || o.inCar) continue;
      o.yaw = Math.atan2(p.z - o.z, p.x - o.x);
      if (n >= count) continue;
      const heading = o.yaw + (n - 0.5) * 0.05;
      sim.police.rounds.push({
        x: o.x + Math.cos(heading) * (3 + n * 4),
        z: o.z + Math.sin(heading) * (3 + n * 4),
        vx: Math.cos(heading) * 145,
        vz: Math.sin(heading) * 145,
        life: 0.9,
        y: 1.35,
      });
      o.flash = 1;
      n += 1;
    }
  }
}

/**
 * Stage one of the four pictures. Returns { camera, input } or null if the name is not one of them.
 * The camera is a plain object in the same shape the follow camera uses.
 */
export function stageShot(name, sim) {
  if (name === 'cover') return cover(sim);
  if (name === 'foot') return onFoot(sim);
  if (name === 'chase') return chase(sim);
  if (name === 'driving') return driving(sim);
  return null;
}

/** The start screen: over the gulf looking back at the city, towers against the light, title lit. */
function cover(sim) {
  sim.mode = 'title';
  sim.story = newStory();
  sim.story.cash = 12480;
  const p = sim.player;
  p.x = 700;
  p.z = 1010;
  p.yaw = -Math.PI / 2;
  p.aimYaw = -Math.PI / 2;
  sim.time = 0.9;
  return {
    camera: { x: 1650, y: 130, z: 240, lx: 520, ly: 26, lz: 860, fov: 52 },
    input: () => STILL,
  };
}

/**
 * On the west pavement facing up the avenue: the near lane coming at the camera, the far lane
 * heading away, both kerbs busy, the job marker up the street, and a coupe at the kerb to take.
 */
function onFoot(sim) {
  sim.mode = 'play';
  sim.story = newStory();
  sim.story.index = 1;
  sim.story.done = 1;
  sim.story.cash = 590;
  const p = sim.player;
  p.x = PAVE_W + 1.6;
  p.z = 1112;
  p.yaw = -Math.PI / 2;
  p.aimYaw = -Math.PI / 2 + 0.1;
  p.hp = 92;
  p.clip = 13;
  p.ammo = 48;
  p.phase = 1.1;
  p.moving = 1;
  p.running = 0;

  sim.traffic.length = 0;
  roll(sim, 'sedan', SHOT_AVENUE, 1080, NORTH, '#22e6d0', 9);
  roll(sim, 'cab', SHOT_AVENUE, 1036, NORTH, '#ffcc33', 8);
  roll(sim, 'coupe', SHOT_AVENUE, 978, NORTH, '#8f5bff', 11);
  roll(sim, 'suv', SHOT_AVENUE, 910, NORTH, '#f2f0ea', 12);
  roll(sim, 'drop', SHOT_AVENUE, 1098, SOUTH, '#ff2f86', 12);
  roll(sim, 'sedan', SHOT_AVENUE, 1038, SOUTH, '#ffd23c', 10);
  roll(sim, 'van', SHOT_AVENUE, 972, SOUTH, '#177d95', 9);
  roll(sim, 'sedan', SHOT_AVENUE, 1136, SOUTH, '#e8483f', 13);
  roll(sim, 'sedan', SHOT_CROSS, 880, EAST, '#e8483f', 10);
  roll(sim, 'coupe', SHOT_CROSS, 940, WEST, '#ff7a30', 9);
  roll(sim, 'cab', SHOT_CROSS, 990, EAST, '#ffcc33', 8);
  const kerb = roll(sim, 'coupe', SHOT_AVENUE, 1056, NORTH, '#232331', 0);
  kerb.x = SHOT_AVENUE - 19.4;
  kerb.parked = true;

  sim.crowd.length = 0;
  stand(sim, PAVE_W + 1.6, 1084, Math.PI, { shirt: '#ff2f86', skin: '#d9a06b' });
  stand(sim, PAVE_W + 3.0, 1054, 0, { shirt: '#f4efe3', trousers: '#26324a', hat: true });
  stand(sim, PAVE_W + 1.2, 1012, Math.PI, { shirt: '#3d8bff', skin: '#a86b3f' });
  stand(sim, PAVE_W + 3.2, 970, 0, { shirt: '#ffd23c', bag: true });
  stand(sim, PAVE_E, 1076, 0, { shirt: '#22e6d0' });
  stand(sim, PAVE_E + 1.6, 1018, Math.PI, { shirt: '#ff7a30', skin: '#7a4a2a' });
  stand(sim, PAVE_E - 1.0, 962, 0, { shirt: '#63d07a', hat: true });
  stand(sim, PAVE_E + 0.8, 1132, Math.PI, { shirt: '#e8483f' });
  stand(sim, PAVE_W + 2.0, 934, Math.PI, { shirt: '#f4efe3' });
  stand(sim, PAVE_E + 1.0, 902, 0, { shirt: '#ff2f86' });
  stand(sim, PAVE_W + 4.4, 1144, Math.PI, { shirt: '#8f5bff' });
  stand(sim, PAVE_E + 2.4, 1144, Math.PI, { shirt: '#ffd23c', skin: '#a86b3f' });
  stand(sim, PAVE_W + 0.6, 876, 0, { shirt: '#177d95' });
  stand(sim, PAVE_E - 2.0, 866, Math.PI, { shirt: '#ff7a30', hat: true });
  const down = stand(sim, PAVE_E - 2.2, 1046, 0.4, { shirt: '#26324a', skin: '#e8b98c' });
  down.down = 4;

  // Over the right shoulder, a touch above head height: the player low and left of centre, the
  // avenue running to its vanishing point, the palm rank framing the left edge.
  return {
    camera: { x: p.x + 1.9, y: 3.3, z: p.z + 5.4, lx: p.x + 2.2, ly: 1.5, lz: p.z - 18, fov: 58 },
    input: () => ({ ...STILL, aim: { x: SHOT_AVENUE + 40, z: 880 } }),
  };
}

/**
 * Three stars in the avenue: two cruisers slewed across the lane, crews out and firing over their
 * doors, the crowd scattering, a body in the road, the player's own round in the air.
 */
function chase(sim) {
  sim.mode = 'play';
  sim.story = newStory();
  sim.story.index = 3;
  sim.story.done = 3;
  sim.story.cash = 2960;
  const p = sim.player;
  p.x = laneX(NORTH) - 1.4;
  p.z = 992;
  p.yaw = -Math.PI / 2;
  p.aimYaw = -Math.PI / 2 + 0.05;
  p.hp = 61;
  p.armour = 18;
  p.clip = 8;
  p.ammo = 42;
  p.moving = 0;
  p.phase = 0.4;
  p.muzzle = 1;

  sim.police.stars = 3;
  sim.police.heat = 0.95;
  sim.police.quiet = 0;
  sim.police.seen = true;
  sim.police.units.length = 0;
  // Two cruisers slewed across the avenue, one either side of the player's line, with their crews
  // standing clear of the bodywork in the open lane so both bars, both liveries and four pistols
  // read at once.
  const near = cruiserAt(sim, SHOT_AVENUE - 7, 976, 0.55, true);
  const far = cruiserAt(sim, SHOT_AVENUE + 9, 981, -0.45, true);
  const nearCrew = [
    [SHOT_AVENUE - 6.5, 980],
    [SHOT_AVENUE - 9.5, 984],
  ];
  const farCrew = [
    [SHOT_AVENUE + 7.5, 983],
    [SHOT_AVENUE + 11.0, 987],
  ];
  [near, far].forEach((unit, k) => {
    const spots = k === 0 ? nearCrew : farCrew;
    unit.officers.forEach((o, i) => {
      o.x = spots[i][0];
      o.z = spots[i][1];
      o.yaw = Math.atan2(p.z - o.z, p.x - o.x);
      o.inCar = false;
      o.moving = i === 0 ? 1 : 0;
    });
  });
  // One officer already down behind the far cruiser.
  far.officers[1].alive = false;
  far.officers[1].down = 0.5;

  sim.traffic.length = 0;
  const slewed = roll(sim, 'suv', SHOT_AVENUE + 2, 1018, NORTH, '#f2f0ea', 0);
  slewed.yaw += 0.7;
  roll(sim, 'cab', SHOT_AVENUE, 918, NORTH, '#ffcc33', 0);
  roll(sim, 'coupe', SHOT_CROSS, 972, EAST, '#22e6d0', 0);
  roll(sim, 'sedan', SHOT_AVENUE - 3, 1002, SOUTH, '#8f5bff', 0);

  sim.crowd.length = 0;
  stand(sim, PAVE_W, 962, 0.4, { shirt: '#ff2f86' }).panic = 3.4;
  stand(sim, PAVE_W - 2, 924, -2.2, { shirt: '#ffd23c' }).panic = 3.2;
  stand(sim, PAVE_E, 966, -0.4, { shirt: '#22e6d0' }).panic = 2.8;
  stand(sim, PAVE_E + 1.6, 924, -2.6, { shirt: '#f4efe3', hat: true }).panic = 3.0;
  stand(sim, PAVE_W + 1, 900, -1.9, { shirt: '#63d07a' }).panic = 2.4;
  stand(sim, PAVE_E + 3, 1032, -1.2, { shirt: '#ff7a30' }).panic = 3.1;
  stand(sim, PAVE_W + 2, 1046, 1.4, { shirt: '#8f5bff' }).panic = 3.5;
  const body = stand(sim, SHOT_AVENUE - 6, 984, 0.9, { shirt: '#26324a', skin: '#e8b98c' });
  body.down = 2.4;
  const body2 = stand(sim, PAVE_W - 1, 1004, -0.5, { shirt: '#e8483f', skin: '#7a4a2a' });
  body2.down = 1.2;
  for (const q of sim.crowd) {
    if (q.down > 0) continue;
    q.run = 1;
    q.moving = 1;
  }
  volley(sim, 2);
  // The player's own round in the air, on its way to the near cruiser.
  sim.rounds.push({ x: p.x + 3.5, y: 1.35, z: p.z - 5.5, vx: 0, vz: -200, life: 0.5, travelled: 0 });

  // Low and close over the shoulder: the near cruiser fills the left, its crew in the road.
  return {
    camera: { x: p.x + 1.6, y: 2.5, z: p.z + 4.6, lx: p.x - 0.4, ly: 1.25, lz: p.z - 20, fov: 60 },
    input: () => ({ ...STILL, aim: { x: SHOT_AVENUE, z: 1180 } }),
  };
}

/**
 * A stolen drop-top flat out up the boulevard: a taxi and a coupe just ahead in the lane, the
 * oncoming side full, two stars on the tail, the crowd on both kerbs.
 */
function driving(sim) {
  sim.mode = 'play';
  sim.story = newStory();
  sim.story.index = 4;
  sim.story.done = 4;
  sim.story.cash = 6180;
  const p = sim.player;
  p.hp = 78;
  p.clip = 11;
  p.ammo = 34;

  sim.traffic.length = 0;
  const hero = roll(sim, 'drop', SHOT_AVENUE, 1056, NORTH, '#ff2f86', 30);
  hero.stolen = true;
  p.driving = hero;
  p.x = hero.x;
  p.z = hero.z;
  p.yaw = hero.yaw;
  p.aimYaw = hero.yaw;

  // The same lane, just ahead: the taxi the player is closing on, then the coupe beyond it.
  roll(sim, 'cab', SHOT_AVENUE, 1024, NORTH, '#ffcc33', 24);
  roll(sim, 'coupe', SHOT_AVENUE, 976, NORTH, '#f2f0ea', 26);
  roll(sim, 'sedan', SHOT_AVENUE, 928, NORTH, '#8f5bff', 22);
  roll(sim, 'sedan', SHOT_AVENUE, 872, NORTH, '#177d95', 24);
  // Oncoming, one after another, close enough to pass at speed in the far lane.
  roll(sim, 'suv', SHOT_AVENUE, 1034, SOUTH, '#177d95', 20);
  roll(sim, 'sedan', SHOT_AVENUE, 974, SOUTH, '#e8483f', 18);
  roll(sim, 'coupe', SHOT_AVENUE, 916, SOUTH, '#ffd23c', 21);
  roll(sim, 'sedan', SHOT_AVENUE, 1136, SOUTH, '#22e6d0', 19);
  roll(sim, 'sedan', SHOT_CROSS, 980, EAST, '#ff7a30', 16);

  // The cruiser that started it, in the oncoming lane with its bar going, close enough to read.
  sim.police.stars = 2;
  sim.police.heat = 0.8;
  sim.police.seen = true;
  sim.police.quiet = 0;
  sim.police.units.length = 0;
  const tail = makeCar('cruiser', laneX(SOUTH), hero.z - 34, Math.PI / 2, '#f2f3f5', { id: 901 });
  sim.police.units.push({ car: tail, x: tail.x, z: tail.z, yaw: tail.yaw, speed: 26, mode: 'chase', officers: [], tag: 'vmpd-01', age: 8, siren: 3 });

  sim.crowd.length = 0;
  for (let i = 0; i < 16; i += 1) {
    const side = i % 2 === 0 ? PAVE_W : PAVE_E;
    stand(sim, side, 1156 - i * 24, i % 2 === 0 ? 0 : Math.PI, { shirt: ['#ff2f86', '#22e6d0', '#ffd23c', '#f4efe3'][i % 4] });
  }

  // Drive it flat out up the avenue, from a point eleven metres back of the bonnet.
  return {
    camera: { x: hero.x - 0.2, y: 6.2, z: hero.z + 15.5, lx: hero.x + 0.6, ly: 0.9, lz: hero.z - 22, fov: 58 },
    input: () => ({ ...STILL, move: { x: 0, z: -1 }, run: true }),
  };
}

export const SHOT_NAMES = ['cover', 'foot', 'chase', 'driving'];