import { describe, expect, it } from 'vitest';
import { createSeedLibrary } from '../src/domain/defaults';
import { createInitialState, reducer } from '../src/domain/reducer';
import { sequence } from '../src/domain/arrangement';
import { normalizeLibrary } from '../src/domain/persistence';
import { mergeLibrary } from '../src/domain/cloudMerge';
import { TRASH_DAYS } from '../src/domain/trash';
import type { Library, Presentation } from '../src/domain/types';

const now = 1000000;
function fixture(repeat = false): Library {
  const p: Presentation = { id: 'song', title: '복원 찬양', themeId: 'theme_classic', folder: 'Songs', slidesEdited: true, lyricsCentered: true,
    slides: ['제목', '첫 장', '둘째 장', '후렴'].map((text, i) => ({ id: 's' + i, group: ['Title', 'Verse 1', 'Verse 1', 'Chorus'][i], text, notes: '노트 ' + i })),
    arrangements: [{ id: 'arr', name: '진행', groups: ['Title', 'Verse 1', 'Chorus', ...(repeat ? ['Verse 1'] : [])] }], arrangementId: 'arr' };
  return { ...createSeedLibrary(), presentations: [p], playlists: [{ id: 'pl', name: '찬양', items: [{ id: 'a', presentationId: p.id }, { id: 'b', kind: 'header', title: '반복' }, { id: 'c', presentationId: p.id }] }] };
}
const pages = (lib: Library) => sequence(lib.presentations.find((p) => p.id === 'song')!).map((x) => x.slide.text);
const remove = (lib: Library, seqs: number[]) => reducer(createInitialState(lib), { type: 'slide/delete', presentationId: 'song', slideIds: [], seqs, occurredAt: now });

describe('recoverable slide and song deletion', () => {
  it('restores just the deleted repeated occurrence, preserving later edits and live position', () => {
    let s = remove(fixture(true), [4]);
    expect(pages(s.library)).toEqual(['제목', '첫 장', '둘째 장', '후렴', '둘째 장']);
    s = reducer(s, { type: 'slide/update', presentationId: 'song', slideId: 's1', seq: 1, patch: { text: '최근 편집' }, occurredAt: now + 1 });
    s = reducer(s, { type: 'live/go', presentationId: 'song', seq: 4 });
    s = reducer(s, { type: 'trash/restore', id: s.library.trash![0].id, occurredAt: now + 2 });
    expect(pages(s.library)).toEqual(['제목', '최근 편집', '둘째 장', '후렴', '첫 장', '둘째 장']);
    expect(s.live.slide?.text).toBe('둘째 장');
    expect(s.cursor?.seq).toBe(5);
    expect(s.library.trash).toEqual([]);
  });
  it.each([[1, 2], [0, 1, 2, 3], [2, 3], [0, 3]])('restores multiple pages in original order: %j', (...seqs) => {
    const lib = fixture();
    let s = remove(lib, seqs);
    s = reducer(s, { type: 'trash/restore', id: s.library.trash![0].id, occurredAt: now + 1 });
    expect(pages(s.library)).toEqual(pages(lib));
  });
  it.each([false, true])('restores individual pages independently in either order (%s)', (backwards) => {
    let s = remove(fixture(), [1, 2, 3]);
    const id = s.library.trash![0].id;
    for (const seq of backwards ? [3, 2, 1] : [1, 2, 3]) s = reducer(s, { type: 'trash/restore', id, seq, occurredAt: now + 1 });
    expect(pages(s.library)).toEqual(pages(fixture()));
    expect(s.library.trash).toEqual([]);
  });
  it.each([[1, 4], [2, 5], [1, 2, 4, 5], [0, 2, 3, 5]])('restores selected repeated pages without changing any other occurrence: %j', (...seqs) => {
    const lib = fixture(true);
    let s = remove(lib, seqs);
    s = reducer(s, { type: 'trash/restore', id: s.library.trash![0].id, occurredAt: now + 1 });
    expect(pages(s.library)).toEqual(pages(lib));
  });
  it('restoring one page of a missing song does not resurrect all other slides', () => {
    let s = remove(fixture(), [1]);
    const id = s.library.trash![0].id;
    s = reducer(s, { type: 'presentation/delete', id: 'song', occurredAt: now + 1 });
    s = reducer(s, { type: 'trash/restore', id, occurredAt: now + 2 });
    expect(pages(s.library)).toEqual(['첫 장']);
    expect(s.library.trash).toHaveLength(1);
  });
  it('restores a song and all repeated placements without overwriting existing items', () => {
    const lib = fixture();
    let s = reducer(createInitialState(lib), { type: 'presentation/delete', id: 'song', occurredAt: now });
    expect(s.library.trash![0].expiresAt - now).toBe(TRASH_DAYS * 86400000);
    s = reducer(s, { type: 'trash/restore', id: s.library.trash![0].id, occurredAt: now + 1 });
    expect(s.library.presentations[0].slides).toEqual(lib.presentations[0].slides);
    expect(s.library.playlists[0].items.map((i) => i.kind === 'header' ? i.title : i.presentationId)).toEqual(['song', '반복', 'song']);
  });
  it('keeps a newer deck with the same ID and restores the deleted version as a separate copy', () => {
    let s = reducer(createInitialState(fixture()), { type: 'presentation/delete', id: 'song', occurredAt: now });
    s = reducer(s, { type: 'presentation/create', presentation: { ...fixture().presentations[0], slides: [{ id: 'new', group: 'Verse 1', text: '새 내용' }] } });
    s = reducer(s, { type: 'trash/restore', id: s.library.trash![0].id, occurredAt: now + 1 });
    expect(s.library.presentations).toHaveLength(2);
    expect(pages(s.library)).toEqual(['새 내용']);
    expect(s.library.presentations[1].title).toBe('복원 찬양 복원본');
  });
  it('keeps same-titled songs safe from deduplication after restoring another copy', () => {
    let s = reducer(createInitialState(fixture()), { type: 'presentation/delete', id: 'song', occurredAt: now });
    s = reducer(s, { type: 'presentation/create', presentation: { ...fixture().presentations[0], id: 'other' } });
    s = reducer(s, { type: 'trash/restore', id: s.library.trash![0].id, occurredAt: now + 1 });
    s = reducer(s, { type: 'songs/dedupe' });
    expect(s.library.presentations.map((p) => p.title)).toEqual(['복원 찬양', '복원 찬양 복원본']);
  });
  it('does not immediately auto-delete a restored service deck', () => {
    const lib = fixture(); lib.presentations[0].folder = '1025 주일예배';
    let s = reducer(createInitialState(lib), { type: 'presentation/delete', id: 'song', occurredAt: now });
    s = reducer(s, { type: 'trash/restore', id: s.library.trash![0].id, occurredAt: now + 1 });
    expect(s.library.presentations[0].folder).toBe('복원한 자료');
  });
  it('keeps deleted online songs in trash across refresh and restores an editable local copy', () => {
    const lib = fixture(); lib.presentations[0].online = true;
    let s = reducer(createInitialState(lib), { type: 'presentation/delete', id: 'song', occurredAt: now });
    s = reducer(s, { type: 'online/songs', presentations: lib.presentations });
    expect(s.library.presentations).toEqual([]);
    s = reducer(s, { type: 'trash/restore', id: s.library.trash![0].id, occurredAt: now + 1 });
    expect(s.library.presentations[0].online).toBeUndefined();
    expect(s.library.presentations[0].folder).toBe('Songs');
    expect(pages(s.library)).toEqual(pages(lib));
  });
  it('ignores missing pages and does not create a phantom trash entry', () => {
    expect(remove(fixture(), [999, -1]).library.trash ?? []).toEqual([]);
  });
  it('persists through normalization and syncs additions and removals from another device', () => {
    const base = fixture();
    const local = remove(base, [1]).library;
    const normalized = normalizeLibrary(JSON.parse(JSON.stringify(local)))!;
    expect(normalized.trash).toEqual(local.trash);
    const merged = mergeLibrary(base, base, local).library;
    expect(merged.trash).toEqual(local.trash);
    const restored = reducer(createInitialState(local), { type: 'trash/restore', id: local.trash![0].id, occurredAt: now + 1 }).library;
    expect(mergeLibrary(local, local, restored).library.trash).toEqual([]);
    expect(normalizeLibrary({ ...base, trash: [null, {}, { id: 'bad', kind: 'slides', slides: ['bad'] }] })?.trash).toEqual([]);
  });
  it('expires only after 30 days, clears undo history, and never revives deleted files via undo', () => {
    let s = remove(fixture(), [1]);
    const expires = s.library.trash![0].expiresAt;
    expect(reducer(s, { type: 'trash/expire', now: expires - 1 }).library.trash).toHaveLength(1);
    s = reducer(s, { type: 'trash/expire', now: expires });
    expect(s.library.trash).toEqual([]); expect(s.past).toEqual([]);
    expect(reducer(s, { type: 'undo' })).toBe(s);
  });
  it('retains shared media until the last trash reference is purged', () => {
    const lib = fixture();
    lib.media = [{ id: 'asset', type: 'image', name: 'asset' }];
    lib.presentations[0].slides[1].background = { kind: 'media', mediaId: 'asset', mediaType: 'image' };
    lib.presentations.push({ ...lib.presentations[0], id: 'other' });
    let s = createInitialState(lib);
    s = reducer(s, { type: 'presentation/delete', id: 'song', occurredAt: now });
    s = reducer(s, { type: 'presentation/delete', id: 'other', occurredAt: now });
    s = reducer(s, { type: 'trash/purge', ids: [s.library.trash![0].id] });
    expect(s.library.media).toHaveLength(1);
    s = reducer(s, { type: 'trash/purge', ids: [s.library.trash![0].id] });
    expect(s.library.media).toEqual([]);
  });
});
