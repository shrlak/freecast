import { describe, expect, it } from 'vitest';
import { editSlide, songSourceFromSlides } from '../src/domain/slideEditing';
import { createInitialState, reducer } from '../src/domain/reducer';
import { createSeedLibrary } from '../src/domain/defaults';
import { normalizeLibrary } from '../src/domain/persistence';
import type { Presentation } from '../src/domain/types';

const song = (): Presentation => ({
  id: 'online:song', online: true, title: '등록된 찬양', folder: '☁ 찬양 라이브러리', themeId: 'theme_classic',
  lyricsLayout: { linesPerSlide: 4 }, templateKey: 'song:existing',
  songSource: { sections: [{ label: 'V1', lines: ['옛 가사'] }, { label: 'C', lines: ['후렴'] }, { label: 'V2', lines: ['아직 사용하지 않는 2절'] }], order: ['V1', 'C', 'V1'] },
  arrangements: [{ id: 'arr', name: '진행', groups: ['Title', 'Verse 1', 'Chorus', 'Verse 1'] }], arrangementId: 'arr',
  slides: [
    { id: 'title', group: 'Title', text: '', elements: [{ id: 'heading', kind: 'text', x: 10, y: 20, w: 400, h: 80, text: '등록된 찬양' }] },
    { id: 'v1a', group: 'Verse 1', text: '첫 번째 장', notes: '첫 노트', background: { kind: 'color', value: '#123456' } },
    { id: 'v1b', group: 'Verse 1', text: '두 번째 장', style: { fontSize: 100 }, notes: '둘째 노트' },
    { id: 'c', group: 'Chorus', text: '후렴', subtext: 'chorus', qr: ['https://example.org'] },
  ],
});

describe('individual slide editing', () => {
  it('changes one slide while retaining neighbors, IDs, arrangements, background and notes', () => {
    const before = song();
    const after = editSlide(before, 'v1b', { text: '수정한 한 장', style: { fontSize: 110 } }, 1000);
    expect(after.slides.map((s) => s.id)).toEqual(before.slides.map((s) => s.id));
    expect(after.slides[0]).toBe(before.slides[0]);
    expect(after.slides[1]).toBe(before.slides[1]);
    expect(after.slides[3]).toBe(before.slides[3]);
    expect(after.slides[2]).toMatchObject({ text: '수정한 한 장', notes: '둘째 노트', style: { fontSize: 110 } });
    expect(after.arrangements).toBe(before.arrangements);
    expect(after.slidesEdited).toBe(true);
    expect(after.songSource?.sections).toEqual([
      { label: 'V1', lines: ['첫 번째 장', '', '수정한 한 장'] },
      { label: 'C', lines: ['후렴'] },
      { label: 'V2', lines: ['아직 사용하지 않는 2절'] },
    ]);
    expect(after.songSource?.order).toEqual(['V1', 'C', 'V1']);
  });

  it('keeps an edited registered song in the saved song library after serialization and online reload', () => {
    const lib = createSeedLibrary(); lib.presentations = [song()];
    let state = createInitialState(lib);
    state = reducer(state, { type: 'slide/update', presentationId: 'online:song', slideId: 'v1a', patch: { text: '저장할 가사' }, occurredAt: 2000 });
    const stored = normalizeLibrary(JSON.parse(JSON.stringify(state.library)))!;
    expect(stored.presentations[0]).toMatchObject({ id: 'online:song', folder: 'Songs', updatedAt: 2000, slidesEdited: true });
    expect(stored.presentations[0].online).toBeUndefined();
    state = reducer(createInitialState(stored), { type: 'online/songs', presentations: [song()] });
    expect(state.library.presentations.find((p) => p.id === 'online:song')?.slides[1].text).toBe('저장할 가사');
  });

  it('does not replace lyric sources for a formatting-only change or a nonexistent slide', () => {
    const before = song();
    expect(editSlide(before, 'v1a', { background: { kind: 'color', value: '#ffffff' } }, 1000).songSource).toBe(before.songSource);
    expect(editSlide(before, 'missing', { text: '잘못된 변경' }, 1000)).toBe(before);
  });

  it('rebuilds repeated source labels without dropping either verse', () => {
    const p = song();
    p.songSource = { sections: [{ label: 'V', lines: ['1절'] }, { label: 'V', lines: ['2절'] }] };
    p.slides = [{ id: 'one', group: 'Verse 1', text: '수정된 1절' }, { id: 'two', group: 'Verse 2', text: '수정된 2절' }];
    expect(songSourceFromSlides(p).sections).toEqual([{ label: 'V', lines: ['수정된 1절'] }, { label: 'V', lines: ['수정된 2절'] }]);
  });

  it('updates the on-screen slide and undo/redo without changing the neighboring slide', () => {
    const lib = createSeedLibrary(); lib.presentations = [song()];
    let state = reducer(createInitialState(lib), { type: 'live/go', presentationId: 'online:song', seq: 1 });
    state = reducer(state, { type: 'slide/update', presentationId: 'online:song', slideId: 'v1a', patch: { text: '라이브 수정' } });
    expect(state.live.slide?.text).toBe('라이브 수정');
    state = reducer(state, { type: 'undo' });
    expect(state.live.slide?.text).toBe('첫 번째 장');
    state = reducer(state, { type: 'redo' });
    expect(state.live.slide?.text).toBe('라이브 수정');
    expect(state.library.presentations[0].slides[2].text).toBe('두 번째 장');
  });
});
