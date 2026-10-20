import { describe, expect, it } from 'vitest';
import { autoBackground, resolveBackground } from '../src/domain/autoBackground';
import { BACKGROUND_PRESETS, BG_BLACK, BG_SONG_TITLE, BG_WHITE_LOGO } from '../src/domain/defaults';
import type { Slide } from '../src/domain/types';

const slide = (group: string, text = '', extra: Partial<Slide> = {}): Slide => ({ id: group, group, text, ...extra });

describe('backgrounds', () => {
  it('offers the template white + logo, black, white and the song title background', () => {
    expect(BACKGROUND_PRESETS.map((p) => p.name)).toEqual(['KCCP 흰색 + 로고', 'Black', 'White', '찬양 제목']);
  });

  it('gives a song’s title slide its own background, and other title slides stay black', () => {
    expect(autoBackground(slide('Title', '주님의 사랑'), { title: '주님의 사랑', folder: 'Songs' })).toBe(BG_SONG_TITLE);
    expect(autoBackground(slide('Title', '주님의 사랑'), { title: '주님의 사랑', folder: '☁ 찬양 라이브러리' })).toBe(BG_SONG_TITLE);
    expect(autoBackground(slide('Title', '설교'), { title: '설교', folder: '0719 주일예배' })).toBe(BG_BLACK);
    expect(autoBackground(slide('Title'))).toBe(BG_BLACK);
  });

  it('decides from the section and the text', () => {
    expect(autoBackground(slide('Verse 1', '우리는 주의 움직이는 교회'))).toBe(BG_WHITE_LOGO);
    expect(autoBackground(slide('공동체 고백송'))).toBe(BG_WHITE_LOGO);
    expect(autoBackground(slide('광고', '1. 새가족 환영'))).toBe(BG_WHITE_LOGO);
    expect(autoBackground(slide('기도'))).toBe(BG_BLACK);
    expect(autoBackground(slide('성경 말씀'))).toBe(BG_BLACK);
    expect(autoBackground(slide('Slide 1', '롬 5:1-11'))).toBe(BG_BLACK);
    expect(autoBackground(slide('Slide 1', '아무 글'), { title: '0719 광고', folder: '' })).toBe(BG_WHITE_LOGO);
  });

  it('keeps a slide’s own background and a deck background that was chosen', () => {
    const own = { kind: 'color', value: '#123456' } as const;
    expect(resolveBackground(slide('Verse 1', '', { background: own }))).toBe(own);
    expect(resolveBackground(slide('Verse 1'), { title: 't', folder: '', background: BG_BLACK })).toBe(BG_BLACK);
    // a removed picture or gradient is decided automatically
    expect(resolveBackground(slide('Verse 1'), { title: 't', folder: '', background: { kind: 'image', url: 'backgrounds/night-sky.jpg' } })).toBe(BG_WHITE_LOGO);
  });
});
