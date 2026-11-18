// cast.js — the moving cast in three.js: car bodies, pedestrians, officers, rounds and flashes.
//
// Two tricks keep a whole city affordable. A car is one merged buffer with its paint baked into
// vertex colours (vehicle.js), so the fleet costs two draw calls a car. People are built from
// InstancedMeshes — torso, hips, head, arms, legs — each drawn for every body at once, so a
// hundred and twenty walking people cost about a dozen draw calls in total.
//
// Nothing here allocates inside the frame loop. The pools are built once, posing writes into them,
// and a part a body is not wearing this frame is collapsed by scaling its instance to nothing.

import * as THREE from '../vendor/three/three.module.min.js';
import { PAINT } from './scale.js';
import { assemble, outfitCruiser, park } from './vehicle.js';
import { glow } from './textures.js';

// ---------------------------------------------------------------- body parts

const LIMB = {
  torso: new THREE.BoxGeometry(0.46, 0.6, 0.26),
  hips: new THREE.BoxGeometry(0.4, 0.2, 0.24),
  head: new THREE.SphereGeometry(0.135, 9, 7),
  hair: new THREE.SphereGeometry(0.142, 9, 7, 0, Math.PI * 2, 0, Math.PI * 0.6),
  arm: new THREE.BoxGeometry(0.11, 0.5, 0.12),
  leg: new THREE.BoxGeometry(0.15, 0.66, 0.17),
  shoe: new THREE.BoxGeometry(0.17, 0.1, 0.27),
  hatBrim: new THREE.CylinderGeometry(0.23, 0.23, 0.03, 9),
  hatCrown: new THREE.CylinderGeometry(0.12, 0.14, 0.12, 9),
  bag: new THREE.BoxGeometry(0.26, 0.3, 0.14),
  pistol: new THREE.BoxGeometry(0.09, 0.13, 0.34),
};
// A limb hangs from its shoulder or hip, so move each one until that joint is at the origin.
LIMB.arm.translate(0, -0.25, 0);
LIMB.leg.translate(0, -0.33, 0);

/**
 * The body, part by part: where it hangs on the frame, which colour role it takes, and which joint
 * swings it. `hat`, `bag` and `policeOnly` decide whether this body is wearing it.
 */
const PARTS = [
  { key: 'torso', at: [0, 1.12, 0], role: 'top' },
  { key: 'hips', at: [0, 0.78, 0], role: 'legs' },
  { key: 'head', at: [0, 1.54, 0], role: 'skin' },
  { key: 'hair', at: [0, 1.56, -0.01], role: 'hair' },
  { key: 'armL', shape: 'arm', at: [-0.31, 1.34, 0], role: 'skin', joint: 'armL' },
  { key: 'armR', shape: 'arm', at: [0.31, 1.34, 0], role: 'skin', joint: 'armR' },
  { key: 'legL', shape: 'leg', at: [-0.12, 0.78, 0], role: 'legs', joint: 'legL' },
  { key: 'legR', shape: 'leg', at: [0.12, 0.78, 0], role: 'legs', joint: 'legR' },
  { key: 'shoeL', shape: 'shoe', at: [-0.12, 0.45, 0.04], role: 'shoe', joint: 'legL' },
  { key: 'shoeR', shape: 'shoe', at: [0.12, 0.45, 0.04], role: 'shoe', joint: 'legR' },
  { key: 'hatBrim', at: [0, 1.63, 0], role: 'hat', hat: true },
  { key: 'hatCrown', at: [0, 1.7, 0], role: 'hat', hat: true },
  { key: 'bag', at: [0.3, 1.05, -0.02], role: 'bag', bag: true },
  { key: 'pistol', at: [0.34, 1.12, 0.3], role: 'gun', policeOnly: true },
];

const UNIFORM = {
  top: '#22325c',
  legs: '#151f38',
  skin: '#b97d4e',
  hair: '#1a1410',
  hat: '#1b2746',
  shoe: '#101018',
  gun: '#15151c',
  bag: '#22325c',
};

function wear(role, look, police) {
  if (police) return UNIFORM[role] ?? '#ffffff';
  switch (role) {
    case 'top':
      return look.shirt ?? PAINT.tops[0];
    case 'legs':
      return look.trousers ?? PAINT.legs[0];
    case 'skin':
      return look.skin ?? PAINT.skins[0];
    case 'hair':
      return '#241a14';
    case 'hat':
      return '#efe3c6';
    case 'shoe':
      return '#15151b';
    case 'bag':
      return '#7a4a86';
    default:
      return '#ffffff';
  }
}

const NOTHING = new THREE.Vector3(0.0001, 0.0001, 0.0001);

/**
 * A pool of bodies drawn part-by-part with instancing. `set` poses slot i from a plain look record
 * — x, z, yaw, and optionally phase, moving, run, down, flash, plus the colours it wears.
 */
function bodyPool(scene, capacity) {
  const limbs = [];
  for (const part of PARTS) {
    const mesh = new THREE.InstancedMesh(LIMB[part.shape ?? part.key], new THREE.MeshLambertMaterial({ color: 0xffffff }), capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    const white = new THREE.Color(1, 1, 1);
    for (let i = 0; i < capacity; i += 1) mesh.setColorAt(i, white);
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    scene.add(mesh);
    limbs.push({ part, mesh, painted: new Array(capacity).fill(null) });
  }

  const rootTurn = new THREE.Quaternion();
  const jointTurn = new THREE.Quaternion();
  const rootMatrix = new THREE.Matrix4();
  const limbMatrix = new THREE.Matrix4();
  const at = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const euler = new THREE.Euler();
  const ink = new THREE.Color();

  return {
    capacity,
    set(i, look, police = false) {
      if (i >= capacity) return;
      const fallen = (look.down ?? 0) > 0;
      const drop = fallen ? Math.min(1, look.down * 3.4) * (Math.PI / 2) : 0;
      euler.set(0, -look.yaw + Math.PI / 2, 0);
      rootTurn.setFromEuler(euler);
      if (drop) {
        // Down in the street: rolled onto a side and laid on the tarmac.
        euler.set(0, 0, drop);
        jointTurn.setFromEuler(euler);
        rootTurn.multiply(jointTurn);
      }
      at.set(look.x, fallen ? 0.12 * drop : 0, look.z);
      rootMatrix.compose(at, rootTurn, one);

      const stride = fallen ? 0 : Math.sin(look.phase ?? 0) * (look.run ? 0.95 : 0.5) * (look.moving ? 1 : 0.12);

      for (const limb of limbs) {
        const part = limb.part;
        let tiltX = 0;
        let tiltZ = 0;
        let tucked = false;

        if (fallen) {
          if (part.joint === 'armL') tiltX = 0.35;
          if (part.joint === 'armR') tiltX = 0.1;
          if (part.joint === 'legL') tiltX = 0.15;
          if (part.joint === 'legR') tiltX = -0.1;
        } else if (police && (part.joint === 'armL' || part.joint === 'armR')) {
          // Both hands out in front: the pistol held two-handed at chest height.
          tiltX = part.joint === 'armR' ? -1.5 + (look.flash ?? 0) * 0.12 : -1.34 + (look.flash ?? 0) * 0.12;
          tiltZ = part.joint === 'armR' ? -0.12 : 0.2;
        } else if (part.joint === 'armL') {
          tiltX = -stride * 0.85;
          tiltZ = 0.12;
        } else if (part.joint === 'armR') {
          tiltX = stride * 0.85;
          tiltZ = -0.12;
        } else if (part.joint === 'legL') {
          tiltX = stride;
        } else if (part.joint === 'legR') {
          tiltX = -stride;
        }

        if (part.hat) tucked = !(police || look.hat);
        if (part.bag) tucked = !(look.bag && !police);
        if (part.policeOnly) tucked = !police || fallen;
        if (part.key === 'hair' && (police || look.hat)) tucked = true;

        euler.set(tiltX, 0, tiltZ);
        jointTurn.setFromEuler(euler);
        at.set(part.at[0], part.at[1], part.at[2]);
        limbMatrix.compose(at, jointTurn, tucked ? NOTHING : one);
        limbMatrix.premultiply(rootMatrix);
        limb.mesh.setMatrixAt(i, limbMatrix);

        const colour = wear(part.role, look, police);
        if (limb.painted[i] !== colour) {
          limb.painted[i] = colour;
          limb.mesh.setColorAt(i, ink.setStyle(colour));
        }
      }
    },
    show(n) {
      for (const limb of limbs) {
        limb.mesh.count = Math.min(n, capacity);
        limb.mesh.instanceMatrix.needsUpdate = true;
        if (limb.mesh.instanceColor) limb.mesh.instanceColor.needsUpdate = true;
      }
    },
  };
}

// ---------------------------------------------------------------- the cast

/**
 * Everything that moves: the fleet (a mesh per car record, built on first sight), the two body
 * pools, the bullet streaks, the muzzle and impact flashes, and the player's own body.
 */
export function buildCast(scene) {
  const cast = {
    scene,
    fleet: new Map(),
    crowd: bodyPool(scene, 180),
    officers: bodyPool(scene, 24),
    streaks: [],
    muzzles: [],
    impacts: [],
    hero: null,
  };

  // A round in flight: a long thin box, fatter than a real bullet so it reads at thirty metres.
  const streakGeo = new THREE.BoxGeometry(0.07, 0.07, 1);
  for (let i = 0; i < 48; i += 1) {
    const s = new THREE.Mesh(
      streakGeo,
      new THREE.MeshBasicMaterial({
        color: new THREE.Color('#fff2c0'),
        toneMapped: false,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    s.visible = false;
    s.frustumCulled = false;
    scene.add(s);
    cast.streaks.push(s);
  }

  // Muzzle flashes for the officers' pistols, billboarded at the barrel.
  for (let i = 0; i < 18; i += 1) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: glow('#fff0b8'),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    m.visible = false;
    m.frustumCulled = false;
    m.renderOrder = 4;
    scene.add(m);
    cast.muzzles.push(m);
  }

  // Impact flashes where a round lands.
  for (let i = 0; i < 26; i += 1) {
    const f = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: glow('#ffe0a8'),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    f.visible = false;
    f.frustumCulled = false;
    scene.add(f);
    cast.impacts.push(f);
  }
  return cast;
}

/** The player's own body: ordinary meshes, because it is the only one whose gun arm leads. */
export function buildHero(cast) {
  const group = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: new THREE.Color(PAINT.skins[0]) });
  const shirt = new THREE.MeshLambertMaterial({ color: new THREE.Color('#f4efe3') });
  const trousers = new THREE.MeshLambertMaterial({ color: new THREE.Color('#26324a') });
  const shoes = new THREE.MeshLambertMaterial({ color: new THREE.Color('#15151b') });
  const dark = new THREE.MeshLambertMaterial({ color: new THREE.Color('#1a1a20') });
  const hairMat = new THREE.MeshLambertMaterial({ color: new THREE.Color('#241a14') });

  const torso = new THREE.Mesh(LIMB.torso, shirt);
  torso.position.y = 1.12;
  const hips = new THREE.Mesh(LIMB.hips, trousers);
  hips.position.y = 0.78;
  const head = new THREE.Mesh(LIMB.head, skin);
  head.position.y = 1.54;
  const hair = new THREE.Mesh(LIMB.hair, hairMat);
  hair.position.set(0, 1.56, -0.01);

  const joint = (shape, material, x, y, z) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.add(new THREE.Mesh(shape, material));
    return g;
  };
  const armL = joint(LIMB.arm, skin, -0.31, 1.34, 0);
  const armR = joint(LIMB.arm, skin, 0.31, 1.34, 0);
  const legL = joint(LIMB.leg, trousers, -0.12, 0.78, 0);
  const legR = joint(LIMB.leg, trousers, 0.12, 0.78, 0);
  const shoeL = new THREE.Mesh(LIMB.shoe, shoes);
  shoeL.position.set(0, 0.33, 0.04);
  legL.add(shoeL);
  const shoeR = new THREE.Mesh(LIMB.shoe, shoes);
  shoeR.position.set(0, 0.33, 0.04);
  legR.add(shoeR);

  const gun = new THREE.Mesh(LIMB.pistol, dark);
  gun.position.set(0, -0.24, 0.2);
  gun.rotation.x = -1.35;
  armR.add(gun);

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      map: glow('#ffe6a0'),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
  );
  flash.visible = false;

  group.add(torso, hips, head, hair, armL, armR, legL, legR, flash);
  group.traverse((o) => {
    if (o.isMesh && o !== flash) o.castShadow = true;
  });
  group.visible = false;
  cast.scene.add(group);
  cast.hero = { group, torso, hips, head, hair, armL, armR, legL, legR, gun, flash };
  return cast.hero;
}

// ---------------------------------------------------------------- posing

function fleetEntry(cast, record, police) {
  let entry = cast.fleet.get(record);
  if (!entry) {
    entry = police ? assemble('cruiser', record.paint ?? '#f2f3f5') : assemble(record.kind, record.paint);
    if (police) {
      // Each cruiser carries its own bar materials: three on the street at once must be able to
      // beat out of step, so nothing here may be shared between two cars.
      entry.beacons = outfitCruiser(entry);
    }
    cast.scene.add(entry.group);
    cast.fleet.set(record, entry);
  }
  return entry;
}

/** Pose every car the sim knows about: the fleet, the stolen one, and each cruiser. */
export function poseFleet(cast, sim) {
  const live = new Set();
  for (const car of sim.traffic) {
    live.add(car);
    const entry = fleetEntry(cast, car, false);
    entry.group.visible = true;
    park(entry.group, car.x, car.z, car.yaw);
    // Tail lamps brighten under braking.
    entry.lamps.material.color.setScalar(car.lights > 0.35 ? 2.4 : 1);
  }
  for (const unit of sim.police.units) {
    live.add(unit.car);
    const entry = fleetEntry(cast, unit.car, true);
    entry.group.visible = true;
    park(entry.group, unit.x, unit.z, unit.yaw);
    // Both halves of the bar stay lit — a beacon that blinks out reads as a dead lamp at a
    // distance — and the beat rides the glow around them instead.
    const beat = Math.sin(sim.time * 9 + unit.age);
    for (const lamp of [entry.beacons.red, entry.beacons.blue]) {
      const on = lamp === entry.beacons.red ? beat > 0 : beat <= 0;
      lamp.userData.light.spark.material.opacity = on ? 1 : 0.24;
      lamp.userData.light.flare.material.opacity = on ? 0.4 : 0.08;
    }
    entry.beacons.pool.material.color.setStyle(beat > 0 ? '#ff3355' : '#4477ff');
    entry.beacons.pool.material.opacity = 0.26 + Math.abs(beat) * 0.24;
  }
  for (const [record, entry] of cast.fleet) {
    if (!live.has(record)) entry.group.visible = false;
  }
}

export function poseCrowd(cast, sim) {
  const people = sim.crowd;
  const n = Math.min(people.length, cast.crowd.capacity);
  for (let i = 0; i < n; i += 1) cast.crowd.set(i, people[i], false);
  cast.crowd.show(n);
}

/** Pose the officers — standing, aiming or down — and the flashes at their barrels. */
export function poseOfficers(cast, sim, camera) {
  let n = 0;
  let flashAt = 0;
  for (const unit of sim.police.units) {
    for (const o of unit.officers) {
      if (o.inCar && o.alive) continue;
      if (!o.alive && o.down <= 0) continue;
      if (n >= cast.officers.capacity) break;
      cast.officers.set(
        n,
        { x: o.x, z: o.z, yaw: o.yaw, phase: sim.time * 5 + n, moving: o.moving, run: 0, down: o.down > 0 ? 0.4 : 0, flash: o.flash },
        true,
      );
      n += 1;
      if (o.alive && o.flash > 0.05 && flashAt < cast.muzzles.length) {
        const f = cast.muzzles[flashAt];
        flashAt += 1;
        f.visible = true;
        f.position.set(o.x + Math.cos(o.yaw) * 0.62, 1.34, o.z + Math.sin(o.yaw) * 0.62);
        f.scale.setScalar(0.9 + o.flash * 1.1);
        f.material.opacity = Math.min(1, o.flash * 1.3);
        if (camera) f.quaternion.copy(camera.quaternion);
      }
    }
  }
  for (let i = flashAt; i < cast.muzzles.length; i += 1) cast.muzzles[i].visible = false;
  cast.officers.show(n);
}

/** The hero's stride, the lean into the aim, the gun arm and the muzzle flash. */
export function poseHero(cast, sim) {
  const hero = cast.hero;
  if (!hero) return;
  const p = sim.player;
  if (p.driving) {
    hero.group.visible = false;
    return;
  }
  hero.group.visible = true;
  const stride = Math.sin(p.phase) * (p.running ? 0.95 : 0.5) * (p.moving ? 1 : 0.12);
  hero.group.position.set(p.x, 0, p.z);
  hero.group.rotation.set(0, -p.yaw + Math.PI / 2, 0);
  hero.legL.rotation.x = stride;
  hero.legR.rotation.x = -stride;
  const lean = Math.max(-0.9, Math.min(0.9, p.aimYaw - p.yaw));
  hero.armR.rotation.set(-1.46, 0, -0.16 + lean * 0.3);
  hero.armL.rotation.set(-1.3, 0, 0.26 + lean * 0.2);
  if (p.muzzle > 0) {
    hero.flash.visible = true;
    hero.flash.position.set(Math.cos(p.aimYaw) * 0.8, 1.32, Math.sin(p.aimYaw) * 0.8);
    hero.flash.scale.setScalar(0.16 + p.muzzle * 0.2);
    hero.flash.rotation.y = -p.aimYaw + Math.PI / 2;
    hero.flash.material.opacity = p.muzzle;
  } else {
    hero.flash.visible = false;
  }
}

/** Every round in the air as a streak, and every impact as a short bright flare. */
export function poseShots(cast, sim, camera) {
  let n = 0;
  const streak = (x, y, z, vx, vz, colour) => {
    const s = cast.streaks[n];
    if (!s) return;
    n += 1;
    s.visible = true;
    s.position.set(x, y, z);
    s.rotation.set(0, -Math.atan2(vz, vx) + Math.PI / 2, 0);
    s.scale.set(1, 1, 3.2);
    s.material.color.setStyle(colour);
  };
  for (const r of sim.rounds) streak(r.x, r.y, r.z, r.vx, r.vz, '#fff6cc');
  for (const s of sim.police.rounds) streak(s.x, s.y ?? 1.35, s.z, s.vx, s.vz, '#d8f2ff');
  for (let i = n; i < cast.streaks.length; i += 1) cast.streaks[i].visible = false;

  let m = 0;
  for (const f of sim.impacts) {
    const flare = cast.impacts[m];
    if (!flare) break;
    m += 1;
    flare.visible = true;
    flare.position.set(f.x, f.y, f.z);
    flare.scale.setScalar(f.size * (1.4 + (1 - f.life / f.max) * 2.4));
    flare.material.color.setStyle(f.colour);
    flare.material.opacity = Math.max(0, f.life / f.max);
    if (camera) flare.quaternion.copy(camera.quaternion);
  }
  for (let i = m; i < cast.impacts.length; i += 1) cast.impacts[i].visible = false;
}