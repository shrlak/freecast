import { describe, expect, it } from 'vitest';
import { fillFront, refreshFront } from '../src/domain/templates/fill';
import { templateDeckUpdates } from '../src/domain/templates/register';
import { createSeedLibrary } from '../src/domain/defaults';
import { createInitialState } from '../src/domain/reducer';
import { normalizeLibrary } from '../src/domain/persistence';
import { correctMixedTextSizes } from '../src/domain/textBoxFonts';
import { fitSlideText } from '../src/domain/slideTextLayout';
import type { ServiceTemplates } from '../src/domain/templates/serviceTemplates';
import type { Slide } from '../src/domain/types';
import { exportPptx } from '../src/domain/io/pptxExport';
import JSZip from 'jszip';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const source: Slide = { id: 'source', group: 'Front', text: '', elements: [
  { id: 'welcome', kind: 'text', x: 80, y: 200, w: 1200, h: 80, fontSize: 120, autoFit: true,
    text: '원본 제목\n원본 본문\nmm/dd/202y', paragraphs: [
      { text: '원본 제목', fontSize: 120, bold: true }, { text: '원본 본문', fontSize: 60, color: '#123456' }, { text: 'mm/dd/202y', fontSize: 36 },
    ] },
] };
const tpl: ServiceTemplates = { front: [source], prayer: source, announceTitle: source, announceItem: source,
  songTitle: source, songLyrics: source, bibleTitle: source, bibleVerse: source, sermon: source, keys: { front: 'f1', song: 's1' } };
const sizes = (s: Slide) => s.elements![0].paragraphs!.map((p) => p.fontSize);

describe('Front original fonts, date only', () => {
  it('preserves every original paragraph style and box dimension even with abundant new prayer content', () => {
    const [s] = fillFront(tpl, new Date(2026, 9, 25), Array(50).fill({ title: '새 기도제목', points: ['긴 내용'] }));
    expect(s.elements![0]).toMatchObject({ x: 80, y: 200, w: 1200, h: 80, fontSize: 120, autoFit: false });
    expect(sizes(s)).toEqual([120, 60, 36]);
    expect(s.elements![0].paragraphs).toEqual(source.elements![0].paragraphs!.map((p, i) => ({ ...p, text: i === 2 ? '10/25/2026' : p.text })));
    expect(s.preserveTextLayout).toBe(true);
    expect(source.elements![0].autoFit).toBe(true); // source never mutated
  });
  it('restores a previously resized Front from its source and preserves page identity while changing its date', () => {
    const [old] = fillFront(tpl, new Date(2026, 9, 25));
    old.elements![0] = { ...old.elements![0], fontSize: 7, preferredFontSize: 400, x: 0, w: 1440, h: 1080 };
    const [next] = refreshFront([old], tpl, new Date(2026, 10, 1));
    expect(next.id).toBe(old.id); expect(next.elements![0].id).toBe(old.elements![0].id);
    expect(next.elements![0]).toMatchObject({ x: 80, y: 200, w: 1200, h: 80, fontSize: 120, autoFit: false });
    expect(next.elements![0].preferredFontSize).toBeUndefined(); expect(sizes(next)).toEqual([120, 60, 36]);
    expect(next.elements![0].text).toBe('원본 제목\n원본 본문\n11/01/2026');
  });
  it('preserves soft line breaks within a paragraph instead of creating extra paragraphs', () => {
    const s: Slide = { ...source, elements: [{ ...source.elements![0], text: '기도제목 1\n\n기도제목 2',
      paragraphs: [{ text: '기도제목 1\n', fontSize: 48 }, { text: '기도제목 2', fontSize: 36 }] }] };
    const [filled] = fillFront({ ...tpl, front: [s] }, new Date(2026, 9, 25));
    expect(filled.elements![0].paragraphs).toEqual(s.elements![0].paragraphs);
    expect(filled.elements![0].text).toBe(s.elements![0].text);
  });
  it('excludes Front from general paragraph unification on create/load/reload', () => {
    const lib = createSeedLibrary(); lib.presentations = [{ id: 'front', title: 'Front', themeId: 'theme_classic', slides: fillFront(tpl, new Date(2026, 9, 25)) }];
    const initialized = createInitialState(lib).library;
    const loaded = normalizeLibrary(JSON.parse(JSON.stringify(initialized)))!;
    expect(sizes(loaded.presentations[0].slides[0])).toEqual([120, 60, 36]);
    expect(correctMixedTextSizes(loaded.presentations[0])).toBe(loaded.presentations[0]);
    expect(loaded.presentations[0].slides[0].elements![0].autoFit).toBe(false);
  });
  it('migrates main and dated service Front copies once, retains each service date, and ignores prayer changes', () => {
    const lib = createSeedLibrary();
    lib.presentations.push({ id: 'copy', title: '1101 Front', folder: '1101 주일예배', themeId: 'theme_classic', slides: [{ ...source, id: 'copy-source' }] });
    const updates = templateDeckUpdates(lib, tpl, new Date(2026, 9, 21));
    expect(updates.find((u) => u.id === lib.sunday.frontId)!.patch.slides![0].elements![0].text).toContain('10/25/2026');
    expect(updates.find((u) => u.id === 'copy')!.patch.slides![0].elements![0].text).toContain('11/01/2026');
    const saved = { ...lib, presentations: lib.presentations.map((p) => ({ ...p, ...updates.find((u) => u.id === p.id)?.patch })) };
    expect(templateDeckUpdates({ ...saved, sunday: { ...saved.sunday, prayerText: '완전히 새 기도제목' } }, tpl, new Date(2026, 9, 22))).toEqual([]);
    const changed = structuredClone(saved);
    changed.presentations.find((p) => p.id === 'copy')!.slides[0].elements![0].paragraphs![0].fontSize = 999;
    const repair = templateDeckUpdates(changed, tpl, new Date(2026, 9, 22)).find((u) => u.id === 'copy');
    expect(sizes(repair!.patch.slides![0])).toEqual([120, 60, 36]);
    saved.presentations.find((p) => p.id === 'copy')!.protected = true;
    expect(templateDeckUpdates(saved, { ...tpl, keys: { ...tpl.keys, front: 'f2' } }, new Date(2026, 9, 22)).some((u) => u.id === 'copy')).toBe(false);
  });
  it('never fits the main Front text, even when a stale preferred size is present', () => {
    const theme = { ...createSeedLibrary().themes[0], fontSize: 96 };
    expect(fitSlideText({ id: 'main', group: 'Front', text: '원본', preferredFontSize: 400 }, theme).fontSize).toBe(96);
  });
  it('exports the original mixed paragraph fonts without unification or auto-fit', async () => {
    const lib = createSeedLibrary(), dir = await mkdtemp(join(tmpdir(), 'freecast-front-font-'));
    const exportTpl = structuredClone(tpl);
    exportTpl.front[0].elements![0].text += '\n';
    exportTpl.front[0].elements![0].paragraphs!.push({ text: '', fontSize: 28 });
    const p = { id: 'front', title: 'Front', themeId: 'theme_classic', slides: fillFront(exportTpl, new Date(2026, 9, 25)) };
    try {
      await exportPptx(lib, { presentation: p }, join(dir, 'front.pptx'));
      const zip = await JSZip.loadAsync(await readFile(join(dir, 'front.pptx'))), xml = await zip.file('ppt/slides/slide1.xml')!.async('string');
      for (const size of [6000, 3000, 1800, 1400]) expect(xml).toContain(`sz="${size}"`);
      expect(xml).toContain('10/25/2026'); expect(xml).not.toMatch(/spAutoFit|normAutoFit|normAutofit/);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});
