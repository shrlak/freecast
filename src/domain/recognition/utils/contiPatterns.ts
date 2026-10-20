// The patterns a 콘티 cover is read with (shrlak/ppt src/lib/utils/contiText.ts, split for size).
/** `주님의 사랑 (E): 설명...` — title, musical key, description. */
export const SONG_LINE = /^(.{1,40}?)\s*[(（]\s*([A-Ga-g][#♯bB♭]?m?)\s*[)）]\s*[:：]\s*(.*)$/;
export const DATE_RE = /\b(\d{1,2})\s*[/.]\s*(\d{1,2})\s*[/.]\s*(\d{2,4})\b/;
/** `2026.08.09` — the year-first form the table-layout cover writes. */
export const ISO_DATE_RE = /\b(\d{4})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{1,2})\b/;
export const QUOTED_RE = /[“"]([^“”"]{2,60})[”"]/;
export const NOTES_RE = /[세셰]션\s*노트/;

/**
 * Separator between a cover's field label and its value. Covers written as a
 * table draw a real `|` glyph between the two ("본문 | 전도서 12 장 1-8 절"),
 * while the prose layout uses a colon ("본문: 로마서 5장 1-11절"); a plain
 * space is also enough once the label itself has been matched.
 */
const LABEL_GAP = String.raw`\s*[:：|｜]?\s*`;

export const SCRIPTURE_RE = new RegExp(String.raw`^(?:본문|말씀)${LABEL_GAP}(\S.*)$`);
/** An explicitly labeled sermon title — the most reliable form. */
export const SERMON_TITLE_RE = new RegExp(
  String.raw`^(?:설교\s*제목|말씀\s*제목|설교)${LABEL_GAP}(\S.*)$`,
);
/** `주제 | 청년의 때` — a theme row, used only when no explicit label exists. */
export const SERMON_THEME_RE = new RegExp(String.raw`^(?:주제|제목)${LABEL_GAP}(\S.*)$`);
export const DATE_LABEL_RE = new RegExp(String.raw`^(?:날짜|일자|예배\s*일)${LABEL_GAP}(\S.*)$`);

/** A scripture value must name a chapter/verse — otherwise "본문" is a heading. */
export const SCRIPTURE_VALUE_RE = /\d\s*[장편절:]/;

/** One musical key as a conti writes it: E, F#, Ab, F#m. */
export const KEY = String.raw`[A-Ga-g](?:#|♯|b|♭|B)?m?`;
/** Keys are often a modulation chain — "F -> Gb", "F->Ab->G", "F → Gb". */
const KEY_ARROW = String.raw`\s*(?:->|=>|→|⇒|~)\s*`;

/**
 * Row of the `순서 | 찬양 | 키` table: an order number, the title, and the
 * key (or key chain) in the last column — "3 어려운 일 당할 때 F -> Ab -> G".
 * The title is lazy so the chain, not just its last key, lands in the key column.
 */
export const SONG_TABLE_ROW = new RegExp(
  String.raw`^(\d{1,2})\s*[.)]?${LABEL_GAP}(\S.*?)\s+(${KEY}(?:${KEY_ARROW}${KEY})*)\s*$`,
);
/**
 * `1 G` — a row whose 찬양 cell has no text at all. The title was written by
 * hand (pen on a tablet, or a scan pasted into the cell), so the PDF holds it
 * only as ink; the order number and the key are still typed.
 */
export const UNTITLED_TABLE_ROW = new RegExp(
  String.raw`^(\d{1,2})\s*[.)]?${LABEL_GAP}(${KEY}(?:${KEY_ARROW}${KEY})*)\s*$`,
);
/** `1` — an order cell alone on its line: the row's cells sat on different baselines. */
export const ORDER_CELL_RE = /^(\d{1,2})\s*[.)]?$/;
/** `1 주님의 은혜 넘치네` — order and title, with the key cell on the next line. */
export const ORDER_AND_TITLE_RE = new RegExp(String.raw`^(\d{1,2})\s*[.)]?${LABEL_GAP}(\S.*)$`);
/** A title cell can wrap, but a table row is never more than a few lines tall. */
export const MAX_TITLE_CELL_LINES = 3;

/** `• 매일매일 (A Key)` — the per-song commentary heading under the table. */
export const SONG_BULLET_RE = /^[•·∙▪▫◦*]\s*(.*?)\s*[(（]([^)）]{1,60})[)）]\s*$/;
/** `o 이 찬양은…` — the indented description under a bullet heading. */
export const BULLET_BODY_RE = /^[o○◦-]\s+(\S.*)$/;

/**
 * `2. 찬양 콘티 (Plan A)` — where the song table starts. The section number is
 * optional and the wording varies between contis (찬양 콘티, 찬양 순서,
 * 예배 순서), so match on the heading words rather than the exact phrase.
 */
export const SONG_SECTION_RE = /^(?:\d+\s*[.)]\s*)?.{0,10}(?:찬양\s*콘티|찬양\s*순서|예배\s*순서|콘티)/;
/**
 * `(Plan A)`, `PLAN B`, `플랜 2` — which of several alternative song lists a
 * section is. A conti that writes a Plan B is offering a fallback set: the
 * service sings the first plan, and the second must not add its songs to it.
 */
export const PLAN_RE = /(?:plan|플랜)\s*[-:.]?\s*([A-Za-z0-9]|[가-힣])(?![A-Za-z])/i;
/** Any other numbered section heading ("1. 말씀 묵상", "3. 본문") ends it. */
export const SECTION_HEADING_RE = /^\d+\s*[.)]\s*\S/;
/**
 * The table's own header row, which carries no song. Column names differ
 * between contis (순서/번호, 찬양/곡/제목, 키/Key), and the row is by itself
 * proof that a song table follows — so it opens the section as well as being
 * skipped, for a conti that never writes a 찬양 콘티 heading at all.
 */
export const TABLE_HEADER_RE =
  /^(?:순서|번호|No\.?)[\s|｜]*(?:찬양|곡|곡명|제목)[\s|｜]*(?:키|key)\s*$/i;

/**
 * `Songlist (12): Thank you!` — a cover that lists its songs as plain
 * numbered lines under an English heading (a 찬양집회 conti), with the count
 * in parentheses when it writes one.
 */
export const SONG_LIST_HEADING_RE =
  /^(?:song\s*list|set\s*list|songs|찬양\s*(?:리스트|목록)|곡\s*목록)\s*(?:[(（]\s*(\d{1,2})\s*(?:곡|songs?)?\s*[)）])?\s*(?:[:：]|$)/i;
/** `3. Praise (English) AK` — one numbered line of that list. */
export const SONG_LIST_ROW_RE = /^(\d{1,2})\s*[.)]\s*(\S.*)$/;
/** `(English/Korean)`, `(Korean)` — which language a listed song is sung in. */
const LANGUAGE_WORD = String.raw`(?:english|korean|eng|kor|영어|한국어|한글|영|한)`;
export const LANGUAGE_TAG_RE = new RegExp(
  String.raw`\s*[(（]\s*${LANGUAGE_WORD}(?:\s*[/&,+·]\s*${LANGUAGE_WORD})*\s*[)）]`,
  'gi',
);
/** `DK`, `EC&DK` — the initials of who leads the song, written last. */
export const LEADER_INITIALS_RE = /\s+[A-Z]{2,3}(?:\s*[&/,]\s*[A-Z]{2,3})*\s*$/;
/** `Above All + I Will Worship You` — two songs sung as one medley. */
export const MEDLEY_SPLIT_RE = /\s+[+＋]\s+/;
/** A separator written between a title's two languages. */
const TITLE_SEPARATOR = String.raw`\s*[/|｜:·\-–—]?\s*`;
export const ENGLISH_THEN_KOREAN_RE = new RegExp(
  String.raw`^([A-Za-z][^가-힣]*?)${TITLE_SEPARATOR}[(（]?\s*([가-힣][^A-Za-z]*?)\s*[)）]?$`,
);
export const KOREAN_THEN_ENGLISH_RE = new RegExp(
  String.raw`^([^A-Za-z]*[가-힣][^A-Za-z]*?)${TITLE_SEPARATOR}[(（]?\s*([A-Za-z][^가-힣]*?)\s*[)）]?$`,
);
