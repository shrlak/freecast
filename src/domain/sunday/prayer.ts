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

/** One topic per slide, so each can be printed as large as the slide allows. */
export const planPrayerSlides = (topics: PrayerTopic[]): PrayerTopic[][] => topics.map((t) => [t]);

/** Slide body: "**1. Title**" lines (rendered bold) followed by "● point" lines. */
export function prayerSlideText(topics: PrayerTopic[], startNumber: number): string {
  return topics
    .map((t, i) => {
      const head = `**${startNumber + i}. ${t.title}**`;
      return t.points.length ? [head, ...t.points.map((p) => `● ${p}`)].join('\n') : `● ${t.title}`;
    })
    .join('\n');
}
