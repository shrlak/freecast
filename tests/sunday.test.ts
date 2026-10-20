import { describe, expect, it } from 'vitest';
import { mdy, mmdd, parseNotice, serviceDate, upcomingSunday } from '../src/domain/sunday/notice';
import { parsePrayerTopics, planPrayerSlides, prayerSlideText } from '../src/domain/sunday/prayer';
import { parseAnnouncements } from '../src/domain/sunday/announcements';
import { parseLyricsMarkdown, songToPresentation, titleKey } from '../src/domain/sunday/songs';
import { buildService } from '../src/domain/sunday/service';
import { createSeedLibrary } from '../src/domain/defaults';
import { sequence } from '../src/domain/arrangement';

const NOTICE = `[대청부 7/12 주일예배 공지]
📖 본문: 로마서 5장 1-11절
🎤 설교 제목: 은혜 위에 서 있는 우리
🎶찬양곡:
1️⃣ 주님의 은혜 넘치네 (G)
2️⃣ 주 신실하심 놀라워 - A
3. Amazing Grace [D]
🤝공동체 고백: Doxology
라인업: 인도 홍길동`;

describe('notice', () => {
  it('reads songs with keys, scripture, sermon title and confession', () => {
    const n = parseNotice(NOTICE);
    expect(n.songs).toEqual([
      { title: '주님의 은혜 넘치네', key: 'G' },
      { title: '주 신실하심 놀라워', key: 'A' },
      { title: 'Amazing Grace', key: 'D' },
    ]);
    expect(n.scripture).toBe('롬5:1-11');
    expect(n.sermonTitle).toBe('은혜 위에 서 있는 우리');
    expect(n.confession).toBe('Doxology');
    expect(n.date).toEqual({ year: undefined, month: 7, day: 12 });
  });

  it('dates the service on that week’s Sunday', () => {
    const d = serviceDate({ year: 2026, month: 7, day: 9 }, new Date(2026, 0, 1));
    expect(mmdd(d)).toBe('0712');
    expect(mdy(d)).toBe('07/12/2026');
    expect(upcomingSunday(new Date(2026, 9, 18)).getDate()).toBe(18); // 2026-10-18 is a Sunday
  });
});

describe('prayer topics', () => {
  const topics = parsePrayerTopics(`7/12 주일 기도제목
1. **회개와 마음의 정결**
- 지난 한 주간을 돌아보며
- 정결한 마음으로
2) 예배를 위한 기도
• 마음을 집중하도록
(3) 교회
④ 다음 세대`);

  it('reads numbered topics with their points, dropping the header and markdown', () => {
    expect(topics.map((t) => t.title)).toEqual(['회개와 마음의 정결', '예배를 위한 기도', '교회', '다음 세대']);
    expect(topics[0].points).toEqual(['지난 한 주간을 돌아보며', '정결한 마음으로']);
  });

  it('splits evenly with at most three per slide', () => {
    expect(planPrayerSlides(topics).map((s) => s.length)).toEqual([2, 2]);
    const five = Array.from({ length: 5 }, (_, i) => ({ title: `t${i}`, points: [] }));
    expect(planPrayerSlides(five).map((s) => s.length)).toEqual([3, 2]);
  });

  it('formats bold numbered titles and bullet points', () => {
    expect(prayerSlideText(topics.slice(0, 1), 1)).toBe('**1. 회개와 마음의 정결**\n● 지난 한 주간을 돌아보며\n● 정결한 마음으로');
  });
});

describe('announcements', () => {
  it('renumbers items and turns links into QR codes', () => {
    const items = parseAnnouncements(`1. <새가족 환영>
오늘 처음 오신 분들을 환영합니다!

5. <찬양팀 모집>
찬양팀 싱어와 세션을 모집합니다.
- 신청: https://forms.gle/xyz789
- 문의: 찬양팀장
자세한 내용은 [여기](https://example.org/info) 참고`);
    expect(items.map((i) => i.title)).toEqual(['새가족 환영', '찬양팀 모집']);
    expect(items[1].body).toEqual(['찬양팀 싱어와 세션을 모집합니다.', '- 문의: 찬양팀장', '자세한 내용은 여기 참고']);
    expect(items[1].links).toEqual(['https://forms.gle/xyz789', 'https://example.org/info']);
  });
});

describe('songs', () => {
  it('reads lyrics Markdown and applies a progression as the arrangement', () => {
    const song = parseLyricsMarkdown('# 테스트 곡\n\n- 원본: 악보\n\n## Verse (`V`)\n가사 1  \n가사 2  \n가사 3\n\n## Chorus (`C`)\n후렴 1\n후렴 2', 'x');
    expect(song.title).toBe('테스트 곡');
    const p = songToPresentation({ ...song, progression: ['V', 'C', 'C'] }, { themeId: 't', linesPerSlide: 2 });
    expect(p.slides.map((s) => s.group)).toEqual(['Verse', 'Verse', 'Chorus']);
    // Like the church's PPT each part plays once; the 진행 is kept as an arrangement to switch on.
    expect(sequence(p).map((x) => x.slide.group)).toEqual(['Verse', 'Verse', 'Chorus']);
    expect(p.meta?.order).toEqual(['V', 'C', 'C']);
    expect(sequence({ ...p, arrangementId: p.arrangements![0].id }).map((x) => x.slide.group)).toEqual(['Verse', 'Verse', 'Chorus', 'Chorus']);
  });

  it('numbers repeated parts and maps bare codes to them in order', () => {
    const p = songToPresentation({ title: 's', sections: [{ label: 'V', lines: ['a'] }, { label: 'C', lines: ['b'] }, { label: 'V', lines: ['c'] }], progression: ['V', 'C', 'V', 'C'] }, { themeId: 't', linesPerSlide: 2 });
    expect(sequence(p).map((x) => x.slide.text)).toEqual(['a', 'b', 'c']);
    expect(sequence({ ...p, arrangementId: p.arrangements![0].id }).map((x) => x.slide.text)).toEqual(['a', 'b', 'c', 'b']);
  });

  it('matches titles loosely', () => {
    expect(titleKey('주님의 은혜 넘치네!')).toBe(titleKey('주님의은혜 넘치네 (G)'));
  });
});

describe('service builder', () => {
  it('builds the fixed Sunday order and skips empty sections', () => {
    const lib = createSeedLibrary();
    const { playlist, presentations, warnings } = buildService(lib, {
      date: new Date(2026, 6, 12),
      songs: [{ title: 'Amazing Grace', sections: [] }, { title: '새 노래', sections: [{ label: 'V', lines: ['라라'] }] }, { title: 'Doxology', sections: [], postSermon: true }],
      scriptureSlides: [{ id: 'x', group: '롬', text: '1 ...' }],
      sermonSlides: [],
      prayerTopics: [{ title: 'A', points: [] }, { title: 'B', points: [] }, { title: 'C', points: [] }, { title: 'D', points: [] }],
      announcements: [{ title: '환영', body: ['hi'], links: ['https://x.org'] }],
      extraSlides: [],
      confessionSong: 'Doxology',
    });
    const headers = playlist.items.filter((i) => i.kind === 'header').map((i) => (i.kind === 'header' ? i.title : ''));
    expect(headers).toEqual(['Front', '찬양', '성경 말씀', '설교 후 찬양', '광고', 'Back / End']);
    expect(playlist.name).toBe('0712 주일예배');
    const front = presentations.find((p) => p.title === '0712 Front')!;
    expect(front.slides.filter((s) => s.text.includes('●')).length).toBe(2);
    expect(front.slides.some((s) => s.subtext === '07/12/2026')).toBe(true);
    const back = presentations.find((p) => p.title === '0712 Back')!;
    expect(back.slides[0].group).toMatch(/^공동체 고백/);
    expect(presentations.find((p) => p.title === '광고')!.slides[0].qr).toEqual(['https://x.org']);
    expect(warnings).toEqual([]);
  });
});

describe('church slide planner (as the ppt program lays out songs)', async () => {
  const { planSectionSlides } = await import('../src/domain/sunday/slidePlanner');
  const texts = (parts: { slides: string[][] }[]) => parts.flatMap((p) => p.slides.map((s) => s.join('/')));
  it('splits each part into up to 4 lines, 6 lines as 3 + 3', () => {
    expect(texts(planSectionSlides([{ label: 'V1', lines: ['1', '2', '3', '4', '5', '6'] }], undefined, 4))).toEqual(['1/2/3', '4/5/6']);
    expect(texts(planSectionSlides([{ label: 'V1', lines: ['1', '2', '3', '4'] }], undefined, 4))).toEqual(['1/2/3/4']);
  });
  it('starts a new slide at a blank line', () => {
    expect(texts(planSectionSlides([{ label: 'C', lines: ['a', 'b', '', 'c'] }], undefined, 4))).toEqual(['a/b', 'c']);
  });
  it('plays each part once, in the order the 진행 first names it', () => {
    const sections = [{ label: 'V1', lines: ['v1'] }, { label: 'V2', lines: ['v2'] }, { label: 'C', lines: ['c'] }, { label: 'B', lines: ['b'] }];
    expect(texts(planSectionSlides(sections, ['I', 'V1', 'C', 'V2', 'C', 'B', 'C'], 4))).toEqual(['v1', 'c', 'v2', 'b']);
    expect(texts(planSectionSlides(sections, ['V', 'C', 'V', 'C'], 4))).toEqual(['v1', 'c', 'v2']);
  });
});
