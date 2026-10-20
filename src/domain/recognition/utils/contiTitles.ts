// Song-title, key and sermon-line reading for a 콘티 cover (shrlak/ppt contiText.ts, split for size).
import type { ContiInfo, ContiSongEntry } from './types';
import type { PositionedPage, PositionedText } from './chordSheet';
import { ENGLISH_THEN_KOREAN_RE, KEY, KOREAN_THEN_ENGLISH_RE, LANGUAGE_TAG_RE, LEADER_INITIALS_RE, MEDLEY_SPLIT_RE, SCRIPTURE_RE, SCRIPTURE_VALUE_RE, SERMON_THEME_RE, SERMON_TITLE_RE, SONG_LIST_HEADING_RE, SONG_LIST_ROW_RE } from './contiPatterns';
/**
 * A title written in both languages, as the Korean title and the English.
 * `God is the Strength of my Heart 하늘 위에 주님밖에` and `나의 슬픔은
 * (Mourning into Dancing)` both name one song twice; a title in one language
 * is returned as it is.
 */
export function splitBilingualTitle(text: string): { title: string; englishTitle?: string } {
  const title = text.trim();
  const englishFirst = ENGLISH_THEN_KOREAN_RE.exec(title);
  const koreanFirst = englishFirst ? null : KOREAN_THEN_ENGLISH_RE.exec(title);
  const [korean, english] = englishFirst
    ? [englishFirst[2], englishFirst[1]]
    : koreanFirst
      ? [koreanFirst[1], koreanFirst[2]]
      : [title, ''];
  const ko = korean.trim();
  const en = english.trim();
  return en && ko ? { title: ko, englishTitle: en } : { title };
}

/**
 * The songs one numbered list line names: `Above All + I Will Worship You
 * (English/Korean) EC` is two songs, each with its own 악보. Which language
 * it is sung in and who leads it are not part of any title.
 */
function songListEntries(text: string): ContiSongEntry[] {
  // The leader is written after the language: `(English/Korean) EC&DK` —
  // unless the medley's next song follows the tag instead.
  const tags = [...text.matchAll(LANGUAGE_TAG_RE)];
  const lastTag = tags[tags.length - 1];
  let body = text;
  if (lastTag) {
    const end = (lastTag.index ?? 0) + lastTag[0].length;
    if (!MEDLEY_SPLIT_RE.test(text.slice(end))) body = text.slice(0, end);
  }
  body = body.replace(LANGUAGE_TAG_RE, ' ');
  // Initials left at the end are the leader's too — unless the title itself
  // is written in capitals, where they cannot be told apart.
  const initials = LEADER_INITIALS_RE.exec(body);
  if (initials && /[a-z가-힣]/.test(body.slice(0, initials.index))) {
    body = body.slice(0, initials.index);
  }
  return body.split(MEDLEY_SPLIT_RE).flatMap((part) => {
    const readable = readableTitle(part);
    return readable ? [splitBilingualTitle(readable)] : [];
  });
}

/**
 * Read a cover that lists its songs as numbered lines under a `Songlist`
 * heading — the 찬양집회 conti's form:
 *
 *   Songlist (12): Thank you Alex! :)
 *   1. God is the Strength of my Heart 하늘 위에 주님밖에 (English/Korean) DK
 *   Prayer Topic 1: …
 *   2. …
 *
 * Only the next number in order is a song, so the 기도 topics and notes
 * written between them are passed over; the list ends at the count the
 * heading gives, when it gives one.
 */
export function parseSongList(lines: string[]): ContiSongEntry[] {
  const songs: ContiSongEntry[] = [];
  let inList = false;
  let count: number | undefined;
  let lastOrder = 0;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const heading = SONG_LIST_HEADING_RE.exec(line);
    if (heading && !inList) {
      inList = true;
      count = heading[1] ? Number(heading[1]) : undefined;
      continue;
    }
    if (!inList) continue;
    const row = SONG_LIST_ROW_RE.exec(line);
    if (!row || Number(row[1]) !== lastOrder + 1) continue;
    lastOrder += 1;
    songs.push(...songListEntries(row[2]));
    if (count !== undefined && lastOrder >= count) break;
  }
  return songs;
}

/**
 * The cover's title for a song the table could not name. It starts with
 * `새 찬양` like every other unnamed card, so the title read off the song's
 * 악보 replaces it (see isPlaceholderTitle), and the number keeps it in the
 * conti's slot until then.
 */
export function untitledSongTitle(order: number): string {
  return `새 찬양 (${order}번)`;
}

/**
 * A title cell's text, or undefined when it holds nothing readable. A font
 * embedded without a Unicode map comes out of the PDF as private-use or
 * control characters — the handwriting fonts do this — and that is no title
 * to search the library or the web by.
 */
export function readableTitle(raw: string): string | undefined {
  const cleaned = raw
    .replace(/[\p{Co}\p{Cc}\p{Cf}�]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  return /\p{L}/u.test(cleaned) ? cleaned : undefined;
}

export function normalizeKey(raw: string): string {
  const key = raw[0].toUpperCase();
  const rest = raw.slice(1).replace('♯', '#').replace('♭', 'b').replace('B', 'b');
  return key + rest;
}

/**
 * Normalize a written key column into a canonical chain: "F->Ab->G" and
 * "F key -> Gb key" both become "F -> Ab -> G" / "F -> Gb". Returns undefined
 * when the text is not a key (chain) at all, which is what keeps ordinary
 * prose out of the song table.
 */
export function normalizeKeyChain(raw: string): string | undefined {
  const cleaned = raw
    .replace(/\b(?:key|키)\b/gi, ' ')
    .replace(/[⇒→=]>?/g, '->')
    .replace(/~/g, '->')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return undefined;
  const keys = cleaned.split('->').map((part) => part.trim());
  if (keys.some((part) => !new RegExp(String.raw`^${KEY}$`).test(part))) return undefined;
  return keys.map(normalizeKey).join(' -> ');
}

/** The order number untitledSongTitle wrote into a placeholder, if it is one. */
function untitledSongOrder(title: string): number | undefined {
  const match = /^새 찬양 \((\d{1,2})번\)$/.exec(title.trim());
  return match ? Number(match[1]) : undefined;
}

/** Pieces of one line of text, left to right, with a space where there is a gap. */
function joinPositioned(items: PositionedText[]): string {
  let text = '';
  let end: number | null = null;
  for (const item of [...items].sort((a, b) => a.x - b.x)) {
    if (end !== null && item.x - end > 0.3 * item.size && !/\s$/.test(text)) text += ' ';
    text += item.str;
    end = item.x + item.width;
  }
  return text;
}

/**
 * What the page prints in row `order`'s 찬양 cell: everything drawn between
 * that row's order number and its key, on the row's line.
 *
 * The order number and the key are typed in the table's own font, so they
 * share a baseline; that pair is what finds the row (a numbered 말씀 line has
 * a number but no key beside it). The title may sit higher or lower — a
 * larger or handwriting font has its own baseline — so it only has to be
 * centred on the row, within its own size of the number.
 */
function titleCellText(page: PositionedPage, order: number, key: string): string | undefined {
  const firstKey = key.split(' -> ')[0];
  const middle = (item: PositionedText) => item.y + item.size / 2;
  for (const number of page.items) {
    if (!new RegExp(String.raw`^${order}\s*[.)]?$`).test(number.str.trim())) continue;
    const numberEnd = number.x + number.width;
    const keyCell = page.items
      .filter(
        (item) =>
          item !== number &&
          item.x >= numberEnd &&
          Math.abs(item.y - number.y) <= Math.max(2, number.size * 0.25) &&
          normalizeKeyChain(item.str.trim().split(/\s*(?:->|=>|→|⇒|~)\s*|\s+/)[0]) === firstKey,
      )
      .sort((a, b) => a.x - b.x)[0];
    if (!keyCell) continue;
    const cell = page.items.filter(
      (item) =>
        item !== number &&
        item !== keyCell &&
        item.x >= numberEnd - 1 &&
        item.x + item.width <= keyCell.x + 1 &&
        Math.abs(middle(item) - middle(number)) <= Math.max(item.size, number.size) * 0.75,
    );
    const title = readableTitle(joinPositioned(cell));
    if (title) return title;
  }
  return undefined;
}

/**
 * Name the table rows the cover's text could not, from where text sits on
 * the page.
 *
 * A PDF lists its text in the order it was drawn, not the order it is read.
 * A title set in another font is often drawn last — a handwriting font
 * embedded as a Type 3 font is — so it comes out after the whole page rather
 * than between its row's number and key, and the row reads as untitled. Its
 * position still puts it in its row. A row with truly nothing written in it
 * (a title in ink) finds nothing here and keeps its placeholder, which the
 * title read off its 악보 replaces. Mutates info.songs.
 */
export function nameUntitledRowsFromLayout(info: ContiInfo, pages: PositionedPage[]): void {
  for (const song of info.songs) {
    const order = untitledSongOrder(song.title);
    if (order === undefined || !song.key) continue;
    for (const page of pages) {
      const title = titleCellText(page, order, song.key);
      if (title) {
        song.title = title;
        break;
      }
    }
  }
}

/**
 * Read the two Bible-slide fields from any text-bearing non-score page. Unlike
 * parseCoverText this does not require a song list, so a standalone sermon
 * information page can still populate the next wizard step.
 */
export function parseSermonInfoText(text: string): Pick<ContiInfo, 'sermonTitle' | 'scripture'> {
  let sermonTitle: string | undefined;
  let theme: string | undefined;
  let scripture: string | undefined;

  const clean = (value: string) => value.trim().replace(/^[“"]|[”"]$/g, '').trim();

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const scriptureMatch = line.match(SCRIPTURE_RE);
    // "3. 본문" heads the printed passage; only a real chapter/verse is the 본문 field.
    if (scriptureMatch && SCRIPTURE_VALUE_RE.test(scriptureMatch[1])) {
      scripture ??= scriptureMatch[1].trim();
      continue;
    }
    const titleMatch = line.match(SERMON_TITLE_RE);
    if (titleMatch) {
      sermonTitle ??= clean(titleMatch[1]);
      continue;
    }
    const themeMatch = line.match(SERMON_THEME_RE);
    if (themeMatch) theme ??= clean(themeMatch[1]);
  }

  // An explicit 설교 제목 always beats a 주제 row, wherever each sits on the page.
  return { sermonTitle: sermonTitle ?? theme, scripture };
}
