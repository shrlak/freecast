import { describe, expect, it } from 'vitest';
import { growTextBox } from '../src/domain/textBox';
import { patchElement } from '../src/domain/templates/convert';
import type { SlideElement } from '../src/domain/types';
import { createSeedLibrary } from '../src/domain/defaults';
import { exportPptx } from '../src/domain/io/pptxExport';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import JSZip from 'jszip';

describe('grow text boxes while preserving font sizes', () => {
  it('keeps a centered lyric box centered and expands only overflowing dimensions', () => {
    const box = { x: 320, y: 500, w: 800, h: 80 };
    expect(growTextBox(box, { w: 799, h: 400 })).toEqual({ x: 320, y: 340, w: 800, h: 400 });
    expect(growTextBox(box, { w: 1000, h: 400 })).toEqual({ x: 220, y: 340, w: 1000, h: 400 });
    expect(growTextBox(box, { w: 300, h: 40 })).toEqual(box);
  });
  it('honors top/left and bottom/right alignment and keeps fitting boxes inside the slide', () => {
    const box = { x: 100, y: 100, w: 400, h: 100 };
    expect(growTextBox(box, { w: 500, h: 200 }, 'left', 'top')).toEqual({ x: 100, y: 100, w: 500, h: 200 });
    expect(growTextBox(box, { w: 500, h: 200 }, 'right', 'bottom')).toEqual({ x: 0, y: 0, w: 500, h: 200 });
    expect(growTextBox({ x: 1300, y: 1000, w: 100, h: 50 }, { w: 200, h: 200 }, 'left', 'top')).toEqual({ x: 1240, y: 880, w: 200, h: 200 });
  });
  it('caps oversized boxes at the slide and repairs old off-slide growth', () => {
    expect(growTextBox({ x: -100, y: 500, w: 400, h: 80 }, { w: 400, h: 1400 })).toEqual({ x: 0, y: 0, w: 400, h: 1080 });
  });
  it('caps both dimensions inside custom reserved bounds while keeping fitting boxes unchanged', () => {
    const bounds = { x: 100, y: 200, w: 1000, h: 800 };
    const box = { x: 200, y: 300, w: 400, h: 80 };
    expect(growTextBox(box, { w: 400, h: 70 }, 'left', 'top', bounds)).toEqual(box);
    expect(growTextBox(box, { w: 2000, h: 4000 }, 'center', 'middle', bounds)).toEqual({ x: 100, y: 200, w: 1000, h: 800 });
  });
  it('manual font edits retain automatic box growth and per-paragraph sizes until explicitly changed', () => {
    const el: SlideElement = { id: 'box', kind: 'text', text: '첫 줄\n둘째 줄', x: 200, y: 300, w: 600, h: 80, fontSize: 80, autoFit: true,
      paragraphs: [{ text: '첫 줄', fontSize: 80 }, { text: '둘째 줄', fontSize: 50 }] };
    const edited = patchElement(el, { text: '새 첫 줄\n새 둘째 줄\n셋째 줄' });
    expect(edited.fontSize).toBe(80); expect(edited.paragraphs!.map((p) => p.fontSize)).toEqual([80, 50, 50]);
    expect(patchElement(el, { fontSize: 96 }).autoFit).toBe(true);
  });
  it('exports fixed bounded geometry and consistent fonts without PowerPoint growing boxes off-slide', async () => {
    const lib = createSeedLibrary(), dir = await mkdtemp(join(tmpdir(), 'freecast-box-fit-'));
    const p = { id: 'test', title: 'Text fit', themeId: lib.themes[0].id, slides: [{ id: 'slide', group: 'Slide', text: 'BODY', style: { fontSize: 96 }, elements: [
      { id: 'box', kind: 'text' as const, text: 'LARGE\nSMALL', fontSize: 80, x: 300, y: 300, w: 800, h: 80, autoFit: true, paragraphs: [{ text: 'LARGE', fontSize: 80 }, { text: 'SMALL', fontSize: 50 }] },
      { id: 'fixed', kind: 'text' as const, text: 'FIXED', fontSize: 72, x: 300, y: 500, w: 800, h: 80, autoFit: false },
    ] }] };
    try {
      await exportPptx(lib, { presentation: p }, join(dir, 'text.pptx'));
      const zip = await JSZip.loadAsync(await readFile(join(dir, 'text.pptx'))), xml = await zip.file('ppt/slides/slide1.xml')!.async('string');
      expect(xml).not.toContain('normAutofit'); expect(xml).not.toContain('normAutoFit');
      const shapes = [...xml.matchAll(/<p:sp>[\s\S]*?<\/p:sp>/g)].map(([s]) => s);
      expect(shapes.find((s) => s.includes('BODY'))).not.toContain('<a:spAutoFit/>');
      const box = shapes.find((s) => s.includes('LARGE'))!;
      expect(box).not.toContain('<a:spAutoFit/>'); expect(box).toContain('sz="4000"'); expect(box).not.toContain('sz="2500"');
      expect(shapes.find((s) => s.includes('FIXED'))).not.toContain('<a:spAutoFit/>');
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});
