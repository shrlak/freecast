import type { Slide } from './types';
import { blankSlide, uid } from './lyrics';

export interface SlideTemplate {
  id: string;
  name: string;
  icon: string;
  /** A new slide in the given section; theme and background come from the presentation. */
  make: (group: string) => Slide;
}

const text = (group: string, fields: Partial<Slide>): Slide => ({ id: uid('s'), group, text: '', ...fields });

/** Ready-made slide layouts for the 삽입 / 홈 tabs. */
export const SLIDE_TEMPLATES: SlideTemplate[] = [
  { id: 'blank', name: '빈 슬라이드', icon: '▭', make: (g) => text(g, {}) },
  { id: 'white', name: '흰 배경', icon: '◻', make: (g) => blankSlide(g) },
  { id: 'black', name: '검은 배경', icon: '◼', make: (g) => text(g, { background: { kind: 'color', value: '#000000' } }) },
  { id: 'title', name: '제목', icon: 'T', make: (g) => text(g, { title: '제목', text: '부제목' }) },
  { id: 'scripture', name: '성경 구절', icon: '📖', make: () => text('Scripture', { title: '요한복음 3:16', text: '말씀을 입력하세요', subtext: 'John 3:16' }) },
  { id: 'announcement', name: '광고', icon: '📣', make: () => text('광고', { title: '광고', text: '• \n• \n• ' }) },
  { id: 'prayer', name: '기도제목', icon: '🙏', make: () => text('기도', { title: '기도제목', text: '1. \n2. \n3. ' }) },
  { id: 'sermon', name: '설교 제목', icon: '🎤', make: () => text('설교', { title: '설교 제목', text: '본문 말씀', subtext: '설교자' }) },
];
