import { describe, expect, it } from 'vitest';
import { createInitialState, reducer, type Action, type AppState } from '../src/domain/reducer';
import { createSeedLibrary } from '../src/domain/defaults';
import { playlistChoices } from '../src/ui/AddToPlaylist';

const run = (s: AppState, ...actions: Action[]) => actions.reduce(reducer, s);
const fresh = () => createInitialState(createSeedLibrary());
const ids = (s: AppState, playlistId: string) =>
  s.library.playlists.find((p) => p.id === playlistId)!.items.map((i) => (i.kind === 'header' ? `#${i.title}` : i.presentationId));

describe('adding to a playlist that already exists', () => {
  const withSecond = () => run(fresh(), { type: 'playlist/create', playlist: { id: 'pl_b', name: '수요예배', items: [{ id: 'b1', presentationId: 'p_grace' }] } },
    { type: 'playlist/activate', id: createSeedLibrary().playlists[0].id });

  it('adds to the open playlist by default, at the end', () => {
    const s = fresh();
    const open = s.activePlaylistId;
    const next = run(s, { type: 'playlist/addItem', item: { id: 'x', presentationId: 'p_grace' } });
    expect(ids(next, open).at(-1)).toBe('p_grace');
  });

  it('adds to another playlist without switching to it', () => {
    const s = withSecond();
    const open = s.activePlaylistId;
    const before = ids(s, open);
    const next = run(s, { type: 'playlist/addItem', playlistId: 'pl_b', item: { id: 'x', presentationId: 'p_welcome' } });
    expect(ids(next, 'pl_b')).toEqual(['p_grace', 'p_welcome']);
    expect(ids(next, open)).toEqual(before);
    expect(next.activePlaylistId).toBe(open);
  });

  it('inserts at a position, and the selected and live items stay the same items', () => {
    let s = run(fresh(), { type: 'playlist/select', index: 1 }, { type: 'live/go', presentationId: 'p_grace', seq: 0, playlistIndex: 3 });
    const open = s.activePlaylistId;
    const selectedId = s.library.playlists.find((p) => p.id === open)!.items[s.playlistIndex!].id;
    s = run(s, { type: 'playlist/addItem', index: 0, item: { id: 'new', presentationId: 'p_welcome' } });
    const items = s.library.playlists.find((p) => p.id === open)!.items;
    expect(items[0].id).toBe('new');
    expect(items[s.playlistIndex!].id).toBe(selectedId);
    expect(s.cursor?.playlistIndex).toBe(4);
  });

  it('clamps the position and ignores an unknown playlist', () => {
    const s = fresh();
    const open = s.activePlaylistId;
    const next = run(s, { type: 'playlist/addItem', index: 999, item: { id: 'x', presentationId: 'p_grace' } });
    expect(ids(next, open).at(-1)).toBe('p_grace');
    expect(run(s, { type: 'playlist/addItem', playlistId: 'nope', item: { id: 'y', presentationId: 'p_grace' } })).toBe(s);
  });

  it('can be undone in one step', () => {
    const s = withSecond();
    const next = run(s, { type: 'playlist/addItem', playlistId: 'pl_b', item: { id: 'x', presentationId: 'p_welcome' } }, { type: 'undo' });
    expect(ids(next, 'pl_b')).toEqual(['p_grace']);
  });

  it('lists the open playlist first in the chooser', () => {
    const s = withSecond();
    const choices = playlistChoices(s);
    expect(choices[0].id).toBe(s.activePlaylistId);
    expect(choices.map((p) => p.id)).toContain('pl_b');
  });
});
