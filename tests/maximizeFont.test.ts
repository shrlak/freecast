import { describe, expect, it } from 'vitest';
import { textElementBounds } from '../src/domain/textBox';
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
  it('retains original announcement sizes and clears legacy enlargement requests', () => {
    const p = deck();
    expect(prepareAnnouncementSizing(p)).toBe(p);
    p.slides[0].maximizeFont = true;
    p.slides[0].elements![1].maximizeFont = true;
    const next = prepareAnnouncementSizing(p);
    expect(next.slides[0].maximizeFont).toBe(false);
    expect(next.slides[0].elements![1]).toMatchObject({ fontSize: 32, maximizeFont: false, w: 1200, h: 100 });
    expect(prepareAnnouncementSizing(next)).toBe(next);
    const protectedDeck = { ...p, protected: true };
    expect(prepareAnnouncementSizing(protectedDeck)).toBe(protectedDeck);
  });
  it('reserves neighbor space at layout time, while QR codes sit over the boxes and reserve none', () => {
    const s: Slide = { id: 'ad', group: '광고', text: '', qr: ['https://example.org'], elements: [box('title', '제목', 180), box('body', '본문', 320, 600)] };
    expect(prepareAnnouncementSlide(s)).toBe(s);
    const [title, body] = s.elements!;
    const titleBounds = textElementBounds(title, s.elements), bodyBounds = textElementBounds(body, s.elements);
    expect((titleBounds.y ?? 0) + titleBounds.h).toBeLessThan(body.y);
    expect(bodyBounds.y).toBeGreaterThan(title.y + title.h);
    expect(bodyBounds).toMatchObject({ x: 0, w: 1440 });
  });
  it('moves boxes an earlier version pushed against the left edge for the QR strip back to the middle', () => {
    const pushed = { ...box('body', '본문', 320, 600), x: 0, w: 1140 };
    const s: Slide = { id: 'ad', group: '광고', text: '', qr: ['https://example.org'], elements: [pushed] };
    const fixed = prepareAnnouncementSlide(s);
    expect(fixed.elements![0]).toMatchObject({ x: 62, w: 1316, y: pushed.y, h: pushed.h });
    expect(prepareAnnouncementSlide(fixed)).toBe(fixed);
    // Without QR codes, or placed there by hand elsewhere, a box stays where it is.
    const plain = { ...s, qr: undefined };
    expect(prepareAnnouncementSlide(plain)).toBe(plain);
  });
  it('preserves plain-text ads and explicit manual font choices', () => {
    const p = deck(); p.slides = [{ id: 'plain', group: '광고', text: '광고 본문', style: { fontSize: 32 } }];
    expect(prepareAnnouncementSizing(p)).toBe(p);
    const manual = patchElement({ ...box('body', '수정한 본문', 320), fontSize: 40, preferredFontSize: 80 }, { fontSize: 64 });
    expect(manual).toMatchObject({ fontSize: 64, maximizeFont: false });
    expect(manual.preferredFontSize).toBeUndefined();
  });
  it('preserves font sizes for loaded/imported ads and retains preferred sizes after reload', () => {
    const lib = createSeedLibrary(); lib.presentations = [deck()];
    const state = createInitialState(lib);
    expect(state.library.presentations[0].slides[0].elements![1].fontSize).toBe(32);
    const created = reducer(createInitialState(createSeedLibrary()), { type: 'presentation/create', presentation: deck() });
    expect(created.library.presentations.at(-1)!.slides[0].elements![1].maximizeFont).toBeUndefined();
    state.library.presentations[0].slides[0].elements![1].preferredFontSize = 64;
    expect(normalizeLibrary(JSON.parse(JSON.stringify(state.library)))!.presentations[0].slides[0].elements![1].preferredFontSize).toBe(64);
  });
});
