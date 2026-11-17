// What a car looks like, and how a cruiser is dressed.
//
// A car is built once per (kind, paint) pair and cached: the body is one merged geometry with the
// paint, glass, trim and tyres baked into vertex colours, so a car costs two draw calls (body and
// lamps) rather than a dozen. The lamps are separate because a brake light changes colour at
// runtime and a merged buffer cannot.
//
// The model faces local +z. A car's heading `yaw` is measured from +x, so its group is turned by
// PI/2 - yaw, which is why every car in the city drives nose-first.
//
// Under each car sits a soft contact shadow - a dark radial blob just above the road - because
// without one a low-poly car reads as a sticker pasted on the asphalt.

import * as THREE from '../vendor/three/three.module.min.js';
import { MeshBuilder } from './mesh.js';
import { glowTexture } from './paint.js';
import { PALETTE } from './tuning.js';

/**
 * The shapes. `sill` is the height of the lower body, `deck` the bonnet/boot, `cabin` the
 * greenhouse, `roof` the total height, `cabinLen` the cabin's share of the length. `top` is the
 * cruise speed band the traffic gives a car of this kind.
 */
export const CAR_KINDS = {
  sedan: { len: 4.6, wid: 1.94, sill: 0.5, deck: 0.34, cabin: 0.62, cabinLen: 0.52, roof: 0.86, top: [14, 21] },
  coupe: { len: 4.4, wid: 1.9, sill: 0.44, deck: 0.3, cabin: 0.5, cabinLen: 0.46, roof: 0.78, top: [16, 24] },
  drop: { len: 4.6, wid: 1.92, sill: 0.42, deck: 0.26, cabin: 0.18, cabinLen: 0.38, roof: 0.64, top: [17, 25] },
  suv: { len: 5.2, wid: 2.1, sill: 0.64, deck: 0.58, cabin: 0.62, cabinLen: 0.6, roof: 1.14, top: [13, 19] },
  cab: { len: 4.8, wid: 1.96, sill: 0.5, deck: 0.32, cabin: 0.62, cabinLen: 0.54, roof: 0.9, top: [13, 20] },
  van: { len: 5.6, wid: 2.14, sill: 0.68, deck: 1.16, cabin: 0.5, cabinLen: 0.44, roof: 1.2, top: [11, 16] },
  cruiser: { len: 4.9, wid: 2.02, sill: 0.52, deck: 0.34, cabin: 0.66, cabinLen: 0.5, roof: 0.92, top: [20, 30] },
};


const bodyCache = new Map();
const shadowMaterial = new THREE.MeshBasicMaterial({
  map: glowTexture('#000000'),
  transparent: true,
  opacity: 0.34,
  depthWrite: false,
});

function rgb(hex) {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}

/** A wheel: a low-poly cylinder lying on the x axis, plus a hub disc. */
function wheel(builder, cx, cy, cz, radius, width, tyre, rim) {
  const sides = 8;
  for (let i = 0; i < sides; i += 1) {
    const a0 = (i / sides) * Math.PI * 2;
    const a1 = ((i + 1) / sides) * Math.PI * 2;
    const y0 = cy + Math.cos(a0) * radius;
    const z0 = cz + Math.sin(a0) * radius;
    const y1 = cy + Math.cos(a1) * radius;
    const z1 = cz + Math.sin(a1) * radius;
    const n = [0, Math.cos((a0 + a1) / 2), Math.sin((a0 + a1) / 2)];
    builder.quad([cx - width / 2, y0, z0], [cx + width / 2, y0, z0], [cx + width / 2, y1, z1], [cx - width / 2, y1, z1], [[0, 0], [1, 0], [1, 1], [0, 1]], n, tyre);
  }
  // The two faces of the cylinder, slightly proud, in rim silver.
  const r2 = radius * 0.52;
  for (const sx of [-1, 1]) {
    const x = cx + (sx * width) / 2 + sx * 0.01;
    builder.quad([x, cy - r2, cz + r2], [x, cy - r2, cz - r2], [x, cy + r2, cz - r2], [x, cy + r2, cz + r2], [[0, 0], [1, 0], [1, 1], [0, 1]], [sx, 0, 0], rim);
  }
}

/**
 * The merged geometry for one car. Returns { body, lights, shape } where body and lights are
 * geometries with vertex colours, ready for a MeshStandardMaterial / MeshBasicMaterial.
 */
function buildCarGeometry(kind, paintHex) {
  const key = `${kind}|${paintHex}`;
  const hit = bodyCache.get(key);
  if (hit) return hit;

  const k = CAR_KINDS[kind] ?? CAR_KINDS.sedan;
  const body = new MeshBuilder(
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.3 }),
    { castShadow: true, receiveShadow: false },
  );
  const lamps = new MeshBuilder(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }), {
    castShadow: false,
    receiveShadow: false,
  });

  const paint = rgb(paintHex);
  const glass = rgb('#152436');
  const trim = rgb('#191920');
  const tyre = rgb('#0f0f14');
  const rim = rgb('#c9d2dc');
  const head = rgb('#fff4d4');
  const tail = rgb('#8a1220');

  const y0 = 0.34;
  const bodyTop = y0 + k.sill;
  // The main volume, then the bonnet/boot deck, then the greenhouse.
  body.box(0, y0, 0, k.wid, k.sill, k.len, { tile: [3, 2], colour: paint });
  body.box(0, bodyTop, k.len * 0.3, k.wid * 0.94, k.deck, k.len * 0.34, { tile: [3, 2], colour: paint });
  body.box(0, bodyTop + k.deck - 0.02, -k.len * 0.04, k.wid * 0.82, k.cabin, k.len * k.cabinLen, { tile: [3, 2], colour: glass });
  const roofBase = bodyTop + k.deck + k.cabin;
  if (k.roof > k.cabin + k.deck + k.sill) {
    body.box(0, roofBase, -k.len * 0.04, k.wid * 0.84, k.roof - (roofBase - y0), k.len * k.cabinLen * 0.92, { tile: [3, 2], colour: paint });
  }
  // The shadow line under the doors, and a bumper at each end.
  body.box(0, y0 + 0.02, 0, k.wid * 0.92, 0.16, k.len * 0.94, { tile: [3, 1], colour: trim });
  body.box(0, y0 + 0.06, k.len / 2 - 0.06, k.wid * 0.98, 0.2, 0.14, { tile: [3, 1], colour: trim });
  body.box(0, y0 + 0.06, -k.len / 2 + 0.06, k.wid * 0.98, 0.2, 0.14, { tile: [3, 1], colour: trim });

  const wheelR = kind === 'suv' || kind === 'van' ? 0.4 : 0.33;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      wheel(body, (sx * k.wid) / 2 - sx * 0.04, wheelR, (sz * k.len) / 2.5, wheelR, 0.24, tyre, rim);
    }
  }

  for (const sx of [-1, 1]) {
    lamps.box(sx * k.wid * 0.31, y0 + k.sill * 0.72, k.len / 2 + 0.02, 0.36, 0.14, 0.05, { tile: [1, 1], colour: head });
    lamps.box(sx * k.wid * 0.31, y0 + k.sill * 0.8, -k.len / 2 - 0.02, 0.34, 0.13, 0.05, { tile: [1, 1], colour: tail });
  }
  // A taxi wears its sign; a van gets a plain roof box.
  if (kind === 'cab') lamps.box(0, y0 + k.roof + 0.16, -k.len * 0.04, 0.66, 0.18, 0.28, { tile: [1, 1], colour: rgb('#ffd23c') });

  const out = { body: body.toGeometry(), lights: lamps.toGeometry(), shape: k };
  bodyCache.set(key, out);
  return out;
}

/**
 * A car mesh: body, lamps, and a contact shadow. The lamp material is cloned per car so a brake
 * light can brighten without lighting the whole fleet.
 */
export function makeCarMesh(kind, paintHex) {
  const geo = buildCarGeometry(kind, paintHex);
  const group = new THREE.Group();
  const body = new THREE.Mesh(geo.body, carBodyMaterial());
  body.castShadow = true;
  const lights = new THREE.Mesh(geo.lights, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(geo.shape.wid * 2.1, geo.shape.len * 1.25), shadowMaterial);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.03;
  shadow.renderOrder = 1;
  group.add(body, lights, shadow);
  return { group, body, lights, shadow, shape: geo.shape };
}

let sharedBodyMaterial = null;
function carBodyMaterial() {
  if (!sharedBodyMaterial) {
    sharedBodyMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.3 });
  }
  return sharedBodyMaterial;
}

/**
 * Dress a cruiser: navy flank panels, a door badge, a roof light bar with a red and a blue lamp,
 * a halo around each and a pool of red/blue light on the road. Returns the parts the frame loop
 * flashes.
 */
export function dressCruiser(mesh) {
  const k = mesh.shape;
  const top = 0.34 + k.sill + k.deck + k.cabin;
  const livery = new MeshBuilder(new THREE.MeshLambertMaterial({ color: new THREE.Color('#1b2b57') }));
  for (const sx of [-1, 1]) {
    livery.box(sx * (k.wid / 2 + 0.02), 0.72, -0.1, 0.04, 0.34, k.len * 0.66, { tile: [2, 1] });
    livery.box(sx * (k.wid / 2 + 0.05), 0.86, 0.5, 0.03, 0.5, 1.5, { tile: [1, 1] });
  }
  const liveryMesh = livery.toMesh('livery');

  const bar = new THREE.Mesh(
    new THREE.BoxGeometry(1.3, 0.11, 0.34),
    new THREE.MeshLambertMaterial({ color: new THREE.Color('#141419') }),
  );
  bar.position.set(0, top + 0.06, -0.1);

  const lamp = (colour, x) => {
    const g = new THREE.Group();
    const core = new THREE.Mesh(
      new THREE.BoxGeometry(0.46, 0.19, 0.3),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(colour), toneMapped: false }),
    );
    const halo = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 2.0),
      new THREE.MeshBasicMaterial({
        map: glowTexture(colour),
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    halo.position.y = 0.06;
    halo.renderOrder = 3;
    g.add(core, halo);
    g.position.set(x, top + 0.2, -0.1);
    return g;
  };
  const red = lamp('#ff2a48', -0.34);
  const blue = lamp('#3d7bff', 0.34);
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(13, 9),
    new THREE.MeshBasicMaterial({
      map: glowTexture('#ff3355'),
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.06;
  glow.renderOrder = 2;

  mesh.group.add(liveryMesh, bar, red, blue, glow);
  return { red, blue, glow };
}

/** The default paint of a taxi, so the traffic module and the staging module agree. */
export const TAXI_PAINT = '#ffcc33';
export const CRUISER_PAINT = '#f2f3f5';
