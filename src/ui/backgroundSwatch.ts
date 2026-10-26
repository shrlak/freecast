import type { CSSProperties } from 'react';
import type { Background } from '../domain/types';
import { motionFallback } from '../domain/motion';

/** How a flat, gradient or moving background looks as a small swatch (pictures and videos draw themselves). */
export function swatchStyle(b: Background): CSSProperties | undefined {
  if (b.kind === 'color') return { background: b.value };
  if (b.kind === 'gradient') return { backgroundImage: b.value };
  if (b.kind === 'motion') return { background: motionFallback(b) };
  return undefined;
}
