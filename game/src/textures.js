// Every surface texture in the game, painted with Canvas 2D the first time it is asked for and
// then cached by name. Nothing is downloaded: the asphalt is noise, the windows are a grid, and a
// palm crown is eleven quadratic curves.
//
// Each painter takes a fixed seed so the same speck of aggregate lands in the same place on every
// load, and a texture is never a source of drift between two runs.

import * as THREE from '../vendor/three/three.module.min.js';
import { rngFrom } from './random.js';
import { PALETTE } from './settings.js';

const cache = new Map();

function sheet(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function texture(c, { srgb = true, repeat = null, clamp = false } = {}) {
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = tex.wrapT = clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  if (repeat) tex.repeat.set(repeat[0], repeat[1]);
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

function once(key, paint) {
  let tex = cache.get(key);
  if (!tex) {
    tex = paint();
    cache.set(key, tex);
  }
  return tex;
}

// ---------------------------------------------------------------- ground

/** Dark aggregate with faint wheel-polish bands, over a 20 m square. */
export function asphaltTexture() {
  return once('asphalt', () => {
    const c = sheet(512, 512);
    const g = c.getContext('2d');
    const r = rngFrom(41);
    g.fillStyle = PALETTE.asphalt;
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 7000; i += 1) {
      const v = 90 + r() * 70;
      g.fillStyle = `rgba(${Math.round(v + 16)},${Math.round(v + 10)},${Math.round(v + 22)},${(0.06 + r() * 0.2).toFixed(3)})`;
      g.fillRect(r() * 512, r() * 512, 1 + r() * 2.4, 1 + r() * 2.4);
    }
    g.fillStyle = 'rgba(230,200,180,0.05)';
    g.fillRect(120, 0, 64, 512);
    g.fillRect(330, 0, 64, 512);
    for (let i = 0; i < 6; i += 1) {
      g.fillStyle = 'rgba(18,16,24,0.18)';
      g.beginPath();
      g.ellipse(r() * 512, r() * 512, 20 + r() * 60, 12 + r() * 40, r() * 3, 0, Math.PI * 2);
      g.fill();
    }
    return texture(c);
  });
}

/** Warm concrete pavers, 8 m to a repeat. */
export function pavingTexture() {
  return once('paving', () => {
    const c = sheet(512, 512);
    const g = c.getContext('2d');
    const r = rngFrom(77);
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
    g.strokeStyle = 'rgba(90,70,60,0.35)';
    g.lineWidth = 2;
    for (let i = 0; i <= 512; i += tile) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i, 512);
      g.moveTo(0, i);
      g.lineTo(512, i);
      g.stroke();
    }
    for (let i = 0; i < 500; i += 1) {
      g.fillStyle = `rgba(80,60,50,${(0.03 + r() * 0.08).toFixed(3)})`;
      g.fillRect(r() * 512, r() * 512, 2 + r() * 10, 2 + r() * 10);
    }
    return texture(c);
  });
}

/** Pale beach sand with shell grit and wind ripples. */
export function sandTexture() {
  return once('sand', () => {
    const c = sheet(256, 256);
    const g = c.getContext('2d');
    const r = rngFrom(9);
    g.fillStyle = PALETTE.sand;
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 4200; i += 1) {
      g.fillStyle = r() < 0.5 ? `rgba(255,246,224,${(0.1 + r() * 0.2).toFixed(2)})` : `rgba(180,140,100,${(0.06 + r() * 0.14).toFixed(2)})`;
      g.fillRect(r() * 256, r() * 256, 1, 1);
    }
    g.strokeStyle = 'rgba(200,165,120,0.16)';
    for (let i = 0; i < 18; i += 1) {
      const y = r() * 256;
      g.beginPath();
      g.moveTo(0, y);
      for (let x = 0; x < 256; x += 16) g.lineTo(x, y + Math.sin(x * 0.05 + i) * 3);
      g.stroke();
    }
    return texture(c);
  });
}

/** Mown park lawn with a few flowers. */
export function lawnTexture() {
  return once('lawn', () => {
    const c = sheet(256, 256);
    const g = c.getContext('2d');
    const r = rngFrom(31);
    g.fillStyle = PALETTE.verge;
    g.fillRect(0, 0, 256, 256);
    for (let x = 0; x < 256; x += 32) {
      g.fillStyle = (x / 32) % 2 ? 'rgba(255,255,220,0.05)' : 'rgba(0,40,20,0.08)';
      g.fillRect(x, 0, 32, 256);
    }
    for (let i = 0; i < 2600; i += 1) {
      g.fillStyle = `rgba(${Math.round(60 + r() * 60)},${Math.round(120 + r() * 60)},${Math.round(60 + r() * 40)},${(0.15 + r() * 0.3).toFixed(2)})`;
      g.fillRect(r() * 256, r() * 256, 1, 1 + r() * 2);
    }
    for (let i = 0; i < 16; i += 1) {
      g.fillStyle = r() < 0.6 ? '#ffe9a8' : '#ff9cc4';
      g.beginPath();
      g.arc(r() * 256, r() * 256, 1.4, 0, Math.PI * 2);
      g.fill();
    }
    return texture(c);
  });
}

// ---------------------------------------------------------------- facades

/**
 * One 256 px tile of curtain wall: four windows by two floors. A lit pane is a warm or cool
 * vertical gradient, a dark pane is night glass reflecting the sky; both get a frame and a glint,
 * which is what stops a wall of windows reading as a checkerboard.
 */
export function facadeTexture(wall, seed, lit) {
  return once(`facade:${wall}:${seed}:${lit}`, () => {
    const r = rngFrom(seed + 13);
    const S = 256;
    const c = sheet(S, S);
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
          const warm = r() > 0.38;
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
    return texture(c);
  });
}

/** A shopfront band: a bright interior with silhouetted figures and a shelf of colour. */
export function shopfrontTexture(seed) {
  return once(`shop:${seed}`, () => {
    const r = rngFrom(seed + 5);
    const c = sheet(256, 128);
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
    return texture(c);
  });
}

/** A neon sign board: a dark panel, a glowing border and two or three abstract tube strokes. */
export function neonTexture(colour, seed) {
  return once(`neon:${colour}:${seed}`, () => {
    const r = rngFrom(seed + 3);
    const c = sheet(128, 64);
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
    return texture(c, { srgb: false });
  });
}

// ---------------------------------------------------------------- props and effects

/** A palm crown from above: eleven drooping fronds cut out of transparency. */
export function palmTexture() {
  return once('palm', () => {
    const c = sheet(256, 256);
    const g = c.getContext('2d');
    const r = rngFrom(404);
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
    return texture(c);
  });
}

/** A soft round blob, so it can be tinted by a material colour. */
export function glowTexture(colour = '#ffffff') {
  return once(`glow:${colour}`, () => {
    const c = sheet(128, 128);
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 2, 64, 64, 64);
    grad.addColorStop(0, colour);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    return texture(c, { srgb: false });
  });
}

/** The sky: a Miami evening, purple overhead falling through coral to gold at the water. */
export function skyTexture() {
  return once('sky', () => {
    const c = sheet(8, 512);
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0.0, '#20527f');
    grad.addColorStop(0.24, '#4b6fa8');
    grad.addColorStop(0.44, '#9a6d9e');
    grad.addColorStop(0.6, '#dd6f80');
    grad.addColorStop(0.74, '#ff8d5e');
    grad.addColorStop(0.87, '#ffb473');
    grad.addColorStop(1.0, '#ffe0a8');
    g.fillStyle = grad;
    g.fillRect(0, 0, 8, 512);
    return texture(c, { clamp: true });
  });
}

/** The sun as a billboard: a disc inside a wide warm halo. */
export function sunTexture() {
  return once('sun', () => {
    const c = sheet(256, 256);
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(128, 128, 8, 128, 128, 128);
    grad.addColorStop(0, 'rgba(255,247,214,1)');
    grad.addColorStop(0.16, 'rgba(255,224,160,1)');
    grad.addColorStop(0.24, 'rgba(255,170,110,0.55)');
    grad.addColorStop(0.55, 'rgba(255,120,110,0.16)');
    grad.addColorStop(1, 'rgba(255,100,120,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    return texture(c, { srgb: false });
  });
}

/** Long thin wave crests for the bay, tiled across the water. */
export function rippleTexture() {
  return once('ripple', () => {
    const c = sheet(256, 256);
    const g = c.getContext('2d');
    const r = rngFrom(88);
    g.clearRect(0, 0, 256, 256);
    for (let i = 0; i < 140; i += 1) {
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
    return texture(c, { srgb: false });
  });
}