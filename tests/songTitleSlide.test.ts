import { describe, expect, it } from 'vitest';
import { songToPresentation } from '../src/domain/sunday/songs';
import { isSong, songStyleUpdates } from '../src/domain/templates/fill';
import { sequence } from '../src/domain/arrangement';
import type { SlideElement, Slide } from '../src/domain/types';
import type { ServiceTemplates } from '../src/domain/templates/serviceTemplates';

const text = (id: string, t: string, y = 100, extra: Partial<SlideElement> = {}): SlideElement => ({
  id, kind: 'text', x: 300, y, w: 1300, h: 200, text: t, paragraphs: t.split('\n').map((line) => ({ text: line, fontSize: 60 })), ...extra,
});
const slide = (group: string, elements: SlideElement[]): Slide => ({ id: `s_${group}`, group, text: '', elements, background: { kind: 'media', mediaId: `bg_${group}`, mediaType: 'image', fit: 'cover' } });
const TPL = {
  songTitle: slide('Title', [text('st', '주님의 사랑', 460)]),
  songLyrics: slide('찬양', [text('ly', '눈부신', 211, { x: 254, w: 1412, h: 640 }), text('sm', '주님의 사랑', 24, { w: 590, h: 73 })]),
  keys: { front: 'f', song: 's' },
} as unknown as ServiceTemplates;

const TITLE = '우리는 주의 움직이는 교회';
const song = (folder: string, progression?: string[]) => songToPresentation({
  title: TITLE,
  sections: [
    { label: 'V1', lines: [TITLE, '', TITLE, '이곳은 주님을 위한 자리', '내가 기도하는 모든 땅 위에서', '하나님 예배 받을 그날을 고대하네'] },
    { label: 'V2', lines: ['나의 노래로 주님의 성전을 지으리', '높임을 받으소서', '이스라엘의 찬송 중 거하신 주님은', '거룩하십니다'] },
  ],
  progression,
}, { themeId: 'theme_sunday', linesPerSlide: 4, folder });

describe('every song opens on its title slide', () => {
  it('brings an old-look copy made for a service into the template design, title slide first', () => {
    // A copy from an earlier version: in the service's folder, old theme, not online.
    const old = song('0719 주일예배', ['V1', 'V2']);
    expect(isSong(old)).toBe(true);
    const [fixed] = songStyleUpdates([old], TPL, 4);
    expect(fixed).toBeDefined();
    const seq = sequence(fixed);
    expect(seq[0].slide.group).toBe('Title');
    // the song name stays in the corner of its lyric slides
    expect(seq[1].slide.elements!.some((e) => e.text === TITLE)).toBe(true);
    expect(songStyleUpdates([fixed], TPL, 4)).toEqual([]);
  });

  it('puts a title slide back when a 진행 skips it', () => {
    const [restyled] = songStyleUpdates([song('Songs')], TPL, 4);
    const skipping = { ...restyled, arrangements: [{ id: 'a', name: 'V2', groups: ['Verse 2'] }], arrangementId: 'a' };
    const [again] = songStyleUpdates([skipping], TPL, 4);
    expect(again).toBeDefined();
    expect(sequence(again)[0].slide.group).toBe('Title');
  });

  it('leaves decks that are not songs alone', () => {
    const front = { id: 'p_front', title: '주일예배 Front', folder: 'Templates', themeId: 'theme_sunday', slides: [{ id: 'a', group: 'Welcome', text: 'WELCOME' }] };
    expect(isSong(front)).toBe(false);
  });
});
