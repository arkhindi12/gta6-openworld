// sim.js — the world as one state machine, and the single tick that advances all of it.
//
// The live game, a paused frame and a staged photograph all come through here. `tick` takes its
// input as plain data, so a photograph can hand the world a script and land in a known pose; it
// knows nothing about meshes, cameras or pixels.
//
// The order matters:
//   1. the player's own clocks, and the reload
//   2. the player's movement — on foot or driving — and the trigger
//   3. traffic (which needs the player as an obstacle), then the crowd, then the police
//   4. the player's rounds, resolved against walls, people and officers
//   5. the police's rounds, resolved against the player
//   6. the job chain, and the arrest or death check that can end the run

import { GUN, GAIT } from './scale.js';
import { CityPlan } from './cityPlan.js';
import { stream } from './random.js';
import { seedFleet, driveFleet, carInLane } from './traffic.js';
import { seedCrowd, walkCrowd, scatter, personAt, fellAt, bodyAhead, makePerson } from './crowd.js';
import { newPolice, runPolice, raiseHeat, standDown, hitOfficer, arrestAt } from './officers.js';
import { newStory, currentJob, testJob, announce, liveCondition, JOBS } from './jobs.js';
import { newPlayer, toggleVehicle, nearestCar, fireWeapon, reloadWeapon, hurt, advanceRound, walkPlayer, drivePlayer, HOME } from './player.js';

export const STEP = 1 / 60;

/** Build a world for a seed: plan, cast, story, and the props the first jobs need. */
export function createSim(seed = 1) {
  const sim = {
    seed,
    plan: new CityPlan(seed),
    rand: stream(seed * 3 + 9),
    time: 0,
    mode: 'title', // title | play | paused | busted | wasted | complete
    player: newPlayer(),
    traffic: seedFleet(seed),
    crowd: seedCrowd(seed),
    police: newPolice(seed),
    story: newStory(),
    rounds: [],
    impacts: [],
    floaters: [],
    prompt: '',
    shake: 0,
    flash: 0,
    crewDown: 0,
    pointer: { x: 0, y: 0 },
    project: null,
    viewYaw: 0,
    events: { onShot: null, onCopShot: null, onCash: null, onReload: null, onImpact: null, onSave: null },
    onCrime: null,
  };
  sim.onCrime = (kind, at) => commitCrime(sim, kind, at);
  dressForJob(sim);
  return sim;
}

// ---------------------------------------------------------------- the job's props

/**
 * The world changes as the chain moves: job two parks a pink drop-top on the Strip for the player to
 * take, and job three puts a crew of three on the marina forecourt. Both are placed from the job's
 * own record, so the marker and the thing inside it can never disagree.
 */
export function dressForJob(sim) {
  const job = currentJob(sim.story);
  if (!job) return;

  if (job.car) {
    const car = carInLane(job.car.kind, sim.plan.nearestAvenue(job.car.x), job.car.z, { dx: 0, dz: 1 }, job.car.paint, {
      parked: true,
      missionCar: job.id,
    });
    car.x = job.car.x;
    car.z = job.car.z;
    sim.traffic.push(car);
  }

  if (job.beat === 'clear') {
    for (let i = 0; i < job.need; i += 1) {
      const a = (i / job.need) * Math.PI * 2 + 0.4;
      const p = makePerson(sim.rand, job.at.x + Math.cos(a) * (job.radius * 0.42), job.at.z + Math.sin(a) * (job.radius * 0.42), a + Math.PI);
      p.crew = true;
      p.shirt = '#2b2b36';
      p.trousers = '#16161d';
      sim.crowd.push(p);
    }
  }
}

/** How many of the crew are down inside the marker, for a `clear` job. */
function crewDownInside(sim, job) {
  if (job.beat !== 'clear') return 0;
  let n = 0;
  for (const p of sim.crowd) {
    if (p.down > 0 && Math.hypot(p.x - job.at.x, p.z - job.at.z) < job.radius + 4) n += 1;
  }
  return n;
}

// ---------------------------------------------------------------- crime

/**
 * Something the law cares about. A shot fired is a star; a shot that drops somebody is three; a car
 * stolen is one, or two if a cruiser happens to be watching.
 */
function commitCrime(sim, kind, at) {
  if (sim.mode !== 'play') return;
  if (kind === 'shot') {
    raiseHeat(sim.police, 1);
    scatter(sim.crowd, at.x, at.z, 52, () => {
      // A witness close enough to see the gun calls it in harder.
      for (const p of sim.crowd) {
        if (p.down > 0) continue;
        if (Math.hypot(p.x - at.x, p.z - at.z) < 22) {
          raiseHeat(sim.police, 2);
          break;
        }
      }
    });
    return;
  }
  if (kind === 'kill') {
    raiseHeat(sim.police, 3);
    return;
  }
  if (kind === 'theft') {
    const seen = sim.police.units.some((u) => Math.hypot(u.x - at.x, u.z - at.z) < 60);
    raiseHeat(sim.police, seen ? 2 : 1);
    return;
  }
  if (kind === 'copdown') raiseHeat(sim.police, 4);
}

// ---------------------------------------------------------------- the frame

/**
 * Advance the world one step. `input` is
 *   { move: {x, z}, aim: {x, z} | null, fire, use, run, reload }
 * where `move` is world-space (the camera maps WASD onto the ground), `aim` is a ground point to
 * face, `use` is true on the step E came down, and `fire` is held.
 */
export function tick(sim, dt, input) {
  sim.time += dt;
  const p = sim.player;

  sim.shake *= Math.exp(-dt * 6);
  sim.flash = Math.max(0, sim.flash - dt * 2.4);
  p.muzzle = Math.max(0, p.muzzle - dt * 9);
  p.recoil = Math.max(0, p.recoil - dt * 4);
  p.hurt = Math.max(0, p.hurt - dt * 0.9);
  p.cool = Math.max(0, p.cool - dt);
  tickReload(sim, dt);

  if (sim.mode === 'play') {
    if (input.use) toggleVehicle(sim);
    if (p.driving) drivePlayer(sim, dt, input);
    else walkPlayer(sim, dt, input);
    if (input.fire) fireWeapon(sim);
    if (input.reload) reloadWeapon(sim);
  }

  stepWorld(sim, dt);

  if (sim.mode === 'play') {
    if (p.hp <= 0) {
      sim.mode = 'wasted';
      sim.shake = 1.2;
      sim.story.toastT = 0;
      sim.story.toast = '';
    } else if (!p.driving && arrestAt(sim.police, p.x, p.z)) {
      sim.mode = 'busted';
      sim.police.busted += 1;
      standDown(sim.police);
      sim.story.toastT = 0;
      sim.story.toast = '';
    }
  }
  updatePrompt(sim);
}

// The reload clock is the one part of the weapon the sim runs itself, because a reload can finish
// while the world is paused on a card.
function tickReload(sim, dt) {
  const p = sim.player;
  if (p.reload <= 0) return;
  p.reload -= dt;
  if (p.reload > 0) return;
  const take = Math.min(GUN.magazine - p.clip, p.ammo);
  p.clip += take;
  p.ammo -= take;
  if (take > 0) sim.events.onReload?.();
}

/** Traffic, crowd, police, bullets and the job: everything that runs while the world is live. */
function stepWorld(sim, dt) {
  const p = sim.player;
  const live = sim.mode === 'play' || sim.mode === 'busted' || sim.mode === 'wasted';
  const blockers = [];
  if (p.driving) blockers.push({ x: p.driving.x, z: p.driving.z, len: p.driving.len });
  for (const u of sim.police.units) blockers.push({ x: u.x, z: u.z, len: u.car.len });

  if (live) {
    for (const car of sim.traffic) car.bodyAhead = bodyAhead(sim.crowd, car.x, car.z, car.yaw, 11, 1.7);
    driveFleet(sim.traffic, dt, blockers, p.driving ? null : { x: p.x, z: p.z });
  }

  walkCrowd(sim.crowd, dt, sim.time, sim.plan, sim.mode === 'play' && !p.driving ? p : null);

  if (sim.mode === 'play') {
    runPolice(sim.police, dt, sim.plan, {
      player: {
        x: p.x,
        z: p.z,
        yaw: p.aimYaw,
        vx: p.driving ? Math.cos(p.driving.yaw) * p.driving.speed : 0,
        vz: p.driving ? Math.sin(p.driving.yaw) * p.driving.speed : 0,
      },
      blockers: blockers.concat(sim.traffic.filter((c) => !c.stolen).map((c) => ({ x: c.x, z: c.z, len: c.len }))),
      onFire: (o) => sim.events.onCopShot?.(o),
      viewYaw: sim.viewYaw ?? 0,
      // A police round finds the player at the body on foot, or at the car when driving.
      hitTest: (x, z) => (p.driving ? Math.hypot(x - p.driving.x, z - p.driving.z) < 2.2 : Math.hypot(x - p.x, z - p.z) < 0.65),
      onHit: () => {
        if (p.driving) {
          p.driving.speed *= 0.9;
          hurt(sim, 2.5);
        } else {
          hurt(sim, 8 + sim.rand() * 7);
        }
      },
    });
  }

  // ---- the player's rounds.
  for (let i = sim.rounds.length - 1; i >= 0; i -= 1) {
    if (advanceRound(sim.rounds[i], dt, (round) => resolveRound(sim, round))) sim.rounds.splice(i, 1);
  }

  // ---- cruisers that run the player down.
  if (sim.mode === 'play' && p.driving) {
    for (const u of sim.police.units) {
      if (Math.hypot(u.x - p.driving.x, u.z - p.driving.z) < 2.8 && u.speed > 4) {
        p.driving.speed *= 0.86;
        sim.shake = Math.max(sim.shake, 0.45);
      }
    }
  }

  // ---- the short-lived effects.
  for (let i = sim.impacts.length - 1; i >= 0; i -= 1) {
    sim.impacts[i].life -= dt;
    if (sim.impacts[i].life <= 0) sim.impacts.splice(i, 1);
  }
  for (let i = sim.floaters.length - 1; i >= 0; i -= 1) {
    const f = sim.floaters[i];
    f.life -= dt;
    f.y += dt * 1.6;
    if (f.life <= 0) sim.floaters.splice(i, 1);
  }

  // ---- the job chain.
  if (sim.mode === 'play') {
    const job = currentJob(sim.story);
    if (job) {
      sim.crewDown = crewDownInside(sim, job);
      const passed = testJob(sim.story, dt, p, { crewDown: sim.crewDown, stars: sim.police.stars });
      if (passed) bankJob(sim, passed);
    } else {
      sim.story.toastT = Math.max(0, sim.story.toastT - dt);
      if (sim.story.toastT <= 0) sim.mode = 'complete';
    }
  }
}

function bankJob(sim, job) {
  sim.events.onCash?.(job.reward);
  const p = sim.player;
  sim.floaters.push({ x: p.x, z: p.z, y: 2.2, life: 2.4, text: `+$${job.reward}`, colour: '#7dffcf' });
  sim.events.onSave?.(sim.story);
  dressForJob(sim);
}

/**
 * What a round met on its way: a wall, a person, an officer. Returns true when the round stops
 * there.
 */
function resolveRound(sim, r) {
  if (sim.plan.buildingAt(r.x, r.z, 0)) {
    impact(sim, r.x, r.z, '#ffd9a0', 0.28);
    return true;
  }
  const person = personAt(sim.crowd, r.x, r.z, 0.55);
  if (person) {
    fellAt(sim.crowd, person.x, person.z, 0.8);
    impact(sim, person.x, person.z, '#ff4d6d', 0.55);
    sim.story.kills += 1;
    commitCrime(sim, 'kill', person);
    scatter(sim.crowd, person.x, person.z, 30);
    return true;
  }
  const officer = hitOfficer(sim.police, r.x, r.z, 0.65);
  if (officer) {
    impact(sim, r.x, r.z, '#ff4d6d', 0.55);
    if (!officer.alive) {
      // An officer going down is the loudest thing the street has heard all evening.
      commitCrime(sim, 'copdown', officer);
      scatter(sim.crowd, officer.x, officer.z, 40);
    }
    return true;
  }
  return false;
}

function impact(sim, x, z, colour, size) {
  sim.impacts.push({ x, z, y: 1.1, life: 0.22, max: 0.22, colour, size });
  sim.events.onImpact?.(x, z);
}

// ---------------------------------------------------------------- the HUD's own state

function updatePrompt(sim) {
  const p = sim.player;
  sim.prompt = '';
  if (sim.mode !== 'play') return;
  if (p.driving) {
    sim.prompt = 'E · LEAVE THE CAR';
    return;
  }
  if (nearestCar(sim, GAIT.reach)) sim.prompt = 'E · TAKE THE CAR';
  else if (p.clip === 0 && p.ammo > 0) sim.prompt = 'R · RELOAD';
}

/** What the HUD prints above the minimap: the job, its line and its live condition. */
export function jobText(sim) {
  const job = currentJob(sim.story);
  if (!job) {
    return { title: 'ALL JOBS DONE', line: 'The bay is quiet. The money is not.', cond: '', index: JOBS.length, of: JOBS.length };
  }
  return {
    title: job.title,
    line: job.line,
    cond: liveCondition(job, sim.player, { crewDown: sim.crewDown, stars: sim.police.stars }),
    index: sim.story.index,
    of: JOBS.length,
  };
}

// ---------------------------------------------------------------- the modes

/** Start from the title card: the player is already on the street, clean, with a job waiting. */
export function startRun(sim) {
  sim.mode = 'play';
  sim.story.toastT = 0;
  const job = currentJob(sim.story);
  announce(sim.story, `WELCOME TO VICE MERIDIAN  ·  ${job ? `${job.title.toUpperCase()} IS WAITING` : 'THE CITY IS YOURS'}`, 5);
}

/** Put the player back on the pavement after an arrest or a bad night, a little poorer. */
export function respawn(sim) {
  const p = sim.player;
  sim.story.cash = Math.max(0, Math.floor(sim.story.cash * 0.9));
  p.hp = p.hpMax;
  p.armour = 0;
  p.clip = GUN.magazine;
  p.ammo = Math.max(p.ammo, 34);
  p.hurt = 0;
  p.reload = 0;
  p.driving = null;
  p.x = HOME.x;
  p.z = HOME.z;
  p.yaw = 0;
  p.aimYaw = 0;
  standDown(sim.police);
  sim.rounds.length = 0;
  sim.impacts.length = 0;
  // Whatever the player was driving is left well away, not on top of them.
  for (const c of sim.traffic) {
    if (c.stolen && Math.hypot(c.x - p.x, c.z - p.z) < 60) {
      c.x += 140;
      c.speed = 0;
    }
  }
  sim.mode = 'play';
  announce(sim.story, 'YOU WOKE UP ON THE PROMENADE  ·  THE JOB IS STILL WAITING', 4);
  sim.events.onSave?.(sim.story);
}

/** A whole new run: a fresh story, the fleet back in the traffic's hands, the player at home. */
export function restartRun(sim) {
  sim.story = newStory();
  sim.mode = 'title';
  for (const c of sim.traffic) {
    if (c.stolen) {
      c.stolen = false;
      c.parked = false;
    }
  }
  sim.player = newPlayer();
  sim.rounds.length = 0;
  sim.impacts.length = 0;
  sim.floaters.length = 0;
  standDown(sim.police);
  dressForJob(sim);
}

export { JOBS };