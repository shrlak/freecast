import { describe, expect, it } from 'vitest';
import { correctMixedTextSizes, hasMixedTextSizes, uniformTextBoxFont } from '../src/domain/textBoxFonts';
import { prepareAnnouncementSizing } from '../src/domain/announcementSizing';
import { patchElement } from '../src/domain/templates/convert';
import { createSeedLibrary } from '../src/domain/defaults';
import { normalizeLibrary } from '../src/domain/persistence';
import type { Presentation, SlideElement } from '../src/domain/types';

const body = (): SlideElement => ({ id: 'body', kind: 'text', text: '* 화요기도모임\n* 오는 화요일은 기도회로 진행합니다.', x: 120, y: 180, w: 1200, h: 700, fontSize: 80, maximizeFont: false,
  paragraphs: [{ text: '* 화요기도모임', fontSize: 96, bold: true }, { text: '* 오는 화요일은 기도회로 진행합니다.', fontSize: 64, color: '#123456', italic: true }] });
const deck = (): Presentation => ({ id: 'ads', title: '광고', themeId: 'theme_classic', slides: [{ id: 's', group: '광고', text: '', elements: [
  { id: 'title', kind: 'text', text: '5. <기도모임>', x: 120, y: 60, w: 1200, h: 100, fontSize: 60, maximizeFont: false }, body(),
] }] });

describe('one font size per text box', () => {
  it('repairs an already maximized mixed body without changing a separate heading or emphasis', () => {
    const original = deck(), corrected = prepareAnnouncementSizing(original), [heading, box] = corrected.slides[0].elements!;
    expect(heading).toBe(original.slides[0].elements![0]);
    expect(box.fontSize).toBe(80); expect(box.maximizeFont).toBe(true);
    expect(box.paragraphs!.map((p) => p.fontSize)).toEqual([80, 80]);
    expect(box.paragraphs![0].bold).toBe(true);
    expect(box.paragraphs![1]).toMatchObject({ color: '#123456', italic: true });
    expect(box.text).toBe(body().text);
    expect(original.slides[0].elements![1].paragraphs!.map((p) => p.fontSize)).toEqual([96, 64]);
    expect(prepareAnnouncementSizing(corrected)).toBe(corrected);
  });
  it('corrects saved and newly imported mixed boxes even outside an announcement section', () => {
    const p = deck(); p.title = '주일예배.pptx'; p.slides[0].group = '예배';
    const lib = createSeedLibrary(); lib.presentations = [p];
    expect(normalizeLibrary(JSON.parse(JSON.stringify(lib)))!.presentations[0].slides[0].elements![1].paragraphs!.map((p) => p.fontSize)).toEqual([80, 80]);
    expect(correctMixedTextSizes(p).slides[0].elements![1].maximizeFont).toBe(true);
    const protectedDeck = { ...p, protected: true }; expect(correctMixedTextSizes(protectedDeck)).toBe(protectedDeck);
  });
  it('does not maximize again after a completed correction is saved and reloaded', () => {
    const p = correctMixedTextSizes(deck());
    p.slides[0].elements![1] = { ...uniformTextBoxFont(p.slides[0].elements![1], 74.5), maximizeFont: false };
    const lib = createSeedLibrary(); lib.presentations = [p];
    const saved = normalizeLibrary(JSON.parse(JSON.stringify(lib)))!.presentations[0];
    expect(saved.slides[0].elements![1]).toMatchObject({ fontSize: 74.5, maximizeFont: false });
    expect(correctMixedTextSizes(saved)).toBe(saved);
    expect(uniformTextBoxFont(saved.slides[0].elements![1])).toBe(saved.slides[0].elements![1]);
  });
  it('makes an explicit size uniform even when the chosen size equals the existing base size', () => {
    const el = body(), changed = patchElement(el, { fontSize: 80, x: el.x, y: el.y, w: el.w, h: el.h });
    expect(changed.paragraphs!.map((p) => p.fontSize)).toEqual([80, 80]);
    expect(changed).toMatchObject({ x: 120, y: 180, w: 1200, h: 700, maximizeFont: false });
    expect(changed.paragraphs![0].bold).toBe(true);
  });
  it('ignores empty paragraph sizes but detects inherited sizes on nonempty lines', () => {
    const el = body(); el.paragraphs = [{ text: '본문', fontSize: 80 }, { text: '', fontSize: 20 }];
    expect(hasMixedTextSizes(el)).toBe(false);
    el.paragraphs = [{ text: '본문', fontSize: 96 }, { text: '상속된 크기' }];
    expect(hasMixedTextSizes(el)).toBe(true);
  });
});
