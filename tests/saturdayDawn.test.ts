import { describe, expect, it } from 'vitest';
import { createSeedLibrary } from '../src/domain/defaults';
import { createInitialState, reducer } from '../src/domain/reducer';
import { isSaturdayDawnName } from '../src/domain/saturdayDawn';
import { mergeLibrary } from '../src/domain/cloudMerge';
import { normalizeLibrary } from '../src/domain/persistence';
import type { Library, Presentation } from '../src/domain/types';

const now = 1792800000000;
function image(id: string, title: string, mediaId = id): Presentation {
  return { id, title, folder: 'Imported', themeId: 'theme_classic', slides: [{ id: `${id}-s`, group: 'Image', text: '',
    background: { kind: 'media', mediaId, mediaType: 'image' } }] };
}
function fixture(): Library {
  const lib = createSeedLibrary();
  lib.presentations = [image('saturday', '1024 토요새벽 예배'), image('ordinary', '일반 이미지'),
    image('protected', '토요새벽 필수', 'essential'), image('song', '토요새벽 찬양', 'song-image')];
  lib.presentations[0].slides.push({ id: 'picture-page', group: 'Image', text: '', elements: [
    { id: 'picture', kind: 'image', mediaId: 'second-image', x: 0, y: 0, w: 1440, h: 1080 },
  ] });
  lib.presentations[2].protected = true;
  lib.presentations[3].folder = 'Songs';
  lib.media = ['saturday', 'second-image', 'ordinary', 'essential', 'song-image'].map((id) => ({ id, name: id, type: 'image' }));
  lib.playlists = [{ id: 'service', name: '토요새벽 예배', items: [
    { id: 'sat', presentationId: 'saturday' }, { id: 'song-item', presentationId: 'song' }, { id: 'protected-item', presentationId: 'protected' },
  ] }, { id: 'other', name: '찬양 목록', items: [{ id: 'other-song', presentationId: 'song' }] }];
  return lib;
}
const remove = (lib: Library, index = 0) => reducer(createInitialState(lib), { type: 'playlist/removeItem', index, occurredAt: now });

describe('Saturday dawn image lifecycle', () => {
  it.each(['토요새벽', '1024 토요새벽예배', '1024 토요 새벽 예배', '토요일 새벽예배', '2026-10-24_토요_새벽_예배'])('recognizes %s without scheduling a new automatic deletion', (name) => {
    expect(isSaturdayDawnName(name)).toBe(true);
  });
  it.each(['주일예배', '토요일 저녁예배', '금요새벽예배'])('does not treat %s as Saturday dawn', (name) => {
    expect(isSaturdayDawnName(name)).toBe(false);
  });
  it('removing an image item trashes its entire image deck, preserves songs/protection, and supports undo/redo', () => {
    const lib = fixture(); let state = remove(lib);
    expect(state.library.presentations.map((p) => p.id)).toEqual(['ordinary', 'protected', 'song']);
    expect(state.library.trash).toHaveLength(1);
    expect(state.library.trash![0]).toMatchObject({ kind: 'presentation', deletedAt: now, presentation: lib.presentations[0], placements: [{ playlistId: 'service', index: 0 }] });
    expect(state.library.media).toEqual(lib.media);
    state = reducer(state, { type: 'undo' }); expect(state.library.presentations.map((p) => p.id)).toContain('saturday');
    expect(state.library.playlists[0].items[0].id).toBe('sat');
    state = reducer(state, { type: 'redo' }); expect(state.library.presentations.map((p) => p.id)).not.toContain('saturday');
    state = reducer(state, { type: 'trash/expire', now: state.library.trash![0].expiresAt });
    expect(state.library.media.map((m) => m.id)).toEqual(['ordinary', 'essential', 'song-image']);
  });
  it('deleting the whole playlist cleans all its image decks and allows deleting the last Saturday playlist', () => {
    const lib = fixture(); lib.playlists = lib.playlists.slice(0, 1);
    lib.presentations.push(image('unnamed', '추가 이미지')); lib.media.push({ id: 'unnamed', name: 'IMG_1234.jpg', type: 'image' });
    lib.playlists[0].items.push({ id: 'unnamed-item', presentationId: 'unnamed' });
    const state = reducer(createInitialState(lib), { type: 'playlist/delete', id: 'service', occurredAt: now });
    expect(state.library.playlists).toHaveLength(1); expect(state.library.playlists[0].items).toEqual([]);
    expect(state.library.presentations.map((p) => p.id)).toEqual(['ordinary', 'protected', 'song']);
    expect(state.library.trash!.map((e) => e.presentation.id)).toEqual(['saturday', 'unnamed']);
  });
  it('keeps a repeated image until the final occurrence in all playlists is removed', () => {
    const lib = fixture(); lib.playlists[0].items.push({ id: 'repeat', presentationId: 'saturday' });
    lib.playlists[1].items.push({ id: 'shared', presentationId: 'saturday' });
    let state = remove(lib);
    expect(state.library.presentations.some((p) => p.id === 'saturday')).toBe(true);
    state = reducer(state, { type: 'playlist/delete', id: 'service', occurredAt: now });
    expect(state.library.trash ?? []).toHaveLength(0);
    state = reducer(state, { type: 'playlist/activate', id: 'other' });
    state = reducer(state, { type: 'playlist/removeItem', index: 1, occurredAt: now });
    expect(state.library.presentations.some((p) => p.id === 'saturday')).toBe(false);
  });
  it('finds Saturday images by filename/group/folder in an ordinary playlist and leaves unrelated images alone', () => {
    for (const label of ['file', 'group', 'folder'] as const) {
      const lib = fixture(); lib.playlists[0].name = '일반 재생목록'; lib.presentations[0].title = '이미지';
      if (label === 'file') lib.media[0].name = '1024_토요새벽.png';
      if (label === 'group') lib.presentations[0].slides[0].group = '토요새벽 예배';
      if (label === 'folder') lib.presentations[0].folder = '1024 토요새벽 예배';
      expect(remove(lib).library.presentations.some((p) => p.id === 'saturday')).toBe(false);
      lib.playlists[0].items = [{ id: 'ordinary-item', presentationId: 'ordinary' }];
      expect(remove(lib).library.presentations.some((p) => p.id === 'ordinary')).toBe(true);
    }
  });
  it('remembers an unnamed shared image after its Saturday playlist is deleted, including across reload', () => {
    const lib = fixture(); lib.presentations[0].title = 'IMG_1234';
    lib.playlists[1].items.push({ id: 'shared-unnamed', presentationId: 'saturday' });
    let state = reducer(createInitialState(lib), { type: 'playlist/delete', id: 'service', occurredAt: now });
    expect(state.library.presentations.find((p) => p.id === 'saturday')!.cleanupOnPlaylistRemoval).toBe('saturday-dawn');
    state = createInitialState(normalizeLibrary(JSON.parse(JSON.stringify(state.library)))!);
    state = reducer(state, { type: 'playlist/removeItem', index: 1, occurredAt: now });
    expect(state.library.presentations.some((p) => p.id === 'saturday')).toBe(false);
    expect(state.library.trash!.some((e) => e.presentation.id === 'saturday')).toBe(true);
  });
  it('also cleans images removed by playlist replacement and Sunday automatic service cleanup', () => {
    const lib = fixture(); lib.playlists[0].name = '1025 주일예배';
    const state = createInitialState(lib);
    for (const action of [
      { type: 'playlist/set' as const, playlist: { ...lib.playlists[0], items: lib.playlists[0].items.slice(1) } },
      { type: 'services/finish' as const, playlistIds: ['service'], presentationIds: [], mediaIds: [] },
    ]) expect(reducer(state, { ...action, occurredAt: now }).library.presentations.some((p) => p.id === 'saturday')).toBe(false);
  });
  it('preserves ordinary text/template decks and song-source decks in a Saturday playlist', () => {
    const lib = fixture();
    lib.presentations[0].title = 'Front'; lib.presentations[0].slides[0].text = '예배 안내';
    expect(remove(lib).library.presentations.some((p) => p.id === 'saturday')).toBe(true);
    lib.presentations[0].title = '토요새벽 찬양'; lib.presentations[0].songSource = { sections: [{ label: 'V', lines: ['찬양 가사'] }] };
    expect(remove(lib).library.presentations.some((p) => p.id === 'saturday')).toBe(true);
    expect(remove(lib, 2).library.presentations.some((p) => p.id === 'protected')).toBe(true);
  });
  it('retains image assets referenced elsewhere even when the deleted deck is permanently purged', () => {
    const lib = fixture(); lib.presentations[1].slides[0].background = { kind: 'media', mediaId: 'saturday', mediaType: 'image' };
    let state = remove(lib);
    state = reducer(state, { type: 'trash/purge', ids: state.library.trash!.map((e) => e.id) });
    expect(state.library.media.some((m) => m.id === 'saturday')).toBe(true);
    expect(state.library.media.some((m) => m.id === 'second-image')).toBe(false);
  });
  it('restores images to their original playlist position and retains deletion through reload and cloud merge', () => {
    const lib = fixture(), removed = remove(lib);
    const saved = normalizeLibrary(JSON.parse(JSON.stringify(removed.library)))!;
    const merged = mergeLibrary(lib, lib, saved).library;
    expect(merged.presentations.some((p) => p.id === 'saturday')).toBe(false); expect(merged.trash).toHaveLength(1);
    const restored = reducer(removed, { type: 'trash/restore', id: removed.library.trash![0].id, occurredAt: now + 1 });
    expect(restored.library.presentations.find((p) => p.id === 'saturday')!.slides).toEqual(lib.presentations[0].slides);
    expect(restored.library.playlists[0].items.map((i) => i.kind === 'header' ? '' : i.presentationId)).toEqual(['saturday', 'song', 'protected']);
  });
  it('does not create trash entries for headers or invalid indices', () => {
    const lib = fixture(); lib.playlists[0].items.unshift({ id: 'header', kind: 'header', title: '토요새벽' });
    for (const index of [0, -1, 999]) expect(remove(lib, index).library.trash ?? []).toEqual([]);
  });
});
