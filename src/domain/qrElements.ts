// QR codes as objects on the slide: each one can be moved, resized, deleted or given another
// link in the editor like any other object. (Slides from earlier versions kept them in `slide.qr`,
// drawn in a fixed stack in the bottom-right corner; they become objects in that same place.)
import type { Slide, SlideElement } from './types';
import { CANVAS_H, CANVAS_W } from './canvas';
import { uid } from './lyrics';

/** Where the corner stack drew them: 240 px squares, 60 px from the edges, 24 px apart, going up. */
export const QR_SIZE = 240;
const QR_MARGIN = 60;
const QR_GAP = 24;

/** The `index`-th QR code of a slide, in the bottom-right corner (the next one above it). */
export function qrElement(link: string, index = 0): SlideElement {
  return {
    id: uid('el'), kind: 'qr', link,
    x: CANVAS_W - QR_MARGIN - QR_SIZE, y: CANVAS_H - QR_MARGIN - QR_SIZE - index * (QR_SIZE + QR_GAP), w: QR_SIZE, h: QR_SIZE,
  };
}

export const qrElements = (links: readonly string[]): SlideElement[] => links.map((l, i) => qrElement(l, i));

/**
 * A slide's old corner QR codes as objects (lyric slides keep theirs: their text is laid out
 * around the corner stack).
 */
export function withQrElements(s: Slide): Slide {
  if (!s.qr?.length || s.lyricBody) return s;
  const { qr, ...rest } = s;
  return { ...rest, elements: [...(s.elements ?? []), ...qrElements(qr)] };
}
