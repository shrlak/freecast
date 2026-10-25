import type { Presentation, Slide } from './types';
import { CANVAS_H, CANVAS_W } from './canvas';

export const isFrontPresentation = (p: Presentation): boolean => p.id === 'p_front' ||
  p.templateKey?.startsWith('front:') === true || /^(?:\d{4}\s+)?front(?:[ _-]slides)?$/i.test(p.title.trim());
export const isFrontSlide = (s: Slide): boolean => !!s.preserveTextLayout || /^front(?:[ _-]slides)?$/i.test(s.group) ||
  /^front[-_ ]slides\.pptx?$/i.test(s.importSource?.name ?? '');

/** The prayer-topic page omits its corner logo; other pages and pictures stay intact. */
export function withoutPrayerCornerLogo(s: Slide): Slide {
  const heading = [s.group, s.title ?? ''].some((text) => /^(?:기도\s*제목|기도\s*준비)(?:\s*\d+)?$/.test(text.trim()));
  const text = [s.text, ...(s.elements ?? []).filter((e) => e.kind === 'text').map((e) => e.text ?? '')];
  if (!heading && !text.some((text) => /기도로 예배를 준비|^기도\s*제목\s*\d/.test(text.trim())) && !s.elements?.some((e) => e.role === 'prayer')) return s;
  const elements = s.elements?.filter((e) => !(e.kind === 'image' && e.x + e.w / 2 > CANVAS_W * 0.6 && e.y + e.h / 2 < CANVAS_H * 0.25));
  return elements?.length !== s.elements?.length ? { ...s, elements } : s;
}

/** Front is a faithful template page: fonts, paragraph sizes and geometry never auto-fit. */
export function keepFrontLayout(s: Slide): Slide {
  s = withoutPrayerCornerLogo(s);
  if (s.preserveTextLayout && s.style?.autoFit === false && !s.preferredFontSize && !s.maximizeFont &&
    (!s.elements || s.elements.every((e) => e.kind !== 'text' || (e.autoFit === false && !e.preferredFontSize && !e.maximizeFont)))) return s;
  return { ...s, preserveTextLayout: true, maximizeFont: false, preferredFontSize: undefined,
    style: { ...s.style, autoFit: false },
    elements: s.elements?.map((e) => e.kind === 'text' ? { ...e, autoFit: false, maximizeFont: false, preferredFontSize: undefined } : e) };
}
