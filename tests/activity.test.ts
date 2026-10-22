import { describe, expect, it } from 'vitest';
import { createSeedLibrary } from '../src/domain/defaults';
import { createInitialState, reducer, type Action } from '../src/domain/reducer';
import { mergeLibrary } from '../src/domain/cloudMerge';
import { normalizeLibrary } from '../src/domain/persistence';
import { mergeActivity, mergeDevices } from '../src/domain/activity';
import type { ActivityEntry, DeviceIdentity } from '../src/domain/types';

const actor: DeviceIdentity = { id: 'church', name: '교회 Mac', userName: '민수', platform: 'macOS' };
const other: DeviceIdentity = { id: 'home', name: '집 PC', userName: '지수', platform: 'Windows' };
const stamp = (a: Action, at = 100, device = actor): Action => ({ ...a, actor: device, account: 'member', eventId: `${device.id}-${at}`, occurredAt: at });
const event = (device: DeviceIdentity, at: number): ActivityEntry => ({ id: `${device.id}-${at}`, at, action: 'slide/update', detail: '설교', device, account: 'member' });

describe('device attribution and activity', () => {
  it('attributes edits and coalesces rapid typing while retaining the latest editor', () => {
    let state = createInitialState(createSeedLibrary());
    const p = state.library.presentations[0];
    state = reducer(state, stamp({ type: 'slide/update', presentationId: p.id, slideId: p.slides[0].id, patch: { text: '새 기도' } }));
    state = reducer(state, stamp({ type: 'slide/update', presentationId: p.id, slideId: p.slides[0].id, patch: { text: '새 기도제목' } }, 200));
    expect(state.library.activity).toHaveLength(1);
    expect(state.library.lastModified?.device).toEqual(actor);
    expect(state.library.lastModified?.at).toBe(200);
    state = reducer(state, stamp({ type: 'undo' }, 300, other));
    expect(state.library.activity).toHaveLength(2);
    expect(state.library.lastModified?.device).toEqual(other);
    expect(state.library.activity?.[0].device.name).toBe('교회 Mac');
  });
  it('preserves remote authorship on merge and ignores system template refresh attribution', () => {
    let state = createInitialState(createSeedLibrary());
    const incoming = { ...state.library, activity: [event(other, 200)], lastModified: event(other, 200) };
    state = reducer(state, stamp({ type: 'library/merge', library: incoming }, 300));
    expect(state.library.lastModified?.device).toEqual(other);
    expect(state.library.activity).toHaveLength(1);
    state = reducer(state, stamp({ type: 'presentation/replaceMany', presentations: [] }, 400));
    expect(state.library.lastModified?.device).toEqual(other);
  });
  it('keeps device registrations and activity across cloud merges in a stable order', () => {
    const seed = createSeedLibrary();
    const a = { ...seed, devices: [{ ...actor, account: 'member', lastSeen: 200 }], activity: [event(actor, 100)], lastModified: event(actor, 100) };
    const b = { ...seed, devices: [{ ...other, account: 'member', lastSeen: 300 }], activity: [event(other, 300)], lastModified: event(other, 300) };
    const merged = mergeLibrary(seed, a, b).library;
    expect(merged.devices).toHaveLength(2);
    expect(merged.activity).toHaveLength(2);
    expect(merged.lastModified?.device).toEqual(other);
    expect(normalizeLibrary(merged)?.lastModified).toEqual(merged.lastModified);
    expect(mergeActivity(a.activity, b.activity)).toEqual(mergeActivity(b.activity, a.activity));
    expect(mergeDevices(a.devices, b.devices)).toEqual(mergeDevices(b.devices, a.devices));
  });
  it('never guesses the editor for old data and drops malformed metadata', () => {
    const lib = normalizeLibrary({ ...createSeedLibrary(), activity: [{ token: 'not an activity' }], devices: [null], lastModified: 'unknown' })!;
    expect(lib.lastModified).toBeUndefined(); expect(lib.activity).toEqual([]); expect(lib.devices).toEqual([]);
  });
  it('keeps two devices’ simultaneous presentation usage and attributes new usage', () => {
    let state = createInitialState(createSeedLibrary());
    const p = state.library.presentations[0];
    state = reducer(state, stamp({ type: 'live/go', presentationId: p.id, seq: 0, now: 100 }));
    expect(state.library.usage.at(-1)?.device).toEqual(actor);
    expect(state.library.lastModified).toBeUndefined();
    const lib = state.library;
    const remote = { ...lib, usage: lib.usage.map((u) => ({ ...u, device: other })) };
    expect(mergeLibrary(null, lib, remote).library.usage).toHaveLength(2);
  });
  it('does not let an older incoming snapshot overwrite a newer editor or activity', () => {
    const lib = { ...createSeedLibrary(), lastModified: event(actor, 400), activity: [event(actor, 400)] };
    const state = createInitialState(lib);
    const next = reducer(state, stamp({ type: 'library/merge', library: { ...lib, activity: [event(other, 200)], lastModified: event(other, 200) } }, 500));
    expect(next.library.lastModified).toEqual(lib.lastModified);
    expect(next.library.activity).toHaveLength(2);
  });
});
