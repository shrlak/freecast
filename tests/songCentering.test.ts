import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Presentation, SlideElement } from '../src/domain/types';
import { centerSongLyrics } from '../src/domain/songCentering';
import { CANVAS_H, CANVAS_W } from '../src/domain/canvas';
import { createSeedLibrary } from '../src/domain/defaults';
import { normalizeLibrary } from '../src/domain/persistence';
import { createInitialState, reducer } from '../src/domain/reducer';
import { songToPresentation } from '../src/domain/sunday/songs';
import { exportPptx } from '../src/domain/io/pptxExport';

const box = (id: string, text: string, x: number, y: number, w: number, h: number): SlideElement => ({ id, kind: 'text', text, x, y, w, h, fontSize: 80, align: 'left', vAlign: 'top', paragraphs: [{ text, bold: true, align: 'left' }] });
const song = (): Presentation => ({
  id: 'song', title: 'SONG_TITLE', folder: 'Songs', themeId: 'theme_classic', slidesEdited: true,
  songSource: { sections: [{ label: 'V1', lines: ['LINE_1', 'LINE_2'] }], order: ['V1', 'V1'] },
  arrangements: [{ id: 'arr', name: '반복', groups: ['Title', 'Verse 1', 'Verse 1'] }], arrangementId: 'arr',
  slides: [
    { id: 'title', group: 'Title', text: '', elements: [box('title-box', 'SONG_TITLE', 30, 100, 600, 100)] },
    { id: 'lyric', group: 'Verse 1', text: 'LINE_1\nLINE_2', notes: '발표 노트', style: { align: 'left', vAlign: 'top', fontSize: 99, color: '#123456', indent: 3 }, elements: [box('corner', 'SONG_TITLE', 20, 25, 500, 60)] },
  ],
});

describe('centered song lyrics', () => {
  it('centers saved individual lyric slides without rebuilding pages, arrangements or the title', () => {
    const before = song(); const after = centerSongLyrics(before);
    expect(after.slides[0]).toBe(before.slides[0]);
    expect(after.slides.map((s) => s.id)).toEqual(before.slides.map((s) => s.id));
    expect(after.slides[1]).toMatchObject({ text: 'LINE_1\nLINE_2', notes: '발표 노트', style: { align: 'center', vAlign: 'middle', indent: 0, fontSize: 99, color: '#123456' } });
    expect(after.slides[1].elements![0]).toBe(before.slides[1].elements![0]);
    expect(after.arrangements).toBe(before.arrangements); expect(after.songSource).toBe(before.songSource);
    expect(after.slidesEdited).toBe(true); expect(centerSongLyrics(after)).toBe(after);
  });

  it('centers an imported lyric box and its paragraphs without moving the corner title or logo', () => {
    const p = song(); const corner = p.slides[1].elements![0];
    const lyric = box('body', 'IMPORTED_LYRICS', 100, 150, 1000, 400);
    const logo: SlideElement = { id: 'logo', kind: 'image', x: 1250, y: 20, w: 100, h: 60 };
    p.slides[1] = { ...p.slides[1], text: '', elements: [corner, lyric, logo] };
    const after = centerSongLyrics(p).slides[1].elements!;
    expect(after[0]).toBe(corner); expect(after[2]).toBe(logo);
    expect(after[1].x + after[1].w / 2).toBe(CANVAS_W / 2);
    expect(after[1].y + after[1].h / 2).toBe(CANVAS_H / 2);
    expect(after[1]).toMatchObject({ id: 'body', text: 'IMPORTED_LYRICS', fontSize: 80, align: 'center', vAlign: 'middle', paragraphs: [{ text: 'IMPORTED_LYRICS', bold: true, align: 'center' }] });
  });

  it('moves bilingual lyric boxes as one centered block and keeps their spacing', () => {
    const p = song(); p.slides[1] = { ...p.slides[1], text: '', elements: [box('ko', '한글 가사', 100, 100, 1000, 200), box('en', 'English lyrics', 200, 350, 1000, 160)] };
    const [ko, en] = centerSongLyrics(p).slides[1].elements!;
    expect(ko.x + ko.w / 2).toBe(720); expect(en.x + en.w / 2).toBe(720);
    expect((ko.y + en.y + en.h) / 2).toBe(540);
    expect(en.y - (ko.y + ko.h)).toBe(50);
  });

  it('migrates existing songs once and preserves subsequent intentional per-slide edits on reload', () => {
    const lib = createSeedLibrary(); lib.presentations = [song()];
    const migrated = normalizeLibrary(JSON.parse(JSON.stringify(lib)))!;
    expect(migrated.presentations[0].slides[1].style?.vAlign).toBe('middle');
    migrated.presentations[0].slides[1].style!.vAlign = 'bottom';
    const reloaded = normalizeLibrary(JSON.parse(JSON.stringify(migrated)))!;
    expect(reloaded.presentations[0].slides[1].style?.vAlign).toBe('bottom');
    const bible = { ...song(), folder: '말씀', songSource: undefined };
    expect(centerSongLyrics(bible)).toBe(bible);
  });

  it('centers newly created and online songs including their repeated pages', () => {
    const generated = songToPresentation({ title: '새 찬양', sections: [{ label: 'C', lines: ['가사'] }], progression: ['C', 'C'] }, { themeId: 'theme_classic', linesPerSlide: 4 });
    expect(generated.slides[0].style).toMatchObject({ align: 'center', vAlign: 'middle' });
    const state = reducer(createInitialState(createSeedLibrary()), { type: 'presentation/create', presentation: song() });
    expect(state.library.presentations.at(-1)?.slides[1].style?.vAlign).toBe('middle');
    const online = reducer(state, { type: 'online/songs', presentations: [{ ...song(), id: 'online:another', title: '서버 찬양', online: true }] });
    expect(online.library.presentations.find((p) => p.id === 'online:another')?.slides[1].style?.vAlign).toBe('middle');
  });

  it('centers subsequently added lyric pages without resetting an existing intentional edit', () => {
    const lib = createSeedLibrary(); const p = centerSongLyrics(song());
    p.slides[1].style!.vAlign = 'bottom'; lib.presentations = [p];
    const state = reducer(createInitialState(lib), { type: 'presentation/update', id: p.id, patch: {
      slides: [...p.slides, { id: 'new-page', group: 'Verse 1', text: '새 가사 슬라이드' }],
    } });
    const after = state.library.presentations[0];
    expect(after.slides[1]).toBe(p.slides[1]); expect(after.slides[1].style?.vAlign).toBe('bottom');
    expect(after.slides[2]).toMatchObject({ id: 'new-page', lyricBody: true, style: { align: 'center', vAlign: 'middle' } });
  });

  it('writes centered lyric geometry and paragraph alignment into the actual PowerPoint file', async () => {
    const lib = createSeedLibrary(); const before = song(); before.slides[1].qr = ['https://example.org'];
    const p = centerSongLyrics(before);
    const dir = await mkdtemp(join(tmpdir(), 'freecast-centered-'));
    try {
      await exportPptx(lib, { presentation: p }, join(dir, 'lyrics.pptx'));
      const zip = await JSZip.loadAsync(await readFile(join(dir, 'lyrics.pptx')));
      const xml = await zip.file('ppt/slides/slide2.xml')!.async('string');
      const body = [...xml.matchAll(/<p:sp>[\s\S]*?<\/p:sp>/g)].map((m) => m[0]).find((s) => s.includes('LINE_1'))!;
      expect(body).toContain('anchor="ctr"'); expect(body).toContain('algn="ctr"');
      const off = /<a:off x="(\d+)" y="(\d+)"\/>/.exec(body)!;
      const ext = /<a:ext cx="(\d+)" cy="(\d+)"\/>/.exec(body)!;
      expect(+off[1] + +ext[1] / 2).toBeCloseTo(4572000, 0);
      expect(+off[2] + +ext[2] / 2).toBeCloseTo(3429000, 0);
      const paragraphs = [...body.matchAll(/<a:p>[\s\S]*?<\/a:p>/g)].map((m) => m[0]);
      expect(paragraphs.at(-1)).toContain('LINE_2');
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});
