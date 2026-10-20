// The 콘티 cover's song table and song lines (shrlak/ppt src/lib/utils/contiText.ts, split for size:
// contiPatterns, contiTitles, contiPages hold the rest).
import type { ContiInfo, ContiSongEntry } from './types';
import { normalizeTitle } from '../storage/library';
import { extractPartOrder } from './orderParser';
import { isTitleSlip } from './contiAlignment';
import { BULLET_BODY_RE, DATE_LABEL_RE, DATE_RE, ISO_DATE_RE, MAX_TITLE_CELL_LINES, NOTES_RE, ORDER_AND_TITLE_RE, ORDER_CELL_RE, PLAN_RE, QUOTED_RE, SCRIPTURE_RE, SCRIPTURE_VALUE_RE, SECTION_HEADING_RE, SONG_BULLET_RE, SONG_LINE, SONG_SECTION_RE, SONG_TABLE_ROW, TABLE_HEADER_RE, UNTITLED_TABLE_ROW } from './contiPatterns';
import { normalizeKey, normalizeKeyChain, parseSermonInfoText, parseSongList, readableTitle, untitledSongTitle } from './contiTitles';
/**
 * Read the `순서 | 찬양 | 키` table a conti cover uses instead of prose song
 * lines, plus the `• 제목 (Key)` commentary bullets underneath it.
 *
 * Only the rows inside the 찬양 콘티 section are considered: the 말씀 묵상 and
 * 본문 sections are full of numbered prose ("8. 전도자가 이르되 …") that would
 * otherwise be mistaken for table rows. The bullets are matched back to the
 * table by title so a song keeps its order number while gaining a description,
 * and a song that only ever appears as a bullet is still picked up.
 *
 * A row whose title cell holds no readable text — written by hand, or in a
 * font the PDF cannot map back to letters — keeps its place in the order as
 * an untitledSongTitle placeholder with its key, so it is paired with its own
 * 악보 page and named from it. A cover bullet that names it fills it in.
 */
function parseSongTable(lines: string[]): ContiSongEntry[] {
  const songs: ContiSongEntry[] = [];
  const byTitle = new Map<string, ContiSongEntry>();
  /** Rows the table could not name, in order, until a bullet names them. */
  const unnamed: ContiSongEntry[] = [];
  /** Songs the table itself lists — the service's order. */
  const tableRows: ContiSongEntry[] = [];
  /** Songs only a commentary bullet names; kept only when there is no table. */
  const bulletOnly = new Set<ContiSongEntry>();
  const remember = (song: ContiSongEntry) => {
    const existing = byTitle.get(normalizeTitle(song.title));
    if (existing) return existing;
    byTitle.set(normalizeTitle(song.title), song);
    songs.push(song);
    return song;
  };

  let inSection = false;
  let bullet: ContiSongEntry | null = null;
  /** The first plan the conti names (`A`); its list is the one sung. */
  let firstPlan: string | undefined;
  /** Inside another plan's section (Plan B): nothing there joins the list. */
  let otherPlan = false;
  /** Order number of the last row read, so a loose number must be the next one. */
  let lastOrder = 0;
  /**
   * A row whose cells came out on separate lines, still waiting for its key.
   * `bare` when the order number stood alone — only a table cell does that;
   * a number with words after it may be a note, and is a row only once its
   * key turns up.
   */
  let pending: { order: number; title: string[]; bare: boolean } | null = null;

  const addRow = (order: number, rawTitle: string, key?: string) => {
    lastOrder = order;
    const title = readableTitle(rawTitle);
    if (title) {
      const song = remember({ title, ...(key ? { key } : {}) });
      if (key) song.key ??= key;
      bulletOnly.delete(song);
      if (!tableRows.includes(song)) tableRows.push(song);
      return;
    }
    const song: ContiSongEntry = { title: untitledSongTitle(order), ...(key ? { key } : {}) };
    songs.push(song);
    unnamed.push(song);
    tableRows.push(song);
  };
  /**
   * The table row a commentary bullet describes: the row of that title, or
   * one whose title the bullet merely mistypes, in the same key.
   */
  const rowFor = (title: string, key: string): ContiSongEntry | undefined =>
    byTitle.get(normalizeTitle(title)) ??
    tableRows.find(
      (song) => (!song.key || song.key === key) && !unnamed.includes(song) && isTitleSlip(song.title, title),
    );
  const flushPending = () => {
    if (!pending) return;
    const { order, title, bare } = pending;
    pending = null;
    if (bare) addRow(order, title.join(' '));
  };
  /**
   * The table row a commentary bullet with no readable title of its own (or
   * one no row carries) describes: the first unnamed row, preferring one in
   * the same key.
   */
  const claimUnnamed = (key: string): ContiSongEntry | undefined => {
    const index = Math.max(
      0,
      unnamed.findIndex((song) => song.key === key),
    );
    return unnamed.splice(index, 1)[0];
  };
  /** Only the next number in sequence is a row; a stray page number is not. */
  const isNextRow = (order: number) => order === (pending?.order ?? lastOrder) + 1;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // Either the section heading or the table's header row opens the table.
    if (SONG_SECTION_RE.test(line) || TABLE_HEADER_RE.test(line)) {
      flushPending();
      bullet = null;
      lastOrder = 0;
      const plan = line.match(PLAN_RE)?.[1]?.toUpperCase();
      if (plan) {
        firstPlan ??= plan;
        otherPlan = plan !== firstPlan;
      }
      // A header row inside Plan B names no plan; it is still Plan B's.
      inSection = !otherPlan;
      continue;
    }
    if (!inSection) continue;

    const bulletMatch = line.match(SONG_BULLET_RE);
    if (bulletMatch) {
      const key = normalizeKeyChain(bulletMatch[2]);
      if (key) {
        flushPending();
        const title = readableTitle(bulletMatch[1]);
        const known = title ? rowFor(title, key) : undefined;
        const row = known ?? claimUnnamed(key);
        if (row && title && !known) {
          // The bullet names the row the table could not.
          row.title = title;
          byTitle.set(normalizeTitle(title), row);
        }
        if (row) {
          bullet = row;
        } else if (title) {
          const before = songs.length;
          bullet = remember({ title, key });
          if (songs.length > before) bulletOnly.add(bullet);
        } else {
          bullet = null;
        }
        if (bullet) bullet.key ??= key;
        continue;
      }
    }

    // Page furniture: an empty bullet marker or a lone decorative glyph.
    if (!/[0-9a-zA-Zㄱ-ㆎ가-힣]/.test(line) || /^[o○◦-]$/.test(line)) continue;

    // A description line continues the bullet it sits under.
    const bodyMatch = line.match(BULLET_BODY_RE);
    if (bullet && bodyMatch) {
      bullet.description = bullet.description ? `${bullet.description} ${bodyMatch[1]}` : bodyMatch[1];
      continue;
    }
    if (bullet && !SECTION_HEADING_RE.test(line) && !SONG_TABLE_ROW.test(line)) {
      // Wrapped continuation of the previous description line — while that
      // line is mid-sentence, or when it is the song's 진행. Text after a
      // finished sentence is something else drawn on the page: a tablet adds
      // its reading of handwriting there, after everything typed.
      const unfinished = !!bullet.description && !/[.!?。]\s*$/.test(bullet.description);
      if (bullet.description && (unfinished || extractPartOrder(line))) bullet.description += ` ${line}`;
      continue;
    }

    const rowMatch = line.match(SONG_TABLE_ROW);
    if (rowMatch) {
      const key = normalizeKeyChain(rowMatch[3]);
      if (key) {
        flushPending();
        addRow(Number(rowMatch[1]), rowMatch[2], key);
        continue;
      }
    }

    // `1 G`: the title cell is ink, not text — the row still holds a song.
    const untitled = line.match(UNTITLED_TABLE_ROW);
    if (untitled && isNextRow(Number(untitled[1]))) {
      const key = normalizeKeyChain(untitled[2]);
      if (key) {
        flushPending();
        addRow(Number(untitled[1]), '', key);
        continue;
      }
    }

    // A row whose cells did not share a baseline (a title in a larger or
    // handwriting font) comes out a cell per line: `1` / `주님의 은혜` / `G`.
    const bareOrder = line.match(ORDER_CELL_RE);
    const orderCell = bareOrder ?? line.match(ORDER_AND_TITLE_RE);
    if (orderCell && isNextRow(Number(orderCell[1])) && !SECTION_HEADING_RE.test(line)) {
      flushPending();
      pending = { order: Number(orderCell[1]), title: orderCell[2] ? [orderCell[2]] : [], bare: !!bareOrder };
      continue;
    }
    if (pending) {
      const key = normalizeKeyChain(line);
      if (key) {
        const { order, title } = pending;
        pending = null;
        addRow(order, title.join(' '), key);
        continue;
      }
      if (!SECTION_HEADING_RE.test(line) && pending.title.length < MAX_TITLE_CELL_LINES) {
        pending.title.push(line);
        continue;
      }
      flushPending();
    }

    if (SECTION_HEADING_RE.test(line)) {
      // The next numbered section (3. 본문) closes the 찬양 콘티 block.
      inSection = false;
      bullet = null;
    }
  }
  flushPending();

  // The table is the order the service sings. A song that only a commentary
  // bullet names is not in it; without a table, the bullets are the list.
  return tableRows.length > 0 ? songs.filter((song) => !bulletOnly.has(song)) : songs;
}

/**
 * Parse the typed cover page of a 찬양 콘티: date, sermon title, scripture (본문)
 * and the song list with keys. Returns null when the text doesn't look like a cover.
 */
export function parseCoverText(text: string): ContiInfo | null {
  // The session-notes page repeats the song list; never treat it as a cover.
  if (NOTES_RE.test(text)) return null;
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const songs: ContiSongEntry[] = [];
  let date: string | undefined;
  const labeledInfo = parseSermonInfoText(text);
  let sermonTitle = labeledInfo.sermonTitle;
  let scripture = labeledInfo.scripture;
  let lastSong: ContiSongEntry | undefined;

  for (const line of lines) {
    if (!line) continue;
    const scriptureMatch = line.match(SCRIPTURE_RE);
    if (scriptureMatch && SCRIPTURE_VALUE_RE.test(scriptureMatch[1])) {
      scripture ??= scriptureMatch[1].trim();
      continue;
    }
    const songMatch = line.match(SONG_LINE);
    if (songMatch && !songMatch[1].trim().startsWith('본문')) {
      lastSong = {
        title: songMatch[1].trim(),
        key: normalizeKey(songMatch[2]),
        description: songMatch[3].trim() || undefined,
      };
      songs.push(lastSong);
      continue;
    }
    // "진행: I-V1-C-B-C" on its own line belongs to the song just above it.
    const orderLine = lastSong ? extractPartOrder(line) : undefined;
    if (lastSong && orderLine) {
      lastSong.order ??= orderLine;
      continue;
    }
    if (!date) {
      // A labeled 날짜 row wins over any date-shaped text elsewhere on the page.
      const labeled = line.match(DATE_LABEL_RE);
      const dateText = labeled ? labeled[1] : line;
      const isoMatch = dateText.match(ISO_DATE_RE);
      const dateMatch = dateText.match(DATE_RE);
      if (isoMatch) date = `${isoMatch[1]}.${isoMatch[2]}.${isoMatch[3]}`;
      else if (dateMatch) date = `${dateMatch[1]}/${dateMatch[2]}/${dateMatch[3]}`;
    }
    if (!sermonTitle) {
      const quoted = line.match(QUOTED_RE);
      if (quoted) sermonTitle = quoted[1].trim();
    }
  }

  // Covers that lay the conti out as a 순서/찬양/키 table carry no
  // "제목 (Key): 설명" lines at all — read the table instead.
  if (songs.length === 0) songs.push(...parseSongTable(lines));
  // Neither: a `Songlist (12):` heading over plain numbered lines.
  if (songs.length === 0) songs.push(...parseSongList(lines));

  // A 진행 순서 written with the song ("I-V1-C-V2-C-B-C") is how the conti
  // says which parts to sing; it goes with the song to the lyric editor.
  for (const song of songs) {
    const order = song.order ?? extractPartOrder(song.description);
    if (order) song.order = order;
  }

  // A real cover has service context beyond the bare song list.
  if (songs.length === 0 || (!date && !sermonTitle && !scripture)) return null;
  return { date, sermonTitle, scripture, songs };
}
