export interface PrayerTopic {
  title: string;
  points: string[];
}

const NUMBERED = /^\s*(?:(\d{1,2})\s*[.)]|\((\d{1,2})\)|([①-⑳]))\s*(.+)$/;
const BULLET = /^\s*[-•*·●▪]\s*(.+)$/;
const strip = (s: string) => s.replace(/\*\*|__/g, '').trim();

/**
 * Read prayer topics as churches usually post them: numbered lines start a topic,
 * the lines under it (bulleted or not) are its points. Text above the first number
 * is a header and is dropped. With no numbers at all, each line is one topic.
 */
export function parsePrayerTopics(text: string): PrayerTopic[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lines.some((l) => NUMBERED.test(l))) return lines.map((l) => ({ title: strip(l.replace(BULLET, '$1')), points: [] }));
  const topics: PrayerTopic[] = [];
  for (const line of lines) {
    const n = NUMBERED.exec(line);
    if (n) {
      topics.push({ title: strip(n[4]), points: [] });
    } else if (topics.length) {
      topics[topics.length - 1].points.push(strip(line.replace(BULLET, '$1')));
    }
  }
  return topics;
}

/** Rough line count of a topic on a slide (title + wrapped points). */
function weight(t: PrayerTopic, charsPerLine = 38): number {
  const wrap = (s: string) => Math.max(1, Math.ceil(s.length / charsPerLine));
  return wrap(t.title) + t.points.reduce((n, p) => n + wrap(p), 0);
}

/**
 * Split topics across slides: at most 3 per slide, spread evenly (4 → 2+2, 5 → 3+2),
 * adding slides while any slide would run past `maxLines`.
 */
export function planPrayerSlides(topics: PrayerTopic[], maxLines = 12): PrayerTopic[][] {
  if (!topics.length) return [];
  for (let count = Math.ceil(topics.length / 3); count <= topics.length; count++) {
    const base = Math.floor(topics.length / count);
    const extra = topics.length % count;
    const slides: PrayerTopic[][] = [];
    let i = 0;
    for (let k = 0; k < count; k++) {
      const size = base + (k < extra ? 1 : 0);
      slides.push(topics.slice(i, i + size));
      i += size;
    }
    if (slides.every((s) => s.reduce((n, t) => n + weight(t), 0) <= maxLines) || count === topics.length) return slides;
  }
  return [topics];
}

/** Slide body: "**1. Title**" lines (rendered bold) followed by "● point" lines. */
export function prayerSlideText(topics: PrayerTopic[], startNumber: number): string {
  return topics
    .map((t, i) => {
      const head = `**${startNumber + i}. ${t.title}**`;
      return t.points.length ? [head, ...t.points.map((p) => `● ${p}`)].join('\n') : `● ${t.title}`;
    })
    .join('\n');
}
