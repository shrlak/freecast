// Rebuilding a chord sheet's lines from positioned text: rows, chords, Korean spacing
// (shrlak/ppt src/lib/utils/chordSheet.ts, split for size).
import type { PositionedText, SpacingModel } from './chordSheet';
export const HANGUL = /[가-힣ㄱ-ㆎ]/;
export const HANGUL_SYLLABLE = /[가-힣]/;

/** `Key - D | Time - 4/4`, or the Korean sheet's `조(키:Key) - E | 시간 - 4/4`. */
export const KEY_LINE = /^(?:Key|조\s*\(\s*키\s*:\s*Key\s*\))\s*-\s*([A-G](?:#|b|♯|♭)?m?)(?![a-z])/i;
export const FOOTER_START = /^CCLI\s+Song\s*#/i;

/**
 * A section heading: VERSE 1, PRE-CHORUS, BRIDGE 1A, VERSE 1 (KOREAN)…
 * Upper case only — a lyric line never is, and that keeps "Chorus of angels"
 * a lyric.
 */
const HEADING =
  /^(INTRO|VERSE|PRE-?CHORUS|CHORUS|POST-?CHORUS|BRIDGE|TAG|INSTRUMENTAL|INTERLUDE|TURNAROUND|ENDING|OUTRO|REFRAIN|VAMP|CODA|BREAKDOWN|MISC(?:ELLANEOUS)?)(?:\s+(\d+[A-Z]?))?(?:\s*\(\s*(KOREAN|ENGLISH|KOR|ENG|한글|한국어|영어)\s*\))?$/;

/** Part family for each heading word. Intro-like parts get a label other than
 * "I", which the lyric editor reserves for the 간주 title slide. */
const FAMILY: Record<string, string> = {
  INTRO: 'IN',
  VERSE: 'V',
  PRECHORUS: 'PC',
  CHORUS: 'C',
  POSTCHORUS: 'PO',
  BRIDGE: 'B',
  TAG: 'T',
  INSTRUMENTAL: 'IN',
  INTERLUDE: 'IN',
  TURNAROUND: 'IN',
  ENDING: 'O',
  OUTRO: 'O',
  REFRAIN: 'C',
  VAMP: 'T',
  CODA: 'O',
  BREAKDOWN: 'T',
  MISC: 'T',
  MISCELLANEOUS: 'T',
};

/** A chord symbol: D, Bm7, G2, Dm/F, Bbmaj7, E°, Eb(4), (Eb(4)), F#m7… */
const CHORD =
  /^\(?[A-G](?:#|b|♯|♭)?(?:maj|mj|min|dim|aug|sus|add|m|M|°|ø|\+|\d|\((?:[#b]?\d+|sus\d*|add\d+)\))*(?:\/[A-G](?:#|b|♯|♭)?)?\)?$/;
/**
 * The rest of a chord where the sheet sets it apart: a superscript extension
 * ("7", "sus", "maj7", "9(b5)", "j7") or the bass of a slash chord ("/F").
 */
const CHORD_PIECE = /^(?:(?:\d|sus|maj|mj|min|add|dim|aug|m|j|b|#|°|ø|\+|\(|\))+|\/[A-G](?:#|b|♯|♭)?)$/;
/** Bar lines, repeats and the like on an instrumental row. */
const CHART_MARK = /^(?:\|{1,2}:?|:?\|{1,2}|N\.C\.|[xX×]\d+|%|\/|-|\.|\(|\))$/;

/**
 * A playing direction: (To Ch.), (to Turnaround), (Last x to Ch.),
 * (2nd x to Pre-Ch.), (To Ch. / Last time). A direction can wrap onto the
 * next row, so the closing parenthesis is optional here.
 */
export const DIRECTION = /\(\s*(?:\d+(?:st|nd|rd|th)\s*x\s*|last\s*(?:x|time)\s*)?to\b[^)]*\)?/gi;
/** "(1.)", "(2).", "(3)." — the numbered endings of a repeated part. */
export const ENDING_MARK = /^\(\s*\d\s*\.?\s*\)\s*\.?\s*/;

/** Two pieces are in one row when their baselines are this close (× size). */
const ROW_TOLERANCE = 0.3;
/** A gap this wide (× size) between two pieces of text is a word break. */
const WORD_GAP = 0.2;
/**
 * A gap that ends within this distance (× size) of the chord above it was
 * set by the chord, not by the lyric: the renderer pads a syllable out to a
 * wider chord whether or not a space follows it.
 */
export const CHORD_REACH = 1.0;
/** A word no lyric line ends on: the line was wrapped right after it. */
export const DANGLING_WORD = /(?:^|\s)(?:['’]cause|because|the|a|an|and|of|my|your|our|his|their|with)$/i;
/** Stands in a rebuilt line for a Korean gap only the spacing model can settle. */
export const OPEN_GAP = '\u0000';

export interface Row {
  y: number;
  size: number;
  /** Pieces left to right. */
  pieces: PositionedText[];
  /** Text with every gap closed as a space, for classifying the row. */
  text: string;
  left: number;
  right: number;
}

export function clean(text: string): string {
  return text.replace(/[ \t\r\n]+/g, ' ').trim();
}

/** Group pieces of text into rows by baseline, top to bottom. */
export function rowsOf(items: PositionedText[]): Row[] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const groups: PositionedText[][] = [];
  for (const item of sorted) {
    const last = groups[groups.length - 1];
    const anchor = last?.[0];
    if (anchor && Math.abs(anchor.y - item.y) <= ROW_TOLERANCE * Math.max(anchor.size, item.size)) {
      last.push(item);
    } else {
      groups.push([item]);
    }
  }
  return groups.map((group) => {
    const pieces = [...group].sort((a, b) => a.x - b.x);
    return {
      y: group[0].y,
      size: Math.max(...group.map((piece) => piece.size)),
      pieces,
      text: joinPieces(pieces, () => ' '),
      left: pieces[0].x,
      right: Math.max(...pieces.map((piece) => piece.x + piece.width)),
    };
  });
}

/**
 * Join a row's pieces left to right. `openGap` decides a gap wide enough to
 * be a word break that may have been set by a chord instead.
 */
export function joinPieces(pieces: PositionedText[], openGap: (left: PositionedText, right: PositionedText) => string): string {
  let text = '';
  let previous: PositionedText | null = null;
  let end = -Infinity;
  for (const piece of pieces) {
    if (previous && text) {
      const gap = piece.x - end;
      if (/\s$/.test(text) || /^\s/.test(piece.str)) text += ' ';
      else if (gap > WORD_GAP * piece.size) text += openGap(previous, piece);
    }
    text += piece.str;
    previous = piece;
    end = Math.max(end, piece.x + piece.width);
  }
  return clean(text);
}

/** True when every token of a row is a chord, part of one, or a bar line. */
export function isChordRow(text: string): boolean {
  if (HANGUL.test(text)) return false;
  const tokens = text.split(/\s+/).filter(Boolean);
  return (
    tokens.length > 0 &&
    tokens.every((token) => CHORD.test(token) || CHORD_PIECE.test(token) || CHART_MARK.test(token))
  );
}

export interface Heading {
  /** Heading without its language tag, e.g. "VERSE 1". */
  base: string;
  family: string;
  language?: 'ko' | 'en';
}

export function parseSheetHeading(text: string): Heading | null {
  const match = HEADING.exec(text.trim());
  if (!match) return null;
  const word = match[1].replace(/-/g, '');
  const family = FAMILY[word] ?? 'T';
  const tag = match[3];
  const language = !tag ? undefined : /KOR|한/.test(tag) ? 'ko' : 'en';
  return { base: match[2] ? `${match[1]} ${match[2]}` : match[1], family, language };
}

/**
 * Join the syllables a score splits a word into — "exal - tation", "Ho - ly",
 * "wor - thy" — leaving a real dash at the end of a line alone. Korean held
 * syllables ("부활의 - 주", "같-은") are not joined here: whether a word
 * break sits under the dash is the spacing model's call.
 */
export function joinSplitWords(text: string): string {
  return text.replace(/([A-Za-z'’])\s*-\s+(?=[A-Za-z])/g, '$1').replace(/([A-Za-z'’])\s+-\s*(?=[A-Za-z])/g, '$1');
}

// ---- Korean spacing -------------------------------------------------------

/**
 * Syllables that almost never open a word — particles and verb endings
 * (은/는/을/를/의/에, …며/…네/…요). Used only when the corpus has never seen
 * the two syllables side by side. Syllables that also start common words
 * (소리, 기뻐, 어둠, 이름, 고난) are left out: a wrong space there is easier to
 * spot than two words run together.
 */
const BOUND_SYLLABLES = new Set('은는을를의에께과와며면네요죠셨랑듯뿐'.split(''));

function syllables(text: string): string[] {
  return [...text].filter((char) => HANGUL_SYLLABLE.test(char));
}

/**
 * Learn Korean word breaks from lines whose spacing is trusted.
 *
 * An open gap is decided on whole words first: how often the corpus writes
 * the word before the gap run on into what follows it ("기뻐", "영혼이")
 * against how often it writes that word and then a new word starting the same
 * way ("영광 소리쳐", "모든 것"). A stray typo in the corpus is outvoted by
 * the usual spelling. When the corpus has neither, the two syllables either
 * side of the gap decide: a space when it has seen them apart more often than
 * together, and for a pair it has never seen, a join only before a particle
 * or an ending.
 */
export function createSpacingModel(corpus: string[]): SpacingModel {
  const together = new Map<string, number>();
  const apart = new Map<string, number>();
  /** Every start of every word: "기뻐하며" counts for 기뻐, 기뻐하, 기뻐하며. */
  const runOn = new Map<string, number>();
  /** A word, then the start of the word after it: "영광|소", "영광|소리"… */
  const followedBy = new Map<string, number>();
  const add = (map: Map<string, number>, key: string) => map.set(key, (map.get(key) ?? 0) + 1);
  for (const line of corpus) {
    const lineWords = line.split(/\s+/).map(syllables).filter((word) => word.length > 0);
    lineWords.forEach((word, index) => {
      for (let k = 0; k + 1 < word.length; k++) add(together, word[k] + word[k + 1]);
      for (let k = 2; k <= word.length; k++) add(runOn, word.slice(0, k).join(''));
      const next = lineWords[index + 1];
      if (!next) return;
      add(apart, word[word.length - 1] + next[0]);
      const text = word.join('');
      for (let k = 1; k <= next.length; k++) add(followedBy, `${text}|${next.slice(0, k).join('')}`);
    });
  }
  return (left, right) => {
    const leftWord = syllables(left.split(/\s/).pop() ?? '').join('');
    const rightWord = syllables(right.split(/\s/)[0] ?? '').join('');
    if (!leftWord || !rightWord) return true;
    // Counted over every start of what follows — "영광|소리쳐", "영광|소리",
    // "영광|소" — so one rare spelling cannot outvote the usual one.
    let joined = 0;
    let spaced = 0;
    for (let length = 1; length <= rightWord.length; length++) {
      const start = rightWord.slice(0, length);
      joined += runOn.get(leftWord + start) ?? 0;
      spaced += followedBy.get(`${leftWord}|${start}`) ?? 0;
    }
    if (joined !== spaced) return spaced > joined;
    const a = leftWord[leftWord.length - 1];
    const b = rightWord[0];
    const inWord = together.get(a + b) ?? 0;
    const betweenWords = apart.get(a + b) ?? 0;
    if (inWord + betweenWords > 0) return betweenWords > inWord;
    return !BOUND_SYLLABLES.has(b);
  };
}

/** Close every open gap of a line with the model, left to right. */
export function settleGaps(line: string, spacing: SpacingModel): string {
  if (!line.includes(OPEN_GAP)) return line;
  const parts = line.split(OPEN_GAP);
  let text = parts[0];
  for (let index = 1; index < parts.length; index++) {
    text += (spacing(text, parts[index]) ? ' ' : '') + parts[index];
  }
  return clean(text);
}

// ---- lines ---------------------------------------------------------------

export function normalizedLine(line: string): string {
  return line.toLowerCase().replace(/\(x\d+\)/g, '').replace(/[^0-9a-z가-힣]+/g, '');
}

/**
 * Write a block the sheet repeats three or more times in a row once, marked
 * with how often it is sung — "좌정하사 다스리소서 (x4)", as last year's slides
 * did. Twice is left as written: a chorus sung "A B A B" reads better whole.
 */
export function collapseRepeats(lines: string[]): string[] {
  const out: string[] = [];
  let index = 0;
  while (index < lines.length) {
    let best: { size: number; times: number } | null = null;
    for (let size = 1; size <= 4 && index + size * 3 <= lines.length; size++) {
      const block = lines.slice(index, index + size).map(normalizedLine);
      if (block.some((line) => !line)) continue;
      let times = 1;
      while (
        index + (times + 1) * size <= lines.length &&
        lines
          .slice(index + times * size, index + (times + 1) * size)
          .every((line, offset) => normalizedLine(line) === block[offset])
      ) {
        times += 1;
      }
      if (times >= 3 && (!best || times * size > best.times * best.size)) best = { size, times };
    }
    if (best) {
      const block = lines.slice(index, index + best.size);
      out.push(...block.slice(0, -1), `${block[block.length - 1]} (x${best.times})`);
      index += best.size * best.times;
    } else {
      out.push(lines[index]);
      index += 1;
    }
  }
  return out;
}

/** Korean lines this short (in syllables) are a phrase, not a slide line. */
const SHORT_KOREAN_LINE = 4;

/**
 * A Korean translation is often written in short phrases, one under each
 * English phrase ("사랑해요" / "신실하신 나의 주님"). A phrase that short is
 * joined to the line after it — or, at the end of a part, the line before —
 * so a slide carries whole sentences rather than a column of fragments.
 */
export function joinShortKoreanLines(lines: string[]): string[] {
  const out: string[] = [];
  let carry = '';
  for (const line of lines) {
    const text = carry ? `${carry} ${line}` : line;
    carry = '';
    if (syllables(text).length <= SHORT_KOREAN_LINE && !/\(x\d+\)$/.test(text)) carry = text;
    else out.push(text);
  }
  if (carry) {
    if (out.length > 0) out[out.length - 1] = `${out[out.length - 1]} ${carry}`;
    else out.push(carry);
  }
  return out;
}
