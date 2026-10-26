import { describe, expect, it } from 'vitest';
import {
  MOTION_PALETTES, MOTION_STYLES, defaultRetreatLook, motionBackground, motionFallback, normalizeRetreatLook, retreatBackground,
  safeColors, styleForTheme, withAuto, withStyle, withTheme,
} from '../src/domain/motion';
import { drawMotion, MOTION_H, MOTION_W } from '../src/domain/motionDraw';
import { buildMeeting, defaultRetreat } from '../src/domain/retreat';
import { createInitialState, reducer, type Action } from '../src/domain/reducer';
import { createSeedLibrary } from '../src/domain/defaults';
import { normalizeLibrary } from '../src/domain/persistence';
import { mergeLibrary } from '../src/domain/cloudMerge';
import { resolveBackground } from '../src/domain/autoBackground';
import type { Background, Presentation } from '../src/domain/types';

/** A canvas context that accepts every call and counts the drawing ones. */
function fakeContext() {
  const calls: Record<string, number> = {};
  const gradient = { addColorStop: (_o: number, color: string) => { if (/NaN|undefined/.test(color)) throw new Error(`bad colour ${color}`); } };
  const ctx = new Proxy({}, {
    get: (_t, name: string) => {
      if (name === 'createLinearGradient' || name === 'createRadialGradient') return () => gradient;
      return (...args: unknown[]) => {
        calls[name] = (calls[name] ?? 0) + 1;
        if (args.some((a) => typeof a === 'number' && !Number.isFinite(a))) throw new Error(`${name} got a non-finite number`);
      };
    },
    set: () => true,
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

describe('theme → moving background', () => {
  it('picks the style the theme words point to', () => {
    expect(styleForTheme('빛으로 나아가라')).toBe('rays');
    expect(styleForTheme('생수의 강이 흐르리라')).toBe('waves');
    expect(styleForTheme('성령의 불로 타오르라')).toBe('embers');
    expect(styleForTheme('광야에서 만난 하나님')).toBe('stars');
    expect(styleForTheme('열매 맺는 삶')).toBe('bokeh');
    expect(styleForTheme('Walk in His Grace')).toBe('aurora');
    expect(styleForTheme('')).toBe('aurora');
  });
  it('does not mistake common syllables for theme words', () => {
    expect(styleForTheme('강하고 담대하라')).not.toBe('waves');
    expect(styleForTheme('특별한 사랑')).toBe('bokeh');
    expect(styleForTheme('돌봄의 공동체')).not.toBe('bokeh');
  });
  it('gives a steady look to a theme with no known word', () => {
    const a = styleForTheme('Reset 2026');
    expect(MOTION_STYLES.map((s) => s.id)).toContain(a);
    expect(styleForTheme('Reset 2026')).toBe(a);
  });
  it('follows the theme only while 자동 is on', () => {
    const auto = withTheme(defaultRetreatLook(''), '바다 위를 걷다');
    expect(auto).toMatchObject({ theme: '바다 위를 걷다', style: 'waves', colors: MOTION_PALETTES.waves });
    const manual = withStyle(auto, 'embers');
    expect(manual).toMatchObject({ auto: false, style: 'embers', colors: MOTION_PALETTES.embers });
    expect(withTheme(manual, '빛').style).toBe('embers');
    expect(withTheme(manual, '빛').theme).toBe('빛');
    expect(withAuto(manual, true).style).toBe('waves');
  });
});

describe('look validation', () => {
  it('replaces unusable colours so the canvas never throws', () => {
    expect(safeColors('rays', ['red', '#abc', 7])).toEqual(MOTION_PALETTES.rays);
    expect(safeColors('rays', ['#112233', '#AABBCC'])).toEqual(['#112233', '#aabbcc', MOTION_PALETTES.rays[2]]);
  });
  it('normalizes a look from storage and rejects junk', () => {
    expect(normalizeRetreatLook(null)).toBeUndefined();
    expect(normalizeRetreatLook({ style: 'nope' })).toBeUndefined();
    expect(normalizeRetreatLook({ style: 'waves', speed: 99, dim: 5, colors: ['x'] })).toMatchObject({ style: 'waves', speed: 3, dim: 0.9, colors: MOTION_PALETTES.waves, enabled: true, auto: true });
  });
  it('has no background when switched off', () => {
    expect(retreatBackground({ ...defaultRetreatLook('빛'), enabled: false })).toBeNull();
    expect(retreatBackground(defaultRetreatLook('빛'))).toMatchObject({ kind: 'motion', style: 'rays' });
  });
});

describe('drawing', () => {
  it('draws every style at many moments without a bad number', () => {
    for (const { id } of MOTION_STYLES) {
      for (const t of [0, 0.5, 3.3, 9.4, 120.7, 86399.9]) {
        const { ctx, calls } = fakeContext();
        drawMotion(ctx, MOTION_W, MOTION_H, t, motionBackground(id));
        expect(Object.keys(calls).length).toBeGreaterThan(2);
      }
    }
  });
  it('survives a broken colour from the cloud', () => {
    const { ctx } = fakeContext();
    expect(() => drawMotion(ctx, MOTION_W, MOTION_H, 1, { kind: 'motion', style: 'embers', colors: ['nope'], speed: NaN })).not.toThrow();
  });
  it('has a still gradient for thumbnails', () => {
    expect(motionFallback(motionBackground('waves'))).toContain('gradient');
  });
});

describe('deck background', () => {
  it('keeps a moving deck background (it is not replaced by the automatic one)', () => {
    const bg = motionBackground('rays');
    const p = { title: 'x', folder: 'Songs', background: bg as Background } as Pick<Presentation, 'title' | 'folder' | 'background'>;
    expect(resolveBackground({ id: 's', group: 'Verse 1', text: 'a' }, p)).toBe(bg);
  });
});

describe('수련회 builder', () => {
  const draft = () => {
    const d = defaultRetreat('2026-01-16');
    d.theme = '빛으로 나아가라';
    d.look = defaultRetreatLook(d.theme);
    const worship = d.meetings[0].blocks.find((b) => b.kind === 'worship')!;
    if (worship.kind === 'worship') worship.songs = [{ title: '새 노래', text: 'a\nb\n\nc' }];
    const ann = d.meetings[0].blocks.find((b) => b.kind === 'announcements')!;
    if (ann.kind === 'announcements') ann.text = '1. 광고\n내용';
    return d;
  };
  it('puts the moving background on the retreat decks but not on 광고 and the blank screen', () => {
    const built = buildMeeting(createSeedLibrary(), draft(), draft().meetings[0], new Map());
    const by = (title: string) => built.presentations.find((p) => p.title === title)!;
    for (const title of ['수련회 제목', '찬양', '새 노래', '기도', '축도']) {
      expect(by(title).background).toMatchObject({ kind: 'motion', style: 'rays' });
      expect(by(title).retreatBg).toBe(true);
      expect(by(title).bgEffect).toEqual({ dim: 0.25, blur: 0 });
    }
    expect(by('빈 화면').retreatBg).toBeUndefined();
    expect(by('OT | 광고').retreatBg).toBeUndefined();
    expect(by('OT | 광고').background?.kind).not.toBe('motion');
  });
  it('keeps the old night-sky decks when the look is switched off', () => {
    const d = draft();
    d.look = { ...d.look!, enabled: false };
    const built = buildMeeting(createSeedLibrary(), d, d.meetings[0], new Map());
    const song = built.presentations.find((p) => p.title === '새 노래')!;
    expect(song.background).toMatchObject({ kind: 'image' });
    expect(song.retreatBg).toBe(true);
    expect(song.bgEffect).toBeUndefined();
  });
  it('lets the theme drive the look even for an old draft without one', () => {
    const d = draft();
    delete d.look;
    const built = buildMeeting(createSeedLibrary(), d, d.meetings[0], new Map());
    expect(built.presentations.find((p) => p.title === '기도')!.background).toMatchObject({ kind: 'motion', style: 'rays' });
  });
});

describe('changing the retreat theme later', () => {
  const setup = () => {
    const lib = createSeedLibrary();
    const d = defaultRetreat('2026-01-16');
    d.theme = '빛으로 나아가라';
    d.look = defaultRetreatLook(d.theme);
    const built = buildMeeting(lib, d, d.meetings[0], new Map());
    let s = createInitialState(lib);
    s = reducer(s, { type: 'retreat/look', look: d.look });
    s = reducer(s, { type: 'presentation/createMany', presentations: built.presentations, playlist: built.playlist });
    return { s, d };
  };
  const run = (s: ReturnType<typeof setup>['s'], a: Action) => reducer(s, a);

  it('re-themes every retreat deck at once and leaves the others alone', () => {
    const { s, d } = setup();
    const next = run(s, { type: 'retreat/look', look: withTheme(d.look!, '바다 위를 걷다') });
    expect(next.library.retreat).toMatchObject({ theme: '바다 위를 걷다', style: 'waves' });
    const following = next.library.presentations.filter((p) => p.retreatBg);
    expect(following.length).toBeGreaterThan(3);
    for (const p of following) expect(p.background).toMatchObject({ kind: 'motion', style: 'waves' });
    const others = next.library.presentations.filter((p) => !p.retreatBg);
    expect(others.some((p) => p.background?.kind === 'motion')).toBe(false);
  });
  it('goes back to the night sky when switched off, and returns when switched on', () => {
    const { s, d } = setup();
    const off = run(s, { type: 'retreat/look', look: { ...d.look!, enabled: false } });
    for (const p of off.library.presentations.filter((x) => x.retreatBg)) {
      expect(p.background).toMatchObject({ kind: 'image', url: 'backgrounds/night-sky.jpg' });
      expect(p.bgEffect).toBeUndefined();
    }
    const on = run(off, { type: 'retreat/look', look: d.look! });
    for (const p of on.library.presentations.filter((x) => x.retreatBg)) expect(p.background).toMatchObject({ kind: 'motion' });
  });
  it('does not change a locked deck', () => {
    const { s, d } = setup();
    const target = s.library.presentations.find((p) => p.retreatBg)!;
    const locked = run(s, { type: 'presentation/protect', id: target.id, on: true });
    const next = run(locked, { type: 'retreat/look', look: withTheme(d.look!, '바다') });
    expect(next.library.presentations.find((p) => p.id === target.id)!.background).toMatchObject({ style: 'rays' });
  });
  it('refreshes the slide that is on screen', () => {
    const { s, d } = setup();
    const deck = s.library.presentations.find((p) => p.retreatBg && p.title === '기도')!;
    const live = run(s, { type: 'live/go', presentationId: deck.id, seq: 0 });
    expect(live.live.background).toMatchObject({ style: 'rays' });
    const next = run(live, { type: 'retreat/look', look: withTheme(d.look!, '성령의 불') });
    expect(next.live.background).toMatchObject({ style: 'embers' });
    expect(next.live.bgEffect).toEqual({ dim: 0.25, blur: 0 });
  });
});

describe('saving and syncing the look', () => {
  it('survives normalizing the library', () => {
    const lib = createSeedLibrary();
    lib.retreat = defaultRetreatLook('빛');
    expect(normalizeLibrary(JSON.parse(JSON.stringify(lib)))!.retreat).toMatchObject({ style: 'rays', theme: '빛' });
  });
  it('merges: the side that changed it wins, and a first sync keeps what exists', () => {
    const base = createSeedLibrary();
    base.retreat = defaultRetreatLook('빛');
    const local = { ...base, retreat: undefined } as typeof base;
    delete local.retreat;
    const remote = { ...base, retreat: defaultRetreatLook('바다') };
    expect(mergeLibrary(null, local, remote).library.retreat?.style).toBe('waves');
    // First sync on a computer (no shared history): the cloud copy wins, as for the other settings.
    expect(mergeLibrary(null, { ...base, retreat: defaultRetreatLook('불') }, base).library.retreat?.style).toBe('rays');
    expect(mergeLibrary(base, base, remote).library.retreat?.style).toBe('waves');
    expect(mergeLibrary(base, { ...base, retreat: defaultRetreatLook('불') }, base).library.retreat?.style).toBe('embers');
  });
});
