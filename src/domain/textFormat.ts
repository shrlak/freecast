// PowerPoint's text commands (홈 → 글꼴 / 단락) as plain functions: bullets and numbering,
// 대/소문자 바꾸기, font size steps and line spacing.
import type { ListStyle } from './types';

/** One indent level (단락 → 들여쓰기 늘리기), in canvas pixels. */
export const INDENT_PX = 60;

/** PowerPoint's single line spacing (1.0) as a CSS line-height multiple (Arial ≈ 1.2 em). */
export const SINGLE_SPACING = 1.2;
/** The 줄 간격 menu: 1.0, 1.5, 2.0 … times single spacing. */
export const LINE_SPACINGS = [1.0, 1.15, 1.5, 2.0, 2.5, 3.0];

/**
 * Font sizes the size box lists and 글꼴 크기 크게 / 작게 step through: PowerPoint's list
 * (8 … 96 pt) in canvas pixels (a 1440-wide slide is 2 px per point).
 */
export const FONT_SIZES = [16, 18, 20, 21, 22, 24, 28, 32, 36, 40, 48, 56, 64, 72, 80, 88, 96, 108, 120, 132, 144, 160, 176, 192];

/** The next size up (or down) from `size`, as PowerPoint's A↑ / A↓ buttons do. */
export function stepFontSize(size: number, dir: 1 | -1): number {
  if (dir > 0) return FONT_SIZES.find((n) => n > size + 0.01) ?? Math.round(size * 1.1);
  const down = [...FONT_SIZES].reverse().find((n) => n < size - 0.01);
  return down ?? Math.max(2, Math.round(size / 1.1));
}

const ROMAN: [number, string][] = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
const roman = (n: number) => ROMAN.reduce((out, [v, r]) => {
  let s = out;
  while (n >= v) {
    s += r;
    n -= v;
  }
  return s;
}, '');
const HANGUL = '가나다라마바사아자차카타파하';

/** The marker in front of the n-th (1-based) item of a list. */
export function listMarker(list: ListStyle, n: number): string {
  switch (list) {
    case 'bullet': return '•';
    case 'circle': return '○';
    case 'square': return '■';
    case 'check': return '✓';
    case 'arrow': return '➢';
    case 'number': return `${n}.`;
    case 'number-paren': return `${n})`;
    case 'roman': return `${roman(n)}.`;
    case 'alpha': return `${String.fromCharCode(64 + (((n - 1) % 26) + 1))}.`;
    case 'hangul': return `${HANGUL[(n - 1) % HANGUL.length]}.`;
  }
}

/** Markers for each line of `text` (blank lines get none and don't count). */
export function listMarkers(lines: string[], list: ListStyle | undefined): (string | null)[] {
  let n = 0;
  return lines.map((l) => (list && l.trim() ? listMarker(list, ++n) : null));
}

export type CaseKind = 'sentence' | 'lower' | 'upper' | 'title' | 'toggle';

/** 대/소문자 바꾸기: 문장의 첫 글자를 대문자로 · 모두 소문자로 · 모두 대문자로 · 각 단어를 대문자로 · 대/소문자 전환. */
export function changeCase(text: string, kind: CaseKind): string {
  switch (kind) {
    case 'lower': return text.toLowerCase();
    case 'upper': return text.toUpperCase();
    case 'title': return text.toLowerCase().replace(/(^|[\s(“"'‘-])(\p{L})/gu, (_, pre: string, c: string) => pre + c.toUpperCase());
    case 'toggle': return [...text].map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())).join('');
    case 'sentence': return text.toLowerCase().replace(/(^|[.!?]\s+|\n)(\p{L})/gu, (_, pre: string, c: string) => pre + c.toUpperCase());
  }
}
