import { describe, expect, it } from 'vitest';
import { announcementPages, parseAnnouncements } from '../src/domain/sunday/announcements';
import { announcementSlides } from '../src/domain/templates/fill';
import { prepareAnnouncementSlide } from '../src/domain/announcementSizing';
import { qrElement, withQrElements } from '../src/domain/qrElements';
import type { ServiceTemplates } from '../src/domain/templates/serviceTemplates';
import type { Slide, SlideElement } from '../src/domain/types';

const titles = (text: string) => parseAnnouncements(text).map((a) => a.title);
const pages = (text: string) => parseAnnouncements(text).map((a) => announcementPages(a).map((p) => p.body));

describe('광고: counting the announcements by their numbers', () => {
  it('keeps a numbered list inside an announcement as its lines', () => {
    const text = `1. <여름 수련회>
1. 일시: 8/1-8/3
2. 장소: 캠프
3. 회비: $100
2. <새가족 환영>
환영합니다`;
    expect(titles(text)).toEqual(['여름 수련회', '새가족 환영']);
    expect(pages(text)[0]).toEqual([['1. 일시: 8/1-8/3', '2. 장소: 캠프', '3. 회비: $100']]);
  });

  it('does the same without <brackets>, and counts the next number after the list ends', () => {
    const text = `1. 여름 수련회
1) 일시: 8/1
2) 장소: 캠프
3) 회비: $100
2. 새가족 환영
환영합니다
3. 점심 식사`;
    expect(titles(text)).toEqual(['여름 수련회', '새가족 환영', '점심 식사']);
  });

  it('counts plain numbered titles mixed with <bracketed> ones', () => {
    expect(titles('1. <새가족 환영>\n환영합니다\n2. 찬양팀 모집\n싱어 모집\n3. <식사>')).toEqual(['새가족 환영', '찬양팀 모집', '식사']);
  });

  it('never counts an indented numbered line, times or decimals', () => {
    const text = '1. 주일 일정\n  2. 들여쓴 줄\n10:30 1부 예배\n2. 성경공부\n3.5시간 진행';
    expect(titles(text)).toEqual(['주일 일정', '성경공부']);
    expect(pages(text)[0][0]).toEqual(['\u30002. 들여쓴 줄', '10:30 1부 예배']);
  });

  it('accepts skipped numbers after an empty line and numbers them again in order', () => {
    expect(titles('1. A\n내용\n\n5. B\n내용\n\n9. C')).toEqual(['A', 'B', 'C']);
  });

  it('reads ①, (1) and full-width numbers', () => {
    expect(titles('① 첫째\n② 둘째')).toEqual(['첫째', '둘째']);
    expect(titles('(1) 첫째\n(2) 둘째')).toEqual(['첫째', '둘째']);
    expect(titles('１．첫째\n２．둘째')).toEqual(['첫째', '둘째']);
  });

  it('makes one announcement per block when nothing is numbered', () => {
    const items = parseAnnouncements('새가족 환영\n환영합니다\n\n수련회\n신청: https://forms.gle/x');
    expect(items.map((a) => [a.title, a.body, a.links])).toEqual([['새가족 환영', ['환영합니다'], []], ['수련회', [], ['https://forms.gle/x']]]);
  });
});

describe('광고: bullets and links as written', () => {
  it('turns * bullets into • and keeps lines indented under them as ◦, one step in', () => {
    const text = `1. <수련회> 겨울 수련회가 열립니다.
    * 장소 | 캠프
    * 사전등록: 10월 18일
        * 대학부: $50
2. <기도모임>
    * 화요기도모임
        * 매주 화요일 8시 30분`;
    expect(pages(text)).toEqual([
      [['겨울 수련회가 열립니다.', '• 장소 | 캠프', '• 사전등록: 10월 18일', '\u3000◦ 대학부: $50']],
      [['• 화요기도모임', '\u3000◦ 매주 화요일 8시 30분']],
    ]);
  });

  it('drops the label left at the end of a line when its link becomes a QR code', () => {
    const [a] = parseAnnouncements('1. <사역팀 모집> 많은 관심 부탁드립니다! 사인업: https://docs.google.com/forms/d/e/x/viewform');
    expect(a.body).toEqual(['많은 관심 부탁드립니다!']);
    expect(a.links).toEqual(['https://docs.google.com/forms/d/e/x/viewform']);
  });
});

describe('광고: an empty line starts a new slide of the same announcement', () => {
  const text = `1. <여름 수련회>
일시: 8/1-8/3
장소: 캠프

신청: https://forms.gle/x
회비: $100

2. <새가족 환영>
환영합니다
`;

  it('splits the announcement, not the count', () => {
    const items = parseAnnouncements(text);
    expect(items).toHaveLength(2);
    expect(announcementPages(items[0])).toEqual([
      { body: ['일시: 8/1-8/3', '장소: 캠프'], links: [] },
      { body: ['회비: $100'], links: ['https://forms.gle/x'] },
    ]);
    expect(items[0].body).toEqual(['일시: 8/1-8/3', '장소: 캠프', '회비: $100']);
    expect(announcementPages(items[1])).toEqual([{ body: ['환영합니다'], links: [] }]);
  });

  it('becomes slides under the same title, with each QR code on the slide where its link was', () => {
    const box = (id: string, t: string, y: number): SlideElement => ({ id, kind: 'text', text: t, x: 120, y, w: 1200, h: 100 });
    const slide = (group: string, elements: SlideElement[]): Slide => ({ id: group, group, text: '', elements });
    const tpl = {
      announceTitle: slide('광고', [box('a', '광고\nAnnouncement', 100)]),
      announceItem: slide('광고', [box('h', '광고\nAnnouncements', 60), box('it', '1. <제목>', 230), box('b', '본문', 330)]),
    } as unknown as ServiceTemplates;
    const slides = announcementSlides(tpl, parseAnnouncements(text));
    expect(slides).toHaveLength(4); // 광고 title + 2 slides of the first + 1 of the second
    const shown = slides.slice(1).map((s) => s.elements!.filter((e) => e.kind === 'text').slice(1).map((e) => e.text));
    expect(shown).toEqual([['1. <여름 수련회>', '일시: 8/1-8/3\n장소: 캠프'], ['1. <여름 수련회>', '회비: $100'], ['2. <새가족 환영>', '환영합니다']]);
    expect(slides.map((s) => s.elements!.filter((e) => e.kind === 'qr').map((e) => e.link))).toEqual([[], [], ['https://forms.gle/x'], []]);
  });
});

describe('QR codes are objects on the slide', () => {
  it('stack up from the bottom-right corner, where they used to be drawn', () => {
    expect(qrElement('https://a', 0)).toMatchObject({ kind: 'qr', link: 'https://a', x: 1140, y: 780, w: 240, h: 240 });
    expect(qrElement('https://b', 1)).toMatchObject({ x: 1140, y: 516 });
  });

  it('turn a saved slide’s corner QR codes into objects, once', () => {
    const old: Slide = { id: 's', group: '광고', text: '본문', qr: ['https://a', 'https://b'] };
    const next = prepareAnnouncementSlide(old);
    expect(next.qr).toBeUndefined();
    expect(next.elements!.map((e) => [e.kind, e.link])).toEqual([['qr', 'https://a'], ['qr', 'https://b']]);
    expect(prepareAnnouncementSlide(next)).toBe(next);
  });

  it('leave lyric slides (laid out around the corner) as they are', () => {
    const lyric: Slide = { id: 'l', group: 'Verse', text: '가사', lyricBody: true, qr: ['https://a'] };
    expect(withQrElements(lyric)).toBe(lyric);
  });
});
