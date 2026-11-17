// The city as a three.js scene, built once at load from the layout records.
//
// Everything static is merged into one mesh per material (geometry.js), so a town of five thousand
// boxes and a hundred neon boards costs about thirty draw calls. This module also owns the
// renderer, the camera, the low sun and its shadow box, and the two things that move every frame:
// the shadow box slides with the player, snapped to a grid so the shadow edges do not crawl, and
// the sea's ripple map drifts.
//
// The moving cast is not here. cast.js makes and poses cars and people; this file only hands it a
// scene to add them to.

import * as THREE from '../vendor/three/three.module.min.js';
import { SUN, SKY, PALETTE } from './settings.js';
import { COAST, BOUNDS, HALF_ROAD, LAST_LINE, avenues } from './layout.js';
import { Batch } from './geometry.js';
import { rngFrom } from './random.js';
import {
  asphaltTexture,
  pavingTexture,
  sandTexture,
  lawnTexture,
  facadeTexture,
  shopfrontTexture,
  neonTexture,
  palmTexture,
  glowTexture,
  skyTexture,
  sunTexture,
  rippleTexture,
} from './textures.js';

export function createCity(canvas, layout) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: true,
    stencil: false,
  });
  renderer.setPixelRatio(1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(new THREE.Color(SKY.fog), 0.00095);

  const camera = new THREE.PerspectiveCamera(58, 16 / 9, 0.4, 4200);

  // One low sun in the west, a hemisphere fill the colour of sky over sand, and a cool rim off the
  // water so the shadowed faces are lit rather than black.
  const sunDir = new THREE.Vector3(Math.cos(SUN.azimuth), SUN.height, Math.sin(SUN.azimuth)).normalize();
  const sun = new THREE.DirectionalLight(new THREE.Color(SUN.colour), SUN.power);
  sun.position.copy(sunDir).multiplyScalar(420);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const frustum = sun.shadow.camera;
  frustum.left = -170;
  frustum.right = 170;
  frustum.top = 170;
  frustum.bottom = -170;
  frustum.near = 40;
  frustum.far = 1000;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.5;
  scene.add(sun, sun.target);

  scene.add(new THREE.HemisphereLight(new THREE.Color('#b6dcf0'), new THREE.Color('#d79a76'), 2.25));
  const seaFill = new THREE.DirectionalLight(new THREE.Color('#7fd8e8'), 0.5);
  seaFill.position.set(240, 160, -300);
  scene.add(seaFill);

  const town = new THREE.Group();
  town.name = 'vice-meridian';
  scene.add(town);

  const sky = buildSky(scene, sunDir);
  layGround(town, layout);
  paintRoads(town);
  raiseBuildings(town, layout);
  plantParks(town, layout);
  const sea = fillSea(town);
  furnish(town, layout);

  return {
    renderer,
    scene,
    camera,
    sun,
    sunDir,
    town,
    sky,
    sea,
    /** Re-aim the sun's shadow box at a point, snapped so the shadow edges do not crawl. */
    focusShadow(x, z) {
      const k = 4;
      const sx = Math.round(x / k) * k;
      const sz = Math.round(z / k) * k;
      sun.target.position.set(sx, 0, sz);
      sun.position.set(sx + sunDir.x * 420, sunDir.y * 420, sz + sunDir.z * 420);
      sun.target.updateMatrixWorld();
    },
    /** Resize the drawing buffer and the camera to a 16:9 frame. */
    resize(w, h) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    },
    /** A little motion in the water, so a still frame is the only still thing in it. */
    animate(t) {
      if (sea?.material?.map) {
        sea.material.map.offset.x = t * 0.006;
        sea.material.map.offset.y = t * 0.0035;
      }
    },
  };
}

// ---------------------------------------------------------------- sky

function buildSky(scene, sunDir) {
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(2500, 32, 18),
    new THREE.MeshBasicMaterial({
      map: skyTexture(),
      side: THREE.BackSide,
      fog: false,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  dome.name = 'sky';
  dome.renderOrder = -10;
  scene.add(dome);

  const disc = new THREE.Mesh(
    new THREE.PlaneGeometry(760, 760),
    new THREE.MeshBasicMaterial({
      map: sunTexture(),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
      toneMapped: false,
    }),
  );
  disc.position.copy(sunDir).multiplyScalar(2000);
  disc.lookAt(0, disc.position.y, 0);
  disc.name = 'sun';
  scene.add(disc);

  // A bank of cloud low over the gulf: wide faint planes stacked back into the haze.
  const cloudMat = new THREE.MeshBasicMaterial({
    map: glowTexture('#ffc8b0'),
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
    toneMapped: false,
  });
  for (let i = 0; i < 6; i += 1) {
    const cloud = new THREE.Mesh(new THREE.PlaneGeometry(1000 + i * 240, 70 + i * 14), cloudMat);
    cloud.position.set(-1000 - i * 80, 90 + i * 46, 600 - i * 300);
    cloud.name = `cloud-${i}`;
    scene.add(cloud);
  }
  return { dome, disc };
}

// ---------------------------------------------------------------- ground

function layGround(town, layout) {
  // One asphalt plate under the whole town; the avenues and the junctions are its surface.
  const bed = new Batch(new THREE.MeshLambertMaterial({ map: asphaltTexture() }), { castShadow: false });
  bed.slab(BOUNDS.roadMin - 2, BOUNDS.roadMin - 2, BOUNDS.roadMax + 2, BOUNDS.roadMax + 2, 0, { tile: 22 });
  town.add(bed.toMesh('roadbed'));

  // Each block is a plate 0.3 m up on a kerb, with a 0.6 m stone around it.
  const pave = new Batch(new THREE.MeshLambertMaterial({ map: pavingTexture() }), { castShadow: false });
  const lawn = new Batch(new THREE.MeshLambertMaterial({ map: lawnTexture() }), { castShadow: false });
  const kerbs = new Batch(new THREE.MeshLambertMaterial({ color: new THREE.Color(PALETTE.kerb) }), { castShadow: false });
  for (const b of layout.blocks) {
    if (b.kind === 'park') lawn.slab(b.x, b.z, b.x + b.w, b.z + b.h, 0.32, { tile: 9 });
    else pave.slab(b.x, b.z, b.x + b.w, b.z + b.h, 0.3, { tile: 7 });
    const t = 0.6;
    kerbs.box(b.x + b.w / 2, 0, b.z - t / 2, b.w + t * 2, 0.3, t, { tile: [4, 1] });
    kerbs.box(b.x + b.w / 2, 0, b.z + b.h + t / 2, b.w + t * 2, 0.3, t, { tile: [4, 1] });
    kerbs.box(b.x - t / 2, 0, b.z + b.h / 2, t, 0.3, b.h, { tile: [4, 1] });
    kerbs.box(b.x + b.w + t / 2, 0, b.z + b.h / 2, t, 0.3, b.h, { tile: [4, 1] });
  }
  town.add(pave.toMesh('pavement'), lawn.toMesh('lawns'), kerbs.toMesh('kerbs'));

  // The promenade: a wide pale walk between the west avenue and the sand, plus the marina quay.
  const prom = new Batch(new THREE.MeshLambertMaterial({ map: pavingTexture() }), { castShadow: false });
  prom.slab(COAST.promenade, BOUNDS.roadMin, COAST.kerb + 1, BOUNDS.roadMax, 0.26, { tile: 8 });
  prom.slab(BOUNDS.roadMin, COAST.quay - 1, BOUNDS.roadMax, COAST.bay, 0.26, { tile: 8 });
  town.add(prom.toMesh('promenade'));

  const beach = new Batch(new THREE.MeshLambertMaterial({ map: sandTexture() }), { castShadow: false });
  beach.slab(COAST.sand, BOUNDS.roadMin - 140, COAST.promenade, BOUNDS.roadMax + 140, 0.08, { tile: 26 });
  town.add(beach.toMesh('sand'));
}

// ---------------------------------------------------------------- paint on the road

/**
 * Lane dashes, gold centre lines and zebra crossings. All of it is flat quads a couple of
 * centimetres over the asphalt, transparent and depth-write-free, so nothing z-fights the road.
 */
function paintRoads(town) {
  const flat = (colour, opacity) =>
    new Batch(
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(colour),
        toneMapped: false,
        transparent: true,
        opacity,
      }),
      { castShadow: false, receiveShadow: false },
    );
  const white = flat(PALETTE.paint, 0.92);
  const gold = flat('#ffcf5a', 0.9);
  const zebra = flat('#fbf4e2', 0.8);
  const dash = 3.4;
  const gap = 8.8;
  const lane = 5.4;
  const lines = avenues();

  for (const line of lines) {
    for (let t = BOUNDS.roadMin + 6; t < BOUNDS.roadMax - 6; t += gap) {
      if (nearJunction(t)) continue;
      white.deck(t + dash / 2, line - lane, dash, 0.24, 0.025);
      white.deck(t + dash / 2, line + lane, dash, 0.24, 0.025);
      white.deck(line - lane, t + dash / 2, 0.24, dash, 0.025);
      white.deck(line + lane, t + dash / 2, 0.24, dash, 0.025);
    }
    for (let t = BOUNDS.roadMin + 4; t < BOUNDS.roadMax - 4; t += 1.4) {
      if (nearJunction(t)) continue;
      gold.deck(t, line - 0.55, 1.4, 0.17, 0.026);
      gold.deck(t, line + 0.55, 1.4, 0.17, 0.026);
      gold.deck(line - 0.55, t, 0.17, 1.4, 0.026);
      gold.deck(line + 0.55, t, 0.17, 1.4, 0.026);
    }
    // Crossings on all four arms of every junction this avenue meets.
    for (const other of lines) {
      if (other === line) continue;
      for (let k = 0; k < 10; k += 1) {
        const off = -HALF_ROAD + 5.5 + k * 8.4;
        zebra.deck(other + off, line - HALF_ROAD - 4.8, 4.2, 5.2, 0.028);
        zebra.deck(other + off, line + HALF_ROAD + 4.8, 4.2, 5.2, 0.028);
        zebra.deck(line - HALF_ROAD - 4.8, other + off, 5.2, 4.2, 0.028);
        zebra.deck(line + HALF_ROAD + 4.8, other + off, 5.2, 4.2, 0.028);
      }
    }
  }
  for (const m of [white.toMesh('lane-dashes'), gold.toMesh('lane-centres'), zebra.toMesh('crossings')]) {
    m.receiveShadow = false;
    town.add(m);
  }
}

function nearJunction(t) {
  for (const line of avenues()) if (Math.abs(t - line) < HALF_ROAD + 7) return true;
  return false;
}

// ---------------------------------------------------------------- buildings

/**
 * The blocks. Each building is a body (a facade texture keyed on its wall colour, window seed and
 * lit fraction), a cornice, sometimes a slimmer shaft on a podium, a roof with plant, and at street
 * level a lit shopfront band and possibly a neon board with a pool of colour under it.
 */
function raiseBuildings(town, layout) {
  const rand = rngFrom(17);
  const storey = 3.7;
  const facades = new Map();
  const boards = new Map();
  const roofs = new Batch(new THREE.MeshLambertMaterial({ color: new THREE.Color('#4b4254') }));
  const trim = new Batch(new THREE.MeshLambertMaterial({ color: new THREE.Color('#efe2cc') }));
  const shop = new Batch(new THREE.MeshBasicMaterial({ map: shopfrontTexture(3), toneMapped: false }), {
    castShadow: false,
    receiveShadow: false,
  });
  const pools = new Batch(
    new THREE.MeshBasicMaterial({
      map: glowTexture('#ff7ac0'),
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
    { castShadow: false, receiveShadow: false },
  );

  for (const b of layout.buildings) {
    const key = `${b.wall}|${b.seed % 6}|${b.lit.toFixed(2)}`;
    let group = facades.get(key);
    if (!group) {
      group = new Batch(
        new THREE.MeshLambertMaterial({
          map: facadeTexture(b.wall, b.seed, b.lit),
          color: new THREE.Color(b.tint, b.tint, b.tint),
        }),
      );
      facades.set(key, group);
    }
    const bodyH = b.podium > 0 ? b.podium : b.height;
    group.box(b.x + b.w / 2, 0.3, b.z + b.d / 2, b.w, bodyH, b.d, { tile: [14, storey * 2] });
    trim.box(b.x + b.w / 2, bodyH + 0.3, b.z + b.d / 2, b.w + 0.6, 0.36, b.d + 0.6, { tile: [10, 1] });
    if (b.shaft) {
      group.box(b.x + b.w / 2, bodyH + 0.66, b.z + b.d / 2, b.shaft.w, b.height - bodyH, b.shaft.d, { tile: [14, storey * 2] });
      trim.box(b.x + b.w / 2, b.height + 0.66, b.z + b.d / 2, b.shaft.w + 0.5, 0.34, b.shaft.d + 0.5, { tile: [10, 1] });
    }
    const topW = b.shaft ? b.shaft.w : b.w;
    const topD = b.shaft ? b.shaft.d : b.d;
    roofs.box(b.x + b.w / 2, b.height + 0.9, b.z + b.d / 2, topW * 0.98, 0.5, topD * 0.98, { tile: [11, 2] });
    if (b.crown === 'box') roofs.box(b.x + b.w * 0.32, b.height + 1.4, b.z + b.d * 0.32, 4.6, 2.8, 3.8, { tile: [4, 2] });
    if (b.crown === 'ac') roofs.box(b.x + b.w * 0.68, b.height + 1.4, b.z + b.d * 0.7, 3.2, 1.3, 2.6, { tile: [3, 2] });
    if (b.crown === 'antenna') roofs.box(b.x + b.w / 2, b.height + 1.4, b.z + b.d / 2, 0.55, 8, 0.55, { tile: [2, 2] });

    // Street level: a lit band across the two faces that meet pavement, on the low buildings.
    if (b.floors <= 4) {
      const fh = 3.0;
      const y = 0.45;
      const south = b.z + b.d + 0.08;
      const north = b.z - 0.08;
      const bandW = Math.min(b.w - 3, 26);
      if (bandW >= 6) {
        const cx = b.x + b.w / 2;
        shop.quad([cx - bandW / 2, y, south], [cx + bandW / 2, y, south], [cx + bandW / 2, y + fh, south], [cx - bandW / 2, y + fh, south], [[0, 0], [bandW / 8, 0], [bandW / 8, 1], [0, 1]], [0, 0, 1]);
        shop.quad([cx + bandW / 2, y, north], [cx - bandW / 2, y, north], [cx - bandW / 2, y + fh, north], [cx + bandW / 2, y + fh, north], [[bandW / 8, 0], [0, 0], [0, 1], [bandW / 8, 1]], [0, 0, -1]);
      }
    }

    if (b.neon) {
      const face = b.neonFace % 4;
      const len = Math.min(b.w, b.d) * 0.66;
      const h = Math.max(3, Math.min(10, b.height * 0.3));
      const y = Math.min(b.height - h - 0.6, 4.2 + rand() * 5);
      const boardKey = `${b.neon}:${b.seed % 5}`;
      let board = boards.get(boardKey);
      if (!board) {
        board = new Batch(
          new THREE.MeshBasicMaterial({
            map: neonTexture(b.neon, b.seed % 5),
            transparent: true,
            toneMapped: false,
          }),
          { castShadow: false, receiveShadow: false },
        );
        boards.set(boardKey, board);
      }
      const cx = b.x + b.w / 2;
      const cz = b.z + b.d / 2;
      const uv = [[0, 0], [1, 0], [1, 1], [0, 1]];
      if (face === 0) board.quad([cx - len / 2, y, b.z + b.d + 0.35], [cx + len / 2, y, b.z + b.d + 0.35], [cx + len / 2, y + h, b.z + b.d + 0.35], [cx - len / 2, y + h, b.z + b.d + 0.35], uv);
      if (face === 1) board.quad([cx + len / 2, y, b.z - 0.35], [cx - len / 2, y, b.z - 0.35], [cx - len / 2, y + h, b.z - 0.35], [cx + len / 2, y + h, b.z - 0.35], uv);
      if (face === 2) board.quad([b.x + b.w + 0.35, y, cz + len / 2], [b.x + b.w + 0.35, y, cz - len / 2], [b.x + b.w + 0.35, y + h, cz - len / 2], [b.x + b.w + 0.35, y + h, cz + len / 2], uv);
      if (face === 3) board.quad([b.x - 0.35, y, cz - len / 2], [b.x - 0.35, y, cz + len / 2], [b.x - 0.35, y + h, cz + len / 2], [b.x - 0.35, y + h, cz - len / 2], uv);
      // The pool of colour the sign throws on the pavement beneath it.
      const gx = face === 2 ? b.x + b.w + 4 : face === 3 ? b.x - 4 : cx;
      const gz = face === 0 ? b.z + b.d + 4 : face === 1 ? b.z - 4 : cz;
      pools.deck(gx, gz, len * 1.8, 10, 0.33, face < 2 ? 0 : Math.PI / 2);
    }
  }

  for (const [key, group] of facades) town.add(group.toMesh(`facade-${slug(key)}`));
  for (const [key, group] of boards) town.add(group.toMesh(`neon-${slug(key)}`));
  town.add(roofs.toMesh('roofs'), trim.toMesh('cornices'), shop.toMesh('shopfronts'), pools.toMesh('neon-glow'));
}

function slug(s) {
  return s.replace(/[^a-z0-9]/gi, '').slice(0, 18);
}

// ---------------------------------------------------------------- parks and palms

/**
 * The parks: a crossing of stone paths, a round fountain and palms in a ring. The promenade rank
 * and the pavement planters are added here too, because a street without palms does not read as
 * the gulf coast. Crowns are one instanced mesh of cross-planes.
 */
function plantParks(town, layout) {
  const rand = rngFrom(23);
  const stone = new Batch(new THREE.MeshLambertMaterial({ color: new THREE.Color('#dcc8ae') }));
  const water = new Batch(new THREE.MeshLambertMaterial({ color: new THREE.Color('#5fb8c4') }), { castShadow: false });
  const trunks = new Batch(new THREE.MeshLambertMaterial({ color: new THREE.Color('#7d5a3c') }));
  const crowns = [];

  const palm = (x, z, h, scale = 1) => {
    trunks.pole(x, 0.3, z, 0.42 * scale, 0.25 * scale, h * 0.95, 5);
    crowns.push({ x, z, y: h * 0.95 + 0.3, scale: scale * (0.9 + rand() * 0.3), rot: rand() * 6.28 });
  };

  for (const park of layout.parks) {
    const cx = park.x + park.w / 2;
    const cz = park.z + park.h / 2;
    stone.box(cx, 0.34, cz, park.w, 0.025, 5.5, { tile: [6, 1] });
    stone.box(cx, 0.34, cz, 5.5, 0.025, park.h, { tile: [6, 1] });
    water.pole(cx, 0.36, cz, 5.6, 5.6, 0.5, 14);
    stone.pole(cx, 0.36, cz, 6.6, 6.0, 0.85, 14);
    for (let i = 0; i < park.palms; i += 1) {
      const a = (i / park.palms) * Math.PI * 2 + rand() * 0.5;
      const rad = (i % 2 === 0 ? 0.38 : 0.24) * park.w;
      const px = cx + Math.cos(a) * rad;
      const pz = cz + Math.sin(a) * rad;
      if (Math.abs(px - cx) < 9 && Math.abs(pz - cz) < 9) continue;
      palm(px, pz, 12 + rand() * 8);
    }
  }

  // The promenade ranks, and the row along the marina quay.
  for (let t = BOUNDS.roadMin + 12; t < BOUNDS.roadMax; t += 24) {
    palm(COAST.promenade + 12, t, 12 + rand() * 7);
    if (Math.round(t / 24) % 2 === 0) palm(COAST.sand + 24, t + 12, 11 + rand() * 6);
  }
  for (let t = BOUNDS.roadMin + 16; t < LAST_LINE; t += 30) palm(t, COAST.quay - 10, 12 + rand() * 6);

  // Pavement planters: the signature of the street, and what breaks up a wall of glass at eye
  // height.
  for (const b of layout.blocks) {
    if (b.kind === 'park') continue;
    for (let t = b.z + 6; t < b.z + b.h - 4; t += 26) {
      palm(b.x + 4.2, t, 11 + rand() * 6);
      palm(b.x + b.w - 4.2, t + 13, 11 + rand() * 6);
    }
    for (let t = b.x + 10; t < b.x + b.w - 6; t += 30) {
      if (rand() < 0.55) palm(t, b.z + 4.2, 10 + rand() * 5);
    }
  }

  town.add(stone.toMesh('park-paths'), water.toMesh('fountains'), trunks.toMesh('palm-trunks'));

  const geo = new THREE.PlaneGeometry(1, 1);
  const mat = new THREE.MeshLambertMaterial({
    map: palmTexture(),
    transparent: true,
    alphaTest: 0.32,
    side: THREE.DoubleSide,
  });
  const inst = new THREE.InstancedMesh(geo, mat, crowns.length * 2);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const v = new THREE.Vector3();
  const e = new THREE.Euler();
  crowns.forEach((c, i) => {
    for (let k = 0; k < 2; k += 1) {
      const size = 10 * c.scale;
      e.set(-Math.PI / 2 + 0.12, c.rot + k * Math.PI * 0.5, 0);
      q.setFromEuler(e);
      v.set(c.x, c.y, c.z);
      s.set(size, size, size);
      m.compose(v, q, s);
      inst.setMatrixAt(i * 2 + k, m);
    }
  });
  inst.instanceMatrix.needsUpdate = true;
  inst.name = 'palm-crowns';
  inst.frustumCulled = false;
  town.add(inst);
}

// ---------------------------------------------------------------- water

function fillSea(town) {
  const ripple = rippleTexture();
  ripple.repeat.set(46, 46);
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(6000, 6000),
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE.sea),
      roughness: 0.14,
      metalness: 0.55,
      map: ripple,
    }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(-1400, -0.5, 1400);
  sea.name = 'sea';
  town.add(sea);

  // The sun's track across the bay, and the surf line at the sand.
  const streak = new THREE.Mesh(
    new THREE.PlaneGeometry(90, 2800),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color('#ffcf9a'),
      transparent: true,
      opacity: 0.14,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  streak.rotation.x = -Math.PI / 2;
  streak.position.set(-1100, -0.3, 1300);
  town.add(streak);

  const surf = new THREE.Mesh(
    new THREE.PlaneGeometry(5, BOUNDS.roadMax - BOUNDS.roadMin + 400),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#e2f8f2'), transparent: true, opacity: 0.5 }),
  );
  surf.rotation.x = -Math.PI / 2;
  surf.position.set(COAST.shore - 2, -0.2, (BOUNDS.roadMin + BOUNDS.roadMax) / 2);
  town.add(surf);

  return sea;
}

// ---------------------------------------------------------------- street furniture

/**
 * Lamp posts and their heads, hydrants, park benches, the moored hulls along the marina quay and
 * the pier out into the bay. All static, all in six draw calls.
 */
function furnish(town, layout) {
  const rand = rngFrom(51);
  const poles = new Batch(new THREE.MeshLambertMaterial({ color: new THREE.Color('#3b3946') }));
  const lamps = new Batch(new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffe3b0'), toneMapped: false }), {
    castShadow: false,
    receiveShadow: false,
  });
  const hydrants = new Batch(new THREE.MeshLambertMaterial({ color: new THREE.Color('#e8483f') }));
  const benches = new Batch(new THREE.MeshLambertMaterial({ color: new THREE.Color('#8a6a4a') }));

  for (const b of layout.blocks) {
    poles.pole(b.x + 5, 0.3, b.z + 5, 0.15, 0.1, 7.6, 5);
    lamps.box(b.x + 5, 7.6, b.z + 5, 0.5, 0.4, 0.5, { tile: [1, 1] });
    poles.pole(b.x + b.w - 5, 0.3, b.z + b.h - 5, 0.15, 0.1, 7.6, 5);
    lamps.box(b.x + b.w - 5, 7.6, b.z + b.h - 5, 0.5, 0.4, 0.5, { tile: [1, 1] });
    if (rand() < 0.55) hydrants.pole(b.x + b.w * 0.5, 0.3, b.z + 3.4, 0.32, 0.26, 0.9, 6);
    if (b.kind === 'park') {
      for (let i = 0; i < 3; i += 1) benches.box(b.x + b.w * 0.5, 0.42, b.z + 12 + i * 20, 1.9, 0.45, 0.5, { tile: [2, 1] });
    }
  }

  const hulls = new Batch(new THREE.MeshLambertMaterial({ color: new THREE.Color('#f2efe6') }));
  const decks = new Batch(new THREE.MeshLambertMaterial({ color: new THREE.Color('#c8a27a') }), { castShadow: false });
  for (let i = 0; i < 9; i += 1) {
    const x = 360 + i * 180;
    const z = BOUNDS.roadMax + 26 + (i % 2) * 14;
    hulls.turnedBox(x, -0.4, z, 6, 2.4, 17, 0.02 * i, null, [4, 2]);
    hulls.turnedBox(x, 2.0, z - 2.4, 3.6, 1.7, 5.4, 0.02 * i, null, [3, 2]);
  }
  decks.turnedBox(2100, 0.4, BOUNDS.roadMax + 120, 6.5, 0.4, 190, 0, null, [4, 4]);
  decks.turnedBox(2100, 0.4, BOUNDS.roadMax + 214, 44, 0.4, 7, 0, null, [4, 4]);
  for (let i = 0; i < 10; i += 1) {
    poles.pole(2100 + (i % 2 ? 3.2 : -3.2), -1.2, BOUNDS.roadMax + 40 + i * 18, 0.22, 0.2, 3.4, 5);
  }
  // The lighthouse off the point, at the end of the pier.
  poles.pole(-300, -0.6, BOUNDS.roadMax + 300, 3.4, 1.9, 19, 10);
  lamps.box(-300, 18.4, BOUNDS.roadMax + 300, 2.8, 1.8, 2.8, { tile: [1, 1] });

  town.add(
    poles.toMesh('lamp-posts'),
    lamps.toMesh('lamp-heads'),
    hydrants.toMesh('hydrants'),
    benches.toMesh('benches'),
    hulls.toMesh('boat-hulls'),
    decks.toMesh('pier'),
  );
}