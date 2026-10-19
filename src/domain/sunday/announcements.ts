export interface Announcement {
  title: string;
  body: string[];
  links: string[];
}

const ITEM_BRACKET = /^\s*\d{1,2}\s*[.)]\s*<\s*(.+?)\s*>\s*(.*)$/;
const ITEM_PLAIN = /^\s*\d{1,2}\s*[.)]\s*(.+)$/;
const MD_LINK = /\[([^\]]+)\]\(([^)\s]+)\)/g;
const URL = /(?:https?:\/\/|www\.)[^\s<>()\]]+|\b(?:[a-z0-9-]+\.)+[a-z]{2,}\/[^\s<>()\]]+/gi;

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
  return out;
}

/**
 * Read announcements written as "1. <제목>" followed by body lines. Numbering is
 * redone in order; links become QR codes instead of text.
 */
export function parseAnnouncements(text: string): Announcement[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const useBrackets = lines.some((l) => ITEM_BRACKET.test(l));
  const items: Announcement[] = [];
  for (const raw of lines) {
    const line = raw.trimEnd();
    const head = useBrackets ? ITEM_BRACKET.exec(line) : ITEM_PLAIN.exec(line);
    if (head) {
      const item: Announcement = { title: head[1].trim(), body: [], links: [] };
      const tail = useBrackets ? head[2]?.trim() : '';
      if (tail) {
        const kept = stripLinks(tail, item.links);
        if (kept) item.body.push(kept);
      }
      items.push(item);
      continue;
    }
    const current = items[items.length - 1];
    if (!current || !line.trim()) continue;
    const kept = stripLinks(line.trim(), current.links);
    if (kept) current.body.push(kept);
  }
  return items;
}
