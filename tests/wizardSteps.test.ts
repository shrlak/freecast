import { describe, expect, it } from 'vitest';
import { createSeedLibrary } from '../src/domain/defaults';
import { createLiveService, insertIntoSection, SECTION } from '../src/domain/sunday/liveDeck';
import { songsInService, SUNDAY_STEPS } from '../src/domain/sunday/wizardSteps';
import type { Presentation } from '../src/domain/types';

const date = new Date('2026-11-08T12:00:00');
const deck = (id: string, title: string): Presentation => ({ id, title, slides: [{ id: `${id}_s`, group: 'V1', text: '가사' }], themeId: 'theme_classic' });

describe('주일예배 단계별 수정', () => {
  it('has an edit button for every wizard step', () => {
    expect(SUNDAY_STEPS.map((s) => s.label)).toEqual(['찬양', '성경 말씀', '설교', '기도회 · 기도제목', '광고', '추가 자료', '생성']);
    for (const s of SUNDAY_STEPS) expect(s.edit && s.icon && s.hint).toBeTruthy();
  });

  it('starts the songs from the ones already in that week’s playlist, so editing one keeps the rest', () => {
    const lib = createSeedLibrary();
    const live = createLiveService(lib, null, date);
    const a = deck('pa', '은혜'), b = deck('pb', '주님의 은혜'), c = deck('pc', '설교 후 곡');
    let pl = insertIntoSection(live.playlist, SECTION.songs, [a.id, b.id], { presentations: [...lib.presentations, a, b] });
    pl = insertIntoSection(pl, SECTION.after, [c.id], { presentations: [...lib.presentations, a, b, c] });
    const full = { ...lib, presentations: [...lib.presentations, ...live.presentations, a, b, c], playlists: [...lib.playlists, pl] };
    expect(songsInService(full, date)).toEqual([
      { title: '은혜', sections: [], presentationId: 'pa' },
      { title: '주님의 은혜', sections: [], presentationId: 'pb' },
      { title: '설교 후 곡', sections: [], presentationId: 'pc', postSermon: true },
    ]);
  });

  it('has nothing to start from when that week has no playlist yet', () => {
    expect(songsInService(createSeedLibrary(), date)).toEqual([]);
  });
});
