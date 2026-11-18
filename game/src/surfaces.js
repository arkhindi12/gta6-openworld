// Every surface in the game is painted here, in Canvas 2D, and cached by name.
//
// Nothing is downloaded and no image ships with the game: the tarmac is grit, the windows are a
// grid of warm and cold panes, the palm crown is eleven quadratic curves, and the sky is a
// seven-stop gradient. Each painter takes a fixed seed, so the same speck of aggregate lands in
// the same place on every load and a screenshot never drifts between two runs.

import * as THREE from '../vendor/three/three.module.min.js';
import { seeded } from './seed.js';
import { PALETTE } from './config.js';

const painted = new Map();

function blank(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function wrap(canvas, { srgb = true, clamp = false, repeat = null } = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = tex.wrapT = clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  if (repeat) tex.repeat.set(repeat[0], repeat[1]);
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

function memo(key, painter) {
  const hit = painted.get(key);
  if (hit) return hit;
  const made = painter();
  painted.set(key, made);
  return made;
}

// ---------------------------------------------------------------- ground

/** Dark aggregate with polish bands where the wheels run, over a 20 m square. */
export function tarmac() {
  return memo('tarmac', () => {
    const c = blank(512, 512);
    const g = c.getContext('2d');
    const r = seeded(41);
    g.fillStyle = PALETTE.tarmac;
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 7200; i += 1) {
      const v = 88 + r() * 72;
      g.fillStyle = `rgba(${Math.round(v + 16)},${Math.round(v + 10)},${Math.round(v + 22)},${(0.05 + r() * 0.2).toFixed(3)})`;
      g.fillRect(r() * 512, r() * 512, 1 + r() * 2.4, 1 + r() * 2.4);
    }
    g.fillStyle = 'rgba(232,203,182,0.045)';
    g.fillRect(116, 0, 62, 512);
    g.fillRect(334, 0, 62, 512);
    for (let i = 0; i < 6; i += 1) {
      g.fillStyle = 'rgba(18,16,24,0.17)';
      g.beginPath();
      g.ellipse(r() * 512, r() * 512, 20 + r() * 58, 12 + r() * 38, r() * 3, 0, Math.PI * 2);
      g.fill();
    }
    return wrap(c);
  });
}

/** Warm concrete pavers, eight metres to a repeat. */
export function paving() {
  return memo('paving', () => {
    const c = blank(512, 512);
    const g = c.getContext('2d');
    const r = seeded(77);
    g.fillStyle = PALETTE.pave;
    g.fillRect(0, 0, 512, 512);
    const tile = 64;
    for (let y = 0; y < 512; y += tile) {
      for (let x = 0; x < 512; x += tile) {
        const v = 0.9 + r() * 0.16;
        g.fillStyle = `rgb(${Math.round(203 * v)},${Math.round(178 * v)},${Math.round(155 * v)})`;
        g.fillRect(x + 1, y + 1, tile - 2, tile - 2);
      }
    }
    g.strokeStyle = 'rgba(88,68,58,0.34)';
    g.lineWidth = 2;
    for (let i = 0; i <= 512; i += tile) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i, 512);
      g.moveTo(0, i);
      g.lineTo(512, i);
      g.stroke();
    }
    for (let i = 0; i < 520; i += 1) {
      g.fillStyle = `rgba(80,60,50,${(0.03 + r() * 0.08).toFixed(3)})`;
      g.fillRect(r() * 512, r() * 512, 2 + r() * 10, 2 + r() * 10);
    }
    return wrap(c);
  });
}

/** Pale beach sand with shell grit and wind ripples. */
export function sand() {
  return memo('sand', () => {
    const c = blank(256, 256);
    const g = c.getContext('2d');
    const r = seeded(9);
    g.fillStyle = PALETTE.sand;
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 4400; i += 1) {
      g.fillStyle = r() < 0.5 ? `rgba(255,246,224,${(0.1 + r() * 0.2).toFixed(2)})` : `rgba(180,140,100,${(0.06 + r() * 0.14).toFixed(2)})`;
      g.fillRect(r() * 256, r() * 256, 1, 1);
    }
    g.strokeStyle = 'rgba(200,165,120,0.15)';
    for (let i = 0; i < 18; i += 1) {
      const y = r() * 256;
      g.beginPath();
      g.moveTo(0, y);
      for (let x = 0; x < 256; x += 16) g.lineTo(x, y + Math.sin(x * 0.05 + i) * 3);
      g.stroke();
    }
    return wrap(c);
  });
}

/** Mown lawn, with the stripes a park keeper leaves. */
export function lawn() {
  return memo('lawn', () => {
    const c = blank(256, 256);
    const g = c.getContext('2d');
    const r = seeded(31);
    g.fillStyle = PALETTE.grass;
    g.fillRect(0, 0, 256, 256);
    for (let x = 0; x < 256; x += 32) {
      g.fillStyle = (x / 32) % 2 ? 'rgba(255,255,214,0.05)' : 'rgba(0,40,20,0.08)';
      g.fillRect(x, 0, 32, 256);
    }
    for (let i = 0; i < 2800; i += 1) {
      g.fillStyle = `rgba(${Math.round(60 + r() * 60)},${Math.round(120 + r() * 60)},${Math.round(60 + r() * 40)},${(0.14 + r() * 0.3).toFixed(2)})`;
      g.fillRect(r() * 256, r() * 256, 1, 1 + r() * 2);
    }
    for (let i = 0; i < 16; i += 1) {
      g.fillStyle = r() < 0.6 ? '#ffe9a8' : '#ff9cc4';
      g.beginPath();
      g.arc(r() * 256, r() * 256, 1.4, 0, Math.PI * 2);
      g.fill();
    }
    return wrap(c);
  });
}

// ---------------------------------------------------------------- facades

/**
 * One 256 px tile of curtain wall: four windows by two floors. A lit pane is a warm or cool
 * vertical gradient, a dark pane is night glass with the sky in it; both get a frame and a glint,
 * which is what stops a wall of windows reading as a checkerboard.
 */
export function curtainWall(wall, seed, lit) {
  return memo(`wall:${wall}:${seed}:${lit}`, () => {
    const r = seeded(seed + 13);
    const S = 256;
    const c = blank(S, S);
    const g = c.getContext('2d');
    g.fillStyle = wall;
    g.fillRect(0, 0, S, S);
    g.fillStyle = 'rgba(0,0,0,0.16)';
    g.fillRect(0, 0, 10, S);
    g.fillRect(S - 10, 0, 10, S);
    g.fillStyle = 'rgba(255,255,255,0.07)';
    g.fillRect(0, 0, S, 6);
    const cols = 4;
    const rows = 2;
    const cw = S / cols;
    const ch = S / rows;
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        const px = x * cw + 16;
        const py = y * ch + 22;
        const pw = cw - 32;
        const ph = ch - 44;
        const on = r() < lit;
        if (on) {
          const warm = r() > 0.36;
          const grad = g.createLinearGradient(px, py, px, py + ph);
          grad.addColorStop(0, warm ? '#fff0c4' : '#e6ffff');
          grad.addColorStop(1, warm ? '#ffc470' : '#9fe2e6');
          g.fillStyle = grad;
        } else {
          const v = 22 + r() * 14;
          g.fillStyle = `rgb(${Math.round(v)},${Math.round(v + 8)},${Math.round(v + 22)})`;
        }
        g.fillRect(px, py, pw, ph);
        g.strokeStyle = 'rgba(10,8,16,0.55)';
        g.lineWidth = 2;
        g.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);
        g.fillStyle = on ? 'rgba(255,255,255,0.22)' : 'rgba(180,210,255,0.14)';
        g.beginPath();
        g.moveTo(px, py);
        g.lineTo(px + pw * 0.42, py);
        g.lineTo(px, py + ph * 0.5);
        g.closePath();
        g.fill();
      }
    }
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.fillRect(0, ch - 8, S, 3);
    g.fillStyle = 'rgba(0,0,0,0.22)';
    g.fillRect(0, ch + 4, S, 4);
    return wrap(c);
  });
}

/** A shopfront band: a lit interior, silhouetted customers and a shelf of colour. */
export function shopGlass(seed) {
  return memo(`shop:${seed}`, () => {
    const r = seeded(seed + 5);
    const c = blank(256, 128);
    const g = c.getContext('2d');
    g.fillStyle = '#1a1020';
    g.fillRect(0, 0, 256, 128);
    g.fillStyle = r() < 0.7 ? '#ffcf8a' : '#b8f0ee';
    g.fillRect(6, 8, 244, 104);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    for (let i = 0; i < 5; i += 1) g.fillRect(20 + i * 46, 40 + r() * 30, 14, 60);
    g.globalAlpha = 0.55;
    for (let i = 0; i < 30; i += 1) {
      g.fillStyle = PALETTE.neon[Math.floor(r() * PALETTE.neon.length)];
      g.fillRect(10 + r() * 230, 20 + r() * 20, 6, 6);
    }
    g.globalAlpha = 1;
    g.strokeStyle = '#1a1020';
    g.lineWidth = 4;
    for (let i = 1; i < 4; i += 1) {
      g.beginPath();
      g.moveTo(i * 64, 0);
      g.lineTo(i * 64, 128);
      g.stroke();
    }
    return wrap(c);
  });
}

/** A neon board: a dark panel, a glowing border and two or three abstract tube strokes. */
export function neonSign(colour, seed) {
  return memo(`neon:${colour}:${seed}`, () => {
    const r = seeded(seed + 3);
    const c = blank(128, 64);
    const g = c.getContext('2d');
    g.fillStyle = '#120a1c';
    g.fillRect(0, 0, 128, 64);
    g.strokeStyle = colour;
    g.shadowColor = colour;
    g.shadowBlur = 8;
    g.lineWidth = 3;
    g.strokeRect(4, 4, 120, 56);
    g.lineWidth = 2;
    const strokes = 2 + Math.floor(r() * 2);
    for (let i = 0; i < strokes; i += 1) {
      const y = 16 + i * 16;
      g.beginPath();
      g.moveTo(16 + r() * 10, y);
      g.lineTo(64 + r() * 20, y - 6 + r() * 12);
      g.lineTo(112 - r() * 8, y);
      g.stroke();
    }
    g.shadowBlur = 0;
    return wrap(c, { srgb: false });
  });
}

// ---------------------------------------------------------------- props and effects

/** A palm crown seen from above: eleven drooping fronds cut out of transparency. */
export function palmCrown() {
  return memo('palm', () => {
    const c = blank(256, 256);
    const g = c.getContext('2d');
    const r = seeded(404);
    for (let i = 0; i < 11; i += 1) {
      const a = (i / 11) * Math.PI * 2 + r() * 0.2;
      const len = 100 + r() * 18;
      const droop = 0.5 + r() * 0.35;
      g.save();
      g.translate(128, 128);
      g.rotate(a);
      const grad = g.createLinearGradient(0, 0, len, 0);
      grad.addColorStop(0, '#1f5a37');
      grad.addColorStop(1, '#57a35e');
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(0, -5);
      g.quadraticCurveTo(len * 0.55, -22 * droop, len, 4);
      g.quadraticCurveTo(len * 0.55, 16 * droop, 0, 5);
      g.closePath();
      g.fill();
      g.strokeStyle = 'rgba(20,60,35,0.8)';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(len, 4);
      g.stroke();
      g.restore();
    }
    g.fillStyle = '#2f6b40';
    g.beginPath();
    g.arc(128, 128, 12, 0, Math.PI * 2);
    g.fill();
    return wrap(c);
  });
}

/** A soft round blob, so a material colour can tint it. */
export function halo(colour = '#ffffff') {
  return memo(`halo:${colour}`, () => {
    const c = blank(128, 128);
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 2, 64, 64, 64);
    grad.addColorStop(0, colour);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    return wrap(c, { srgb: false });
  });
}

/** The sky: a gulf evening, purple overhead through coral to gold at the water. */
export function skyGradient() {
  return memo('sky', () => {
    const c = blank(8, 512);
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0.0, '#1d4d7c');
    grad.addColorStop(0.24, '#4a6ea7');
    grad.addColorStop(0.44, '#9a6c9d');
    grad.addColorStop(0.6, '#dc6e7f');
    grad.addColorStop(0.74, '#ff8c5d');
    grad.addColorStop(0.87, '#ffb372');
    grad.addColorStop(1.0, '#ffe0a8');
    g.fillStyle = grad;
    g.fillRect(0, 0, 8, 512);
    return wrap(c, { clamp: true });
  });
}

/** The sun as a billboard: a disc inside a wide warm halo. */
export function sunDisc() {
  return memo('sun', () => {
    const c = blank(256, 256);
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(128, 128, 8, 128, 128, 128);
    grad.addColorStop(0, 'rgba(255,247,214,1)');
    grad.addColorStop(0.16, 'rgba(255,224,160,1)');
    grad.addColorStop(0.24, 'rgba(255,170,110,0.55)');
    grad.addColorStop(0.55, 'rgba(255,120,110,0.16)');
    grad.addColorStop(1, 'rgba(255,100,120,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    return wrap(c, { srgb: false });
  });
}

/** Long thin crests for the bay, tiled across the water. */
export function ripples() {
  return memo('ripple', () => {
    const c = blank(256, 256);
    const g = c.getContext('2d');
    const r = seeded(88);
    for (let i = 0; i < 150; i += 1) {
      const y = r() * 256;
      const x = r() * 256;
      const w = 10 + r() * 60;
      g.strokeStyle = `rgba(255,236,210,${(0.05 + r() * 0.16).toFixed(3)})`;
      g.lineWidth = 1 + r() * 2;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + w * 0.5, y - 2, x + w, y);
      g.stroke();
    }
    return wrap(c, { srgb: false });
  });
}