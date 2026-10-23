import { describe, expect, it } from 'vitest';
import { createSeedLibrary } from '../src/domain/defaults';
import { createInitialState, reducer } from '../src/domain/reducer';
import { RemoteInfoReader, remoteInfoMessages, remoteSlideInfo, remoteSlideKey } from '../src/domain/remoteSlides';

function service() {
  const lib = createSeedLibrary();
  lib.presentations = [
    { id: 'front', title: '시작', themeId: 'theme_classic', loop: true, slides: [{ id: 'f', group: 'Front', text: '시작 화면' }] },
    { id: 'song', title: '찬양', themeId: 'theme_classic', slides: [{ id: 'v', group: 'Verse', text: '1절' }, { id: 'c', group: 'Chorus', text: '후렴' }, { id: 'hidden', group: 'Verse', text: '숨긴 장', disabled: true }], arrangements: [{ id: 'a', name: '진행', groups: ['Verse', 'Chorus', 'Verse'] }], arrangementId: 'a' },
    { id: 'other', title: '별도 자료', themeId: 'theme_classic', slides: [{ id: 'o', group: 'Slide', text: '별도 자료' }] },
  ];
  lib.playlists = [{ id: 'service', name: '주일예배', items: [{ id: 'h1', kind: 'header', title: 'FRONT' }, { id: 'i1', presentationId: 'front' }, { id: 'h2', kind: 'header', title: '찬양' }, { id: 'i2', presentationId: 'song' }, { id: 'i3', presentationId: 'song' }] }];
  return createInitialState(lib);
}

describe('remote full slide catalog', () => {
  it('includes earlier/current/later slides, repeats, hidden slides and later sections after a looping deck', () => {
    let state = service();
    state = reducer(state, { type: 'live/go', presentationId: 'song', seq: 3, playlistIndex: 4 });
    const info = remoteSlideInfo(state, state.selectedId);
    expect(info.all).toHaveLength(11);
    expect(info.name).toBe('주일예배');
    expect(info.all?.[0]).toMatchObject({ presentationId: 'front', seq: 0, section: 'FRONT' });
    expect(info.all?.[1]).toMatchObject({ presentationId: 'song', seq: 0, playlistIndex: 3, section: '찬양' });
    expect(info.all?.some((s) => s.slide.disabled)).toBe(true);
    expect(info.current).toEqual({ presentationId: 'song', seq: 3, playlistIndex: 4 });
    expect(new Set(info.all?.map(remoteSlideKey)).size).toBe(11);
    const first = remoteSlideInfo(service(), 'front');
    expect(first.all?.at(-1)?.playlistIndex).toBe(4);
  });

  it('jumps back to the exact repeated playlist item and continues from there', () => {
    let state = reducer(service(), { type: 'live/go', presentationId: 'song', seq: 3, playlistIndex: 4 });
    const target = remoteSlideInfo(state, state.selectedId).all!.find((s) => s.presentationId === 'song' && s.playlistIndex === 3 && s.seq === 0)!;
    state = reducer(state, { type: 'live/go', presentationId: target.presentationId, seq: target.seq, playlistIndex: target.playlistIndex });
    expect(state.cursor).toEqual({ presentationId: 'song', seq: 0, playlistIndex: 3 });
    state = reducer(state, { type: 'live/next' });
    expect(state.cursor?.seq).toBe(2); // hidden slide stays skipped during ordinary next/previous navigation
    expect(state.live.slide?.id).toBe('c');
  });

  it('shows an individually selected presentation outside the playlist', () => {
    const state = reducer(service(), { type: 'select', id: 'other' });
    const info = remoteSlideInfo(state, 'other');
    expect(info.all).toHaveLength(1);
    expect(info.all?.[0]).toMatchObject({ presentationId: 'other', playlistIndex: null });
    expect(info.name).toBe('별도 자료');
  });

  it('does not cap the full list at the upcoming list limit', () => {
    const state = service();
    state.library.presentations[0].slides = Array.from({ length: 700 }, (_, index) => ({ id: `s${index}`, group: 'Front', text: `장 ${index}` }));
    expect(remoteSlideInfo(state, 'front').all).toHaveLength(710);
  });

  it('reconstructs large Korean catalogs atomically within the relay frame byte limit', () => {
    const state = service();
    state.library.presentations[0].slides[0].text = '가나다🙂'.repeat(160000);
    const info = remoteSlideInfo(state, 'front');
    const packets = remoteInfoMessages(info);
    expect(packets.length).toBeGreaterThan(1);
    const reader = new RemoteInfoReader();
    packets.forEach((packet, index) => {
      expect(new TextEncoder().encode(JSON.stringify(packet)).length).toBeLessThan(4 * 1024 * 1024);
      const received = reader.accept(packet);
      if (index < packets.length - 1) expect(received).toBeNull();
      else expect(received).toEqual(info);
    });
  });

  it('ignores stale or out-of-order chunks and accepts a fresh complete catalog', () => {
    const reader = new RemoteInfoReader();
    expect(reader.accept({ type: 'info-chunk', id: 'old', index: 1, total: 2, data: 'invalid' })).toBeNull();
    expect(reader.accept({ type: 'info-chunk', id: 'new', index: 0, total: 2, data: '{' })).toBeNull();
    expect(reader.accept({ type: 'info-chunk', id: 'old', index: 1, total: 2, data: '}' })).toBeNull();
    const info = remoteSlideInfo(service(), 'front');
    expect(reader.accept({ type: 'info', info })).toBe(info);
  });
});
