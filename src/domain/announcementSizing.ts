import type { Presentation, Slide, SlideElement } from './types';
import { CANVAS_W } from './canvas';
import { correctMixedTextSizes } from './textBoxFonts';
import { isFrontPresentation, isFrontSlide, keepFrontLayout, withoutPrayerCornerLogo } from './frontLayout';

/** Earlier versions kept text boxes out of a 300 px strip for the QR codes on the right. */
const OLD_QR_EDGE = CANVAS_W - 300;
/** Where the church's 광고 template puts its text: 77 px in from the left, 1287 px wide. */
const TEMPLATE_X = 77;
const TEMPLATE_W = 1287;

/**
 * A box pushed flat against the left edge by that strip (and saved so by the editor) goes back to
 * the template's place; the QR codes now sit on top of it.
 */
function unpushedFromQr(s: Slide, e: SlideElement): SlideElement {
  if (!s.qr?.length || e.kind !== 'text' || e.x > 0.5 || Math.abs(e.x + e.w - OLD_QR_EDGE) > 0.5) return e;
  return { ...e, x: TEMPLATE_X, w: TEMPLATE_W };
}

/** 광고 slides keep their text this far from the left edge, and the "광고 / Announcements" heading this far from the top. */
export const ANNOUNCEMENT_LEFT = 120;
export const ANNOUNCEMENT_TOP = 100;
const HEADING = /^\s*광고\s*\n\s*announcements?\b/i;
/** Where the template (and earlier versions) left a box: tight against the left edge. */
const inCorner = (e: SlideElement) => e.kind === 'text' && e.x >= 50 && e.x < ANNOUNCEMENT_LEFT;

/**
 * The church template's 광고 slide has its "광고 / Announcements" heading tucked into the top-left
 * corner. On a slide whose heading is still there, the heading moves in from the corner, and the
 * boxes under it that start at the same edge ("1. <제목>", the text) move with it so everything
 * stays lined up; their right edges stay put. A box placed elsewhere by hand is left alone.
 */
function outOfCorner(elements: SlideElement[]): SlideElement[] {
  const heading = elements.find((e) => inCorner(e) && e.y < ANNOUNCEMENT_TOP && HEADING.test(e.text ?? ''));
  if (!heading) return elements;
  return elements.map((e) => {
    if (!inCorner(e)) return e;
    const dx = ANNOUNCEMENT_LEFT - e.x;
    const moved = { ...e, x: ANNOUNCEMENT_LEFT, w: Math.max(1, e.w - dx) };
    if (e !== heading || e.y >= ANNOUNCEMENT_TOP || e.y < 40) return moved;
    const dy = ANNOUNCEMENT_TOP - e.y;
    return { ...moved, y: ANNOUNCEMENT_TOP, h: Math.max(1, e.h - dy) };
  });
}

/** Discard old automatic enlargement requests without changing the saved font or geometry. */
export function prepareAnnouncementSlide(s: Slide): Slide {
  const placed = s.elements && outOfCorner(s.elements.map((e) => unpushedFromQr(s, e)));
  const elements = placed?.map((e) => e.maximizeFont ? { ...e, maximizeFont: false } : e);
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
