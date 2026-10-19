import { describe, expect, it } from 'vitest';
import type { Library, Presentation, Slide, SlideElement } from '../src/domain/types';
import type { RenderedSlide } from '../src/domain/io/pptxRender';
import { fillTokens, frameFor, patchElement, slideFromRendered, withElementText } from '../src/domain/templates/convert';
import { announcementSlides, fillFront, scriptureSlides, sermonTitleSlide, songInTemplate, templateLyricsTheme, TEMPLATE_LYRICS_THEME } from '../src/domain/templates/fill';
import type { ServiceTemplates } from '../src/domain/templates/serviceTemplates';
import { createLiveService, insertIntoSection, SECTION, sectionPresentations } from '../src/domain/sunday/liveDeck';
import { createSeedLibrary } from '../src/domain/defaults';
import { parseRefs } from '../src/domain/bible/refs';

const text = (id: string, t: string, y = 100, extra: Partial<SlideElement> = {}): SlideElement => ({
  id, kind: 'text', x: 300, y, w: 1300, h: 200, text: t, paragraphs: t.split('\n').map((line, i) => ({ text: line, fontSize: i ? 40 : 60, bold: i === 0 || undefined })), ...extra,
});
const slide = (group: string, elements: SlideElement[]): Slide => ({ id: `s_${group}`, group, text: '', elements, background: { kind: 'media', mediaId: `bg_${group}`, mediaType: 'image', fit: 'cover' } });

const TPL: ServiceTemplates = {
  front: [
    slide('Front', [text('t1', '지금은 기도로 예배를 준비하는\n시간입니다.'), text('t2', '기도제목 1\n기도제목 2', 300)]),
    slide('Front', [text('d', '빛주사랑\n대학청년부\n07/12/2026', 800)]),
    slide('Front', [text('c', '신앙고백\nApostles’ Creed')]),
  ],
  prayer: slide('기도', [text('p', '기도\nPrayer')]),
  announceTitle: slide('광고', [text('a', '광고\nAnnouncement')]),
  announceItem: slide('광고', [text('h', '광고\nAnnouncements', 60), text('it', '1. <새가족 환영>', 230), text('b', '오늘 처음 오신 분들을 환영합니다!', 330)]),
  songTitle: slide('Title', [text('st', '주님의 사랑', 460)]),
  songLyrics: slide('찬양', [text('ly', '눈부신 햇살\n저 하늘 너머', 211, { x: 254, w: 1412, h: 640 }), text('sm', '주님의 사랑', 24, { w: 590, h: 73 })]),
  bibleTitle: slide('성경 말씀', [text('bt', '{{RANGE_KO}}\n{{RANGE_EN}}', 560), text('bl', '성경 말씀\nBible verse', 250)]),
  bibleVerse: slide('성경 말씀', [
    text('vh', '{{RANGE_KO}}\n{{RANGE_EN}}', 33),
    text('vb', '{{TITLE}} {{CHAP}}장 {{PARA}}절\n{{BODY}}', 250),
    text('v2', '{{ETITLE}} {{CHAP}}:{{PARA}}\n{{BODY2}}', 736),
  ]),
  sermon: slide('설교', [text('sh', '설교\nSermon', 186), text('sp', '방태준 목사님', 822), text('stt', '{{SERMON_TITLE}}\n{{RANGE_KO}}', 482)]),
};
const els = (s: Slide) => (s.elements ?? []).map((e) => e.text);

describe('PPTX slide conversion', () => {
  it('centres a 4:3 slide with bars and maps text boxes to canvas pixels', () => {
    const f = frameFor(9144000, 6858000);
    expect(f.x).toBe(240);
    expect(f.y).toBe(0);
    const rs: RenderedSlide = {
      index: 0, widthEmu: 9144000, heightEmu: 6858000, shapes: [
        { kind: 'text', xEmu: 0, yEmu: 0, wEmu: 9144000, hEmu: 1000000, anchor: 'ctr', paragraphs: [{ align: 'ctr', runs: [{ text: '기도', sizePt: 40, bold: true, color: '#000000', fontFamily: 'Arial' }] }, { runs: [{ text: 'Prayer', sizePt: 30 }] }] },
        { kind: 'text', xEmu: 0, yEmu: 0, wEmu: 100, hEmu: 100, paragraphs: [{ runs: [{ text: '  ' }] }] },
        { kind: 'picture', xEmu: 0, yEmu: 0, wEmu: 100, hEmu: 100, imageUrl: 'blob:x' },
      ],
    };
    const s = slideFromRendered(rs, 'bg', 'Front');
    expect(s.text).toBe('');
    expect(s.background).toEqual({ kind: 'media', mediaId: 'bg', mediaType: 'image', fit: 'cover' });
    expect(s.elements).toHaveLength(1);
    const [el] = s.elements!;
    expect(el.text).toBe('기도\nPrayer');
    expect(el.x).toBe(254); // 240 bar + 0.1" inset
    expect(el.paragraphs![0]).toMatchObject({ fontSize: 80, bold: true, align: 'center' });
    expect(el.paragraphs![1].fontSize).toBe(60);
    expect(el.vAlign).toBe('middle');
    expect(el.fontFamily).toContain('Arimo');
  });

  it('keeps per-line formatting when text or size changes', () => {
    const el = text('x', '제목\n본문');
    const next = withElementText(el, '새 제목\n줄 1\n줄 2');
    expect(next.paragraphs!.map((p) => [p.text, p.fontSize])).toEqual([['새 제목', 60], ['줄 1', 40], ['줄 2', 40]]);
    const bigger = patchElement({ ...el, fontSize: 60 }, { fontSize: 120 });
    expect(bigger.paragraphs!.map((p) => p.fontSize)).toEqual([120, 80]);
    expect(patchElement(el, { color: '#ff0000' }).paragraphs!.every((p) => p.color === undefined)).toBe(true);
  });

  it('fills tokens and drops lines whose value is missing', () => {
    expect(fillTokens('{{TITLE}} {{CHAP}}장 {{PARA}}절\n{{BODY}}', { TITLE: '창세기', CHAP: '1', PARA: '1-3', BODY: '1 태초에' })).toBe('창세기 1장 1-3절\n1 태초에');
    expect(fillTokens('{{SERMON_TITLE}}\n{{RANGE_KO}}', { RANGE_KO: '요한복음 3:16' })).toBe('요한복음 3:16');
    expect(fillTokens('plain', {})).toBe('plain');
  });
});

describe('church template filling', () => {
  it('prints the service date and this week’s 기도제목 on the Front slides', () => {
    const date = new Date(2026, 9, 18);
    const none = fillFront(TPL, date, []);
    expect(none).toHaveLength(3);
    expect(els(none[1])[0]).toBe('빛주사랑\n대학청년부\n10/18/2026');
    const topics = [{ title: '예배', points: ['은혜'] }, { title: '선교', points: [] }];
    const withTopics = fillFront(TPL, date, topics);
    expect(withTopics[0].group).toBe('기도제목');
    expect(els(withTopics[0])[1]).toBe('1. 예배\n● 은혜\n● 선교');
    expect(withTopics[0].elements![1].paragraphs!.map((p) => !!p.bold)).toEqual([true, false, false]);
    expect(withTopics[0].id).not.toBe(TPL.front[0].id);
  });

  it('makes a 광고 title slide and one slide per announcement', () => {
    const slides = announcementSlides(TPL, [{ title: '수련회', body: ['등록 마감', '이번 주'], links: ['https://x.y'] }, { title: '식사', body: ['점심'], links: [] }]);
    expect(slides).toHaveLength(3);
    expect(els(slides[1])).toEqual(['광고\nAnnouncements', '1. <수련회>', '등록 마감\n이번 주']);
    expect(slides[1].qr).toEqual(['https://x.y']);
    expect(els(slides[2])[1]).toBe('2. <식사>');
    expect(announcementSlides(TPL, [])).toEqual([]);
  });

  it('puts a song in the template design without touching its lyrics', () => {
    const song: Presentation = {
      id: 'p_song', title: '은혜', themeId: 'theme_sunday', online: true, folder: 'Songs',
      slides: [{ id: 'a', group: 'Verse 1', text: '내가 누려왔던', caption: 'x' }, { id: 'b', group: 'Chorus', text: '모든 것이 은혜' }],
      arrangements: [{ id: 'ar', name: 'Default', groups: ['Title', 'Verse 1', 'Chorus'] }],
    };
    const out = songInTemplate(song, TPL, '1018 주일예배');
    expect(out.id).not.toBe(song.id);
    expect(out.online).toBeUndefined();
    expect(out.themeId).toBe(TEMPLATE_LYRICS_THEME);
    expect(out.background).toEqual(TPL.songLyrics.background);
    expect(out.slides.map((s) => s.group)).toEqual(['Title', 'Verse 1', 'Chorus']);
    expect(els(out.slides[0])).toEqual(['은혜']);
    expect(out.slides[1].text).toBe('내가 누려왔던');
    expect(out.slides[1].caption).toBeUndefined();
    expect(els(out.slides[1])).toEqual(['은혜']); // small title in the corner
    expect(out.arrangements![0].groups).toEqual(['Verse 1', 'Chorus']);
  });

  it('derives the lyrics theme from the template’s lyric box', () => {
    const t = templateLyricsTheme(TPL);
    expect(t.id).toBe(TEMPLATE_LYRICS_THEME);
    expect(t.fontSize).toBe(60);
    expect(t.padding).toBe(254);
  });

  it('fills the Bible and sermon templates', () => {
    const { refs } = parseRefs('요한복음 3:16-17');
    const chunk = { ref: refs[0], label: '요한복음 3:16-17', nameKo: '요한복음', nameEn: 'John', chapter: 3, verses: '16-17', lines: ['16 하나님이', '17 하나님이'], lines2: [] };
    const slides = scriptureSlides(TPL, { refs, chunks: [chunk] });
    expect(slides).toHaveLength(2);
    expect(els(slides[0])[0]).toBe('요한복음 3:16-17\nJohn 3:16-17');
    expect(els(slides[1])).toEqual(['요한복음 3:16-17\nJohn 3:16-17', '요한복음 3장 16-17절\n16 하나님이\n17 하나님이']);
    const sermon = sermonTitleSlide(TPL, { refs, sermonTitle: '사랑', preacher: '김목사' });
    expect(els(sermon)).toEqual(['설교\nSermon', '김목사', '사랑\n요한복음 3:16-17']);
  });
});

describe('live 주일예배 playlist', () => {
  const lib: Library = createSeedLibrary();
  const date = new Date(2026, 9, 18);
  const live = createLiveService(lib, TPL, date);
  const title = (id: string) => live.presentations.find((p) => p.id === id)?.title ?? lib.presentations.find((p) => p.id === id)?.title ?? id;
  const outline = (items = live.playlist.items) => items.map((i) => (i.kind === 'header' ? `# ${i.title}` : title(i.presentationId)));

  it('lays out the service like the ppt program', () => {
    expect(live.playlist.name).toBe('1018 주일예배');
    expect(outline()).toEqual(['# Front', '1018 Front', '# 찬양', '1018 기도', '# 성경 말씀', '# 설교', '1018 설교', '1018 기도', '# 설교 후 찬양', '# 광고', '# Back / End', '주일예배 Back']);
  });

  it('inserts songs before the section’s 기도 and replaces them on a new 콘티', () => {
    let pl = insertIntoSection(live.playlist, SECTION.songs, ['song1', 'song2']);
    expect(outline(pl.items).slice(2, 6)).toEqual(['# 찬양', 'song1', 'song2', '1018 기도']);
    pl = insertIntoSection(pl, SECTION.songs, ['song3'], { replace: true });
    expect(sectionPresentations(pl, SECTION.songs)).toEqual(['song3']);
    expect(outline(pl.items).slice(2, 5)).toEqual(['# 찬양', 'song3', '1018 기도']);
  });

  it('gives 설교 후 찬양 its own 기도, and removes it when emptied', () => {
    let pl = insertIntoSection(live.playlist, SECTION.after, ['late']);
    const i = outline(pl.items).indexOf('# 설교 후 찬양');
    expect(outline(pl.items).slice(i, i + 3)).toEqual(['# 설교 후 찬양', 'late', '1018 기도']);
    pl = insertIntoSection(pl, SECTION.after, [], { replace: true });
    expect(outline(pl.items).slice(i, i + 2)).toEqual(['# 설교 후 찬양', '# 광고']);
  });
});

describe('church Back deck', () => {
  const back = [slide('Back', [text('k', '공동체 고백송\n“Celebrate the Light”')]), slide('Back', [text('o', '헌금\nOffering')])];
  const tpl = { ...TPL, back };
  const date = new Date(2026, 9, 18);

  it('replaces the placeholder Back deck in a new service', () => {
    const lib = createSeedLibrary();
    const live = createLiveService(lib, tpl, date);
    const backPres = live.presentations.find((p) => p.title === '1018 Back')!;
    expect(backPres.slides.map((s) => s.elements![0].text)).toEqual(['공동체 고백송\n“Celebrate the Light”', '헌금\nOffering']);
    expect(live.playlist.items.at(-1)).toMatchObject({ presentationId: backPres.id });
  });

  it('keeps a Back deck the church has already registered or customised', () => {
    const lib = createSeedLibrary();
    const custom = { ...lib, presentations: lib.presentations.map((p) => (p.id === lib.sunday.backId ? { ...p, slides: [{ id: 'mine', group: 'Back', text: '축도' }] } : p)) };
    const live = createLiveService(custom, tpl, date);
    expect(live.presentations.some((p) => p.title === '1018 Back')).toBe(false);
    expect(live.playlist.items.at(-1)).toMatchObject({ presentationId: lib.sunday.backId });
  });
});
