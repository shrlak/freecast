// A chord sheet's songs as slides, and telling a chord-sheet 콘티 apart
// (shrlak/ppt src/lib/utils/chordSheet.ts, split for size).
import type { Section, Song } from './types';
import type { ChordSheetPart, ChordSheetSong } from './chordSheet';
import { KEY_LINE } from './chordText';
/** One projected slide of a sheet song: its Korean and the English under it. */
export interface SheetSlide {
  ko: string[];
  en: string[];
}

/** At most this many Korean lines — and English lines — on a bilingual slide. */
const BILINGUAL_KO_LINES = 3;
const BILINGUAL_EN_LINES = 4;
/** A part in one language is split like the Sunday deck splits it. */
const SINGLE_LANGUAGE_LINES = 4;

/** `count` groups as equal in size as possible, the longer ones first. */
function splitInto<T>(items: T[], count: number): T[][] {
  const groups: T[][] = [];
  let start = 0;
  for (let index = 0; index < count; index++) {
    const size = Math.floor(items.length / count) + (index < items.length % count ? 1 : 0);
    groups.push(items.slice(start, start + size));
    start += size;
  }
  return groups.filter((group) => group.length > 0);
}

/** How much of a line there is to read — letters, not spaces or marks. */
function weight(line: string): number {
  return Math.max(1, line.replace(/[^\p{L}\p{N}]/gu, '').length);
}

/**
 * Cut `lines` into as many groups as `fractions` has cut points, each cut at
 * the line boundary nearest that fraction of the text — so the second
 * language follows the first by how far into the part it has read, not by
 * line count (a Korean translation is often written in more, shorter lines).
 */
function cutAtFractions(lines: string[], fractions: number[]): string[][] {
  const total = lines.reduce((sum, line) => sum + weight(line), 0);
  const cumulative: number[] = [];
  lines.reduce((sum, line) => {
    cumulative.push((sum + weight(line)) / total);
    return sum + weight(line);
  }, 0);
  const groups: string[][] = [];
  let start = 0;
  fractions.forEach((fraction, index) => {
    const remaining = fractions.length - index;
    if (start >= lines.length) {
      groups.push([]);
      return;
    }
    let best = start + 1;
    for (let end = start + 1; end <= lines.length - remaining; end++) {
      if (Math.abs(cumulative[end - 1] - fraction) < Math.abs(cumulative[best - 1] - fraction)) best = end;
    }
    groups.push(lines.slice(start, best));
    start = best;
  });
  groups.push(lines.slice(start));
  return groups;
}

/**
 * The slides a part is projected on. A part in both languages keeps each
 * slide's English with its Korean: the English is split evenly and the Korean
 * cut where it has said as much — so 4 Korean lines over 8 English lines
 * become two slides of 2 + 4, as last year's deck set 주 하나님 지으신 모든 세계.
 */
export function slidesOfPart(part: Pick<ChordSheetPart, 'ko' | 'en'>): SheetSlide[] {
  const { ko, en } = part;
  if (ko.length === 0 || en.length === 0) {
    const lines = ko.length > 0 ? ko : en;
    return splitInto(lines, Math.ceil(lines.length / SINGLE_LANGUAGE_LINES)).map((group) =>
      ko.length > 0 ? { ko: group, en: [] } : { ko: [], en: group },
    );
  }
  const count = Math.min(
    ko.length,
    Math.max(Math.ceil(ko.length / BILINGUAL_KO_LINES), Math.ceil(en.length / BILINGUAL_EN_LINES)),
  );
  // The English leads when it can fill every slide; otherwise the Korean does.
  const englishLeads = en.length >= count;
  const lead = splitInto(englishLeads ? en : ko, count);
  const leadTotal = lead.flat().reduce((sum, line) => sum + weight(line), 0);
  const fractions: number[] = [];
  lead.slice(0, -1).reduce((sum, group) => {
    const next = sum + group.reduce((groupSum, line) => groupSum + weight(line), 0);
    fractions.push(next / leadTotal);
    return next;
  }, 0);
  const follow = cutAtFractions(englishLeads ? ko : en, fractions);
  return lead.map((group, index) =>
    englishLeads ? { ko: follow[index] ?? [], en: group } : { ko: group, en: follow[index] ?? [] },
  );
}

/** True when the sheet prints the song in both languages. */
export function isBilingualSheetSong(sheet: ChordSheetSong): boolean {
  return sheet.parts.some((part) => part.ko.length > 0) && sheet.parts.some((part) => part.en.length > 0);
}

export interface SheetSongOptions {
  id: string;
  /** Lines per slide for a song sung in one language. */
  linesPerSlide: number;
  /**
   * Split a bilingual song into slides that keep each part's English with its
   * Korean (the 찬양집회 deck). Otherwise only the Korean is kept — or the
   * English, for a part or a song written only in English.
   */
  bilingual: boolean;
}

/**
 * A sheet song as the lyric editor's Song, plus the slides it will be
 * projected on. For a bilingual deck every slide is its own blank-line block,
 * so the planner splits the Korean exactly where the English was divided.
 */
export function songFromChordSheet(
  sheet: ChordSheetSong,
  options: SheetSongOptions,
): { song: Song; slides: SheetSlide[] } {
  const bilingual = options.bilingual && isBilingualSheetSong(sheet);
  const slides: SheetSlide[] = [];
  const sections: Section[] = [];
  let longest = 0;
  for (const part of sheet.parts) {
    if (bilingual) {
      const partSlides = slidesOfPart(part);
      slides.push(...partSlides);
      const blocks = partSlides.map((slide) => (slide.ko.length > 0 ? slide.ko : slide.en));
      longest = Math.max(longest, ...blocks.map((block) => block.length));
      sections.push({ label: part.label, lines: blocks.flatMap((block, index) => (index > 0 ? ['', ...block] : block)) });
    } else {
      const lines = part.ko.length > 0 ? part.ko : part.en;
      if (lines.length === 0) continue;
      sections.push({ label: part.label, lines: [...lines] });
      slides.push({ ko: part.ko.length > 0 ? [...lines] : [], en: part.ko.length > 0 ? [] : [...lines] });
    }
  }
  return {
    song: {
      id: options.id,
      title: sheet.title,
      ...(sheet.key ? { key: sheet.key } : {}),
      sections,
      order: sections.map((section) => section.label),
      linesPerSlide: bilingual ? Math.max(options.linesPerSlide, longest) : Math.max(options.linesPerSlide, SINGLE_LANGUAGE_LINES),
      ...(sheet.pages.length > 0 ? { pageIndex: sheet.pages[0] } : {}),
      verification: 'draft',
    },
    slides,
  };
}

/** Does a page's text look like a chord sheet's (a `Key - D | Time` line)? */
export function looksLikeChordSheetText(text: string): boolean {
  return text.split(/\r?\n/).some((line) => KEY_LINE.test(line.trim())) && /CCLI|ChordPro|SongSelect/i.test(text);
}

/**
 * Is the whole PDF a chord sheet, every song's lyrics in its text?
 *
 * A conti can carry a SongSelect sheet or two among scanned 악보: the night's
 * other songs are pictures, with no text layer at all. Reading that PDF as a
 * chord sheet would keep only the sheets' songs and drop every scanned one,
 * so it is read as an ordinary conti instead — its cover lists every song,
 * and each 악보 page is recognized, the SongSelect pages included.
 * `musicPages` are the 1-based pages past the cover (see classifyPages).
 */
export function isChordSheetConti(pageTexts: string[], musicPages: number[]): boolean {
  if (!looksLikeChordSheetText(pageTexts.join('\n'))) return false;
  return musicPages.every((page) => /\p{L}/u.test(pageTexts[page - 1] ?? ''));
}
