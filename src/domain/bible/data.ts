import type { BibleRef } from './refs';
import { fetchBibleFile } from '../online';

export interface Translation {
  id: string;
  name: string;
  language: 'ko' | 'en';
  /** File name in the server's bible-text/ folder. */
  file: string;
}

/** Every translation on the content server. Loaded on demand and kept in memory only. */
export const TRANSLATIONS: Translation[] = [
  { id: 'nkrv', name: '개역개정', language: 'ko', file: 'ko_nkrv.json' },
  { id: 'krv', name: '개역한글', language: 'ko', file: 'ko_ko.json' },
  { id: 'saenew', name: '새번역', language: 'ko', file: 'ko_saenew.json' },
  { id: 'easy', name: '쉬운성경', language: 'ko', file: 'ko_easy.json' },
  { id: 'hyun', name: '현대인의성경', language: 'ko', file: 'ko_hyun.json' },
  { id: 'esv', name: 'ESV', language: 'en', file: 'en_esv.json' },
  { id: 'niv', name: 'NIV', language: 'en', file: 'en_niv.json' },
  { id: 'nasb', name: 'NASB', language: 'en', file: 'en_nasb.json' },
  { id: 'kjv', name: 'KJV', language: 'en', file: 'en_kjv.json' },
];

/** Whole-Bible data: books[bookIndex].chapters[chapterIndex][verseIndex]. */
export type BibleText = string[][][];

export interface Verse {
  chapter: number;
  verse: number;
  endVerse?: number;
  text: string;
}

const cache = new Map<string, Promise<BibleText>>();

export function toText(raw: unknown): BibleText {
  if (!Array.isArray(raw) || raw.length !== 66) throw new Error('Expected a JSON array of 66 books');
  return raw.map((b, i) => {
    const chapters = (b as { chapters?: unknown }).chapters;
    if (!Array.isArray(chapters)) throw new Error(`Book ${i + 1} has no "chapters" array`);
    return chapters as string[][];
  });
}

/** Load a translation from the content server (once per session; memory only). */
export function loadTranslation(t: Translation): Promise<BibleText> {
  let p = cache.get(t.id);
  if (!p) {
    p = fetchBibleFile(t.file)
      .catch(() => {
        throw new Error(`Could not load ${t.name} from the server — check the internet connection.`);
      })
      .then(toText);
    p.catch(() => cache.delete(t.id));
    cache.set(t.id, p);
  }
  return p;
}

/**
 * Verses in a reference. Korean texts print some verses together (신6:18-19 is one verse):
 * the files keep the joined text at the first verse and empty strings after it, so those
 * come back as one Verse with `endVerse`, widened so no slide shows half of one.
 */
export function versesFor(bible: BibleText, r: BibleRef, joinEmpty: boolean): Verse[] {
  const book = bible[r.book.id - 1];
  if (!book) return [];
  const out: Verse[] = [];
  for (let ch = r.startChapter; ch <= r.endChapter; ch++) {
    const verses = book[ch - 1];
    if (!verses) continue;
    let from = ch === r.startChapter && r.startVerse ? r.startVerse : 1;
    let to = ch === r.endChapter && r.endVerse ? r.endVerse : verses.length;
    if (joinEmpty) {
      while (from > 1 && verses[from - 1]?.trim() === '') from--;
      while (to < verses.length && verses[to]?.trim() === '') to++;
    }
    for (let v = from; v <= Math.min(to, verses.length); v++) {
      const text = (verses[v - 1] ?? '').trim();
      const prev = out[out.length - 1];
      if (joinEmpty && text === '' && prev?.chapter === ch) prev.endVerse = v;
      else if (text) out.push({ chapter: ch, verse: v, text });
    }
  }
  return out;
}

export interface SearchHit {
  bookIndex: number;
  chapter: number;
  verse: number;
  text: string;
}

/** Verses containing every word of `query` (case-insensitive), in Bible order. */
export function searchBible(bible: BibleText, query: string, limit = 60): SearchHit[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const hits: SearchHit[] = [];
  for (let b = 0; b < bible.length && hits.length < limit; b++) {
    const chapters = bible[b];
    for (let c = 0; c < chapters.length && hits.length < limit; c++) {
      const verses = chapters[c];
      for (let v = 0; v < verses.length && hits.length < limit; v++) {
        const t = verses[v].toLowerCase();
        if (t && words.every((w) => t.includes(w))) hits.push({ bookIndex: b, chapter: c + 1, verse: v + 1, text: verses[v] });
      }
    }
  }
  return hits;
}
