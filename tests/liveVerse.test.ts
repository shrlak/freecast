import { describe, expect, it } from 'vitest';
import { createInitialState, reducer, type Action, type AppState } from '../src/domain/reducer';
import { createSeedLibrary } from '../src/domain/defaults';
import { LIVE_VERSE_ID, buildVerseDeck, loadVerseDefaults, saveVerseDefaults, verseActions } from '../src/domain/bible/liveVerse';
import type { Presentation } from '../src/domain/types';

const run = (s: AppState, ...actions: Action[]) => actions.reduce(reducer, s);
const deck = (label: string): Presentation => ({ id: LIVE_VERSE_ID, title: `성경 · ${label}`, themeId: 'theme_scripture', folder: 'Scripture', slides: [{ id: `s_${label}`, group: label, text: `1 ${label}` }] });
const ids = (s: AppState) => s.library.playlists.find((p) => p.id === s.activePlaylistId)!.items.map((i) => (i.kind === 'header' ? `#${i.title}` : i.presentationId));

function service() {
  const lib = createSeedLibrary();
  const [a, b, c] = lib.presentations.filter((p) => p.slides.length >= 1).slice(0, 3);
  lib.playlists = [{ id: 'pl_test', name: '예배', items: [{ id: 'i1', presentationId: a.id }, { id: 'i2', kind: 'header', title: '말씀' }, { id: 'i3', presentationId: b.id }, { id: 'i4', presentationId: c.id }] }];
  return { s: createInitialState(lib), a: a.id, b: b.id, c: c.id };
}

describe('verse called during the service', () => {
  it('goes in right after the slide on screen and the show carries on after it', () => {
    const { s, a, b, c } = service();
    let st = run(s, { type: 'live/go', presentationId: a, seq: 0, playlistIndex: 0 });
    st = run(st, ...verseActions(st, deck('요한복음 3:16'), true));
    expect(ids(st)).toEqual([a, LIVE_VERSE_ID, '#말씀', b, c]);
    expect(st.cursor).toMatchObject({ presentationId: LIVE_VERSE_ID, seq: 0, playlistIndex: 1 });
    expect(st.live.slide?.text).toBe('1 요한복음 3:16');
    st = run(st, { type: 'live/next' });
    expect(st.cursor?.presentationId).toBe(b);
  });
  it('replaces the earlier verse where it stands, never leaving two', () => {
    const { s, a, b, c } = service();
    let st = run(s, { type: 'live/go', presentationId: a, seq: 0, playlistIndex: 0 });
    st = run(st, ...verseActions(st, deck('요한복음 3:16'), true));
    st = run(st, ...verseActions(st, deck('로마서 8:28'), true));
    expect(ids(st)).toEqual([a, LIVE_VERSE_ID, '#말씀', b, c]);
    expect(st.library.presentations.filter((p) => p.id === LIVE_VERSE_ID)).toHaveLength(1);
    expect(st.live.slide?.text).toBe('1 로마서 8:28');
    expect(st.cursor?.playlistIndex).toBe(1);
  });
  it('moves with the show: a new call-out lands after the slide now on screen', () => {
    const { s, a, b, c } = service();
    let st = run(s, { type: 'live/go', presentationId: a, seq: 0, playlistIndex: 0 });
    st = run(st, ...verseActions(st, deck('요한복음 3:16'), true));
    st = run(st, { type: 'live/go', presentationId: c, seq: 0, playlistIndex: 4 });
    expect(st.cursor?.presentationId).toBe(c);
    st = run(st, ...verseActions(st, deck('시편 23'), true));
    expect(ids(st)).toEqual([a, '#말씀', b, c, LIVE_VERSE_ID]);
    expect(st.cursor?.presentationId).toBe(LIVE_VERSE_ID);
  });
  it('can be prepared without going live', () => {
    const { s, a, b, c } = service();
    let st = run(s, { type: 'live/go', presentationId: a, seq: 0, playlistIndex: 0 });
    st = run(st, ...verseActions(st, deck('요한복음 3:16'), false));
    expect(ids(st)).toEqual([a, LIVE_VERSE_ID, '#말씀', b, c]);
    expect(st.cursor?.presentationId).toBe(a);
  });
  it('goes to the end when nothing is on screen', () => {
    const { s, a, b, c } = service();
    const st = run({ ...s, playlistIndex: null }, ...verseActions({ ...s, playlistIndex: null }, deck('요한복음 3:16'), true));
    expect(ids(st)).toEqual([a, '#말씀', b, c, LIVE_VERSE_ID]);
    expect(st.cursor?.presentationId).toBe(LIVE_VERSE_ID);
  });
});

describe('verse deck and defaults', () => {
  it('reports what it could not read', async () => {
    expect(await buildVerseDeck('안녕하세요', { translations: ['nkrv'], versesPerSlide: 1 })).toMatchObject({ error: expect.stringContaining('알아듣지') });
    expect(await buildVerseDeck('요3:16', { translations: [], versesPerSlide: 1 })).toMatchObject({ error: expect.stringContaining('번역본') });
  });
  it('remembers the translations and verses per slide, and ignores junk', () => {
    const store = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) };
    expect(loadVerseDefaults()).toEqual({ translations: ['nkrv'], versesPerSlide: 2 });
    saveVerseDefaults({ translations: ['esv', 'nkrv'], versesPerSlide: 3 });
    expect(loadVerseDefaults()).toEqual({ translations: ['esv', 'nkrv'], versesPerSlide: 3 });
    store.set('freecast.bible.defaults', JSON.stringify({ translations: ['nope'], versesPerSlide: 99 }));
    expect(loadVerseDefaults()).toEqual({ translations: ['nkrv'], versesPerSlide: 2 });
    store.set('freecast.bible.defaults', '{bad');
    expect(loadVerseDefaults()).toEqual({ translations: ['nkrv'], versesPerSlide: 2 });
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });
});
