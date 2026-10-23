import { describe, expect, it } from 'vitest';
import { createSeedLibrary } from '../src/domain/defaults';
import { createInitialState, reducer } from '../src/domain/reducer';
import { createRehearsal, rehearsalCommand } from '../src/domain/rehearsal';

function actualShow() {
  const lib = createSeedLibrary();
  lib.presentations = [{ id: 'p', title: '리허설', themeId: 'theme_classic', slides: [
    { id: 'a', text: '첫 장', group: 'V' },
    { id: 'b', text: '둘째 장', group: 'V', actions: [{ type: 'black', on: true }] },
    { id: 'c', text: '숨김', group: 'V', disabled: true },
    { id: 'd', text: '끝', group: 'V' },
  ] }];
  lib.playlists = [{ id: 'pl', name: '연습', items: [{ id: 'header', kind: 'header', title: '찬양' }, { id: 'item', presentationId: 'p' }] }];
  return reducer(createInitialState(lib), { type: 'live/go', presentationId: 'p', seq: 0, now: 5000 });
}
describe('private rehearsal navigation', () => {
  it('leaves actual output, usage, timers, history, and library unchanged while moving and skipping hidden pages', () => {
    const actual = actualShow(), before = JSON.stringify(actual);
    let practice = createRehearsal(actual);
    expect(practice.live.slide?.text).toBe('첫 장');
    practice = rehearsalCommand(practice, { type: 'live/next' });
    expect(practice.live.slide?.text).toBe('둘째 장');
    expect(practice.live.black).toBe(false); // A real slide action would black out output.
    practice = rehearsalCommand(practice, { type: 'live/next' });
    expect(practice.live.slide?.text).toBe('끝');
    practice = rehearsalCommand(practice, { type: 'live/prev' });
    expect(practice.live.slide?.text).toBe('둘째 장');
    expect(practice.library).toBe(actual.library);
    expect(JSON.stringify(actual)).toBe(before);
    expect(practice.past).toEqual([]);
  });
  it('accepts direct jumps and start/end from a remote while ignoring macros and timer commands', () => {
    let practice = createRehearsal(actualShow());
    for (const command of [{ type: 'macro/run', id: 'm' }, { type: 'timer/op', id: 't', op: 'start' }, { type: 'live/message', text: 'real output' }, { type: 'live/go', presentationId: 'missing', seq: 0 }]) expect(rehearsalCommand(practice, command)).toBe(practice);
    practice = rehearsalCommand(practice, { type: 'live/go', presentationId: 'p', seq: 3, playlistIndex: 1 });
    expect(practice.live.slide?.text).toBe('끝');
    practice = rehearsalCommand(practice, { type: 'show/end' });
    expect(practice.cursor).toBeNull(); expect(practice.live.slide).toBeNull();
    practice = rehearsalCommand(practice, { type: 'show/start' });
    expect(practice.live.slide?.text).toBe('첫 장');
  });
});
