// The moving cast: every car, every pedestrian, every officer, and every streak of a bullet.
//
// Two tricks keep a whole city affordable. A car is one merged buffer with its paint baked into
// vertex colours (vehicles.js), so the fleet costs two draw calls a car rather than a dozen. The
// people are one InstancedMesh per body part with a per-instance colour, so a hundred and twenty
// walking bodies cost a dozen draw calls in total and not a thousand.
//
// Nothing here allocates in the frame loop. The pools are built once, pose writes into them, and a
// body that is not wanted this frame is collapsed by scaling its instances to nothing.

import * as THREE from '../vendor/three/three.module.min.js';
import { PALETTE } from './settings.js';
import { carMesh, dressAsCruiser } from './vehicles.js';
import { glowTexture } from './textures.js';

// ---------------------------------------------------------------- body parts

const parts = {
  torso: new THREE.BoxGeometry(0.46, 0.6, 0.26),
  hips: new THREE.BoxGeometry(0.4, 0.2, 0.24),
  head: new THREE.SphereGeometry(0.135, 9, 7),
  hair: new THREE.SphereGeometry(0.142, 9, 7, 0, Math.PI * 2, 0, Math.PI * 0.6),
  arm: new THREE.BoxGeometry(0.11, 0.5, 0.12),
  leg: new THREE.BoxGeometry(0.15, 0.66, 0.17),
  shoe: new THREE.BoxGeometry(0.17, 0.1, 0.27),
  hatBrim: new THREE.CylinderGeometry(0.23, 0.23, 0.03, 9),
  hatTop: new THREE.CylinderGeometry(0.12, 0.14, 0.12, 9),
  bag: new THREE.BoxGeometry(0.26, 0.3, 0.14),
  pistol: new THREE.BoxGeometry(0.07, 0.1, 0.26),
};
// Move each limb so the shoulder or hip sits at the pivot.
parts.arm.translate(0, -0.25, 0);
parts.leg.translate(0, -0.33, 0);
parts.shoe.translate(0, 0.33, 0);

/**
 * The body, part by part: where it hangs on the frame, what it is coloured with, and which swing
 * joint moves it. `needsHat`/`needsBag`/`policeOnly` decide visibility for a given wearer.
 */
const BODY = [
  { key: 'torso', at: [0, 1.12, 0], tone: 'shirt' },
  { key: 'hips', at: [0, 0.78, 0], tone: 'trousers' },
  { key: 'head', at: [0, 1.54, 0], tone: 'skin' },
  { key: 'hair', at: [0, 1.56, -0.01], tone: 'hair' },
  { key: 'armL', geo: 'arm', at: [-0.31, 1.34, 0], tone: 'skin', swing: 'armL' },
  { key: 'armR', geo: 'arm', at: [0.31, 1.34, 0], tone: 'skin', swing: 'armR' },
  { key: 'legL', geo: 'leg', at: [-0.12, 0.78, 0], tone: 'trousers', swing: 'legL' },
  { key: 'legR', geo: 'leg', at: [0.12, 0.78, 0], tone: 'trousers', swing: 'legR' },
  { key: 'shoeL', geo: 'shoe', at: [-0.12, 0.45, 0.04], tone: 'shoe', swing: 'legL' },
  { key: 'shoeR', geo: 'shoe', at: [0.12, 0.45, 0.04], tone: 'shoe', swing: 'legR' },
  { key: 'hatBrim', at: [0, 1.63, 0], tone: 'hat', needsHat: true },
  { key: 'hatTop', at: [0, 1.7, 0], tone: 'hat', needsHat: true },
  { key: 'bag', at: [0.3, 1.05, -0.02], tone: 'bag', needsBag: true },
  { key: 'pistol', at: [0.34, 1.12, 0.3], tone: 'gun', policeOnly: true },
];

const COP_TONES = {
  shirt: '#22325c',
  trousers: '#151f38',
  skin: '#b97d4e',
  hair: '#1a1410',
  hat: '#1b2746',
  shoe: '#101018',
  gun: '#15151c',
  bag: '#22325c',
};

function toneFor(tone, look, police) {
  if (police) return COP_TONES[tone] ?? '#ffffff';
  switch (tone) {
    case 'shirt':
      return look.shirt ?? PALETTE.shirts[0];
    case 'trousers':
      return look.trousers ?? PALETTE.trousers[0];
    case 'skin':
      return look.skin ?? PALETTE.skins[0];
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

const ZERO = new THREE.Vector3(0.0001, 0.0001, 0.0001);

/** A pool of bodies drawn as instanced parts. */
function bodyPool(scene, capacity) {
  const slots = [];
  for (const def of BODY) {
    const shape = parts[def.geo ?? def.key];
    const material = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const mesh = new THREE.InstancedMesh(shape, material, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    const white = new THREE.Color(1, 1, 1);
    for (let i = 0; i < capacity; i += 1) mesh.setColorAt(i, white);
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    scene.add(mesh);
    slots.push({ def, mesh, tones: new Array(capacity).fill(null) });
  }

  const rootQ = new THREE.Quaternion();
  const partQ = new THREE.Quaternion();
  const rootM = new THREE.Matrix4();
  const partM = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const eul = new THREE.Euler();
  const colour = new THREE.Color();

  return {
    capacity,
    slots,
    /**
     * Pose body `i`. `look` needs {x, z, yaw}; the rest is optional: phase, moving, run, down
     * (seconds fallen), shirt, trousers, skin, hat, bag, flash.
     */
    set(i, look, police = false) {
      const fallen = (look.down ?? 0) > 0;
      const fall = fallen ? Math.min(1, look.down * 3.4) * (Math.PI / 2) : 0;
      eul.set(0, -look.yaw + Math.PI / 2, 0);
      rootQ.setFromEuler(eul);
      if (fall) {
        // A body on the ground: rolled onto its side and lowered to the kerb.
        eul.set(0, 0, fall);
        partQ.setFromEuler(eul);
        rootQ.multiply(partQ);
      }
      pos.set(look.x, fallen ? 0.12 * fall : 0, look.z);
      rootM.compose(pos, rootQ, one);

      const swing = fallen ? 0 : Math.sin(look.phase ?? 0) * (look.run ? 0.95 : 0.5) * (look.moving ? 1 : 0.12);

      for (let k = 0; k < slots.length; k += 1) {
        const slot = slots[k];
        const def = slot.def;
        let rx = 0;
        let rz = 0;
        let hidden = false;

        if (fallen) {
          // Sprawled: arms out, legs bent, gun dropped.
          if (def.swing === 'armL') rx = 0.35;
          if (def.swing === 'armR') rx = 0.1;
          if (def.swing === 'legL') rx = 0.15;
          if (def.swing === 'legR') rx = -0.1;
        } else if (police && (def.swing === 'armL' || def.swing === 'armR')) {
          // Both hands up and forward: the pistol held two-handed at chest height.
          rx = def.swing === 'armR' ? -1.5 + (look.flash ?? 0) * 0.12 : -1.34 + (look.flash ?? 0) * 0.12;
          rz = def.swing === 'armR' ? -0.12 : 0.2;
        } else if (def.swing === 'armL') {
          rx = -swing * 0.85;
          rz = 0.12;
        } else if (def.swing === 'armR') {
          rx = swing * 0.85;
          rz = -0.12;
        } else if (def.swing === 'legL') {
          rx = swing;
        } else if (def.swing === 'legR') {
          rx = -swing;
        }

        if (def.needsHat) hidden = !(police || look.hat);
        if (def.needsBag) hidden = !(look.bag && !police);
        if (def.policeOnly) hidden = !police || fallen;
        if (def.key === 'hair' && (police || look.hat)) hidden = true;

        eul.set(rx, 0, rz);
        partQ.setFromEuler(eul);
        pos.set(def.at[0], def.at[1], def.at[2]);
        partM.compose(pos, partQ, hidden ? ZERO : one);
        partM.premultiply(rootM);
        slot.mesh.setMatrixAt(i, partM);

        const tone = toneFor(def.tone, look, police);
        if (slot.tones[i] !== tone) {
          slot.tones[i] = tone;
          slot.mesh.setColorAt(i, colour.setStyle(tone));
        }
      }
    },
    /** Reveal the first n bodies and collapse the rest. */
    show(n) {
      for (const slot of slots) {
        slot.mesh.count = Math.min(n, capacity);
        slot.mesh.instanceMatrix.needsUpdate = true;
        if (slot.mesh.instanceColor) slot.mesh.instanceColor.needsUpdate = true;
      }
    },
  };
}

// ---------------------------------------------------------------- the cast

/**
 * Everything that moves: the fleet (a mesh per car record, built on demand and reused), the two
 * body pools, the bullet streaks, the impact flashes, and the player's own body.
 */
export function buildCast(scene) {
  const cast = {
    scene,
    fleet: new Map(),
    crowd: bodyPool(scene, 190),
    officers: bodyPool(scene, 24),
    streaks: [],
    flashes: [],
    muzzles: [],
    hero: null,
  };

  // A bullet streak: a long thin box, fatter than a real round so it still reads at 30 m.
  const streak = new THREE.BoxGeometry(0.07, 0.07, 1);
  for (let i = 0; i < 48; i += 1) {
    const s = new THREE.Mesh(
      streak,
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
        map: glowTexture('#fff0b8'),
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
        map: glowTexture('#ffe0a8'),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    f.visible = false;
    scene.add(f);
    cast.flashes.push(f);
  }
  return cast;
}

/** The player's own body: an ordinary group, because it is the only one with a muzzle flash. */
export function buildHero(cast) {
  const group = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: new THREE.Color(PALETTE.skins[0]) });
  const shirt = new THREE.MeshLambertMaterial({ color: new THREE.Color('#f4efe3') });
  const trousers = new THREE.MeshLambertMaterial({ color: new THREE.Color('#26324a') });
  const shoes = new THREE.MeshLambertMaterial({ color: new THREE.Color('#15151b') });
  const dark = new THREE.MeshLambertMaterial({ color: new THREE.Color('#1a1a20') });
  const hairMat = new THREE.MeshLambertMaterial({ color: new THREE.Color('#241a14') });

  const torso = new THREE.Mesh(parts.torso, shirt);
  torso.position.y = 1.12;
  const hips = new THREE.Mesh(parts.hips, trousers);
  hips.position.y = 0.78;
  const head = new THREE.Mesh(parts.head, skin);
  head.position.y = 1.54;
  const hair = new THREE.Mesh(parts.hair, hairMat);
  hair.position.set(0, 1.56, -0.01);

  const joint = (shape, material, x, y, z) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.add(new THREE.Mesh(shape, material));
    return g;
  };
  const armL = joint(parts.arm, skin, -0.31, 1.34, 0);
  const armR = joint(parts.arm, skin, 0.31, 1.34, 0);
  const legL = joint(parts.leg, trousers, -0.12, 0.78, 0);
  const legR = joint(parts.leg, trousers, 0.12, 0.78, 0);
  const shoeL = new THREE.Mesh(parts.shoe, shoes);
  shoeL.position.set(0, 0.33, 0.04);
  legL.add(shoeL);
  const shoeR = new THREE.Mesh(parts.shoe, shoes);
  shoeR.position.set(0, 0.33, 0.04);
  legR.add(shoeR);

  const gun = new THREE.Mesh(parts.pistol, dark);
  gun.position.set(0, -0.24, 0.2);
  gun.rotation.x = -1.35;
  armR.add(gun);

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      map: glowTexture('#ffe6a0'),
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

/** A car mesh for a record, built on first sight and then reused. */
function fleetEntry(cast, record, cruiser) {
  let entry = cast.fleet.get(record);
  if (!entry) {
    entry = carMesh(cruiser ? 'cruiser' : record.kind, record.paint);
    if (cruiser) entry.police = dressAsCruiser(entry);
    cast.scene.add(entry.group);
    cast.fleet.set(record, entry);
  }
  return entry;
}

/** Put a car group at its record's position and heading. */
function placeCar(entry, x, z, yaw) {
  entry.group.position.set(x, 0, z);
  // The model faces local +z; a heading measured from +x is a quarter turn from that.
  entry.group.rotation.y = Math.PI / 2 - yaw;
}

/** Pose every car the sim knows about: the traffic, the stolen one, and each cruiser. */
export function poseFleet(cast, sim) {
  const alive = new Set();
  for (const car of sim.traffic) {
    alive.add(car);
    const entry = fleetEntry(cast, car, false);
    entry.group.visible = true;
    placeCar(entry, car.x, car.z, car.yaw);
    // Tail lamps brighten under braking.
    entry.lights.material.color.setScalar(car.lights > 0.35 ? 2.4 : 1);
  }
  for (const u of sim.police.units) {
    alive.add(u.car);
    const entry = fleetEntry(cast, u.car, true);
    entry.group.visible = true;
    placeCar(entry, u.x, u.z, u.yaw);
    const beat = Math.sin(sim.time * 17) > 0;
    entry.police.red.visible = beat;
    entry.police.blue.visible = !beat;
    entry.police.glow.material.color.setStyle(beat ? '#ff3355' : '#4477ff');
  }
  for (const [record, entry] of cast.fleet) {
    if (!alive.has(record)) entry.group.visible = false;
  }
}

/** Pose the crowd in one pass. */
export function poseCrowd(cast, sim) {
  const people = sim.crowd;
  const n = Math.min(people.length, cast.crowd.capacity);
  for (let i = 0; i < n; i += 1) cast.crowd.set(i, people[i], false);
  cast.crowd.show(n);
}

/** Pose the officers — standing, aiming or down — and the flashes at their barrels. */
export function poseOfficers(cast, sim, camera) {
  let n = 0;
  let m = 0;
  for (const u of sim.police.units) {
    for (const o of u.officers) {
      if (o.inCar && o.alive) continue;
      if (!o.alive && o.down <= 0) continue;
      if (n >= cast.officers.capacity) break;
      cast.officers.set(
        n,
        { x: o.x, z: o.z, yaw: o.yaw, phase: sim.time * 5 + n, moving: o.moving, run: 0, down: o.down > 0 ? 0.4 : 0, flash: o.flash },
        true,
      );
      n += 1;
      if (o.alive && o.flash > 0.05 && m < cast.muzzles.length) {
        const f = cast.muzzles[m];
        m += 1;
        f.visible = true;
        f.position.set(o.x + Math.cos(o.yaw) * 0.62, 1.34, o.z + Math.sin(o.yaw) * 0.62);
        f.scale.setScalar(0.9 + o.flash * 1.1);
        f.material.opacity = Math.min(1, o.flash * 1.3);
        if (camera) f.quaternion.copy(camera.quaternion);
      }
    }
  }
  for (let i = m; i < cast.muzzles.length; i += 1) cast.muzzles[i].visible = false;
  cast.officers.show(n);
}

/** Pose the hero: the stride, the lean into the aim, the gun arm, the muzzle flash. */
export function poseHero(cast, sim) {
  const h = cast.hero;
  if (!h) return;
  const p = sim.player;
  if (p.driving) {
    h.group.visible = false;
    return;
  }
  h.group.visible = true;
  const swing = Math.sin(p.phase) * (p.running ? 0.95 : 0.5) * (p.moving ? 1 : 0.12);
  h.group.position.set(p.x, 0, p.z);
  h.group.rotation.set(0, -p.yaw + Math.PI / 2, 0);
  h.legL.rotation.x = swing;
  h.legR.rotation.x = -swing;
  const lean = Math.max(-0.9, Math.min(0.9, p.aimYaw - p.yaw));
  h.armR.rotation.set(-1.46, 0, -0.16 + lean * 0.3);
  h.armL.rotation.set(-1.3, 0, 0.26 + lean * 0.2);
  if (p.muzzle > 0) {
    h.flash.visible = true;
    h.flash.position.set(Math.cos(p.aimYaw) * 0.62, 1.3, Math.sin(p.aimYaw) * 0.62);
    h.flash.scale.setScalar(0.22 + p.muzzle * 0.34);
    h.flash.rotation.y = -p.aimYaw + Math.PI / 2;
  } else {
    h.flash.visible = false;
  }
}

/** The player's rounds and the police's, as streaks, and every impact as a flash. */
export function poseShots(cast, sim, camera) {
  let n = 0;
  for (const r of sim.rounds) {
    const t = cast.streaks[n];
    if (!t) break;
    n += 1;
    t.visible = true;
    t.position.set(r.x, r.y, r.z);
    t.rotation.set(0, -Math.atan2(r.vz, r.vx) + Math.PI / 2, 0);
    t.scale.set(1, 1, 3.2);
    t.material.color.setStyle('#fff6cc');
  }
  for (const s of sim.police.rounds) {
    const t = cast.streaks[n];
    if (!t) break;
    n += 1;
    t.visible = true;
    t.position.set(s.x, s.y ?? 1.35, s.z);
    t.rotation.set(0, -Math.atan2(s.vz, s.vx) + Math.PI / 2, 0);
    t.scale.set(1, 1, 3.0);
    t.material.color.setStyle('#d8f2ff');
  }
  for (let i = n; i < cast.streaks.length; i += 1) cast.streaks[i].visible = false;

  let m = 0;
  for (const f of sim.impacts) {
    const s = cast.flashes[m];
    if (!s) break;
    m += 1;
    s.visible = true;
    s.position.set(f.x, f.y, f.z);
    s.scale.setScalar(f.size * (1.4 + (1 - f.life / f.max) * 2.4));
    s.material.color.setStyle(f.colour);
    s.material.opacity = Math.max(0, f.life / f.max);
    if (camera) s.quaternion.copy(camera.quaternion);
  }
  for (let i = m; i < cast.flashes.length; i += 1) cast.flashes[i].visible = false;
}

export { parts as BODY_PARTS, BODY };