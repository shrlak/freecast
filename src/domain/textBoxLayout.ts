import type { CSSProperties } from 'react';
import type { SlideElement } from './types';
import { growTextBox } from './textBox';
import { INDENT_PX, listMarkers } from './textFormat';

const cache = new Map<string, ReturnType<typeof growTextBox>>();
export const clearTextBoxLayoutCache = () => cache.clear();

/** Shared by measurement and drawing, so line wrapping uses the actual loaded font and spacing. */
export function elementTextStyle(el: SlideElement): CSSProperties {
  return {
    display: 'flex', flexDirection: 'column', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', boxSizing: 'border-box',
    fontSize: el.fontSize ?? 64, fontFamily: el.fontFamily, fontWeight: el.bold ? 800 : el.paragraphs ? 400 : 500,
    fontStyle: el.italic ? 'italic' : undefined, lineHeight: el.lineHeight ?? (el.paragraphs ? 1.2 : 1.25),
    letterSpacing: el.letterSpacing || undefined, paddingLeft: el.indent ? el.indent * INDENT_PX : undefined,
    ...(el.columns && el.columns > 1 ? { columnCount: el.columns, columnGap: '1.2em', display: 'block' } : {}),
    ...(el.vertical ? { writingMode: 'vertical-rl' } : {}),
  };
}
const px = new Set(['fontSize', 'letterSpacing', 'paddingLeft']);
function applyStyle(node: HTMLElement, styles: CSSProperties) {
  for (const [key, value] of Object.entries(styles)) if (value != null) (node.style as unknown as Record<string, string>)[key] = typeof value === 'number' && px.has(key) ? `${value}px` : String(value);
}

/** Measure without mutating a live slide or reducing font sizes. Browser-less exports use PPT's resize mode. */
export function fitTextElement(el: SlideElement): SlideElement {
  if (el.kind !== 'text' || el.autoFit === false || typeof document === 'undefined' || !document.body) return el;
  const key = JSON.stringify(el);
  let box = cache.get(key);
  if (!box) {
    const node = document.createElement('div');
    applyStyle(node, elementTextStyle(el));
    Object.assign(node.style, { position: 'fixed', left: '-100000px', top: '0', visibility: 'hidden', pointerEvents: 'none',
      width: el.vertical ? 'max-content' : `${Math.max(1, el.w)}px`, height: el.vertical ? `${Math.max(1, el.h)}px` : 'max-content', margin: '0' });
    const lines = el.paragraphs?.map((p) => p.text) ?? (el.text ?? '').split('\n');
    const markers = listMarkers(lines, el.list);
    lines.forEach((text, i) => {
      const line = document.createElement('div'), p = el.paragraphs?.[i];
      if (p) applyStyle(line, { fontSize: p.fontSize ?? el.fontSize ?? 64, fontWeight: p.bold ? 700 : undefined, fontStyle: p.italic ? 'italic' : undefined, minHeight: '1.2em' });
      line.style.flexShrink = '0';
      if (markers[i]) { const marker = document.createElement('span'); marker.className = 'list-marker'; marker.textContent = markers[i]; line.append(marker); }
      line.append(document.createTextNode(text || '\u00a0')); node.append(line);
    });
    document.body.append(node);
    try { box = growTextBox(el, { w: node.scrollWidth, h: node.scrollHeight }, el.align, el.vAlign); }
    finally { node.remove(); }
    if (cache.size >= 1000) cache.clear();
    cache.set(key, box);
  }
  return box.x === el.x && box.y === el.y && box.w === el.w && box.h === el.h ? el : { ...el, ...box };
}

