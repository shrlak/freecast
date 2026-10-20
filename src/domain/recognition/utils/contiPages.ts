// Which pages of a 콘티 are cover, info, 기도 and 악보, and which song each 악보 page is
// (shrlak/ppt contiText.ts, split for size).
import type { ContiInfo, ContiSongEntry, LibraryEntry } from './types';
import { normalizeTitle } from '../storage/library';
import { DEFAULT_CONFESSION_SONG } from '../ai/aiSettings';
import { isPlaceholderTitle } from './contiAlignment';
import { parseCoverText } from './contiText';
import { DATE_LABEL_RE, NOTES_RE, SCRIPTURE_RE, SCRIPTURE_VALUE_RE, SECTION_HEADING_RE, SERMON_THEME_RE, SERMON_TITLE_RE, SONG_BULLET_RE, SONG_SECTION_RE, TABLE_HEADER_RE } from './contiPatterns';
import { normalizeKeyChain, parseSermonInfoText } from './contiTitles';
/** How many Hangul words a page needs before it can count as typed prose. */
const INFO_PAGE_MIN_WORDS = 30;
/** Structural marks only a typed information page carries. */
const INFO_PAGE_MARKERS = [SECTION_HEADING_RE, /^[•·∙▪▫◦]\s*\S/, SCRIPTURE_RE, SERMON_TITLE_RE, DATE_LABEL_RE];

/**
 * True when a page is typed service information rather than a scanned score.
 *
 * A conti's write-up often runs past the cover onto a second page (the last
 * song's commentary plus the printed 본문). That page has no staves, so the
 * vision pass would classify it `non_score` and drop whichever song it was
 * matched to — the song would vanish from 찬양 편집 instead of getting its
 * real score page. Scanned scores have no usable text layer at all (zero
 * Hangul on this conti), so requiring both a lot of Korean prose *and* a
 * structural mark keeps a genuine lyric text layer from being excluded.
 */
export function looksLikeInfoPage(text: string): boolean {
  const words = text.match(/[가-힣]{2,}/g)?.length ?? 0;
  if (words < INFO_PAGE_MIN_WORDS) return false;
  return text
    .split(/\r?\n/)
    .some((rawLine) => INFO_PAGE_MARKERS.some((marker) => marker.test(rawLine.trim())));
}

/**
 * Does this page read as a conti cover?
 *
 * Two independent signals, because covers are laid out differently from week
 * to week:
 *
 *  - a **song list plus service context** — what parseCoverText already
 *    requires, and the richest signal when the layout is one it can read;
 *  - a **sermon title and scripture together**. Those two are always written
 *    as a pair on the cover and nowhere else, so their co-location identifies
 *    the page even when the song list is laid out in a way the table parser
 *    cannot follow.
 *
 * The second signal matters most for a sparse cover — a date, the two sermon
 * fields, and a bare numbered song list with no key column. That page has too
 * little prose to look like an information page, so without this it would fall
 * through to musicPages and be recognized as an imaginary song.
 */
export function looksLikeCoverText(text: string): boolean {
  if (parseCoverText(text)) return true;
  const { sermonTitle, scripture } = parseSermonInfoText(text);
  return !!sermonTitle && !!scripture;
}

/**
 * How far into a conti the cover can START.
 *
 * The cover is normally page 1; a conti that opens with a decorative title
 * page puts it on page 2. Bounding where it may begin is what stops a later
 * page from being mistaken for one: a score page carrying a stray 본문 line,
 * or the printed-passage section, can otherwise look cover-shaped, and a
 * wrong cover takes the whole song list with it.
 *
 * How far the cover REACHES is not bounded — see findCoverPages.
 */
export const MAX_COVER_START_PAGE = 2;

/**
 * Does this page carry a mark that only a service write-up has?
 *
 * Used to follow a cover onto its later pages, where the page can be too
 * sparse to read as an information page on its own — the tail of the
 * commentary bullets, or a lone 본문 section. Every mark here is one a score
 * page cannot produce: a labeled service field whose value really is a
 * chapter/verse, the song table's own heading, or a `• 제목 (F -> G)`
 * commentary bullet whose parenthesis holds a musical key.
 *
 * The value checks are what keep it off a score: a lyric line beginning
 * "말씀 …" matches the 본문 label pattern, and only requiring a chapter/verse
 * after it tells the two apart.
 */
function hasCoverMark(text: string): boolean {
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const scripture = line.match(SCRIPTURE_RE);
    if (scripture && SCRIPTURE_VALUE_RE.test(scripture[1])) return true;
    if (SERMON_TITLE_RE.test(line) || SERMON_THEME_RE.test(line) || DATE_LABEL_RE.test(line)) return true;
    if (TABLE_HEADER_RE.test(line) || SONG_SECTION_RE.test(line)) return true;
    const bullet = line.match(SONG_BULLET_RE);
    if (bullet && normalizeKeyChain(bullet[2])) return true;
  }
  return false;
}

/**
 * Does this page continue the cover that started before it?
 *
 * Anything typed belongs to the cover: a second cover-shaped page, a page of
 * write-up prose, or a sparse page that only carries a cover mark. A page
 * that shows none of those is where the sheet music starts — which is where
 * the cover ends. The session-notes page is never part of it: it repeats the
 * song list, and parseCoverText refuses any text containing it.
 */
export function continuesCover(text: string): boolean {
  if (NOTES_RE.test(text)) return false;
  return looksLikeCoverText(text) || looksLikeInfoPage(text) || hasCoverMark(text);
}

/**
 * Every page of the cover: the run of leading pages up to the sheet music.
 *
 * The cover is one document however many pages it takes. A conti's write-up
 * commonly runs past the first page — the last songs' commentary, the printed
 * 본문 — and each of those pages is read as part of the cover rather than as a
 * score. That is what keeps the commentary attached to its song, gives the
 * sermon title and 본문 a chance to be read wherever in the write-up they were
 * typed, and stops a write-up page from being recognized as an imaginary song.
 *
 * Only where the cover BEGINS is bounded (MAX_COVER_START_PAGE); it then
 * reaches forward until a page reads as neither cover nor write-up, which is
 * the first page of sheet music.
 */
export function findCoverPages(pageTexts: string[]): number[] {
  const start = pageTexts.findIndex(
    (text, index) => index < MAX_COVER_START_PAGE && looksLikeCoverText(text),
  );
  if (start === -1) return [];
  const pages = [start + 1];
  for (let page = start + 2; page <= pageTexts.length; page++) {
    if (!continuesCover(pageTexts[page - 1])) break;
    pages.push(page);
  }
  return pages;
}

/**
 * A 기도 heading, compared with its spaces taken out (a glyph-spaced text
 * layer gives `기 도`): `기도`, `기도 2`, `통성기도`, `기도제목`, `Prayer`,
 * `Corporate Prayer`, `Prayer Topic 1`, `Prayer Time`.
 */
const PRAYER_HEADING_RE =
  /^(?:(?:통성|합심|중보|개인|묵상|결단|마무리)?기도(?:제목|시간)?|(?:corporate|united|intercessory|personal|silent|opening|closing)?prayer(?:topics?|time|prompts?|requests?)?)\d{0,2}$/i;
/** How much a 기도 page may hold beyond its heading: a few typed topics, no more. */
const PRAYER_PAGE_MAX_LINES = 8;
const PRAYER_PAGE_MAX_CHARS = 400;
/** What only a song's own page prints: a chord sheet's header and footer. */
const SONG_SHEET_MARK_RE = /\bKey\s*[-:]\s*[A-G]|\bTempo\b|\bCCLI\b/i;

/** `기도 / Prayer`, `Prayer Topic 2` — a line that is a 기도 heading and nothing else. */
function isPrayerHeading(text: string): boolean {
  const parts = text
    .split(/[/|｜·]/)
    .map((part) => part.replace(/\s+/g, ''))
    .filter(Boolean);
  return parts.length > 0 && parts.every((part) => PRAYER_HEADING_RE.test(part));
}

/**
 * A page of the conti that only says it is time to pray.
 *
 * A conti with no cover marks its 기도 with a page of its own between the
 * songs — `기도` and nothing else, or `Prayer Topic 2: Returning our hearts
 * back to God` with the topics under it. Such a page is no song, and it says
 * where the 기도 goes: after the song just before it.
 *
 * The heading must open the page and the page must stay short. A score whose
 * text layer holds a handwritten `→ Prayer topic` starts with something else,
 * and a typed lyric page of a song titled 기도 runs far longer. Returns the
 * topics typed under the heading ('' when there are none), or null when the
 * page is not a 기도 page.
 */
export function readPrayerPage(text: string): { topics: string } | null {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0 || lines.length > PRAYER_PAGE_MAX_LINES) return null;
  if (lines.join(' ').length > PRAYER_PAGE_MAX_CHARS) return null;
  if (lines.some((line) => SONG_SHEET_MARK_RE.test(line))) return null;
  const [first, ...rest] = lines;
  const colon = first.search(/[:：]/);
  if (!isPrayerHeading(colon >= 0 ? first.slice(0, colon) : first)) return null;
  const topics = [colon >= 0 ? first.slice(colon + 1).trim() : '', ...rest].filter(
    (line) => line && !isPrayerHeading(line),
  );
  return { topics: joinWrappedTopics(topics).join('\n') };
}

/** `- 교회 연합`, `• 다음 세대`, `1. 회복` — a line that opens a topic of its own. */
const TOPIC_MARK_RE = /^(?:[-–—•·∙●○▪■*]|\d{1,2}\s*[.)])\s*/;

/**
 * A topic the page wrapped onto the next line is one topic again: when the
 * topics are bulleted, a line with no bullet carries on the one before; when
 * they are not, an English line that starts in lower case does.
 */
function joinWrappedTopics(lines: string[]): string[] {
  const bulleted = lines.some((line) => TOPIC_MARK_RE.test(line));
  const topics: string[] = [];
  for (const line of lines) {
    const carriesOn = bulleted ? !TOPIC_MARK_RE.test(line) : /^[a-z]/.test(line);
    if (carriesOn && topics.length > 0) topics[topics.length - 1] += ` ${line}`;
    else topics.push(line);
  }
  return topics;
}

/** Classify PDF pages (1-based): cover, session-notes, and sheet-music pages. */
export function classifyPages(
  pageTexts: string[],
  /**
   * Which pages are 기도 pages (see readPrayerPage) — told by the caller,
   * which can also check that the page draws no picture. Without it no page
   * is taken for one.
   */
  isPrayerPage: (page: number) => boolean = () => false,
): {
  /** Every page the cover spans, in order; empty when there is no cover. */
  coverPages: number[];
  /** First cover page, or null. Kept for callers that only need the one. */
  coverIndex: number | null;
  notesIndex: number | null;
  /** Typed information pages beyond the cover that carry no score. */
  infoPages: number[];
  /** 기도 pages between the songs: no song's, and each puts a 기도 after the song before it. */
  prayerPages: number[];
  musicPages: number[];
} {
  const coverPages = findCoverPages(pageTexts);
  const cover = new Set(coverPages);

  let notesIndex: number | null = null;
  for (let page = 1; page <= pageTexts.length; page++) {
    if (cover.has(page)) continue;
    if (NOTES_RE.test(pageTexts[page - 1])) {
      notesIndex = page;
      break;
    }
  }

  const infoPages: number[] = [];
  const prayerPages: number[] = [];
  const musicPages: number[] = [];
  for (let page = 1; page <= pageTexts.length; page++) {
    if (cover.has(page) || page === notesIndex) continue;
    if (looksLikeInfoPage(pageTexts[page - 1])) infoPages.push(page);
    else if (isPrayerPage(page)) prayerPages.push(page);
    else musicPages.push(page);
  }
  return { coverPages, coverIndex: coverPages[0] ?? null, notesIndex, infoPages, prayerPages, musicPages };
}

/**
 * Assign each cover-page song a sheet-music page: first by finding the song title
 * in a page's (OCR) text, then sequentially for whatever is left. Mutates info.songs.
 */
export function matchSongsToPages(
  info: ContiInfo,
  pageTexts: string[],
  musicPages: number[],
): void {
  const taken = new Set<number>();

  for (const song of info.songs) {
    // A row the cover could not name has nothing to look for yet.
    if (isPlaceholderTitle(song.title)) continue;
    const want = normalizeTitle(song.title);
    if (!want) continue;
    const hit = musicPages.find(
      (p) => !taken.has(p) && normalizeTitle(pageTexts[p - 1] ?? '').includes(want),
    );
    if (hit) {
      song.pageIndex = hit;
      taken.add(hit);
    }
  }

  const free = musicPages.filter((p) => !taken.has(p));
  let next = 0;
  for (const song of info.songs) {
    if (song.pageIndex == null && next < free.length) {
      song.pageIndex = free[next++];
    }
  }
}

/**
 * Build an ordered song list straight from the sheet-music pages, for a conti
 * whose typed cover page is missing (or wasn't recognized). Each music page
 * becomes one song, in page order: matched to a library entry when its title
 * appears in the page's (OCR) text, otherwise a page-numbered stub the user
 * can fill in while looking at the score. The 공동체 고백송 may be among the
 * matched entries — callers should split it off exactly like the cover path.
 */
export function deriveSongsFromMusicPages(
  pageTexts: string[],
  musicPages: number[],
  library: LibraryEntry[],
): ContiSongEntry[] {
  return musicPages.map((page) => {
    const pageText = normalizeTitle(pageTexts[page - 1] ?? '');
    const hit = library.find((e) => {
      const t = normalizeTitle(e.title);
      return t.length >= 2 && pageText.includes(t);
    });
    return hit
      ? { title: hit.title, key: hit.key, pageIndex: page }
      : { title: `새 찬양 (p.${page})`, pageIndex: page };
  });
}

// The 공동체 고백송 — its lyric slides live in the fixed back-slides deck, so
// it never needs generated lyric slides. Which song that is comes from
// 관리자 설정 (DEFAULT_CONFESSION_SONG is the one the bundled back deck
// prints). Matched by normalized title so spacing/case/punctuation
// differences on the cover page don't matter.

/** How a conti cover page usually labels the slot itself, not the song. */
const CONFESSION_LABEL = '공동체고백';

/** True when a conti entry is the 공동체 고백송 supplied by the back slides. */
export function isConfessionSong(title: string, confessionTitle?: string): boolean {
  const normalized = normalizeTitle(title);
  const wanted = normalizeTitle(confessionTitle ?? DEFAULT_CONFESSION_SONG);
  if (wanted.length >= 2 && normalized === wanted) return true;
  // Some contis print the slot rather than the song ("공동체 고백송"), which
  // names the same thing wherever the back slides supply the lyrics.
  return normalized.includes(CONFESSION_LABEL);
}

/**
 * Split a conti's song list into the three roles the deck gives them.
 *
 * The 공동체 고백송 is supplied by the fixed back-slides deck, so it is split
 * off from the entries that need generated lyric slides. The song listed
 * right AFTER it is the 설교 후 찬양 — sung after the sermon, so its slides
 * belong after the post-sermon 기도 slide rather than in the opening praise
 * set. Every other song — including the 입례 song, wherever it appears in the
 * order — stays in the lyrics list, in its printed order.
 */
export function splitLyricsAndConfessionSongs(
  songs: ContiSongEntry[],
  confessionTitle?: string,
): {
  lyricsSongs: ContiSongEntry[];
  confessionSong?: ContiSongEntry;
  postSermonSong?: ContiSongEntry;
} {
  const confessionIndex = songs.findIndex((song) => isConfessionSong(song.title, confessionTitle));
  const confessionSong = confessionIndex === -1 ? undefined : songs[confessionIndex];
  const postSermonSong =
    confessionIndex === -1 ? undefined : songs[confessionIndex + 1];
  return {
    lyricsSongs: songs.filter((song) => song !== confessionSong),
    confessionSong,
    postSermonSong,
  };
}

/**
 * The date a conti's file name carries, for a conti that prints none — a
 * chord-sheet PDF has no cover. "2026-10-03 찬양집회.pdf", "20261003.pdf",
 * "10_03_Praise.pdf" and "9.27 EM KM.pdf" all name one; a month-and-day name
 * is taken in `today`'s year. Written the way a cover writes it
 * ("2026.10.03"), or undefined when the name holds no date.
 */
export function dateFromFileName(name: string, today = new Date()): string | undefined {
  const stem = name.replace(/\.[a-z0-9]+$/i, '');
  const full = /(?:^|\D)(20\d{2})[._-]?(\d{1,2})[._-]?(\d{1,2})(?!\d)/.exec(stem);
  const short = /^(\d{1,2})[._-](\d{1,2})(?!\d)/.exec(stem.trim());
  const [year, month, day] = full
    ? [Number(full[1]), Number(full[2]), Number(full[3])]
    : short
      ? [today.getFullYear(), Number(short[1]), Number(short[2])]
      : [0, 0, 0];
  const date = new Date(year, month - 1, day);
  if (!year || date.getMonth() !== month - 1 || date.getDate() !== day) return undefined;
  return `${year}.${String(month).padStart(2, '0')}.${String(day).padStart(2, '0')}`;
}
