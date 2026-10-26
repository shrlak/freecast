import { describe, expect, it } from 'vitest';
import {
  buildChart, capoOptions, chartText, keyShift, packetHtml, parseKey, playKeyOf, shiftChord, shiftKey, songChords, songKey, stageSettingsFor, toNashville,
} from '../src/domain/chordChart';
import { createInitialState, reducer, type AppState } from '../src/domain/reducer';
import { createSeedLibrary } from '../src/domain/defaults';
import type { Presentation } from '../src/domain/types';

const song = (over: Partial<Presentation> = {}): Presentation => ({
  id: 'p_song', title: '주 은혜임을', themeId: 'theme_classic', folder: 'Songs',
  slides: [
    { id: 'a', group: 'Verse 1', text: '[G]주 은혜임을 [D/F#]나 [Em]고백하네\n[C]주만 [D]의지해' },
    { id: 'b', group: 'Verse 1', text: '[G]이어지는 줄' },
    { id: 'c', group: 'Chorus', text: '[C]은혜 [G]은혜' },
  ],
  ...over,
});

describe('keys', () => {
  it('reads key names', () => {
    expect(parseKey('G')).toEqual({ root: 7, minor: false });
    expect(parseKey('F#m')).toEqual({ root: 6, minor: true });
    expect(parseKey('Bb')).toEqual({ root: 10, minor: false });
    expect(parseKey(' Ebm ')).toEqual({ root: 3, minor: true });
    expect(parseKey('H')).toBeNull();
    expect(parseKey('Gm7')).toBeNull();
    expect(parseKey(undefined)).toBeNull();
  });
  it('finds the short way between keys', () => {
    expect(keyShift('G', 'A')).toBe(2);
    expect(keyShift('G', 'F')).toBe(-2);
    expect(keyShift('C', 'F#')).toBe(6);
    expect(keyShift('C', 'B')).toBe(-1);
    expect(keyShift('G', 'x')).toBeNull();
    expect(shiftKey('G', 3)).toBe('Bb');
    expect(shiftKey('Em', 5)).toBe('Am');
  });
  it('spells chords with flats or sharps as asked', () => {
    expect(shiftChord('G', 3, true)).toBe('Bb');
    expect(shiftChord('G', 3, false)).toBe('A#');
    expect(shiftChord('G', 3)).toBe('A#');
    expect(shiftChord('Gb', 2)).toBe('Ab');
    expect(shiftChord('D/F#', 2, false)).toBe('E/G#');
    expect(shiftChord('Em7b5', 5)).toBe('Am7b5');
    expect(shiftChord('Cadd9', -2, true)).toBe('Bbadd9');
  });
});

describe('song key', () => {
  it('uses the written key, else the first chord', () => {
    expect(songKey(song({ meta: { key: 'A' } }))).toBe('A');
    expect(songKey(song())).toBe('G');
    expect(songKey(song({ slides: [{ id: 'x', group: 'V', text: '[Am]가나다' }] }))).toBe('Am');
    expect(songKey(song({ slides: [{ id: 'x', group: 'V', text: '가나다' }] }))).toBeNull();
    expect(songKey(song({ meta: { key: 'nope' } }))).toBe('G');
  });
  it('lists the chords in play order', () => {
    expect(songChords(song())).toEqual(['G', 'D/F#', 'Em', 'C', 'D', 'G', 'C', 'G']);
  });
  it('plays in the play key, defaulting to the written one', () => {
    expect(playKeyOf(song())).toBe('G');
    expect(playKeyOf(song({ meta: { playKey: 'Bb' } }))).toBe('Bb');
  });
  it('gives the stage its shift and capo, only when the song sets them', () => {
    expect(stageSettingsFor(song())).toBeNull();
    expect(stageSettingsFor(song({ meta: { playKey: 'A' } }))).toEqual({ shift: 2, capo: 0 });
    expect(stageSettingsFor(song({ meta: { playKey: 'A', capo: 2 } }))).toEqual({ shift: 2, capo: 2 });
    expect(stageSettingsFor(song({ meta: { capo: 3 } }))).toEqual({ shift: 0, capo: 3 });
  });
});

describe('capo', () => {
  it('names the key under the fingers', () => {
    const options = capoOptions('A');
    expect(options[0]).toEqual({ capo: 0, shape: 'A', easy: true });
    expect(options.find((o) => o.capo === 2)).toEqual({ capo: 2, shape: 'G', easy: true });
    expect(options.find((o) => o.capo === 1)).toEqual({ capo: 1, shape: 'Ab', easy: false });
    expect(capoOptions('x')).toEqual([]);
  });
});

describe('Nashville numbers', () => {
  it('counts from the key', () => {
    expect(['G', 'Am', 'C', 'D/F#', 'Em7', 'Bb', 'F#m'].map((c) => toNashville(c, 'G'))).toEqual(['1', '2m', '4', '5/7', '6m7', 'b3', '7m']);
  });
  it('counts a minor key from its relative major', () => {
    expect(['Em', 'G', 'D'].map((c) => toNashville(c, 'Em'))).toEqual(['6m', '1', '5']);
  });
  it('leaves what it cannot read', () => {
    expect(toNashville('N.C.', 'G')).toBe('N.C.');
    expect(toNashville('G', 'x')).toBe('G');
  });
});

describe('chart', () => {
  it('lays chords over the words, joining parts split over slides', () => {
    const chart = buildChart(song());
    expect(chart.map((s) => s.label)).toEqual(['Verse 1', 'Chorus']);
    expect(chart[0].lines).toHaveLength(3);
    expect(chart[0].lines[0].segments).toEqual([
      { chord: 'G', text: '주 은혜임을 ' }, { chord: 'D/F#', text: '나 ' }, { chord: 'Em', text: '고백하네' },
    ]);
  });
  it('keeps words before the first chord and chords with no words', () => {
    const chart = buildChart(song({ slides: [{ id: 'a', group: 'V', text: '시작 [G]본문\n[C][D]' }] }));
    expect(chart[0].lines[0].segments).toEqual([{ chord: '', text: '시작 ' }, { chord: 'G', text: '본문' }]);
    expect(chart[0].lines[1].segments).toEqual([{ chord: 'C', text: '' }, { chord: 'D', text: '' }]);
  });
  it('moves to another key, spelled for that key', () => {
    const chart = buildChart(song(), { shift: 3 });
    expect(chart[0].lines[0].segments.map((s) => s.chord)).toEqual(['Bb', 'F/A', 'Gm']);
    expect(buildChart(song(), { shift: 2 })[0].lines[0].segments.map((s) => s.chord)).toEqual(['A', 'E/G#', 'F#m']);
  });
  it('shows the shapes to play with a capo', () => {
    // Sounding in A with capo 2: the hands play G shapes.
    expect(buildChart(song(), { shift: 2, capo: 2 })[0].lines[0].segments.map((s) => s.chord)).toEqual(['G', 'D/F#', 'Em']);
  });
  it('shows numbers, whatever the key moved to', () => {
    const chart = buildChart(song(), { shift: 5, numbers: true });
    expect(chart[0].lines[0].segments.map((s) => s.chord)).toEqual(['1', '5/7', '6m']);
  });
  it('skips hidden slides and follows the arrangement', () => {
    const p = song({ slides: [{ id: 'a', group: 'Verse 1', text: '[G]하나' }, { id: 'b', group: 'Chorus', text: '[C]둘' }, { id: 'c', group: 'Bridge', text: '[D]셋', disabled: true }],
      arrangements: [{ id: 'r', name: 'x', groups: ['Chorus', 'Verse 1', 'Chorus'] }], arrangementId: 'r' });
    expect(buildChart(p).map((s) => s.label)).toEqual(['Chorus', 'Verse 1', 'Chorus']);
  });
  it('writes plain text with chords on the line above', () => {
    const text = chartText(buildChart(song({ slides: [{ id: 'a', group: 'Verse 1', text: '[G]Amazing [C]grace' }] })));
    expect(text).toBe('[Verse 1]\nG       C\nAmazing grace');
  });
  it('has no chart for a song without chords', () => {
    expect(buildChart(song({ slides: [{ id: 'a', group: 'V', text: '가사만' }] }))[0].lines[0].segments).toEqual([{ chord: '', text: '가사만' }]);
  });
});

describe('packet', () => {
  it('prints a page per song, escaped', () => {
    const html = packetHtml([
      { title: 'A <b>&</b>', key: 'G', playKey: 'A', bpm: '72', capo: 2, numbers: false, sections: buildChart(song({ slides: [{ id: 'a', group: 'V<1>', text: '[G]x' }] })) },
      { title: 'B', key: 'C', playKey: 'C', capo: 0, numbers: true, sections: [] },
    ], '수련회 <밴드>');
    expect(html).toContain('A &lt;b&gt;&amp;&lt;/b&gt;');
    expect(html).toContain('V&lt;1&gt;');
    expect(html).toContain('Key A (원래 G) · BPM 72 · Capo 2');
    expect(html).toContain('수련회 &lt;밴드&gt;');
    expect(html.match(/<article>/g)).toHaveLength(2);
    expect(html).not.toContain('<b>&</b>');
  });
});

describe('stage chords follow the song', () => {
  const state = (): AppState => {
    const lib = createSeedLibrary();
    lib.presentations = [
      song({ id: 'k1', meta: { key: 'G', playKey: 'A', capo: 2 } }),
      song({ id: 'k2', title: '둘째' }),
      song({ id: 'k3', title: '셋째', meta: { playKey: 'Bb' } }),
    ];
    lib.playlists = [{ id: 'pl', name: 'x', items: lib.presentations.map((p, i) => ({ id: `i${i}`, presentationId: p.id })) }];
    return createInitialState(lib);
  };
  it('sets the shift and capo when the song comes on, and clears them for the next song', () => {
    let s = reducer(state(), { type: 'live/go', presentationId: 'k1', seq: 0 });
    expect(s.live).toMatchObject({ chordShift: 2, capo: 2 });
    s = reducer(s, { type: 'live/next' });
    expect(s.live).toMatchObject({ chordShift: 2, capo: 2 });
    s = reducer(s, { type: 'live/go', presentationId: 'k2', seq: 0 });
    expect(s.live).toMatchObject({ chordShift: 0, capo: 0 });
    s = reducer(s, { type: 'live/go', presentationId: 'k3', seq: 0 });
    expect(s.live).toMatchObject({ chordShift: 3, capo: 0 });
  });
  it('leaves a shift typed by hand alone when no song sets one', () => {
    let s = reducer(state(), { type: 'live/go', presentationId: 'k2', seq: 0 });
    s = reducer(s, { type: 'live/chords', shift: 4 });
    s = reducer(s, { type: 'live/go', presentationId: 'k2', seq: 1 });
    expect(s.live.chordShift).toBe(4);
  });
  it('keeps a hand change made during a song with its own key', () => {
    let s = reducer(state(), { type: 'live/go', presentationId: 'k1', seq: 0 });
    s = reducer(s, { type: 'live/chords', shift: 5 });
    s = reducer(s, { type: 'live/go', presentationId: 'k1', seq: 2 });
    expect(s.live.chordShift).toBe(5);
  });
  it('limits a remote-sent shift', () => {
    const s = reducer(state(), { type: 'live/chords', shift: 1e9 });
    expect(s.live.chordShift).toBe(11);
  });
});
