import type { Presentation, Slide, SlideElement } from './types';
import { CANVAS_W } from './canvas';
import { correctMixedTextSizes } from './textBoxFonts';
import { isFrontPresentation, isFrontSlide, keepFrontLayout, withoutPrayerCornerLogo } from './frontLayout';

/** Earlier versions kept text boxes out of a 300 px strip for the QR codes on the right. */
const OLD_QR_EDGE = CANVAS_W - 300;
/** The church's 광고 template leaves 0.43 in (62 px) on each side of its boxes. */
const SIDE_MARGIN = 62;

/**
 * A box pushed flat against the left edge by that strip (and saved so by the editor) goes back to
 * the middle of the slide, as wide as the template's; the QR codes now sit on top of it.
 */
function unpushedFromQr(s: Slide, e: SlideElement): SlideElement {
  if (!s.qr?.length || e.kind !== 'text' || e.x > 0.5 || Math.abs(e.x + e.w - OLD_QR_EDGE) > 0.5) return e;
  return { ...e, x: SIDE_MARGIN, w: CANVAS_W - SIDE_MARGIN * 2 };
}

/** Discard old automatic enlargement requests without changing the saved font or geometry. */
export function prepareAnnouncementSlide(s: Slide): Slide {
  const elements = s.elements?.map((e) => unpushedFromQr(s, e)).map((e) => e.maximizeFont ? { ...e, maximizeFont: false } : e);
  return s.maximizeFont || elements?.some((e, i) => e !== s.elements![i])
    ? { ...s, maximizeFont: false, ...(elements ? { elements } : {}) } : s;
}

/** Preserve original sizes for ads and imported material; actual overflow is resolved at layout time. */
export function prepareAnnouncementSizing(p: Presentation): Presentation {
  if (p.protected) return p;
  const fixed = p.slides.map((s) => isFrontPresentation(p) || isFrontSlide(s) ? keepFrontLayout(s) : withoutPrayerCornerLogo(s));
  if (fixed.some((s, i) => s !== p.slides[i])) p = { ...p, slides: fixed };
  p = correctMixedTextSizes(p);
  const slides = p.slides.map(prepareAnnouncementSlide);
  return slides.some((s, i) => s !== p.slides[i]) ? { ...p, slides } : p;
}
