// The shapes of the cars, and how a cruiser is dressed.
//
// One merged geometry per (kind, paint) pair, built on first sight and cached: the paint, the glass,
// the trim, the tyres and the rims are all vertex colours inside a single buffer, so a car costs
// two draw calls — body and lamps — instead of a dozen. The lamps stay separate because a brake
// light changes brightness at runtime and a merged buffer cannot.
//
// The model faces local +z. A car's heading is measured from +x, so its group is turned by
// PI/2 - heading; that quarter turn is the reason every car in the city drives nose-first.

import * as THREE from '../vendor/three/three.module.min.js';
import { SurfaceBatch } from './surface.js';
import { halo } from './surfaces.js';

/**
 * The shapes. `sill` is the lower body, `deck` the bonnet and boot, `cabin` the greenhouse, `roof`
 * the total height, `cabinLen` the cabin's share of the length. `top` is the cruise band a driver
 * of this kind holds.
 */
export const CAR_SHAPES = {
  sedan: { len: 4.6, wid: 1.94, sill: 0.5, deck: 0.34, cabin: 0.6, cabinLen: 0.52, roof: 0.86, top: [14, 21] },
  coupe: { len: 4.4, wid: 1.9, sill: 0.44, deck: 0.3, cabin: 0.48, cabinLen: 0.46, roof: 0.78, top: [16, 24] },
  drop: { len: 4.6, wid: 1.92, sill: 0.42, deck: 0.26, cabin: 0.16, cabinLen: 0.38, roof: 0.62, top: [17, 25] },
  suv: { len: 5.2, wid: 2.1, sill: 0.64, deck: 0.56, cabin: 0.62, cabinLen: 0.6, roof: 1.14, top: [13, 19] },
  cab: { len: 4.8, wid: 1.96, sill: 0.5, deck: 0.32, cabin: 0.6, cabinLen: 0.54, roof: 0.9, top: [13, 20] },
  van: { len: 5.6, wid: 2.14, sill: 0.68, deck: 1.14, cabin: 0.5, cabinLen: 0.44, roof: 1.2, top: [11, 16] },
  cruiser: { len: 4.9, wid: 2.02, sill: 0.52, deck: 0.34, cabin: 0.64, cabinLen: 0.5, roof: 0.92, top: [20, 30] },
};

export const TAXI_YELLOW = '#ffcc33';
export const CRUISER_WHITE = '#f2f3f5';

const cache = new Map();

const bodyMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.44, metalness: 0.28 });

const shadowMaterial = new THREE.MeshBasicMaterial({
  map: halo('#000000'),
  transparent: true,
  opacity: 0.42,
  depthWrite: false,
});

function rgb(hex) {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}

/** A wheel: a low-poly cylinder on the x axis with a hub disc at each end. */
function wheel(batch, cx, cy, cz, radius, width, tyre, rim) {
  const sides = 8;
  for (let i = 0; i < sides; i += 1) {
    const a0 = (i / sides) * Math.PI * 2;
    const a1 = ((i + 1) / sides) * Math.PI * 2;
    const y0 = cy + Math.cos(a0) * radius;
    const z0 = cz + Math.sin(a0) * radius;
    const y1 = cy + Math.cos(a1) * radius;
    const z1 = cz + Math.sin(a1) * radius;
    const n = [0, Math.cos((a0 + a1) / 2), Math.sin((a0 + a1) / 2)];
    batch.face(
      [cx - width / 2, y0, z0],
      [cx + width / 2, y0, z0],
      [cx + width / 2, y1, z1],
      [cx - width / 2, y1, z1],
      [[0, 0], [1, 0], [1, 1], [0, 1]],
      n,
      tyre,
    );
  }
  const r2 = radius * 0.52;
  for (const sx of [-1, 1]) {
    const x = cx + (sx * width) / 2 + sx * 0.01;
    batch.face([x, cy - r2, cz + r2], [x, cy - r2, cz - r2], [x, cy + r2, cz - r2], [x, cy + r2, cz + r2], [[0, 0], [1, 0], [1, 1], [0, 1]], [sx, 0, 0], rim);
  }
}

/** The merged geometry for one car kind in one paint: { body, lamps, shape }. */
function carGeometry(kind, paintHex) {
  const key = `${kind}|${paintHex}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const k = CAR_SHAPES[kind] ?? CAR_SHAPES.sedan;
  const body = new SurfaceBatch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.44, metalness: 0.28 }), { shadows: true });
  const lamps = new SurfaceBatch(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }), { shadows: false });

  const paint = rgb(paintHex);
  const glass = rgb('#152436');
  const trim = rgb('#191920');
  const tyre = rgb('#0f0f14');
  const rim = rgb('#c9d2dc');
  const head = rgb('#fff4d4');
  const tail = rgb('#8a1220');

  const floor = 0.34;
  const deckTop = floor + k.sill;
  // The main volume, the bonnet and boot deck, then the greenhouse and the roof.
  body.box(0, floor, 0, k.wid, k.sill, k.len, { tile: [3, 2], colour: paint });
  body.box(0, deckTop, k.len * 0.3, k.wid * 0.94, k.deck, k.len * 0.34, { tile: [3, 2], colour: paint });
  if (kind === 'drop') {
    // A drop-top: no greenhouse at all. A raked screen across the front of the cockpit, the two
    // seat backs standing above the sill, and a tonneau behind them where the roof would fold.
    body.box(0, deckTop + k.deck, k.len * 0.1, k.wid * 0.84, 0.34, 0.1, { tile: [3, 1], colour: glass });
    for (const sx of [-1, 1]) {
      body.box(sx * k.wid * 0.22, deckTop + 0.1, -k.len * 0.02, k.wid * 0.34, 0.34, 0.16, { tile: [2, 2], colour: trim });
      body.box(sx * k.wid * 0.22, deckTop + 0.05, -k.len * 0.14, k.wid * 0.34, 0.16, 0.34, { tile: [2, 2], colour: paint });
    }
    body.box(0, deckTop + 0.06, -k.len * 0.26, k.wid * 0.9, 0.14, k.len * 0.2, { tile: [3, 1], colour: paint });
  } else {
    body.box(0, deckTop + k.deck - 0.02, -k.len * 0.04, k.wid * 0.82, k.cabin, k.len * k.cabinLen, { tile: [3, 2], colour: glass });
  }
  const roofBase = deckTop + k.deck + k.cabin;
  if (kind !== 'drop' && k.roof > k.cabin + k.deck + k.sill) {
    body.box(0, roofBase, -k.len * 0.04, k.wid * 0.84, k.roof - (roofBase - floor), k.len * k.cabinLen * 0.92, { tile: [3, 2], colour: paint });
  }
  // The shadow line under the doors, and a bumper at each end.
  body.box(0, floor + 0.02, 0, k.wid * 0.92, 0.16, k.len * 0.94, { tile: [3, 1], colour: trim });
  body.box(0, floor + 0.06, k.len / 2 - 0.06, k.wid * 0.98, 0.2, 0.14, { tile: [3, 1], colour: trim });
  body.box(0, floor + 0.06, -k.len / 2 + 0.06, k.wid * 0.98, 0.2, 0.14, { tile: [3, 1], colour: trim });

  const radius = kind === 'suv' || kind === 'van' ? 0.4 : 0.33;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      wheel(body, (sx * k.wid) / 2 - sx * 0.04, radius, (sz * k.len) / 2.5, radius, 0.24, tyre, rim);
    }
  }

  for (const sx of [-1, 1]) {
    lamps.box(sx * k.wid * 0.31, floor + k.sill * 0.72, k.len / 2 + 0.02, 0.36, 0.14, 0.05, { tile: [1, 1], colour: head });
    lamps.box(sx * k.wid * 0.31, floor + k.sill * 0.8, -k.len / 2 - 0.02, 0.34, 0.13, 0.05, { tile: [1, 1], colour: tail });
  }
  // A taxi wears its sign.
  if (kind === 'cab') lamps.box(0, floor + k.roof + 0.14, -k.len * 0.04, 0.66, 0.18, 0.28, { tile: [1, 1], colour: rgb('#ffd23c') });

  const built = { body: body.geometry(), lamps: lamps.geometry(), shape: k };
  cache.set(key, built);
  return built;
}

/** A car mesh: body, lamps and a contact shadow. The lamps are per-car so brakes can brighten. */
export function buildCar(kind, paintHex) {
  const geo = carGeometry(kind, paintHex);
  const group = new THREE.Group();
  const body = new THREE.Mesh(geo.body, bodyMaterial);
  body.castShadow = true;
  body.receiveShadow = false;
  const lamps = new THREE.Mesh(geo.lamps, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
  lamps.castShadow = false;
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(geo.shape.wid * 1.7, geo.shape.len * 1.05), shadowMaterial);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.03;
  shadow.renderOrder = 1;
  group.add(body, lamps, shadow);
  return { group, body, lamps, shadow, shape: geo.shape };
}

/**
 * Dress a cruiser: navy flank panels, a roof bar with a red and a blue lamp, a halo round each, and
 * a pool of coloured light on the road. Returns the parts the frame loop flashes.
 */
export function dressCruiser(mesh) {
  const k = mesh.shape;
  const top = 0.34 + k.sill + k.deck + k.cabin;
  const livery = new SurfaceBatch(new THREE.MeshLambertMaterial({ color: new THREE.Color('#1b2b57') }), { shadows: false });
  for (const sx of [-1, 1]) {
    livery.box(sx * (k.wid / 2 + 0.02), 0.72, -0.1, 0.04, 0.34, k.len * 0.66, { tile: [2, 1] });
    livery.box(sx * (k.wid / 2 + 0.05), 0.86, 0.5, 0.03, 0.5, 1.5, { tile: [1, 1] });
  }

  const bar = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.11, 0.34), new THREE.MeshLambertMaterial({ color: new THREE.Color('#141419') }));
  bar.position.set(0, top + 0.06, -0.1);

  const beacon = (colour, x) => {
    const g = new THREE.Group();
    const core = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.19, 0.3), new THREE.MeshBasicMaterial({ color: new THREE.Color(colour), toneMapped: false }));
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 2.0),
      new THREE.MeshBasicMaterial({
        map: halo(colour),
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    glow.position.y = 0.06;
    glow.renderOrder = 3;
    g.add(core, glow);
    g.position.set(x, top + 0.2, -0.1);
    return g;
  };
  const red = beacon('#ff2a48', -0.34);
  const blue = beacon('#3d7bff', 0.34);

  const pool = new THREE.Mesh(
    new THREE.PlaneGeometry(13, 9),
    new THREE.MeshBasicMaterial({
      map: halo('#ff3355'),
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
  );
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = 0.06;
  pool.renderOrder = 2;

  mesh.group.add(livery.mesh('livery'), bar, red, blue, pool);
  return { red, blue, pool };
}

/** Put a car group at a position and a heading, remembering the model's quarter turn. */
export function placeCar(group, x, z, yaw) {
  group.position.set(x, 0, z);
  group.rotation.y = Math.PI / 2 - yaw;
}