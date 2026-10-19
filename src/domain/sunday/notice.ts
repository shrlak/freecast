import { normalizeScripture } from '../bible/refs';

export interface NoticeSong {
  title: string;
  key?: string;
}

export interface ParsedNotice {
  date?: { year?: number; month: number; day: number };
  scripture?: string;
  sermonTitle?: string;
  preacher?: string;
  confession?: string;
  songs: NoticeSong[];
}

// Emoji, keycaps and variation selectors that decorate labels: "🎶찬양곡:", "1️⃣ 곡".
const DECOR = /[\p{Extended_Pictographic}️‍\u{1F1E6}-\u{1F1FF}]/gu;
const LABEL = /^\s*([^\d:：]{1,14}?)\s*[:：]\s*(.*)$/;
const KEY = '([A-G](?:#|b|♯|♭)?m?)';
const SONG = new RegExp(
  String.raw`^\s*(?:(\d{1,2})\s*(?:⃣|[.)]|번)|\((\d{1,2})\)|([①-⑳])|[-•*·])\s*(.+?)\s*` +
    String.raw`(?:[(\[]\s*${KEY}\s*(?:key|키)?\s*[)\]]|[-–—:]\s*${KEY}(?:\s*(?:key|키))?)?\s*$`,
  'i',
);
const NOT_SONG = /라인업|연습|키워드|레퍼런스|인도|싱어|세션|reference|lineup/i;

function cleanTitle(t: string): string {
  return t.replace(/\*\*/g, '').replace(/\s+/g, ' ').replace(/[\s,]+$/, '').trim();
}

function parseDate(text: string): ParsedNotice['date'] {
  let m = /(20\d{2})\s*[./년-]\s*(\d{1,2})\s*[./월-]\s*(\d{1,2})/.exec(text);
  if (m) return { year: +m[1], month: +m[2], day: +m[3] };
  m = /(\d{1,2})\s*월\s*(\d{1,2})\s*일/.exec(text);
  if (m) return { month: +m[1], day: +m[2] };
  m = /(?:^|[^\d/])(\d{1,2})\/(\d{1,2})(?:\/(20\d{2}|\d{2}))?(?![\d/])/.exec(text);
  if (m) {
    const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : undefined;
    return { year: y, month: +m[1], day: +m[2] };
  }
  return undefined;
}

/** Read a KakaoTalk worship notice: songs (with keys), date, scripture, sermon title, 공동체 고백. */
export function parseNotice(text: string): ParsedNotice {
  const out: ParsedNotice = { songs: [], date: parseDate(text) };
  let inSongs = false;
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.replace(DECOR, ' ').replace(/\s+/g, ' ').trim();
    if (!line) continue;
    const label = LABEL.exec(line);
    const isSongLine = SONG.test(line) && !label?.[1].match(/찬양|곡/);
    if (label && !isSongLine) {
      const [, name, value] = label;
      inSongs = /찬양|곡|songs?|setlist/i.test(name) && !/고백/.test(name);
      if (/본문|말씀\s*본문|scripture|성경/i.test(name) && value) out.scripture = normalizeScripture(value);
      else if (/설교\s*제목|말씀\s*제목|^제목|설교|sermon/i.test(name) && value) out.sermonTitle = cleanTitle(value);
      else if (/설교자|강사|preacher/i.test(name) && value) out.preacher = cleanTitle(value);
      else if (/고백/.test(name) && value) out.confession = cleanTitle(value);
      if (inSongs && value && SONG.test(`1. ${value}`)) pushSong(out, `1. ${value}`);
      continue;
    }
    if (inSongs) {
      if (NOT_SONG.test(line)) {
        inSongs = false;
        continue;
      }
      pushSong(out, line);
    }
  }
  return out;
}

function pushSong(out: ParsedNotice, line: string) {
  const m = SONG.exec(line);
  if (!m) return;
  const title = cleanTitle(m[4]);
  const key = (m[5] ?? m[6])?.replace('♯', '#').replace('♭', 'b');
  if (title) out.songs.push(key ? { title, key } : { title });
}

/** The Sunday on or after `from` (today if it is Sunday). */
export function upcomingSunday(from: Date): Date {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
  return d;
}

/** The Sunday of the week a notice date falls in, or the coming Sunday if there is none. */
export function serviceDate(parsed: ParsedNotice['date'], today: Date): Date {
  if (!parsed) return upcomingSunday(today);
  const year = parsed.year ?? today.getFullYear();
  return upcomingSunday(new Date(year, parsed.month - 1, parsed.day));
}

const p2 = (n: number) => String(n).padStart(2, '0');
export const mmdd = (d: Date) => `${p2(d.getMonth() + 1)}${p2(d.getDate())}`;
export const mdy = (d: Date) => `${p2(d.getMonth() + 1)}/${p2(d.getDate())}/${d.getFullYear()}`;
