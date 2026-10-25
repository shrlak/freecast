import type { HAlign, VAlign } from './types';
import { CANVAS_H, CANVAS_W } from './canvas';

export interface TextBox { x: number; y: number; w: number; h: number }

/** Expand around the text's alignment anchor; never shrink the box or change its font. */
export function growTextBox(box: TextBox, needed: { w: number; h: number }, align: HAlign = 'center', vAlign: VAlign = 'middle', bounds = { w: CANVAS_W, h: CANVAS_H }): TextBox {
  const w = Math.max(box.w, Math.ceil(needed.w)), h = Math.max(box.h, Math.ceil(needed.h));
  const dx = align === 'right' ? box.w - w : align === 'center' ? (box.w - w) / 2 : 0;
  const dy = vAlign === 'bottom' ? box.h - h : vAlign === 'middle' ? (box.h - h) / 2 : 0;
  // Keep initially visible boxes on the slide when they still fit; intentional off-slide positions stay.
  const x = box.x >= 0 && box.x + box.w <= bounds.w && w <= bounds.w ? Math.max(0, Math.min(bounds.w - w, box.x + dx)) : box.x + dx;
  const y = box.y >= 0 && box.y + box.h <= bounds.h && h <= bounds.h ? Math.max(0, Math.min(bounds.h - h, box.y + dy)) : box.y + dy;
  return { x, y, w, h };
}
