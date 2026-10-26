// Chord and key sheets: a song's key and BPM, its chords moved to another key (with a capo), the same
// chart in Nashville numbers, and a printable packet for the band. Chords are the inline [G] marks
// already used on the stage display.
import type { Presentation } from './types';
import { sequence } from './arrangement';
import { hasChords } from './lyrics';

// ---------- keys
const SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const ROOT = /^([A-G])([#b♯♭]?)/;
/** Keys whose notes are spelled with flats (F, Bb, Eb … and Dm, Gm, Cm …). */
const FLAT_MAJOR = new Set([5, 10, 3, 8, 1, 6]);
const FLAT_MINOR = new Set([2, 7, 0, 5, 10, 3]);
/** The keys as a chart names them. */
const MAJOR_KEYS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const MINOR_KEYS = ['Cm', 'C#m', 'Dm', 'Ebm', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'Bbm', 'Bm'];

export interface KeyInfo { root: number; minor: boolean }

function rootIndex(letter: string, accidental: string): number {
  const base = SHARPS.indexOf(letter);
  const shift = accidental === '#' || accidental === '♯' ? 1 : accidental === 'b' || accidental === '♭' ? -1 : 0;
  return (base + shift + 12) % 12;
}

/** "G", "Am", "F#m", "Bb", "Ebm" → its root and whether it is minor; null for anything else. */
export function parseKey(key: string | null | undefined): KeyInfo | null {
  const m = /^\s*([A-G])([#b♯♭]?)\s*(m|min|minor|-)?\s*$/.exec(key ?? '');
  return m ? { root: rootIndex(m[1], m[2]), minor: !!m[3] } : null;
}

export const keyName = (k: KeyInfo): string => (k.minor ? MINOR_KEYS : MAJOR_KEYS)[k.root];
export const keyChoices = (minor: boolean): string[] => (minor ? MINOR_KEYS : MAJOR_KEYS);
const prefersFlat = (k: KeyInfo | null) => !!k && (k.minor ? FLAT_MINOR : FLAT_MAJOR).has(k.root);

/** Semitones from key `from` up to key `to`, the short way round (−5 … +6). */
export function keyShift(from: string, to: string): number | null {
  const a = parseKey(from), b = parseKey(to);
  if (!a || !b) return null;
  const up = (b.root - a.root + 12) % 12;
  return up > 6 ? up - 12 : up;
}

export function shiftKey(key: string, semitones: number): string | null {
  const k = parseKey(key);
  return k ? keyName({ root: (k.root + semitones + 1200) % 12, minor: k.minor }) : null;
}

// ---------- chords
const CHORD_MARK = /\[([A-G][#b]?(?:m|maj|min|dim|aug|sus|add)?\d*(?:\/[A-G][#b]?)?)\]/g;

/** One chord moved by `semitones`, spelled with flats or sharps as asked (default: as the chord was written). */
export function shiftChord(chord: string, semitones: number, flats?: boolean): string {
  const by = ((semitones % 12) + 12) % 12;
  return chord.replace(/[A-G][#b]?/g, (note) => {
    const i = rootIndex(note[0], note.slice(1));
    const useFlats = flats ?? note.endsWith('b');
    return (useFlats ? FLATS : SHARPS)[(i + by) % 12];
  });
}

/** The first chord's key guess: its root, minor when the chord is. */
function keyOfChord(chord: string): KeyInfo | null {
  const m = /^([A-G])([#b]?)(m(?!aj)|min)?/.exec(chord);
  return m ? { root: rootIndex(m[1], m[2]), minor: !!m[3] } : null;
}

/** Every chord of the song in the order it is played. */
export function songChords(pres: Presentation): string[] {
  return sequence(pres).flatMap(({ slide }) => [...slide.text.matchAll(CHORD_MARK)].map((m) => m[1]));
}

export const hasSongChords = (pres: Presentation) => pres.slides.some((s) => hasChords(s.text));

/** The key written on the song, else the key its first chord suggests. */
export function songKey(pres: Presentation): string | null {
  const written = parseKey(pres.meta?.key);
  if (written) return keyName(written);
  const first = songChords(pres)[0];
  const guess = first ? keyOfChord(first) : null;
  return guess ? keyName(guess) : null;
}

/** The key the team plays in: the song's `playKey`, else the key it is written in. */
export const playKeyOf = (pres: Presentation): string | null => {
  const play = parseKey(pres.meta?.playKey);
  return play ? keyName(play) : songKey(pres);
};

/** Stage shift (semitones) and capo that show the chords for the song's playKey; null when it has none set. */
export function stageSettingsFor(pres: Presentation): { shift: number; capo: number } | null {
  const written = songKey(pres);
  const play = parseKey(pres.meta?.playKey);
  const capo = Math.min(11, Math.max(0, Math.round(pres.meta?.capo ?? 0)));
  if (!play && !capo) return null;
  const shift = play && written ? keyShift(written, keyName(play)) ?? 0 : 0;
  return { shift, capo };
}

/** Capo positions with the key the player's hands are in; `easy` ones are open-chord keys. */
export function capoOptions(soundingKey: string): { capo: number; shape: string; easy: boolean }[] {
  const k = parseKey(soundingKey);
  if (!k) return [];
  const easyMajor = new Set(['C', 'D', 'E', 'G', 'A']), easyMinor = new Set(['Am', 'Em', 'Dm']);
  return Array.from({ length: 8 }, (_, capo) => {
    const shape = keyName({ root: (k.root - capo + 12) % 12, minor: k.minor });
    return { capo, shape, easy: (k.minor ? easyMinor : easyMajor).has(shape) };
  });
}

// ---------- Nashville numbers
const DEGREES = ['1', 'b2', '2', 'b3', '3', '4', 'b5', '5', 'b6', '6', 'b7', '7'];

/** G in the key of G → "1", Am → "6m", D/F# → "5/#4"; in a minor key the numbers count from its relative major. */
export function toNashville(chord: string, key: string): string {
  const k = parseKey(key);
  if (!k) return chord;
  const tonic = k.minor ? (k.root + 3) % 12 : k.root;
  const number = (note: string) => DEGREES[(rootIndex(note[0], note.slice(1)) - tonic + 12) % 12];
  const [main, bass] = chord.split('/');
  const m = ROOT.exec(main);
  if (!m) return chord;
  const rest = main.slice(m[0].length);
  return `${number(m[0])}${rest}${bass && ROOT.test(bass) ? `/${number(bass)}` : ''}`;
}

// ---------- charts
export interface ChartSegment { chord: string; text: string }
export interface ChartLine { segments: ChartSegment[] }
export interface ChartSection { label: string; lines: ChartLine[] }

export interface ChartOptions {
  /** Semitones from the written key to the key played in. */
  shift?: number;
  capo?: number;
  /** Show Nashville numbers instead of chord names. */
  numbers?: boolean;
}

function segmentsOf(line: string, show: (chord: string) => string): ChartSegment[] {
  const segments: ChartSegment[] = [];
  let last = 0;
  let chord = '';
  for (const m of line.matchAll(CHORD_MARK)) {
    const text = line.slice(last, m.index);
    if (chord || text) segments.push({ chord, text });
    chord = show(m[1]);
    last = m.index! + m[0].length;
  }
  const text = line.slice(last);
  if (chord || text) segments.push({ chord, text });
  return segments;
}

/**
 * How a chord is written for the key played in: moved by `shift` and lowered by `capo` (the shapes the
 * hands play), spelled with flats or sharps to suit that key; or as a Nashville number.
 */
export function chordShower(writtenKey: string | null, shift: number, capo: number, numbers = false): (chord: string) => string {
  const written = parseKey(writtenKey);
  if (numbers && writtenKey) return (chord) => toNashville(chord, writtenKey);
  const shape = written ? { root: (written.root + shift - capo + 240) % 12, minor: written.minor } : null;
  const flats = shape ? prefersFlat(shape) : undefined;
  return (chord) => shiftChord(chord, shift - capo, flats);
}

/** The chord spelling the stage shows for what is live: the song's key moved by the operator's key change and capo. */
export const liveChordShower = (live: { songKey?: string | null; chordShift?: number; capo?: number }) =>
  chordShower(live.songKey ?? null, live.chordShift ?? 0, live.capo ?? 0);

/** A slide's text as chord-over-words lines (blank lines kept as empty ones), for the stage displays. */
export function stageLines(text: string, show: (chord: string) => string): ChartLine[] {
  return text.split('\n').map((l) => ({ segments: segmentsOf(l, show) }));
}

/** The song as sections of chord-over-lyric lines, in the order it is played, in the key and capo asked for. */
export function buildChart(pres: Presentation, opts: ChartOptions = {}): ChartSection[] {
  const show = chordShower(songKey(pres), opts.shift ?? 0, opts.capo ?? 0, opts.numbers);
  const sections: ChartSection[] = [];
  let previous: string | null = null;
  for (const { slide } of sequence(pres)) {
    if (slide.disabled) continue;
    const label = slide.group || slide.label || '';
    const lines = stageLines(slide.text, show).filter((l) => l.segments.length);
    if (!lines.length) continue;
    const same = sections.length > 0 && label === previous;
    if (same) sections[sections.length - 1].lines.push(...lines);
    else sections.push({ label, lines });
    previous = label;
  }
  return sections;
}

const padTo = (s: string, n: number) => s + ' '.repeat(Math.max(0, n - s.length));

/** The chart as plain text, chords on the line above the words (for copying into a message or document). */
export function chartText(sections: ChartSection[]): string {
  const out: string[] = [];
  for (const sec of sections) {
    if (sec.label) out.push(`[${sec.label}]`);
    for (const line of sec.lines) {
      let chords = '', words = '';
      for (const seg of line.segments) {
        const width = Math.max(seg.text.length, seg.chord.length + 1);
        chords = padTo(chords, words.length) + seg.chord;
        words = padTo(words + seg.text, words.length + width);
      }
      if (chords.trim()) out.push(chords.trimEnd());
      out.push(words.trimEnd());
    }
    out.push('');
  }
  return out.join('\n').trim();
}

// ---------- the band's packet
export interface PacketSong {
  title: string;
  /** Key as written, and the key played in. */
  key: string | null;
  playKey: string | null;
  bpm?: string;
  capo: number;
  numbers: boolean;
  sections: ChartSection[];
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** A print-ready page per song: title, key · BPM · capo, and the chords over the words. */
export function packetHtml(songs: PacketSong[], heading: string): string {
  const body = songs.map((s) => {
    const meta = [
      s.playKey ? `Key ${esc(s.playKey)}${s.key && s.key !== s.playKey ? ` (원래 ${esc(s.key)})` : ''}` : '',
      s.bpm ? `BPM ${esc(s.bpm)}` : '',
      s.capo ? `Capo ${s.capo}` : '',
      s.numbers ? '넘버링' : '',
    ].filter(Boolean).join(' · ');
    const sections = s.sections.map((sec) => `<section>${sec.label ? `<h3>${esc(sec.label)}</h3>` : ''}${sec.lines.map((line) =>
      `<div class="line">${line.segments.map((seg) => `<span class="seg"><span class="c">${esc(seg.chord) || '&nbsp;'}</span><span class="w">${esc(seg.text) || '&nbsp;'}</span></span>`).join('')}</div>`).join('')}</section>`).join('');
    return `<article><h2>${esc(s.title)}</h2><p class="meta">${meta}</p>${sections}</article>`;
  }).join('');
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(heading)}</title><style>
body{font-family:-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;margin:0;color:#111}
header{padding:10px 18px;border-bottom:2px solid #111;font-size:13px;color:#444}
article{padding:18px 22px;page-break-after:always;break-after:page}
article:last-child{page-break-after:auto;break-after:auto}
h2{margin:0;font-size:24px}.meta{margin:4px 0 14px;font-size:14px;font-weight:700;color:#1d4ed8}
h3{margin:14px 0 4px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#6b7280}
.line{display:flex;flex-wrap:wrap;align-items:flex-end;margin:0 0 2px}
.seg{display:inline-flex;flex-direction:column;padding-right:2px}
.c{font-weight:800;font-size:15px;color:#b91c1c;min-height:1.2em;white-space:pre}.w{font-size:17px;white-space:pre}
@media print{header{display:none}@page{margin:12mm}}
</style></head><body><header>${esc(heading)} — 인쇄하려면 Ctrl/⌘ + P</header>${body}</body></html>`;
}
