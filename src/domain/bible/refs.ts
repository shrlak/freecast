import { BIBLE_BOOKS, type BibleBook } from './books';

export interface BibleRef {
  book: BibleBook;
  startChapter: number;
  startVerse?: number;
  endChapter: number;
  endVerse?: number;
}

// Common English abbreviations in addition to the full names.
export const EN_ABBR: Record<string, string[]> = {
  Genesis: ['gen', 'gn'], Exodus: ['ex', 'exod'], Leviticus: ['lev'], Numbers: ['num'], Deuteronomy: ['deut', 'dt'],
  Joshua: ['josh'], Judges: ['judg'], '1 Samuel': ['1sam'], '2 Samuel': ['2sam'], '1 Kings': ['1kgs', '1ki'], '2 Kings': ['2kgs', '2ki'],
  '1 Chronicles': ['1chr'], '2 Chronicles': ['2chr'], Nehemiah: ['neh'], Esther: ['esth'], Psalms: ['ps', 'psa', 'psalm'],
  Proverbs: ['prov', 'pr'], Ecclesiastes: ['eccl', 'ecc'], 'Song of Solomon': ['song', 'sos'], Isaiah: ['isa'], Jeremiah: ['jer'],
  Lamentations: ['lam'], Ezekiel: ['ezek'], Daniel: ['dan'], Hosea: ['hos'], Obadiah: ['obad'], Habakkuk: ['hab'],
  Zephaniah: ['zeph'], Haggai: ['hag'], Zechariah: ['zech'], Malachi: ['mal'], Matthew: ['matt', 'mt'], Mark: ['mk', 'mrk'],
  Luke: ['lk'], John: ['jn', 'jhn'], Acts: ['act'], Romans: ['rom'], '1 Corinthians': ['1cor'], '2 Corinthians': ['2cor'],
  Galatians: ['gal'], Ephesians: ['eph'], Philippians: ['phil', 'php'], Colossians: ['col'], '1 Thessalonians': ['1thess'],
  '2 Thessalonians': ['2thess'], '1 Timothy': ['1tim'], '2 Timothy': ['2tim'], Titus: ['tit'], Philemon: ['phlm'],
  Hebrews: ['heb'], James: ['jas'], '1 Peter': ['1pet'], '2 Peter': ['2pet'], '1 John': ['1jn'], '2 John': ['2jn'],
  '3 John': ['3jn'], Jude: ['jud'], Revelation: ['rev'],
};

const ALIASES: [string, BibleBook][] = [];
for (const b of BIBLE_BOOKS) {
  ALIASES.push([b.nameKo, b]);
  for (const a of b.abbrKo) ALIASES.push([a, b]);
  ALIASES.push([b.nameEn.toLowerCase().replace(/\s+/g, ''), b]);
  for (const a of EN_ABBR[b.nameEn] ?? []) ALIASES.push([a, b]);
}
ALIASES.sort((x, y) => y[0].length - x[0].length);

const num = (s: string | undefined) => (s ? parseInt(s, 10) : undefined);

/** Parse one reference like "요3:16", "롬8:28-30", "행1:8-2:3", "John 3:16", "Ps 23". */
export function parseRef(input: string): BibleRef | null {
  const compact = input.trim().replace(/\s+/g, '').replace(/[–—~]/g, '-');
  const lower = compact.toLowerCase();
  const hit = ALIASES.find(([alias]) => lower.startsWith(alias));
  if (!hit) return null;
  const [alias, book] = hit;
  const rest = compact.slice(alias.length).replace(/^\./, '');
  if (!rest) return { book, startChapter: 1, endChapter: book.chapters };
  const m = /^(\d+)(?:[:.](\d+))?(?:-(\d+)(?:[:.](\d+))?)?$/.exec(rest);
  if (!m) return null;
  const [, c1, v1, x, v2] = m;
  const startChapter = num(c1)!;
  if (startChapter < 1 || startChapter > book.chapters) return null;
  if (v1 === undefined) {
    // "시23" or "시23-24" (chapters)
    const endChapter = num(x) ?? startChapter;
    return { book, startChapter, endChapter: Math.min(endChapter, book.chapters) };
  }
  if (x === undefined) return { book, startChapter, startVerse: num(v1), endChapter: startChapter, endVerse: num(v1) };
  if (v2 !== undefined) return { book, startChapter, startVerse: num(v1), endChapter: num(x)!, endVerse: num(v2) };
  return { book, startChapter, startVerse: num(v1), endChapter: startChapter, endVerse: num(x) };
}

/**
 * Convert the written-out style used on a 콘티 cover or notice into compact refs:
 * "로마서 5장 1-11절" → "롬5:1-11", "시편 23편" → "시23".
 */
export function normalizeScripture(input: string): string {
  let v = input.replace(/^\s*(?:본문|말씀|scripture)\s*[:：]\s*/i, '').replace(/[–—~〜]/g, '-').replace(/[，,;；]+/g, ' ');
  for (const b of [...BIBLE_BOOKS].sort((a, c) => c.nameKo.length - a.nameKo.length)) v = v.split(b.nameKo).join(b.abbrKo[0]);
  return v
    .replace(/(\d+)\s*[장편]\s*(\d+)\s*절?\s*-\s*(\d+)\s*[장편]\s*(\d+)\s*절?/g, '$1:$2-$3:$4')
    .replace(/(\d+)\s*[장편]\s*(\d+)\s*절?\s*-\s*(\d+)\s*절?/g, '$1:$2-$3')
    .replace(/(\d+)\s*[장편]\s*(\d+)\s*절/g, '$1:$2')
    .replace(/(\d+)\s*-\s*(\d+)\s*[장편]/g, '$1-$2')
    .replace(/(\d+)\s*[장편]/g, '$1')
    .replace(/절/g, '')
    .replace(/\s*:\s*/g, ':')
    .replace(/\s*-\s*/g, '-')
    .replace(/([가-힣]+)\s+(?=\d)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Parse a whole input ("행1:8-10 요3:16" or "John 3:16; Rom 8:28") into refs plus unrecognised pieces. */
export function parseRefs(input: string): { refs: BibleRef[]; invalid: string[] } {
  const refs: BibleRef[] = [];
  const invalid: string[] = [];
  const normalized = normalizeScripture(input);
  // English refs contain spaces ("1 John 3:16"), so split on separators that cannot occur inside one.
  const tokens = /[a-z]/i.test(normalized)
    ? normalized.split(/\s*[;,]\s*|\s+(?=(?:[123]\s?)?[A-Za-z가-힣]{2,}\.?\s*\d)/)
    : normalized.split(/\s+/);
  for (const t of tokens.map((x) => x.trim()).filter(Boolean)) {
    const r = parseRef(t);
    if (r) refs.push(r);
    else invalid.push(t);
  }
  return { refs, invalid };
}

export function formatRef(r: BibleRef, lang: 'ko' | 'en' = 'ko'): string {
  const name = lang === 'ko' ? r.book.nameKo : r.book.nameEn;
  const sep = lang === 'ko' ? ' ' : ' ';
  if (r.startVerse === undefined) {
    return r.endChapter !== r.startChapter ? `${name}${sep}${r.startChapter}-${r.endChapter}` : `${name}${sep}${r.startChapter}`;
  }
  if (r.endChapter !== r.startChapter) return `${name}${sep}${r.startChapter}:${r.startVerse}-${r.endChapter}:${r.endVerse}`;
  if (r.endVerse !== undefined && r.endVerse !== r.startVerse) return `${name}${sep}${r.startChapter}:${r.startVerse}-${r.endVerse}`;
  return `${name}${sep}${r.startChapter}:${r.startVerse}`;
}
