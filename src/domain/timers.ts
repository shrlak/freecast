import type { Timer } from './types';

function targetToday(target: string, now: number): number {
  const [h, m] = target.split(':').map(Number);
  const d = new Date(now);
  d.setHours(h || 0, m || 0, 0, 0);
  return d.getTime();
}

function elapsed(t: Timer, now: number): number {
  return t.accumulatedMs + (t.running && t.startedAt != null ? now - t.startedAt : 0);
}

/** Milliseconds shown on the timer: remaining for countdowns (negative once over), elapsed otherwise. */
export function timerValue(t: Timer, now: number): number {
  switch (t.kind) {
    case 'countdown':
      return t.durationMs - elapsed(t, now);
    case 'countdownTo':
      return targetToday(t.target, now) - now;
    case 'elapsed':
      return elapsed(t, now);
  }
}

export function startTimer(t: Timer, now: number): Timer {
  return t.running ? t : { ...t, running: true, startedAt: now };
}

export function stopTimer(t: Timer, now: number): Timer {
  return t.running ? { ...t, running: false, startedAt: null, accumulatedMs: elapsed(t, now) } : t;
}

export function resetTimer(t: Timer): Timer {
  return { ...t, running: false, startedAt: null, accumulatedMs: 0 };
}

/** 1:05, -0:12, 1:02:03 */
export function formatClock(ms: number): string {
  const neg = ms < 0;
  const total = Math.floor(Math.abs(ms) / 1000) + (neg ? 0 : ms % 1000 > 0 ? 1 : 0);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const body = h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
  return neg ? `-${body}` : body;
}
