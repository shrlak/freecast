// Behringer X32 / M32 mixer control: which strips FreeCast can operate, their OSC addresses, fader
// values in dB, and the X32 steps of macros and slide actions. The FreeCast server (server/x32.mjs)
// talks to the mixer; this file is the shared vocabulary.
import type { MacroStep } from './types';

export type X32Step = Extract<MacroStep, { type: 'x32' }>;
export type X32Values = Record<string, number | string>;

export interface X32Strip {
  /** 'ch/05', 'dca/2' or 'main/st'. */
  id: string;
  kind: 'ch' | 'dca' | 'main';
  label: string;
}

const two = (n: number) => String(n).padStart(2, '0');
export const X32_STRIPS: X32Strip[] = [
  { id: 'main/st', kind: 'main', label: 'Main LR' },
  ...Array.from({ length: 8 }, (_, i): X32Strip => ({ id: `dca/${i + 1}`, kind: 'dca', label: `DCA ${i + 1}` })),
  ...Array.from({ length: 32 }, (_, i): X32Strip => ({ id: `ch/${two(i + 1)}`, kind: 'ch', label: `Ch ${two(i + 1)}` })),
];
export const isStrip = (id: unknown): id is string => typeof id === 'string' && X32_STRIPS.some((s) => s.id === id);

/** OSC address of a strip's mute switch (1 = on, 0 = muted) and fader (0–1). */
export function stripAddress(id: string, what: 'on' | 'fader' | 'name'): string {
  if (what === 'name') return id === 'main/st' ? '' : `/${id}/config/name`;
  return id.startsWith('dca/') ? `/${id}/${what}` : `/${id}/mix/${what}`;
}
export const SCENE_ADDRESS = '/-action/goscene';
export const CURRENT_SCENE = '/-show/prepos/current';
export const sceneNameAddress = (n: number) => `/-show/showfile/scene/${String(n).padStart(3, '0')}/name`;

/** “Ch 05 · 설교자” — the scribble-strip name read from the mixer when it has one. */
export function stripName(id: string, values: X32Values): string {
  const strip = X32_STRIPS.find((s) => s.id === id);
  const label = strip?.label ?? id;
  const name = strip && strip.kind !== 'main' ? values[stripAddress(id, 'name')] : undefined;
  return typeof name === 'string' && name.trim() ? `${label} · ${name.trim()}` : label;
}

export function sceneName(n: number, values: X32Values): string {
  const name = values[sceneNameAddress(n)];
  return typeof name === 'string' && name.trim() ? `${two(n)} · ${name.trim()}` : two(n);
}

/** X32 fader position (0–1) → dB, as the console shows it (−∞ at the bottom, +10 at the top). */
export function faderToDb(f: number): number {
  if (f <= 0) return -Infinity;
  if (f >= 0.5) return f * 40 - 30;
  if (f >= 0.25) return f * 80 - 50;
  if (f >= 0.0625) return f * 160 - 70;
  return f * 480 - 90;
}

/** dB → X32 fader position, on the console's 1024 steps. */
export function dbToFader(db: number): number {
  const f = db <= -90 ? 0 : db < -60 ? (db + 90) / 480 : db < -30 ? (db + 70) / 160 : db < -10 ? (db + 50) / 80 : (db + 30) / 40;
  return Math.round(Math.min(1, Math.max(0, f)) * 1023) / 1023;
}

export function formatDb(f: number): string {
  const db = faderToDb(f);
  if (!Number.isFinite(db) || db <= -89.5) return '−∞ dB';
  const r = Math.round(db * 10) / 10;
  return `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r).toFixed(1)} dB`;
}

/** The OSC change a step makes, or null when the step is incomplete. */
export function x32Message(step: X32Step): { address: string; value: number } | null {
  if (step.action === 'scene') return Number.isInteger(step.scene) && step.scene >= 0 && step.scene <= 99 ? { address: SCENE_ADDRESS, value: step.scene } : null;
  if (!isStrip(step.strip)) return null;
  if (step.action === 'fader') return typeof step.value === 'number' && step.value >= 0 && step.value <= 1 ? { address: stripAddress(step.strip, 'fader'), value: step.value } : null;
  return { address: stripAddress(step.strip, 'on'), value: step.action === 'mute' ? 0 : 1 };
}

export function describeX32Step(step: X32Step, values: X32Values = {}): string {
  if (step.action === 'scene') return `X32 장면 불러오기 ${sceneName(step.scene, values)}`;
  const name = stripName(step.strip, values);
  if (step.action === 'fader') return `X32 ${name} 페이더 ${formatDb(step.value ?? 0)}`;
  return `X32 ${name} ${step.action === 'mute' ? '뮤트' : '뮤트 해제'}`;
}

export interface X32Settings {
  on: boolean;
  /** The mixer's address (X32 SETUP → network). */
  ip: string;
}

const KEY = 'freecast.x32';
/** 0.7.3 kept the X32 address with the (now removed) MIDI settings. */
const OLD_KEY = 'freecast.midi.v2';

export function normalizeX32Settings(value: unknown): X32Settings {
  const v = (value && typeof value === 'object' ? value : {}) as Partial<X32Settings>;
  return { on: v.on === true, ip: typeof v.ip === 'string' ? v.ip.trim().slice(0, 15) : '' };
}

/** Saved per computer: the mixer is on this church's network, not part of the shared library. */
export function loadX32Settings(): X32Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normalizeX32Settings(JSON.parse(raw));
    const old = JSON.parse(localStorage.getItem(OLD_KEY) ?? 'null') as { enabled?: boolean; network?: X32Settings } | null;
    return normalizeX32Settings(old?.network ? { ...old.network, on: old.network.on === true && old.enabled === true } : null);
  } catch {
    return normalizeX32Settings(null);
  }
}

export function saveX32Settings(s: X32Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage full or blocked: the setting lasts until FreeCast is closed */
  }
}
