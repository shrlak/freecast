import type { Presentation, Slide } from '../types';
import { uid } from '../lyrics';
import { expandCode, groupsOf } from '../arrangement';
import { planSectionSlides } from './slidePlanner';
import { centerSongLyrics } from '../songCentering';

export interface SongSection {
  /** Code or name as printed: "V1", "C", "Bridge". */
  label: string;
  lines: string[];
}

/** A song as read from a 콘티, a notice, a lyrics file or the AI. */
export interface SongDraft {
  title: string;
  key?: string;
  sections: SongSection[];
  /** Play order as group codes/names, e.g. ["I","V1","C","V2","C","B","C"]. */
  progression?: string[];
  /** Existing library presentation to reuse instead of creating one. */
  presentationId?: string;
  englishTitle?: string;
  postSermon?: boolean;
  pages?: number[];
}

/** Title comparison that ignores spacing, punctuation and case (주님의 은혜 ≈ 주님의은혜!). */
export function titleKey(title: string): string {
  return title.toLowerCase().replace(/\([^)]*\)|\[[^\]]*\]/g, '').replace(/[^\p{L}\p{N}]/gu, '');
}

export function findSong(presentations: Presentation[], title: string): Presentation | undefined {
  const k = titleKey(title);
  if (!k) return undefined;
  return presentations.find((p) => titleKey(p.title) === k);
}

function uniqueGroupNames(sections: SongSection[]): string[] {
  const names = sections.map((s) => expandCode(s.label));
  const counts = new Map<string, number>();
  for (const n of names) counts.set(n, (counts.get(n) ?? 0) + 1);
  const seen = new Map<string, number>();
  return names.map((n) => {
    if ((counts.get(n) ?? 0) < 2 || /\d$/.test(n)) return n;
    const i = (seen.get(n) ?? 0) + 1;
    seen.set(n, i);
    return `${n} ${i}`;
  });
}

/**
 * A part's lines split into slides of at most `max` lines, as evenly as possible
 * (6 lines with max 4 → 3 + 3, not 4 + 2).
 */
export function splitEvenly(lines: string[], max: number): string[][] {
  const per = Math.max(1, max);
  if (!lines.length) return [];
  const count = Math.ceil(lines.length / per);
  const out: string[][] = [];
  let at = 0;
  for (let k = 0; k < count; k++) {
    const size = Math.ceil((lines.length - at) / (count - k));
    out.push(lines.slice(at, at + size));
    at += size;
  }
  return out;
}

/**
 * A song as slides, laid out as the church's PPT does (slidePlanner.ts): each part once, in the
 * order its 진행 first names it, blank lines as breaks, up to `linesPerSlide` lines per slide.
 * The 진행 itself is kept (meta.order, and an arrangement the operator can switch on for repeats).
 */
export function songToPresentation(song: SongDraft, opts: { themeId: string; linesPerSlide: number; folder?: string }): Presentation {
  const parts = planSectionSlides(song.sections, song.progression, opts.linesPerSlide);
  const groups = uniqueGroupNames(parts.map((p) => p.section));
  const slides: Slide[] = parts.flatMap((part, i) => part.slides.map((lines) => ({ id: uid('s'), group: groups[i], text: lines.join('\n') })));
  const meta = song.key || song.progression?.length ? { key: song.key || undefined, order: song.progression?.length ? song.progression : undefined } : undefined;
  const p: Presentation = {
    id: uid('p'),
    title: song.title,
    slides,
    themeId: opts.themeId,
    folder: opts.folder ?? 'Songs',
    meta,
    lyricsLayout: { linesPerSlide: opts.linesPerSlide },
  };
  const order = song.progression?.map(expandCode).filter((g) => groups.includes(g) || groups.some((x) => x.startsWith(`${g} `)));
  if (order && order.length) {
    // "Verse" in a progression with numbered verses in the sheet means the next unused verse.
    const resolved: string[] = [];
    const used = new Map<string, number>();
    for (const g of order) {
      if (groups.includes(g)) resolved.push(g);
      else {
        const options = groups.filter((x) => x.startsWith(`${g} `));
        const n = used.get(g) ?? 0;
        resolved.push(options[Math.min(n, options.length - 1)]);
        used.set(g, n + 1);
      }
    }
    // The slides are each part once; the 진행 plays them in order with the repeats.
    p.arrangements = [{ id: uid('arr'), name: song.progression!.join('-'), groups: resolved }];
    p.arrangementId = p.arrangements[0].id;
  }
  return centerSongLyrics(p);
}

/** Apply a progression to an existing library song as a new (active) arrangement. */
export function withProgression(p: Presentation, progression: string[]): Presentation {
  const groups = groupsOf(p);
  const resolved = progression.map(expandCode).flatMap((g) => (groups.includes(g) ? [g] : groups.filter((x) => x.startsWith(`${g} `)).slice(0, 1)));
  if (!resolved.length) return p;
  const arr = { id: uid('arr'), name: progression.join('-'), groups: resolved };
  return { ...p, arrangements: [...(p.arrangements ?? []), arr], arrangementId: arr.id };
}

/**
 * Read a lyrics Markdown file: "# Title", then "## Verse (`V`)" sections with lyric lines.
 * Bulleted notes and quotes before the first section are ignored.
 */
export function parseLyricsMarkdown(md: string, fallbackTitle: string): SongDraft {
  let title = fallbackTitle;
  const sections: SongSection[] = [];
  for (const raw of md.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    const h1 = /^#\s+(.+)$/.exec(line);
    if (h1) {
      title = h1[1].trim();
      continue;
    }
    const h2 = /^##+\s+(.+?)\s*(?:\(`?([^`)]+)`?\))?\s*$/.exec(line);
    if (h2) {
      sections.push({ label: h2[1].trim() || h2[2] || 'Verse', lines: [] });
      continue;
    }
    if (!sections.length || !line || /^[-*>]/.test(line)) continue;
    sections[sections.length - 1].lines.push(line.replace(/\s{2,}$/, ''));
  }
  return { title, sections };
}
