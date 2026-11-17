// The heads-up display, painted on its own 2D canvas over the 3D view.
//
// Everything the player has to know, in one place: the round compass minimap (avenues, blocks,
// parks, sand, the sea, the player's arrow, the police blips, the job blip or an edge arrow when
// the job is off the map), the wanted stars and their search meter, the wallet, the health bar,
// the ammo, the job panel with its live condition, the door prompt, the toast, the crosshair, and
// the four cards (title, paused, busted or wasted, all done).
//
// The display is painted at the canvas's own resolution and scaled by CSS, so a 1280x720 screenshot
// and a 1600x900 laptop see the same layout at the same proportions.

import { LAW } from './settings.js';
import { avenues, COAST, districtOf } from './layout.js';
import { JOBS, currentJob } from './missions.js';

export const TITLE = 'VICE MERIDIAN';
export const TAGLINE = 'THE CITY KEEPS SCORE';

const MONO = '"DejaVu Sans Mono", "Liberation Mono", "Courier New", monospace';
const SANS = '"DejaVu Sans", "Liberation Sans", Arial, Helvetica, sans-serif';

const MAP_SIZE = 236;
const MAP_SPAN = 620; // metres across the round map
const PINK = '#ff2f86';
const CYAN = '#22e6d0';
const GOLD = '#ffd23c';
const BONE = '#fff6ea';

/** Paint the whole display for the sim's current state. */
export function drawHud(ctx, sim) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.save();
  ctx.clearRect(0, 0, w, h);
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';

  if (sim.mode === 'title') {
    titleCard(ctx, sim, w, h);
    ctx.restore();
    return;
  }

  // The world layer first: the job ring on the street and the damage vignette.
  jobMarker(ctx, sim, w, h);
  vignette(ctx, sim, w, h);

  // The end cards take the screen: the HUD dims under them rather than competing with the title.
  const ended = sim.mode === 'busted' || sim.mode === 'wasted' || sim.mode === 'complete' || sim.mode === 'paused';
  ctx.save();
  if (ended) ctx.globalAlpha = sim.mode === 'paused' ? 0.35 : 0.18;

  minimap(ctx, sim, 26, 24);
  stars(ctx, sim, w - 30, 30);
  wallet(ctx, sim, w - 30, 78);
  jobPanel(ctx, sim, 26, 296);
  health(ctx, sim, 26, h - 74);
  ammo(ctx, sim, w - 30, h - 74);
  prompt(ctx, sim, w, h);
  toast(ctx, sim, w, h);
  floaters(ctx, sim);
  if (sim.mode === 'play') crosshair(ctx, sim, w, h);
  ctx.restore();

  if (sim.mode === 'busted' || sim.mode === 'wasted') endCard(ctx, sim, w, h, sim.mode);
  if (sim.mode === 'complete') doneCard(ctx, sim, w, h);
  if (sim.mode === 'paused') pauseCard(ctx, sim, w, h);
  ctx.restore();
}

// ---------------------------------------------------------------- small helpers

function rounded(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapText(ctx, text, x, y, maxW, lineH) {
  const words = String(text).split(' ');
  let line = '';
  let py = y;
  for (const word of words) {
    const trial = line ? `${line} ${word}` : word;
    if (ctx.measureText(trial).width > maxW && line) {
      ctx.fillText(line, x, py);
      line = word;
      py += lineH;
    } else {
      line = trial;
    }
  }
  if (line) ctx.fillText(line, x, py);
}

const money = (n) => `$${Math.round(n).toLocaleString('en-US')}`;

// ---------------------------------------------------------------- the minimap

/**
 * A round map that turns with the player's aim, the way a car's sat-nav does: the arrow is always
 * up and the world rotates under it. Roads, blocks, parks and water are drawn in map space and
 * rotated about the centre; the blips are drawn after, unrotated, so a diamond stays a diamond.
 */
function minimap(ctx, sim, x, y) {
  const S = MAP_SIZE;
  const r = S / 2;
  const cx = x + r;
  const cy = y + r;
  const p = sim.player;
  const yaw = (p.driving ? p.driving.yaw : p.aimYaw) + Math.PI / 2;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const scale = S / MAP_SPAN;
  const toMap = (wx, wz) => {
    const mx = (wx - p.x) * scale;
    const mz = (wz - p.z) * scale;
    return { x: cx + mx * cos - mz * sin, y: cy + mx * sin + mz * cos };
  };

  ctx.save();
  // A dark plate under the glass edge, then the clipped world.
  ctx.beginPath();
  ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(10,8,20,0.74)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.save();
  ctx.clip();

  // Water fills the plate; the town is a dark polygon laid over it.
  ctx.fillStyle = '#0b4658';
  ctx.fillRect(cx - r, cy - r, S, S);
  const last = avenues()[avenues().length - 1];
  const quad = [toMap(-44, -44), toMap(last + 44, -44), toMap(last + 44, last + 44), toMap(-44, last + 44)];
  ctx.beginPath();
  ctx.moveTo(quad[0].x, quad[0].y);
  for (let i = 1; i < 4; i += 1) ctx.lineTo(quad[i].x, quad[i].y);
  ctx.closePath();
  ctx.fillStyle = '#1c1a2a';
  ctx.fill();

  // The beach and the promenade: two pale bands west of the first avenue.
  const sand = [toMap(COAST.sand, -44), toMap(COAST.promenade, -44), toMap(COAST.promenade, last + 44), toMap(COAST.sand, last + 44)];
  ctx.beginPath();
  ctx.moveTo(sand[0].x, sand[0].y);
  for (let i = 1; i < 4; i += 1) ctx.lineTo(sand[i].x, sand[i].y);
  ctx.closePath();
  ctx.fillStyle = '#c9ad7d';
  ctx.fill();

  // Blocks, each rotated about its own centre.
  for (const b of sim.layout.blocks) {
    const at = toMap(b.x + b.w / 2, b.z + b.h / 2);
    const q = Math.max(3, b.w * scale);
    ctx.save();
    ctx.translate(at.x, at.y);
    ctx.rotate(yaw);
    ctx.fillStyle = b.kind === 'park' ? '#2f6247' : '#343247';
    ctx.fillRect(-q / 2, -q / 2, q, q);
    ctx.restore();
  }

  // The avenues: wide dark strokes with a dashed centre in the paint gold.
  const strokeRoads = (width, colour, dash) => {
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    ctx.setLineDash(dash ?? []);
    ctx.beginPath();
    for (const line of avenues()) {
      const a = toMap(line, -60);
      const b = toMap(line, last + 60);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      const c = toMap(-60, line);
      const d = toMap(last + 60, line);
      ctx.moveTo(c.x, c.y);
      ctx.lineTo(d.x, d.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  };
  strokeRoads(Math.max(4, 88 * scale), '#5a5668');
  strokeRoads(1.5, 'rgba(255,210,60,0.35)', [4, 6]);

  // The job: a gold diamond inside the glass, or an arrow at the rim pointing at it.
  const job = currentJob(sim.story);
  if (job) {
    const m = toMap(job.at.x, job.at.z);
    if (Math.hypot(m.x - cx, m.y - cy) < r - 10) {
      const pulse = 1 + Math.sin(sim.time * 4) * 0.18;
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.shadowColor = GOLD;
      ctx.shadowBlur = 10;
      ctx.fillStyle = GOLD;
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-4.5 * pulse, -4.5 * pulse, 9 * pulse, 9 * pulse);
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,210,60,0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(m.x, m.y, 10 * pulse, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      const a = Math.atan2(m.y - cy, m.x - cx);
      ctx.save();
      ctx.translate(cx + Math.cos(a) * (r - 12), cy + Math.sin(a) * (r - 12));
      ctx.rotate(a);
      ctx.fillStyle = GOLD;
      ctx.beginPath();
      ctx.moveTo(8, 0);
      ctx.lineTo(-5, 6);
      ctx.lineTo(-5, -6);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  // Police: a red or blue dot per cruiser, a small pale dot per officer on foot.
  const beat = Math.sin(sim.time * 14) > 0;
  for (const u of sim.police.units) {
    const m = toMap(u.x, u.z);
    if (Math.hypot(m.x - cx, m.y - cy) > r - 4) continue;
    ctx.fillStyle = beat ? '#ff3355' : '#3d7dff';
    ctx.beginPath();
    ctx.arc(m.x, m.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.65)';
    ctx.lineWidth = 1;
    ctx.stroke();
    for (const o of u.officers) {
      if (!o.alive || o.inCar) continue;
      const om = toMap(o.x, o.z);
      ctx.fillStyle = 'rgba(160,200,255,0.9)';
      ctx.beginPath();
      ctx.arc(om.x, om.y, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // The player's arrow, always up, with a soft wedge showing where they are looking.
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, 52, -Math.PI * 0.34, -Math.PI * 0.66);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = BONE;
  ctx.strokeStyle = PINK;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -10);
  ctx.lineTo(7, 8);
  ctx.lineTo(0, 4);
  ctx.lineTo(-7, 8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  ctx.restore();

  // The glass edge, the N at the top, and the district caption under the map.
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(34,230,208,0.55)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = CYAN;
  ctx.font = `bold 11px ${MONO}`;
  ctx.textAlign = 'center';
  ctx.fillText('N', cx, y + 14);
  ctx.textAlign = 'left';
  ctx.font = `10px ${MONO}`;
  ctx.fillStyle = 'rgba(255,246,234,0.72)';
  ctx.fillText(districtOf(p.x, p.z).toUpperCase(), x + 4, y + S + 18);
  ctx.restore();
}

// ---------------------------------------------------------------- counters

function starPath(ctx, cx, cy, r, push) {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r * push : r * 0.45;
    const px = cx + Math.cos(a) * rr;
    const py = cy + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function stars(ctx, sim, right, y) {
  const lit = sim.police.stars;
  const size = 21;
  const gap = 3;
  const total = size * LAW.maxStars + gap * (LAW.maxStars - 1);
  let x = right - total;
  ctx.save();
  for (let i = 0; i < LAW.maxStars; i += 1) {
    const push = i < lit ? 1 + Math.sin(sim.time * 3 + x) * 0.04 : 1;
    starPath(ctx, x + size / 2, y + size / 2, size / 2, push);
    if (i < lit) {
      ctx.fillStyle = GOLD;
      ctx.shadowColor = '#ff7a2f';
      ctx.shadowBlur = 12;
      ctx.fill();
      ctx.shadowBlur = 0;
    } else {
      ctx.fillStyle = 'rgba(20,16,30,0.55)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,246,234,0.35)';
      ctx.lineWidth = 1.3;
      ctx.stroke();
    }
    x += size + gap;
  }
  ctx.textAlign = 'right';
  ctx.font = `10px ${MONO}`;
  const label = lit === 0 ? 'CLEAN' : sim.police.seen ? 'IN SIGHT' : 'SEARCHING';
  ctx.fillStyle = lit === 0 ? 'rgba(255,246,234,0.5)' : sim.police.seen ? '#ff6a80' : 'rgba(255,210,60,0.9)';
  ctx.fillText(label, right, y + size + 14);

  // The search meter: how long until the heat starts to cool.
  if (lit > 0 && !sim.police.seen) {
    const frac = Math.min(1, sim.police.quiet / LAW.coolAfter);
    ctx.fillStyle = 'rgba(255,210,60,0.2)';
    ctx.fillRect(right - 92, y + size + 19, 92, 3);
    ctx.fillStyle = GOLD;
    ctx.fillRect(right - 92, y + size + 19, 92 * frac, 3);
  }
  ctx.restore();
}

function wallet(ctx, sim, right, y) {
  ctx.save();
  ctx.textAlign = 'right';
  const text = money(sim.story.cash);
  ctx.font = `bold 32px ${MONO}`;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillText(text, right + 2, y + 2);
  ctx.fillStyle = '#8dffcf';
  ctx.fillText(text, right, y);
  ctx.font = `10px ${MONO}`;
  ctx.fillStyle = 'rgba(255,246,234,0.6)';
  const of = JOBS.length;
  ctx.fillText(`JOB ${Math.min(sim.story.index + 1, of)} OF ${of}  ·  ${sim.story.done} DONE`, right, y + 16);
  ctx.restore();
}

function health(ctx, sim, x, y) {
  const p = sim.player;
  const W = 250;
  ctx.save();
  ctx.fillStyle = 'rgba(12,10,22,0.78)';
  rounded(ctx, x, y, W, 15, 3);
  ctx.fill();
  const frac = Math.max(0, p.hp / p.hpMax);
  const grad = ctx.createLinearGradient(x, 0, x + W, 0);
  grad.addColorStop(0, '#ff3d5a');
  grad.addColorStop(0.5, '#ff8a4a');
  grad.addColorStop(1, '#ffd23c');
  ctx.fillStyle = frac < 0.25 && Math.sin(sim.time * 10) > 0 ? '#ff8a9a' : grad;
  ctx.fillRect(x + 2, y + 2, (W - 4) * frac, 11);
  ctx.strokeStyle = 'rgba(255,246,234,0.45)';
  ctx.lineWidth = 1;
  rounded(ctx, x + 0.5, y + 0.5, W - 1, 14, 3);
  ctx.stroke();
  if (p.armour > 0) {
    ctx.fillStyle = 'rgba(120,210,255,0.9)';
    ctx.fillRect(x + 2, y + 2, (W - 4) * Math.min(1, p.armour / 60), 4);
  }
  ctx.font = `bold 11px ${MONO}`;
  ctx.fillStyle = 'rgba(255,246,234,0.95)';
  ctx.textAlign = 'left';
  ctx.fillText(`HP ${Math.round(p.hp)}`, x + 8, y + 30);
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(255,246,234,0.6)';
  ctx.fillText(p.driving ? 'DRIVING' : p.running ? 'RUNNING' : 'ON FOOT', x + W, y + 30);

  // The speedometer, when there is a car under the player: km/h, and a bar that fills with it.
  if (p.driving) {
    const kmh = Math.round(Math.abs(p.driving.speed) * 3.6);
    ctx.textAlign = 'left';
    ctx.font = `bold 26px ${MONO}`;
    ctx.fillStyle = '#8dffcf';
    ctx.fillText(String(kmh), x + 2, y - 12);
    const nw = ctx.measureText(String(kmh)).width;
    ctx.font = `11px ${MONO}`;
    ctx.fillStyle = 'rgba(255,246,234,0.6)';
    ctx.fillText('KM/H', x + 6 + nw, y - 12);
    const frac2 = Math.min(1, Math.abs(p.driving.speed) / 46);
    ctx.fillStyle = 'rgba(255,246,234,0.16)';
    ctx.fillRect(x, y - 8, W, 3);
    ctx.fillStyle = frac2 > 0.8 ? '#ff5a72' : CYAN;
    ctx.fillRect(x, y - 8, W * frac2, 3);
  }
  ctx.restore();
}

function ammo(ctx, sim, right, y) {
  const p = sim.player;
  ctx.save();
  ctx.textAlign = 'right';
  ctx.font = `bold 34px ${MONO}`;
  ctx.fillStyle = p.clip > 0 ? BONE : '#ff5a72';
  ctx.fillText(String(p.clip).padStart(2, '0'), right, y + 26);
  ctx.font = `12px ${MONO}`;
  ctx.fillStyle = 'rgba(255,246,234,0.55)';
  ctx.fillText(`/ ${p.ammo}`, right, y + 42);

  // A pistol glyph, so the number has something to belong to.
  ctx.save();
  ctx.translate(right - 88, y + 14);
  ctx.fillStyle = p.clip > 0 ? 'rgba(255,246,234,0.85)' : 'rgba(255,90,114,0.8)';
  ctx.fillRect(0, 0, 30, 8);
  ctx.fillRect(22, 0, 8, 5);
  ctx.save();
  ctx.translate(4, 8);
  ctx.rotate(0.22);
  ctx.fillRect(0, 0, 9, 15);
  ctx.restore();
  ctx.restore();

  ctx.font = `10px ${MONO}`;
  ctx.fillStyle = p.reload > 0 ? GOLD : 'rgba(255,246,234,0.45)';
  ctx.fillText(p.reload > 0 ? 'RELOADING…' : '9MM  ·  R RELOAD', right, y + 58);
  ctx.restore();
}

/** The job panel: the job's name, its objective line, the distance and the live condition. */
function jobPanel(ctx, sim, x, y) {
  const job = currentJob(sim.story);
  const W = 356;
  const H = job ? 92 : 64;
  ctx.save();
  ctx.fillStyle = 'rgba(12,10,22,0.74)';
  rounded(ctx, x, y, W, H, 4);
  ctx.fill();
  ctx.fillStyle = job ? GOLD : CYAN;
  ctx.fillRect(x, y, 4, H);
  ctx.textAlign = 'left';
  ctx.font = `10px ${MONO}`;
  ctx.fillStyle = GOLD;
  ctx.fillText(job ? `JOB ${sim.story.index + 1} / ${JOBS.length}  ·  ${job.title.toUpperCase()}` : 'ALL JOBS DONE', x + 14, y + 18);
  if (!job) {
    ctx.font = `bold 15px ${MONO}`;
    ctx.fillStyle = BONE;
    ctx.fillText('VICE MERIDIAN IS YOURS', x + 14, y + 40);
    ctx.restore();
    return;
  }
  ctx.font = `13px ${MONO}`;
  ctx.fillStyle = BONE;
  wrapText(ctx, job.line, x + 14, y + 38, W - 100, 16);
  const d = Math.hypot(job.at.x - sim.player.x, job.at.z - sim.player.z);
  ctx.textAlign = 'right';
  ctx.font = `bold 16px ${MONO}`;
  ctx.fillStyle = GOLD;
  ctx.fillText(d < 1000 ? `${Math.round(d)} M` : `${(d / 1000).toFixed(1)} KM`, x + W - 12, y + 18);
  ctx.font = `bold 11px ${MONO}`;
  ctx.fillStyle = sim.police.stars > 0 && job.beat === 'escape' ? '#ff6a80' : CYAN;
  ctx.fillText(conditionLine(sim, job), x + W - 12, y + H - 14);
  ctx.restore();
}

function conditionLine(sim, job) {
  const d = Math.round(Math.hypot(job.at.x - sim.player.x, job.at.z - sim.player.z));
  switch (job.beat) {
    case 'reach':
      return d < job.radius ? 'STEP INTO THE MARKER' : 'GO TO THE MARKER';
    case 'deliver':
      return sim.player.driving ? 'DELIVER THE CAR' : 'TAKE A CAR FIRST';
    case 'clear':
      return `${sim.crewDown} / ${job.need} DOWN`;
    case 'escape':
      return sim.police.stars > 0 ? `${sim.police.stars} STARS · SHAKE THEM` : 'CLEAN · GO NOW';
    default:
      return 'THE BOAT';
  }
}

// ---------------------------------------------------------------- the world layer

/** The job's ring on the street, its floating diamond and its name, projected into the frame. */
function jobMarker(ctx, sim, w, h) {
  const job = currentJob(sim.story);
  if (!job || !sim.project) return;
  const at = sim.project(job.at.x, 0.5, job.at.z);
  if (!at || at.depth > 1 || at.x < -80 || at.x > w + 80 || at.y < -80 || at.y > h + 80) return;
  const t = sim.time;
  const pulse = 1 + Math.sin(t * 3) * 0.06;
  ctx.save();
  const halo = ctx.createRadialGradient(at.x, at.y, 4, at.x, at.y, 46 * pulse);
  halo.addColorStop(0, 'rgba(255,210,60,0.55)');
  halo.addColorStop(0.6, 'rgba(255,150,40,0.18)');
  halo.addColorStop(1, 'rgba(255,150,40,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.ellipse(at.x, at.y, 46 * pulse, 46 * pulse * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,210,60,0.95)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.ellipse(at.x, at.y, 26 * pulse, 26 * pulse * 0.42, 0, 0, Math.PI * 2);
  ctx.stroke();

  // The diamond floats over the ring, and the job's name and distance ride above it.
  const fy = at.y - 58 - Math.sin(t * 2.2) * 3;
  ctx.save();
  ctx.translate(at.x, fy);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = GOLD;
  ctx.shadowColor = GOLD;
  ctx.shadowBlur = 14;
  ctx.fillRect(-7, -7, 14, 14);
  ctx.restore();
  ctx.font = `bold 12px ${MONO}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,246,234,0.95)';
  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur = 6;
  const d = Math.round(Math.hypot(job.at.x - sim.player.x, job.at.z - sim.player.z));
  ctx.fillText(`${job.title.toUpperCase()}  ·  ${d} M`, at.x, fy - 20);
  ctx.restore();
}

function vignette(ctx, sim, w, h) {
  const hurt = Math.max(sim.player.hurt * 0.55, sim.flash * 0.5);
  if (hurt > 0.02) {
    const g = ctx.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h * 0.78);
    g.addColorStop(0, 'rgba(255,20,60,0)');
    g.addColorStop(1, `rgba(255,16,56,${Math.min(0.75, hurt).toFixed(3)})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  // A permanent soft vignette: the camera is a lens, not a window.
  const v = ctx.createRadialGradient(w / 2, h / 2, h * 0.55, w / 2, h / 2, h * 1.05);
  v.addColorStop(0, 'rgba(10,6,20,0)');
  v.addColorStop(1, 'rgba(10,6,20,0.55)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
}

function crosshair(ctx, sim, w, h) {
  const ptr = sim.pointer;
  const x = ptr ? ptr.x : w / 2;
  const y = ptr ? ptr.y : h / 2;
  const spread = 8 + sim.player.recoil * 7;
  ctx.save();
  ctx.strokeStyle = 'rgba(255,246,234,0.9)';
  ctx.lineWidth = 1.8;
  for (let i = 0; i < 4; i += 1) {
    const a = (i * Math.PI) / 2;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * spread, y + Math.sin(a) * spread);
    ctx.lineTo(x + Math.cos(a) * (spread + 7), y + Math.sin(a) * (spread + 7));
    ctx.stroke();
  }
  ctx.fillStyle = PINK;
  ctx.beginPath();
  ctx.arc(x, y, 1.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function prompt(ctx, sim, w, h) {
  if (!sim.prompt) return;
  ctx.save();
  ctx.font = `bold 13px ${MONO}`;
  const tw = ctx.measureText(sim.prompt).width;
  const x = w / 2 - tw / 2 - 16;
  ctx.fillStyle = 'rgba(12,10,22,0.8)';
  rounded(ctx, x, h - 156, tw + 32, 30, 4);
  ctx.fill();
  ctx.strokeStyle = 'rgba(34,230,208,0.7)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = BONE;
  ctx.textAlign = 'center';
  ctx.fillText(sim.prompt, w / 2, h - 136);
  ctx.restore();
}

function toast(ctx, sim, w, h) {
  const s = sim.story;
  if (s.toastT <= 0 || !s.toast) return;
  if (sim.mode !== 'play' && sim.mode !== 'title') return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, s.toastT);
  ctx.font = `bold 17px ${SANS}`;
  const tw = ctx.measureText(s.toast).width;
  const x = w / 2 - tw / 2 - 22;
  ctx.fillStyle = 'rgba(12,10,22,0.78)';
  rounded(ctx, x, 116, tw + 44, 42, 5);
  ctx.fill();
  ctx.fillStyle = /FAILED|WASTED|BUSTED/.test(s.toast) ? '#ff4d6d' : CYAN;
  ctx.fillRect(x, 116, 4, 42);
  ctx.fillStyle = BONE;
  ctx.textAlign = 'center';
  ctx.fillText(s.toast, w / 2, 143);
  ctx.restore();
}

/** Cash and job payouts rising off the street where they were earned. */
function floaters(ctx, sim) {
  if (!sim.floaters.length || !sim.project) return;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = `bold 18px ${MONO}`;
  for (const f of sim.floaters) {
    const at = sim.project(f.x, f.y, f.z);
    if (!at || at.depth > 1) continue;
    ctx.globalAlpha = Math.min(1, f.life);
    ctx.fillStyle = f.colour;
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 8;
    ctx.fillText(f.text, at.x, at.y);
  }
  ctx.restore();
}

// ---------------------------------------------------------------- the cards

function titleCard(ctx, sim, w, h) {
  const t = sim.time;
  // A wash dark enough to read the title over, light enough to see the city through.
  const wash = ctx.createLinearGradient(0, 0, 0, h);
  wash.addColorStop(0, 'rgba(14,8,26,0.82)');
  wash.addColorStop(0.4, 'rgba(20,10,32,0.42)');
  wash.addColorStop(0.66, 'rgba(40,14,36,0.28)');
  wash.addColorStop(1, 'rgba(10,6,18,0.86)');
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(255,47,134,0.08)';
  ctx.fillRect(0, h * 0.2, w, 4);

  ctx.save();
  ctx.textAlign = 'center';
  ctx.letterSpacing = '10px';
  ctx.font = `bold 92px ${SANS}`;
  const ty = h * 0.29;
  const grad = ctx.createLinearGradient(w / 2 - 360, 0, w / 2 + 360, 0);
  grad.addColorStop(0, PINK);
  grad.addColorStop(0.45, '#ffb07a');
  grad.addColorStop(1, CYAN);
  ctx.fillStyle = 'rgba(8,4,16,0.6)';
  ctx.fillText(TITLE, w / 2 + 4, ty + 5);
  ctx.shadowColor = 'rgba(255,47,134,0.6)';
  ctx.shadowBlur = 30 + Math.sin(t * 2) * 8;
  ctx.fillStyle = grad;
  ctx.fillText(TITLE, w / 2, ty);
  ctx.shadowBlur = 0;
  ctx.letterSpacing = '0px';
  ctx.fillStyle = PINK;
  ctx.fillRect(w / 2 - 260, ty + 18, 260, 3);
  ctx.fillStyle = CYAN;
  ctx.fillRect(w / 2, ty + 18, 260, 3);
  ctx.font = `12px ${MONO}`;
  ctx.letterSpacing = '6px';
  ctx.fillStyle = 'rgba(255,246,234,0.8)';
  ctx.fillText(TAGLINE, w / 2, ty + 44);
  ctx.letterSpacing = '0px';

  // The controls, in two columns on one card.
  const cardW = 700;
  const cardX = w / 2 - cardW / 2;
  const cardY = ty + 70;
  ctx.fillStyle = 'rgba(10,8,20,0.62)';
  rounded(ctx, cardX, cardY, cardW, 150, 6);
  ctx.fill();
  ctx.strokeStyle = 'rgba(34,230,208,0.45)';
  ctx.lineWidth = 1;
  ctx.stroke();
  const rows = [
    ['W A S D', 'walk · drive'],
    ['SHIFT', 'run'],
    ['E', 'take or leave a car'],
    ['LEFT MOUSE', 'shoot'],
    ['R', 'reload'],
    ['ESC', 'pause  ·  M sound'],
  ];
  rows.forEach((row, i) => {
    const col = i % 2;
    const line = Math.floor(i / 2);
    const x = cardX + 34 + col * (cardW / 2);
    const y = cardY + 40 + line * 38;
    ctx.textAlign = 'left';
    ctx.font = `bold 13px ${MONO}`;
    const kw = ctx.measureText(row[0]).width;
    ctx.fillStyle = 'rgba(34,230,208,0.16)';
    rounded(ctx, x, y - 17, kw + 18, 24, 3);
    ctx.fill();
    ctx.strokeStyle = 'rgba(34,230,208,0.55)';
    ctx.stroke();
    ctx.fillStyle = '#8dfff0';
    ctx.fillText(row[0], x + 9, y);
    ctx.font = `12px ${MONO}`;
    ctx.fillStyle = 'rgba(255,246,234,0.86)';
    ctx.fillText(row[1], x + kw + 30, y);
  });

  ctx.textAlign = 'center';
  ctx.globalAlpha = 0.62 + Math.sin(t * 3) * 0.38;
  ctx.font = `bold 18px ${MONO}`;
  ctx.fillStyle = GOLD;
  ctx.fillText('PRESS  ENTER  TO  CLOCK  ON', w / 2, cardY + 190);
  ctx.globalAlpha = 1;
  ctx.font = `11px ${MONO}`;
  ctx.fillStyle = 'rgba(255,246,234,0.6)';
  ctx.fillText('FIVE JOBS · ONE SUNSET · THE POLICE ARE ALREADY PAID', w / 2, cardY + 214);

  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255,246,234,0.45)';
  ctx.fillText('VICE MERIDIAN · a gulf-side city of 2.4 km', 26, h - 26);
  ctx.textAlign = 'right';
  ctx.fillText('an original open-world crime game', w - 26, h - 26);
  ctx.restore();
}

function endCard(ctx, sim, w, h, mode) {
  const busted = mode === 'busted';
  // A solid plate behind the words: the street still shows at the edges, but nothing competes with
  // the title and the small print stays legible over a lit window.
  const grad = ctx.createLinearGradient(0, h * 0.2, 0, h * 0.62);
  grad.addColorStop(0, 'rgba(8,5,16,0)');
  grad.addColorStop(0.18, 'rgba(8,5,16,0.86)');
  grad.addColorStop(0.82, 'rgba(8,5,16,0.86)');
  grad.addColorStop(1, 'rgba(8,5,16,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, h * 0.2, w, h * 0.42);
  ctx.save();
  ctx.textAlign = 'center';
  ctx.letterSpacing = '8px';
  ctx.font = `bold 86px ${SANS}`;
  const colour = busted ? '#7fc8ff' : '#ff3d5a';
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillText(busted ? 'BUSTED' : 'WASTED', w / 2 + 4, h * 0.4 + 5);
  ctx.fillStyle = colour;
  ctx.shadowColor = colour;
  ctx.shadowBlur = 24;
  ctx.fillText(busted ? 'BUSTED' : 'WASTED', w / 2, h * 0.4);
  ctx.shadowBlur = 0;
  ctx.letterSpacing = '0px';
  ctx.font = `13px ${MONO}`;
  ctx.fillStyle = 'rgba(255,246,234,0.82)';
  ctx.fillText(
    busted ? 'The VMPD found you. The Meridian keeps the rest.' : 'The sun went down on you in Vice Meridian.',
    w / 2,
    h * 0.4 + 34,
  );
  ctx.font = `bold 14px ${MONO}`;
  ctx.fillStyle = GOLD;
  ctx.globalAlpha = 0.55 + Math.sin(sim.time * 4) * 0.45;
  ctx.fillText('PRESS  R  TO  GET  BACK  OUT', w / 2, h * 0.4 + 78);
  ctx.globalAlpha = 1;
  ctx.font = `11px ${MONO}`;
  ctx.fillStyle = 'rgba(255,246,234,0.62)';
  ctx.fillText(
    `JOBS PASSED ${sim.story.done}/${JOBS.length}${busted ? '   ·   YOUR GUN IS IN THE CRUISER' : '   ·   YOUR GUN WENT WITH YOU'}`,
    w / 2,
    h * 0.4 + 104,
  );
  ctx.restore();
}

function doneCard(ctx, sim, w, h) {
  ctx.fillStyle = 'rgba(8,5,16,0.62)';
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.textAlign = 'center';
  ctx.letterSpacing = '6px';
  ctx.font = `bold 58px ${SANS}`;
  const grad = ctx.createLinearGradient(w / 2 - 300, 0, w / 2 + 300, 0);
  grad.addColorStop(0, PINK);
  grad.addColorStop(1, CYAN);
  ctx.fillStyle = grad;
  ctx.fillText('THE LAST TIDE', w / 2, h * 0.42);
  ctx.letterSpacing = '0px';
  ctx.font = `13px ${MONO}`;
  ctx.fillStyle = 'rgba(255,246,234,0.85)';
  ctx.fillText(`You walked out of Vice Meridian with ${money(sim.story.cash)}.`, w / 2, h * 0.42 + 34);
  ctx.fillStyle = GOLD;
  ctx.fillText('PRESS  R  TO  RUN  IT  BACK', w / 2, h * 0.42 + 68);
  ctx.restore();
}

function pauseCard(ctx, sim, w, h) {
  ctx.fillStyle = 'rgba(8,5,16,0.58)';
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.textAlign = 'center';
  ctx.letterSpacing = '6px';
  ctx.font = `bold 44px ${SANS}`;
  ctx.fillStyle = BONE;
  ctx.fillText('PAUSED', w / 2, h / 2);
  ctx.letterSpacing = '0px';
  ctx.font = `12px ${MONO}`;
  ctx.fillStyle = 'rgba(255,246,234,0.7)';
  ctx.fillText('ESC to get back on the street   ·   M for sound', w / 2, h / 2 + 30);
  ctx.restore();
}

export { MAP_SIZE, MAP_SPAN };