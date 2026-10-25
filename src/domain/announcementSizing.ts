import type { Presentation, Slide } from './types';
import { CANVAS_H, CANVAS_W } from './canvas';
import { correctMixedTextSizes } from './textBoxFonts';

const announcement = /광고|announcements?/i;
const fixedHeading = /^광고\s*(?:announcements?)?$/i;

export function prepareAnnouncementSlide(s: Slide): Slide {
  const textBoxes = (s.elements ?? []).filter((e) => e.kind === 'text');
  if (!textBoxes.length) return s.maximizeFont === undefined && s.style?.autoFit !== false && s.text.trim() ? { ...s, maximizeFont: true } : s;
  const elements = s.elements!.map((e) => {
    const text = e.text?.trim();
    if (e.kind !== 'text' || !text || fixedHeading.test(text) || e.maximizeFont === false || (e.autoFit === false && e.maximizeFont === undefined)) return e;
    const next = textBoxes.filter((n) => n.y > e.y && n.x < e.x + e.w && n.x + n.w > e.x).sort((a, b) => a.y - b.y)[0];
    const h = Math.max(1, Math.min(e.h, CANVAS_H - e.y - 24, next ? next.y - e.y - 16 : Infinity));
    const qrEdge = s.qr?.length && e.y + h > CANVAS_H - 300 ? CANVAS_W - 300 : CANVAS_W - 24;
    const w = Math.max(1, Math.min(e.w, qrEdge - e.x));
    return e.maximizeFont === true && e.w === w && e.h === h ? e : { ...e, w, h, maximizeFont: true };
  });
  return elements.some((e, i) => e !== s.elements![i]) ? { ...s, elements } : s;
}

/** New and existing announcement content gets one initial fit. Completed and manual sizes stay. */
export function prepareAnnouncementSizing(p: Presentation): Presentation {
  if (p.protected) return p;
  p = correctMixedTextSizes(p);
  const slides = p.slides.map((s): Slide => {
    if (!announcement.test(s.group) && !announcement.test(p.title) && !s.elements?.some((e) => e.kind === 'text' && fixedHeading.test(e.text?.trim() ?? ''))) return s;
    return prepareAnnouncementSlide(s);
  });
  return slides.some((s, i) => s !== p.slides[i]) ? { ...p, slides } : p;
}
