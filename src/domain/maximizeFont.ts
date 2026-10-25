import type { Slide, Theme } from './types';
import { CANVAS_H, CANVAS_W } from './canvas';
import { stripChords } from './lyrics';

/** Find the largest half-pixel font size that fits; layout must be measured at the requested size. */
export function largestFittingFont(fits: (size: number) => boolean, upper: number): number {
  let lo = 2, hi = Math.max(2, Math.ceil(upper * 2)), best = 2;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (fits(mid / 2)) { best = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return best / 2;
}

/** Clone the real styled content, retaining mixed sizes, margins, fonts and explicit line breaks. */
export function maximumFontFromNode(node: HTMLElement, width: number, height: number): number {
  const base = parseFloat(getComputedStyle(node).fontSize) || 64;
  if (!node.textContent?.trim()) return base;
  const clone = node.cloneNode(true) as HTMLElement;
  const originals = [node, ...node.querySelectorAll<HTMLElement>('*')];
  const copies = [clone, ...clone.querySelectorAll<HTMLElement>('*')];
  const values = originals.map((n) => {
    const style = getComputedStyle(n);
    return { font: parseFloat(style.fontSize), line: parseFloat(style.lineHeight), top: parseFloat(style.marginTop), bottom: parseFloat(style.marginBottom) };
  });
  Object.assign(clone.style, { position: 'fixed', left: '-100000px', top: '0', width: `${width}px`, height: 'max-content', minHeight: '0', visibility: 'hidden', pointerEvents: 'none', margin: '0', whiteSpace: getComputedStyle(node).whiteSpace === 'pre' ? 'pre' : 'pre-wrap', overflowWrap: 'anywhere', display: 'block' });
  if (getComputedStyle(node).writingMode.startsWith('vertical')) { clone.style.width = 'max-content'; clone.style.height = `${height}px`; }
  document.body.append(clone);
  try {
    return largestFittingFont((size) => {
      const ratio = size / base;
      copies.forEach((copy, i) => {
        const v = values[i]; copy.style.fontSize = `${v.font * ratio}px`;
        if (Number.isFinite(v.line)) copy.style.lineHeight = `${v.line * ratio}px`;
        if (i) { copy.style.marginTop = `${v.top * ratio}px`; copy.style.marginBottom = `${v.bottom * ratio}px`; }
        
      });
      return clone.scrollHeight <= height && clone.scrollWidth <= width;
    }, Math.max(width, height, base) * 4);
  } finally { clone.remove(); }
}

/** Browser exports can size pending plain-text announcements even before an operator opens them. */
export function maximumSlideFont(slide: Slide, theme: Theme): number {
  if (typeof document === 'undefined') return theme.fontSize;
  const node = document.createElement('div');
  Object.assign(node.style, { position: 'fixed', left: '-100000px', top: '0', visibility: 'hidden', fontSize: `${theme.fontSize}px`, fontFamily: theme.fontFamily,
    fontWeight: String(theme.fontWeight), fontStyle: theme.italic ? 'italic' : 'normal', lineHeight: String(theme.lineHeight), letterSpacing: `${theme.letterSpacing ?? 0}px`,
    textTransform: theme.uppercase ? 'uppercase' : 'none', whiteSpace: theme.noWrap || theme.id === 'theme_tpl_lyrics' ? 'pre' : 'pre-wrap' });
  const lines = (parent: HTMLElement, text: string) => stripChords(text).split('\n').forEach((line) => {
    const child = document.createElement('div'), bold = /^\*\*(.+)\*\*$/.exec(line);
    child.textContent = bold?.[1] ?? (line || '\u00a0'); if (bold) child.style.fontWeight = '800'; parent.append(child);
  });
  if (slide.title) { const title = document.createElement('div'); title.textContent = slide.title; Object.assign(title.style, { fontSize: `${theme.fontSize * 0.72}px`, fontWeight: '800', marginBottom: `${theme.fontSize * 0.35}px` }); node.append(title); }
  if (slide.text) lines(node, slide.text);
  if (slide.subtext) { const sub = document.createElement('div'); Object.assign(sub.style, { fontSize: `${theme.fontSize * (theme.subScale ?? 0.62)}px`, marginTop: `${theme.fontSize * 0.35}px`, fontWeight: String(Math.min(theme.fontWeight, 500)) }); lines(sub, slide.subtext); node.append(sub); }
  const pad = slide.lyricBody && slide.qr?.length ? Math.max(theme.padding, 300) : theme.padding;
  const w = CANVAS_W - pad * 2 - (slide.qr?.length && !slide.lyricBody ? 300 : 0), h = CANVAS_H - theme.padding * 2;
  document.body.append(node);
  try { return maximumFontFromNode(node, Math.max(1, w), Math.max(1, h)); } finally { node.remove(); }
}
