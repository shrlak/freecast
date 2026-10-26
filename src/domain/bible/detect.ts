// Finds Bible references in free text or in what a speaker says: "요한복음 3장 16절", "로마서 팔장 이십팔절",
// "John 3:16", "시편 23편", "요3:16-18". Used to suggest verses while someone preaches or types.
import { BIBLE_BOOKS, type BibleBook } from './books';
import { EN_ABBR, formatRef, type BibleRef } from './refs';

export interface DetectedRef {
  ref: BibleRef;
  /** "요한복음 3:16" */
  label: string;
  /** The short form the Bible box and slide builder read back: "요3:16-18". */
  compact: string;
}

// ---------- spoken numbers
const DIGITS: Record<string, number> = { 일: 1, 이: 2, 삼: 3, 사: 4, 오: 5, 육: 6, 칠: 7, 팔: 8, 구: 9 };

/** 삼 → 3, 십육 → 16, 이십팔 → 28, 백오십 → 150. Null when the word is not a number up to 999. */
export function koreanNumber(word: string): number | null {
  if (!/^[일이삼사오육칠팔구십백]+$/.test(word)) return null;
  let total = 0, current = 0, last = '';
  for (const ch of word) {
    if (ch in DIGITS) {
      if (last in DIGITS) return null;
      current = DIGITS[ch];
    } else {
      if (ch === last) return null;
      total += (current || 1) * (ch === '십' ? 10 : 100);
      current = 0;
    }
    last = ch;
  }
  total += current;
  return total >= 1 && total <= 999 ? total : null;
}

/** "삼 장 십육 절" → "3 장 16 절" (only numbers sitting in front of 장 · 편 · 절). */
export function spokenToDigits(text: string): string {
  return text.replace(/(^|[^가-힣])([일이삼사오육칠팔구십백]{1,7})(?=\s*[장편절])/g, (all, lead: string, word: string) => {
    const n = koreanNumber(word);
    return n === null ? all : `${lead}${n}`;
  });
}

// ---------- book names
const ENGLISH_ORDINALS: [RegExp, string][] = [[/\b(?:first|1st|i)\s+(?=(?:samuel|kings|chronicles|corinthians|thessalonians|timothy|peter|john)\b)/gi, '1 '], [/\b(?:second|2nd|ii)\s+(?=(?:samuel|kings|chronicles|corinthians|thessalonians|timothy|peter|john)\b)/gi, '2 '], [/\b(?:third|3rd|iii)\s+(?=john\b)/gi, '3 ']];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

interface Alias { text: string; pattern: string; book: BibleBook; english: boolean }
const ALIASES: Alias[] = [];
const seenAlias = new Set<string>();
const addAlias = (text: string, book: BibleBook, english: boolean) => {
  const key = text.toLowerCase();
  if (seenAlias.has(key)) return;
  seenAlias.add(key);
  // English names may be spoken with or without the space ("1 John" · "1John" · "Song of Solomon").
  ALIASES.push({ text, book, english, pattern: english ? escape(text).replace(/ /g, '\\s*') : escape(text) });
};
for (const b of BIBLE_BOOKS) {
  addAlias(b.nameKo, b, false);
  for (const a of b.abbrKo) addAlias(a, b, false);
  addAlias(b.nameEn, b, true);
  for (const a of EN_ABBR[b.nameEn] ?? []) addAlias(a, b, true);
}
const REVELATION = BIBLE_BOOKS.find((b) => b.nameEn === 'Revelation')!;
addAlias('계시록', REVELATION, false);
ALIASES.sort((x, y) => y.text.length - x.text.length);
const byText = new Map(ALIASES.map((a) => [a.text.toLowerCase().replace(/\s+/g, ''), a]));
const BOOK_RE = new RegExp(`(^|[^A-Za-z가-힣])(${ALIASES.map((a) => a.pattern).join('|')})(?![A-Za-z])`, 'gi');

// ---------- what follows the book name
const N = '(\\d{1,3})';
const RANGE = '[-~–—]';
const OF = '(?:에서|의)?';
const TAILS = {
  crossColon: new RegExp(`^${OF}\\.?\\s*${N}\\s*[:：]\\s*${N}\\s*${RANGE}\\s*${N}\\s*[:：]\\s*${N}`),
  colon: new RegExp(`^${OF}\\.?\\s*${N}\\s*[:：]\\s*${N}(?:\\s*${RANGE}\\s*${N})?`),
  koCross: new RegExp(`^${OF}\\s*${N}\\s*[장편]\\s*${N}\\s*절?\\s*(?:${RANGE}|부터|에서)\\s*${N}\\s*[장편]\\s*${N}\\s*절?`),
  koRange: new RegExp(`^${OF}\\s*${N}\\s*[장편]\\s*${N}\\s*${RANGE}\\s*${N}\\s*절`),
  koVerse: new RegExp(`^${OF}\\s*${N}\\s*[장편]\\s*${N}\\s*절(?:\\s*(?:${RANGE}|부터|에서)\\s*${N}\\s*절?)?`),
  koChapters: new RegExp(`^${OF}\\s*${N}\\s*[장편](?:\\s*${RANGE}\\s*${N}\\s*[장편])?`),
  english: /^\.?\s*(?:chapter|ch\.?)\s*(\d{1,3})\s*,?\s*(?:verses?|vv?\.?)\s*(\d{1,3})(?:\s*(?:-|–|to|through)\s*(\d{1,3}))?/i,
  psalm: /^\.?\s+(\d{1,3})(?![\d:：])/,
};

const num = (s: string | undefined) => (s === undefined ? undefined : parseInt(s, 10));

function refFrom(book: BibleBook, sc: number, sv?: number, ec?: number, ev?: number): BibleRef | null {
  const endChapter = ec ?? sc;
  if (sc < 1 || sc > book.chapters || endChapter < sc || endChapter > book.chapters) return null;
  if (sv !== undefined && sv < 1) return null;
  if (sv === undefined) return { book, startChapter: sc, endChapter };
  let endVerse = ev ?? sv;
  if (endChapter === sc && endVerse < sv) endVerse = sv;
  return { book, startChapter: sc, startVerse: sv, endChapter, endVerse };
}

function tail(rest: string, a: Alias): BibleRef | null {
  // A one-letter name (요 · 롬) or a two-letter English one is only a reference with a chapter:verse after it ("요3:16", "롬 8:28").
  const short = a.text.length <= 1 || (a.english && a.text.length <= 2);
  if (short && /^\s{2,}/.test(rest)) return null;
  const { book } = a;
  let m: RegExpExecArray | null;
  if ((m = TAILS.crossColon.exec(rest))) return refFrom(book, +m[1], +m[2], +m[3], +m[4]);
  if ((m = TAILS.colon.exec(rest))) return refFrom(book, +m[1], +m[2], undefined, num(m[3]));
  if (short) return null;
  if ((m = TAILS.koCross.exec(rest))) return refFrom(book, +m[1], +m[2], +m[3], +m[4]);
  if ((m = TAILS.koRange.exec(rest))) return refFrom(book, +m[1], +m[2], undefined, +m[3]);
  if ((m = TAILS.koVerse.exec(rest))) return refFrom(book, +m[1], +m[2], undefined, num(m[3]));
  if ((m = TAILS.koChapters.exec(rest))) return refFrom(book, +m[1], undefined, num(m[2]));
  if ((m = TAILS.english.exec(rest))) return refFrom(book, +m[1], +m[2], undefined, num(m[3]));
  if (a.book.nameEn === 'Psalms' && a.english && (m = TAILS.psalm.exec(rest))) return refFrom(book, +m[1]);
  return null;
}

/** The compact form ("요3:16-18", "시23", "행1:8-2:3") that the Bible box and slide builder accept. */
export function compactRef(r: BibleRef): string {
  const name = r.book.abbrKo[0];
  if (r.startVerse === undefined) return r.endChapter !== r.startChapter ? `${name}${r.startChapter}-${r.endChapter}` : `${name}${r.startChapter}`;
  if (r.endChapter !== r.startChapter) return `${name}${r.startChapter}:${r.startVerse}-${r.endChapter}:${r.endVerse}`;
  return r.endVerse !== undefined && r.endVerse !== r.startVerse ? `${name}${r.startChapter}:${r.startVerse}-${r.endVerse}` : `${name}${r.startChapter}:${r.startVerse}`;
}

const JOINED = /(고린도|데살로니가|디모데|베드로|사무엘|열왕기|역대|요한)\s+(전서|후서|일서|이서|삼서|상|하)/g;

/**
 * Every Bible reference in `input`, in the order it appears and without repeats. Spoken Korean numbers
 * ("삼장 십육절") and English ("John chapter 3 verse 16") are read as well as the written forms.
 */
export function detectRefs(input: string): DetectedRef[] {
  let text = spokenToDigits(input.replace(JOINED, '$1$2'));
  for (const [re, to] of ENGLISH_ORDINALS) text = text.replace(re, to);
  const out: DetectedRef[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(BOOK_RE)) {
    const alias = byText.get(m[2].toLowerCase().replace(/\s+/g, ''));
    if (!alias) continue;
    const from = (m.index ?? 0) + m[1].length + m[2].length;
    const ref = tail(text.slice(from, from + 60), alias);
    if (!ref) continue;
    const compact = compactRef(ref);
    if (seen.has(compact)) continue;
    seen.add(compact);
    out.push({ ref, label: formatRef(ref, 'ko'), compact });
  }
  return out;
}

/** The references written on slides (text, boxes, notes) — a sermon's verses — each once, in running order. */
export function refsInSlides(slides: { title?: string; text: string; subtext?: string; notes?: string; elements?: { kind: string; text?: string }[] }[], max = 40): DetectedRef[] {
  const out: DetectedRef[] = [];
  const seen = new Set<string>();
  for (const s of slides) {
    const boxes = (s.elements ?? []).filter((e) => e.kind === 'text' && e.text).map((e) => e.text!);
    for (const d of detectRefs([s.title, s.text, s.subtext, s.notes, ...boxes].filter(Boolean).join('\n'))) {
      if (seen.has(d.compact)) continue;
      seen.add(d.compact);
      out.push(d);
      if (out.length >= max) return out;
    }
  }
  return out;
}
