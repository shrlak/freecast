import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { formatRef, normalizeScripture, parseRef, parseRefs } from '../src/domain/bible/refs';
import { versesFor, type BibleText } from '../src/domain/bible/data';
import { planScripture } from '../src/domain/bible/slides';
import { formatClock, startTimer, stopTimer, timerValue } from '../src/domain/timers';
import type { Timer } from '../src/domain/types';

const load = (f: string): BibleText => (JSON.parse(readFileSync(`tests/fixtures/${f}`, 'utf8')) as { chapters: string[][] }[]).map((b) => b.chapters);
const krv = load('krv-min.json');
const kjv = load('kjv-min.json');
const T = { krv: { id: 'krv', name: '개역한글', language: 'ko' as const, file: 'ko_ko.json' }, kjv: { id: 'kjv', name: 'KJV', language: 'en' as const, file: 'en_kjv.json' } };

describe('references', () => {
  it('parses Korean abbreviations, ranges and cross-chapter ranges', () => {
    expect(parseRef('요3:16')).toMatchObject({ book: { nameKo: '요한복음' }, startChapter: 3, startVerse: 16, endVerse: 16 });
    expect(parseRef('삼상1:1-3')).toMatchObject({ book: { nameKo: '사무엘상' }, startVerse: 1, endVerse: 3 });
    expect(parseRef('행1:8-2:3')).toMatchObject({ startChapter: 1, endChapter: 2, endVerse: 3 });
    expect(parseRef('시23')).toMatchObject({ startChapter: 23, endChapter: 23 });
    expect(parseRef('시23')?.startVerse).toBeUndefined();
  });

  it('parses English references', () => {
    expect(parseRef('John 3:16')).toMatchObject({ book: { nameEn: 'John' }, startVerse: 16 });
    expect(parseRef('1 John 1:9')).toMatchObject({ book: { nameEn: '1 John' } });
    const { refs, invalid } = parseRefs('John 3:16; Rom 8:28-30');
    expect(refs.map((r) => formatRef(r, 'en'))).toEqual(['John 3:16', 'Romans 8:28-30']);
    expect(invalid).toEqual([]);
  });

  it('normalises written-out 콘티 style', () => {
    expect(normalizeScripture('본문: 로마서 5장 1-11절')).toBe('롬5:1-11');
    expect(normalizeScripture('시편 23편')).toBe('시23');
    expect(parseRefs('행1:8-10 요3:16 없는책1:1').invalid).toEqual(['없는책1:1']);
  });
});

describe('bible text and slides', () => {
  it('reads verses from the bundled public-domain texts', () => {
    const v = versesFor(kjv, parseRef('John 3:16')!, false);
    expect(v[0].text).toMatch(/^For God so loved the world/);
    expect(versesFor(krv, parseRef('창1:1')!, true)[0].text).toMatch(/^태초에/);
  });

  it('plans parallel slides with N verses each and a sermon title slide', () => {
    const slides = planScripture([parseRef('요3:16-18')!], [krv, kjv], { translations: [T.krv, T.kjv], versesPerSlide: 2, sermonTitle: '사랑' });
    expect(slides).toHaveLength(3);
    expect(slides[0]).toMatchObject({ group: '설교', text: '사랑', subtext: '요한복음 3:16-18' });
    expect(slides[1].title).toBe('요한복음 3:16-17 (개역한글 · KJV)');
    expect(slides[1].text.split('\n')).toHaveLength(2);
    expect(slides[1].subtext).toMatch(/^16 For God/);
    expect(slides[2].title).toBe('요한복음 3:18 (개역한글 · KJV)');
  });
});

describe('timers', () => {
  it('counts down, pauses and formats', () => {
    let t: Timer = { id: 't', name: 't', kind: 'countdown', durationMs: 60000, target: '', running: false, startedAt: null, accumulatedMs: 0 };
    t = startTimer(t, 0);
    expect(timerValue(t, 10000)).toBe(50000);
    t = stopTimer(t, 20000);
    expect(timerValue(t, 99999)).toBe(40000);
    expect(formatClock(40000)).toBe('0:40');
    expect(formatClock(-12000)).toBe('-0:12');
    expect(formatClock(3723000)).toBe('1:02:03');
  });
});
