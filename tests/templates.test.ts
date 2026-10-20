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
  keys: { front: 'f1', song: 's1' },
};
const els = (s: Slide) => (s.elements ?? []).map((e) => e.text);

describe('PPTX slide conversion', () => {
  it('fills the 4:3 canvas with a 4:3 slide and maps text boxes to canvas pixels', () => {
    const f = frameFor(9144000, 6858000);
    expect(f.x).toBe(0);
    expect(f.y).toBe(0);
    const wide = frameFor(12192000, 6858000); // 16:9 sermon deck: bars above and below
    expect(wide.x).toBe(0);
    expect(wide.y).toBeGreaterThan(0);
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
    expect(el.x).toBe(14); // 0.1" inset
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
    expect(els(withTopics[0])[1]).toBe('1. 예배\n● 은혜\n2. 선교');
    expect(withTopics[0].elements![1].paragraphs!.map((p) => !!p.bold)).toEqual([true, false, true]);
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
    expect(out.arrangements![0].groups).toEqual(['Title', 'Verse 1', 'Chorus']); // the title slide opens it
  });

  it('derives the lyrics theme from the template’s lyric box', () => {
    const t = templateLyricsTheme(TPL);
    expect(t.id).toBe(TEMPLATE_LYRICS_THEME);
    expect(t.fontSize).toBe(60);
    expect(t.padding).toBe(254);
  });

  it('fills the Bible and sermon templates', () => {
    const { refs } = parseRefs('요한복음 3:16-17');
    const chunk = { ref: refs[0], label: '요한복음 3:16-17', nameKo: '요한복음', nameEn: 'John', chapter: 3, verses: '16-17', lines: ['16 하나님이', '17 하나님이'], lines2: [], texts: ['하나님이 세상을', '하나님이 그 아들을'], texts2: [] };
    const slides = scriptureSlides(TPL, { refs, chunks: [chunk] });
    expect(slides).toHaveLength(2);
    expect(els(slides[0])[0]).toBe('요한복음 3:16-17\nJohn 3:16-17');
    expect(els(slides[1])).toEqual(['요한복음 3:16-17\nJohn 3:16-17', '요한복음 3장 16-17절\n하나님이 세상을 하나님이 그 아들을']);
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

describe('공동체 고백송 and template deck sync', async () => {
  const { applyConfessionSong, findConfessionBlock, findConfessionSong, songSections } = await import('../src/domain/templates/confession');
  const { templateDeckUpdates } = await import('../src/domain/templates/register');
  const bg = (id: string) => ({ kind: 'media', mediaId: `tpl-abc-${id}`, mediaType: 'image', fit: 'cover' }) as const;
  const back: Slide[] = [
    { ...slide('Back', [text('m', '공동체 고백송\n“Celebrate the Light”')]), background: bg('0') },
    { ...slide('Back', [text('hid', '우리 모일 때', 7, { w: 380, h: 58 }), text('ly', '줄 1\n줄 2\n줄 3\n줄 4', 324, { w: 1411, h: 485 }), text('ct', 'Celebrate the Light', 31, { w: 562, h: 58 })]), background: bg('1') },
    { ...slide('Back', [text('ly2', '줄 5\n줄 6', 324, { w: 1411, h: 485 }), text('ct2', 'Celebrate the Light', 31, { w: 562, h: 58 })]), background: bg('2') },
    { ...slide('Back', [text('hl', 'Happy Lord’s Day')]), background: bg('3') },
  ];
  const song: Presentation = {
    id: 'online:x', title: '우리는 주의 움직이는 교회', themeId: 't', online: true,
    slides: [{ id: 'a', group: 'Verse 1', text: 'A1\nA2' }, { id: 'b', group: 'Verse 1', text: 'A3\nA4\nA5' }, { id: 'c', group: 'Chorus', text: 'C1\nC2' }],
  };

  it('finds the block by its marker and the song name', () => {
    expect(findConfessionBlock(back)).toEqual({ marker: 0, lyrics: [1, 2], title: 'Celebrate the Light' });
  });

  it('replaces the song name and lyrics, keeping the design and the rest of the deck', () => {
    const out = applyConfessionSong(back, song)!;
    const texts = (s: Slide) => s.elements!.map((e) => e.text);
    expect(texts(out[0])).toEqual(['공동체 고백송\n“우리는 주의 움직이는 교회”']);
    // Verse 1 (5 lines, max 4 per slide) → 3 + 2, then Chorus
    expect(out.slice(1, -1).map((s) => texts(s))).toEqual([
      ['우리 모일 때', 'A1\nA2\nA3', '우리는 주의 움직이는 교회'],
      ['우리 모일 때', 'A4\nA5', '우리는 주의 움직이는 교회'],
      ['우리 모일 때', 'C1\nC2', '우리는 주의 움직이는 교회'],
    ]);
    expect(out[1].background).toEqual(back[1].background);
    expect(texts(out.at(-1)!)).toEqual(['Happy Lord’s Day']);
    expect(applyConfessionSong(out, song)).toBe(out);
  });

  it('prints every part of the song, whatever 진행 a service copy of it plays', () => {
    // A copy placed in a past service by a 콘티 plays only “Verse 1”, and sits before the online song.
    const copy: Presentation = {
      ...song, id: 'p_copy', online: undefined, folder: '1018 주일예배',
      slides: [{ id: 't', group: 'Title', text: '우리는 주의 움직이는 교회' }, ...song.slides],
      arrangements: [{ id: 'all', name: 'all', groups: ['Title', 'Verse 1', 'Chorus'] }, { id: 'v1', name: 'V1', groups: ['Title', 'Verse 1'] }],
      arrangementId: 'v1',
    };
    expect(songSections(copy)).toEqual([['A1', 'A2', 'A3', 'A4', 'A5'], ['C1', 'C2']]);
    expect(findConfessionSong([copy, song], song.title)).toBe(song);
    const lib = createSeedLibrary();
    lib.presentations.push(copy, song);
    const tpl = { ...TPL, back, keys: { front: 'f1', back: 'b1', song: 's1' } };
    const backPatch = templateDeckUpdates(lib, tpl).find((u) => u.id === lib.sunday.backId)!.patch;
    const lyrics = backPatch.slides!.slice(1, -1).map((s) => s.elements!.find((e) => e.w === 1411)!.text);
    expect(lyrics).toEqual(['A1\nA2\nA3', 'A4\nA5', 'C1\nC2']);
  });

  it('rewrites a block that already names the song but holds only part of it', () => {
    const partial = applyConfessionSong(back, { ...song, slides: song.slides.slice(0, 1) })!;
    expect(partial).toHaveLength(3);
    const out = applyConfessionSong(partial, song)!;
    expect(out.slice(1, -1).map((s) => s.elements![1].text)).toEqual(['A1\nA2\nA3', 'A4\nA5', 'C1\nC2']);
  });

  it('keeps lyrics and corner title apart when the first line is the song’s name', () => {
    const named: Presentation = { ...song, slides: [{ id: 'a', group: 'Verse 1', text: '우리는 주의 움직이는 교회\nA2' }, { id: 'c', group: 'Chorus', text: 'C1\nC2' }] };
    const once = applyConfessionSong(back, named)!;
    const again = applyConfessionSong(once, named, 1)!;
    expect(again.slice(1, -1).map((s) => s.elements!.map((e) => e.text))).toEqual([
      ['우리 모일 때', '우리는 주의 움직이는 교회', '우리는 주의 움직이는 교회'],
      ['우리 모일 때', 'A2', '우리는 주의 움직이는 교회'],
      ['우리 모일 때', 'C1', '우리는 주의 움직이는 교회'],
      ['우리 모일 때', 'C2', '우리는 주의 움직이는 교회'],
    ]);
  });

  it('splits parts at the given lines per slide', () => {
    const out = applyConfessionSong(back, song, 2)!;
    expect(out.slice(1, -1).map((s) => s.elements![1].text)).toEqual(['A1\nA2', 'A3\nA4', 'A5', 'C1\nC2']);
  });

  it('brings the library Front/Back decks in line with the templates and the 고백송', () => {
    const lib = createSeedLibrary();
    lib.presentations.push(song);
    const tpl = { ...TPL, back, keys: { front: 'f1', back: 'b1', song: 's1' } };
    const updates = templateDeckUpdates(lib, tpl);
    expect(updates.map((u) => u.id)).toEqual([lib.sunday.frontId, lib.sunday.backId]);
    const backPatch = updates[1].patch;
    expect(backPatch.slides![0].elements![0].text).toContain('우리는 주의 움직이는 교회');
    // Applied once, nothing more to do — until the template changes.
    const synced = { ...lib, presentations: lib.presentations.map((p) => updates.find((u) => u.id === p.id) ? { ...p, ...updates.find((u) => u.id === p.id)!.patch } : p) };
    expect(templateDeckUpdates(synced, tpl)).toEqual([]);
    expect(templateDeckUpdates(synced, { ...tpl, keys: { front: 'f2', back: 'b1', song: 's1' } }).map((u) => u.id)).toEqual([lib.sunday.frontId]);
    // A deck the church edited by hand (not on template backgrounds) is left alone.
    const custom = { ...synced, presentations: synced.presentations.map((p) => (p.id === lib.sunday.backId ? { ...p, templateKey: undefined, slides: [{ id: 'mine', group: 'Back', text: '축도' }] } : p)) };
    expect(templateDeckUpdates(custom, { ...tpl, keys: { front: 'f1', back: 'b2', song: 's1' } })).toEqual([]);
  });
});

describe('4:3 Front deck with this Sunday’s date and 기도제목', async () => {
  const { templateDeckUpdates } = await import('../src/domain/templates/register');
  const { toFourThree, normalizeLibrary } = await import('../src/domain/persistence');
  const frontTpl = { ...TPL, front: [TPL.front[0], slide('Front', [text('d', '빛주사랑\n대학청년부\nmm/dd/202y', 800)]), TPL.front[2]], keys: { front: 'f1', song: 's1' } };

  it('fills a date placeholder like mm/dd/202y', () => {
    const out = fillFront(frontTpl, new Date(2026, 9, 25), []);
    expect(out[1].elements![0].text).toBe('빛주사랑\n대학청년부\n10/25/2026');
  });

  it('keeps the library Front deck on the coming Sunday with the saved 기도제목', () => {
    const lib = createSeedLibrary();
    lib.sunday.prayerText = '1. 예배\n- 은혜\n2. 선교';
    const [front] = templateDeckUpdates(lib, frontTpl, new Date(2026, 9, 21)); // a Wednesday
    expect(front.id).toBe(lib.sunday.frontId);
    const slides = front.patch.slides!;
    expect(slides[0].elements![1].text).toBe('1. 예배\n● 은혜\n2. 선교');
    expect(slides[1].elements![0].text).toContain('10/25/2026');
    const synced = { ...lib, presentations: lib.presentations.map((p) => (p.id === front.id ? { ...p, ...front.patch } : p)) };
    expect(templateDeckUpdates(synced, frontTpl, new Date(2026, 9, 22))).toEqual([]); // same week
    const nextWeek = templateDeckUpdates(synced, frontTpl, new Date(2026, 9, 26));
    expect(nextWeek[0].patch.slides![1].elements![0].text).toContain('11/01/2026');
    const newTopics = templateDeckUpdates({ ...synced, sunday: { ...synced.sunday, prayerText: '감사' } }, frontTpl, new Date(2026, 9, 22));
    expect(newTopics[0].patch.slides![0].elements![1].text).toBe('● 감사');
  });

  it('moves 16:9 objects onto the 4:3 canvas once, keeping them centred', () => {
    const p: Presentation = { id: 'p', title: 't', themeId: 't', slides: [{ id: 's', group: 'g', text: '', elements: [text('a', 'A', 100, { x: 660, w: 600 }), text('b', 'B', 100, { x: 1800, w: 100 })] }] };
    const [moved] = toFourThree([p]);
    expect(moved.slides[0].elements!.map((e) => e.x)).toEqual([420, 1400]);
    const lib = normalizeLibrary({ ...createSeedLibrary(), aspect: undefined, presentations: [p] })!;
    expect(lib.aspect).toBe('4:3');
    expect(lib.presentations[0].slides[0].elements![0].x).toBe(420);
    expect(normalizeLibrary(lib)!.presentations[0].slides[0].elements![0].x).toBe(420); // not moved twice
  });
});

describe('editable slides that keep their edits', async () => {
  const { templateDeckUpdates } = await import('../src/domain/templates/register');
  const { refreshFront } = await import('../src/domain/templates/fill');
  const img = (id: string, x: number, y: number): SlideElement => ({ id, kind: 'image', x, y, w: 200, h: 100, mediaId: `m-${id}`, fit: 'fill' });

  it('turns pictures and filled boxes into their own objects, in order', () => {
    const rs: RenderedSlide = {
      index: 0, widthEmu: 9144000, heightEmu: 6858000, shapes: [
        { kind: 'picture', xEmu: 0, yEmu: 0, wEmu: 1000000, hEmu: 500000, imageUrl: 'blob:logo' },
        { kind: 'text', xEmu: 0, yEmu: 1000000, wEmu: 2000000, hEmu: 500000, fill: '#eeeeee', paragraphs: [{ runs: [{ text: '광고' }] }] },
      ],
    };
    const s = slideFromRendered(rs, 'bg', 'x', new Map([['blob:logo|', 'logo-media']]));
    expect(s.elements!.map((e) => e.kind)).toEqual(['image', 'shape', 'text']);
    expect(s.elements![0]).toMatchObject({ mediaId: 'logo-media', fit: 'fill', x: 0, w: 157 });
    expect(s.elements![1]).toMatchObject({ fill: '#eeeeee' });
  });

  const prayerSlide = slide('Front', [img('logo', 1200, 20), text('t1', '지금은 기도로 예배를 준비하는 시간입니다.'), text('t2', '기도제목 1\n기도제목 2', 300)]);
  const welcome = slide('Front', [img('w', 0, 300), text('d', '빛주사랑\n대학청년부\nmm/dd/202y', 800)]);
  const tpl = { ...TPL, front: [prayerSlide, welcome], keys: { front: 'f1', song: 's1' } };

  it('leaves the corner logo off the 기도 준비 slide only', () => {
    const out = fillFront(tpl, new Date(2026, 9, 25), []);
    expect(out[0].elements!.some((e) => e.kind === 'image')).toBe(false);
    expect(out[0].elements!.find((e) => e.role === 'prayer')!.text).toBe('기도제목 1\n기도제목 2');
    expect(out[1].elements!.some((e) => e.kind === 'image')).toBe(true);
  });

  it('refreshes the date and 기도제목 without losing edits', () => {
    const first = fillFront(tpl, new Date(2026, 9, 25), [{ title: '예배', points: [] }]);
    // The operator moves the title and adds a note on the welcome slide.
    const edited = first.map((s, i) => (i === 0
      ? { ...s, elements: s.elements!.map((e) => (e.text?.startsWith('지금은') ? { ...e, y: 40 } : e)) }
      : { ...s, elements: [...s.elements!, text('note', '환영합니다!', 100)] }));
    const next = refreshFront(edited, tpl, new Date(2026, 10, 1), [{ title: '선교', points: [] }, { title: '감사', points: [] }]);
    expect(next).toHaveLength(2);
    expect(next[0].elements!.find((e) => e.text?.startsWith('지금은'))!.y).toBe(40);
    expect(next[0].elements!.find((e) => e.role === 'prayer')!.text).toBe('● 선교\n● 감사');
    expect(next[1].elements!.map((e) => e.text).filter(Boolean)).toEqual(['빛주사랑\n대학청년부\n11/01/2026', '환영합니다!']);
  });

  it('keeps edits when the library decks refresh for a new week or 고백송', () => {
    const lib = createSeedLibrary();
    const [front] = templateDeckUpdates(lib, tpl, new Date(2026, 9, 21));
    const editedSlides = front.patch.slides!.map((s, i) => (i === 1 ? { ...s, elements: [...s.elements!, text('mine', '내 메모', 50)] } : s));
    const synced = { ...lib, presentations: lib.presentations.map((p) => (p.id === front.id ? { ...p, ...front.patch, slides: editedSlides } : p)) };
    const [week2] = templateDeckUpdates(synced, tpl, new Date(2026, 9, 28));
    expect(week2.patch.slides![1].elements!.some((e) => e.text === '내 메모')).toBe(true);
    expect(week2.patch.slides![1].elements!.find((e) => e.text?.includes('대학청년부'))!.text).toContain('11/01/2026');
    // A new church file rebuilds from the template.
    const [newFile] = templateDeckUpdates(synced, { ...tpl, keys: { front: 'f2', song: 's1' } }, new Date(2026, 9, 21));
    expect(newFile.patch.slides![1].elements!.some((e) => e.text === '내 메모')).toBe(false);
  });
});

describe('church PPT style defaults', async () => {
  const { normalizeLibrary } = await import('../src/domain/persistence');
  it('switches an older library to one verse per slide once, then leaves the setting alone', () => {
    const old = { ...createSeedLibrary(), sunday: { ...createSeedLibrary().sunday, versesPerSlide: 2, styleVersion: undefined } };
    const lib = normalizeLibrary(old)!;
    expect(lib.sunday.versesPerSlide).toBe(1);
    expect(lib.sunday.linesPerSlide).toBe(4);
    expect(lib.sunday.styleVersion).toBe(2);
    const chosen = normalizeLibrary({ ...lib, sunday: { ...lib.sunday, versesPerSlide: 3 } })!;
    expect(chosen.sunday.versesPerSlide).toBe(3);
  });
});

describe('every song in the church template design', async () => {
  const { restyleSong, isSong, songStyleUpdates } = await import('../src/domain/templates/fill');
  const { splitEvenly } = await import('../src/domain/sunday/songs');
  const lines = (n: number, p = 'L') => Array.from({ length: n }, (_, i) => `${p}${i + 1}`);

  it('splits a part evenly into slides of at most 4 lines', () => {
    expect(splitEvenly(lines(4), 4).map((c) => c.length)).toEqual([4]);
    expect(splitEvenly(lines(6), 4).map((c) => c.length)).toEqual([3, 3]);
    expect(splitEvenly(lines(9), 4).map((c) => c.length)).toEqual([3, 3, 3]);
    expect(splitEvenly(lines(5), 4).map((c) => c.length)).toEqual([3, 2]);
    expect(splitEvenly([], 4)).toEqual([]);
  });

  const song: Presentation = {
    id: 'p_song', title: '좋으신 하나님', themeId: 'theme_sunday', folder: 'Songs',
    slides: [
      { id: 'a', group: 'Verse 1', text: 'v1\nv2', style: { fontSize: 120 } },
      { id: 'b', group: 'Verse 1', text: 'v3\nv4' },
      { id: 'c', group: 'Verse 1', text: 'v5\nv6' },
      { id: 'd', group: 'Chorus', text: 'c1\nc2' },
      { id: 'e', group: 'Bridge', text: '한국어', subtext: 'English' },
    ],
    arrangements: [{ id: 'ar', name: 'A', groups: ['Verse 1', 'Chorus', 'Verse 1'] }],
  };

  it('makes a title slide, then each part in slides of up to 4 lines, in the template design', () => {
    const out = restyleSong(song, TPL, 4);
    expect(out.id).toBe('p_song');
    expect(out.folder).toBe('Songs');
    expect(out.themeId).toBe(TEMPLATE_LYRICS_THEME);
    expect(out.background).toEqual(TPL.songLyrics.background);
    expect(out.slides.map((s) => [s.group, s.text])).toEqual([
      ['Title', ''], ['Verse 1', 'v1\nv2\nv3'], ['Verse 1', 'v4\nv5\nv6'], ['Chorus', 'c1\nc2'], ['Bridge', '한국어'],
    ]);
    expect(out.slides[0].elements![0].text).toBe('좋으신 하나님');
    expect(out.slides[1].style).toBeUndefined(); // per-slide overrides cleared
    expect(out.slides[1].elements!.map((e) => e.text)).toEqual(['좋으신 하나님']); // corner title (no lyrics box)
    expect(out.slides[4].subtext).toBe('English');
    expect(out.arrangements![0].groups).toEqual(['Title', 'Verse 1', 'Chorus', 'Verse 1']);
    // Restyling a restyled song gives the same slides (no doubled corner titles).
    const again = restyleSong(out, TPL, 4);
    expect(again.slides.map((s) => [s.group, s.text, s.elements?.length])).toEqual(out.slides.map((s) => [s.group, s.text, s.elements?.length]));
  });

  it('knows songs from other decks and restyles each song once', () => {
    expect(isSong(song)).toBe(true);
    expect(isSong({ ...song, folder: 'Imported', themeId: 'theme_classic' })).toBe(false);
    expect(isSong({ id: 'w', title: 'Welcome', themeId: 't', folder: 'Songs', slides: [{ id: 's', group: 'Slide', text: 'Welcome!' }] })).toBe(false);
    expect(isSong({ id: 'r', title: '수련회', themeId: 't', online: true, slides: [{ id: 's', group: 'Slide 1', text: '가사' }] })).toBe(false);
    const first = songStyleUpdates([song], TPL, 4);
    expect(first).toHaveLength(1);
    expect(songStyleUpdates(first, TPL, 4)).toEqual([]);
    expect(songStyleUpdates(first, TPL, 2)).toHaveLength(1); // a new lines-per-slide setting restyles again
  });
});
