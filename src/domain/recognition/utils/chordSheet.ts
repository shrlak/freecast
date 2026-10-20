// Reads a chord-sheet 콘티 — the CCLI SongSelect / ChordPro "Chord Sheets"
// PDF a praise team exports, one song after another — straight from its text
// layer, so the lyrics need no 악보 recognition at all.
//
// Such a PDF is laid out for musicians, not for reading top to bottom:
//
//   - every song opens with a header (title, credits, `Key - D | Time - 4/4`)
//     and closes with a CCLI footer, and a long song runs onto the next page
//     with neither;
//   - the page has two columns, each a run of sections (VERSE 1, CHORUS,
//     VERSE 1 (KOREAN), BRIDGE …);
//   - every lyric line sits under a row of chords, and each syllable a chord
//     lands on is written as its own piece of text — in the text stream those
//     pieces come after everything else on the page, so reading the stream in
//     order scrambles every line.
//
// So the lines are rebuilt from where each piece of text sits on the page:
// grouped into rows by baseline, a column at a time, chord rows dropped, and
// the pieces of a lyric row joined left to right. Bilingual sheets write the
// Korean and the English of a part either in one section (Korean lines, then
// English lines) or in two ("VERSE 1" and "VERSE 1 (KOREAN)"); both come out
// as one part carrying both languages.
//
// One thing the page cannot say is Korean word spacing where a chord is
// wider than the syllable under it: the renderer pads that syllable out to
// the chord, and the padding looks exactly like a space whether the lyric has
// one there ("모든 것") or not ("높고"). Those gaps are settled by a spacing
// model learned from lyrics this church already has — see createSpacingModel.
import { CHORD_REACH, DANGLING_WORD, DIRECTION, ENDING_MARK, FOOTER_START, HANGUL, HANGUL_SYLLABLE, Heading, KEY_LINE, OPEN_GAP, Row, clean, collapseRepeats, createSpacingModel, isChordRow, joinPieces, joinShortKoreanLines, joinSplitWords, normalizedLine, parseSheetHeading, rowsOf, settleGaps } from './chordText';
/** One piece of text on a PDF page, in PDF user space (y grows upward). */
export interface PositionedText {
  str: string;
  x: number;
  y: number;
  width: number;
  /** Font size — the glyph height. */
  size: number;
}

export interface PositionedPage {
  width: number;
  height: number;
  items: PositionedText[];
}

/** One part of a song as the sheet writes it, both languages side by side. */
export interface ChordSheetPart {
  /** Part label the lyric editor uses: V, V2, PC, C, B, T, O… */
  label: string;
  /** The heading as printed, without its language tag ("VERSE 1"). */
  heading: string;
  /** Korean lines. */
  ko: string[];
  /** English lines (or the lines of a part written only in English). */
  en: string[];
}

export interface ChordSheetSong {
  /** Title as printed, without the alternate title in parentheses. */
  title: string;
  /** "춤추는 세대 (주 자비 춤추게 하네)" → "주 자비 춤추게 하네". */
  altTitle?: string;
  key?: string;
  /** 1-based pages the song covers, in order. */
  pages: number[];
  parts: ChordSheetPart[];
}

/** Decides a Korean gap the page leaves open: true puts a space there. */
export type SpacingModel = (left: string, right: string) => boolean;

export interface ChordSheetOptions {
  /**
   * Korean lyric lines with trusted spacing (the 찬양 라이브러리, last year's
   * slides), to learn word breaks from. The sheet's own unambiguous text is
   * always added to it.
   */
  corpus?: string[];
}


interface RawLine {
  text: string;
  /** Right edge of the row it was read from, to tell a wrapped line. */
  right: number;
}

interface RawSection {
  heading: Heading;
  lines: RawLine[];
  /** Normalized lines that opened with a numbered-ending mark, to drop a repeat. */
  endings: Set<string>;
}

interface SongDraft {
  title: string;
  altTitle?: string;
  key?: string;
  pages: number[];
  sections: RawSection[];
}

/** Header rows (title … Key line) at the top of a page that opens a song. */
function readHeader(rows: Row[]): { title: string; altTitle?: string; key?: string; bottom: number } | null {
  // Only the top of the page can hold a header.
  const top = rows.slice(0, 8);
  const keyIndex = top.findIndex((row) => KEY_LINE.test(row.text));
  if (keyIndex <= 0) return null;
  const header = top.slice(0, keyIndex + 1);
  const biggest = Math.max(...header.map((row) => row.size));
  const titleRows = header.filter((row) => row.size >= biggest - 0.5);
  const rawTitle = clean(titleRows.map((row) => row.text).join(' '));
  const alt = /^(.*?\S)\s*[(（]([^()（）]+)[)）]\s*$/.exec(rawTitle);
  return {
    title: alt ? alt[1].trim() : rawTitle,
    ...(alt ? { altTitle: alt[2].trim() } : {}),
    key: KEY_LINE.exec(top[keyIndex].text)?.[1].replace('♯', '#').replace('♭', 'b'),
    bottom: top[keyIndex].y,
  };
}

/**
 * Rebuild one lyric row. A gap between two Korean syllables that the chord
 * above could have set — or a held-syllable dash between them — is left open
 * for the spacing model; every other gap is a space.
 */
function lyricText(row: Row, chords: PositionedText[]): string {
  const pieces: PositionedText[] = [];
  const dashes = new Set<PositionedText>();
  row.pieces.forEach((piece, index) => {
    const before = row.pieces[index - 1]?.str ?? '';
    const after = row.pieces[index + 1]?.str ?? '';
    // "부활의 - 주": a dash that only holds a Korean syllable is not text.
    if (/^\s*[-–]\s*$/.test(piece.str) && HANGUL_SYLLABLE.test(before.slice(-1)) && HANGUL_SYLLABLE.test(after[0] ?? '')) {
      dashes.add(row.pieces[index + 1]);
      return;
    }
    pieces.push(piece);
  });
  return joinPieces(pieces, (left, right) => {
    const korean = HANGUL_SYLLABLE.test(left.str.slice(-1)) && HANGUL_SYLLABLE.test(right.str[0] ?? '');
    if (!korean) return ' ';
    if (dashes.has(right)) return OPEN_GAP;
    // A syllable a chord is written over was placed for the chord.
    if (chords.some((chord) => Math.abs(chord.x - right.x) < 0.5)) return OPEN_GAP;
    const reach = chords
      .filter((chord) => chord.x < right.x - 0.5)
      .reduce((end, chord) => Math.max(end, chord.x + chord.width), -Infinity);
    return right.x - reach < CHORD_REACH * right.size ? OPEN_GAP : ' ';
  });
}

/**
 * Rebuild the songs of a chord-sheet PDF from its pages' positioned text.
 * Returns null when the PDF is not a chord sheet (no page opens with a song
 * header, or nothing reads as lyrics), so an ordinary 콘티 is left to the
 * cover and 악보 readers.
 */
export function parseChordSheet(pages: PositionedPage[], options: ChordSheetOptions = {}): ChordSheetSong[] | null {
  const songs: SongDraft[] = [];
  let current: SongDraft | null = null;
  let section: RawSection | null = null;

  pages.forEach((page, pageIndex) => {
    const items = page.items.filter((item) => item.str.trim() && Number.isFinite(item.x) && Number.isFinite(item.y));
    if (items.length === 0) return;

    // Header and footer are read across the full width.
    const fullRows = rowsOf(items);
    const header = readHeader(fullRows);
    const footer = fullRows.find((row) => FOOTER_START.test(row.text));
    const top = header ? header.bottom - 0.5 : Infinity;
    const bottom = footer ? footer.y + 0.5 : -Infinity;

    if (header) {
      current = { title: header.title, altTitle: header.altTitle, key: header.key, pages: [], sections: [] };
      songs.push(current);
      section = null;
    }
    const song: SongDraft | null = current;
    if (!song) return;
    song.pages.push(pageIndex + 1);

    const body = items.filter((item) => item.y < top && item.y > bottom);
    const middle = page.width / 2;
    for (const column of [body.filter((item) => item.x < middle), body.filter((item) => item.x >= middle)]) {
      const rows = rowsOf(column);
      if (rows.length === 0) continue;
      const chordRows = rows.filter((row) => isChordRow(clean(row.text.replace(DIRECTION, ' '))));
      const columnLeft = Math.min(...rows.map((row) => row.left));
      const columnRight = Math.max(...rows.map((row) => row.right));
      let openDirection = false;
      for (const row of rows) {
        if (chordRows.includes(row)) continue;
        const heading = parseSheetHeading(row.text);
        if (heading) {
          section = { heading, lines: [], endings: new Set() };
          song.sections.push(section);
          openDirection = false;
          continue;
        }
        // The chords printed over this row: the chord rows just above it.
        const chords = chordRows
          .filter((chordRow) => chordRow.y > row.y && chordRow.y - row.y < 2.2 * row.size)
          .flatMap((chordRow) => chordRow.pieces);
        let text = lyricText(row, chords);
        // The tail of a direction that wrapped from the row above: "Pre-Ch.)".
        if (openDirection) {
          openDirection = false;
          const close = /^[^()]{0,24}\)/.exec(text);
          if (close) text = text.slice(close[0].length);
        }
        text = clean(
          text.replace(DIRECTION, (match) => {
            if (!match.endsWith(')')) openDirection = true;
            return ' ';
          }),
        );
        if (!text || isChordRow(text.replaceAll(OPEN_GAP, ' ')) || !/\p{L}/u.test(text)) continue;
        const ending = ENDING_MARK.exec(text);
        const line = clean(joinSplitWords(text.slice(ending ? ending[0].length : 0)));
        if (!/\p{L}/u.test(line)) continue;
        if (!section) {
          // Lyrics before any heading: the song's first part, unnamed.
          section = { heading: { base: 'VERSE', family: 'V' }, lines: [], endings: new Set() };
          song.sections.push(section);
        }
        if (ending) {
          // Endings (1.) and (2.) often sing the same words: keep them once.
          const key = normalizedLine(line.replaceAll(OPEN_GAP, ''));
          if (section.endings.has(key)) continue;
          section.endings.add(key);
        }
        // A column too narrow for a line wraps it: the rest starts in lower
        // case, or the line broke after a word no line ends on ("'cause").
        const previous = section.lines[section.lines.length - 1];
        if (
          previous &&
          (/^[a-z]/.test(line) || DANGLING_WORD.test(previous.text)) &&
          !HANGUL.test(previous.text) &&
          !HANGUL.test(line) &&
          previous.right > columnLeft + 0.7 * (columnRight - columnLeft)
        ) {
          previous.text = `${previous.text} ${line}`;
          previous.right = row.right;
          continue;
        }
        section.lines.push({ text: line, right: row.right });
      }
    }
  });

  // Korean spacing is learned from the corpus and from the sheet itself:
  // every word break it printed unambiguously is evidence too.
  const own = songs.flatMap((song) =>
    song.sections.flatMap((draft) => draft.lines.flatMap((line) => line.text.split(OPEN_GAP))),
  );
  const spacing = createSpacingModel([...(options.corpus ?? []), ...own]);
  const result = songs.map((draft) => toSong(draft, spacing)).filter((song) => song.parts.length > 0);
  return result.length > 0 ? result : null;
}

/**
 * "(부르신 곳에서)" closing a bridge only leads back into the chorus that
 * starts with those words; it is sung as the chorus, not on the bridge's slide.
 */
function dropLeadIn(lines: string[], firstLines: string[], partIndex: number): string[] {
  const last = lines[lines.length - 1];
  const inner = last && /^\((.+)\)$/.exec(last.trim());
  if (!inner) return lines;
  const lead = normalizedLine(inner[1]);
  const leadsIn = lead.length >= 2 && firstLines.some((first, index) => index !== partIndex && first.startsWith(lead));
  return leadsIn ? lines.slice(0, -1) : lines;
}

/** An English line of one word ("Jesus") ends the line before it. */
function joinSingleWords(lines: string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    if (out.length > 0 && !/\s/.test(line.trim()) && !/\(x\d+\)$/.test(out[out.length - 1])) {
      out[out.length - 1] = `${out[out.length - 1]} ${line}`;
    } else {
      out.push(line);
    }
  }
  return out;
}

/** The text a part repeats, or the text itself: "ABAB" → "AB". */
function shortestPeriod(text: string): string {
  for (let size = 1; size < text.length; size++) {
    if (text.length % size === 0 && text === text.slice(0, size).repeat(text.length / size)) return text.slice(0, size);
  }
  return text;
}

function toSong(draft: SongDraft, spacing: SpacingModel): ChordSheetSong {
  // "VERSE 1" and "VERSE 1 (KOREAN)" are one part in two languages.
  const merged: { heading: Heading; ko: string[]; en: string[] }[] = [];
  for (const section of draft.sections) {
    const lines = section.lines.map((line) => settleGaps(line.text, spacing)).filter(Boolean);
    if (lines.length === 0) continue;
    const ko = section.heading.language === 'en' ? [] : lines.filter((line) => HANGUL.test(line));
    const en = section.heading.language === 'ko' ? [] : lines.filter((line) => !HANGUL.test(line));
    const partner = section.heading.language
      ? merged.find((part) => part.heading.base === section.heading.base)
      : undefined;
    if (partner) {
      if (partner.ko.length === 0) partner.ko = ko;
      if (partner.en.length === 0) partner.en = en;
      continue;
    }
    merged.push({ heading: section.heading, ko, en });
  }

  const counts = new Map<string, number>();
  const seen = new Set<string>();
  const parts: ChordSheetPart[] = [];
  const firstLines = merged.map((part) => normalizedLine(part.ko[0] ?? part.en[0] ?? ''));
  for (const [index, part] of merged.entries()) {
    const ko = joinShortKoreanLines(collapseRepeats(dropLeadIn(part.ko, firstLines, index)));
    const en = joinSingleWords(collapseRepeats(dropLeadIn(part.en, firstLines, index)));
    if (ko.length === 0 && en.length === 0) continue;
    // An ending that only repeats the intro (or any earlier part) adds no slide.
    // Compared as text, so a line the column wrapped differently still matches.
    const content = `${shortestPeriod(ko.map(normalizedLine).join(''))}|${shortestPeriod(en.map(normalizedLine).join(''))}`;
    if (seen.has(content)) continue;
    seen.add(content);
    const occurrence = (counts.get(part.heading.family) ?? 0) + 1;
    counts.set(part.heading.family, occurrence);
    parts.push({
      label: occurrence === 1 ? part.heading.family : `${part.heading.family}${occurrence}`,
      heading: part.heading.base,
      ko,
      en,
    });
  }
  return {
    title: draft.title,
    ...(draft.altTitle ? { altTitle: draft.altTitle } : {}),
    ...(draft.key ? { key: draft.key } : {}),
    pages: draft.pages,
    parts,
  };
}

// ---- songs for the lyric editor --------------------------------------------
