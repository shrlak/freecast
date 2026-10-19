// Swaps the 공동체 고백송 printed in the church Back deck for another song, the way the
// shrlak/ppt program rewrites back-slides.pptx (confessionSlides.ts there):
//
// The block is found by content: the first slide that says "공동체 고백" is the marker and
// prints the song's name in quotes; the lyric slides right after it are the ones that still
// carry that name (in their corner title). The marker gets the new name, and the new song's
// lyric slides are copies of the block's own first lyric slide, so the design stays exactly.
import type { Presentation, Slide, SlideElement } from '../types';
import { sequence } from '../arrangement';
import { stripChords } from '../lyrics';
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

/** The song's lyrics as sections of lines, in play order (repeats kept, chords and Title slide left out). */
export function songSections(song: Presentation): string[][] {
  const sections: { group: string; lines: string[] }[] = [];
  for (const { slide } of sequence(song)) {
    if (slide.group === 'Title' || slide.disabled) continue;
    const lines = stripChords(slide.text).split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;
    const last = sections[sections.length - 1];
    if (last && last.group === slide.group) last.lines.push(...lines);
    else sections.push({ group: slide.group, lines });
  }
  return sections.map((s) => s.lines);
}

/** Split a section into slides of at most `max` lines, as evenly as possible. */
function chunk(lines: string[], max: number): string[][] {
  const count = Math.ceil(lines.length / max);
  const size = Math.ceil(lines.length / count);
  const out: string[][] = [];
  for (let i = 0; i < lines.length; i += size) out.push(lines.slice(i, i + size));
  return out;
}

const replaceTitle = (text: string, from: string, to: string) => (norm(text) === norm(from) ? to : text.split(from).join(to));

/**
 * The Back deck with its 공동체 고백송 replaced by `song`; null when the deck has no
 * recognisable block or the song has no lyrics. A deck that already prints the song comes back as is.
 */
export function applyConfessionSong(back: Slide[], song: Presentation): Slide[] | null {
  const block = findConfessionBlock(back);
  if (!block || !block.lyrics.length) return null;
  if (norm(block.title) === norm(song.title)) return back;
  const sections = songSections(song);
  if (!sections.length) return null;

  const design = back[block.lyrics[0]];
  const key = norm(block.title);
  const titleBox = textEls(design).find((e) => norm(e.text ?? '').includes(key));
  const lyricBox = textEls(design)
    .filter((e) => e !== titleBox)
    .sort((a, b) => b.w * b.h - a.w * a.h)[0];
  if (!lyricBox) return null;
  const linesOf = (s: Slide) => {
    const box: SlideElement | undefined = textEls(s).filter((e) => !norm(e.text ?? '').includes(key)).sort((a, b) => b.w * b.h - a.w * a.h)[0];
    return (box?.text ?? '').split('\n').filter((l) => l.trim()).length;
  };
  const max = Math.max(2, ...block.lyrics.map((i) => linesOf(back[i])));

  const marker = fillSlide(back[block.marker], (t) => replaceTitle(t, block.title, song.title));
  const lyrics = sections.flatMap((lines) => chunk(lines, max)).map((lines) =>
    fillSlide(design, (t, el) => (el.id === lyricBox.id ? lines.join('\n') : el.id === titleBox?.id ? replaceTitle(t, block.title, song.title) : t), { group: '공동체 고백송' }),
  );
  const end = block.lyrics[block.lyrics.length - 1] + 1;
  return [...back.slice(0, block.marker), { ...marker, group: '공동체 고백송' }, ...lyrics, ...back.slice(end)];
}
