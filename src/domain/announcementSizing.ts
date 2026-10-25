import type { Presentation, Slide } from './types';
import { correctMixedTextSizes } from './textBoxFonts';

/** Discard old automatic enlargement requests without changing the saved font or geometry. */
export function prepareAnnouncementSlide(s: Slide): Slide {
  const elements = s.elements?.map((e) => e.maximizeFont ? { ...e, maximizeFont: false } : e);
  return s.maximizeFont || elements?.some((e, i) => e !== s.elements![i])
    ? { ...s, maximizeFont: false, ...(elements ? { elements } : {}) } : s;
}

/** Preserve original sizes for ads and imported material; actual overflow is resolved at layout time. */
export function prepareAnnouncementSizing(p: Presentation): Presentation {
  if (p.protected) return p;
  p = correctMixedTextSizes(p);
  const slides = p.slides.map(prepareAnnouncementSlide);
  return slides.some((s, i) => s !== p.slides[i]) ? { ...p, slides } : p;
}
