// Alignment guides for moving objects on a slide: a box snaps its left / centre / right to the
// slide's centre line, the slide edges and the edges / centres of the other objects (and the same
// for top / middle / bottom), and the lines it snapped to are reported so they can be drawn.
import { CANVAS_H, CANVAS_W } from './canvas';

export interface SnapBox { x: number; y: number; w: number; h: number }
export interface SnapGuides { v: number[]; h: number[] }

/** Canvas pixels within which an edge or centre jumps onto a guide. */
export const SNAP_DISTANCE = 12;

function snapAxis(pos: number, size: number, targets: number[], max: number): { pos: number; line?: number } {
  let best: { pos: number; line: number; d: number } | undefined;
  for (const edge of [0, size / 2, size]) {
    for (const t of targets) {
      const d = Math.abs(pos + edge - t);
      if (d <= SNAP_DISTANCE && (!best || d < best.d)) best = { pos: Math.round(t - edge), line: t, d };
    }
  }
  return best ? { pos: best.pos, line: Math.min(max, Math.max(0, best.line)) } : { pos };
}

/** `box` moved onto the nearest guides, with the guide lines it sits on. */
export function snapMove(box: SnapBox, others: SnapBox[]): { box: SnapBox; guides: SnapGuides } {
  const xs = [0, CANVAS_W / 2, CANVAS_W, ...others.flatMap((o) => [o.x, o.x + o.w / 2, o.x + o.w])];
  const ys = [0, CANVAS_H / 2, CANVAS_H, ...others.flatMap((o) => [o.y, o.y + o.h / 2, o.y + o.h])];
  const sx = snapAxis(box.x, box.w, xs, CANVAS_W);
  const sy = snapAxis(box.y, box.h, ys, CANVAS_H);
  return { box: { ...box, x: sx.pos, y: sy.pos }, guides: { v: sx.line === undefined ? [] : [sx.line], h: sy.line === undefined ? [] : [sy.line] } };
}

export const NO_GUIDES: SnapGuides = { v: [], h: [] };
