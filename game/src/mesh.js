// A geometry accumulator: many boxes and quads, one buffer, one draw call.
//
// A city block of 40 boxes per building over 130 buildings is 5,000 boxes; as individual meshes
// that is 5,000 draw calls and the browser will not hold 60 fps. Everything that shares a
// material is therefore pushed into one of these and finished with `toMesh()`, which returns a
// single BufferGeometry positioned in world space. UVs are scaled by metres rather than
// normalised, so a texture tiles at a constant size across a 9 m shopfront and a 90 m tower.
//
// Faces are emitted with an explicit normal rather than derived: an interior face never gets
// drawn, and the winding order matches the normal so backface culling stays on.

import * as THREE from '../vendor/three/three.module.min.js';

const TAU = Math.PI * 2;

export class MeshBuilder {
  constructor(material, opts = {}) {
    this.material = material;
    this.castShadow = opts.castShadow ?? true;
    this.receiveShadow = opts.receiveShadow ?? true;
    this.position = [];
    this.normal = [];
    this.uv = [];
    this.colour = [];
    this.index = [];
  }

  /** How many vertices have been written so far. */
  get vertexCount() {
    return this.position.length / 3;
  }

  /**
   * A quad from four corners in world space, listed counter-clockwise as seen from the front.
   * `uvs` is optional; without it the UVs are derived from the corner distances so the texture
   * keeps its metre scale.
   */
  quad(a, b, c, d, uvs = null, normal = null, colour = null) {
    const base = this.vertexCount;
    const n = normal ?? normalOf(a, b, c);
    for (const corner of [a, b, c, d]) {
      this.position.push(corner[0], corner[1], corner[2]);
      this.normal.push(n[0], n[1], n[2]);
      if (colour) this.colour.push(colour[0], colour[1], colour[2]);
    }
    if (uvs) {
      for (const t of uvs) this.uv.push(t[0], t[1]);
    } else {
      const u = span(a, b);
      const v = span(a, d);
      this.uv.push(0, 0, u, 0, u, v, 0, v);
    }
    this.index.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  /**
   * An axis-aligned box standing on `y`, `w` by `h` by `d` centred on (x, z). `tile` is the size
   * in metres of one texture repeat, used for the four sides; the top gets its own repeat so a
   * roof does not smear. `sides` can restrict which walls are emitted ('ns' or 'ew').
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
    const face = (len, tall) => {
      const nu = Math.max(1, Math.round(len / tileU));
      const nv = Math.max(1, Math.round(tall / tileV));
      return [[0, 0], [nu, 0], [nu, nv], [0, nv]];
    };
    const want = opts.sides ?? 'nsew';
    if (want.includes('s')) this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], face(w, h), [0, 0, 1], colour);
    if (want.includes('n')) this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], face(w, h), [0, 0, -1], colour);
    if (want.includes('e')) this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], face(d, h), [1, 0, 0], colour);
    if (want.includes('w')) this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], face(d, h), [-1, 0, 0], colour);
    if (opts.noTop !== true) {
      const topColour = opts.topColour ?? colour;
      this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], face(w, d), [0, 1, 0], topColour);
    }
  }

  /** A flat rectangle at height y, facing up (or down with up:false). */
  slab(x0, z0, x1, z1, y, opts = {}) {
    const tile = opts.tile ?? 20;
    const colour = opts.colour ?? null;
    const u0 = x0 / tile;
    const u1 = x1 / tile;
    const v0 = z0 / tile;
    const v1 = z1 / tile;
    if (opts.up === false) {
      this.quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], [[u0, v0], [u1, v0], [u1, v1], [u0, v1]], [0, -1, 0], colour);
    } else {
      this.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [[u0, v1], [u1, v1], [u1, v0], [u0, v0]], [0, 1, 0], colour);
    }
  }

  /** A flat deck of any rotation: centre, yaw, w by d, at height y. */
  deck(cx, cz, w, d, y, yaw = 0, colour = null) {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const at = (dx, dz) => [cx + dx * c - dz * s, y, cz + dx * s + dz * c];
    this.quad(at(-w / 2, d / 2), at(w / 2, d / 2), at(w / 2, -d / 2), at(-w / 2, -d / 2), [[0, 1], [1, 1], [1, 0], [0, 0]], [0, 1, 0], colour);
  }

  /** A box turned about its own vertical axis. */
  turnedBox(cx, y, cz, w, h, d, yaw, colour = null, tile = [4, 4]) {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const at = (dx, dy, dz) => [cx + dx * c - dz * s, y + dy, cz + dx * s + dz * c];
    const hw = w / 2;
    const hd = d / 2;
    const uvW = [[0, 0], [Math.max(1, w / tile[0]), 0], [Math.max(1, w / tile[0]), Math.max(1, h / tile[1])], [0, Math.max(1, h / tile[1])]];
    const uvD = [[0, 0], [Math.max(1, d / tile[0]), 0], [Math.max(1, d / tile[0]), Math.max(1, h / tile[1])], [0, Math.max(1, h / tile[1])]];
    const nAt = (nx, nz) => [nx * c - nz * s, 0, nx * s + nz * c];
    this.quad(at(-hw, 0, hd), at(hw, 0, hd), at(hw, h, hd), at(-hw, h, hd), uvW, nAt(0, 1), colour);
    this.quad(at(hw, 0, -hd), at(-hw, 0, -hd), at(-hw, h, -hd), at(hw, h, -hd), uvW, nAt(0, -1), colour);
    this.quad(at(hw, 0, hd), at(hw, 0, -hd), at(hw, h, -hd), at(hw, h, hd), uvD, nAt(1, 0), colour);
    this.quad(at(-hw, 0, -hd), at(-hw, 0, hd), at(-hw, h, hd), at(-hw, h, -hd), uvD, nAt(-1, 0), colour);
    this.quad(at(-hw, h, hd), at(hw, h, hd), at(hw, h, -hd), at(-hw, h, -hd), [[0, 0], [1, 0], [1, 1], [0, 1]], [0, 1, 0], colour);
  }

  /** A tapered round pole: palm trunks, lamp posts, hydrants, fountain rims. */
  pole(cx, base, cz, r0, r1, h, sides = 6, colour = null) {
    for (let i = 0; i < sides; i += 1) {
      const a0 = (i / sides) * TAU;
      const a1 = ((i + 1) / sides) * TAU;
      const p0 = [cx + Math.cos(a0) * r0, base, cz + Math.sin(a0) * r0];
      const p1 = [cx + Math.cos(a1) * r0, base, cz + Math.sin(a1) * r0];
      const p2 = [cx + Math.cos(a1) * r1, base + h, cz + Math.sin(a1) * r1];
      const p3 = [cx + Math.cos(a0) * r1, base + h, cz + Math.sin(a0) * r1];
      const n = [Math.cos((a0 + a1) / 2), 0, Math.sin((a0 + a1) / 2)];
      const u0 = (i / sides) * 2;
      const u1 = ((i + 1) / sides) * 2;
      this.quad(p0, p1, p2, p3, [[u0, 0], [u1, 0], [u1, 1], [u0, 1]], n, colour);
    }
  }

  /** Finish the buffer: one mesh, world transform baked in, no per-frame matrix work. */
  toMesh(name = 'batch') {
    const mesh = new THREE.Mesh(this.toGeometry(), this.material);
    mesh.name = name;
    mesh.castShadow = this.castShadow;
    mesh.receiveShadow = this.receiveShadow;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    return mesh;
  }

  /** Finish the buffer alone, for a caller that brings its own mesh (a per-instance material). */
  toGeometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.position, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.normal, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    if (this.colour.length) g.setAttribute('color', new THREE.Float32BufferAttribute(this.colour, 3));
    g.setIndex(this.index);
    g.computeBoundingSphere();
    return g;
  }
}

function normalOf(a, b, c) {
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const uz = b[2] - a[2];
  const vx = c[0] - a[0];
  const vy = c[1] - a[1];
  const vz = c[2] - a[2];
  let nx = uy * vz - uz * vy;
  let ny = uz * vx - ux * vz;
  let nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz) || 1;
  nx /= len;
  ny /= len;
  nz /= len;
  return [nx, ny, nz];
}

function span(a, b) {
  return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
}
