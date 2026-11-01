import { describe, expect, it } from 'vitest';
import type { RenderedPictureShape, RenderedSlide } from '../src/domain/io/pptxRender';
import type { Presentation } from '../src/domain/types';
import { applyInkFix, findOpeningDeck, fitToCanvas, inkFix, OPENING_SECTION, scorePages, scoreSlides, visiblePart } from '../src/domain/sunday/openingSong';
import { buildService } from '../src/domain/sunday/service';
import { createLiveService, insertIntoSection, SECTION, sectionPresentations } from '../src/domain/sunday/liveDeck';
import { createSeedLibrary } from '../src/domain/defaults';
// @ts-expect-error plain JS module
import { compactTitle, findSongPpt, naverAttachments, naverBlogPost, pageAttachments, pptKind, rankCandidates, resultLinks, titleScore } from '../server/songPpt.mjs';

const W = 9144000, H = 5143500; // a 16:9 deck
const pic = (imageUrl: string, x: number, y: number, w: number, h: number, crop?: RenderedPictureShape['crop']): RenderedPictureShape => ({ kind: 'picture', imageUrl, xEmu: x, yEmu: y, wEmu: w, hEmu: h, crop });
const slide = (index: number, shapes: RenderedSlide['shapes'], backgroundImage?: string): RenderedSlide => ({ index, widthEmu: W, heightEmu: H, shapes, backgroundImage });

describe('기도회 찬양: finding the PPT on the internet (server)', () => {
  it('reads result links in order, without the engine’s menus and sites’ home pages', () => {
    const html = `
      <a href="https://www.naver.com">N</a><a href="https://search.naver.com/search.naver?query=x">tab</a>
      <a href="https://blog.naver.com/kroz4">blog home</a><a href="https://blog.naver.com/kroz4/224452501583">post</a>
      <a href="https://cyw.pe.kr/xe/">site</a><a href="https://cyw.pe.kr/xe/index.php?mid=a50&amp;document_srl=381907">result</a>
      <a href="https://www.youtube.com/watch?v=1">video</a><a href="https://blog.naver.com/kroz4/224452501583">again</a>
      <a href="https://cafe.naver.com/club/1?art=x">cafe (login)</a>`;
    expect(resultLinks(html)).toEqual(['https://blog.naver.com/kroz4/224452501583', 'https://cyw.pe.kr/xe/index.php?mid=a50&document_srl=381907']);
    expect(naverBlogPost('https://m.blog.naver.com/kroz4/224452501583')).toEqual({ blogId: 'kroz4', logNo: '224452501583' });
    expect(naverBlogPost('https://blog.naver.com/PostView.naver?blogId=a_b&logNo=12')).toEqual({ blogId: 'a_b', logNo: '12' });
    expect(naverBlogPost('https://blog.naver.com/kroz4')).toBeNull();
  });

  it('lists the PowerPoint files attached to a Naver blog post', () => {
    const html = `aPostFiles = []
aPostFiles[1] = JSON.parse('[{"encodedAttachFileName": "주를찾는모든자들이.png","encodedAttachFileUrl": "https://download.blog.naver.com/open/a/b.png"} , {"encodedAttachFileName": "주를찾는모든자들이.pptx","encodedAttachFileNameByTruncate": "주를찾는모든자들이.pptx","encodedAttachFileUrl": "https://download.blog.naver.com/open/c/d.pptx","licenseyn": "T"}]'.replace(/\\\\'/g, ''))`;
    expect(naverAttachments(html)).toEqual([{ name: '주를찾는모든자들이.pptx', url: 'https://download.blog.naver.com/open/c/d.pptx' }]);
  });

  it('finds PowerPoint links on other pages by address or by link text', () => {
    const html = `
      <a href="https://blog.kakaocdn.net/dna/x/%EC%9D%80%ED%98%9C%20-%20PPT.pptx?credential=1&amp;attach=1&amp;knm=tfile.pptx">은혜 - PPT.pptx<span>새 창 열림</span></a>
      <a href="/xe/?module=file&amp;act=procFileDownload&amp;file_srl=5">첨부파일 나의안에거하라 . ppt</a>
      <a href="/about">About</a><a href="https://x.org/a.pdf">a.pdf</a>`;
    expect(pageAttachments(html, 'https://cyw.pe.kr/xe/index.php')).toEqual([
      { name: '은혜 - PPT.pptx', url: 'https://blog.kakaocdn.net/dna/x/%EC%9D%80%ED%98%9C%20-%20PPT.pptx?credential=1&attach=1&knm=tfile.pptx' },
      { name: '나의안에거하라.ppt', url: 'https://cyw.pe.kr/xe/?module=file&act=procFileDownload&file_srl=5' },
    ]);
    // On a search page a result title ending in "ppt" is a post, not a file.
    expect(pageAttachments('<a href="https://cyw.pe.kr/xe/index.php?document_srl=1">주를찾는모든자 ppt</a>', 'https://search.naver.com/', { byText: false })).toEqual([]);
  });

  it('scores file names against the title', () => {
    expect(compactTitle('455장 주님의 마음을 본받는 자(G) - PPT 악보.pptx')).toBe('주님의마음을본받는자');
    expect(titleScore('주를 찾는 모든 자들이', '주를찾는모든자들이.pptx')).toBe(1);
    expect(titleScore('은혜', '은혜 - PPT.pptx')).toBe(1);
    // Another song that only contains the title scores lower than the song itself.
    expect(titleScore('은혜', '하루의 은혜.ppt')).toBeLessThan(0.8);
    expect(titleScore('나의 안에 거하라', '주를찾는모든자들이.pptx')).toBeLessThan(0.3);
    const ranked = rankCandidates('은혜', [
      { name: '하루의 은혜.ppt', url: 'u1', page: 'p1', rank: 0 },
      { name: '은혜.ppt', url: 'u2', page: 'p2', rank: 1 },
      { name: '은혜 - PPT.pptx', url: 'u3', page: 'p3', rank: 4 },
      { name: '전혀 다른 곡.pptx', url: 'u4', page: 'p4', rank: 0 },
    ]);
    // Same name match: a .pptx (no PowerPoint needed to open it) comes first.
    expect(ranked.map((c: { url: string }) => c.url)).toEqual(['u3', 'u2', 'u1']);
    expect(ranked[0]).toMatchObject({ name: '은혜 - PPT.pptx', format: 'pptx', score: 1 });
  });

  it('searches "<제목> ppt", opens the results and returns the best files', async () => {
    const pages: Record<string, string> = {
      'https://search.naver.com/search.naver?query=%EC%A3%BC%EB%A5%BC%20%EC%B0%BE%EB%8A%94%20%EB%AA%A8%EB%93%A0%20%EC%9E%90%EB%93%A4%EC%9D%B4%20ppt':
        '<a href="https://blog.naver.com/kroz4/1">post</a><a href="https://example.org/board/7">board</a>',
      'https://blog.naver.com/PostView.naver?blogId=kroz4&logNo=1&redirect=Dlog&widgetTypeCall=true&directAccess=false':
        `aPostFiles[1] = JSON.parse('[{"encodedAttachFileName": "주를찾는모든자들이.pptx","encodedAttachFileUrl": "https://download.blog.naver.com/f.pptx"}]')`,
      'https://example.org/board/7': '<a href="/files/other.pptx">other.pptx</a>',
    };
    const asked: string[] = [];
    const get = async (url: string) => {
      asked.push(url);
      if (!(url in pages)) throw new Error('404');
      return pages[url];
    };
    const r = await findSongPpt('주를 찾는 모든 자들이', { get });
    expect(r.query).toBe('주를 찾는 모든 자들이 ppt');
    expect(r.candidates).toEqual([{ name: '주를찾는모든자들이.pptx', url: 'https://download.blog.naver.com/f.pptx', page: 'https://blog.naver.com/kroz4/1', format: 'pptx', score: 1 }]);
    // A sure match in the web results: the blog tab is not searched.
    expect(asked.filter((u) => u.includes('tab.blog'))).toEqual([]);
  });

  it('only passes PowerPoint files on', () => {
    expect(pptKind(Buffer.from('PK\x03\x04rest', 'latin1'))).toBe('pptx');
    expect(pptKind(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0]))).toBe('ppt');
    expect(pptKind(Buffer.from('<!doctype html><html>login</html>'))).toBeNull();
  });
});

describe('기도회 찬양: only the sheet music, on white', () => {
  it('drops the background, repeated decorations, a full-slide picture underneath and small icons', () => {
    const slides = [
      slide(0, [pic('deco', 0, 0, W, H), pic('score1', 0, 0, W, 4826000), pic('arrow', 254000, 4826000, 200000, 200000)], 'bg'),
      slide(1, [pic('deco', 0, 0, W, H), pic('score2', 0, 0, W, 4826000), pic('arrow', 254000, 4826000, 200000, 200000)], 'bg'),
      slide(2, [pic('deco', 0, 0, W, H), pic('score3', 0, 0, W, 4826000)], 'bg'),
      // A title slide with only text: nothing to show.
      slide(3, [{ kind: 'text', xEmu: 0, yEmu: 0, wEmu: W, hEmu: H, paragraphs: [{ runs: [{ text: '주를 찾는 모든 자들이' }] }] }], 'bg'),
    ];
    const pages = scorePages(slides);
    expect(pages.map((p) => [p.index, p.pictures.map((x) => x.imageUrl)])).toEqual([[0, ['score1']], [1, ['score2']], [2, ['score3']]]);
    // A two-slide deck: a picture under the score that fills the slide is still the background.
    const two = scorePages([slide(0, [pic('photo', 0, 0, W, H), pic('s1', 100, 100, W / 2, H / 2)]), slide(1, [pic('s2', 0, 0, W, H)])]);
    expect(two.map((p) => p.pictures.map((x) => x.imageUrl))).toEqual([['s1'], ['s2']]);
  });

  it('keeps only the part of a picture inside the slide', () => {
    // 455장: the score hangs off the top of the slide and is cropped at the bottom.
    const v = visiblePart(pic('s', 0, -1000, 10000, 4000, { l: 0, t: 0, r: 0, b: 0.2 }), 10000, 5000)!;
    expect(v.box).toEqual({ x: 0, y: 0, w: 10000, h: 3000 });
    expect(v.crop!.t).toBeCloseTo(0.2);
    expect(v.crop!.b).toBeCloseTo(0.2);
    expect(visiblePart(pic('s', 0, 0, 10, 10), 10, 10)!.crop).toBeUndefined();
    expect(visiblePart(pic('s', 20, 0, 10, 10), 10, 10)).toBeNull();
  });

  it('makes the score as large as the 4:3 slide allows, layout kept', () => {
    expect(fitToCanvas([{ x: 0, y: 0, w: 1600, h: 900 }])).toEqual([{ x: 24, y: 149, w: 1392, h: 783 }]);
    const two = fitToCanvas([{ x: 0, y: 0, w: 100, h: 50 }, { x: 0, y: 50, w: 100, h: 50 }]);
    expect(two[0].y + two[0].h).toBe(two[1].y);
    expect(two[0].w).toBe(two[1].w);
  });

  it('darkens light ink made for dark backgrounds, inverts light-on-dark scores, leaves black notes', () => {
    const image = (pixels: number[][], repeat = 50) => new Uint8ClampedArray(Array.from({ length: repeat }, () => pixels).flat(2));
    const whiteInk = image([[255, 255, 255, 255], [0, 0, 0, 0], [0, 0, 0, 0]]);
    expect(inkFix(whiteInk)).toBe('darken');
    applyInkFix(whiteInk, 'darken');
    expect([...whiteInk.slice(0, 4)]).toEqual([0, 0, 0, 255]);
    expect(inkFix(image([[0, 0, 0, 255], [0, 0, 0, 0], [0, 0, 0, 0]]))).toBe('none');
    const dark = image([[10, 10, 10, 255], [10, 10, 10, 255], [10, 10, 10, 255], [10, 10, 10, 255], [240, 240, 240, 255]]);
    expect(inkFix(dark)).toBe('invert');
    applyInkFix(dark, 'invert');
    expect([...dark.slice(0, 4)]).toEqual([245, 245, 245, 255]);
    // A dark photo (colourful) is not inverted.
    expect(inkFix(image([[120, 20, 10, 255], [10, 40, 120, 255]]))).toBe('none');
    // A score already on white stays.
    expect(inkFix(image([[255, 255, 255, 255], [255, 255, 255, 255], [0, 0, 0, 255]]))).toBe('none');
  });

  it('builds white slides of pictures only', () => {
    const [s] = scoreSlides([{ index: 2, mediaIds: ['m1'], boxes: [{ x: 0, y: 0, w: 1600, h: 900 }] }], '주를 찾는 모든 자들이', { name: 'a.pptx', format: 'pptx' });
    expect(s.background).toEqual({ kind: 'color', value: '#ffffff' });
    expect(s.text).toBe('');
    expect(s.elements).toEqual([expect.objectContaining({ kind: 'image', mediaId: 'm1', x: 24, y: 149, w: 1392, h: 783 })]);
    expect(s.importSource).toEqual({ format: 'pptx', name: 'a.pptx', page: 3 });
  });

  it('reuses the sheet music of an earlier week', () => {
    const deck = { id: 'd', title: '주를 찾는 모든 자들이', slides: [{ id: 's', group: 'x', text: '' }], themeId: 't', scoreSheet: { title: '주를 찾는 모든 자들이', file: 'a.pptx', page: 'p' } } as Presentation;
    expect(findOpeningDeck([deck], '주를찾는 모든자들이!')).toBe(deck);
    expect(findOpeningDeck([{ ...deck, scoreSheet: undefined }], '주를 찾는 모든 자들이')).toBeUndefined();
  });
});

describe('기도회 찬양 in the 주일예배 order', () => {
  const lib = createSeedLibrary();
  const deck: Presentation = { id: 'opening', title: '주를 찾는 모든 자들이', slides: [{ id: 's1', group: '주를 찾는 모든 자들이', text: '' }], themeId: 'theme_classic', folder: '기도회 찬양 악보' };

  it('opens the service, before the Front (기도제목)', () => {
    const { playlist, presentations } = buildService({ ...lib, presentations: [...lib.presentations, deck] }, {
      date: new Date(2026, 10, 1), songs: [], scriptureSlides: [], sermonSlides: [], prayerTopics: [{ title: 'A', points: [] }], announcements: [], extraSlides: [], openingSong: deck,
    });
    const headers = playlist.items.flatMap((i) => (i.kind === 'header' ? [i.title] : []));
    expect(headers.slice(0, 2)).toEqual([OPENING_SECTION, 'Front']);
    expect(playlist.items[1]).toMatchObject({ presentationId: 'opening' });
    // Already in the library: not created again.
    expect(presentations.some((p) => p.id === 'opening')).toBe(false);
    const without = buildService(lib, { date: new Date(2026, 10, 1), songs: [], scriptureSlides: [], sermonSlides: [], prayerTopics: [], announcements: [], extraSlides: [] });
    expect(without.playlist.items[0]).toMatchObject({ kind: 'header', title: 'Front' });
  });

  it('goes in front of the Front in an existing week’s playlist, and can be replaced', () => {
    const live = createLiveService(lib, null, new Date(2026, 10, 1));
    let pl = insertIntoSection(live.playlist, SECTION.opening, ['opening'], { replace: true });
    expect(pl.items[0]).toMatchObject({ kind: 'header', title: OPENING_SECTION });
    expect(pl.items[1]).toMatchObject({ presentationId: 'opening' });
    expect(pl.items[2]).toMatchObject({ kind: 'header', title: 'Front' });
    pl = insertIntoSection(pl, SECTION.opening, ['other'], { replace: true });
    expect(sectionPresentations(pl, SECTION.opening)).toEqual(['other']);
    expect(pl.items.filter((i) => i.kind === 'header' && i.title === OPENING_SECTION)).toHaveLength(1);
  });
});
