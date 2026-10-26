export interface PastorOptions {
  /** Text size multiplier (0.6 – 2). */
  scale: number;
  current: boolean;
  next: boolean;
  notes: boolean;
  preview: boolean;
  chords: boolean;
  clock: boolean;
}

export const PASTOR_OPTIONS_KEY = 'freecast.pastor.options';
export const DEFAULT_PASTOR_OPTIONS: PastorOptions = { scale: 1, current: true, next: true, notes: true, preview: false, chords: true, clock: true };

const FLAGS = ['current', 'next', 'notes', 'preview', 'chords', 'clock'] as const;

/** What the pastor's tablet shows, as remembered on that tablet; anything missing or wrong falls back to the default. */
export function loadPastorOptions(): PastorOptions {
  try {
    const saved = JSON.parse(localStorage.getItem(PASTOR_OPTIONS_KEY) ?? 'null') as Record<string, unknown> | null;
    const scale = Number(saved?.scale);
    const options = { ...DEFAULT_PASTOR_OPTIONS, scale: Number.isFinite(scale) && saved?.scale !== null ? Math.min(2, Math.max(0.6, scale)) : 1 };
    for (const key of FLAGS) if (typeof saved?.[key] === 'boolean') options[key] = saved[key] as boolean;
    return options;
  } catch {
    return DEFAULT_PASTOR_OPTIONS;
  }
}

export function savePastorOptions(options: PastorOptions) {
  try { localStorage.setItem(PASTOR_OPTIONS_KEY, JSON.stringify(options)); } catch { /* kept for this session */ }
}
