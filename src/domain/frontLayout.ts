import type { Presentation, Slide } from './types';

export const isFrontPresentation = (p: Presentation): boolean => p.id === 'p_front' ||
  p.templateKey?.startsWith('front:') === true || /^(?:\d{4}\s+)?front(?:[ _-]slides)?$/i.test(p.title.trim());
export const isFrontSlide = (s: Slide): boolean => !!s.preserveTextLayout || /^front(?:[ _-]slides)?$/i.test(s.group) ||
  /^front[-_ ]slides\.pptx?$/i.test(s.importSource?.name ?? '');

/** Front is a faithful template page: fonts, paragraph sizes and geometry never auto-fit. */
export function keepFrontLayout(s: Slide): Slide {
  if (s.preserveTextLayout && s.style?.autoFit === false && !s.preferredFontSize && !s.maximizeFont &&
    (!s.elements || s.elements.every((e) => e.kind !== 'text' || (e.autoFit === false && !e.preferredFontSize && !e.maximizeFont)))) return s;
  return { ...s, preserveTextLayout: true, maximizeFont: false, preferredFontSize: undefined,
    style: { ...s.style, autoFit: false },
    elements: s.elements?.map((e) => e.kind === 'text' ? { ...e, autoFit: false, maximizeFont: false, preferredFontSize: undefined } : e) };
}
