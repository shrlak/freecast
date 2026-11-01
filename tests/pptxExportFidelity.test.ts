import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { buildPptx } from '../src/domain/io/pptxExport';
import { createSeedLibrary } from '../src/domain/defaults';
import type { Presentation } from '../src/domain/types';

async function slideXml(p: Presentation): Promise<string> {
  const lib = { ...createSeedLibrary(), presentations: [p] };
  const pptx = await buildPptx(lib, { presentation: p });
  const zip = await JSZip.loadAsync(await pptx.write({ outputType: 'nodebuffer' }) as Buffer);
  return zip.file('ppt/slides/slide1.xml')!.async('string');
}

describe('PPTX export keeps the slide as it looks on screen', () => {
  const deck: Presentation = {
    id: 'ad', title: '광고', themeId: 'theme_classic', slides: [{
      id: 's', group: '광고', text: '', elements: [
        { id: 't', kind: 'text', x: 120, y: 236, w: 1200, h: 100, text: '2. <수련회 안내>', fontSize: 56, bold: true },
        { id: 'b', kind: 'text', x: 120, y: 339, w: 1200, h: 500, text: '겨울 수련회\n• 장소', fontSize: 50, paragraphs: [{ text: '겨울 수련회\n', fontSize: 50 }, { text: '• 장소', fontSize: 50 }] },
      ],
    }],
  };

  it('adds no inner margin: the box is already the text area', async () => {
    const xml = await slideXml(deck);
    const bodies = xml.match(/<a:bodyPr[^>]*>/g)!;
    expect(bodies.length).toBeGreaterThan(1);
    for (const b of bodies) expect(b).toContain('lIns="0" tIns="0" rIns="0" bIns="0"');
  });

  it('spaces lines exactly as the screen does (font size × line height, in points)', async () => {
    const xml = await slideXml(deck);
    // 56 px title, plain box: 1.25 × 28 pt = 35 pt; 50 px paragraphs: 1.2 × 25 pt = 30 pt.
    expect(xml).toContain('<a:spcPts val="3500"/>');
    expect(xml).toContain('<a:spcPts val="3000"/>');
    expect(xml).not.toContain('spcPct');
  });

  it('marks Korean text as Korean, so PowerPoint uses its Korean font for it', async () => {
    expect(await slideXml(deck)).toContain('lang="ko-KR"');
  });

  it('adds no empty line for a paragraph’s last line break on a fixed-layout (Front) slide', async () => {
    const front: Presentation = { ...deck, id: 'f', title: '1101 Front', slides: [{ ...deck.slides[0], preserveTextLayout: true, group: 'Front' }] };
    const xml = await slideXml(front);
    expect(xml.match(/<a:t>[^<]*<\/a:t>/g)!.filter((t) => t === '<a:t> </a:t>' || t === '<a:t> </a:t>')).toEqual([]);
  });
});
