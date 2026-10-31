import { describe, expect, it } from 'vitest';
import { normalizeLibrary } from '../src/domain/persistence';
import { createSeedLibrary } from '../src/domain/defaults';
import { createInitialState, reducer } from '../src/domain/reducer';

describe('OBS removal', () => {
  it('drops saved OBS macro steps, slide actions and the default OBS overlay screen', () => {
    const lib = createSeedLibrary();
    const saved = JSON.parse(JSON.stringify({
      ...lib,
      macros: [{ id: 'mx', name: 'Go live', color: '#000', steps: [{ type: 'obs', action: 'startStream' }, { type: 'clearAll' }] }],
      screens: [...lib.screens, { id: 'screen_stream', name: 'OBS lyrics overlay (lower third)', themeId: 'theme_lower', key: 'transparent', layers: { background: false, slide: true, props: false, messages: false, timer: false } }],
      presentations: lib.presentations.map((p, i) => (i === 0 ? { ...p, slides: p.slides.map((s, k) => (k === 0 ? { ...s, actions: [{ type: 'obs', action: 'scene', scene: 'Camera' }] } : k === 1 ? { ...s, actions: [{ type: 'obs', action: 'stopStream' }, { type: 'logo', on: true }] } : s)) } : p)),
    }));
    const out = normalizeLibrary(saved)!;
    expect(out.macros[0].steps).toEqual([{ type: 'clearAll' }]);
    expect(out.screens.map((s) => s.id)).toEqual(['screen_main']);
    const first = out.presentations.find((p) => p.id === lib.presentations[0].id)!;
    expect(first.slides[0].actions).toBeUndefined();
    expect(first.slides[1].actions).toEqual([{ type: 'logo', on: true }]);
  });
  it('keeps a renamed overlay screen the church set up on purpose', () => {
    const lib = createSeedLibrary();
    const out = normalizeLibrary({ ...lib, screens: [...lib.screens, { ...lib.screens[0], id: 'screen_stream', name: 'Lobby TV' }] })!;
    expect(out.screens.map((s) => s.id)).toEqual(['screen_main', 'screen_stream']);
  });
  it('ignores an OBS step that reaches a macro run anyway', () => {
    const state = createInitialState({ ...createSeedLibrary(), macros: [{ id: 'old', name: 'old', color: '#000', steps: [{ type: 'obs' } as never, { type: 'black', on: true }] }] });
    expect(reducer(state, { type: 'macro/run', id: 'old', now: 1 }).live.black).toBe(true);
  });
});
