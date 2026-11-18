// A geometry accumulator: many flat faces, one buffer, one draw call.
//
// The block-by-block kit below is what the city is built out of — hundreds of boxes for buildings,
// kerbs, roofs and trim. Each as its own mesh would be thousands of draw calls a frame, which no
// browser survives at 60 fps. So every surface that shares a material is pushed into one of these,
// and `toMesh` hands back a single BufferGeometry with its world transform already baked in.
//
// UVs are in metres, not 0..1, so one texture tiles at a constant size across a nine-metre
// shopfront and a ninety-metre tower. Every face carries an explicit normal and winding that
// match, so back-face culling can stay on and the inside of a building is never drawn.

import * as THREE from '../vendor/three/three.module.min.js';

const FULL_TURN = Math.PI * 2;

function length3(a, b) {
  return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
}

function faceNormal(a, b, c) {
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const uz = b[2] - a[2];
  const vx = c[0] - a[0];
  const vy = c[1] - a[1];
  const vz = c[2] - a[2];
  let nx = uy * vz - uz * vy;
  let ny = uz * vx - ux * vz;
  let nz = ux * vy - uy * vx;
  const d = Math.hypot(nx, ny, nz) || 1;
  return [nx / d, ny / d, nz / d];
}

export class SurfaceBatch {
  constructor(material, { shadows = true } = {}) {
    this.material = material;
    this.shadows = shadows;
    this.xyz = [];
    this.normals = [];
    this.uv = [];
    this.tint = [];
    this.order = [];
  }

  get vertexCount() {
    return this.xyz.length / 3;
  }

  /** A four-cornered face, counter-clockwise seen from the front, with optional per-vertex colour. */
  face(a, b, c, d, uv = null, normal = null, colour = null) {
    const base = this.vertexCount;
    const n = normal ?? faceNormal(a, b, c);
    for (const p of [a, b, c, d]) {
      this.xyz.push(p[0], p[1], p[2]);
      this.normals.push(n[0], n[1], n[2]);
      if (colour) this.tint.push(colour[0], colour[1], colour[2]);
    }
    if (uv) {
      for (const t of uv) this.uv.push(t[0], t[1]);
    } else {
      const u = length3(a, b);
      const v = length3(a, d);
      this.uv.push(0, 0, u, 0, u, v, 0, v);
    }
    this.order.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  /**
   * An upright box sitting on `y`: `w` across x, `h` tall, `d` across z, centred on (x, z). One UV
   * repeat is `tile` metres, and the roof gets its own so a texture never smears across a lid.
   */
  box(x, y, z, w, h, d, opts = {}) {
    const tileU = opts.tile?.[0] ?? 8;
    const tileV = opts.tile?.[1] ?? 4;
    const colour = opts.colour ?? null;
    const x0 = x - w / 2;
    const x1 = x + w / 2;
    const z0 = z - d / 2;
    const z1 = z + d / 2;
    const y0 = y;
    const y1 = y + h;
    const panes = (run, rise) => {
      const nu = Math.max(1, Math.round(run / tileU));
      const nv = Math.max(1, Math.round(rise / tileV));
      return [[0, 0], [nu, 0], [nu, nv], [0, nv]];
    };
    const faces = opts.faces ?? 'abcdef';
    if (faces.includes('f')) this.face([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], panes(w, h), [0, 0, 1], colour);
    if (faces.includes('b')) this.face([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], panes(w, h), [0, 0, -1], colour);
    if (faces.includes('r')) this.face([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], panes(d, h), [1, 0, 0], colour);
    if (faces.includes('l')) this.face([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], panes(d, h), [-1, 0, 0], colour);
    if (opts.noLid !== true) this.face([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], panes(w, d), [0, 1, 0], opts.lidColour ?? colour);
    if (opts.floor === true) this.face([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], panes(w, d), [0, -1, 0], colour);
  }

  /** A flat rectangle at height y, facing up (or down with `up: false`). */
  pad(x0, z0, x1, z1, y, opts = {}) {
    const tile = opts.tile ?? 20;
    const colour = opts.colour ?? null;
    const u0 = x0 / tile;
    const u1 = x1 / tile;
    const v0 = z0 / tile;
    const v1 = z1 / tile;
    if (opts.up === false) {
      this.face([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], [[u0, v0], [u1, v0], [u1, v1], [u0, v1]], [0, -1, 0], colour);
    } else {
      this.face([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [[u0, v1], [u1, v1], [u1, v0], [u0, v0]], [0, 1, 0], colour);
    }
  }

  /** A flat rectangle of any heading: centre, heading, width by depth, at height y. */
  flat(cx, cz, w, d, y, heading = 0, colour = null) {
    const c = Math.cos(heading);
    const s = Math.sin(heading);
    const at = (dx, dz) => [cx + dx * c - dz * s, y, cz + dx * s + dz * c];
    this.face(at(-w / 2, d / 2), at(w / 2, d / 2), at(w / 2, -d / 2), at(-w / 2, -d / 2), [[0, 1], [1, 1], [1, 0], [0, 0]], [0, 1, 0], colour);
  }

  /** A box turned about its own vertical axis. */
  turned(cx, y, cz, w, h, d, heading, colour = null, tile = [4, 4]) {
    const c = Math.cos(heading);
    const s = Math.sin(heading);
    const at = (dx, dy, dz) => [cx + dx * c - dz * s, y + dy, cz + dx * s + dz * c];
    const hw = w / 2;
    const hd = d / 2;
    const nu = Math.max(1, w / tile[0]);
    const nv = Math.max(1, h / tile[1]);
    const nd = Math.max(1, d / tile[0]);
    const sideUV = [[0, 0], [nu, 0], [nu, nv], [0, nv]];
    const endUV = [[0, 0], [nd, 0], [nd, nv], [0, nv]];
    const nAt = (nx, nz) => [nx * c - nz * s, 0, nx * s + nz * c];
    this.face(at(-hw, 0, hd), at(hw, 0, hd), at(hw, h, hd), at(-hw, h, hd), sideUV, nAt(0, 1), colour);
    this.face(at(hw, 0, -hd), at(-hw, 0, -hd), at(-hw, h, -hd), at(hw, h, -hd), sideUV, nAt(0, -1), colour);
    this.face(at(hw, 0, hd), at(hw, 0, -hd), at(hw, h, -hd), at(hw, h, hd), endUV, nAt(1, 0), colour);
    this.face(at(-hw, 0, -hd), at(-hw, 0, hd), at(-hw, h, hd), at(-hw, h, -hd), endUV, nAt(-1, 0), colour);
    this.face(at(-hw, h, hd), at(hw, h, hd), at(hw, h, -hd), at(-hw, h, -hd), [[0, 0], [1, 0], [1, 1], [0, 1]], [0, 1, 0], colour);
  }

  /** A tapered round pole: palm trunks, lamp posts, hydrants, fountain rims, chimneys. */
  pole(cx, base, cz, r0, r1, h, sides = 6, colour = null) {
    for (let i = 0; i < sides; i += 1) {
      const a0 = (i / sides) * FULL_TURN;
      const a1 = ((i + 1) / sides) * FULL_TURN;
      const p0 = [cx + Math.cos(a0) * r0, base, cz + Math.sin(a0) * r0];
      const p1 = [cx + Math.cos(a1) * r0, base, cz + Math.sin(a1) * r0];
      const p2 = [cx + Math.cos(a1) * r1, base + h, cz + Math.sin(a1) * r1];
      const p3 = [cx + Math.cos(a0) * r1, base + h, cz + Math.sin(a0) * r1];
      const a = (a0 + a1) / 2;
      const u0 = (i / sides) * 2;
      const u1 = ((i + 1) / sides) * 2;
      this.face(p0, p1, p2, p3, [[u0, 0], [u1, 0], [u1, 1], [u0, 1]], [Math.cos(a), 0, Math.sin(a)], colour);
    }
  }

  geometry({ castShadow = this.shadows, receiveShadow = true } = {}) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.xyz, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    if (this.tint.length) g.setAttribute('color', new THREE.Float32BufferAttribute(this.tint, 3));
    g.setIndex(this.order);
    g.computeBoundingSphere();
    if (castShadow) g.computeBoundingBox();
    // A shadow can only come from an object that keeps one; the flag travels with the geometry so
    // the caller that merges several batches into one mesh can still cast from the union.
    g.userData.castShadow = castShadow;
    g.userData.receiveShadow = receiveShadow;
    return g;
  }

  mesh(name = 'batch') {
    const g = this.geometry();
    const m = new THREE.Mesh(g, this.material);
    m.name = name;
    m.castShadow = this.shadows;
    m.receiveShadow = true;
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    return m;
  }
}