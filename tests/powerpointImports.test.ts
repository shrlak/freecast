import { beforeEach, describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import type { MediaMeta, Presentation, Slide } from '../src/domain/types';
import { createInitialState, reducer } from '../src/domain/reducer';
import { createSeedLibrary } from '../src/domain/defaults';
import { normalizeLibrary } from '../src/domain/persistence';
import { importPptx } from '../src/domain/io/pptxImport';

const mocks = vi.hoisted(() => ({ pptx: vi.fn(), pdf: vi.fn(), convert: vi.fn(), flatten: vi.fn(), put: vi.fn() }));
vi.mock('../src/domain/templates/serviceTemplates', () => ({ pptxSlides: mocks.pptx }));
vi.mock('../src/domain/io/pdf', () => ({ renderPdf: mocks.pdf }));
vi.mock('../src/domain/media', () => ({ putMedia: mocks.put }));
vi.mock('../src/domain/desktop', () => ({ desktop: { pptToPptx: mocks.convert, pptxToPdf: mocks.flatten } }));
import { filesToSlides } from '../src/ui/importFiles';

const page = (id = 'slide'): Slide => ({ id, group: 'Deck', text: '', elements: [
  { id: 'box', kind: 'text', text: '수정할 원본', x: 200, y: 100, w: 500, h: 100 },
  { id: 'image', kind: 'image', mediaId: 'photo', x: 100, y: 300, w: 200, h: 200 },
] });

async function deck(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file('ppt/presentation.xml', '<p:presentation><p:sldIdLst><p:sldId r:id="second"/><p:sldId r:id="first"/></p:sldIdLst></p:presentation>');
  zip.file('ppt/_rels/presentation.xml.rels', '<Relationships><Relationship Id="first" Target="slides/slide1.xml"/><Relationship Target="slides/slide2.xml" Id="second"/></Relationships>');
  for (const n of [1, 2]) {
    zip.file(`ppt/slides/slide${n}.xml`, `<p:sld><p:sp><a:p><a:r><a:t>본문 ${n}</a:t></a:r></a:p></p:sp></p:sld>`);
    zip.file(`ppt/slides/_rels/slide${n}.xml.rels`, `<Relationships><Relationship Target="../notesSlides/notesSlide${n}.xml"/></Relationships>`);
    zip.file(`ppt/notesSlides/notesSlide${n}.xml`, `<p:sp><a:p><a:r><a:t>노트 ${n}</a:t></a:r></a:p></p:sp>`);
  }
  return zip.generateAsync({ type: 'uint8array' });
}
const file = (bytes: Uint8Array, name: string) => new File([new Uint8Array(bytes)], name);

describe('editable PowerPoint imports', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.pptx.mockResolvedValue([page('first'), page('second')]);
    mocks.pdf.mockResolvedValue([{ page: 1, blob: new Blob(['PDF pixels']) }]);
  });
  it('keeps PPTX objects even when the desktop can flatten the entire deck to PDF; notes follow presentation order', async () => {
    const bytes = await deck(), media: MediaMeta[] = [];
    mocks.pptx.mockImplementation(async (_data, opts) => { await opts.store('photo', new Blob(['picture'])); return [page('first'), page('second')]; });
    mocks.flatten.mockResolvedValue(new Uint8Array([1, 2, 3]));
    const slides = await filesToSlides([file(bytes, '설교.PPTX')], (m) => media.push(m));
    expect(mocks.flatten).not.toHaveBeenCalled();
    expect(mocks.pdf).not.toHaveBeenCalled();
    expect(slides.map((s) => s.notes)).toEqual(['노트 2', '노트 1']);
    expect(slides[0].elements).toEqual(page().elements);
    expect(slides[0].importSource).toEqual({ format: 'pptx', name: '설교.PPTX', page: 1 });
    expect(media.every((m) => m.backgroundHidden)).toBe(true);
  });
  it('converts legacy PPT into OOXML and then uses the same editable importer', async () => {
    const bytes = await deck(); mocks.convert.mockResolvedValue(bytes);
    const slides = await filesToSlides([file(new Uint8Array([0xd0, 0xcf]), '기존.PPT')], () => {});
    expect(mocks.convert).toHaveBeenCalledOnce();
    expect(new Uint8Array(mocks.pptx.mock.calls[0][0])).toEqual(bytes);
    expect(slides[0].elements?.[0].text).toBe('수정할 원본');
    expect(slides[0].importSource?.format).toBe('ppt');
  });
  it('reports unavailable PPT conversion explicitly and never returns a destructive empty replacement', async () => {
    mocks.convert.mockResolvedValue(null);
    await expect(filesToSlides([file(new Uint8Array([1]), 'old.ppt')], () => {})).rejects.toThrow('PowerPoint 또는 LibreOffice');
    expect(mocks.pptx).not.toHaveBeenCalled();
  });
  it('uses editable plain text only when object rendering fails and reports the simplified layout', async () => {
    mocks.pptx.mockRejectedValue(new Error('unsupported'));
    const approximate = vi.fn();
    const slides = await filesToSlides([file(await deck(), 'fallback.pptx')], () => {}, undefined, approximate);
    expect(slides.map((s) => s.text)).toEqual(['본문 2', '본문 1']);
    expect(approximate).toHaveBeenCalledWith('fallback.pptx');
    await expect(filesToSlides([file(new Uint8Array([1, 2]), 'broken.pptx')], () => {})).rejects.toThrow('기존 자료는 유지');
  });
  it('marks PDF page content as read-only and keeps its media out of the background gallery', async () => {
    const media: MediaMeta[] = [];
    const slides = await filesToSlides([file(new Uint8Array([1]), '안내.pdf')], (m) => media.push(m));
    expect(slides[0].importSource).toEqual({ format: 'pdf', name: '안내.pdf', page: 1 });
    expect(slides[0].elements).toBeUndefined();
    expect(media[0].backgroundHidden).toBe(true);
  });
  it('the plain reader also preserves rearranged slide order and corresponding notes', async () => {
    const slides = await importPptx(new Blob([new Uint8Array(await deck())]));
    expect(slides.map((s) => [s.text, s.notes])).toEqual([['본문 2', '노트 2'], ['본문 1', '노트 1']]);
  });
});

describe('imported content editing and preservation', () => {
  const setup = () => {
    const lib = createSeedLibrary();
    const ppt = { ...page('ppt'), importSource: { format: 'pptx' as const, name: 'deck.pptx', page: 1 } };
    const pdf: Slide = { id: 'pdf', group: '안내', text: '', importSource: { format: 'pdf', name: '안내.pdf', page: 1 }, background: { kind: 'media', mediaId: 'pdf-pixels', mediaType: 'image' } };
    const p: Presentation = { id: 'imported', title: '설교', folder: 'Imported', themeId: lib.themes[0].id, slides: [ppt, pdf] };
    lib.presentations = [p]; lib.playlists = [{ id: 'playlist', name: '예배', items: [{ id: 'item', presentationId: p.id }] }];
    return createInitialState(lib);
  };
  it('edits only a selected PPT object, updates live output, survives saving, and undoes independently', () => {
    let state = reducer(setup(), { type: 'live/go', presentationId: 'imported', seq: 0, now: 1 });
    const original = state.library.presentations[0];
    state = reducer(state, { type: 'slide/update', presentationId: 'imported', slideId: 'ppt', patch: { elements: original.slides[0].elements!.map((el) => el.id === 'box' ? { ...el, text: '수정한 설교', x: 350 } : el) } });
    expect(state.live.slide?.elements?.[0]).toMatchObject({ text: '수정한 설교', x: 350 });
    expect(state.library.presentations[0].slides[1]).toEqual(original.slides[1]);
    expect(normalizeLibrary(JSON.parse(JSON.stringify(state.library)))?.presentations[0].slides[0].elements?.[0].text).toBe('수정한 설교');
    state = reducer(state, { type: 'undo' });
    expect(state.live.slide?.elements?.[0].text).toBe('수정할 원본');
  });
  it('rejects PDF visual edits, including bulk formatting and removing the read-only flag; keeps notes, hiding and deleting available', () => {
    let state = setup(); const pdf = state.library.presentations[0].slides[1];
    state = reducer(state, { type: 'slide/update', presentationId: 'imported', slideId: 'pdf', patch: { text: 'forbidden', background: undefined, elements: page().elements, importSource: undefined, notes: '무대 노트', disabled: true } });
    expect(state.library.presentations[0].slides[1]).toEqual({ ...pdf, notes: '무대 노트', disabled: true });
    state = reducer(state, { type: 'presentation/update', id: 'imported', patch: { slides: state.library.presentations[0].slides.map((s) => ({ ...s, background: undefined, style: { color: '#ff0000' } })) } });
    expect(state.library.presentations[0].slides[1].background).toEqual(pdf.background);
    expect(state.library.presentations[0].slides[1].style).toBeUndefined();
    state = reducer(state, { type: 'slide/delete', presentationId: 'imported', slideIds: ['pdf'] });
    expect(state.library.presentations[0].slides.map((s) => s.id)).toEqual(['ppt']);
  });
  it('replaces an old flattened deck with new editable pages without breaking playlist references and can undo', () => {
    let state = setup(); const before = state.library.presentations[0];
    state = reducer(state, { type: 'presentation/update', id: before.id, patch: { slides: [page('reimported')] } });
    expect(state.library.presentations[0]).toMatchObject({ id: before.id, title: before.title, folder: before.folder });
    expect(state.library.playlists[0].items[0]).toMatchObject({ presentationId: before.id });
    expect(state.library.presentations[0].slides[0].elements).toHaveLength(2);
    state = reducer(state, { type: 'undo' });
    expect(state.library.presentations[0].slides).toEqual(before.slides);
  });
});
