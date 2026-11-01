/** One slide of an announcement: its lines and the links shown as QR codes on it. */
export interface AnnouncementPage {
  body: string[];
  links: string[];
}

export interface Announcement {
  title: string;
  /** Every line, all slides together. */
  body: string[];
  /** Every link, all slides together. */
  links: string[];
  /** One entry per slide (an empty line in the text starts the next one). Missing = one slide of `body` / `links`. */
  pages?: AnnouncementPage[];
}

/** The slides of an announcement (at least one). */
export const announcementPages = (a: Announcement): AnnouncementPage[] =>
  a.pages?.length ? a.pages : [{ body: a.body, links: a.links }];

const MD_LINK = /\[([^\]]+)\]\(([^)\s]+)\)/g;
const URL = /(?:https?:\/\/|www\.)[^\s<>()\]]+|\b(?:[a-z0-9-]+\.)+[a-z]{2,}\/[^\s<>()\]]+/gi;
/** "1." "1)" "(1)" "１．" "①" at the start of a line, then the rest. Not "3.14", "10:30" or "2026.". */
const NUMBERED = /^(\s*)(?:\(\s*(\d{1,2})\s*\)|(\d{1,2})\s*[.)．。](?!\d)|([①-⑳]))\s*(.*)$/;
/** "<제목>" (or ＜제목＞, 《제목》), and what follows it on the line. */
const BRACKETED = /^[<＜《〈]\s*(.+?)\s*[>＞》〉]\s*(.*)$/;
const FULL_WIDTH_DIGIT = /[０-９]/g;

function normalizeLink(u: string): string {
  const trimmed = u.replace(/[.,;:!?)]+$/, '');
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/** Remove links from a body line, collecting them. Returns null when nothing meaningful is left. */
function stripLinks(line: string, links: string[]): string | null {
  let had = false;
  let out = line.replace(MD_LINK, (_, text: string, url: string) => {
    links.push(normalizeLink(url));
    had = true;
    return text;
  });
  out = out.replace(URL, (u) => {
    links.push(normalizeLink(u));
    had = true;
    return '';
  });
  if (!had) return line;
  out = out.replace(/\s{2,}/g, ' ').trim();
  // "- 신청: <link>" introduced only the link: drop the whole line.
  if (/^[-•*·]?\s*[^\s:：]{0,10}\s*[:：]?$/.test(out)) return null;
  // "… 많은 관심 부탁드립니다! 사인업: <link>": the label left at the end goes too.
  return out.replace(/\s+[^\s:：]{1,10}\s*[:：]$/, '');
}

/** A body line as written: its text (links out) and how far it was indented. */
interface RawLine { text: string; indent: number }
const indentOf = (line: string) => (/^[ \t\u3000]*/.exec(line)![0]).replace(/\t/g, '    ').replace(/\u3000/g, '  ').length;
const BULLET = /^[*•◦·]\s+/;

/**
 * Lines of one announcement as shown on the slide: "* " bullets become "•", and lines indented
 * under them "◦" with an indent (each deeper level of indentation as written goes one step in).
 */
function layoutLines(lines: RawLine[]): string[] {
  const widths = [...new Set(lines.map((l) => l.indent))].sort((a, b) => a - b);
  const level = (l: RawLine) => widths.indexOf(l.indent);
  const bulletLevels = lines.filter((l) => BULLET.test(l.text)).map(level);
  const top = bulletLevels.length ? Math.min(...bulletLevels) : 0;
  return lines.map((l) => {
    const depth = Math.max(0, level(l) - top);
    const pad = '\u3000'.repeat(depth);
    return BULLET.test(l.text) ? `${pad}${depth ? '◦' : '•'} ${l.text.replace(BULLET, '')}` : `${pad}${l.text}`;
  });
}

interface Head {
  /** The number written (null for "<제목>" without one). */
  n: number | null;
  indented: boolean;
  /** Title in <brackets>: always an announcement, never a numbered body line. */
  bracketed: boolean;
  title: string;
  /** Text after "<제목>" on the same line. */
  tail: string;
}

function readHead(line: string): Head | null {
  const plain = line.replace(FULL_WIDTH_DIGIT, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0));
  const m = NUMBERED.exec(plain);
  const rest = m ? m[5] : plain.trim();
  const b = BRACKETED.exec(rest);
  if (!m) return b ? { n: null, indented: false, bracketed: true, title: b[1], tail: b[2].trim() } : null;
  const n = m[4] ? m[4].charCodeAt(0) - 0x2460 + 1 : Number(m[2] ?? m[3]);
  const indented = /\t| {2,}/.test(m[1]);
  if (b) return { n, indented, bracketed: true, title: b[1], tail: b[2].trim() };
  return rest.trim() ? { n, indented, bracketed: false, title: rest.trim(), tail: '' } : null;
}

/**
 * Read announcements written as "1. <제목>" (or "1. 제목") followed by their lines. Numbering is
 * redone in order. A numbered line counts as a new announcement when it has a <제목>, or when it
 * carries the next number and is not continuing a numbered list inside the announcement
 * ("1. 일시 / 2. 장소" under "1. <수련회>" stay its lines); an indented one never does. An empty
 * line inside an announcement puts what follows on a new slide of the same announcement. Links
 * become QR codes instead of text. Text without any numbers: each block (split by empty lines) is
 * one announcement, its first line the title.
 */
export function parseAnnouncements(text: string): Announcement[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const items: { title: string; pages: { body: RawLine[]; links: string[] }[] }[] = [];
  let last = 0; // the number of the last announcement, as written
  let sub = 0; // the number of the last numbered line inside the current announcement
  let afterBlank = true;
  let newPage = false;
  const page = () => items[items.length - 1].pages[items[items.length - 1].pages.length - 1];
  const addLine = (line: string, indent = indentOf(line)) => {
    const cur = items[items.length - 1];
    if (newPage && (page().body.length || page().links.length)) cur.pages.push({ body: [], links: [] });
    newPage = false;
    const kept = stripLinks(line.trim(), page().links);
    if (kept) page().body.push({ text: kept, indent });
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      afterBlank = true;
      sub = 0;
      newPage = true;
      continue;
    }
    const head = readHead(line);
    let isItem = false;
    if (head?.bracketed) isItem = true;
    else if (head && head.n !== null && !head.indented) {
      if (!items.length) isItem = true;
      else if (head.n === last + 1) isItem = sub !== head.n - 1;
      else if (head.n > last + 1) isItem = afterBlank;
    }
    if (isItem && head) {
      items.push({ title: head.title, pages: [{ body: [], links: [] }] });
      last = head.n ?? last + 1;
      sub = 0;
      newPage = false;
      if (head.tail) addLine(head.tail, 0);
    } else if (items.length) {
      if (head?.n != null) sub = head.n;
      addLine(line);
    }
    afterBlank = false;
  }

  if (!items.length) {
    // No numbers at all: one announcement per block.
    for (const block of text.replace(/\r\n?/g, '\n').split(/\n\s*\n/)) {
      const [title, ...rest] = block.split('\n').map((l) => l.trim()).filter(Boolean);
      if (!title) continue;
      const p: { body: RawLine[]; links: string[] } = { body: [], links: [] };
      for (const l of rest) {
        const kept = stripLinks(l, p.links);
        if (kept) p.body.push({ text: kept, indent: 0 });
      }
      items.push({ title, pages: [p] });
    }
  }

  return items.map(({ title, pages: raw }) => {
    const kept = raw.filter((p) => p.body.length || p.links.length);
    const used = kept.length ? kept : [raw[0]];
    // Indentation is read across the whole announcement, so a slide break keeps its levels.
    const shown = layoutLines(used.flatMap((p) => p.body));
    let at = 0;
    const pages: AnnouncementPage[] = used.map((p) => ({ body: shown.slice(at, (at += p.body.length)), links: p.links }));
    return { title, body: shown, links: pages.flatMap((p) => p.links), pages };
  });
}
