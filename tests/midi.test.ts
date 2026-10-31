import { describe, expect, it } from 'vitest';
import {
  createMidiDecoder, defaultMidiSettings, describeMidi, isX32Port, learnBinding, midiAction, midiTarget, normalizeMidiSettings,
  type MidiSettings,
} from '../src/domain/midi';
import { normalizeLibrary } from '../src/domain/persistence';
import { createSeedLibrary } from '../src/domain/defaults';
import { createInitialState, reducer } from '../src/domain/reducer';
import type { Macro } from '../src/domain/types';

const macros: Macro[] = [
  { id: 'm1', name: 'Walk-in', color: '#000', steps: [{ type: 'clearAll' }] },
  { id: 'm2', name: 'Sermon', color: '#000', steps: [{ type: 'black', on: true }] },
];
const on = (s: Partial<MidiSettings> = {}): MidiSettings => ({ ...defaultMidiSettings(), enabled: true, ...s });

describe('MIDI decoding (X32 user-assign buttons)', () => {
  it('reads note-on, ignores note-off and velocity-0 note-on', () => {
    const decode = createMidiDecoder();
    expect(decode([0x90, 60, 127])).toEqual({ kind: 'note', channel: 1, number: 60 });
    expect(decode([0x9f, 60, 0])).toBeNull();
    expect(decode([0x80, 60, 64])).toBeNull();
    expect(decode([0x9f, 12, 1])).toEqual({ kind: 'note', channel: 16, number: 12 });
  });
  it('fires a control change once per press (X32 MIDI Push · CC sends 127 then 0)', () => {
    const decode = createMidiDecoder();
    expect(decode([0xb0, 20, 127])).toEqual({ kind: 'cc', channel: 1, number: 20 });
    expect(decode([0xb0, 20, 127])).toBeNull();
    expect(decode([0xb0, 20, 0])).toBeNull();
    expect(decode([0xb0, 20, 127])).toEqual({ kind: 'cc', channel: 1, number: 20 });
    // A sustain pedal rising through many values still fires once.
    expect(decode([0xb1, 64, 10])).toEqual({ kind: 'cc', channel: 2, number: 64 });
    expect(decode([0xb1, 64, 90])).toBeNull();
  });
  it('reads program changes (two-byte messages), e.g. from X32 scene recall', () => {
    const decode = createMidiDecoder();
    expect(decode([0xc4, 3])).toEqual({ kind: 'pc', channel: 5, number: 3 });
    expect(describeMidi({ kind: 'pc', channel: 5, number: 3 })).toBe('PC 4 · ch 5');
  });
});

describe('MIDI mapping', () => {
  it('keeps the old default notes working on any channel', () => {
    const s = on();
    expect(midiTarget(s, { kind: 'note', channel: 7, number: 60 }, macros)).toEqual({ type: 'command', command: 'next' });
    expect(midiTarget(s, { kind: 'note', channel: 1, number: 59 }, macros)).toEqual({ type: 'command', command: 'prev' });
    expect(midiTarget(s, { kind: 'cc', channel: 1, number: 64 }, macros)).toEqual({ type: 'command', command: 'next' });
    expect(midiTarget(s, { kind: 'note', channel: 1, number: 37 }, macros)).toEqual({ type: 'macro', macroId: 'm2' });
    expect(midiTarget(on({ macroNotes: false }), { kind: 'note', channel: 1, number: 37 }, macros)).toBeNull();
    expect(midiTarget(s, { kind: 'note', channel: 1, number: 100 }, macros)).toBeNull();
  });
  it('learns a press and takes it away from what it did before', () => {
    const s = learnBinding(on(), { kind: 'note', channel: 16, number: 60 }, { type: 'command', command: 'black' });
    expect(midiTarget(s, { kind: 'note', channel: 16, number: 60 }, macros)).toEqual({ type: 'command', command: 'black' });
    // The any-channel note 60 → next binding was replaced, so note 60 on channel 1 does nothing now.
    expect(midiTarget(s, { kind: 'note', channel: 1, number: 60 }, macros)).toBeNull();
  });
  it('maps program changes and CCs to macros, and skips deleted macros', () => {
    let s = learnBinding(on(), { kind: 'pc', channel: 1, number: 2 }, { type: 'macro', macroId: 'm1' });
    s = learnBinding(s, { kind: 'cc', channel: 1, number: 30 }, { type: 'macro', macroId: 'gone' });
    expect(midiAction(midiTarget(s, { kind: 'pc', channel: 1, number: 2 }, macros)!, 5)).toEqual({ type: 'macro/run', id: 'm1', now: 5 });
    expect(midiTarget(s, { kind: 'cc', channel: 1, number: 30 }, macros)).toBeNull();
  });
  it('turns targets into console actions the reducer understands', () => {
    const state = createInitialState(createSeedLibrary());
    const black = reducer(state, midiAction({ type: 'command', command: 'black' }, 1));
    expect(black.live.black).toBe(true);
    expect(midiAction({ type: 'command', command: 'next' }, 1)).toEqual({ type: 'live/next' });
  });
  it('recognises the port names an X32 shows up as', () => {
    expect(isX32Port('X-USB')).toBe(true);
    expect(isX32Port('X-USB Port 1')).toBe(true);
    expect(isX32Port('BEHRINGER X32')).toBe(true);
    expect(isX32Port('IAC Driver Bus 1')).toBe(false);
  });
  it('reads saved settings defensively and carries over the old on/off switch', () => {
    expect(normalizeMidiSettings(null, true).enabled).toBe(true);
    expect(normalizeMidiSettings(null).bindings.length).toBeGreaterThan(0);
    const s = normalizeMidiSettings({ enabled: true, input: 'X-USB', macroNotes: false, bindings: [
      { kind: 'note', channel: 3, number: 61, target: { type: 'command', command: 'prev' } },
      { kind: 'note', channel: 30, number: 61, target: { type: 'command', command: 'prev' } },
      { kind: 'sysex', channel: 1, number: 1, target: { type: 'command', command: 'prev' } },
      { kind: 'cc', channel: null, number: 200, target: { type: 'command', command: 'prev' } },
      { kind: 'cc', channel: null, number: 20, target: { type: 'command', command: 'explode' } },
    ] });
    expect(s).toEqual({ enabled: true, input: 'X-USB', macroNotes: false, bindings: [{ kind: 'note', channel: 3, number: 61, target: { type: 'command', command: 'prev' } }] });
  });
});

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
