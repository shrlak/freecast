// Draws one frame of a moving background. Everything is a function of the time `t`
// (seconds), so frames need no stored state and any window can draw the same picture.
import type { MotionStyle } from './types';
import { mix, rgba, safeColors, clampSpeed, type MotionBackground } from './motion';

export const MOTION_W = 720;
export const MOTION_H = 540;

type Ctx = CanvasRenderingContext2D;

/** A small seeded random generator: the same seed always gives the same particles. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Particle { x: number; y: number; r: number; s: number; ph: number; c: number }

const SEEDS: Record<MotionStyle, number> = { aurora: 11, waves: 23, stars: 37, rays: 41, embers: 53, bokeh: 67 };
const COUNTS: Record<MotionStyle, number> = { aurora: 0, waves: 28, stars: 170, rays: 46, embers: 90, bokeh: 26 };
const cache = new Map<MotionStyle, Particle[]>();

function particles(style: MotionStyle): Particle[] {
  let list = cache.get(style);
  if (!list) {
    const rand = mulberry32(SEEDS[style]);
    list = Array.from({ length: COUNTS[style] }, () => ({ x: rand(), y: rand(), r: rand(), s: 0.4 + rand() * 1.2, ph: rand(), c: rand() < 0.5 ? 0 : 1 }));
    cache.set(style, list);
  }
  return list;
}

const TAU = Math.PI * 2;
const frac = (v: number) => v - Math.floor(v);

function base(ctx: Ctx, w: number, h: number, [c0, c1]: string[]) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, c0);
  g.addColorStop(1, mix(c0, c1, 0.18));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function glow(ctx: Ctx, x: number, y: number, r: number, color: string, alpha: number) {
  if (r <= 0.5 || alpha <= 0.002) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, alpha));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

function aurora(ctx: Ctx, w: number, h: number, t: number, [, accent, high]: string[]) {
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 4; i++) {
    glow(ctx, w * (0.5 + 0.38 * Math.sin(t * 0.13 + i * 2.1)), h * (0.45 + 0.3 * Math.cos(t * 0.11 + i * 1.7)),
      w * (0.42 + 0.1 * Math.sin(t * 0.2 + i)), i % 2 ? high : accent, 0.5);
  }
  // Slow ribbons across the sky.
  for (let k = 0; k < 2; k++) {
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 12) {
      ctx.lineTo(x, h * (0.34 + 0.16 * k) + Math.sin(x / w * TAU * 1.3 + t * (0.35 + 0.1 * k) + k) * h * 0.09 + Math.sin(x / w * TAU * 2.7 - t * 0.27) * h * 0.03);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, h * 0.2, 0, h);
    g.addColorStop(0, rgba(k ? high : accent, 0.28));
    g.addColorStop(1, rgba(k ? high : accent, 0));
    ctx.fillStyle = g;
    ctx.fill();
  }
}

function waves(ctx: Ctx, w: number, h: number, t: number, [, accent, high]: string[]) {
  glow(ctx, w * 0.5, h * 0.15, w * 0.7, high, 0.16);
  for (let i = 0; i < 5; i++) {
    const y0 = h * (0.46 + 0.1 * i);
    const amp = h * (0.028 + 0.012 * i);
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 8) {
      ctx.lineTo(x, y0 + Math.sin(x / w * TAU * (1.2 + 0.3 * i) + t * (0.6 + 0.15 * i) + i) * amp + Math.sin(x / w * TAU * 2.3 - t * 0.4 + i) * amp * 0.5);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, y0 - amp, 0, h);
    g.addColorStop(0, rgba(i % 2 ? high : accent, 0.34));
    g.addColorStop(1, rgba(accent, 0.04));
    ctx.fillStyle = g;
    ctx.fill();
  }
  // Light glinting on the water.
  ctx.globalCompositeOperation = 'lighter';
  for (const p of particles('waves')) {
    const tw = 0.5 + 0.5 * Math.sin(t * 1.6 * p.s + p.ph * TAU);
    glow(ctx, p.x * w, h * (0.5 + p.y * 0.45), 2 + p.r * 5, high, 0.5 * tw * tw);
  }
}

function stars(ctx: Ctx, w: number, h: number, t: number, [, accent, high]: string[]) {
  glow(ctx, w * (0.7 + 0.04 * Math.sin(t * 0.05)), h * 0.32, w * 0.5, accent, 0.16);
  glow(ctx, w * 0.2, h * 0.75, w * 0.4, accent, 0.09);
  ctx.globalCompositeOperation = 'lighter';
  for (const p of particles('stars')) {
    const x = frac(p.x + t * 0.003 * p.s) * w;
    const tw = 0.5 + 0.5 * Math.sin(t * (0.6 + p.s) + p.ph * TAU);
    const r = 0.5 + p.r * 1.7;
    glow(ctx, x, p.y * h, r * 3.2, p.c ? accent : high, 0.5 * tw);
    ctx.fillStyle = rgba(high, 0.35 + 0.65 * tw);
    ctx.beginPath();
    ctx.arc(x, p.y * h, r, 0, TAU);
    ctx.fill();
  }
  // A shooting star every few seconds.
  const period = 9;
  const k = (t % period) / period;
  if (k < 0.1) {
    const n = Math.floor(t / period);
    const rand = mulberry32(n * 7919 + 13);
    const x0 = w * (0.15 + rand() * 0.6), y0 = h * (0.05 + rand() * 0.3), run = k / 0.1;
    const dx = w * 0.3 * run, dy = h * 0.16 * run;
    const g = ctx.createLinearGradient(x0 + dx, y0 + dy, x0 + dx - w * 0.12, y0 + dy - h * 0.06);
    g.addColorStop(0, rgba(high, 0.9 * (1 - run)));
    g.addColorStop(1, rgba(high, 0));
    ctx.strokeStyle = g;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x0 + dx, y0 + dy);
    ctx.lineTo(x0 + dx - w * 0.12, y0 + dy - h * 0.06);
    ctx.stroke();
  }
}

function rays(ctx: Ctx, w: number, h: number, t: number, [, accent, high]: string[]) {
  const ox = w * 0.5, oy = -h * 0.12, len = h * 1.7;
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 10; i++) {
    const angle = Math.PI / 2 + (i - 4.5) * 0.17 + Math.sin(t * 0.15 + i) * 0.04;
    const half = 0.035 + 0.02 * Math.sin(t * 0.3 + i * 1.7);
    const pulse = 0.55 + 0.45 * Math.sin(t * 0.4 + i * 1.3);
    const g = ctx.createLinearGradient(ox, oy, ox + Math.cos(angle) * len, oy + Math.sin(angle) * len);
    g.addColorStop(0, rgba(accent, 0.24 * pulse));
    g.addColorStop(1, rgba(accent, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(ox + Math.cos(angle - half) * len, oy + Math.sin(angle - half) * len);
    ctx.lineTo(ox + Math.cos(angle + half) * len, oy + Math.sin(angle + half) * len);
    ctx.closePath();
    ctx.fill();
  }
  glow(ctx, ox, h * 0.05, w * 0.6, high, 0.3);
  // Dust drifting in the light.
  for (const p of particles('rays')) {
    const u = frac(p.ph + t * 0.012 * p.s);
    const tw = 0.4 + 0.6 * Math.sin(t * p.s + p.ph * TAU) ** 2;
    glow(ctx, p.x * w + Math.sin(t * 0.2 + p.ph * TAU) * 14, h * (1.05 - u * 1.1), 3 + p.r * 4, high, 0.55 * tw);
  }
}

function embers(ctx: Ctx, w: number, h: number, t: number, [, accent, high]: string[]) {
  const g = ctx.createLinearGradient(0, h, 0, h * 0.5);
  g.addColorStop(0, rgba(accent, 0.4 + 0.06 * Math.sin(t * 1.3)));
  g.addColorStop(1, rgba(accent, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, h * 0.5, w, h * 0.5);
  ctx.globalCompositeOperation = 'lighter';
  for (const p of particles('embers')) {
    const u = frac(p.ph + t * 0.05 * p.s);
    const x = p.x * w + Math.sin(t * 0.8 * p.s + p.ph * TAU) * 22 * (0.4 + u);
    const y = h * (1.04 - u * 1.12);
    const flick = 0.55 + 0.45 * Math.sin(t * 3 * p.s + p.ph * 9);
    const a = Math.sin(u * Math.PI) * flick;
    const r = (2 + p.r * 5) * (1 - 0.5 * u);
    glow(ctx, x, y, r * 4, p.c ? accent : high, 0.5 * a);
    ctx.fillStyle = rgba(high, 0.9 * a);
    ctx.beginPath();
    ctx.arc(x, y, r * 0.45, 0, TAU);
    ctx.fill();
  }
}

function bokeh(ctx: Ctx, w: number, h: number, t: number, [, accent, high]: string[]) {
  ctx.globalCompositeOperation = 'lighter';
  for (const p of particles('bokeh')) {
    const r = 16 + p.r * 62;
    const u = frac(p.ph + t * 0.012 * p.s);
    const x = p.x * w + Math.sin(t * 0.1 * p.s + p.ph * TAU) * 34;
    const y = (h + r * 2) * (1 - u) - r;
    const a = 0.16 + 0.1 * Math.sin(t * 0.5 * p.s + p.ph * TAU);
    const color = p.c ? high : accent;
    glow(ctx, x, y, r, color, a * 2);
    ctx.strokeStyle = rgba(color, a * 1.4);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.62, 0, TAU);
    ctx.stroke();
  }
}

const DRAW: Record<MotionStyle, (ctx: Ctx, w: number, h: number, t: number, colors: string[]) => void> = { aurora, waves, stars, rays, embers, bokeh };

/** Draw the background `bg` as it looks `seconds` after the start (speed applied here). */
export function drawMotion(ctx: Ctx, w: number, h: number, seconds: number, bg: MotionBackground): void {
  const style = bg.style in DRAW ? bg.style : 'aurora';
  const colors = safeColors(style, bg.colors);
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  base(ctx, w, h, colors);
  DRAW[style](ctx, w, h, seconds * clampSpeed(bg.speed), colors);
  ctx.restore();
}
