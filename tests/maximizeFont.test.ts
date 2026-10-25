import { describe, expect, it } from 'vitest';
import { largestFittingFont } from '../src/domain/maximizeFont';
import { prepareAnnouncementSizing, prepareAnnouncementSlide } from '../src/domain/announcementSizing';
import { patchElement } from '../src/domain/templates/convert';
import { createInitialState, reducer } from '../src/domain/reducer';
import { createSeedLibrary } from '../src/domain/defaults';
import { normalizeLibrary } from '../src/domain/persistence';
import type { Presentation, Slide, SlideElement } from '../src/domain/types';

const box = (id: string, text: string, y: number, h = 100): SlideElement => ({ id, kind: 'text', text, x: 120, y, w: 1200, h, fontSize: 32 });
const deck = (): Presentation => ({ id: 'ads', title: '광고', themeId: 'theme_classic', slides: [{ id: 'ad', group: '광고', text: '', elements: [box('heading', '광고\nAnnouncements', 30), box('title', '1. 새가족 환영', 180), box('body', '환영합니다', 320, 600)] }] });

describe('initial maximum text size', () => {
  it('finds the largest fitting half-pixel size with a bounded number of layout measurements', () => {
    let calls = 0;
    const size = largestFittingFont((n) => { calls++; return n <= 129.7; }, 5760);
    expect(size).toBe(129.5); expect(calls).toBeLessThan(16);
    expect(largestFittingFont((n) => n <= 12.1, 500)).toBe(12);
  });
  it('does not assume the original font fits and stays usable for extremely long content', () => {
    expect(largestFittingFont((n) => n < 2, 500)).toBe(1.5);
    expect(largestFittingFont(() => false, 500)).toBe(1);
  });
  it('prepares announcement titles/body once while retaining the fixed section heading and other decks', () => {
    const p = deck(), next = prepareAnnouncementSizing(p);
    expect(next.slides[0].elements![0]).toBe(p.slides[0].elements![0]);
    expect(next.slides[0].elements!.slice(1).every((e) => e.maximizeFont)).toBe(true);
    expect(prepareAnnouncementSizing(next)).toBe(next);
    const completed = { ...next, slides: [{ ...next.slides[0], elements: next.slides[0].elements!.map((e) => ({ ...e, maximizeFont: false })) }] };
    expect(prepareAnnouncementSizing(completed)).toBe(completed);
    const normal = { ...p, title: '설교', slides: p.slides.map((s) => ({ ...s, group: 'Sermon', elements: s.elements!.filter((e) => e.id !== 'heading') })) };
    expect(prepareAnnouncementSizing(normal)).toBe(normal);
    const protectedDeck = { ...p, protected: true }; expect(prepareAnnouncementSizing(protectedDeck)).toBe(protectedDeck);
    const fixed = deck(); fixed.slides[0].elements!.forEach((e) => { e.autoFit = false; });
    expect(prepareAnnouncementSizing(fixed)).toBe(fixed);
    const imported = { ...p, title: '주일 PPT', slides: p.slides.map((s) => ({ ...s, group: '예배' })) };
    expect(prepareAnnouncementSizing(imported).slides[0].elements![2].maximizeFont).toBe(true);
  });
  it('keeps initial content clear of the next text box, slide edge and QR area', () => {
    const s: Slide = { id: 'ad', group: '광고', text: '', qr: ['https://example.org'], elements: [box('title', '제목', 180, 300), box('body', '본문', 320, 800)] };
    const next = prepareAnnouncementSlide(s), [title, body] = next.elements!;
    expect(title.y + title.h).toBeLessThan(body.y); expect(body.y + body.h).toBeLessThan(1080);
    expect(body.x + body.w).toBeLessThanOrEqual(1140);
  });
  it('also requests an initial fit for plain-text ads and preserves manual font choices', () => {
    const p = deck(); p.slides = [{ id: 'plain', group: '광고', text: '광고 본문' }];
    expect(prepareAnnouncementSizing(p).slides[0].maximizeFont).toBe(true);
    const manual = patchElement(box('body', '수정한 본문', 320), { fontSize: 64 });
    expect(manual.maximizeFont).toBe(false);
    const next = prepareAnnouncementSizing({ ...deck(), slides: [{ id: 'manual', group: '광고', text: '', elements: [manual] }] });
    expect(next.slides[0].elements![0]).toBe(manual);
  });
  it('applies to existing and newly imported ads, persists completion, and never changes protected material', () => {
    const lib = createSeedLibrary(); lib.presentations = [deck()];
    const state = createInitialState(lib); expect(state.library.presentations[0].slides[0].elements![1].maximizeFont).toBe(true);
    const created = reducer(createInitialState(createSeedLibrary()), { type: 'presentation/create', presentation: deck() });
    expect(created.library.presentations.at(-1)!.slides[0].elements![1].maximizeFont).toBe(true);
    state.library.presentations[0].slides[0].elements![1].maximizeFont = false;
    expect(normalizeLibrary(JSON.parse(JSON.stringify(state.library)))!.presentations[0].slides[0].elements![1].maximizeFont).toBe(false);
  });
});
