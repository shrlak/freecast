import { describe, expect, it } from 'vitest';
import { CURVE_FREQS, eqCurve } from '../src/domain/eqCurve';
import { dbToFader, FADER_MARKS, faderToDb, nudgeFader, scribbleColor, shortName, stripSections, X32_STRIPS } from '../src/domain/x32';
import { faderKey } from '../src/ui/X32Controls';
// @ts-expect-error plain ESM server module
import { checkSet } from '../server/x32.mjs';

const at = (f: number) => CURVE_FREQS.findIndex((x) => x >= f);

describe('X32 EQ curve', () => {
  it('is flat when the EQ and low cut are off', () => {
    expect(eqCurve('ch/05', {}, 4).every((db) => db === 0)).toBe(true);
    expect(eqCurve('ch/05', { '/ch/05/eq/on': 0, '/ch/05/eq/1/type': 2, '/ch/05/eq/1/g': 1 }, 4).every((db) => db === 0)).toBe(true);
  });
  it('shows a peaking band boosting around its frequency', () => {
    // PEQ at 1 kHz (raw f = log(1000/20)/log(1000)), +15 dB, Q ≈ 1.7.
    const f = Math.log(50) / Math.log(1000);
    const curve = eqCurve('ch/05', { '/ch/05/eq/on': 1, '/ch/05/eq/2/type': 2, '/ch/05/eq/2/f': f, '/ch/05/eq/2/g': 1, '/ch/05/eq/2/q': 0.5 }, 4);
    expect(curve[at(1000)]).toBeGreaterThan(14);
    expect(curve[at(1000)]).toBeLessThanOrEqual(15.1);
    expect(Math.abs(curve[at(20)])).toBeLessThan(0.5);
    expect(Math.abs(curve[at(20000) === -1 ? CURVE_FREQS.length - 1 : at(20000)])).toBeLessThan(1);
  });
  it('rolls off below the low cut, steeper with a steeper slope', () => {
    const base = { '/ch/05/preamp/hpon': 1, '/ch/05/preamp/hpf': Math.log(100 / 20) / Math.log(20) }; // 100 Hz
    const gentle = eqCurve('ch/05', { ...base, '/ch/05/preamp/hpslope': 0 }, 4);
    const steep = eqCurve('ch/05', { ...base, '/ch/05/preamp/hpslope': 2 }, 4);
    expect(gentle[at(100)]).toBeCloseTo(-3, 0);
    expect(gentle[at(50)]).toBeLessThan(-10);
    expect(steep[at(50)]).toBeLessThan(gentle[at(50)]);
    expect(Math.abs(gentle[at(1000)])).toBeLessThan(0.2);
  });
  it('cuts with a low shelf and stays within the drawn range', () => {
    const curve = eqCurve('bus/01', { '/bus/01/eq/on': 1, '/bus/01/eq/1/type': 1, '/bus/01/eq/1/f': 0.3, '/bus/01/eq/1/g': 0, '/bus/01/eq/1/q': 0.5 }, 6);
    expect(curve[0]).toBeLessThan(-12);
    expect(curve.every((db) => db >= -40 && db <= 20)).toBe(true);
  });
});

describe('X32 surface details', () => {
  it('colours scribble strips like the console', () => {
    expect(scribbleColor('ch/01', { '/ch/01/config/color': 1 })).toEqual({ background: '#e5484d', color: '#f8fafc', inverted: false });
    expect(scribbleColor('ch/01', { '/ch/01/config/color': 3 }).color).toBe('#0b0c0f');
    expect(scribbleColor('ch/01', { '/ch/01/config/color': 9 })).toEqual({ background: '#0b0c0f', color: '#e5484d', inverted: true });
    expect(scribbleColor('ch/01', {}).background).toBe('#1b1d22');
  });
  it('labels strips by their scribble name', () => {
    expect(shortName('ch/05', { '/ch/05/config/name': ' Pastor ' })).toBe('Pastor');
    expect(shortName('ch/06', {})).toBe('Ch 06');
    expect(shortName('main/st', {})).toBe('Main LR');
  });
  it('prints the fader scale at the console positions', () => {
    expect(FADER_MARKS.find((m) => m.label === '0')!.at).toBeCloseTo(0.75, 2);
    expect(FADER_MARKS.find((m) => m.label === '+10')!.at).toBe(1);
    expect(FADER_MARKS.find((m) => m.label === '-10')!.at).toBeCloseTo(0.5, 2);
    expect(FADER_MARKS.at(-1)).toEqual({ label: '−∞', at: 0 });
  });
});

describe('every X32 fader, and the arrow keys', () => {
  it('has every strip of the console', () => {
    const count = (kind: string) => X32_STRIPS.filter((s) => s.kind === kind).length;
    expect([count('ch'), count('auxin'), count('fxrtn'), count('bus'), count('mtx'), count('dca'), count('main')]).toEqual([32, 8, 8, 16, 6, 8, 2]);
    for (const s of X32_STRIPS) expect(checkSet(s.id.startsWith('dca/') ? `/${s.id}/fader` : `/${s.id}/mix/fader`, 0.5)).toEqual({ f: 0.5 });
    expect(stripSections('fxrtn').map((s) => s.id)).toEqual(['eq', 'sends']);
    expect(stripSections('mtx').map((s) => s.id)).toEqual(['dyn', 'eq']);
  });
  it('moves a fader by whole dB', () => {
    expect(faderToDb(nudgeFader(0.75, 1))).toBeCloseTo(1, 0);
    expect(faderToDb(nudgeFader(0.75, -1))).toBeCloseTo(-1, 0);
    expect(faderToDb(nudgeFader(dbToFader(-20), 5))).toBeCloseTo(-15, 0);
    expect(nudgeFader(1, 1)).toBe(1);
    expect(nudgeFader(0, -1)).toBe(0);
    expect(nudgeFader(0, 1)).toBeGreaterThan(0);
    // Even where 1 dB is less than one fader step, a key press always moves the fader.
    expect(nudgeFader(0.01, 1)).toBeGreaterThan(0.01);
  });
  it('maps keys like the console: ↑/↓ 1 dB, Shift 5 dB, Page 10 dB, Home 0 dB, End −∞', () => {
    expect(faderToDb(faderKey('ArrowUp', false, 0.75)!)).toBeCloseTo(1, 0);
    expect(faderToDb(faderKey('ArrowDown', true, 0.75)!)).toBeCloseTo(-5, 0);
    expect(faderToDb(faderKey('PageDown', false, 0.75)!)).toBeCloseTo(-10, 0);
    expect(faderKey('Home', false, 0.2)).toBe(0.75);
    expect(faderKey('End', false, 0.6)).toBe(0);
    expect(faderKey('a', false, 0.6)).toBeNull();
  });
});
