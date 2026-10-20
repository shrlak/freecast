// Swaps the 공동체 고백송 printed in the church Back deck for another song, the way the
// shrlak/ppt program rewrites back-slides.pptx (confessionSlides.ts there):
//
// The block is found by content: the first slide that says "공동체 고백" is the marker and
// prints the song's name in quotes; the lyric slides right after it are the ones that still
// carry that name (in their corner title). The marker gets the new name, and the new song's
// lyric slides are copies of the block's own first lyric slide, so the design stays exactly.
import type { Presentation, Slide, SlideElement } from '../types';
import { stripChords } from '../lyrics';
import { splitEvenly, titleKey } from '../sunday/songs';
import { DEFAULT_LINES_PER_SLIDE } from '../sunday/slidePlanner';
import { fillSlide } from './convert';

const MARKER = '공동체고백';
const QUOTED = /[“"'‘«「]([^"”'’»」\n]+)[”"'’»」]/;

const norm = (t: string) => t.replace(/\s+/g, '').toLowerCase();
const slideText = (s: Slide) => (s.elements ?? []).map((e) => e.text ?? '').join('\n');
const textEls = (s: Slide) => (s.elements ?? []).filter((e) => e.kind === 'text' && (e.text ?? '').trim());

export interface ConfessionBlock {
  marker: number;
  /** Indexes of the block's lyric slides. */
  lyrics: number[];
  /** The song name the deck prints now. */
  title: string;
}

export function findConfessionBlock(slides: Slide[]): ConfessionBlock | null {
  const marker = slides.findIndex((s) => norm(slideText(s)).includes(MARKER));
  if (marker < 0) return null;
  const title = QUOTED.exec(slideText(slides[marker]))?.[1]?.trim();
  if (!title) return null;
  const key = norm(title);
  const lyrics: number[] = [];
  for (let i = marker + 1; i < slides.length && norm(slideText(slides[i])).includes(key); i++) lyrics.push(i);
  return { marker, lyrics, title };
}

/**
 * The song's lyrics as sections of lines: every part, in slide order (chords, hidden slides and the
 * Title slide left out). The whole song is printed whatever 진행 the copy has selected — a 콘티's
 * order can name only some of its parts.
 */
export function songSections(song: Presentation): string[][] {
  const sections: { group: string; lines: string[] }[] = [];
  for (const slide of song.slides) {
    if (slide.group === 'Title' || slide.disabled) continue;
    const lines = stripChords(slide.text).split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;
    const last = sections[sections.length - 1];
    if (last && last.group === slide.group) last.lines.push(...lines);
    else sections.push({ group: slide.group, lines });
  }
  return sections.map((s) => s.lines);
}

/**
 * The song to print as the 공동체 고백송: the 찬양 라이브러리's own copy when there is one, else the
 * copy with the most lyrics — not whichever comes first, which can be a past service's copy.
 */
export function findConfessionSong(presentations: Presentation[], title: string): Presentation | undefined {
  const k = titleKey(title);
  if (!k) return undefined;
  const lineCount = (p: Presentation) => songSections(p).flat().length;
  const all = presentations.filter((p) => titleKey(p.title) === k && lineCount(p) > 0);
  return all.find((p) => p.online) ?? [...all].sort((a, b) => lineCount(b) - lineCount(a))[0];
}

const replaceTitle = (text: string, from: string, to: string) => (norm(text) === norm(from) ? to : text.split(from).join(to));

/**
 * The Back deck with its 공동체 고백송 replaced by all of `song`, each part split into slides of at
 * most `maxLines` lines; null when the deck has no recognisable block or the song has no lyrics.
 * A deck that already prints exactly these lyrics comes back as is.
 */
export function applyConfessionSong(back: Slide[], song: Presentation, maxLines = DEFAULT_LINES_PER_SLIDE): Slide[] | null {
  const block = findConfessionBlock(back);
  if (!block || !block.lyrics.length) return null;
  const sections = songSections(song);
  if (!sections.length) return null;

  const design = back[block.lyrics[0]];
  const key = norm(block.title);
  // The lyrics are the largest box; the corner title is another box naming the song (the lyrics
  // can name it too — a song often opens with its own title).
  const lyricBox = [...textEls(design)].sort((a, b) => b.w * b.h - a.w * a.h)[0];
  if (!lyricBox) return null;
  const titleBox = textEls(design).find((e) => e !== lyricBox && norm(e.text ?? '').includes(key));
  const chunks = sections.flatMap((lines) => splitEvenly(lines, maxLines));
  const lyricsOf = (s: Slide) => {
    const box: SlideElement | undefined = [...textEls(s)].sort((a, b) => b.w * b.h - a.w * a.h)[0];
    return (box?.text ?? '').split('\n').map((l) => l.trim()).filter(Boolean).join('\n');
  };
  const same = norm(block.title) === norm(song.title) && block.lyrics.length === chunks.length
    && block.lyrics.every((i, n) => lyricsOf(back[i]) === chunks[n].join('\n'));
  if (same) return back;

  const marker = fillSlide(back[block.marker], (t) => replaceTitle(t, block.title, song.title));
  const lyrics = chunks.map((lines) =>
    fillSlide(design, (t, el) => (el.id === lyricBox.id ? lines.join('\n') : el.id === titleBox?.id ? replaceTitle(t, block.title, song.title) : t), { group: '공동체 고백송' }),
  );
  const end = block.lyrics[block.lyrics.length - 1] + 1;
  return [...back.slice(0, block.marker), { ...marker, group: '공동체 고백송' }, ...lyrics, ...back.slice(end)];
}
