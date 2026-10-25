import type { HAlign, SlideElement, VAlign } from './types';
import { CANVAS_H, CANVAS_W } from './canvas';

export interface TextBox { x: number; y: number; w: number; h: number }
export interface TextBounds { x?: number; y?: number; w: number; h: number }

/** Expand around the alignment anchor, stopping at the available slide area. */
export function growTextBox(box: TextBox, needed: { w: number; h: number }, align: HAlign = 'center', vAlign: VAlign = 'middle', bounds: TextBounds = { w: CANVAS_W, h: CANVAS_H }): TextBox {
  const w = Math.min(bounds.w, Math.max(box.w, Math.ceil(needed.w))), h = Math.min(bounds.h, Math.max(box.h, Math.ceil(needed.h)));
  const dx = align === 'right' ? box.w - w : align === 'center' ? (box.w - w) / 2 : 0;
  const dy = vAlign === 'bottom' ? box.h - h : vAlign === 'middle' ? (box.h - h) / 2 : 0;
  const x = Math.max(bounds.x ?? 0, Math.min((bounds.x ?? 0) + bounds.w - w, box.x + dx));
  const y = Math.max(bounds.y ?? 0, Math.min((bounds.y ?? 0) + bounds.h - h, box.y + dy));
  return { x, y, w, h };
}

/** Neighboring text boxes and corner QR codes reserve their existing space. */
export function textElementBounds(el: SlideElement, elements: SlideElement[] = [], hasQr = false): TextBounds {
  let left = 0, top = 0, right = CANVAS_W, bottom = CANVAS_H;
  for (const other of elements) {
    if (other.id === el.id || other.kind !== 'text' || !other.text?.trim()) continue;
    if (other.x < el.x + el.w && other.x + other.w > el.x) {
      if (other.y > el.y) bottom = Math.min(bottom, Math.max(el.y + 1, other.y - 16));
      else if (other.y < el.y) top = Math.max(top, Math.min(el.y, other.y + other.h + 16));
    } else if (other.y < el.y + el.h && other.y + other.h > el.y) {
      if (other.x > el.x) right = Math.min(right, Math.max(el.x + 1, other.x - 16));
      else left = Math.max(left, Math.min(el.x, other.x + other.w + 16));
    }
  }
  if (hasQr) right = Math.min(right, CANVAS_W - 300);
  return { x: left, y: top, w: Math.max(1, right - left), h: Math.max(1, bottom - top) };
}
