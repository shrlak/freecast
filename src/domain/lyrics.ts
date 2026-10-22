import type { Slide } from './types';

let counter = 0;
export function uid(prefix = 'id'): string {
  counter = (counter + 1) % 1e6;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

const SECTION_WORDS =
  'verse|chorus|pre-chorus|prechorus|bridge|tag|intro|outro|ending|refrain|interlude|vamp|slide';
const HEADER = new RegExp(`^(?:\\[(.+?)\\]|((?:${SECTION_WORDS})(?:\\s*\\d+)?)\\s*:?)$`, 'i');

function titleCase(s: string): string {
  return s.replace(/\s+/g, ' ').replace(/\b([a-z])/g, (c) => c.toUpperCase());
}

export interface ParseOptions {
  /** Split stanzas longer than this many lines into several slides (0 = never). */
  maxLines?: number;
}

/**
 * Turn plain lyrics into slides. Blank lines separate slides; a line such as
 * `[Verse 1]`, `Chorus` or `Bridge:` starts a new group.
 */
export function parseLyrics(text: string, opts: ParseOptions = {}): Slide[] {
  const maxLines = Math.max(0, Math.floor(opts.maxLines ?? 0));
  const slides: Slide[] = [];
  let group = '';
  let buf: string[] = [];

  const flush = () => {
    if (!buf.length) return;
    const size = maxLines > 0 ? maxLines : buf.length;
    for (let i = 0; i < buf.length; i += size) {
      slides.push({ id: uid('s'), group, text: buf.slice(i, i + size).join('\n') });
    }
    buf = [];
  };

  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    const header = HEADER.exec(line);
    if (header) {
      flush();
      group = header[1] !== undefined ? header[1].trim() : titleCase(header[2]);
      continue;
    }
    if (!line) {
      flush();
      continue;
    }
    buf.push(line);
  }
  flush();
  return slides;
}

/** Inverse of parseLyrics, used to load slides back into the editor. */
export function serializeLyrics(slides: Slide[]): string {
  const out: string[] = [];
  let group: string | null = null;
  for (const s of slides) {
    if (s.group !== group && s.group) out.push(`[${s.group}]`);
    group = s.group;
    out.push(s.text, '');
  }
  return out.join('\n').trim();
}

const GROUP_COLORS: [RegExp, string][] = [
  [/^pre-?chorus/i, '#f59e0b'],
  [/^chorus|^refrain/i, '#ef4444'],
  [/^verse/i, '#3b82f6'],
  [/^bridge/i, '#a855f7'],
  [/^tag|^ending|^outro/i, '#22c55e'],
  [/^intro|^interlude|^vamp/i, '#64748b'],
];

export function groupColor(group: string): string {
  for (const [re, color] of GROUP_COLORS) if (re.test(group)) return color;
  return group ? '#0ea5e9' : '#475569';
}

// ---------- chords ----------
// Chords are written inline in ChordPro style: "[G]Amazing [C]grace". The audience never
// sees them; the stage display shows them above the lyrics.
const CHORD = /\[([A-G][#b]?(?:m|maj|min|dim|aug|sus|add)?\d*(?:\/[A-G][#b]?)?)\]/g;

export const hasChords = (text: string) => new RegExp(CHORD.source).test(text);
export const stripChords = (text: string) => text.replace(CHORD, '').replace(/ {2,}/g, ' ');

/** Split a line into chord row + lyric row, aligned by character position. */
export function chordRows(line: string): { chords: string; lyric: string } {
  let chords = '';
  let lyric = '';
  let last = 0;
  for (const m of line.matchAll(CHORD)) {
    lyric += line.slice(last, m.index);
    chords = chords.padEnd(lyric.length, ' ') + m[1] + ' ';
    last = m.index! + m[0].length;
  }
  lyric += line.slice(last);
  return { chords: chords.trimEnd(), lyric };
}

/** An empty slide on a plain white background (what Enter adds in the editor). */
export function blankSlide(group = 'Slide'): Slide {
  return { id: uid('s'), group, text: '', background: { kind: 'color', value: '#ffffff' }, style: { color: '#000000' } };
}
