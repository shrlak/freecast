import { describe, expect, it } from 'vitest';
import {
  COPY_SUFFIX, addConflicts, conflictActions, describePending, isOfflineError, loadConflicts, openConflicts, pendingChanges, retryDelay, saveConflicts,
  type ConflictRecord,
} from '../src/domain/syncStatus';
import { mergeLibrary } from '../src/domain/cloudMerge';
import { createInitialState, reducer, type Action, type AppState } from '../src/domain/reducer';
import { createSeedLibrary } from '../src/domain/defaults';
import type { Library, Presentation } from '../src/domain/types';

const pres = (id: string, title: string, text = title): Presentation => ({ id, title, slides: [{ id: `${id}s`, group: 'V', text }], themeId: 'theme_classic' });
const lib = (presentations: Presentation[]): Library => ({ ...createSeedLibrary(), presentations });
const run = (s: AppState, ...actions: Action[]) => actions.reduce(reducer, s);

describe('retry timing', () => {
  it('asks every 20 s, then slows down after each failure, up to five minutes', () => {
    expect([0, 1, 2, 3, 4, 5, 20].map(retryDelay)).toEqual([20_000, 40_000, 80_000, 160_000, 300_000, 300_000, 300_000]);
    expect(retryDelay(-3)).toBe(20_000);
  });
  it('tells a missing connection from a refusal', () => {
    expect(isOfflineError(Object.assign(new Error('x'), { network: true }))).toBe(true);
    expect(isOfflineError(Object.assign(new Error('x'), { status: 502 }))).toBe(true);
    expect(isOfflineError(Object.assign(new Error('x'), { status: 401 }))).toBe(false);
    expect(isOfflineError(new Error('x'))).toBe(false);
    expect(isOfflineError(null)).toBe(false);
  });
});

describe('edits waiting to be sent', () => {
  it('counts nothing when the library is the one the server has', () => {
    const base = lib([pres('a', '가'), pres('b', '나')]);
    expect(pendingChanges(base, structuredClone(base))).toEqual({ presentations: 0, playlists: 0, other: 0, total: 0 });
    expect(describePending(pendingChanges(base, base))).toBe('보낼 변경 없음');
  });
  it('counts changed, new and deleted items, and other settings', () => {
    const base = lib([pres('a', '가'), pres('b', '나'), pres('c', '다')]);
    const now: Library = { ...structuredClone(base), presentations: [pres('a', '가 수정'), pres('b', '나'), pres('d', '새것')] };
    now.themes = [...now.themes, { ...now.themes[0], id: 'theme_new', name: 'new' }];
    now.playlists = [{ ...now.playlists[0], name: '바뀐 이름' }];
    const p = pendingChanges(base, now);
    expect(p).toMatchObject({ presentations: 3, playlists: 1, other: 1 });
    expect(p.total).toBe(5);
    expect(describePending(p)).toBe('프레젠테이션 3 · 재생목록 1 · 기타 1');
  });
  it('ignores online songs and sees a changed 수련회 setting', () => {
    const base = lib([pres('a', '가')]);
    const now = { ...structuredClone(base), presentations: [...base.presentations, { ...pres('o', 'online'), online: true }] };
    expect(pendingChanges(base, now).total).toBe(0);
    now.retreat = { theme: '빛', enabled: true, auto: true, style: 'rays', colors: ['#000000', '#111111', '#222222'], speed: 1, dim: 0.25 };
    expect(pendingChanges(base, now)).toMatchObject({ other: 1, total: 1 });
  });
  it('counts everything as waiting before the first sync', () => {
    expect(pendingChanges(null, lib([pres('a', '가')])).presentations).toBe(1);
  });
});

describe('two computers changed the same presentation', () => {
  const merged = () => {
    const base = lib([pres('p1', '원본', '원본 본문')]);
    const result = mergeLibrary(base, lib([pres('p1', '이 기기', '내 본문')]), lib([pres('p1', '저 기기', '저쪽 본문')]));
    return result;
  };
  it('reports which two versions it kept', () => {
    const { conflictPairs, library } = merged();
    expect(conflictPairs).toHaveLength(1);
    const copy = library.presentations.find((p) => p.id === conflictPairs[0].copyId)!;
    expect(conflictPairs[0]).toMatchObject({ title: '이 기기', localId: 'p1' });
    expect(copy.title).toBe(`저 기기${COPY_SUFFIX}`);
  });
  const state = () => {
    const { library, conflictPairs } = merged();
    const [pair] = addConflicts([], conflictPairs, 1000);
    return { s: createInitialState(library), c: pair };
  };
  it('keep mine: the other copy goes away, mine is untouched', () => {
    const { s, c } = state();
    const next = run(s, ...conflictActions(c, s.library, 'mine'));
    expect(next.library.presentations.map((p) => p.id)).toEqual(['p1']);
    expect(next.library.presentations[0].slides[0].text).toBe('내 본문');
  });
  it('use theirs: mine becomes their version under its own name, and the copy goes away', () => {
    const { s, c } = state();
    const next = run(s, ...conflictActions(c, s.library, 'theirs'));
    expect(next.library.presentations.map((p) => p.id)).toEqual(['p1']);
    expect(next.library.presentations[0]).toMatchObject({ id: 'p1', title: '저 기기' });
    expect(next.library.presentations[0].slides[0].text).toBe('저쪽 본문');
  });
  it('keep both: nothing changes', () => {
    const { s, c } = state();
    expect(conflictActions(c, s.library, 'both')).toEqual([]);
  });
  it('a copy that is already gone only needs the record dropped', () => {
    const { s, c } = state();
    const gone = run(s, { type: 'presentation/delete', id: c.copyId });
    expect(openConflicts([c], gone.library)).toEqual([]);
    expect(openConflicts([c], s.library)).toEqual([c]);
  });
  it('lists each copy once', () => {
    const { c } = state();
    expect(addConflicts([c], [{ title: c.title, localId: c.localId, copyId: c.copyId }], 2000)).toEqual([c]);
  });
});

describe('remembering conflicts', () => {
  it('keeps them between runs and ignores junk', () => {
    const store = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) };
    const c: ConflictRecord = { id: 'x', title: 't', localId: 'a', copyId: 'x', at: 5 };
    saveConflicts([c]);
    expect(loadConflicts()).toEqual([c]);
    store.set('freecast.sync.conflicts', JSON.stringify([c, { id: 1 }, null]));
    expect(loadConflicts()).toEqual([c]);
    store.set('freecast.sync.conflicts', '{bad');
    expect(loadConflicts()).toEqual([]);
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });
});
