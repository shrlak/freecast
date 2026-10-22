import type { Library } from './types';
import { sequence } from './arrangement';
import { stripChords } from './lyrics';

export interface FoundSlide {
  presentationId: string;
  presentationTitle: string;
  slideId: string;
  /** Position in the presentation's play sequence (what live/go takes). */
  seq: number;
  group: string;
  /** The matching line of the slide. */
  snippet: string;
}

const norm = (s: string) => s.toLowerCase().replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();

/**
 * Slides whose text, title, subtext or presentation title contain every word of the query
 * (lyrics, scripture, announcements). Slides of the presentation whose title matches come first.
 */
export function findSlides(lib: Library, query: string, limit = 40): FoundSlide[] {
  const words = norm(query).split(' ').filter(Boolean);
  if (!words.length) return [];
  const hits: (FoundSlide & { score: number })[] = [];
  for (const p of lib.presentations) {
    const title = norm(p.title);
    sequence(p).forEach(({ slide }, seq) => {
      if (slide.disabled && !slide.text.trim()) return;
      const lines = [slide.title, ...stripChords(slide.text).split('\n'), ...(slide.subtext ?? '').split('\n')].filter((l): l is string => !!l?.trim());
      const body = norm(lines.join(' '));
      const all = `${title} ${body}`;
      if (!words.every((w) => all.includes(w))) return;
      const line = lines.find((l) => words.some((w) => norm(l).includes(w))) ?? lines[0] ?? '';
      const score = (words.every((w) => body.includes(w)) ? 2 : 0) + (norm(query) && body.includes(norm(query)) ? 3 : 0) + (words.every((w) => title.includes(w)) ? 1 : 0);
      if (!hits.some((h) => h.presentationId === p.id && h.slideId === slide.id)) {
        hits.push({ presentationId: p.id, presentationTitle: p.title, slideId: slide.id, seq, group: slide.group, snippet: line.trim(), score });
      }
    });
  }
  // Stable: best score first, library order otherwise.
  return hits.map((h, i) => ({ h, i })).sort((a, b) => b.h.score - a.h.score || a.i - b.i).slice(0, limit).map(({ h: { score: _s, ...rest } }) => rest);
}
