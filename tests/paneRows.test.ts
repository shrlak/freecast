import { describe, expect, it } from 'vitest';
import type { Library, Playlist, Presentation } from '../src/domain/types';
import { createSeedLibrary } from '../src/domain/defaults';
import { isSelectedRow, paneSource, selectedRow, slidePaneRows, type PaneRow, type PaneSlide } from '../src/ui/ppt/paneRows';

const pres = (id: string, title: string, slides: [string, string][], extra: Partial<Presentation> = {}): Presentation => ({
  id, title, themeId: 't', slides: slides.map(([sid, group]) => ({ id: sid, group, text: sid })), ...extra,
});

const front = pres('front', '주일예배 Front', [['f1', 'Front'], ['f2', 'Front']]);
const song = pres('song', 'Born again', [['t', 'Title'], ['v', 'Verse 1'], ['c', 'Chorus']], {
  arrangements: [{ id: 'a', name: 'V-C-C', groups: ['Title', 'Verse 1', 'Chorus', 'Chorus'] }], arrangementId: 'a',
});
const prayer = pres('prayer', '기도', [['p1', '기도']]);
const back = pres('back', '주일예배 Back', [['b1', '공동체 고백송'], ['b2', 'Back']]);
const playlist: Playlist = {
  id: 'pl', name: '1025 주일예배',
  items: [
    { id: 'h1', kind: 'header', title: 'FRONT' }, { id: 'i1', presentationId: 'front' },
    { id: 'h2', kind: 'header', title: '찬양' }, { id: 'i2', presentationId: 'song' }, { id: 'i3', presentationId: 'prayer' },
    { id: 'h3', kind: 'header', title: '설교 후 찬양' },
    { id: 'h4', kind: 'header', title: 'BACK / END' }, { id: 'i4', presentationId: 'prayer' }, { id: 'i5', presentationId: 'back' },
  ],
};
const lib: Library = { ...createSeedLibrary(), presentations: [front, song, prayer, back], playlists: [playlist] };

const outline = (rows: PaneRow[]) => rows.map((r) =>
  r.kind === 'slide' ? `${r.number}:${r.slide.id}` : r.kind === 'section' ? `# ${r.title}` : r.kind === 'presentation' ? `## ${r.title}` : r.kind === 'part' ? `- ${r.label}` : '.');

describe('left 슬라이드 pane', () => {
  it('lists every slide of the playlist, by section, presentation and part, numbered through', () => {
    expect(outline(slidePaneRows(lib, { playlist }))).toEqual([
      '# FRONT', '## 주일예배 Front', '- Front', '1:f1', '2:f2', '.',
      '# 찬양', '## Born again', '- Title', '3:t', '- Verse 1', '4:v', '- Chorus', '5:c', '6:c', '.', '## 기도', '- 기도', '7:p1', '.',
      '# 설교 후 찬양',
      '# BACK / END', '## 기도', '- 기도', '8:p1', '.', '## 주일예배 Back', '- 공동체 고백송', '9:b1', '- Back', '10:b2', '.',
    ]);
  });

  it('keeps what a slide needs to be selected and go live', () => {
    const slides = slidePaneRows(lib, { playlist }).filter((r): r is PaneSlide => r.kind === 'slide');
    const repeat = slides.filter((r) => r.slide.id === 'c');
    expect(repeat.map((r) => [r.itemIndex, r.seq])).toEqual([[3, 2], [3, 3]]);
    // The 기도 in two places: only the selected item's slide is highlighted.
    const prayers = slides.filter((r) => r.slide.id === 'p1');
    expect(prayers.map((r) => isSelectedRow(r, 'prayer', 'p1', 7))).toEqual([false, true]);
    expect(new Set(slides.map((r) => r.key)).size).toBe(slides.length);
    // Stepping onto the second play of the chorus keeps that row selected.
    const rows = slidePaneRows(lib, { playlist });
    expect(selectedRow(rows, repeat[1].key, 'song', 'c', 3)?.key).toBe(repeat[1].key);
    expect(selectedRow(rows, null, 'song', 'c', 3)?.key).toBe(repeat[0].key);
    expect(selectedRow(rows, repeat[1].key, 'song', 'v', 3)?.slide.id).toBe('v');
  });

  it('shows the playlist when one of its items or presentations is selected, else the presentation alone', () => {
    expect(paneSource(lib, playlist, 3, 'song')).toEqual({ playlist });
    expect(paneSource(lib, playlist, null, 'back')).toEqual({ playlist });
    const other = pres('other', 'Welcome', [['w', 'Slide']]);
    const withOther = { ...lib, presentations: [...lib.presentations, other] };
    expect(paneSource(withOther, playlist, null, 'other')).toEqual({ presentation: other });
    expect(outline(slidePaneRows(withOther, { presentation: other }))).toEqual(['- Slide', '1:w', '.']);
    expect(paneSource(lib, undefined, null, null)).toBeNull();
  });
});
