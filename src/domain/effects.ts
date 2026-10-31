// Side effects that macros and slide actions trigger outside the app: DMX lighting.
import type { MacroStep } from './types';

const DMX_KEY = 'freecast.dmx';
export function dmxSettings(): { ip: string } {
  try {
    return { ip: '255.255.255.255', ...JSON.parse(localStorage.getItem(DMX_KEY) ?? '{}') };
  } catch {
    return { ip: '255.255.255.255' };
  }
}
export const saveDmxSettings = (s: { ip: string }) => localStorage.setItem(DMX_KEY, JSON.stringify(s));

export function sendDmx(universe: number, channels: Record<string, number>) {
  return fetch('/api/dmx', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ip: dmxSettings().ip, universe, channels }),
  }).catch(() => undefined);
}

/** Run the external part of a step (no-op for steps the reducer handles). */
export function runExternal(step: MacroStep) {
  if (step.type === 'dmx') sendDmx(step.universe, step.channels);
}

/** "1=255, 2=128" → { "1": 255, "2": 128 } */
export function parseChannels(text: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const part of text.split(/[,\s]+/)) {
    const m = /^(\d{1,3})\s*[=:]\s*(\d{1,3})$/.exec(part.trim());
    if (m && +m[1] >= 1 && +m[1] <= 512) out[m[1]] = Math.min(255, +m[2]);
  }
  return out;
}
