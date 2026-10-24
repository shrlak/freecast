import type { Presentation, Slide, SlideElement } from './types';
import { CANVAS_H, CANVAS_W } from './canvas';

const plain = (text: string) => text.replace(/\*\*/g, '').replace(/\s+/g, '').toLowerCase();
const words = (el: SlideElement) => el.paragraphs?.map((p) => p.text).join('\n') ?? el.text ?? '';
const area = (el: SlideElement) => el.w * el.h;

function lyricBoxes(slide: Slide, song: Presentation): SlideElement[] {
  const candidates = (slide.elements ?? []).filter((el) => el.kind === 'text' && words(el).trim() && el.role !== 'prayer');
  const marked = candidates.filter((el) => el.role === 'lyrics');
  if (marked.length) return marked;
  // A normal lyric slide keeps its small song-title/logo objects separate from slide.text.
  if (slide.text.trim() || slide.subtext?.trim()) {
    const body = new Set([plain(slide.text), plain(slide.subtext ?? '')].filter(Boolean));
    return candidates.filter((el) => body.has(plain(words(el))) && el.y + el.h / 2 > CANVAS_H * 0.2);
  }
  const body = candidates.filter((el) => {
    const header = el.y + el.h / 2 < CANVAS_H * 0.2;
    return !(header && (plain(words(el)) === plain(song.title) || (el.fontSize ?? 64) < 40));
  });
  const main = [...body].sort((a, b) => area(b) - area(a))[0];
  if (!main) return [];
  // Imported lyrics can use one box per language or line. Move that block together,
  // preserving the spacing between its boxes instead of stacking them on top of one another.
  return body.filter((el) => el === main || (area(el) >= area(main) * 0.35 && (el.fontSize ?? 64) >= (main.fontSize ?? 64) * 0.5));
}

/** One-time centering for saved songs and the default layout for newly created songs. */
export function centerSongLyrics(song: Presentation): Presentation {
  if (song.protected) return song;
  const knownSong = song.online || song.folder === 'Songs' || song.lyricsLayout || song.songSource || song.themeId === 'theme_tpl_lyrics';
  if (!knownSong || song.lyricsCentered) return song;
  const slides = song.slides.map((slide) => {
    if (slide.group === 'Title') return slide;
    const boxes = lyricBoxes(slide, song);
    const ids = new Set(boxes.map((el) => el.id));
    const top = boxes.length ? Math.min(...boxes.map((el) => el.y)) : 0;
    const bottom = boxes.length ? Math.max(...boxes.map((el) => el.y + el.h)) : 0;
    const dy = CANVAS_H / 2 - (top + bottom) / 2;
    return {
      ...slide, lyricBody: true, style: { ...slide.style, align: 'center' as const, vAlign: 'middle' as const, indent: 0 },
      elements: slide.elements?.map((el) => ids.has(el.id) ? {
        ...el, role: 'lyrics' as const, x: (CANVAS_W - el.w) / 2, y: el.y + dy,
        align: 'center' as const, vAlign: 'middle' as const, indent: 0,
        paragraphs: el.paragraphs?.map((p) => ({ ...p, align: 'center' as const })),
      } : el),
    };
  });
  return { ...song, slides, lyricsCentered: true };
}

/** New blank/imported lyric pages use the default without resetting existing individual edits. */
export function centerAddedLyricSlides(previous: Presentation, next: Presentation): Presentation {
  if (!previous.lyricsCentered) return centerSongLyrics(next);
  const existing = new Set(previous.slides.map((s) => s.id));
  const added = next.slides.filter((s) => !existing.has(s.id) && !s.lyricBody);
  if (!added.length) return next;
  const centered = centerSongLyrics({ ...next, slides: added, lyricsCentered: undefined });
  const byId = new Map(centered.slides.map((s) => [s.id, s]));
  return { ...next, slides: next.slides.map((s) => byId.get(s.id) ?? s) };
}
