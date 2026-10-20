// 자동 배경: a slide with no background of its own gets one from its section and its text —
// black for 기도 · 성경 · 설교 · Front · End, the church's white slide with the logo for 찬양 가사,
// 광고 and the 공동체 고백송, deep blue for a song's title slide. A deck background the operator picked (colour, picture, video) is kept.
import type { Background, Presentation, Slide } from './types';
import { BG_BLACK, BG_SONG_TITLE, BG_WHITE_LOGO } from './defaults';

const WHITE_LOGO_URL = 'backgrounds/white-logo.png';
const DARK_SECTION = /기도|prayer|성경|scripture|bible|설교|sermon|front|end|thank|축도|benediction|blank|title|성찬|communion/i;
const LIGHT_SECTION = /verse|chorus|bridge|pre-?chorus|intro|outro|interlude|tag|ending|v\d|c\d|b\d|찬양|가사|광고|announce|공동체|고백|back|헌금|offering/i;
const VERSE_REF = /\d+\s*[:：]\s*\d+/;

const slideText = (s: Slide) => [s.title, s.text, ...(s.elements ?? []).map((e) => e.text)].filter(Boolean).join('\n');

/** The background a slide gets by itself: its section decides, then what the text says. */
export function autoBackground(slide: Slide, pres?: Pick<Presentation, 'title' | 'folder'> | null): Background {
  const section = `${slide.group} ${pres?.title ?? ''}`;
  if (slide.group === 'Title' && (pres?.folder === 'Songs' || pres?.folder === '☁ 찬양 라이브러리')) return BG_SONG_TITLE;
  if (slide.group === 'Title' || DARK_SECTION.test(slide.group)) return BG_BLACK;
  if (LIGHT_SECTION.test(slide.group)) return BG_WHITE_LOGO;
  const text = slideText(slide);
  if (/기도|아멘|축도|말씀|설교/.test(text) || VERSE_REF.test(text)) return BG_BLACK;
  if (/광고|공지|찬양|고백/.test(section)) return BG_WHITE_LOGO;
  return BG_BLACK;
}

/** A deck background the operator chose stays; the removed pictures and gradients are decided automatically. */
const kept = (b: Background | undefined): b is Background =>
  !!b && (b.kind === 'color' || b.kind === 'media' || b.kind === 'camera' || (b.kind === 'image' && b.url === WHITE_LOGO_URL));

/** Slide's own background, else the deck's (when still one of the backgrounds), else automatic. */
export function resolveBackground(slide: Slide, pres?: Pick<Presentation, 'title' | 'folder' | 'background'> | null): Background {
  if (slide.background) return slide.background;
  if (kept(pres?.background)) return pres!.background!;
  return autoBackground(slide, pres);
}
