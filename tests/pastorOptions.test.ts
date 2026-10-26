import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_PASTOR_OPTIONS, PASTOR_OPTIONS_KEY, loadPastorOptions, savePastorOptions } from '../src/domain/pastorOptions';

const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) };
afterEach(() => store.clear());

describe('pastor tablet options', () => {
  it('starts with the words, next slide, notes and chords on', () => {
    expect(loadPastorOptions()).toEqual(DEFAULT_PASTOR_OPTIONS);
    expect(DEFAULT_PASTOR_OPTIONS).toMatchObject({ current: true, next: true, notes: true, chords: true, preview: false });
  });
  it('remembers what was chosen', () => {
    savePastorOptions({ ...DEFAULT_PASTOR_OPTIONS, scale: 1.4, preview: true, notes: false });
    expect(loadPastorOptions()).toMatchObject({ scale: 1.4, preview: true, notes: false, current: true });
  });
  it('keeps the text size within what is readable', () => {
    store.set(PASTOR_OPTIONS_KEY, JSON.stringify({ scale: 9 }));
    expect(loadPastorOptions().scale).toBe(2);
    store.set(PASTOR_OPTIONS_KEY, JSON.stringify({ scale: 0.01 }));
    expect(loadPastorOptions().scale).toBe(0.6);
    store.set(PASTOR_OPTIONS_KEY, JSON.stringify({ scale: 'big' }));
    expect(loadPastorOptions().scale).toBe(1);
    store.set(PASTOR_OPTIONS_KEY, JSON.stringify({ scale: null }));
    expect(loadPastorOptions().scale).toBe(1);
  });
  it('ignores values of the wrong kind and broken storage', () => {
    store.set(PASTOR_OPTIONS_KEY, JSON.stringify({ current: 'no', next: false }));
    expect(loadPastorOptions()).toMatchObject({ current: true, next: false });
    store.set(PASTOR_OPTIONS_KEY, '{oops');
    expect(loadPastorOptions()).toEqual(DEFAULT_PASTOR_OPTIONS);
  });
});
