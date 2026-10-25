import type { Presentation, SlideElement } from './types';
import { isFrontSlide } from './frontLayout';

/** A text box has one size; individual lines can still keep bold, color and other emphasis. */
export function uniformTextBoxFont(el: SlideElement, size = el.fontSize ?? el.paragraphs?.find((p) => p.text.trim())?.fontSize ?? 64): SlideElement {
  if (el.kind !== 'text') return el;
  if (el.fontSize === size && (!el.paragraphs || el.paragraphs.every((p) => p.fontSize === size))) return el;
  return { ...el, fontSize: size, paragraphs: el.paragraphs?.map((p) => ({ ...p, fontSize: size })) };
}

export function hasMixedTextSizes(el: SlideElement): boolean {
  if (el.kind !== 'text' || !el.paragraphs?.length) return false;
  const fallback = el.fontSize ?? 64;
  return new Set(el.paragraphs.filter((p) => p.text.trim()).map((p) => p.fontSize ?? fallback)).size > 1;
}

/** Correct old mixed-size boxes once, including maximum sizes already saved by earlier versions. */
export function correctMixedTextSizes(p: Presentation): Presentation {
  if (p.protected) return p;
  const slides = p.slides.map((s) => {
    if (isFrontSlide(s)) return s;
    const elements = s.elements?.map((el) => hasMixedTextSizes(el) ? { ...uniformTextBoxFont(el), maximizeFont: false } : el);
    return elements?.some((e, i) => e !== s.elements![i]) ? { ...s, elements } : s;
  });
  return slides.some((s, i) => s !== p.slides[i]) ? { ...p, slides } : p;
}
