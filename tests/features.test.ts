import { describe, expect, it } from 'vitest';
import { createInitialState, reducer, type Action, type AppState } from '../src/domain/reducer';
import { createSeedLibrary } from '../src/domain/defaults';
import { transposeChord, transposeChords, uid } from '../src/domain/lyrics';
import { findSlides } from '../src/domain/find';
import { pruneIds } from '../src/domain/restorePoints';
import { SLIDE_TEMPLATES } from '../src/domain/slideTemplates';
import type { Library } from '../src/domain/types';

const run = (s: AppState, ...actions: Action[]) => actions.reduce(reducer, s);

describe('chord transpose', () => {
  it('moves chords, keeps flats as flats, wraps around', () => {
    expect(transposeChord('G', 2)).toBe('A');
    expect(transposeChord('B', 1)).toBe('C');
    expect(transposeChord('F#m7', 2)).toBe('G#m7');
    expect(transposeChord('Bb', 2)).toBe('C');
    expect(transposeChord('D/F#', -2)).toBe('C/E');
    expect(transposeChord('Csus4', 12)).toBe('Csus4');
  });
  it('changes only the bracketed chords', () => {
    expect(transposeChords('[G]Amazing [C]grace, Am', 2)).toBe('[A]Amazing [D]grace, Am');
    expect(transposeChords('[G]Hi', 0)).toBe('[G]Hi');
    expect(transposeChords('[A]x', -3)).toBe('[F#]x');
  });
});

describe('live chords', () => {
  it('sets key shift and capo, and clamps the capo', () => {
    const s = createInitialState(createSeedLibrary());
    const a = run(s, { type: 'live/chords', shift: 2 }, { type: 'live/chords', capo: 3 });
    expect(a.live).toMatchObject({ chordShift: 2, capo: 3 });
    expect(run(a, { type: 'live/chords', capo: 40 }).live.capo).toBe(11);
    expect(run(a, { type: 'live/chords', capo: -2 }).live.capo).toBe(0);
    expect(run(a, { type: 'live/chords', shift: 0, capo: 0 }).live).toMatchObject({ chordShift: 0, capo: 0 });
  });
});

describe('undo of slide add / delete', () => {
  it('each slide-list change is its own undo step', () => {
    const lib = createSeedLibrary();
    const p = lib.presentations[0];
    const s = createInitialState(lib);
    const add = (n: number) => ({ type: 'presentation/update', id: p.id, patch: { slides: [...p.slides, ...Array.from({ length: n }, () => ({ id: uid('s'), group: 'x', text: '' }))] } }) as Action;
    const two = run(s, add(1), add(2));
    expect(two.past.length).toBe(2);
    expect(run(two, { type: 'undo' }).library.presentations[0].slides.length).toBe(p.slides.length + 1);
  });
});

describe('quick find', () => {
  const lib: Library = createSeedLibrary();
  lib.presentations = [
    { id: 'a', title: 'Amazing Grace', themeId: lib.themes[0].id, slides: [
      { id: 'a1', group: 'Verse 1', text: '[G]Amazing grace how sweet the sound' },
      { id: 'a2', group: 'Verse 2', text: "'Twas grace that taught my heart to fear" },
    ] },
    { id: 'b', title: '광고', themeId: lib.themes[0].id, slides: [{ id: 'b1', group: '광고', title: '수련회', text: '신청은 이번 주까지' }] },
  ];
  it('finds by every word, ignoring case and chords', () => {
    const r = findSlides(lib, 'SWEET sound');
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ presentationId: 'a', slideId: 'a1', seq: 0, snippet: 'Amazing grace how sweet the sound' });
  });
  it('finds a title / korean text and returns the play position', () => {
    expect(findSlides(lib, '수련회')[0]).toMatchObject({ presentationId: 'b', slideId: 'b1' });
    expect(findSlides(lib, 'grace taught')[0]).toMatchObject({ slideId: 'a2', seq: 1 });
  });
  it('returns nothing for an empty or unknown query', () => {
    expect(findSlides(lib, '  ')).toEqual([]);
    expect(findSlides(lib, 'zzz')).toEqual([]);
  });
});

describe('restore point pruning', () => {
  it('drops the oldest autos first and keeps manual ones', () => {
    const pts = [
      { id: 1, at: 1, kind: 'manual' as const }, { id: 2, at: 2, kind: 'auto' as const },
      { id: 3, at: 3, kind: 'auto' as const }, { id: 4, at: 4, kind: 'auto' as const },
    ];
    expect(pruneIds(pts, 3).sort()).toEqual([2]);
    expect(pruneIds(pts, 10)).toEqual([]);
  });
});

describe('slide templates', () => {
  it('make fresh slides in the section', () => {
    const ids = new Set(SLIDE_TEMPLATES.map((t) => t.make('Verse 1').id));
    expect(ids.size).toBe(SLIDE_TEMPLATES.length);
    expect(SLIDE_TEMPLATES.find((t) => t.id === 'white')!.make('x').background).toEqual({ kind: 'color', value: '#ffffff' });
    expect(SLIDE_TEMPLATES.find((t) => t.id === 'blank')!.make('Verse 1').group).toBe('Verse 1');
  });
});
