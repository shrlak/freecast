import { describe, expect, it } from 'vitest';
import { createInitialState, reducer, type Action, type AppState } from '../src/domain/reducer';
import { createSeedLibrary } from '../src/domain/defaults';
import { isLibrary, normalizeLibrary } from '../src/domain/persistence';
import { upcomingCursors } from '../src/domain/live';

const run = (s: AppState, ...actions: Action[]) => actions.reduce(reducer, s);
const fresh = () => createInitialState(createSeedLibrary());
const text = (s: AppState) => s.live.slide?.text ?? null;

describe('live navigation', () => {
  it('goes live and exposes the next slide', () => {
    const s = run(fresh(), { type: 'arrangement/select', presentationId: 'p_grace', id: null }, { type: 'live/go', presentationId: 'p_grace', seq: 0 });
    expect(text(s)).toMatch(/^Amazing grace/);
    expect(s.live.slide?.group).toBe('Verse 1');
    expect(s.live.nextText).toMatch(/^I once was lost/);
  });

  it('follows the active arrangement (Verse 3 skipped)', () => {
    let s = run(fresh(), { type: 'arrangement/select', presentationId: 'p_grace', id: 'arr_short' }, { type: 'live/go', presentationId: 'p_grace', seq: 3 });
    expect(s.live.slide?.group).toBe('Verse 2');
    s = run(s, { type: 'live/next' });
    expect(s.live.slide?.group).toBe('Verse 4');
  });

  it('skips disabled slides', () => {
    let s = fresh();
    const dox = s.library.presentations.find((p) => p.id === 'p_doxology')!;
    s = run(s, { type: 'slide/update', presentationId: 'p_doxology', slideId: dox.slides[1].id, patch: { disabled: true } }, { type: 'live/go', presentationId: 'p_doxology', seq: 0 }, { type: 'live/next' });
    expect(s.live.slide?.text).toBe('Amen.');
  });

  it('a show started on a presentation that is in the playlist carries on into the next items', () => {
    // Selected from the library (no playlist position), like pressing Start slideshow on a fresh app.
    let s = run(fresh(), { type: 'select', id: 'p_welcome' });
    expect(s.playlistIndex).toBeNull();
    const welcome = s.library.presentations.find((p) => p.id === 'p_welcome')!;
    s = run(s, { type: 'live/go', presentationId: 'p_welcome', seq: welcome.slides.length - 1 }, { type: 'live/next' });
    expect(s.cursor).toMatchObject({ presentationId: 'p_grace', seq: 0 });
  });

  it('lists every upcoming slide across the playlist, in play order', () => {
    let s = run(fresh(), { type: 'select', id: 'p_welcome' }, { type: 'live/next' });
    const list = upcomingCursors(s, s.selectedId);
    const total = (id: string) => s.library.presentations.find((p) => p.id === id)!.slides.length;
    expect(list[0].presentationId).toBe('p_welcome');
    expect(list.length).toBeGreaterThan(total('p_welcome') - 1);
    expect(new Set(list.map((c) => c.presentationId)).size).toBeGreaterThan(1);
    // Following next from the live slide visits exactly this list.
    for (const c of list) {
      s = run(s, { type: 'live/next' });
      expect(s.cursor).toMatchObject({ presentationId: c.presentationId, seq: c.seq });
    }
  });

  it('advances through the playlist, skipping headers, and back', () => {
    let s = run(fresh(), { type: 'playlist/select', index: 1 });
    const welcome = s.library.presentations.find((p) => p.id === 'p_welcome')!;
    s = run(s, { type: 'live/go', presentationId: 'p_welcome', seq: welcome.slides.length - 1 }, { type: 'live/next' });
    expect(s.cursor).toMatchObject({ presentationId: 'p_grace', seq: 0, playlistIndex: 3 });
    expect(s.selectedId).toBe('p_grace');
    s = run(s, { type: 'live/prev' });
    expect(s.cursor?.presentationId).toBe('p_welcome');
  });

  it('logs song usage once per presentation for CCLI reporting', () => {
    const s = run(fresh(), { type: 'live/go', presentationId: 'p_grace', seq: 0, now: 1 }, { type: 'live/next', now: 2 }, { type: 'live/go', presentationId: 'p_doxology', seq: 0, now: 3 });
    expect(s.library.usage.map((u) => u.title)).toEqual(['Amazing Grace', 'Doxology']);
  });
});

describe('layers, props, timers, macros', () => {
  it('clears text but keeps background; clear all removes both', () => {
    let s = run(fresh(), { type: 'live/go', presentationId: 'p_welcome', seq: 0 });
    s = run(s, { type: 'live/clearText' });
    expect(s.live.slide).toBeNull();
    expect(s.live.background).not.toBeNull();
    expect(run(s, { type: 'live/clearAll' }).live.background).toBeNull();
  });

  it('runs a macro: background, prop and timer in one go', () => {
    const s = run(fresh(), { type: 'macro/run', id: 'macro_pre', now: 1000 });
    expect(s.live.activeProps).toContain('prop_countdown');
    expect(s.live.background).toEqual({ kind: 'color', value: '#000000' });
    expect(s.library.timers.find((t) => t.id === 'timer_service')!.running).toBe(true);
    expect(s.live.timers).toBe(s.library.timers);
  });

  it('toggles props', () => {
    const s = run(fresh(), { type: 'prop/toggle', id: 'prop_clock' });
    expect(s.live.activeProps).toEqual(['prop_clock']);
    expect(run(s, { type: 'prop/toggle', id: 'prop_clock' }).live.activeProps).toEqual([]);
  });
});

describe('undo / redo', () => {
  it('undoes and redoes library edits, coalescing repeated theme tweaks', () => {
    let s = fresh();
    const theme = s.library.themes[0];
    s = run(s, { type: 'theme/upsert', theme: { ...theme, fontSize: 90 } }, { type: 'theme/upsert', theme: { ...theme, fontSize: 100 } });
    expect(s.past).toHaveLength(1);
    s = run(s, { type: 'undo' });
    expect(s.library.themes[0].fontSize).toBe(theme.fontSize);
    s = run(s, { type: 'redo' });
    expect(s.library.themes[0].fontSize).toBe(100);
  });

  it('does not record live actions', () => {
    const s = run(fresh(), { type: 'live/go', presentationId: 'p_grace', seq: 0 }, { type: 'live/toggleBlack' });
    expect(s.past).toHaveLength(0);
  });
});

describe('library edits', () => {
  it('removes deleted presentations from every playlist', () => {
    const s = run(fresh(), { type: 'presentation/delete', id: 'p_grace' });
    expect(s.library.playlists[0].items.some((i) => i.kind !== 'header' && i.presentationId === 'p_grace')).toBe(false);
  });

  it('detaches removed media everywhere', () => {
    const bg = { kind: 'media', mediaId: 'm1', mediaType: 'image' } as const;
    let s = run(fresh(), { type: 'media/add', media: { id: 'm1', name: 'x.png', type: 'image' } }, { type: 'presentation/update', id: 'p_grace', patch: { background: bg } }, { type: 'live/background', background: bg });
    s = run(s, { type: 'media/remove', id: 'm1' });
    expect(s.library.presentations.find((p) => p.id === 'p_grace')!.background).toBeUndefined();
    expect(s.live.background).toBeNull();
  });
});

describe('persistence', () => {
  it('accepts the seed, migrates an old single-playlist library, rejects junk', () => {
    expect(isLibrary(createSeedLibrary())).toBe(true);
    const old = { version: 1, presentations: [], themes: [createSeedLibrary().themes[0]], playlist: [{ id: 'a', presentationId: 'x' }], media: [] };
    const lib = normalizeLibrary(old)!;
    expect(lib.playlists[0].items).toHaveLength(1);
    expect(lib.timers.length).toBeGreaterThan(0);
    expect(isLibrary('nope')).toBe(false);
  });
});
