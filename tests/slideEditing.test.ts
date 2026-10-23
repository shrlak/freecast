import { describe, expect, it } from 'vitest';
import { deleteSlides, deleteSlidesAt, editSlide, editSlideAt, songSourceFromSlides } from '../src/domain/slideEditing';
import { sequence } from '../src/domain/arrangement';
import { songToPresentation } from '../src/domain/sunday/songs';
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
  it('deletes just one page of a multi-page verse, preserving other pages and unused parts', () => {
    const before = song();
    const after = deleteSlides(before, ['v1a'], 3000);
    expect(after.slides.map((s) => s.id)).toEqual(['title', 'v1b', 'c']);
    expect(after.slides[1]).toBe(before.slides[2]);
    expect(after.slides[2]).toBe(before.slides[3]);
    expect(after.songSource?.sections).toEqual([
      { label: 'V1', lines: ['두 번째 장'] }, { label: 'C', lines: ['후렴'] }, { label: 'V2', lines: ['아직 사용하지 않는 2절'] },
    ]);
    expect(after.arrangements).toEqual(before.arrangements);
    expect(after).toMatchObject({ folder: 'Songs', updatedAt: 3000, slidesEdited: true });
    expect(after.online).toBeUndefined();
    expect(deleteSlides(before, ['missing'], 3000)).toBe(before);
  });

  it('does not resurrect a removed final page from original lyrics or repeated arrangements', () => {
    const after = deleteSlides(song(), ['v1a', 'v1b'], 3000);
    expect(after.songSource?.sections.map((s) => s.label)).toEqual(['C', 'V2']);
    expect(after.songSource?.order).toEqual(['C']);
    expect(after.arrangements?.[0].groups).toEqual(['Title', 'Chorus']);
    const source = songSourceFromSlides(after);
    const rebuilt = songToPresentation({ title: after.title, sections: source.sections, progression: source.order }, { themeId: 'theme_classic', linesPerSlide: 4 });
    expect(rebuilt.slides.some((s) => s.text.includes('첫 번째') || s.text.includes('두 번째'))).toBe(false);
    expect(sequence(after).map((x) => x.slide.id)).toEqual(['title', 'c']);
  });

  it('retains the second verse number when the first of repeated source labels is removed', () => {
    const p = song();
    p.songSource = { sections: [{ label: 'V', lines: ['1절'] }, { label: 'V', lines: ['2절'] }], order: ['V1', 'V2'] };
    p.slides = [{ id: 'one', group: 'Verse 1', text: '1절' }, { id: 'two', group: 'Verse 2', text: '2절' }];
    const after = deleteSlides(p, ['one'], 3000);
    expect(after.songSource).toEqual({ sections: [{ label: 'V2', lines: ['2절'] }], order: ['V2'] });
    expect(editSlide(after, 'two', { text: '수정된 2절' }, 4000).songSource?.sections).toEqual([{ label: 'V2', lines: ['수정된 2절'] }]);
  });

  it('keeps the same repeated live occurrence through deletion, undo and redo', () => {
    const lib = createSeedLibrary(); lib.presentations = [song()];
    let state = reducer(createInitialState(lib), { type: 'live/go', presentationId: 'online:song', seq: 5 });
    expect(state.live.slide?.id).toBe('v1b');
    state = reducer(state, { type: 'live/black', on: true });
    state = reducer(state, { type: 'slide/delete', presentationId: 'online:song', slideIds: ['v1a'] });
    expect(state.cursor?.seq).toBe(3);
    expect(state.live.slide?.id).toBe('v1b'); expect(state.live.black).toBe(true);
    state = reducer(state, { type: 'undo' });
    expect(state.cursor?.seq).toBe(5); expect(state.live.slide?.id).toBe('v1b');
    state = reducer(state, { type: 'redo' });
    expect(state.cursor?.seq).toBe(3); expect(state.live.slide?.id).toBe('v1b');
  });

  it('advances to an adjacent page when deleting the live page and clears an empty deck', () => {
    const lib = createSeedLibrary(); lib.presentations = [song()];
    let state = reducer(createInitialState(lib), { type: 'live/go', presentationId: 'online:song', seq: 2 });
    state = reducer(state, { type: 'slide/delete', presentationId: 'online:song', slideIds: ['v1b'] });
    expect(state.live.slide?.id).toBe('c');
    state = reducer(state, { type: 'slide/delete', presentationId: 'online:song', slideIds: ['title', 'v1a', 'c'] });
    expect(state.cursor).toBeNull(); expect(state.live.slide).toBeNull(); expect(state.live.background).toBeNull();
    state = reducer(state, { type: 'undo' });
    expect(state.library.presentations[0].slides.map((s) => s.id)).toEqual(['title', 'v1a', 'c']);
  });

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


describe('independent repeated occurrences', () => {
  const words = (p: Presentation) => sequence(p).map((x) => x.slide.text);
  it('ignores a delayed editor save after its row was deleted or moved', () => {
    const lib = createSeedLibrary(); lib.presentations = [song()];
    let state = reducer(createInitialState(lib), { type: 'slide/delete', presentationId: 'online:song', slideIds: ['v1a'], seqs: [4] });
    const before = state;
    state = reducer(state, { type: 'slide/update', presentationId: 'online:song', slideId: 'v1a', seq: 4, sequenceLength: 6, patch: { text: '늦게 도착한 입력' } });
    expect(state).toBe(before);
    state = reducer(state, { type: 'slide/update', presentationId: 'online:song', slideId: 'c', seq: 4, patch: { text: '잘못된 위치' } });
    expect(state).toBe(before);
    expect(words(state.library.presentations[0])).toEqual(['', '첫 번째 장', '두 번째 장', '후렴', '두 번째 장']);
  });
  it('deletes a page from the second verse occurrence without deleting the first or its neighbor', () => {
    const p = song();
    const after = deleteSlidesAt(p, [4], 3000);
    expect(words(after)).toEqual(['', '첫 번째 장', '두 번째 장', '후렴', '두 번째 장']);
    expect(after.id).toBe(p.id); expect(after.title).toBe(p.title);
    expect(after.slides.find((s) => s.id === 'v1a')).toBe(p.slides[1]);
    const source = songSourceFromSlides(after);
    const rebuilt = songToPresentation({ title: p.title, sections: source.sections, progression: source.order }, { themeId: p.themeId, linesPerSlide: 4 });
    expect(words(rebuilt)).toEqual(words(after).slice(1));
  });
  it('can delete either identical one-page chorus occurrence and keeps the song and library intact', () => {
    for (const seq of [1, 2]) {
      const p = song(); p.arrangements![0].groups = ['Title', 'Chorus', 'Chorus'];
      const lib = createSeedLibrary(); lib.presentations = [p];
      lib.playlists = [{ id: 'test', name: '진행', items: [{ id: 'item', presentationId: p.id }] }];
      const state = reducer(createInitialState(lib), { type: 'slide/delete', presentationId: p.id, slideIds: ['c'], seqs: [seq] });
      expect(state.library.presentations).toHaveLength(1);
      expect(words(state.library.presentations[0])).toEqual(['', '후렴']);
      expect(state.library.playlists[0].items).toEqual(lib.playlists[0].items);
      expect(state.library.media).toBe(lib.media);
    }
  });
  it('edits only the selected repeat and preserves unused source sections and other arrangements', () => {
    const p = song(); p.arrangements!.push({ id: 'other', name: '다른 진행', groups: ['Verse 1', 'Chorus'] });
    const after = editSlideAt(p, 4, { text: '반복된 1절 한 장만 수정' }, 3000);
    expect(words(after)).toEqual(['', '첫 번째 장', '두 번째 장', '후렴', '반복된 1절 한 장만 수정', '두 번째 장']);
    expect(words({ ...after, arrangementId: 'other' })).toEqual(['첫 번째 장', '두 번째 장', '후렴']);
    expect(after.songSource?.sections.find((s) => s.label === 'V2')?.lines).toEqual(['아직 사용하지 않는 2절']);
    expect(after.slides.find((s) => s.id === 'v1b')?.notes).toBe('둘째 노트');
  });
  it('deletes exactly the selected repeated rows in one multi-selection', () => {
    const p = song();
    expect(words(deleteSlidesAt(p, [1, 4, 4], 3000))).toEqual(['', '두 번째 장', '후렴', '두 번째 장']);
    expect(deleteSlidesAt(p, [-1, 999, 1.5], 3000)).toBe(p);
    const after = deleteSlidesAt(p, [0, 1, 2, 3, 4, 5], 3000);
    expect(sequence(after)).toEqual([]);
    expect(after.id).toBe(p.id);
  });
  it('keeps the edited live repeat selected through undo and redo', () => {
    const lib = createSeedLibrary(); lib.presentations = [song()];
    let state = reducer(createInitialState(lib), { type: 'live/go', presentationId: 'online:song', seq: 4 });
    state = reducer(state, { type: 'slide/update', presentationId: 'online:song', slideId: 'v1a', seq: 4, patch: { text: '두 번째 반복만 수정' } });
    expect(state.cursor?.seq).toBe(4); expect(state.live.slide?.text).toBe('두 번째 반복만 수정');
    state = reducer(state, { type: 'undo' });
    expect(state.cursor?.seq).toBe(4); expect(state.live.slide?.text).toBe('첫 번째 장');
    state = reducer(state, { type: 'redo' });
    expect(state.cursor?.seq).toBe(4); expect(state.live.slide?.text).toBe('두 번째 반복만 수정');
  });
  it('restores the exact live repeat when undoing deletion of an earlier identical occurrence', () => {
    const lib = createSeedLibrary(); const p = song();
    p.arrangements![0].groups = ['Title', 'Chorus', 'Chorus']; lib.presentations = [p];
    let state = reducer(createInitialState(lib), { type: 'live/go', presentationId: p.id, seq: 2 });
    state = reducer(state, { type: 'slide/delete', presentationId: p.id, slideIds: ['c'], seqs: [1] });
    expect(state.cursor?.seq).toBe(1); expect(state.live.slide?.text).toBe('후렴');
    state = reducer(state, { type: 'undo' });
    expect(state.cursor?.seq).toBe(2); expect(state.live.slide?.text).toBe('후렴');
    state = reducer(state, { type: 'redo' });
    expect(state.cursor?.seq).toBe(1); expect(state.live.slide?.text).toBe('후렴');
  });
  it('does not pull the operator back to the edited repeat after they navigate elsewhere', () => {
    const lib = createSeedLibrary(); lib.presentations = [song()];
    let state = reducer(createInitialState(lib), { type: 'live/go', presentationId: 'online:song', seq: 4 });
    state = reducer(state, { type: 'slide/update', presentationId: 'online:song', slideId: 'v1a', seq: 4, patch: { text: '반복 수정' } });
    state = reducer(state, { type: 'live/go', presentationId: 'online:song', seq: 3 });
    state = reducer(state, { type: 'undo' });
    expect(state.cursor?.seq).toBe(3); expect(state.live.slide?.text).toBe('후렴');
  });
  it('retains edits and deletions after serialization and an online song refresh', () => {
    let p = editSlideAt(song(), 4, { text: '두 번째 반복 저장' }, 3000);
    p = deleteSlidesAt(p, [2], 4000);
    const lib = createSeedLibrary(); lib.presentations = [p];
    const stored = normalizeLibrary(JSON.parse(JSON.stringify(lib)))!;
    const state = reducer(createInitialState(stored), { type: 'online/songs', presentations: [song()] });
    expect(words(state.library.presentations[0])).toEqual(words(p));
    expect(words(p)).toEqual(['', '첫 번째 장', '후렴', '두 번째 반복 저장', '두 번째 장']);
  });
});
